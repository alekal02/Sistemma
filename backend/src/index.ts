import 'reflect-metadata';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente ANTES de qualquer outro módulo
dotenv.config();

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import AppDataSource from './database/data-source';

const app: Express = express();
const PORT = process.env.APP_PORT || 3200;

// Middlewares globais
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5175,http://localhost:3300')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || corsOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      callback(null, true);
      return;
    }
    callback(new Error('Origem não permitida pelo CORS'));
  },
  credentials: process.env.CORS_CREDENTIALS !== 'false',
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString(), version: '2.0-minio' });
});

import authRoutes from './routes/auth';
import abastecimentoRoutes from './routes/abastecimento';
import dashboardRoutes from './routes/dashboard';
import caminhaoRoutes from './routes/caminhoes';
import coletaRoutes from './routes/coleta';
import contractsRoutes from './routes/contracts';
import servicosRoutes from './routes/servicos';
import { authenticate } from './middlewares/authMiddleware';
import { ServicoController } from './controllers/ServicoController';
import kpiUniversalRoutes from './routes/kpiUniversal';
import graficosPadraoRoutes from './routes/graficosPadrao';
import tipoServicoRoutes from './routes/tipoServico';
import whatsappRoutes from './routes/whatsapp';
import { seedKpisUniversais } from './database/seedKpiUniversal';
import { seedKpisUniversaisExtra } from './database/seedKpiUniversalExtra';
import { seedKpisUniversaisReceita } from './database/seedKpiUniversalReceita';
import { seedGraficosPadrao } from './database/seedGraficosPadrao';
import { migrateHorasProdutivas } from './database/migrate_horas_produtivas';
import { DashboardExecutivoController } from './controllers/DashboardExecutivoController';
import { ModeloExecutivoController } from './controllers/ModeloExecutivoController';

const servicoCtrl = new ServicoController();
const dashboardExecutivoCtrl = new DashboardExecutivoController();
const modeloExecutivoCtrl = new ModeloExecutivoController();

// Rotas públicas
app.use('/api/auth', authRoutes);

// Rotas protegidas (requerem autenticação)
app.use('/api/abastecimentos', authenticate, abastecimentoRoutes);

// Catálogo de fórmulas do Modelo Executivo (fonte única backend)
app.get('/api/modelo-executivo/formulas', authenticate, (req, res) => modeloExecutivoCtrl.listarFormulas(req, res));

// ⚠️ Rotas do Dashboard Executivo ANTES do router de dashboard (para evitar 404)
app.get('/api/dashboard/executivo', authenticate, (req, res) => dashboardExecutivoCtrl.executivo(req, res));
app.post('/api/dashboard/executivo/pdf', authenticate, (req, res) => dashboardExecutivoCtrl.gerarPdf(req, res));

app.use('/api/dashboard', authenticate, dashboardRoutes);
app.use('/api/caminhoes', authenticate, caminhaoRoutes);

// ⭐ QUALIDADE — rotas ANTES do coletaRoutes
import qualidadeService from './services/QualidadeDadosService';
import { analisarQualidadePlanilha } from './services/QualidadePlanilhaPreviewService';
import multer from 'multer';
const qMulter = multer({ storage: multer.memoryStorage() });

// Rota por uploadId sem constraint (Express 5/path-to-regexp v8)
app.get('/api/coleta/qualidade/:uploadId', authenticate, async (req: any, res: any) => {
  const uploadId = parseInt(req.params.uploadId, 10);
  if (isNaN(uploadId)) { res.status(400).json({ error: 'ID inválido' }); return; }
  const relatorio = await qualidadeService.gerarRelatorio(uploadId);
  res.json(relatorio);
});

// Rota por servicoId
app.get('/api/coleta/qualidade/servico/:servicoId', authenticate, async (req: any, res: any) => {
  const relatorio = await qualidadeService.gerarRelatorioUltimoUpload(String(req.params.servicoId));
  if (!relatorio) { res.status(404).json({ error: 'Nenhum upload encontrado' }); return; }
  res.json(relatorio);
});

