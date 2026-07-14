import 'reflect-metadata';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente ANTES de qualquer outro módulo
dotenv.config();

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import AppDataSource from './database/data-source';
import { MAX_BODY_BYTES } from './config/limitesRecursos';

const app: Express = express();
const PORT = process.env.APP_PORT || 3200;

// Middlewares globais
const corsOrigins = (
  process.env.CORS_ORIGIN ||
  'http://localhost:5175,http://127.0.0.1:5175,http://localhost:3300,http://127.0.0.1:3300'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const isProd = process.env.NODE_ENV === 'production';
app.use(cors({
  origin: (origin, callback) => {
    // Nunca lançar Error aqui: o Express transforma em HTTP 500 e mascara o problema real.
    if (!origin || !isProd || corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: process.env.CORS_CREDENTIALS !== 'false',
}));
app.use(express.json({ limit: MAX_BODY_BYTES }));
app.use(express.urlencoded({ limit: MAX_BODY_BYTES, extended: true }));

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '2.0-minio',
    buildSha: process.env.BUILD_SHA || 'unknown',
    tag: process.env.IMAGE_TAG || process.env.TAG || 'unknown',
  });
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
import wuzapiRoutes from './routes/wuzapi';
import pdfRoutes from './routes/pdf';
import { pdfController } from './controllers/PdfController';
import { seedKpisUniversais } from './database/seedKpiUniversal';
import { seedKpisUniversaisExtra } from './database/seedKpiUniversalExtra';
import { seedKpisUniversaisReceita } from './database/seedKpiUniversalReceita';
import { seedGraficosPadrao } from './database/seedGraficosPadrao';
import { migrateHorasProdutivas } from './database/migrate_horas_produtivas';
import { migrateColetoresEquipeKpi } from './database/migrate_coletores_equipe_kpi';
import { migrateMediaHorasViagemKpi } from './database/migrate_media_horas_viagem_kpi';
import { sincronizarKpisUniversaisBiblioteca } from './database/sincronizarKpisUniversaisBiblioteca';
import { DashboardExecutivoController } from './controllers/DashboardExecutivoController';
import { ModeloExecutivoController } from './controllers/ModeloExecutivoController';
import {
  registrarControllerExecutivo,
  iniciarAgendamentoWarmupExecutivo,
} from './services/executivoCacheWarmupService';

const servicoCtrl = new ServicoController();
const dashboardExecutivoCtrl = new DashboardExecutivoController();
const modeloExecutivoCtrl = new ModeloExecutivoController();
registrarControllerExecutivo(dashboardExecutivoCtrl);

// Rotas públicas
app.use('/api/auth', authRoutes);

// Rotas protegidas (requerem autenticação)
app.use('/api/abastecimentos', authenticate, abastecimentoRoutes);

// Catálogo de fórmulas do Modelo Executivo (fonte única backend)
app.get('/api/modelo-executivo/formulas', authenticate, (req, res) => modeloExecutivoCtrl.listarFormulas(req, res));

// ⚠️ Rotas do Dashboard Executivo ANTES do router de dashboard (para evitar 404)
app.get('/api/dashboard/executivo', authenticate, (req, res) => dashboardExecutivoCtrl.executivo(req, res));
app.get('/api/dashboard/diagnostico', authenticate, (req, res) => dashboardExecutivoCtrl.diagnostico(req, res));
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
    const { analisarViagensPlanilha } = await import('./services/analisarViagensPlanilhaService');
    const { Contract } = await import('./entities/Contract');
    const contractId = typeof req.body?.contractId === 'string' ? req.body.contractId.trim() : '';
    let cadastroOperacional = null;
    if (contractId) {
      const contract = await AppDataSource.getRepository(Contract).findOne({ where: { id: contractId } });
      cadastroOperacional = contract?.configOperacional ?? null;
    }
    const resultado = analisarViagensPlanilha(req.file.buffer, req.file.originalname, cadastroOperacional);
    res.json(resultado);
  } catch (error: any) {
    console.error('[AnalisarViagens] Erro:', error?.message || error);
    res.status(500).json({ error: 'Erro ao analisar viagens: ' + (error?.message || '') });
  }
});

