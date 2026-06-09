/* ============================================
   KPI ENGINE — Utilitários de KPI

   ⚠️ MÓDULO CANÔNICO — Apenas utilitários
   
   Cálculos de KPI são feitos EXCLUSIVAMENTE no backend.
   Este módulo contém apenas funções auxiliares de:
   1. Normalização de chaves (encontrarValor, normalizarChave)
   2. Formatação de números e horas
   3. Tipos compartilhados
   4. Chamadas ao endpoint /kpi-preview (consulta)
   ============================================ */

import api from './api';

// ─── TIPOS ───

export type TipoColuna = 'numero' | 'texto' | 'data' | 'hora' | 'desconhecido';
export type FormatoKpi = 'numero' | 'moeda' | 'porcentagem';
export type AgregacaoKpi = 'sum' | 'avg' | 'count' | 'min' | 'max';

export interface ColunaDetectada {
  nome: string;
  tipo: TipoColuna;
  amostras: (string | number | null)[];
  valoresUnicos: number;
  nulos: number;
}

export interface KpiConfig {
  id?: string;
  nome: string;
  label: string;
  descricao?: string;
  unidade?: string;
  categoria?: string;
  cor?: string;
  meta?: number | null;
  alerta?: 'acima' | 'abaixo' | null;
  agregacao: AgregacaoKpi;
  formato: FormatoKpi;
  ativo: boolean;
  operacao?: string;
  valorFixo?: number | null;
  coluna2?: string;
  expressao?: string;
  colunasUsadas?: string[];
  valoresFixos?: Record<string, number>;
}

export interface ValoresCaminhao {
  VALOR_TONELADA: number | null;
  VALOR_MINI: number | null;
  VALOR_TRUCK: number | null;
  VALOR_TOCO: number | null;
}

export interface ConfigFaturamentoValores {
  ativo?: boolean;
  tipoCobranca?: string;
  valorTonelada?: number | null;
  valorMini?: number | null;
  valorTruck?: number | null;
  valorToco?: number | null;
  valorKmLinear?: number | null;
  valorM2?: number | null;
  valorPorArvore?: number | null;
  valorPorEquipe?: number | null;
  valorPorUnidade?: number | null;
  colunaQuantidade?: string;
  colunaTipoCaminhao?: string;
}

/** Monta VALOR_* para fórmulas FATURAMENTO_EST e KPIs de receita */
export function buildValoresFixosFromConfigFaturamento(
  cfg: ConfigFaturamentoValores | null | undefined
): Record<string, number> {
  if (!cfg?.ativo) return {};
  const v: Record<string, number> = {};
  const set = (key: string, val: unknown) => {
    const n = Number(val);
    if (val != null && val !== '' && !Number.isNaN(n) && n > 0) v[key] = n;
  };
  set('VALOR_TONELADA', cfg.valorTonelada);
  set('VALOR_MINI', cfg.valorMini);
  set('VALOR_TRUCK', cfg.valorTruck);
  set('VALOR_TOCO', cfg.valorToco);
  set('VALOR_KM_LINEAR', cfg.valorKmLinear);
  set('VALOR_M2', cfg.valorM2);
  set('VALOR_POR_ARVORE', cfg.valorPorArvore);
  set('VALOR_POR_EQUIPE', cfg.valorPorEquipe);
  set('VALOR_POR_UNIDADE', cfg.valorPorUnidade);
  return v;
}

const KPI_RECEITA_PATTERN = /FATURAMENTO_EST|VALOR_MINI|VALOR_TRUCK|VALOR_TOCO|VALOR_TONELADA|VALOR_KM_LINEAR|VALOR_M2|VALOR_POR_/i;

/** Sincroniza KPIs de receita com a config de faturamento por tipo de caminhão */
export function sincronizarKpisComFaturamento(
  kpis: KpiConfig[],
  cfg: ConfigFaturamentoValores | null | undefined
): KpiConfig[] {
  if (!cfg?.ativo) return kpis;
  const valoresFixos = buildValoresFixosFromConfigFaturamento(cfg);
  if (Object.keys(valoresFixos).length === 0) return kpis;

  const pesoCol = cfg.colunaQuantidade || 'PESO TOTAL';
  const tipoCol = cfg.colunaTipoCaminhao || 'TIPO DE CAMINHAO';
  const chamadaFat = `FATURAMENTO_EST(${pesoCol}, ${tipoCol})`;

  return kpis.map(kpi => {
    const expr = kpi.expressao || '';
    const ehReceita =
      kpi.categoria === 'Financeiro' ||
      kpi.formato === 'moeda' ||
      KPI_RECEITA_PATTERN.test(expr) ||
      /faturamento|receita|ticket/i.test(kpi.label || kpi.nome || '');

    if (!ehReceita) return kpi;

    const novaExpr = /FATURAMENTO_EST\s*\(/i.test(expr)
      ? expr.replace(/FATURAMENTO_EST\s*\([^)]*\)/gi, chamadaFat)
      : expr;

    return {
      ...kpi,
      ativo: true,
      expressao: novaExpr,
      valoresFixos: { ...valoresFixos, ...(kpi.valoresFixos || {}) },
      colunasUsadas: cfg.tipoCobranca === 'tonelada_tipo_caminhao'
        ? [pesoCol, tipoCol]
        : kpi.colunasUsadas,
    };
  });
}