// Preview de qualidade
app.post('/api/qualidade-coleta/preview', authenticate, qMulter.single('planilha'), async (req: any, res: any) => {
  console.log('[QualidadePreview] Rota chamada!', req.file ? `Arquivo: ${req.file.originalname}` : 'Sem arquivo');
  if (!req.file) { res.status(400).json({ error: 'Nenhum arquivo' }); return; }
  try {
    const relatorio = analisarQualidadePlanilha(req.file.buffer, req.file.originalname);
    console.log('[QualidadePreview] Relatório gerado:', JSON.stringify(relatorio).substring(0, 200));
    res.json({ sucesso: true, ...relatorio });
  } catch (err: any) {
    console.error('[QualidadePreview] Erro:', err.message);
    res.status(500).json({ error: 'Erro ao analisar planilha: ' + err.message });
  }
});

// ─── ANÁLISE VIAGEM POR VIAGEM ───
// POST /api/qualidade-coleta/analisar-viagens
// Analisa cada linha da planilha identificando viagens completas vs incompletas
app.post('/api/qualidade-coleta/analisar-viagens', authenticate, qMulter.single('planilha'), async (req: any, res: any) => {
  if (!req.file) { res.status(400).json({ error: 'Nenhum arquivo' }); return; }
  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false });
    const nomeAba = workbook.SheetNames[0];
    const sheet = workbook.Sheets[nomeAba];
    const dadosBrutos: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: true, raw: true });

    if (dadosBrutos.length < 2) {
      res.json({ sucesso: true, viagens: [], viagensCompletas: 0, viagensIncompletas: 0, totalViagens: 0, mensagem: 'Planilha sem dados de viagens.' });
      return;
    }

    const cabecalho = (dadosBrutos[0] || []).map((v: any) => v !== null && v !== undefined ? String(v).trim() : '');
    const linhas = dadosBrutos.slice(1);

    // Função para normalizar e encontrar coluna
    const normalizar = (s: string) => s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, '').trim();
    const encontrar = (termos: string[]): number => {
      for (const t of termos) {
        const tn = normalizar(t);
        for (let i = 0; i < cabecalho.length; i++) {
          if (normalizar(cabecalho[i]) === tn) return i;
        }
      }
      return -1;
    };

    // Mapear colunas essenciais
    const idxData = encontrar(['DATA SAIDA', 'DATA SAÍDA', 'DATA', 'DIA']);
    const idxPlaca = encontrar(['PLACA', 'VEICULO', 'VEÍCULO', 'CAMINHAO', 'CAMINHÃO']);
    const idxMotorista = encontrar(['MOTORISTA', 'OPERADOR', 'NOME MOTORISTA']);
    const idxRota = encontrar(['ROTA', 'SETOR', 'BAIRRO', 'REGIAO', 'REGIÃO', 'DESTINO']);
    const idxKmTotal = encontrar(['KM TOTAL', 'KM PERCORRIDO', 'DISTANCIA', 'DISTÂNCIA']);
    const idxPesoTotal = encontrar(['PESO TOTAL', 'PESO', 'PESO BRUTO']);
    const idxKmSaida = encontrar(['KM SAIDA', 'KM SAÍDA', 'KM SAIDA BASE']);
    const idxKmChegada = encontrar(['KM CHEGADA', 'KM DE CHEGADA', 'KM CHEGADA BASE']);
    const idxRegional = encontrar(['REGIONAL', 'REGIAO', 'REGIÃO']);
    const idxDistrito = encontrar(['DISTRITO', 'BAIRRO']);

    // Colunas numéricas de KM/Peso/Rotas para detectar valores negativos
    const colunasNumericasMonitoradas: { idx: number; nome: string }[] = [];
    cabecalho.forEach((h, i) => {
      const n = normalizar(h);
      if (!n || n.includes('EMPTY')) return;
      if (n.includes('KM') || n.includes('PESO') || (n.includes('ROTA') && n.includes('KM'))) {
        colunasNumericasMonitoradas.push({ idx: i, nome: cabecalho[i] || `Coluna ${i + 1}` });
      }
    });

    const viagens: any[] = [];
    let viagensCompletas = 0;
    let viagensIncompletas = 0;
    let viagensComValorNegativo = 0;

    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      const temAlgumValor = (linha || []).some((v: any) => v !== null && v !== '' && v !== undefined);
      if (!temAlgumValor) continue;

      const data = idxData >= 0 ? linha[idxData] : null;
      const placa = idxPlaca >= 0 ? linha[idxPlaca] : null;
      const motorista = idxMotorista >= 0 ? linha[idxMotorista] : null;
      const rota = idxRota >= 0 ? linha[idxRota] : null;
      const kmTotal = idxKmTotal >= 0 ? linha[idxKmTotal] : null;
      const pesoTotal = idxPesoTotal >= 0 ? linha[idxPesoTotal] : null;
      const kmSaida = idxKmSaida >= 0 ? linha[idxKmSaida] : null;
      const kmChegada = idxKmChegada >= 0 ? linha[idxKmChegada] : null;

      // Calcular KM Total se não existir mas tiver KM Saida e KM Chegada
      let kmTotalCalculado = null;
      if (kmTotal === null || kmTotal === '' || kmTotal === undefined) {
        if (kmSaida !== null && kmChegada !== null && kmSaida !== '' && kmChegada !== '') {
          const kmS = Number(kmSaida);
          const kmC = Number(kmChegada);
          if (!isNaN(kmS) && !isNaN(kmC) && kmC >= kmS) {
            kmTotalCalculado = kmC - kmS;
          }
        }
      } else {
        kmTotalCalculado = Number(kmTotal);
      }

      const temIdentificacao = (data !== null && data !== '' && data !== undefined) ||
                               (placa !== null && placa !== '' && placa !== undefined) ||
                               (motorista !== null && motorista !== '' && motorista !== undefined);

      const temKm = kmTotalCalculado !== null && !isNaN(kmTotalCalculado) && kmTotalCalculado > 0;
      const temPeso = pesoTotal !== null && pesoTotal !== '' && pesoTotal !== undefined && Number(pesoTotal) > 0;
      const regional = idxRegional >= 0 ? linha[idxRegional] : null;
      const distrito = idxDistrito >= 0 ? linha[idxDistrito] : null;
      const temRota = (rota !== null && rota !== '' && rota !== undefined)
        || (regional !== null && regional !== '' && regional !== undefined)
        || (distrito !== null && distrito !== '' && distrito !== undefined);

      const problemas: string[] = [];
      let temValorNegativo = false;

      for (const col of colunasNumericasMonitoradas) {
        const raw = linha[col.idx];
        if (raw === null || raw === '' || raw === undefined) continue;
        const num = Number(raw);
        if (!isNaN(num) && num < 0) {
          temValorNegativo = true;
          problemas.push(`${col.nome}: valor negativo (${num}) — corrija na planilha`);
        }
      }

      if (!temKm) {
        if (kmTotal === null || kmTotal === '' || kmTotal === undefined) {
          if (kmSaida !== null && kmChegada !== null && kmSaida !== '' && kmChegada !== '') {
            problemas.push('KM Total não informado (calculável via KM Saída + KM Chegada)');
          } else {
            problemas.push('KM Total ausente');
            if ((kmSaida === null || kmSaida === '' || kmSaida === undefined) && (kmChegada === null || kmChegada === '' || kmChegada === undefined)) {
              problemas.push('KM Saída e KM Chegada também ausentes');
            }
          }
        } else if (Number(kmTotal) <= 0) {
          problemas.push('KM Total igual a zero ou negativo');
        }
      }
      if (!temPeso) {
        if (pesoTotal === null || pesoTotal === '' || pesoTotal === undefined) {
          problemas.push('Peso Total ausente');
        } else if (Number(pesoTotal) <= 0) {
          problemas.push('Peso Total igual a zero ou negativo');
        }
      }

      if (!temRota && temIdentificacao) {
        problemas.push('Dados da rota ausentes (regional, distrito ou rota)');
      }

      const completa = temKm && temPeso && temRota && !temValorNegativo;

      if (completa) viagensCompletas++;
      else if (temIdentificacao) viagensIncompletas++;
      if (temValorNegativo && temIdentificacao) viagensComValorNegativo++;

      viagens.push({
        linha: i + 2, // +2 porque linha 0 é cabeçalho e arrays começam em 0
        data: data != null ? String(data) : null,
        placa: placa != null ? String(placa) : null,
        motorista: motorista != null ? String(motorista) : null,
        rota: rota != null ? String(rota) : (regional != null ? String(regional) : (distrito != null ? String(distrito) : null)),
        kmTotal: kmTotal != null ? Number(kmTotal) : null,
        pesoTotal: pesoTotal != null ? Number(pesoTotal) : null,
        kmSaida: kmSaida != null ? Number(kmSaida) : null,
        kmChegada: kmChegada != null ? Number(kmChegada) : null,
        kmTotalCalculado: kmTotalCalculado != null ? Number(kmTotalCalculado.toFixed(1)) : null,
        completa,
        temIdentificacao,
        temValorNegativo,
        problemas,
      });
    }

    const totalViagens = viagens.length;

    // Estatísticas por tipo de problema
    const problemasAgrupados: Record<string, number> = {};
    for (const v of viagens) {
      if (v.completa) continue;
      for (const p of v.problemas) {
        const chave = p.includes('negativo') ? 'Valor negativo (fora do dashboard)' :
                      p.includes('KM') ? 'Falta KM Total' :
                      p.includes('Peso') ? 'Falta Peso Total' :
                      p.includes('rota') ? 'Falta dados da rota' :
                      p.includes('zero') ? 'Valor inválido (zero)' :
                      'Outros';
        problemasAgrupados[chave] = (problemasAgrupados[chave] || 0) + 1;
      }
    }

    const viagensInconsistentesTotal = viagens.filter(
      v => v.temIdentificacao && !v.completa
    ).length;

    res.json({
      sucesso: true,
      nomeArquivo: req.file.originalname,
      aba: nomeAba,
      totalViagens,
      viagensCompletas,
      viagensIncompletas,
      viagensComValorNegativo,
      viagensValidasDashboard: viagensCompletas,
      viagensInconsistentesTotal,
      podeImportar: true,
      avisoDashboard: viagensInconsistentesTotal > 0
        ? `${viagensInconsistentesTotal} viagem(ns) inconsistente(s) serão importadas mas não entrarão no dashboard.`
        : null,
      percentualCompleto: totalViagens > 0 ? Math.round((viagensCompletas / totalViagens) * 100) : 0,
      problemasAgrupados: Object.entries(problemasAgrupados).map(([tipo, qtd]) => ({ tipo, quantidade: qtd })),
      viagens: viagens.filter(v => !v.completa && v.temIdentificacao).slice(0, 500),
    });
  } catch (error: any) {
    console.error('[AnalisarViagens] Erro:', error?.message || error);
    res.status(500).json({ error: 'Erro ao analisar viagens: ' + (error?.message || '') });
  }
});

