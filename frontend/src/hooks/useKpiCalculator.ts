/* ============================================
   useKpiCalculator — Hook de Cálculo de KPIs
   
   ⚠️ FONTE ÚNICA DE VERDADE: BACKEND
   
   Este hook NUNCA calcula KPIs localmente.
   Todo cálculo é delegado ao endpoint /kpi-valores
   que usa FormulaEngine no backend com TODOS os dados.
   
   Responsabilidades:
   1. Buscar KPIs calculados do backend (/kpi-valores)
   2. Buscar métricas executivas (incluídas no mesmo endpoint)
   3. Cache local para evitar chamadas redundantes
   4. Formatação de valores para exibição
   ============================================ */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import servicoService from '../services/servicoService';

// ─── Tipos ───

export interface KpiValor {
  id?: string;
  nome: string;
  valor: number | null;
  formatado: string;
  formato: 'numero' | 'moeda' | 'porcentagem';
  origem: 'contrato' | 'servico';
  erro?: string;
}

export interface KpiValoresResponse {
  kpis: KpiValor[];
  metrica_executiva: ExecMetrics;
  configResumo?: ResumoConfig | null;
}

export interface ResumoConfig {
  metricasAtivas: string[];
  metricasPrimarias: string[];
  metricasSecundarias: string[];
  ordem?: string[];
  colunasEncontradas?: Record<string, { encontrada: boolean; colunaUsada: string; precisaColuna: string[] }>;
}

export interface ExecMetrics {
  viagens: number;
  qtdColetores: number;
  pesoTotalTon: number;
  kmTotal: number;
  horasProdutivas: number;
  faturamento: number;
  fatPorTipo: Record<string, number>;
  tonKm: number;
  prodColetor: number;
  kmMedioViagem: number;
  tonMediaColeta: number;
  receitaKm: number;
  receitaHora: number;
  temValor: boolean;
}

export type FormatoKpi = 'numero' | 'moeda' | 'porcentagem';
export type AgregacaoKpi = 'sum' | 'avg' | 'count' | 'min' | 'max';

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

// ─── Funções de formatação (apenas para exibição no frontend) ───

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

/**
 * Normaliza uma chave para comparação case-insensitive
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

// ─── Filtros ───

export interface KpiFiltros {
  dataInicio?: string;
  dataFim?: string;
  placa?: string;
  regional?: string;
  /** Filtros dinâmicos — qualquer coluna textual com valor a filtrar */
  filtrosDinamicos?: Record<string, string>;
}

// ─── Interface do hook ───

interface UseKpiCalculatorOptions {
  contractId: string;
  servicoId: string;
  filtros?: KpiFiltros;
}

interface UseKpiCalculatorResult {
  /** KPIs calculados pelo backend */
  kpiValores: KpiValor[];
  /** Métricas executivas */
  execMetrics: ExecMetrics | null;
  /** Configuração do resumo executivo do contrato */
  configResumo: ResumoConfig | null;
  /** true enquanto carrega */
  loading: boolean;
  /** Força recarga */
  reload: () => void;
  /** Busca um KPI específico pelo nome (útil para renderização direta) */
  getKpiValor: (nome: string) => KpiValor | undefined;
}

// ─── Hook principal ───

export function useKpiCalculator(options: UseKpiCalculatorOptions): UseKpiCalculatorResult {
  const { contractId, servicoId, filtros } = options;
  const [kpiValores, setKpiValores] = useState<KpiValor[]>([]);
  const [execMetrics, setExecMetrics] = useState<ExecMetrics | null>(null);
  const [configResumo, setConfigResumo] = useState<ResumoConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef(false);
  const ultimoAbortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const servicoIdRef = useRef(servicoId);

  // Quando servicoId muda, limpa dados do serviço anterior (loading é controlado pelo reload)
  useEffect(() => {
    servicoIdRef.current = servicoId;
    setKpiValores([]);
    setExecMetrics(null);
    setConfigResumo(null);
  }, [servicoId]);

  const reload = useCallback(async () => {
    if (!contractId || !servicoId) return;

    const requestId = ++requestIdRef.current;

    if (ultimoAbortRef.current) {
      ultimoAbortRef.current.abort();
    }
    const abortController = new AbortController();
    ultimoAbortRef.current = abortController;

    setLoading(true);
    try {
      const data = await servicoService.getKpiValores(
        contractId,
        servicoId,
        filtros,
        abortController.signal,
      ) as KpiValoresResponse | null;

      if (requestId !== requestIdRef.current) return;

      if (data) {
        setKpiValores(data.kpis || []);
        setExecMetrics(data.metrica_executiva || null);
        setConfigResumo(data.configResumo || null);
        loadedRef.current = true;
      }
    } catch (err: any) {
      if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') {
        return;
      }
      if (requestId === requestIdRef.current) {
        console.warn('[useKpiCalculator] Erro ao buscar kpi-valores:', err);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [contractId, servicoId, filtros]);

  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  const filtrosKey = useMemo(() => {
    const f = filtros || {};
    const dinamicos = f.filtrosDinamicos ? JSON.stringify(f.filtrosDinamicos) : '';
    return `${f.dataInicio || ''}:${f.dataFim || ''}:${f.placa || ''}:${f.regional || ''}:${dinamicos}`;
  }, [filtros]);

  useEffect(() => {
    const timer = setTimeout(() => {
      reloadRef.current();
    }, 0);
    return () => {
      clearTimeout(timer);
      ultimoAbortRef.current?.abort();
    };
  }, [contractId, servicoId, filtrosKey]);

  const getKpiValor = useCallback((nome: string): KpiValor | undefined => {
    return kpiValores.find(k => k.nome === nome);
  }, [kpiValores]);

  return {
    kpiValores,
    execMetrics,
    configResumo,
    loading,
    reload,
    getKpiValor,
  };
}