// ─── FUNÇÕES DE NORMALIZAÇÃO ───

/**
 * Normaliza uma chave para comparação case-insensitive
 * Remove acentos, espaços extras, e converte para maiúsculo
 */
export function normalizarChave(chave: string): string {
  return chave
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');
}

/**
 * Encontra o valor de uma coluna em um objeto de dados
 * usando múltiplas estratégias de normalização
 */
export function encontrarValor(dado: Record<string, any>, nomeColuna: string): any {
  if (!dado || !nomeColuna) return undefined;
  if (dado[nomeColuna] !== undefined && dado[nomeColuna] !== null) return dado[nomeColuna];
  const chaveNorm = normalizarChave(nomeColuna);
  for (const [k, v] of Object.entries(dado)) {
    if (v !== null && v !== undefined && normalizarChave(k) === chaveNorm) return v;
  }
  const semEspaco = chaveNorm.replace(/\s+/g, '');
  for (const [k, v] of Object.entries(dado)) {
    if (v !== null && v !== undefined && normalizarChave(k).replace(/\s+/g, '') === semEspaco) return v;
  }
  if (dado.dados && typeof dado.dados === 'object' && !Array.isArray(dado.dados)) {
    return encontrarValor(dado.dados, nomeColuna);
  }
  return undefined;
}

// ─── FORMATAÇÃO ───

export function formatarNumero(valor: number, formato: FormatoKpi | string): string {
  if (formato === 'moeda') {
    return valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }
  if (formato === 'porcentagem') {
    return valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
  }
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

/**
 * Converte serial Excel de hora em minutos totais
 */
export function serialParaMinutos(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'string' && /^\d{1,2}:\d{2}/.test(v)) {
    const [h, m] = v.split(':').map(Number);
    return h * 60 + (m || 0);
  }
  if (typeof v === 'string') {
    const num = parseFloat(v.trim());
    if (!isNaN(num) && num > 0) {
      const dias = Math.floor(num);
      const fracao = num - dias;
      return Math.round(dias * 24 * 60 + fracao * 24 * 60);
    }
    return 0;
  }
  if (typeof v === 'number' && v > 0) {
    if (v < 100) return Math.round(v * 24 * 60);
    return Math.round(v);
  }
  return Number(v) || 0;
}

/**
 * Formata minutos totais como HH:mm
 */
export function formatarMinutosComoHora(totalMin: number): string {
  const abs = Math.abs(totalMin);
  const h = Math.floor(abs / 60);
  const m = Math.round(abs % 60);
  const sinal = totalMin < 0 ? '-' : '';
  return sinal + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// ─── CHAMADAS AO BACKEND (APENAS CONSULTA) ───

interface PreviewKpiResponse {
  valido: boolean;
  valor: number | null;
  totalRegistros: number;
  colunasUsadas?: string[];
  colunasEncontradas?: string[];
  colunasAusentes?: string[];
  debug?: Record<string, any>;
  erro?: string;
}

/**
 * Preview de um KPI com fórmula — calcula no backend
 * Esta é a ÚNICA forma de calcular KPI (fonte de verdade)
 */
export async function previewKpiBackend(
  contractId: string,
  servicoId: string,
  expressao: string,
  valoresFixos?: Record<string, number>,
  debug?: boolean
): Promise<PreviewKpiResponse> {
  try {
    const { data } = await api.post(
      `/contracts/${contractId}/servicos/${servicoId}/kpi-preview`,
      { expressao, valoresFixos: valoresFixos || {}, debug }
    );
    return data;
  } catch (err: any) {
    return {
      valido: false,
      valor: null,
      totalRegistros: 0,
      erro: err?.response?.data?.error || 'Erro de conexão',
    };
  }
}

// ─── CACHE LOCAL (Apenas para preview, não para valores finais) ───

const cacheLocal = new Map<string, { valor: any; timestamp: number }>();
const CACHE_TTL = 30000;

export function getFromCache<T>(key: string): T | null {
  const item = cacheLocal.get(key);
  if (item && Date.now() - item.timestamp < CACHE_TTL) return item.valor as T;
  cacheLocal.delete(key);
  return null;
}

export function setToCache(key: string, valor: any): void {
  cacheLocal.set(key, { valor, timestamp: Date.now() });
  if (cacheLocal.size > 50) {
    const now = Date.now();
    for (const [k, v] of cacheLocal) {
      if (now - v.timestamp > CACHE_TTL) cacheLocal.delete(k);
    }
  }
}

export function clearCache(): void {
  cacheLocal.clear();
}