// ─── CORREÇÃO AUTOMÁTICA PRÉ-UPLOAD ───
// POST /api/qualidade-coleta/corrigir
// Recebe a planilha, aplica correções automáticas e retorna planilha corrigida + relatório
import * as XLSX from 'xlsx';
app.post('/api/qualidade-coleta/corrigir', authenticate, qMulter.single('planilha'), async (req: any, res: any) => {
  if (!req.file) { res.status(400).json({ error: 'Nenhum arquivo' }); return; }
  
  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false });
    const nomeAba = workbook.SheetNames[0];
    const sheet = workbook.Sheets[nomeAba];
    const dados: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: true, raw: true });

    if (dados.length < 2) {
      res.json({ sucesso: true, mensagem: 'Planilha sem dados para corrigir.', alteracoes: { linhasRemovidas: 0, valoresNegativosCorrigidos: 0, linhasVaziasRemovidas: 0, duplicatasRemovidas: 0 } });
      return;
    }

    const cabecalho = dados[0] as string[];
    const linhas = dados.slice(1);
    const alteracoes = { linhasRemovidas: 0, valoresNegativosCorrigidos: 0, linhasVaziasRemovidas: 0, duplicatasRemovidas: 0 };

    // 1. Remover linhas totalmente vazias no final
    let ultimaLinhaComDados = -1;
    for (let i = linhas.length - 1; i >= 0; i--) {
      const temDado = linhas[i]?.some((v: any) => v !== null && v !== '' && v !== undefined);
      if (temDado) { ultimaLinhaComDados = i; break; }
    }
    const linhasFiltradas = linhas.slice(0, ultimaLinhaComDados + 1);
    alteracoes.linhasVaziasRemovidas = linhas.length - linhasFiltradas.length;

    // 2. Identificar colunas numéricas (KM, PESO, LITROS, VALOR)
    const colunasNumericas: number[] = [];
    cabecalho.forEach((h: string, idx: number) => {
      const hUpper = (h || '').toUpperCase();
      if (['KM SAIDA','KM SAÍDA','KM CHEGADA','KM TOTAL','PESO TOTAL','PESO','PESO 1','PESO 2','LITROS','VALOR'].some(p => hUpper.includes(p))) {
        colunasNumericas.push(idx);
      }
    });

    // 3. Corrigir valores negativos (transformar em zero)
    const linhasCorrigidas = linhasFiltradas.map((linha: any[]) => {
      const nova = [...linha];
      colunasNumericas.forEach(idx => {
        if (typeof nova[idx] === 'number' && nova[idx] < 0) {
          alteracoes.valoresNegativosCorrigidos++;
          nova[idx] = 0;
        }
      });
      return nova;
    });

    // 4. Remover duplicatas (mesma placa + data)
    const cabecalhoUpper = cabecalho.map((h: string) => (h || '').toUpperCase());
    const idxPlaca = cabecalhoUpper.findIndex((h: string) => h.includes('PLACA'));
    const idxData = cabecalhoUpper.findIndex((h: string) => h.includes('DATA'));
    
    let linhasFinais: any[][] = linhasCorrigidas;
    
    if (idxPlaca >= 0 && idxData >= 0) {
      const visto = new Set<string>();
      linhasFinais = linhasCorrigidas.filter((linha: any[]) => {
        const placa = linha[idxPlaca];
        const data = linha[idxData];
        if (placa && data) {
          const chave = `${placa}|${data}`;
          if (visto.has(chave)) {
            alteracoes.duplicatasRemovidas++;
            return false;
          }
          visto.add(chave);
        }
        return true;
      });
    }
    
    alteracoes.linhasRemovidas = alteracoes.linhasVaziasRemovidas + alteracoes.duplicatasRemovidas;

    // Montar nova planilha
    const novaPlanilha = [cabecalho, ...linhasFinais];
    const novaWS = XLSX.utils.aoa_to_sheet(novaPlanilha);
    const novoWB = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(novoWB, novaWS, nomeAba);
    const bufferCorrigido = XLSX.write(novoWB, { type: 'buffer', bookType: 'xlsx' });

    // Gerar relatório de qualidade da planilha corrigida
    const relatorioCorrigido = analisarQualidadePlanilha(bufferCorrigido, req.file.originalname.replace('.xlsx', '_corrigido.xlsx'));

    // Retornar como base64
    const base64 = bufferCorrigido.toString('base64');

    res.json({
      sucesso: true,
      mensagem: `Correções aplicadas: ${alteracoes.valoresNegativosCorrigidos} valor(es) negativo(s) zerados, ${alteracoes.duplicatasRemovidas} duplicata(s) removidas, ${alteracoes.linhasVaziasRemovidas} linha(s) vazia(s) removidas.`,
      alteracoes,
      planilhaBase64: base64,
      nomeArquivo: req.file.originalname.replace('.xlsx', '_corrigido.xlsx'),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      qualidadeApos: relatorioCorrigido,
    });
  } catch (error: any) {
    console.error('Erro ao corrigir planilha:', error);
    res.status(500).json({ error: 'Erro ao corrigir planilha: ' + (error?.message || '') });
  }
});