// ─── CORREÇÃO AUTOMÁTICA PRÉ-UPLOAD ───
// POST /api/qualidade-coleta/corrigir
// Recebe a planilha, aplica correções automáticas e retorna planilha corrigida + relatório
import * as XLSX from 'xlsx';
import { normalizarPlaca } from './utils/normalizarPlaca';
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

    const cabecalhoUpper = cabecalho.map((h: string) => (h || '').toUpperCase());
    const idxPlaca = cabecalhoUpper.findIndex((h: string) => h.includes('PLACA') && !h.includes('BASE'));
    if (idxPlaca >= 0) {
      for (const linha of linhasCorrigidas) {
        const bruta = linha[idxPlaca];
        if (bruta !== null && bruta !== undefined && bruta !== '') {
          const norm = normalizarPlaca(String(bruta));
          if (norm) linha[idxPlaca] = norm;
        }
      }
    }

    // 4. Remover duplicatas (mesma placa + data)
    const idxData = cabecalhoUpper.findIndex((h: string) => h.includes('DATA'));
    
    let linhasFinais: any[][] = linhasCorrigidas;
    
    if (idxPlaca >= 0 && idxData >= 0) {
      const visto = new Set<string>();
      linhasFinais = linhasCorrigidas.filter((linha: any[]) => {
        const placa = linha[idxPlaca];
        const data = linha[idxData];
        if (placa && data) {
          const placaNorm = normalizarPlaca(String(placa)) || String(placa).trim().toUpperCase();
          const chave = `${placaNorm}|${data}`;
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

// PDF unificado
app.use('/api/pdf', authenticate, pdfRoutes);

// Rotas do WhatsApp Cloud API (Meta — outbound)
app.use('/api/whatsapp', authenticate, whatsappRoutes);

// WuzAPI — webhook (público) + mapeamento de grupos (autenticado)
app.use('/api/wuzapi', wuzapiRoutes);

// Rotas do Catálogo de Tipos de Serviço
app.use('/api/tipo-servico', authenticate, tipoServicoRoutes);

// Rotas consolidadas para Dashboard Principal
app.get('/api/dashboard/diagnostico-servicos', authenticate, (req, res) => servicoCtrl.getDiagnosticoTodosServicos(req, res));
app.get('/api/dashboard/kpis-consolidado', authenticate, (req, res) => servicoCtrl.getKpisConsolidado(req, res));
app.get('/api/dashboard/servicos-por-tipo', authenticate, (req, res) => servicoCtrl.listarServicosPorTipoGlobal(req, res));
app.get('/api/dashboard/comparar-por-tipo', authenticate, (req, res) => servicoCtrl.getCompararKpisGlobal(req, res));

// Rota de geração de PDF (legado) — delega ao endpoint unificado
app.post('/api/generate-pdf', authenticate, (req, res) => {
  if (!req.body.margin) req.body.margin = 'default';
  return pdfController.generate(req, res);
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

    const skipStartup = process.env.SKIP_STARTUP_SEED === 'true';

    if (!skipStartup) {
      try {
        await seedKpisUniversais();
      } catch (err) {
        console.error('⚠️ Erro ao seed KPIs universais:', err);
      }
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
      if (process.env.SYNC_KPIS_UNIVERSAIS !== 'false') {
        try {
          await sincronizarKpisUniversaisBiblioteca();
        } catch (err) {
          console.error('⚠️ Erro ao sincronizar biblioteca de KPIs universais:', err);
        }
      }
      try {
        await seedGraficosPadrao();
      } catch (err) {
        console.error('⚠️ Erro ao seed gráficos padrão:', err);
      }
    } else {
      console.log('⏭️ SKIP_STARTUP_SEED=true — seeds de biblioteca ignorados');
    }

    if (process.env.SKIP_STARTUP_MIGRATIONS !== 'true') {
      try {
        await migrateHorasProdutivas();
      } catch (err) {
        console.error('⚠️ Erro na migration de horas produtivas:', err);
      }
      try {
        await migrateColetoresEquipeKpi();
      } catch (err) {
        console.error('⚠️ Erro na migration de coletores na equipe:', err);
      }
      try {
        await migrateMediaHorasViagemKpi();
      } catch (err) {
        console.error('⚠️ Erro na migration de média horas/viagem:', err);
      }
    } else {
      console.log('⏭️ SKIP_STARTUP_MIGRATIONS=true — migrations automáticas ignoradas');
    }

    app.listen(PORT, () => {
      console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
      iniciarAgendamentoWarmupExecutivo();
    });
  })
  .catch((error) => {
    console.error('❌ Erro ao conectar ao banco de dados:', error);
    process.exit(1);
  });
