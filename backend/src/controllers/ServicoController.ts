import { Request, Response } from 'express';
import AppDataSource from '../database/data-source';
import { Servico } from '../entities/Servico';
import { Contract } from '../entities/Contract';
import { PlanilhaUpload } from '../entities/PlanilhaUpload';
import { KpiUniversal } from '../entities/KpiUniversal';
import PlanilhaService from '../services/PlanilhaService';
import { TipoServico, TIPOS_SERVICO_VALORES } from '../enums/TipoServico';
import {
  calcularKpiComFormula,
  calcularExpressao,
  validarExpressao,
  normalizarDados,
  encontrarValorColuna,
  MODELO_EXECUTIVO_KPIS,
} from '../services/FormulaEngine';
import AutoIndicatorService, { AnaliseAutoIndicadores, ColunaInfo } from '../services/AutoIndicatorService';
import TipoServicoTemplateService from '../services/TipoServicoTemplateService';
import { gerarConfigGraficosPadrao, reResolverGraficos } from '../services/graficosPadrao';
import { buildValoresFixosFaturamento } from '../services/configFaturamentoValores';
import { calcularHorasProdutivasTotal } from '../services/horasProdutivasService';
import { isNomeColunaInvalido } from '../services/PadraoPlanilhaDetector';
import ValidacaoViagemService from '../services/validacaoViagemService';

/**
 * Detecta qual coluna existe nos dados dentre uma lista de candidatos
 */
function detectarColuna(dados: Record<string, any>[], candidatos: string[]): string {
  if (!dados || dados.length === 0) return '';
  const chaves = Object.keys(dados[0]);
  for (const candidato of candidatos) {
    const norm = candidato.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
    for (const chave of chaves) {
      const chaveNorm = chave.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
      if (chaveNorm === norm) return chave;
    }
  }
  // Fallback: tenta encontrar qualquer coluna que contenha algum token dos candidatos
  for (const chave of chaves) {
    const chaveNorm = chave.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
    for (const candidato of candidatos) {
      const norm = candidato.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
      // Match parcial: se o nome da coluna contem o candidato ou vice-versa
      if (chaveNorm.includes(norm) || norm.includes(chaveNorm)) return chave;
    }
  }
  return '';
}

/**
 * Detecta TODAS as colunas que correspondem a um padrão (por substring na normalizada)
 * Ex: detectarColunasPorPadrao(dadosNorm, ['HORA', 'SAIDA', 'ROTA']) -> ['HORA SAÍDA ROTA 01', 'HORA SAÍDA ROTA 02', ...]
 */
function detectarColunasPorPadrao(dados: Record<string, any>[], palavrasChave: string[]): string[] {
  if (!dados || dados.length === 0) return [];
  const chaves = Object.keys(dados[0]);
  const encontradas: string[] = [];
  for (const chave of chaves) {
    if (chave.startsWith('__EMPTY')) continue;
    const chaveNorm = chave.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
    const temTodas = palavrasChave.every(p => {
      const pNorm = p.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
      return chaveNorm.includes(pNorm);
    });
    if (temTodas) encontradas.push(chave);
  }
  return encontradas;
}

/**
 * Extrai nomes de colunas de uma expressão de fórmula
 */
function extrairNomesColunas(expressao: string): string[] {
  const nomes: string[] = [];
  // Extrair de funções agregadas: SUM(col), AVG(col), etc.
  const funcRegex = /(?:SUM|AVG|MIN|MAX|COUNT(?:\s+DISTINCT)?)\s*\(\s*([^)]+?)\s*(?:SE\s+.+)?\)/gi;
  let match;
  while ((match = funcRegex.exec(expressao)) !== null) {
    const col = match[1].trim();
    if (col !== '*') nomes.push(col);
  }
  // Extrair de FATURAMENTO_EST(col1, col2)
  const fatRegex = /FATURAMENTO_EST\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/gi;
  while ((match = fatRegex.exec(expressao)) !== null) {
    nomes.push(match[1].trim());
    nomes.push(match[2].trim());
  }
  // Extrair de DIVIDE(expr, expr) e MULTIPLY(expr, expr)
  const divMultRegex = /(?:DIVIDE|MULTIPLY)\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/gi;
  while ((match = divMultRegex.exec(expressao)) !== null) {
    const innerNomes = extrairNomesColunas(match[1]);
    innerNomes.forEach(n => { if (!nomes.includes(n)) nomes.push(n); });
    const innerNomes2 = extrairNomesColunas(match[2]);
    innerNomes2.forEach(n => { if (!nomes.includes(n)) nomes.push(n); });
  }
  // Também capturar tokens que parecem nomes de colunas (palavras maiúsculas)
  const tokenRegex = /\b([A-Z][A-Z\s]+[A-Z])\b/g;
  while ((match = tokenRegex.exec(expressao)) !== null) {
    const nome = match[1].trim();
    if (nome.length > 2 && !['SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'DISTINCT', 'IF', 'ABS', 'ROUND', 'DIVIDE', 'MULTIPLY', 'FATURAMENTO_EST', 'SE', 'TRUE', 'FALSE'].includes(nome) && !/^\d+(\.\d+)?$/.test(nome) && !nomes.includes(nome)) {
      nomes.push(nome);
    }
  }
  return [...new Set(nomes)];
}

/**
 * ⭐ Substitui TODAS as colunas de uma fórmula pelos nomes reais detectados na planilha
 */
function substituirColunasNaFormula(formula: string, colunasNomes: string[]): string {
  const colunasFormula = extrairNomesColunas(formula);
  let resultado = formula;
  for (const col of colunasFormula) {
    const colReal = detectarColunaPeloNome(colunasNomes, [col]);
    if (colReal && colReal !== col) {
      const escaped = col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      resultado = resultado.replace(new RegExp('\\b' + escaped + '\\b', 'g'), colReal);
    }
  }
  return resultado;
}

/**
 * ⭐ Detecta coluna por nome em uma lista de nomes disponíveis
 */
function detectarColunaPeloNome(colunasNomes: string[], candidatos: string[]): string {
  for (const candidato of candidatos) {
    const norm = candidato.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
    for (const cn of colunasNomes) {
      const cnn = cn.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
      if (cnn === norm) return cn;
    }
  }
  for (const candidato of candidatos) {
    const norm = candidato.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
    for (const cn of colunasNomes) {
      const cnn = cn.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
      if (cnn.includes(norm) || norm.includes(cnn)) return cn;
    }
  }
  return '';
}

/**
 * Formata um valor numerico conforme o formato
 */