app.use('/api/coleta', coletaRoutes); // coleta já tem authenticate interno
app.use('/api/contracts', contractsRoutes); // contratos (requer autenticação)
app.use('/api/contracts/:contractId/servicos', servicosRoutes); // serviços aninhados

// Rotas de KPIs Universais
app.use('/api/kpis-universais', authenticate, kpiUniversalRoutes);

// Rotas de Gráficos Padrão (biblioteca gerenciável)
app.use('/api/graficos-padrao', authenticate, graficosPadraoRoutes);

// Rotas do WhatsApp Cloud API
app.use('/api/whatsapp', authenticate, whatsappRoutes);

// Rotas do Catálogo de Tipos de Serviço
app.use('/api/tipo-servico', authenticate, tipoServicoRoutes);

// Rota consolidada para Dashboard Principal
app.get('/api/dashboard/kpis-consolidado', authenticate, (req, res) => servicoCtrl.getKpisConsolidado(req, res));

// Rota de geração de PDF (puppeteer) — requer autenticação
import puppeteer from 'puppeteer';
app.post('/api/generate-pdf', authenticate, async (req: Request, res: Response) => {
  try {
    const { html, filename = 'documento' } = req.body;
    if (!html) return res.status(400).json({ error: 'HTML é obrigatório' });

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900 });
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 4000));
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
    });
    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    res.send(pdf);
  } catch (error: any) {
    console.error('Erro ao gerar PDF:', error?.message || error);
    res.status(500).json({ error: 'Erro ao gerar PDF: ' + (error?.message || '') });
  }
});

// Middleware de erro global
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ error: err.message || 'Erro interno do servidor' });
});

// Inicializar banco de dados e iniciar servidor
AppDataSource.initialize()
  .then(async () => {
    console.log('✅ Banco de dados conectado com sucesso');
    // Seed da biblioteca de KPIs universais
    try {
      await seedKpisUniversais();
    } catch (err) {
      console.error('⚠️ Erro ao seed KPIs universais:', err);
    }
    // Seed complementar de KPIs universais
    try {
      await seedKpisUniversaisExtra();
    } catch (err) {
      console.error('⚠️ Erro ao seed KPIs universais extra:', err);
    }
    try {
      await seedKpisUniversaisReceita();
    } catch (err) {
      console.error('⚠️ Erro ao seed KPIs universais receita:', err);
    }
    // Seed da biblioteca de gráficos padrão
    try {
      await seedGraficosPadrao();
    } catch (err) {
      console.error('⚠️ Erro ao seed gráficos padrão:', err);
    }
    // Migration automática: corrige expressões de horas em serviços existentes
    try {
      await migrateHorasProdutivas();
    } catch (err) {
      console.error('⚠️ Erro na migration de horas produtivas:', err);
    }
    app.listen(PORT, () => {
      console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('❌ Erro ao conectar ao banco de dados:', error);
    process.exit(1);
  });