function formatarValor(valor: number, formato: string): string {
  if (formato === 'moeda') {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  if (formato === 'porcentagem') {
    return valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
  }
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

// ═══════════════════════════════════════════════════════════════
// ⚡ CACHE EM MEMÓRIA para evitar recálculos desnecessários
// ═══════════════════════════════════════════════════════════════
const cacheBackend = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 60_000; // 60 segundos

function getCache<T>(key: string): T | null {
  const item = cacheBackend.get(key);
  if (item && (Date.now() - item.timestamp) < CACHE_TTL_MS) {
    return item.data as T;
  }
  cacheBackend.delete(key);
  return null;
}

function setCache(key: string, data: any): void {
  cacheBackend.set(key, { data, timestamp: Date.now() });
  // Limpeza de cache velho a cada 50 entradas
  if (cacheBackend.size > 50) {
    const agora = Date.now();
    for (const [k, v] of cacheBackend) {
      if (agora - v.timestamp > CACHE_TTL_MS) cacheBackend.delete(k);
    }
  }
}

function invalidateCache(prefix: string): void {
  for (const key of cacheBackend.keys()) {
    if (key.startsWith(prefix)) cacheBackend.delete(key);
  }
}

// ═══════════════════════════════════════════════════════════════
// Cache de colunas detectadas (evita detectarColuna N vezes)
// ═══════════════════════════════════════════════════════════════
const colunasDetectadasCache = new Map<string, Record<string, string>>();

function detectarTodasColunas(dados: Record<string, any>[], servicoId: string): Record<string, string> {
  if (!dados || dados.length === 0) return {};
  
  const cacheKey = `${servicoId}:${dados.length}`;
  const cached = colunasDetectadasCache.get(cacheKey);
  if (cached) return cached;
  
  const resultado: Record<string, string> = {};
  const categorias: Record<string, string[]> = {
    colPeso: ['PESO TOTAL', 'PESO', 'PESOTOTAL', 'PESO_TOTAL', 'pesoTotal'],
    colKm: ['KM TOTAL', 'KM', 'KMTOTAL', 'KM_TOTAL', 'kmTotal', 'QUILOMETRO', 'DISTANCIA'],
    colPlaca: ['PLACA', 'CAMINHAO', 'VEICULO', 'COLETOR', 'COLETORA', 'EQUIPAMENTO', 'placa'],
    colTipo: ['CAMINHAO', 'TIPO CAMINHAO', 'TIPO_CAMINHAO', 'tipoCaminhao', 'CAMINHÃO', 'TIPO DE CAMINHAO', 'TIPO DE CAMINHÃO', 'TIPODECAMINHAO'],
    colHora: ['HORA SAIDA', 'HORA', 'HORASAIDA', 'HORA_SAIDA', 'horaSaida', 'HR SAIDA BASE', 'HR_SAIDA_BASE', 'HRSAIDABASE', 'SAIDA BASE', 'HORA SÁIDA BASE', 'HORASAIDABASE', 'HORA SAIDA BASE'],
    colHoraChegada: ['HORA CHEGADA', 'HORACHEGADA', 'HORA_CHEGADA', 'horaChegada', 'HR CHEGA BASE', 'HR_CHEGA_BASE', 'HRCHEGABASE', 'CHEGADA BASE', 'HR CHEGADA BASE', 'HORA CHEGADA BASE', 'HORACHEGADABASE'],
    colNroColetores: ['Nº DE COLETORES', 'NDECOLETORES', 'NUMERO DE COLETORES', 'NÚMERO DE COLETORES', 'QTDE COLETORES', 'NRO COLETORES', 'QTD COLETORES'],
    colData: ['DATA SAIDA', 'DATA', 'DATA_SAIDA', 'DIA', 'dataSaida'],
    colMotorista: ['MOTORISTA', 'NOME MOTORISTA', 'NOME_MOTORISTA', 'NOME', 'OPERADOR', 'FUNCIONARIO'],
  };
  
  for (const [categoria, candidatos] of Object.entries(categorias)) {
    resultado[categoria] = detectarColuna(dados, candidatos);
  }
  
  colunasDetectadasCache.set(cacheKey, resultado);
  return resultado;
}

export class ServicoController {
  private get repository() {
    return AppDataSource.getRepository(Servico);
  }

  private get contractRepo() {
    return AppDataSource.getRepository(Contract);
  }

  private get uploadRepo() {
    return AppDataSource.getRepository(PlanilhaUpload);
  }

  /**
   * GET /api/contracts/:contractId/servicos
   * Lista todos os serviços de um contrato
   */
  async listar(req: Request, res: Response): Promise<any> {
    try {
      const contractId = req.params.contractId as string;

      const servicos = await this.repository.find({
        where: { contract_id: contractId },
        order: { criadoEm: 'DESC' },
      });

      return res.json({ servicos, total: servicos.length });
    } catch (error) {
      console.error('Erro ao listar serviços:', error);
      return res.status(500).json({ error: 'Erro ao carregar serviços' });
    }
  }

  /**
   * GET /api/contracts/:contractId/servicos/:id
   * Busca um serviço específico
   */
  async buscarUm(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const servico = await this.repository.findOne({ where: { id } });

      if (!servico) {
        return res.status(404).json({ error: 'Serviço não encontrado' });
      }

      return res.json(servico);
    } catch (error) {
      console.error('Erro ao buscar serviço:', error);
      return res.status(500).json({ error: 'Erro ao carregar serviço' });
    }
  }

  /**
   * POST /api/contracts/:contractId/servicos
   * Cria um novo serviço
   */
  async criar(req: Request, res: Response): Promise<any> {
    try {
      const contractId = req.params.contractId as string;
      const { nome, descricao, tipo, configDashboard, padraoPlanilha, configFaturamento } = req.body;

      // Verifica se o contrato existe
      const contract = await this.contractRepo.findOne({ where: { id: contractId } });
      if (!contract) {
        return res.status(404).json({ error: 'Contrato não encontrado' });
      }

      if (!nome || !nome.trim()) {
        return res.status(400).json({ error: 'Nome do serviço é obrigatório' });
      }

      // Valida tipo
      if (tipo && !TIPOS_SERVICO_VALORES.includes(tipo)) {
        return res.status(400).json({ error: `Tipo inválido. Valores aceitos: ${TIPOS_SERVICO_VALORES.join(', ')}` });
      }

      const servico = new Servico();
      servico.contract_id = contractId;
      servico.nome = nome.trim();
      servico.tipo = tipo || TipoServico.COLETA_CAMINHAO;
      servico.descricao = descricao || null;
      servico.configDashboard = configDashboard || null;
      servico.configFaturamento = configFaturamento || null;

      // ⭐ KPIS DO TEMPLATE COM BASE NO TIPO DE SERVICO
      const tipoFinal = servico.tipo || TipoServico.COLETA_CAMINHAO;
      const kpisTemplate = TipoServicoTemplateService.converterKpisParaConfig(tipoFinal);

      // === GRAFICOS PADRAO: gera automaticamente com base no tipo de servico ===
      const colunasNomesGraf: string[] = servico.padraoPlanilha?.colunas
        ? servico.padraoPlanilha.colunas.map((c: any) => c.nome)
        : [];
      const graficosPadrao = gerarConfigGraficosPadrao(tipoFinal, colunasNomesGraf);

      if (!servico.configDashboard) {
        servico.configDashboard = {
          kpis: kpisTemplate,
          graficos: graficosPadrao,
          kpisTemplateAplicados: kpisTemplate.length > 0,
          kpisTemplateTotal: kpisTemplate.length,
          kpisTemplateTipo: tipoFinal,
          kpisTemplateAplicadosEm: new Date().toISOString(),
          graficosPadraoAplicados: true,
          graficosPadraoTotal: graficosPadrao.length,
          graficosPadraoTipo: tipoFinal,
          graficosPadraoAplicadosEm: new Date().toISOString(),
        };
      } else {
        // Adicionar KPIs do template (sem duplicar)
        const kpisExistentes: any[] = servico.configDashboard.kpis || [];
        const labelsExistentes = new Set(
          kpisExistentes.map((k: any) => k.label?.toLowerCase().trim())
        );
        const kpisNovosDoTemplate = kpisTemplate.filter(
          (k: any) => !labelsExistentes.has(k.label?.toLowerCase().trim())
        );
        if (kpisNovosDoTemplate.length > 0) {
          servico.configDashboard.kpis = [...kpisExistentes, ...kpisNovosDoTemplate];
          servico.configDashboard.kpisTemplateAplicados = true;
          servico.configDashboard.kpisTemplateTotal = kpisTemplate.length;
          servico.configDashboard.kpisTemplateTipo = tipoFinal;
          servico.configDashboard.kpisTemplateAplicadosEm = new Date().toISOString();
        }
        // Adicionar gráficos padrão
        const graficosExistentes = servico.configDashboard.graficos || [];
        const titulosExistentes = new Set(
          graficosExistentes.map((g: any) => g.titulo?.toLowerCase().trim())
        );
        const graficosNovos = graficosPadrao.filter(
          (g: any) => !titulosExistentes.has(g.titulo?.toLowerCase().trim())
        );
        servico.configDashboard.graficos = [...graficosExistentes, ...graficosNovos];
        servico.configDashboard.graficosPadraoAplicados = true;
        servico.configDashboard.graficosPadraoTotal = graficosPadrao.length;
        servico.configDashboard.graficosPadraoTipo = tipoFinal;
        servico.configDashboard.graficosPadraoAplicadosEm = new Date().toISOString();
      }
      servico.padraoPlanilha = padraoPlanilha || null;

      const novoServico = await this.repository.save(servico);
      return res.status(201).json(novoServico);
    } catch (error) {
      console.error('Erro ao criar serviço:', error);
      return res.status(500).json({ error: 'Erro ao criar serviço' });
    }
  }

  /**
   * PUT /api/contracts/:contractId/servicos/:id
   * Atualiza um serviço
   */
  async atualizar(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const { nome, descricao, tipo, configDashboard, padraoPlanilha } = req.body;

      const servico = await this.repository.findOne({ where: { id } });
      if (!servico) {
        return res.status(404).json({ error: 'Serviço não encontrado' });
      }

      // Valida tipo se informado
      if (tipo !== undefined) {
        if (!TIPOS_SERVICO_VALORES.includes(tipo)) {
          return res.status(400).json({ error: `Tipo inválido. Valores aceitos: ${TIPOS_SERVICO_VALORES.join(', ')}` });
        }
        servico.tipo = tipo;
      }

      if (nome !== undefined) servico.nome = nome.trim();
      if (descricao !== undefined) servico.descricao = descricao;
      if (configDashboard !== undefined) servico.configDashboard = configDashboard;
      if (padraoPlanilha !== undefined) servico.padraoPlanilha = padraoPlanilha;

      await this.repository.save(servico);
      return res.json(servico);
    } catch (error) {
      console.error('Erro ao atualizar serviço:', error);
      return res.status(500).json({ error: 'Erro ao atualizar serviço' });
    }
  }

  /**
   * GET /api/contracts/:contractId/servicos/:id/padrao
   * Retorna o padrão da planilha + estatísticas do último upload vinculado
   */
  async getPadrao(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const contractId = req.params.contractId as string;
      const servico = await this.repository.findOne({ where: { id } });

      if (!servico) {
        return res.status(404).json({ error: 'Serviço não encontrado' });
      }

      // Buscar contrato para obter valores dos caminhões
      const contract = await this.contractRepo.findOne({ where: { id: contractId } });

      // Buscar uploads vinculados a este serviço
      const uploads = await this.uploadRepo.find({
        where: { servico_id: id },
        order: { criadoEm: 'DESC' },
        take: 5,
      });

      // Estatísticas básicas dos uploads
      const totalUploads = uploads.length;
      const totalLinhas = uploads.reduce((s, u) => s + u.totalLinhas, 0);
      const totalImportados = uploads.reduce((s, u) => s + u.linhasImportadas, 0);

                  // ⭐ Buscar KPIs Universais do mesmo tipo de servico
      const kpiUniversalRepo = AppDataSource.getRepository(KpiUniversal);
      const kpisUniversais = await kpiUniversalRepo.find({
        where: { tipoServico: servico.tipo || 'coleta_caminhao' },
        order: { categoria: 'ASC', nome: 'ASC' },
      });

      // Marcar quais ja estao ativados no configDashboard
      const kpisAtivados: any[] = servico.configDashboard?.kpis || [];
      const kpisUniversaisDisponiveis = kpisUniversais.map(k => ({
        id: k.id,
        nome: k.nome,
        label: k.label,
        expressao: k.formula,
        formato: k.formato,
        descricao: k.descricao || '',
        categoria: k.categoria,
        cor: k.cor,
        unidade: k.unidade || '',
        criadoEm: k.criadoEm,
        jaAtivado: kpisAtivados.some((ka: any) => ka.origemUniversal === k.id),
      }));

      const padraoSanitizado = servico.padraoPlanilha
        ? {
            ...servico.padraoPlanilha,
            colunas: (servico.padraoPlanilha.colunas || []).filter(
              (c: { nome?: string }) => !isNomeColunaInvalido(c.nome || '')
            ),
          }
        : null;

      return res.json({
        servico: {
          id: servico.id,
          nome: servico.nome,
          tipo: servico.tipo || 'coleta_caminhao',
          padraoPlanilha: padraoSanitizado,
          configDashboard: servico.configDashboard,
        },
        uploads: {
          total: totalUploads,
          totalLinhas,
          totalImportados,
          ultimos: uploads.map(u => ({
            id: u.id,
            nome: u.nomeArquivo,
            criadoEm: u.criadoEm,
            linhas: u.totalLinhas,
            importados: u.linhasImportadas,
          })),
        },
        tipoServico: servico.tipo || 'coleta_caminhao',
        valoresCaminhao: contract ? {
          VALOR_TONELADA: contract.valorTonelada ? Number(contract.valorTonelada) : null,
          VALOR_MINI: contract.valorMini ? Number(contract.valorMini) : null,
          VALOR_TRUCK: contract.valorTruck ? Number(contract.valorTruck) : null,
          VALOR_TOCO: contract.valorToco ? Number(contract.valorToco) : null,
        } : null,
        // ⭐ KPIs universais disponiveis para o tipo de servico
        kpisUniversaisDisponiveis,
        totalKpisUniversais: kpisUniversais.length,
        totalKpisAtivados: kpisUniversaisDisponiveis.filter((k: any) => k.jaAtivado).length,
      });
} catch (error) {
      console.error('Erro ao buscar padrão:', error);
      return res.status(500).json({ error: 'Erro ao carregar padrão' });
    }
  }

  /**
   * PUT /api/contracts/:contractId/servicos/:id/config-dashboard
   * Salva a configuração de indicadores do dashboard
   */
  async salvarConfigDashboard(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const { configDashboard } = req.body;

      const servico = await this.repository.findOne({ where: { id } });
      if (!servico) {
        return res.status(404).json({ error: 'Serviço não encontrado' });
      }

      servico.configDashboard = configDashboard;
      await this.repository.save(servico);

      return res.json({ message: 'Configuração salva com sucesso', configDashboard });
    } catch (error) {
      console.error('Erro ao salvar config dashboard:', error);
      return res.status(500).json({ error: 'Erro ao salvar configuração' });
    }
  }

  /**
   * GET /api/contracts/:contractId/servicos/:id/dados
   * Retorna dados de coleta vinculados ao serviço (paginado)
   */
  async listarDados(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const uploadId = req.query.uploadId ? parseInt(req.query.uploadId as string) : undefined;

      const result = await PlanilhaService.listarDadosPorServico(id, page, limit, uploadId);
      return res.json(result);
    } catch (error) {
      console.error('Erro ao listar dados do servico:', error);
      return res.status(500).json({ error: 'Erro ao carregar dados' });
    }
  }

  /**
   * GET /api/contracts/:contractId/servicos/:id/dados-brutos
   * Retorna dados brutos do serviço para cálculos de dashboard
   */
  async listarDadosBrutos(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const limite = parseInt(req.query.limite as string) || 1000;
      const incluirInconsistentes = req.query.incluirInconsistentes === '1' || req.query.todos === '1';
      const dados = await PlanilhaService.getDadosBrutosPorServico(id, limite, {
        apenasValidos: !incluirInconsistentes,
      });
      return res.json({ dados, total: dados.length, apenasValidos: !incluirInconsistentes });
    } catch (error) {
      console.error('Erro ao carregar dados brutos:', error);
      return res.status(500).json({ error: 'Erro ao carregar dados' });
    }
  }

  /**
   * POST /api/contracts/:contractId/servicos/:id/gerar-indicadores
   * Regenera automaticamente os indicadores do dashboard com base no padrão da planilha
   */
  async gerarIndicadores(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const servico = await this.repository.findOne({ where: { id } });

      if (!servico) {
        return res.status(404).json({ error: 'Serviço não encontrado' });
      }

      if (!servico.padraoPlanilha?.colunas) {
        return res.status(400).json({ error: 'Nenhuma planilha vinculada. Faça upload primeiro.' });
      }

      const colunas = servico.padraoPlanilha.colunas as { nome: string; tipo: string; valoresUnicos?: number }[];
      const colunasNumericas = colunas.filter(c => c.tipo === 'numero').map(c => c.nome);
      const colunasTextoRelevantes = colunas.filter(c =>
        c.tipo === 'texto' &&
        (c.valoresUnicos === undefined || c.valoresUnicos <= 200)
      );
      const primeiraColunaTexto = colunas.find(c => c.tipo === 'texto')?.nome || colunas[0]?.nome || '';
      const primeiraColunaNum = colunasNumericas[0] || '';
      const segundaColunaNum = colunasNumericas[1] || '';

      const kpisGerados: any[] = [];
      for (const nome of colunasNumericas.slice(0, 4)) {
        kpisGerados.push({ nome, label: nome, agregacao: 'sum', formato: 'numero', ativo: true });
      }
      for (const col of colunasTextoRelevantes.slice(0, 6)) {
        kpisGerados.push({ nome: col.nome, label: col.nome, agregacao: 'count', formato: 'numero', ativo: true });
      }

      servico.configDashboard = {
        kpis: kpisGerados,
        graficos: [{
          tipo: 'barra',
          titulo: `Distribuição por ${primeiraColunaTexto || 'Categoria'}`,
          eixoX: primeiraColunaTexto,
          eixoY: primeiraColunaNum || segundaColunaNum,
          ativo: true,
        }],
      };

      await this.repository.save(servico);
      return res.json({ message: 'Indicadores gerados com sucesso!', configDashboard: servico.configDashboard });
    } catch (error: any) {
      console.error('Erro ao gerar indicadores:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao gerar indicadores' });
    }
  }

  /**
   * POST /api/contracts/:contractId/servicos/:id/analisar-indicadores-automaticos
   * ⭐ Analisa colunas da planilha e retorna indicadores + gráficos sugeridos
   * para a tela de revisão pós-upload.
   * 
   * Body (opcional):
   *   { forcarRecalculo?: boolean } — força recálculo mesmo se já houver indicadores salvos
   * 
   * Response: AnaliseAutoIndicadores
   */
  async analisarIndicadoresAutomaticos(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const contractId = req.params.contractId as string;
      const { forcarRecalculo } = req.body || {};

      const servico = await this.repository.findOne({ where: { id } });
      if (!servico) {
        return res.status(404).json({ error: 'Serviço não encontrado' });
      }

      // Verificar se já tem análise recente (últimos 5 minutos)
      if (!forcarRecalculo && servico.configDashboard?.ultimaAnaliseAuto) {
        const ultimaAnalise = new Date(servico.configDashboard.ultimaAnaliseAuto);
        const agora = new Date();
        const diffMs = agora.getTime() - ultimaAnalise.getTime();
        if (diffMs < 5 * 60 * 1000) {
          // Retornar análise em cache
          return res.json({
            ...servico.configDashboard.ultimaAnaliseData,
            emCache: true,
          });
        }
      }

      if (!servico.padraoPlanilha?.colunas || servico.padraoPlanilha.colunas.length === 0) {
        return res.status(400).json({ error: 'Nenhuma planilha vinculada. Faça upload primeiro.' });
      }

      // Carregar dados brutos para cálculos mais precisos
      const dadosBrutos = await PlanilhaService.getDadosBrutosPorServico(id, 500);

      // Executar análise
      const analise = await AutoIndicatorService.analisar(
        id,
        contractId,
        servico.padraoPlanilha.colunas.map((c: any) => ({
          nome: c.nome,
          tipo: c.tipo as ColunaInfo['tipo'],
          valoresUnicos: c.valoresUnicos || 0,
          amostras: c.amostras || [],
          nulos: c.nulos || 0,
        })),
        dadosBrutos
      );

      // Converter para KPI/Gráfico format
      const kpisConvertidos = AutoIndicatorService.converterParaKpiConfig(analise.indicadoresSugeridos);
      const graficosConvertidos = AutoIndicatorService.converterParaGraficoConfig(analise.graficosSugeridos);

      const resultado = {
        ...analise,
        indicadores: kpisConvertidos,
        graficos: graficosConvertidos,
        geradoEm: new Date().toISOString(),
      };

      // Salvar cache no servico
      if (!servico.configDashboard) servico.configDashboard = {};
      servico.configDashboard.ultimaAnaliseAuto = new Date().toISOString();
      servico.configDashboard.ultimaAnaliseData = {
        indicadores: resultado.indicadores,
        graficos: resultado.graficos,
        indicadoresSugeridos: resultado.indicadoresSugeridos,
        graficosSugeridos: resultado.graficosSugeridos,
        totalRegistros: analise.totalRegistros,
        colunas: analise.colunas,
      };
      
      // Salvar colunas originais para detectar mudanças futuras
      if (servico.padraoPlanilha) {
        servico.padraoPlanilha.colunasOriginais = analise.colunasOriginais;
      }
      
      await this.repository.save(servico);

      return res.json(resultado);
    } catch (error: any) {
      console.error('Erro ao analisar indicadores automáticos:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao analisar indicadores: ' + (error?.message || '') });
    }
  }

  /**
   * POST /api/contracts/:contractId/servicos/:id/confirmar-indicadores-automaticos
   * Confirma e salva os indicadores automáticos sugeridos.
   * Body:
   *   { 
   *     indicadores: KpiConfig[],  // Lista de indicadores que o usuário aceitou
   *     graficos: GraficoConfig[], // Lista de gráficos que o usuário aceitou
   *     aceitarTodos?: boolean     // Se true, salva todos sem filtro
   *   }
   */
  async confirmarIndicadoresAutomaticos(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const { indicadores, graficos, aceitarTodos } = req.body;

      const servico = await this.repository.findOne({ where: { id } });
      if (!servico) {
        return res.status(404).json({ error: 'Serviço não encontrado' });
      }

      // Se aceitarTodos, usar os indicadores salvos em cache
      let kpisSalvos = indicadores || [];
      let graficosSalvos = graficos || [];

      if (aceitarTodos && servico.configDashboard?.ultimaAnaliseData) {
        kpisSalvos = servico.configDashboard.ultimaAnaliseData.indicadores || [];
        graficosSalvos = servico.configDashboard.ultimaAnaliseData.graficos || [];
      }

      if (!kpisSalvos.length && !aceitarTodos) {
        return res.status(400).json({ error: 'Nenhum indicador recebido para salvar' });
      }

      // Mesclar com indicadores existentes (manter indicadores manuais)
      const kpisExistentes: any[] = servico.configDashboard?.kpis || [];
      const kpisManuais = kpisExistentes.filter((k: any) => !k.automatico);

      // Adicionar os automáticos confirmados
      const kpisAutomaticos = kpisSalvos.map((k: any) => ({
        ...k,
        automatico: true,
        aceitoEm: new Date().toISOString(),
      }));

      servico.configDashboard = {
        kpis: [...kpisManuais, ...kpisAutomaticos],
        graficos: graficosSalvos,
        indicadoresAutomaticosConfirmados: true,
        ultimaConfirmacaoAuto: new Date().toISOString(),
        // Manter cache da análise
        ultimaAnaliseAuto: servico.configDashboard?.ultimaAnaliseAuto,
        ultimaAnaliseData: servico.configDashboard?.ultimaAnaliseData,
      };

      await this.repository.save(servico);

      return res.json({
        message: `✅ ${kpisAutomaticos.length} indicador(es) automático(s) confirmado(s)!`,
        configDashboard: servico.configDashboard,
        totalKpis: kpisAutomaticos.length,
        totalGraficos: graficosSalvos.length,
      });
    } catch (error: any) {
      console.error('Erro ao confirmar indicadores automáticos:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao confirmar indicadores: ' + (error?.message || '') });
    }
  }

  /**
   * POST /api/contracts/:contractId/servicos/:id/reanalisar-colunas
   * Reanalisa as colunas após um novo upload e detecta o que mudou.
   * Útil quando o usuário faz um novo upload em um serviço que já tem indicadores.
   */
  async reanalisarColunas(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const contractId = req.params.contractId as string;

      const servico = await this.repository.findOne({ where: { id } });
      if (!servico) {
        return res.status(404).json({ error: 'Serviço não encontrado' });
      }

      if (!servico.padraoPlanilha?.colunas) {
        return res.status(400).json({ error: 'Nenhuma planilha vinculada' });
      }

      // Análise atual
      const colunasAtuais: string[] = servico.padraoPlanilha.colunas.map((c: any) => c.nome);
      const colunasAnteriores: string[] = servico.padraoPlanilha.colunasOriginais || [];

      const colunasAdicionadas = colunasAtuais.filter(c => !colunasAnteriores.includes(c));
      const colunasRemovidas = colunasAnteriores.filter(c => !colunasAtuais.includes(c));

      // Carregar dados para análise
      const dadosBrutos = await PlanilhaService.getDadosBrutosPorServico(id, 500);

      const analise = await AutoIndicatorService.analisar(
        id,
        contractId,
        servico.padraoPlanilha.colunas.map((c: any) => ({
          nome: c.nome,
          tipo: c.tipo as ColunaInfo['tipo'],
          valoresUnicos: c.valoresUnicos || 0,
          amostras: c.amostras || [],
          nulos: c.nulos || 0,
        })),
        dadosBrutos
      );

      return res.json({
        ...analise,
        colunasAdicionadas,
        colunasRemovidas,
        temMudancas: colunasAdicionadas.length > 0 || colunasRemovidas.length > 0,
        indicadores: AutoIndicatorService.converterParaKpiConfig(analise.indicadoresSugeridos),
        graficos: AutoIndicatorService.converterParaGraficoConfig(analise.graficosSugeridos),
      });
    } catch (error: any) {
      console.error('Erro ao reanalisar colunas:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao reanalisar colunas: ' + (error?.message || '') });
    }
  }

  /**
   * GET /api/contracts/:contractId/servicos/:id/config-resumo
   * Retorna a configuração de visibilidade/ordem das métricas do resumo executivo
   */
  async getConfigResumo(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const servico = await this.repository.findOne({ where: { id } });
      if (!servico) {
        return res.status(404).json({ error: 'Serviço não encontrado' });
      }

      const configResumo = servico.configDashboard?.configResumo || null;
      return res.json({ configResumo });
    } catch (error: any) {
      console.error('Erro ao buscar config resumo:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao buscar configuração do resumo' });
    }
  }

  /**
   * PUT /api/contracts/:contractId/servicos/:id/config-resumo
   * Salva a configuração de visibilidade/ordem das métricas do resumo executivo
   * Body: { 
   *   metricasAtivas: string[],   // keys das métricas visíveis
   *   ordem: string[],            // ordem das métricas (todas as keys)
   * }
   */
  async salvarConfigResumo(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const { metricasAtivas, ordem } = req.body;

      const servico = await this.repository.findOne({ where: { id } });
      if (!servico) {
        return res.status(404).json({ error: 'Serviço não encontrado' });
      }

      if (!servico.configDashboard) {
        servico.configDashboard = {};
      }

      servico.configDashboard.configResumo = {
        metricasAtivas: metricasAtivas || [],
        ordem: ordem || [],
        atualizadoEm: new Date().toISOString(),
      };

      await this.repository.save(servico);

      return res.json({
        message: 'Configuração do resumo executivo salva com sucesso',
        configResumo: servico.configDashboard.configResumo,
      });
    } catch (error: any) {
      console.error('Erro ao salvar config resumo:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao salvar configuração do resumo' });
    }
  }

  /**
   * PUT /api/contracts/:contractId/servicos/:id/colunas/tipo
   * Altera o tipo de uma coluna no padrão da planilha
   * Body: { nome, tipo }
   */
  async alterarTipoColuna(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const { nome, tipo } = req.body;

      if (!nome || !tipo) {
        return res.status(400).json({ error: 'Nome e tipo são obrigatórios' });
      }

      const tiposValidos = ['numero', 'texto', 'data', 'hora', 'desconhecido'];
      if (!tiposValidos.includes(tipo)) {
        return res.status(400).json({ error: 'Tipo inválido. Use: numero, texto, data, hora ou desconhecido' });
      }

      const servico = await this.repository.findOne({ where: { id } });
      if (!servico) {
        return res.status(404).json({ error: 'Serviço não encontrado' });
      }

      if (!servico.padraoPlanilha?.colunas) {
        return res.status(400).json({ error: 'Nenhuma planilha vinculada a este serviço' });
      }

      const colunas = servico.padraoPlanilha.colunas as any[];
      const colunaIdx = colunas.findIndex((c: any) => c.nome === nome);

      if (colunaIdx === -1) {
        return res.status(404).json({ error: `Coluna "${nome}" não encontrada` });
      }

      colunas[colunaIdx].tipo = tipo;
      servico.padraoPlanilha.colunas = colunas;

      await this.repository.save(servico);

      return res.json({
        message: `Tipo da coluna "${nome}" alterado para "${tipo}"`,
        colunas,
      });
    } catch (error: any) {
      console.error('Erro ao alterar tipo da coluna:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao alterar tipo da coluna' });
    }
  }

  /**
   * POST /api/contracts/:contractId/servicos/:id/kpi-preview
   * Preview de KPI com fórmula — testa a expressão contra dados reais
   * Body: { expressao, valoresFixos?, filtros? }
   *   filtros: { dataInicio?, dataFim?, placa?, regional?, tipoCaminhao? }
   */
  async previewKpi(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const contractId = req.params.contractId as string;
      const { expressao, valoresFixos: valoresFixosBody, filtros: filtrosBody } = req.body;

      if (!expressao) {
        return res.status(400).json({ error: 'Expressão é obrigatória' });
      }

      // Validar expressão
      const validacao = validarExpressao(expressao);
      if (!validacao.valido) {
        return res.status(400).json({ error: validacao.erro, valido: false });
      }

      // Carregar dados brutos (sem limite — fonte de verdade)
      const dados = await PlanilhaService.getDadosBrutosPorServico(id, 999999);
      if (!dados || dados.length === 0) {
        return res.json({
          valido: true,
          valor: null,
          totalRegistros: 0,
          mensagem: 'Nenhum dado disponível para calcular. Faça upload primeiro.',
        });
      }

      // Aplicar filtros se enviados
      const dadosParaCalculo = filtrosBody ? this.aplicarFiltros(dados, {
        dataInicio: (filtrosBody as any).dataInicio,
        dataFim: (filtrosBody as any).dataFim,
        placa: (filtrosBody as any).placa,
        regional: (filtrosBody as any).regional,
        tipoCaminhao: (filtrosBody as any).tipoCaminhao,
      }) : dados;

      const [contract, servico] = await Promise.all([
        this.contractRepo.findOne({ where: { id: contractId } }),
        this.repository.findOne({ where: { id } }),
      ]);

      const valoresFixos: Record<string, number> = {
        ...buildValoresFixosFaturamento(contract, servico?.configFaturamento),
        ...(valoresFixosBody || {}),
      };

      // Calcular
      const dadosNorm = normalizarDados(dadosParaCalculo);
      const valor = calcularKpiComFormula(expressao, dadosNorm, valoresFixos);

      // Extrair colunas usadas na expressão para debug
      const colunasUsadas: string[] = [];
      const funcRegex = /(?:SUM|AVG|MIN|MAX|COUNT(?:\s+DISTINCT)?)\s*\(\s*([^)]+)\s*\)/gi;
      let match;
      while ((match = funcRegex.exec(expressao)) !== null) {
        const col = match[1].trim();
        if (col !== '*' && !colunasUsadas.includes(col)) {
          colunasUsadas.push(col);
        }
      }

      // Verificar se as colunas existem nos dados
      const colunasEncontradas: string[] = [];
      const colunasAusentes: string[] = [];
      for (const col of colunasUsadas) {
        const encontrou = dadosNorm.some(d => {
          const chaves = Object.keys(d);
          const normalizada = col.trim().toUpperCase().replace(/\s+/g, '');
          return chaves.some(k => k.trim().toUpperCase().replace(/\s+/g, '') === normalizada);
        });
        if (encontrou) colunasEncontradas.push(col);
        else colunasAusentes.push(col);
      }

      return res.json({
        valido: true,
        valor: Math.round(valor * 100) / 100,
        totalRegistros: dadosParaCalculo.length,
        totalRegistrosSemFiltro: dados.length,
        colunasUsadas,
        colunasEncontradas,
        colunasAusentes,
        expressao,
        valoresDisponiveis: Object.keys(valoresFixos).length > 0 ? valoresFixos : undefined,
      });
    } catch (error: any) {
      console.error('Erro no preview KPI:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao calcular preview: ' + (error?.message || 'erro desconhecido') });
    }
  }

  /**
   * GET /api/contracts/:contractId/servicos-kpis
   * Retorna KPIs de todos os serviços de um contrato (exceto o serviço atual, se informado)
   * Query: ?excluirServicoId=xxx
   */
  async listarKpisDeServicos(req: Request, res: Response): Promise<any> {
    try {
      const contractId = req.params.contractId as string;
      const excluirServicoId = req.query.excluirServicoId as string | undefined;

      const servicos = await this.repository.find({
        where: { contract_id: contractId },
        order: { nome: 'ASC' },
      });

      const servicosComKpis = servicos
        .filter(s => excluirServicoId ? s.id !== excluirServicoId : true)
        .map(s => ({
          id: s.id,
          nome: s.nome,
          kpis: (s.configDashboard?.kpis || []).filter((k: any) => k.ativo),
          totalKpis: (s.configDashboard?.kpis || []).filter((k: any) => k.ativo).length,
        }))
        .filter(s => s.totalKpis > 0);

      return res.json({ servicos: servicosComKpis });
    } catch (error) {
      console.error('Erro ao listar KPIs de serviços:', error);
      return res.status(500).json({ error: 'Erro ao carregar KPIs dos serviços' });
    }
  }

    /**
   * ⚡ OTIMIZADO: usa cache + agregações SQL (getMetricasAgregadasPorServico)
   * Só carrega dados brutos quando necessário (KPIs com fórmula).
   * Reduz de 999999 para 5000 registros quando carrega.
   */
  async getKpiValores(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const contractId = req.params.contractId as string;

      // ═══════════════════════════════════════════════════════════
      // 1. GERAR CACHE KEY
      // ═══════════════════════════════════════════════════════════
      const cacheParts = [
        'kpi-valores', id, contractId,
        req.query.dataInicio || '', req.query.dataFim || '',
        req.query.placa || '', req.query.regional || '',
        req.query.tipoCaminhao || '', req.query.uploadId || '',
      ];
      for (const [key, value] of Object.entries(req.query)) {
        if (key.startsWith('filtro_') && typeof value === 'string') {
          cacheParts.push(key + '=' + value);
        }
      }
      const cacheKey = cacheParts.join(':');

      const cached = getCache<any>(cacheKey);
      if (cached) return res.json(cached);

      // ═══════════════════════════════════════════════════════════
      // 2. CARREGAR SERVICO + CONTRATO
      // ═══════════════════════════════════════════════════════════
      const [servico, contract] = await Promise.all([
        this.repository.findOne({ where: { id } }),
        this.contractRepo.findOne({ where: { id: contractId } }),
      ]);

      if (!servico) {
        return res.status(404).json({ error: 'Servico nao encontrado' });
      }

      // ═══════════════════════════════════════════════════════════
      // 3. VALORES FIXOS — configFaturamento do serviço tem prioridade
      // ═══════════════════════════════════════════════════════════
      const cfgFat = servico.configFaturamento;
      const valoresFixos = buildValoresFixosFaturamento(
        contract,
        cfgFat?.ativo ? cfgFat : null
      );
      const temValor = Object.keys(valoresFixos).length > 0;

      // ═══════════════════════════════════════════════════════════
      // 4. JUNTAR KPIs DO CONTRATO + SERVICO
      // ═══════════════════════════════════════════════════════════
      const kpisContrato: any[] = (contract?.kpisConfig || [])
        .filter((k: any) => k.ativo !== false)
        .map((k: any) => ({ ...k, _origem: 'contrato' }));
      const kpisServico: any[] = (servico.configDashboard?.kpis || [])
        .filter((k: any) => k.ativo !== false)
        .map((k: any) => ({ ...k, _origem: 'servico' }));
      const todosKpis = [...kpisContrato, ...kpisServico];

      // ═══════════════════════════════════════════════════════════
      // 5. METRICAS EXECUTIVAS VIA SQL AGREGADO (banco de dados)
      // ═══════════════════════════════════════════════════════════
      const metricasAgregadas = await PlanilhaService.getMetricasAgregadasPorServico(id, {
        dataInicio: req.query.dataInicio as string,
        dataFim: req.query.dataFim as string,
      });

      const viagens = metricasAgregadas.viagens || 0;
      const pesoTotalTon = metricasAgregadas.pesoTotalTon || 0;
      const kmTotal = metricasAgregadas.kmTotal || 0;
      const horasProdutivas = metricasAgregadas.horasProdutivas || 0;
      const coletoresAtivos = metricasAgregadas.coletoresAtivos || 0;

      // Resposta vazia se nao houver dados
      if (viagens === 0) {
        const emptyResponse = {
          kpis: todosKpis.map((k: any) => ({
            id: k.id, nome: k.label || k.nome,
            valor: null, formatado: '-',
            formato: k.formato || 'numero', origem: k._origem,
          })),
          metrica_executiva: {
            viagens: 0, qtdColetores: 0, pesoTotalTon: 0, kmTotal: 0,
            horasProdutivas: 0, horasMediaRotas: 0, faturamento: 0, fatPorTipo: {},
            tonKm: 0, prodColetor: 0, kmMedioViagem: 0, tonMediaColeta: 0,
            receitaKm: 0, receitaHora: 0, temValor: false,
          },
        };
        setCache(cacheKey, emptyResponse);
        return res.json(emptyResponse);
      }

      // ═══════════════════════════════════════════════════════════
      // 6. CARREGAR DADOS apenas se houver KPIs com formula
      // ═══════════════════════════════════════════════════════════
      const kpisComFormula = todosKpis.filter((k: any) => k.expressao && k.expressao.trim());
      const kpisComAgregacao = todosKpis.filter((k: any) => !k.expressao && k.agregacao);
      const precisaDados = kpisComFormula.length > 0 || kpisComAgregacao.length > 0 || viagens > 0;

      let dadosNorm: Record<string, any>[] = [];
      let colunasDetectadas: Record<string, string> = {};

      if (precisaDados) {
        // Carrega no maximo 5000 registros para agregacoes em JS
        const dados = await PlanilhaService.getDadosBrutosPorServico(id, 5000);

        // Aplicar filtros
        const filtros: any = {
          dataInicio: req.query.dataInicio as string | undefined,
          dataFim: req.query.dataFim as string | undefined,
          placa: req.query.placa as string | undefined,
          regional: req.query.regional as string | undefined,
          tipoCaminhao: req.query.tipoCaminhao as string | undefined,
          uploadId: req.query.uploadId ? parseInt(req.query.uploadId as string) : undefined,
        };
        const filtrosDinamicos: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.query)) {
          if (key.startsWith('filtro_') && typeof value === 'string' && value.trim()) {
            filtrosDinamicos[key.replace('filtro_', '')] = value.trim();
          }
        }
        if (Object.keys(filtrosDinamicos).length > 0) filtros.filtrosDinamicos = filtrosDinamicos;

        const dadosFiltrados = this.aplicarFiltros(dados || [], filtros);
        dadosNorm = normalizarDados(dadosFiltrados);

        // Detectar colunas UMA VEZ com cache
        colunasDetectadas = detectarTodasColunas(dadosNorm, id);
      }

      const colunasServico = (servico.padraoPlanilha?.colunas || []).map((c: any) => c.nome);

      // ═══════════════════════════════════════════════════════════
      // 7. RESOLVER PLACEHOLDERS
      // ═══════════════════════════════════════════════════════════
      const resolverPlaceholdersNaFormula = (formula: string): string => {
        const PH_MAP: Record<string, string[]> = {
          'PESO_PLACEHOLDER': ['PESO TOTAL', 'PESO', 'PESOTOTAL', 'PESO_TOTAL', 'PESO_BRUTO', 'PESO COLETADO', 'PESO (KG)', 'PESO COLETA'],
          'KM_PLACEHOLDER': ['KM TOTAL', 'KM', 'KMTOTAL', 'KM_TOTAL', 'QUILOMETRO', 'DISTANCIA', 'KM RODADO'],
          'PLACA_PLACEHOLDER': ['PLACA', 'CAMINHAO', 'VEICULO', 'COLETOR', 'COLETORA', 'EQUIPAMENTO'],
          'TIPO_PLACEHOLDER': ['TIPO CAMINHAO', 'TIPO_CAMINHAO', 'CAMINHAO', 'TIPO DE CAMINHAO', 'TIPODECAMINHAO'],
          'HORA_PLACEHOLDER': ['HORA SAIDA', 'HORA', 'HORASAIDA', 'HORA_SAIDA', 'HR SAIDA BASE'],
          'HORA_CHEGADA_PLACEHOLDER': ['HORA CHEGADA', 'HORACHEGADA', 'HORA_CHEGADA', 'HR CHEGA BASE', 'HORA CHEGADA BASE'],
          'VOLUME_PLACEHOLDER': ['VOLUME', 'VOLUME M3', 'VOLUME_M3', 'M3', 'METRO CUBICO'],
          'FUNCIONARIO_PLACEHOLDER': ['FUNCIONARIO', 'NOME', 'OPERADOR', 'MOTORISTA'],
          'AREA_PLACEHOLDER': ['AREA_ROCADA', 'AREA_CAPINADA', 'AREA', 'METRAGEM', 'M2'],
          'BAIRRO_PLACEHOLDER': ['BAIRRO', 'LOCAL', 'REGIONAL', 'REGIAO', 'SETOR', 'ROTA', 'DESTINO'],
          'ARVORES_PLACEHOLDER': ['ARVORES_PODADAS', 'QTDE ARVORES', 'ARVORES', 'N ARVORES'],
          'COLETOR_PLACEHOLDER': ['COLETOR', 'MOTORISTA', 'FUNCIONARIO', 'NOME'],
          'ROTA_PLACEHOLDER': ['ROTA', 'BAIRRO', 'REGIAO', 'SETOR', 'LOCAL', 'REGIONAL', 'DESTINO'],
          'PESO_KG_PLACEHOLDER': ['PESO KG', 'PESO (KG)', 'PESO_KG', 'PESO EM KG'],
          'DISTANCIA_KM_PLACEHOLDER': ['DISTANCIA KM', 'DISTANCIA (KM)', 'DIST_KM', 'DISTANCIA_KM'],
          'TIPO_CAMINHAO_PLACEHOLDER': ['TIPO', 'TIPO CAMINHAO', 'TIPOCAMINHAO'],
        };
        const normalizar = (s: string) => s.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '');
        const colunasNorm = colunasServico.map((c: any) => ({ original: c, norm: normalizar(c) }));
        let resultado = formula;
        for (const [phNome, candidatas] of Object.entries(PH_MAP)) {
          if (!resultado.includes(phNome)) continue;
          let colunaReal = '';
          for (const cand of candidatas) {
            const candNorm = normalizar(cand);
            for (const cn of colunasNorm) {
              if (cn.norm === candNorm || cn.norm.includes(candNorm) || candNorm.includes(cn.norm)) {
                colunaReal = cn.original; break;
              }
            }
            if (colunaReal) break;
          }
          if (colunaReal) {
            const regex = new RegExp(phNome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            resultado = resultado.replace(regex, colunaReal);
          }
        }
        return resultado;
      };

      // ═══════════════════════════════════════════════════════════
      // 8. CALCULAR CADA KPI
      // ═══════════════════════════════════════════════════════════
      const resultadosKpis = todosKpis.map((kpi: any) => {
        try {
          let expressao = kpi.expressao || '';
          const expressaoResolvida = resolverPlaceholdersNaFormula(expressao);
          if (expressaoResolvida !== expressao) expressao = expressaoResolvida;

          let valor: number;

          if (expressao.trim() && dadosNorm.length > 0) {
            const kpiValoresFixos = { ...valoresFixos };
            if (kpi.valoresFixos && typeof kpi.valoresFixos === 'object') {
              for (const [key, value] of Object.entries(kpi.valoresFixos)) {
                if (value !== null && value !== undefined && Number(value) > 0) {
                  kpiValoresFixos[key] = Number(value);
                }
              }
            }
            const resultado = calcularExpressao(expressao, { dados: dadosNorm, valoresFixos: kpiValoresFixos });
            valor = Math.round(resultado.valor * 100) / 100;
          } else if (kpi.agregacao === 'count' && dadosNorm.length > 0) {
            const colNome = kpi.coluna2 || kpi.nome;
            if (!colNome) {
              valor = viagens;
            } else {
              const unicos = new Set(
                dadosNorm
                  .map((d: any) => encontrarValorColuna(d, colNome))
                  .filter((v: any) => v !== null && v !== undefined && v !== '')
                  .map((v: any) => String(v).trim())
              );
              valor = unicos.size;
            }
          } else if (!expressao.trim() && dadosNorm.length > 0) {
            const colNome = kpi.coluna2 || kpi.nome;
            if (!colNome) {
              valor = 0;
            } else {
              const vals = dadosNorm
                .map((d: any) => Number(encontrarValorColuna(d, colNome)))
                .filter((n: any) => !isNaN(n));
              if (vals.length === 0) {
                valor = 0;
              } else {
                switch (kpi.agregacao) {
                  case 'sum': valor = vals.reduce((a: number, b: number) => a + b, 0); break;
                  case 'avg': valor = vals.reduce((a: number, b: number) => a + b, 0) / vals.length; break;
                  case 'min': valor = Math.min(...vals); break;
                  case 'max': valor = Math.max(...vals); break;
                  default: valor = vals.reduce((a: number, b: number) => a + b, 0);
                }
              }
            }
          } else {
            valor = 0;
          }

          return {
            id: kpi.id,
            nome: kpi.label || kpi.nome,
            valor: valor !== null ? Math.round(valor * 100) / 100 : null,
            formatado: valor !== null ? formatarValor(valor, kpi.formato || 'numero') : '-',
            formato: kpi.formato || 'numero',
            origem: kpi._origem,
          };
        } catch (err: any) {
          return {
            id: kpi.id, nome: kpi.label || kpi.nome,
            valor: null, formatado: '-',
            formato: kpi.formato || 'numero',
            origem: kpi._origem,
            erro: err.message,
          };
        }
      });

      // ═══════════════════════════════════════════════════════════
      // 9. METRICAS EXECUTIVAS (derivadas das agregacoes SQL)
      // ═══════════════════════════════════════════════════════════
      const colPeso = (cfgFat?.ativo && cfgFat?.colunaQuantidade)
        ? cfgFat.colunaQuantidade
        : (colunasDetectadas.colPeso || '');
      const colKm = colunasDetectadas.colKm || '';
      const colPlaca = colunasDetectadas.colPlaca || '';
      const colTipo = (cfgFat?.ativo && cfgFat?.colunaTipoCaminhao)
        ? cfgFat.colunaTipoCaminhao
        : (colunasDetectadas.colTipo || '');

      let faturamento = 0;
      const fatPorTipo: Record<string, number> = {};
      const FALLBACK_VALOR_TONELADA = 80;

      if (temValor && dadosNorm.length > 0 && colPeso) {
        for (const d of dadosNorm) {
          const tipoRaw = colTipo ? String(encontrarValorColuna(d, colTipo) || '').toUpperCase().trim() : '';
          if (/^\d+$/.test(tipoRaw)) continue;
          const peso = Number(encontrarValorColuna(d, colPeso)) || 0;
          if (peso <= 0) continue;
          const toneladas = peso / 1000;
          const mapTipoValor: Record<string, string> = { 'TRUCK': 'VALOR_TRUCK', 'TOCO': 'VALOR_TOCO', 'MINI': 'VALOR_MINI' };
          const tipoKey = Object.keys(mapTipoValor).find(k => tipoRaw.includes(k) || k.includes(tipoRaw));
          const valorUnitario = tipoKey
            ? (valoresFixos[mapTipoValor[tipoKey]] ?? valoresFixos['VALOR_TONELADA'] ?? FALLBACK_VALOR_TONELADA)
            : (valoresFixos['VALOR_TONELADA'] ?? FALLBACK_VALOR_TONELADA);
          const receita = toneladas * valorUnitario;
          faturamento += receita;
          if (tipoRaw.length > 0) fatPorTipo[tipoRaw] = (fatPorTipo[tipoRaw] || 0) + receita;
        }
        if (faturamento === 0 && colPeso) {
          const totalKg = dadosNorm.reduce((s: number, d: any) => s + (Number(encontrarValorColuna(d, colPeso)) || 0), 0);
          faturamento = totalKg / 1000 * (valoresFixos['VALOR_TONELADA'] || FALLBACK_VALOR_TONELADA);
        }
      } else if (colPeso && dadosNorm.length > 0) {
        const totalKg = dadosNorm.reduce((s: number, d: any) => s + (Number(encontrarValorColuna(d, colPeso)) || 0), 0);
        faturamento = totalKg / 1000 * FALLBACK_VALOR_TONELADA;
      }
      faturamento = Math.round(faturamento * 100) / 100;

      let horasProdutivasFinal = horasProdutivas;
      if (dadosNorm.length > 0) {
        const horasCalculadas = calcularHorasProdutivasTotal(dadosNorm);
        if (horasCalculadas > 0) horasProdutivasFinal = horasCalculadas;
      }

      const tonKm = kmTotal > 0 ? Math.round((pesoTotalTon / kmTotal) * 10000) / 10000 : 0;
      const prodColetor = coletoresAtivos > 0 ? Math.round((pesoTotalTon / coletoresAtivos) * 100) / 100 : 0;
      const kmMedioViagem = viagens > 0 ? Math.round((kmTotal / viagens) * 100) / 100 : 0;
      const tonMediaColeta = viagens > 0 ? Math.round((pesoTotalTon / viagens) * 100) / 100 : 0;
      const receitaKm = kmTotal > 0 ? Math.round((faturamento / kmTotal) * 100) / 100 : 0;
      const receitaHora = horasProdutivasFinal > 0
        ? Math.round((faturamento / horasProdutivasFinal) * 100) / 100
        : 0;

      const configResumoBase = servico.configDashboard?.configResumo || contract?.configResumo || null;
      const colunasEncontradasResumo: Record<string, { encontrada: boolean; colunaUsada: string; precisaColuna: string[] }> = {
        viagens: { encontrada: true, colunaUsada: '', precisaColuna: [] },
        qtdColetores: { encontrada: colPlaca !== '', colunaUsada: colPlaca, precisaColuna: ['PLACA', 'CAMINHAO'] },
        pesoTotalTon: { encontrada: colPeso !== '', colunaUsada: colPeso, precisaColuna: ['PESO TOTAL'] },
        kmTotal: { encontrada: colKm !== '', colunaUsada: colKm, precisaColuna: ['KM TOTAL'] },
        horasProdutivas: { encontrada: horasProdutivasFinal > 0, colunaUsada: '', precisaColuna: ['HORA SAIDA BASE', 'HORA CHEGADA BASE', 'HORAS FORA UNIDADE'] },
        faturamento: { encontrada: colPeso !== '' && temValor, colunaUsada: colPeso, precisaColuna: ['PESO TOTAL'] },
        tonKm: { encontrada: colPeso !== '' && colKm !== '', colunaUsada: colPeso + '/' + colKm, precisaColuna: ['PESO TOTAL', 'KM TOTAL'] },
        prodColetor: { encontrada: colPeso !== '', colunaUsada: colPeso, precisaColuna: ['PESO TOTAL'] },
        kmMedioViagem: { encontrada: colKm !== '', colunaUsada: colKm, precisaColuna: ['KM TOTAL'] },
        tonMediaColeta: { encontrada: colPeso !== '', colunaUsada: colPeso, precisaColuna: ['PESO TOTAL'] },
        receitaKm: { encontrada: colPeso !== '' && colKm !== '' && temValor, colunaUsada: colPeso + '/' + colKm, precisaColuna: ['PESO TOTAL', 'KM TOTAL'] },
        receitaHora: { encontrada: colPeso !== '' && horasProdutivasFinal > 0 && temValor, colunaUsada: colPeso, precisaColuna: ['PESO TOTAL', 'HORA SAIDA BASE', 'HORA CHEGADA BASE'] },
      };

      const configResumoFinal = configResumoBase
        ? { ...configResumoBase, colunasEncontradas: colunasEncontradasResumo }
        : {
            metricasAtivas: Object.entries(colunasEncontradasResumo).filter(([_, v]) => v.encontrada).map(([k]) => k),
            ordem: Object.keys(colunasEncontradasResumo),
            colunasEncontradas: colunasEncontradasResumo,
          };

      const response = {
        kpis: resultadosKpis,
        metrica_executiva: {
          viagens,
          qtdColetores: coletoresAtivos,
          pesoTotalTon,
          kmTotal: Math.round(kmTotal * 100) / 100,
          horasProdutivas: horasProdutivasFinal,
          horasMediaRotas: viagens > 0 ? Math.round((horasProdutivasFinal / viagens) * 100) / 100 : 0,
          faturamento,
          fatPorTipo,
          tonKm,
          prodColetor,
          kmMedioViagem,
          tonMediaColeta,
          receitaKm,
          receitaHora,
          temValor,
        },
        configResumo: configResumoFinal,
      };

      setCache(cacheKey, response);
      return res.json(response);
    } catch (error: any) {
      console.error('Erro ao calcular kpi-valores:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao calcular valores dos KPIs' });
    }
  }

  /**
   * GET /api/contracts/:contractId/servicos/:id/kpi-exec-metrics
   * Retorna metricas executivas (tonelagem, KM, horas, faturamento, receita/km, etc.)
   * Calculadas pelo backend usando FormulaEngine
   */
  async getExecMetrics(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const contractId = req.params.contractId as string;

      // Extrair filtros dos query params
      const filtros = {
        dataInicio: req.query.dataInicio as string | undefined,
        dataFim: req.query.dataFim as string | undefined,
        placa: req.query.placa as string | undefined,
        regional: req.query.regional as string | undefined,
        tipoCaminhao: req.query.tipoCaminhao as string | undefined,
        uploadId: req.query.uploadId ? parseInt(req.query.uploadId as string) : undefined,
      };

      // Carregar dados brutos (sem limite — fonte de verdade)
      const dados = await PlanilhaService.getDadosBrutosPorServico(id, 999999);

      // Aplicar filtros
      const dadosFiltrados = this.aplicarFiltros(dados || [], filtros);
      const [servicoEC, contract] = await Promise.all([
        this.repository.findOne({ where: { id } }),
        this.contractRepo.findOne({ where: { id: contractId } }),
      ]);

      if (!dadosFiltrados || dadosFiltrados.length === 0) {
        return res.json({
          viagens: 0, qtdColetores: 0, pesoTotalTon: 0, kmTotal: 0,
          horasProdutivas: 0, faturamento: 0, fatPorTipo: {},
          tonKm: 0, prodColetor: 0, kmMedioViagem: 0, tonMediaColeta: 0,
          receitaKm: 0, receitaHora: 0, temValor: false, coletoresList: [],
        });
      }

      // â­ Verificar configFaturamento do serviÃ§o (substitui valores do contrato quando ativo)
      const cfgFat = servicoEC?.configFaturamento;
      const cfgFatAtivo = cfgFat && cfgFat.ativo === true;

      // Valores fixos: priorizar configFaturamento do serviÃ§o quando ativo
      const valoresFixos: Record<string, number> = {};
      Object.assign(valoresFixos, buildValoresFixosFaturamento(contract, cfgFatAtivo ? cfgFat : null));

      const temValor = Object.keys(valoresFixos).length > 0;

      // Normalizar dados (filtrados)
      const dadosNorm = normalizarDados(dadosFiltrados);

      // Detectar colunas dinamicamente
      const colPeso = detectarColuna(dadosNorm, ['PESO TOTAL', 'PESO', 'PESOTOTAL', 'PESO_TOTAL', 'pesoTotal']);
      const colKm = detectarColuna(dadosNorm, ['KM TOTAL', 'KM', 'KMTOTAL', 'KM_TOTAL', 'kmTotal', 'QUILOMETRO', 'DISTANCIA']);
      const colPlaca = detectarColuna(dadosNorm, ['PLACA', 'CAMINHAO', 'VEICULO', 'COLETOR', 'COLETORA', 'EQUIPAMENTO', 'placa']);
      const colTipo = detectarColuna(dadosNorm, ['CAMINHAO', 'TIPO CAMINHAO', 'TIPO_CAMINHAO', 'tipoCaminhao', 'CAMINHÃO', 'TIPO DE CAMINHAO', 'TIPO DE CAMINHÃO', 'TIPODECAMINHAO']);
      const colNroColetores = detectarColuna(dadosNorm, ['Nº DE COLETORES', 'NDECOLETORES', 'NUMERO DE COLETORES', 'NÚMERO DE COLETORES', 'QTDE COLETORES', 'NRO COLETORES', 'QTD COLETORES']);

      // Metricas basicas
      const viagens = dadosNorm.length;

      // Coletores unicos
      const coletoresSet = new Set<string>();
      for (const d of dadosNorm) {
        const v = encontrarValorColuna(d, colPlaca);
        if (v !== undefined && v !== null && v !== '') coletoresSet.add(String(v).trim());
      }
      const qtdColetores = coletoresSet.size;
      const coletoresList = Array.from(coletoresSet).sort();

      // KM total
      let kmTotal = 0;
      for (const d of dadosNorm) {
        kmTotal += Number(encontrarValorColuna(d, colKm)) || 0;
      }

      // Peso total em kg
      let pesoTotalKg = 0;
      for (const d of dadosNorm) {
        pesoTotalKg += Number(encontrarValorColuna(d, colPeso)) || 0;
      }
      const pesoTotalTon = pesoTotalKg / 1000;

      const horasProdutivas = calcularHorasProdutivasTotal(dadosNorm);
      // Faturamento estimado por tipo de caminhao
      let faturamento = 0;
      const fatPorTipo: Record<string, number> = {};
      const mapTipoValor: Record<string, string> = {
        'TRUCK': 'VALOR_TRUCK', 'TOCO': 'VALOR_TOCO', 'MINI': 'VALOR_MINI',
      };
      const FALLBACK_VALOR_TONELADA = 80;

      if (temValor) {
        for (const d of dadosNorm) {
          const tipoRaw = String(encontrarValorColuna(d, colTipo) || '').toUpperCase().trim();
          // Ignorar valores numericos (ex: IDs, linhas) que nao sao tipos de caminhao
          if (/^\d+$/.test(tipoRaw)) continue;
          const peso = Number(encontrarValorColuna(d, colPeso)) || 0;
          if (peso <= 0) continue;

          const toneladas = peso / 1000;
          let valorUnitario = 0;

          // Tenta match por tipo especifico
          const tipoKey = Object.keys(mapTipoValor).find(k =>
            tipoRaw.includes(k) || k.includes(tipoRaw)
          );
          if (tipoKey) {
            valorUnitario = valoresFixos[mapTipoValor[tipoKey]] ?? valoresFixos['VALOR_TONELADA'] ?? FALLBACK_VALOR_TONELADA;
          } else {
            valorUnitario = valoresFixos['VALOR_TONELADA'] ?? FALLBACK_VALOR_TONELADA;
          }

          const receita = toneladas * valorUnitario;
          faturamento += receita;
          if (tipoRaw.length > 0) fatPorTipo[tipoRaw] = (fatPorTipo[tipoRaw] || 0) + receita;
        }

        // Fallback: se nao encontrou nenhum tipo, calcula tudo como VALOR_TONELADA
        if (faturamento === 0) {
          const totalKg = dadosNorm.reduce((s, d) => s + (Number(encontrarValorColuna(d, colPeso)) || 0), 0);
          faturamento = totalKg / 1000 * (valoresFixos['VALOR_TONELADA'] || FALLBACK_VALOR_TONELADA);
        }
      } else if (colPeso !== '') {
        const totalKg = dadosNorm.reduce((s, d) => s + (Number(encontrarValorColuna(d, colPeso)) || 0), 0);
        faturamento = totalKg / 1000 * FALLBACK_VALOR_TONELADA;
      }

      const tonKm = kmTotal > 0 ? pesoTotalTon / kmTotal : 0;
      let totalColetores = qtdColetores;
      if (colNroColetores !== '') {
        totalColetores = dadosNorm.reduce((s, d) => s + (Number(encontrarValorColuna(d, colNroColetores)) || 0), 0);
      }
      const prodColetor = totalColetores > 0 ? pesoTotalTon / totalColetores : 0;
      const kmMedioViagem = viagens > 0 ? kmTotal / viagens : 0;
      const tonMediaColeta = viagens > 0 ? pesoTotalTon / viagens : 0;
      const receitaKm = kmTotal > 0 ? faturamento / kmTotal : 0;
      const receitaHora = horasProdutivas > 0 ? faturamento / horasProdutivas : 0;

      return res.json({
        viagens,
        qtdColetores,
        pesoTotalTon: Math.round(pesoTotalTon * 100) / 100,
        kmTotal: Math.round(kmTotal * 100) / 100,
        horasProdutivas: Math.round(horasProdutivas * 100) / 100,
        horasMediaRotas: viagens > 0 ? Math.round((horasProdutivas / viagens) * 100) / 100 : 0,
        faturamento: Math.round(faturamento * 100) / 100,
        fatPorTipo,
        tonKm: Math.round(tonKm * 10000) / 10000,
        prodColetor: Math.round(prodColetor * 100) / 100,
        kmMedioViagem: Math.round(kmMedioViagem * 100) / 100,
        tonMediaColeta: Math.round(tonMediaColeta * 100) / 100,
        receitaKm: Math.round(receitaKm * 100) / 100,
        receitaHora: Math.round(receitaHora * 100) / 100,
        temValor,
        coletoresList,
      });
    } catch (error: any) {
      console.error('Erro ao calcular exec metrics:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao calcular metricas executivas' });
    }
  }

  /**
   * POST /api/contracts/:contractId/servicos/:id/kpi-calculate
   * Calcula multiplos KPIs de uma vez no backend com suporte a debug
   * Body: { kpis: [{ expressao?, agregacao?, coluna?, formato?, valoresFixos? }], debug?: boolean }
   */
  async calculateKpis(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const contractId = req.params.contractId as string;
      const { kpis: kpisBody, debug = false } = req.body;

      if (!kpisBody || !Array.isArray(kpisBody) || kpisBody.length === 0) {
        return res.status(400).json({ error: 'Lista de KPIs e obrigatoria' });
      }

      const dados = await PlanilhaService.getDadosBrutosPorServico(id, 999999);
      const [contract, servico] = await Promise.all([
        this.contractRepo.findOne({ where: { id: contractId } }),
        this.repository.findOne({ where: { id } }),
      ]);

      if (!dados || dados.length === 0) {
        return res.json({
          resultados: kpisBody.map(() => ({ valor: null, formatado: null, erro: 'Nenhum dado disponivel' })),
          totalRegistros: 0,
        });
      }

      const valoresFixosContrato = buildValoresFixosFaturamento(contract, servico?.configFaturamento);

      const dadosNorm = normalizarDados(dados);

      const resultados = kpisBody.map((kpi: any) => {
        try {
          // Merge valores fixos
          const todosValoresFixos = { ...valoresFixosContrato, ...(kpi.valoresFixos || {}) };

          if (kpi.expressao && kpi.expressao.trim()) {
            // KPI com formula > usa FormulaEngine completo
            const resultado = calcularExpressao(kpi.expressao, {
              dados: dadosNorm,
              valoresFixos: todosValoresFixos,
              debug: debug,
            });

            return {
              valor: Math.round(resultado.valor * 100) / 100,
              formatado: resultado.valor !== 0
                ? formatarValor(resultado.valor, kpi.formato || 'numero')
                : '0',
              ...(debug ? { debug: resultado.debug } : {}),
            };
          }

          // KPI com agregacao simples
          const coluna = kpi.coluna || kpi.nome || '';
          if (!coluna) {
            return { valor: null, formatado: null, erro: 'Coluna nao especificada' };
          }

          const valores = dadosNorm
            .map(d => Number(encontrarValorColuna(d, coluna)))
            .filter(n => !isNaN(n));

          if (valores.length === 0) {
            return { valor: 0, formatado: '0' };
          }

          let valorBase = 0;
          switch (kpi.agregacao) {
            case 'sum': valorBase = valores.reduce((a: number, b: number) => a + b, 0); break;
            case 'avg': valorBase = valores.reduce((a: number, b: number) => a + b, 0) / valores.length; break;
            case 'min': valorBase = Math.min(...valores); break;
            case 'max': valorBase = Math.max(...valores); break;
            case 'count': valorBase = valores.length; break;
            default: valorBase = valores.reduce((a: number, b: number) => a + b, 0);
          }

          return {
            valor: Math.round(valorBase * 100) / 100,
            formatado: formatarValor(valorBase, kpi.formato || 'numero'),
          };
        } catch (err: any) {
          return { valor: null, formatado: null, erro: err.message || 'Erro no calculo' };
        }
      });

      return res.json({ resultados, totalRegistros: dados.length });
    } catch (error: any) {
      console.error('Erro ao calcular KPIs batch:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao calcular KPIs' });
    }
  }

  /**
   * Aplica filtros nos dados brutos antes do cálculo de KPIs
   */
  private aplicarFiltros(dados: Record<string, any>[], filtros: {
    dataInicio?: string;
    dataFim?: string;
    placa?: string;
    regional?: string;
    tipoCaminhao?: string;
    uploadId?: number;
    filtrosDinamicos?: Record<string, string>;
  }): Record<string, any>[] {
    let resultados = [...dados];

    if (filtros.dataInicio) {
      const inicio = new Date(filtros.dataInicio);
      resultados = resultados.filter(d => {
        for (const chave of Object.keys(d)) {
          const chaveNorm = chave.toUpperCase().replace(/\s+/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (chaveNorm.includes('DATA') || chaveNorm.includes('DIA')) {
            const val = d[chave];
            if (val) {
              const data = val instanceof Date ? val : new Date(val);
              if (!isNaN(data.getTime()) && data >= inicio) return true;
            }
          }
        }
        return true;
      });
    }

    if (filtros.dataFim) {
      const fim = new Date(filtros.dataFim);
      fim.setHours(23, 59, 59, 999);
      resultados = resultados.filter(d => {
        for (const chave of Object.keys(d)) {
          const chaveNorm = chave.toUpperCase().replace(/\s+/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (chaveNorm.includes('DATA') || chaveNorm.includes('DIA')) {
            const val = d[chave];
            if (val) {
              const data = val instanceof Date ? val : new Date(val);
              if (!isNaN(data.getTime()) && data <= fim) return true;
            }
          }
        }
        return true;
      });
    }

    if (filtros.placa) {
      const placaFiltro = filtros.placa.toUpperCase().trim();
      resultados = resultados.filter(d => {
        for (const chave of Object.keys(d)) {
          const chaveNorm = chave.toUpperCase().replace(/\s+/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (chaveNorm.includes('PLACA') || chaveNorm.includes('CAMINHAO') || chaveNorm.includes('VEICULO') || chaveNorm === 'PLACA') {
            const val = String(d[chave] || '').toUpperCase().trim();
            if (val.includes(placaFiltro)) return true;
          }
        }
        return true;
      });
    }

    if (filtros.regional) {
      const regionalFiltro = filtros.regional.toUpperCase().trim();
      resultados = resultados.filter(d => {
        for (const chave of Object.keys(d)) {
          const chaveNorm = chave.toUpperCase().replace(/\s+/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (chaveNorm.includes('REGIONAL') || chaveNorm.includes('REGIAO')) {
            const val = String(d[chave] || '').toUpperCase().trim();
            if (val.includes(regionalFiltro)) return true;
          }
        }
        return true;
      });
    }

    if (filtros.tipoCaminhao) {
      const tipoFiltro = filtros.tipoCaminhao.toUpperCase().trim();
      resultados = resultados.filter(d => {
        for (const chave of Object.keys(d)) {
          const chaveNorm = chave.toUpperCase().replace(/\s+/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (chaveNorm.includes('CAMINHAO') || chaveNorm.includes('TIPO') || chaveNorm.includes('CAMINHÃO')) {
            const val = String(d[chave] || '').toUpperCase().trim();
            if (val.includes(tipoFiltro)) return true;
          }
        }
        return true;
      });
    }

    if (filtros.filtrosDinamicos && Object.keys(filtros.filtrosDinamicos).length > 0) {
      for (const [nomeColuna, valorFiltro] of Object.entries(filtros.filtrosDinamicos)) {
        if (!valorFiltro) continue;

        const valorNorm = valorFiltro.toUpperCase().trim();
        resultados = resultados.filter(d => {
          let valorDado: any = d[nomeColuna];
          
          if (valorDado === undefined || valorDado === null) {
            const nomeColunaNorm = nomeColuna.trim().toUpperCase()
              .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
            for (const [k, v] of Object.entries(d)) {
              const kNorm = k.trim().toUpperCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
              if (kNorm === nomeColunaNorm) {
                valorDado = v;
                break;
              }
            }
          }

          if (valorDado === undefined || valorDado === null || valorDado === '') return false;
          const dadoNorm = String(valorDado).toUpperCase().trim();
          return dadoNorm === valorNorm || dadoNorm.includes(valorNorm);
        });
      }
    }

    return resultados;
  }

  /**
   * GET /api/dashboard/kpis-consolidado
   * ⚡ OTIMIZADO: usa agregações no banco (COUNT, SUM) em vez de carregar registros
   */
  async getKpisConsolidado(req: Request, res: Response): Promise<any> {
    try {
      const contratos = await this.contractRepo.find({
        order: { numeroContrato: 'ASC' },
      });

      const resultado: any[] = [];

      for (const contract of contratos) {
        const servicos = await this.repository.find({
          where: { contract_id: contract.id },
          order: { nome: 'ASC' },
        });

        for (const servico of servicos) {
          const temPlanilha = servico.padraoPlanilha?.colunas?.length > 0;
          if (!temPlanilha) continue;

          const totalRegistros = await PlanilhaService.getTotalRegistrosPorServico(servico.id);
          if (totalRegistros === 0) continue;

          const uploads = await this.uploadRepo.find({
            where: { servico_id: servico.id },
            order: { criadoEm: 'DESC' },
            take: 1,
          });

          const kpisBasicos = [
            { nome: 'Registros', valor: totalRegistros, formatado: String(totalRegistros), formato: 'numero' },
          ];

          resultado.push({
            id: servico.id,
            servicoNome: servico.nome,
            contratoId: contract.id,
            contratoNome: contract.numeroContrato,
            kpis: kpisBasicos,
            totalRegistros,
            ultimoUpload: uploads[0]?.criadoEm || null,
            temConfigDashboard: !!servico.configDashboard?.kpis?.length,
          });
        }
      }

      return res.json({ servicos: resultado });
    } catch (error: any) {
      console.error('Erro ao buscar kpis-consolidado:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao carregar dados consolidados' });
    }
  }

  /**
   * POST /api/contracts/:contractId/servicos/:id/grafico-agregado
   * ⚡ Agrega dados para gráficos no backend (processa TODOS os registros, sem limite)
   */
    async getGraficoAgregado(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const { eixoX, eixoY, tipo = 'barra', filtros: filtrosBody, topN = 10 } = req.body;

      if (!eixoX) {
        return res.status(400).json({ error: 'eixoX Ã© obrigatÃ³rio' });
      }

      const dados = await PlanilhaService.getDadosBrutosPorServico(id, 999999);
      if (!dados || dados.length === 0) {
        return res.json({ dados: [], total: 0, mensagem: 'Nenhum dado disponÃ­vel' });
      }

      // Detectar se eixoX Ã© coluna de data
      let eixoXEhData = false;
      try {
        const sv = await this.repository.findOne({ where: { id }, select: ['padraoPlanilha'] as any });
        if (sv?.padraoPlanilha?.colunas) {
          const cols: { nome: string; tipo: string }[] = sv.padraoPlanilha.colunas;
          const norm = (s: string) => s.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
          const exNorm = norm(eixoX);
          for (const c of cols) {
            if (norm(c.nome) === exNorm && c.tipo === 'data') { eixoXEhData = true; break; }
          }
        }
      } catch {}
      if (!eixoXEhData) {
        const colNorm = eixoX.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
        if (colNorm.includes('DATA') || colNorm.includes('DIA') || colNorm.includes('MES') || colNorm.includes('ANO')) eixoXEhData = true;
      }

      // Serial Excel -> data formatada
      const serialParaData = (val: any): string => {
        if (val === null || val === undefined || val === '') return 'N/A';
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) { const d = new Date(val); if (!isNaN(d.getTime())) return d.toLocaleDateString('pt-BR'); }
        if (typeof val === 'string' && /^\d{2}\/\d{2}\/\d{4}/.test(val)) return val;
        if (typeof val === 'number' && val > 40000 && val < 60000) { const d = new Date(Date.UTC(1899, 11, 30)); const dt = new Date(d.getTime() + val * 86400000); if (!isNaN(dt.getTime())) return dt.toLocaleDateString('pt-BR'); }
        if (val instanceof Date && !isNaN(val.getTime())) return val.toLocaleDateString('pt-BR');
        const d = new Date(val); if (!isNaN(d.getTime())) return d.toLocaleDateString('pt-BR');
        return String(val);
      };

      let dadosFiltrados = dados;
      if (filtrosBody) {
        dadosFiltrados = this.aplicarFiltros(dados, {
          dataInicio: (filtrosBody as any).dataInicio,
          dataFim: (filtrosBody as any).dataFim,
          placa: (filtrosBody as any).placa,
          regional: (filtrosBody as any).regional,
          tipoCaminhao: (filtrosBody as any).tipoCaminhao,
          filtrosDinamicos: (filtrosBody as any).filtrosDinamicos,
        });
      }

      const encontrarValor = (dado: Record<string, any>, nomeColuna: string): any => {
        if (!dado || !nomeColuna) return undefined;
        if (dado[nomeColuna] !== undefined && dado[nomeColuna] !== null) return dado[nomeColuna];
        
        const normalizar = (s: string) => s.trim().toUpperCase().normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
        const chaveNorm = normalizar(nomeColuna);
        
        for (const [k, v] of Object.entries(dado)) {
          if (v !== null && v !== undefined && normalizar(k) === chaveNorm) return v;
        }
        return undefined;
      };

      const serialParaMinutosBackend = (v: any): number => {
        if (v === null || v === undefined) return 0;
        if (typeof v === 'string' && /^\d{1,2}:\d{2}/.test(v)) {
          const [h, m] = v.split(':').map(Number);
          return h * 60 + (m || 0);
        }
        if (typeof v === 'number' && v > 0 && v < 1) {
          return Math.round(v * 24 * 60);
        }
        if (typeof v === 'number') return Math.round(v);
        return Number(v) || 0;
      };

      let agregado: { name: string; value: number }[] = [];

      if (tipo === 'pizza') {
        const contagem: Record<string, number> = {};
        for (const d of dadosFiltrados) {
          const rawKey = encontrarValor(d, eixoX);
          const key = eixoXEhData ? serialParaData(rawKey) : String(rawKey || 'N/A');
          contagem[key] = (contagem[key] || 0) + 1;
        }
        agregado = Object.entries(contagem)
          .sort((a, b) => b[1] - a[1])
          .slice(0, topN)
          .map(([name, value]) => ({ name, value }));
      } else {
        if (!eixoY) {
          return res.status(400).json({ error: 'eixoY Ã© obrigatÃ³rio para grÃ¡ficos de barra/linha' });
        }

        const nomeUpperY = eixoY.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const isHoraY = nomeUpperY.includes('HORA') || nomeUpperY.includes('HORAR') ||
          nomeUpperY.includes('TEMPO') || nomeUpperY.includes('DURACAO') ||
          nomeUpperY.includes('MINUT') || nomeUpperY.includes('ENTRADA') ||
          nomeUpperY.includes('SAIDA') || nomeUpperY.includes('CHEGADA');

        const somas: Record<string, number> = {};
        for (const d of dadosFiltrados) {
          const rawKey = encontrarValor(d, eixoX);
          const key = eixoXEhData ? serialParaData(rawKey) : String(rawKey || 'N/A');
          const valRaw = encontrarValor(d, eixoY);
          const val = isHoraY ? serialParaMinutosBackend(valRaw) : Number(valRaw) || 0;
          somas[key] = (somas[key] || 0) + val;
        }
        agregado = Object.entries(somas)
          .sort((a, b) => b[1] - a[1])
          .slice(0, topN)
          .map(([name, value]) => ({ name, value }));
      }

      return res.json({
        dados: agregado,
        total: dadosFiltrados.length,
        processados: dadosFiltrados.length,
      });
    } catch (error: any) {
      console.error('Erro no getGraficoAgregado:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao agregar dados do grÃ¡fico' });
    }
  }
async getModeloExecutivo(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const contractId = req.params.contractId as string;

      const [servico, contract] = await Promise.all([
        this.repository.findOne({ where: { id } }),
        this.contractRepo.findOne({ where: { id: contractId } }),
      ]);

      if (!servico) {
        return res.status(404).json({ error: 'Serviço não encontrado' });
      }

      const valoresContrato: Record<string, number | null> = {};
      if (contract) {
        valoresContrato['VALOR_TONELADA'] = contract.valorTonelada ? Number(contract.valorTonelada) : null;
        valoresContrato['VALOR_MINI'] = contract.valorMini ? Number(contract.valorMini) : null;
        valoresContrato['VALOR_TRUCK'] = contract.valorTruck ? Number(contract.valorTruck) : null;
        valoresContrato['VALOR_TOCO'] = contract.valorToco ? Number(contract.valorToco) : null;
      }

      const kpisAtuais = servico.configDashboard?.kpis || [];

      return res.json({
        modelo: MODELO_EXECUTIVO_KPIS,
        valoresContrato,
        kpisExistentes: kpisAtuais,
        contratoNome: contract?.numeroContrato || '',
        servicoNome: servico.nome,
        temModeloAplicado: servico.configDashboard?.modeloExecutivoAplicado === true,
      });
    } catch (error: any) {
      console.error('Erro ao carregar modelo executivo:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao carregar modelo executivo' });
    }
  }

  /**
   * POST /api/contracts/:contractId/servicos/:id/aplicar-modelo-executivo
   * Aplica todas as fórmulas do Modelo Executivo no configDashboard do serviço.
   */
  async aplicarModeloExecutivo(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const contractId = req.params.contractId as string;
      const { substituir = false } = req.body || {};

      const [servico, contract] = await Promise.all([
        this.repository.findOne({ where: { id } }),
        this.contractRepo.findOne({ where: { id: contractId } }),
      ]);

      if (!servico) {
        return res.status(404).json({ error: 'Serviço não encontrado' });
      }

      const valoresFixos: Record<string, number> = {};
      if (contract?.valorTonelada) valoresFixos['VALOR_TONELADA'] = Number(contract.valorTonelada);
      if (contract?.valorMini) valoresFixos['VALOR_MINI'] = Number(contract.valorMini);
      if (contract?.valorTruck) valoresFixos['VALOR_TRUCK'] = Number(contract.valorTruck);
      if (contract?.valorToco) valoresFixos['VALOR_TOCO'] = Number(contract.valorToco);

      const colunas = servico.padraoPlanilha?.colunas || [];
      const colunasNomes = colunas.map((c: any) => c.nome);
      
      const novosKpis: any[] = [];
      for (const grupo of MODELO_EXECUTIVO_KPIS) {
        for (const kpi of grupo.indicadores) {
          const formula = substituirColunasNaFormula(kpi.formula, colunasNomes);
          const colunasUsadas = extrairNomesColunas(formula);

          const novoKpi = {
            nome: kpi.nome,
            label: kpi.label,
            expressao: formula,
            agregacao: 'sum' as const,
            formato: kpi.formato,
            ativo: true,
            descricao: kpi.descricao,
            unidade: kpi.unidade,
            cor: kpi.cor,
            categoria: grupo.nome,
            colunasUsadas: colunasUsadas.filter(Boolean),
            valoresFixos,
            automatico: false,
            modeloExecutivo: true,
            visivelNoExecutivo: true,
            metricaKey: `modelo_${kpi.nome.toLowerCase().replace(/\s+/g, '_')}`,
            meta: null,
            alerta: null,
          };

          novosKpis.push(novoKpi);
        }
      }

      let kpisFinais: any[];
      if (substituir) {
        kpisFinais = novosKpis;
      } else {
        const kpisExistentes: any[] = servico.configDashboard?.kpis || [];
        const nomesExistentes = new Set(kpisExistentes.map((k: any) => k.nome));
        const kpisParaAdicionar = novosKpis.filter(k => !nomesExistentes.has(k.nome));
        kpisFinais = [...kpisExistentes, ...kpisParaAdicionar];
      }

      servico.configDashboard = {
        ...(servico.configDashboard || {}),
        kpis: kpisFinais,
        modeloExecutivoAplicado: true,
        modeloExecutivoAplicadoEm: new Date().toISOString(),
        graficos: servico.configDashboard?.graficos || [],
      };

      await this.repository.save(servico);

      return res.json({
        message: `Modelo Executivo aplicado! ${novosKpis.length} indicadores configurados.`,
        totalKpis: kpisFinais.length,
        novosKpis: novosKpis.length,
        kpis: kpisFinais,
        valoresFixos,
      });
    } catch (error: any) {
      console.error('Erro ao aplicar modelo executivo:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao aplicar modelo executivo: ' + (error?.message || '') });
    }
  }

  /**
   * DELETE /api/contracts/:contractId/servicos/:id
   * Exclui um serviço
   */
    /**
   * POST /api/contracts/:contractId/servicos/:id/aplicar-graficos-padrao
   * Aplica graficos padrao com base no tipo de servico e colunas.
   * NAO mexe nos KPIs existentes.
   */
  async aplicarGraficosPadrao(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const contractId = req.params.contractId as string;
      const { substituir = false } = req.body || {};
      const servico = await this.repository.findOne({ where: { id } });
      if (!servico) return res.status(404).json({ error: 'Servico nao encontrado' });
      if (!servico.padraoPlanilha?.colunas || servico.padraoPlanilha.colunas.length === 0)
        return res.status(400).json({ error: 'Nenhuma planilha vinculada.' });

      const dadosBrutos = await PlanilhaService.getDadosBrutosPorServico(id, 500);
      const analise = await AutoIndicatorService.analisar(
        id, contractId,
        servico.padraoPlanilha.colunas.map((c: any) => ({
          nome: c.nome, tipo: c.tipo as ColunaInfo['tipo'],
          valoresUnicos: c.valoresUnicos || 0, amostras: c.amostras || [], nulos: c.nulos || 0,
        })),
        dadosBrutos
      );

      const graficosSugeridos = AutoIndicatorService.converterParaGraficoConfig(analise.graficosSugeridos);
      if (graficosSugeridos.length === 0)
        return res.json({ message: 'Nenhum grafico gerado.', graficos: [], totalGraficos: 0 });

      let graficosFinais;
      if (substituir) {
        graficosFinais = graficosSugeridos;
      } else {
        const existentes = servico.configDashboard?.graficos || [];
        const titulos = new Set(existentes.map((g:any) => g.titulo?.toLowerCase().trim()));
        graficosFinais = [...existentes, ...graficosSugeridos.filter((g:any) => !titulos.has(g.titulo?.toLowerCase().trim()))];
      }

      const kpisExistentes = servico.configDashboard?.kpis || [];
      servico.configDashboard = { ...(servico.configDashboard || {}), kpis: kpisExistentes, graficos: graficosFinais, graficosPadraoAplicadosEm: new Date().toISOString(), graficosPadraoTotal: graficosFinais.length };
      await this.repository.save(servico);
      return res.json({ message: graficosFinais.length + ' grafico(s) padrao aplicado(s)!', graficos: graficosFinais, totalGraficos: graficosFinais.length, novosGraficos: graficosSugeridos.length, kpisPreservados: kpisExistentes.length, tipoServico: servico.tipo, colunasDetectadas: analise.colunas.length });
    } catch (error: any) {
      console.error('Erro:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao aplicar graficos: ' + (error?.message || '') });
    }
  }

  /**
   * GET /api/contracts/:contractId/servicos/:id/graficos-padrao-lista
   * Retorna os graficos padrao disponiveis para o tipo de servico do servico
   */
  async getGraficosPadraoLista(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const servico = await this.repository.findOne({ where: { id } });
      if (!servico) return res.status(404).json({ error: "Servico nao encontrado" });
      const tipo = servico.tipo || TipoServico.COLETA_CAMINHAO;
      const colunas = servico.padraoPlanilha?.colunas || [];
      const colunasNomes = colunas.map((c: any) => c.nome);
      const graficos = gerarConfigGraficosPadrao(tipo, colunasNomes);
      return res.json({
        tipo,
        colunas: colunasNomes,
        totalGraficos: graficos.length,
        graficos,
        nome: servico.nome,
      });
    } catch (error: any) {
      console.error("Erro ao listar graficos padrao:", error?.message || error);
      return res.status(500).json({ error: "Erro ao listar graficos padrao" });
    }
  }

  /**
   * POST /api/contracts/:contractId/servicos/:id/re-resolver-graficos
   * ⭐ Re-resolve placeholders dos gráficos existentes com base nas colunas atuais.
   * Útil quando o usuário fez upload de planilha e quer atualizar os gráficos
   * que foram criados com placeholders (antes do upload).
   * 
   * Body (opcional):
   *   { substituirTitulos?: boolean } — se true, atualiza títulos usando colunas reais
   * 
   * Response: { message, graficos, resolvidos, totalAntes, totalDepois }
   */
  async reResolverGraficosPlaceholder(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const { substituirTitulos } = req.body || {};

      const servico = await this.repository.findOne({ where: { id } });
      if (!servico) {
        return res.status(404).json({ error: 'Serviço não encontrado' });
      }

      if (!servico.padraoPlanilha?.colunas || servico.padraoPlanilha.colunas.length === 0) {
        return res.json({
          message: 'Nenhuma coluna disponível. Faça upload de planilha primeiro.',
          graficos: [],
          resolvidos: 0,
        });
      }

      const config = servico.configDashboard || {};
      const graficosAtuais = config.graficos || [];
      const colunasNomes = servico.padraoPlanilha.colunas.map((c: any) => c.nome);

      if (graficosAtuais.length === 0) {
        // Se não tem gráficos, gerar do padrão
        const novosGraficos = gerarConfigGraficosPadrao(servico.tipo || 'coleta_caminhao', colunasNomes);
        servico.configDashboard = {
          ...config,
          graficos: novosGraficos,
          reResolvidoEm: new Date().toISOString(),
        };
        await this.repository.save(servico);
        return res.json({
          message: `${novosGraficos.length} gráfico(s) gerado(s) do padrão!`,
          graficos: novosGraficos,
          resolvidos: novosGraficos.length,
          totalAntes: 0,
          totalDepois: novosGraficos.length,
        });
      }

      // Re-resolver placeholders
      const graficosReResolvidos = reResolverGraficos(graficosAtuais, colunasNomes);
      
      // Opcional: atualizar títulos que ainda têm placeholders
      if (substituirTitulos) {
        for (const g of graficosReResolvidos) {
          if (g.placeholderNaoResolvido === false && g.eixoX) {
            // Tenta substituir placeholder no título
            for (const ph of (g.placeholdersOriginais?.eixoX || [])) {
              if (g.titulo && g.titulo.includes(ph)) {
                g.titulo = g.titulo.replace(ph, g.eixoX);
              }
            }
          }
        }
      }

      const qtdResolvidos = graficosReResolvidos.filter(
        (g: any) => g.placeholderNaoResolvido === false && g.reResolvido === true
      ).length;

      servico.configDashboard = {
        ...config,
        graficos: graficosReResolvidos,
        reResolvidoEm: new Date().toISOString(),
        reResolvido: true,
      };

      await this.repository.save(servico);

      return res.json({
        message: `${qtdResolvidos} gráfico(s) re-resolvido(s) com sucesso!`,
        graficos: graficosReResolvidos,
        resolvidos: qtdResolvidos,
        totalAntes: graficosAtuais.length,
        totalDepois: graficosReResolvidos.length,
      });
    } catch (error: any) {
      console.error('Erro ao re-resolver gráficos:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao re-resolver gráficos: ' + (error?.message || '') });
    }
  }

  async excluir(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;

      const servico = await this.repository.findOne({ where: { id } });
      if (!servico) {
        return res.status(404).json({ error: 'Serviço não encontrado' });
      }

      await this.repository.remove(servico);
      return res.json({ message: 'Serviço excluído com sucesso' });
    } catch (error) {
      console.error('Erro ao excluir serviço:', error);
      return res.status(500).json({ error: 'Erro ao excluir serviço' });
    }
  }

  /**
   * GET /api/contracts/:contractId/servicos/:id/kpi-operacional-motoristas
   */
  async getKpiOperacionalMotoristas(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const contractId = req.params.contractId as string;

      const filtros = {
        dataInicio: req.query.dataInicio as string | undefined,
        dataFim: req.query.dataFim as string | undefined,
        placa: req.query.placa as string | undefined,
        tipoCaminhao: req.query.tipoCaminhao as string | undefined,
      };

      const dados = await PlanilhaService.getDadosBrutosPorServico(id, 999999);
      if (!dados || dados.length === 0) {
        return res.json({
          motoristas: [],
          rotas: [],
          metadados: { totalViagens: 0, totalTonelagem: 0, totalKm: 0 },
        });
      }

      const dadosFiltrados = this.aplicarFiltros(dados || [], filtros);
      if (!dadosFiltrados || dadosFiltrados.length === 0) {
        return res.json({
          motoristas: [],
          rotas: [],
          metadados: { totalViagens: 0, totalTonelagem: 0, totalKm: 0 },
        });
      }

      const dadosNorm = normalizarDados(dadosFiltrados);

      const colMotorista = detectarColuna(dadosNorm, [
        'MOTORISTA', 'NOME MOTORISTA', 'NOME_MOTORISTA', 'MOTORISTA NOME',
        'MOT', 'NOME', 'OPERADOR', 'FUNCIONARIO', 'FUNCIONÁRIO', 'COLETOR', 'COLETORA',
      ]);
      const colPlaca = detectarColuna(dadosNorm, ['PLACA', 'CAMINHAO', 'VEICULO', 'COLETOR', 'placa']);
      const colPeso = detectarColuna(dadosNorm, ['PESO TOTAL', 'PESO', 'PESOTOTAL', 'PESO_TOTAL', 'pesoTotal']);
      const colKm = detectarColuna(dadosNorm, ['KM TOTAL', 'KM', 'KMTOTAL', 'KM_TOTAL', 'kmTotal', 'QUILOMETRO', 'DISTANCIA']);
      const colHora = detectarColuna(dadosNorm, ['HORAS FORA UNIDADE', 'HORAS_FORA_UNIDADE', 'horasForaUnidade', 'TEMPO FORA', 'HORAS', 'HORAS PRODUTIVAS', 'tempoForaUnidade', 'HORA SAIDA', 'HORA SÁIDA BASE', 'HORASAIDABASE', 'HORA CHEGADA BASE', 'HORACHEGADABASE']);
      const colHoraSaida = detectarColuna(dadosNorm, ['HORA SAIDA', 'HORASAIDA', 'HORA_SAIDA', 'horaSaida', 'HORA SÁIDA BASE', 'HORASAIDABASE', 'HORA SAIDA BASE', 'HR SAIDA BASE']);
      const colHoraChegada = detectarColuna(dadosNorm, ['HORA CHEGADA', 'HORACHEGADA', 'HORA_CHEGADA', 'horaChegada', 'HORA CHEGADA BASE', 'HORACHEGADABASE', 'HR CHEGA BASE']);
      const colRota = detectarColuna(dadosNorm, [
        'ROTA', 'REGIONAL', 'REGIAO', 'DESTINO', 'ORIGEM', 'LOCAL',
        'LOCALIDADE', 'CIDADE', 'ROTA/DESTINO', 'DIRETORIA', 'FILIAL',
      ]);

      const temMotorista = colMotorista !== colPlaca;

      const motoristaMap = new Map<string, {
        motorista: string;
        placas: Set<string>;
        viagens: number;
        pesoTotal: number;
        kmTotal: number;
        horas: number;
      }>();

      for (const d of dadosNorm) {
        let chaveMotorista = '';
        if (temMotorista) {
          chaveMotorista = String(encontrarValorColuna(d, colMotorista) || '').trim();
        }
        if (!chaveMotorista) {
          chaveMotorista = String(encontrarValorColuna(d, colPlaca) || 'N/D').trim();
        }
        if (!chaveMotorista || chaveMotorista === 'N/D') continue;

        if (!motoristaMap.has(chaveMotorista)) {
          motoristaMap.set(chaveMotorista, {
            motorista: chaveMotorista,
            placas: new Set(),
            viagens: 0,
            pesoTotal: 0,
            kmTotal: 0,
            horas: 0,
          });
        }
        const entry = motoristaMap.get(chaveMotorista)!;

        const placaVal = String(encontrarValorColuna(d, colPlaca) || '').trim();
        if (placaVal) entry.placas.add(placaVal);

        entry.viagens += 1;
        entry.pesoTotal += Number(encontrarValorColuna(d, colPeso)) || 0;
        entry.kmTotal += Number(encontrarValorColuna(d, colKm)) || 0;

        let horas = Number(encontrarValorColuna(d, colHora)) || 0;
        if (horas > 0 && horas < 100) entry.horas += horas;
        else if (horas >= 100) entry.horas += horas * 24;
        else {
          const saida = Number(encontrarValorColuna(d, colHoraSaida)) || 0;
          const chegada = Number(encontrarValorColuna(d, colHoraChegada)) || 0;
          if (saida > 0 && chegada > 0) {
            // CORRIGIDO: detecta virada de dia quando chegada < saida
            let diff = 0;
            if (saida < 1 && chegada < 1) {
              if (chegada < saida) {
                diff = (chegada + 1 - saida) * 24;
              } else {
                diff = (chegada - saida) * 24;
              }
            } else {
              if (chegada < saida) {
                diff = chegada + 24 - saida;
              } else {
                diff = chegada - saida;
              }
            }
            if (diff > 0 && diff < 100) entry.horas += diff;
          }
        }
      }

      const motoristas: any[] = Array.from(motoristaMap.entries())
        .map(([nome, data]) => {
          const tonelagem = data.pesoTotal / 1000;
          const tonPorViagem = data.viagens > 0 ? tonelagem / data.viagens : 0;
          const kmPorViagem = data.viagens > 0 ? data.kmTotal / data.viagens : 0;
          const tonPorKm = data.kmTotal > 0 ? tonelagem / data.kmTotal : 0;
          const tonPorHora = data.horas > 0 ? tonelagem / data.horas : 0;

          return {
            motorista: nome,
            placa: Array.from(data.placas).join(', '),
            viagens: data.viagens,
            tonelagem: Math.round(tonelagem * 100) / 100,
            kmTotal: Math.round(data.kmTotal * 100) / 100,
            horasProdutivas: Math.round(data.horas * 100) / 100,
            tonPorViagem: Math.round(tonPorViagem * 100) / 100,
            kmPorViagem: Math.round(kmPorViagem * 100) / 100,
            tonPorKm: Math.round(tonPorKm * 10000) / 10000,
            tonPorHora: Math.round(tonPorHora * 100) / 100,
          };
        })
        .sort((a, b) => b.tonelagem - a.tonelagem);

      const temRota = colRota !== '';
      let rotas: any[] = [];

      if (temRota) {
        const rotaMap = new Map<string, {
          rota: string;
          viagens: number;
          pesoTotal: number;
          kmTotal: number;
        }>();

        for (const d of dadosNorm) {
          const chaveRota = String(encontrarValorColuna(d, colRota) || 'N/D').trim();
          if (!chaveRota || chaveRota === 'N/D') continue;

          if (!rotaMap.has(chaveRota)) {
            rotaMap.set(chaveRota, {
              rota: chaveRota,
              viagens: 0,
              pesoTotal: 0,
              kmTotal: 0,
            });
          }
          const entry = rotaMap.get(chaveRota)!;
          entry.viagens += 1;
          entry.pesoTotal += Number(encontrarValorColuna(d, colPeso)) || 0;
          entry.kmTotal += Number(encontrarValorColuna(d, colKm)) || 0;
        }

        rotas = Array.from(rotaMap.entries())
          .map(([nome, data]) => {
            const tonelagem = data.pesoTotal / 1000;
            const tonPorViagem = data.viagens > 0 ? tonelagem / data.viagens : 0;
            return {
              rota: nome,
              viagens: data.viagens,
              tonelagem: Math.round(tonelagem * 100) / 100,
              kmTotal: Math.round(data.kmTotal * 100) / 100,
              tonPorViagem: Math.round(tonPorViagem * 100) / 100,
            };
          })
          .sort((a, b) => b.tonelagem - a.tonelagem);
      }

      const totalViagens = dadosFiltrados.length;
      const totalTonelagem = dadosNorm.reduce((s, d) => s + (Number(encontrarValorColuna(d, colPeso)) || 0), 0) / 1000;
      const totalKm = dadosNorm.reduce((s, d) => s + (Number(encontrarValorColuna(d, colKm)) || 0), 0);

      return res.json({
        motoristas,
        rotas,
        metadados: {
          totalViagens,
          totalTonelagem: Math.round(totalTonelagem * 100) / 100,
          totalKm: Math.round(totalKm * 100) / 100,
          temMotorista,
          temRota,
        },
      });
    } catch (error: any) {
      console.error('[getKpiOperacionalMotoristas] Erro:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao carregar KPIs operacionais por motorista' });
    }
  }


  /**
   * GET /api/contracts/:contractId/servicos/:id/config-faturamento
   * Retorna a config de faturamento do servico
   */
  async getConfigFaturamento(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const servico = await this.repository.findOne({ where: { id } });
      if (!servico) return res.status(404).json({ error: 'Servico nao encontrado' });

      return res.json({
        configFaturamento: servico.configFaturamento || {
          tipoCobranca: 'tonelada',
          valorUnitario: null,
          unidade: 'ton',
          colunaQuantidade: '',
          valoresDeReceita: {
            TRUCK: null,
            TOCO: null,
            MINI: null,
            km_linear: null,
            m2: null,
            por_arvore: null,
          },
          moeda: 'BRL',
          ativo: false,
        },
      });
    } catch (error: any) {
      console.error('Erro ao buscar config faturamento:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao carregar configuracao de faturamento' });
    }
  }

  /**
   * PUT /api/contracts/:contractId/servicos/:id/config-faturamento
   * Salva a config de faturamento do servico
   * Body: { configFaturamento }
   */
  async salvarConfigFaturamento(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const { configFaturamento } = req.body;

      const servico = await this.repository.findOne({ where: { id } });
      if (!servico) return res.status(404).json({ error: 'Servico nao encontrado' });

      servico.configFaturamento = configFaturamento || {};
      await this.repository.save(servico);

      return res.json({
        message: 'Configuracao de faturamento salva com sucesso',
        configFaturamento: servico.configFaturamento,
      });
    } catch (error: any) {
      console.error('Erro ao salvar config faturamento:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao salvar configuracao de faturamento' });
    }
  }

  /**
   * GET /api/contracts/:contractId/servicos/:id/inconsistencias-viagens
   * Resumo de viagens que não entram no dashboard por dados incompletos/inconsistentes.
   */
  async getInconsistenciasViagens(req: Request, res: Response): Promise<any> {
    try {
      const id = req.params.id as string;
      const servico = await this.repository.findOne({ where: { id } });
      if (!servico) {
        return res.status(404).json({ error: 'Servico nao encontrado' });
      }

      const revalidar = req.query.revalidar !== '0';
      const resumo = await ValidacaoViagemService.getResumoInconsistencias(id, revalidar);
      return res.json(resumo);
    } catch (error: any) {
      console.error('Erro ao buscar inconsistencias de viagens:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao buscar inconsistencias de viagens' });
    }
  }
}
