/* ═══════════════════════════════════════════
   useGoogleFilters — Hook de Filtros estilo Google Analytics
   
   Gerencia de forma unificada:
   - Período com presets (hoje, 7d, 30d, 90d, personalizado)
   - Comparação com período anterior
   - Dimensões ativas (regionais, tipos, placas, etc.)
   - Contexto de métricas (total registros, filtrados, variação)
   - Sincronia com URL (search params)
   ═══════════════════════════════════════════ */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/* ─── Tipos ─── */

export type PeriodoPreset = 'hoje' | 'ontem' | '7d' | '30d' | '90d' | 'personalizado';

export interface PeriodoState {
  preset: PeriodoPreset;
  dataInicio: string;
  dataFim: string;
  label: string;
}

export interface ComparacaoState {
  ativo: boolean;
  tipo: 'anterior' | 'personalizado';
  dataInicio: string;
  dataFim: string;
  label: string;
}

export interface DimensaoFiltro {
  /** Nome da dimensão (ex: 'REGIONAL', 'TIPO CAMINHAO') */
  nome: string;
  /** Label amigável */
  label: string;
  /** Valores selecionados ativamente */
  selecionados: string[];
  /** Total de opções disponíveis */
  totalOpcoes: number;
  /** Sugestões para auto-complete */
  opcoes: string[];
  /** Ícone/tag visual */
  icone?: string;
}

export interface GoogleFiltersState {
  periodo: PeriodoState;
  comparacao: ComparacaoState;
  dimensoes: DimensaoFiltro[];
  /** Total de registros no período (sem filtros de dimensão) */
  totalRegistros: number;
  /** Total após aplicar filtros de dimensão */
  totalFiltrado: number;
  /** Variação percentual vs período anterior (quando comparacao ativo) */
  variacaoPeriodo: number | null;
}

export interface GoogleFiltersActions {
  setPeriodo: (preset: PeriodoPreset, dataInicio?: string, dataFim?: string) => void;
  setComparacao: (tipo: ComparacaoState['tipo'], dataInicio?: string, dataFim?: string) => void;
  toggleComparacao: () => void;
  adicionarFiltro: (dimensaoNome: string, valor: string) => void;
  removerFiltro: (dimensaoNome: string, valor: string) => void;
  limparDimensao: (dimensaoNome: string) => void;
  limparTodos: () => void;
  setTotalRegistros: (total: number) => void;
  setTotalFiltrado: (total: number) => void;
  setVariacaoPeriodo: (variacao: number | null) => void;
  registrarDimensoes: (dimensoes: Omit<DimensaoFiltro, 'selecionados'>[]) => void;
  /** Retorna os filtros no formato para API */
  toApiParams: () => Record<string, string | undefined>;
}

export type UseGoogleFiltersResult = GoogleFiltersState & GoogleFiltersActions;

/* ─── Helpers de Data ─── */

function hojeISO(): string {
  return new Date().toISOString().split('T')[0];
}

function diasAtras(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function calcularPeriodo(preset: PeriodoPreset, dataInicio?: string, dataFim?: string): { dataInicio: string; dataFim: string; label: string } {
  switch (preset) {
    case 'hoje':
      return { dataInicio: hojeISO(), dataFim: hojeISO(), label: 'Hoje' };
    case 'ontem': {
      const ontem = diasAtras(1);
      return { dataInicio: ontem, dataFim: ontem, label: 'Ontem' };
    }
    case '7d':
      return { dataInicio: diasAtras(6), dataFim: hojeISO(), label: 'Últimos 7 Dias' };
    case '30d':
      return { dataInicio: diasAtras(29), dataFim: hojeISO(), label: 'Últimos 30 Dias' };
    case '90d':
      return { dataInicio: diasAtras(89), dataFim: hojeISO(), label: 'Últimos 90 Dias' };
    case 'personalizado':
      return {
        dataInicio: dataInicio || diasAtras(29),
        dataFim: dataFim || hojeISO(),
        label: `Personalizado`,
      };
  }
}

function calcularPeriodoAnterior(dataInicio: string, dataFim: string): { dataInicio: string; dataFim: string } {
  const inicio = new Date(dataInicio);
  const fim = new Date(dataFim);
  const diffMs = fim.getTime() - inicio.getTime();
  const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;

  const novoFim = new Date(inicio.getTime() - 1);
  const novoInicio = new Date(novoFim.getTime() - (diffDias - 1) * 24 * 60 * 60 * 1000);

  return {
    dataInicio: novoInicio.toISOString().split('T')[0],
    dataFim: novoFim.toISOString().split('T')[0],
  };
}

/* ─── Hook Principal ─── */

export function useGoogleFilters(): UseGoogleFiltersResult {
  const [searchParams, setSearchParams] = useSearchParams();

  // Estado interno
  const [periodo, setPeriodoState] = useState<PeriodoState>(() => {
    const preset = (searchParams.get('periodo') as PeriodoPreset) || '30d';
    const dataInicio = searchParams.get('di') || undefined;
    const dataFim = searchParams.get('df') || undefined;
    const calc = calcularPeriodo(preset, dataInicio, dataFim);
    return { preset, ...calc };
  });

  const [comparacao, setComparacaoState] = useState<ComparacaoState>(() => {
    const ativo = searchParams.get('comp') === '1';
    const tipo = (searchParams.get('compTipo') as ComparacaoState['tipo']) || 'anterior';
    if (ativo && tipo === 'anterior') {
      const ant = calcularPeriodoAnterior(periodo.dataInicio, periodo.dataFim);
      return { ativo: true, tipo: 'anterior', ...ant, label: 'Período Anterior' };
    }
    return { ativo: false, tipo: 'anterior', dataInicio: '', dataFim: '', label: '' };
  });

  const [dimensoes, setDimensoes] = useState<DimensaoFiltro[]>(() => {
    // Restaurar da URL
    const dims: DimensaoFiltro[] = [];
    searchParams.forEach((val, key) => {
      if (key.startsWith('f_')) {
        const nome = key.slice(2);
        const existing = dims.find(d => d.nome === nome);
        if (existing) {
          existing.selecionados.push(val);
        } else {
          dims.push({ nome, label: nome, selecionados: [val], totalOpcoes: 0, opcoes: [] });
        }
      }
    });
    return dims;
  });

  const [totalRegistros, setTotalRegistros] = useState(0);
  const [totalFiltrado, setTotalFiltrado] = useState(0);
  const [variacaoPeriodo, setVariacaoPeriodo] = useState<number | null>(null);

  // Ref para não sincronizar URL em loop
  const syncingRef = useRef(false);

  /* ═══ Sincronizar com URL ═══ */
  useEffect(() => {
    if (syncingRef.current) return;
    const params = new URLSearchParams();

    params.set('periodo', periodo.preset);
    if (periodo.preset === 'personalizado') {
      params.set('di', periodo.dataInicio);
      params.set('df', periodo.dataFim);
    }

    if (comparacao.ativo) {
      params.set('comp', '1');
      params.set('compTipo', comparacao.tipo);
      if (comparacao.tipo === 'personalizado') {
        params.set('compDi', comparacao.dataInicio);
        params.set('compDf', comparacao.dataFim);
      }
    }

    for (const dim of dimensoes) {
      if (dim.selecionados.length > 0) {
        dim.selecionados.forEach(v => params.append(`f_${dim.nome}`, v));
      }
    }

    syncingRef.current = true;
    setSearchParams(params, { replace: true });
    syncingRef.current = false;
  }, [periodo, comparacao, dimensoes, setSearchParams]);

  /* ═══ Actions ═══ */

  const setPeriodo = useCallback((preset: PeriodoPreset, dataInicio?: string, dataFim?: string) => {
    const calc = calcularPeriodo(preset, dataInicio, dataFim);
    setPeriodoState({ preset, ...calc });

    // Atualizar comparação se estiver como 'anterior'
    setComparacaoState(prev => {
      if (prev.ativo && prev.tipo === 'anterior') {
        const ant = calcularPeriodoAnterior(calc.dataInicio, calc.dataFim);
        return { ...prev, ...ant, label: 'Período Anterior' };
      }
      return prev;
    });
  }, []);

  const setComparacao = useCallback((tipo: ComparacaoState['tipo'], dataInicio?: string, dataFim?: string) => {
    if (tipo === 'anterior') {
      const ant = calcularPeriodoAnterior(periodo.dataInicio, periodo.dataFim);
      setComparacaoState({ ativo: true, tipo: 'anterior', ...ant, label: 'Período Anterior' });
    } else {
      setComparacaoState({
        ativo: true,
        tipo: 'personalizado',
        dataInicio: dataInicio || periodo.dataInicio,
        dataFim: dataFim || periodo.dataFim,
        label: `${dataInicio || periodo.dataInicio} → ${dataFim || periodo.dataFim}`,
      });
    }
  }, [periodo]);

  const toggleComparacao = useCallback(() => {
    setComparacaoState(prev => {
      if (prev.ativo) {
        return { ativo: false, tipo: 'anterior', dataInicio: '', dataFim: '', label: '' };
      }
      const ant = calcularPeriodoAnterior(periodo.dataInicio, periodo.dataFim);
      return { ativo: true, tipo: 'anterior', ...ant, label: 'Período Anterior' };
    });
  }, [periodo]);

  const adicionarFiltro = useCallback((dimensaoNome: string, valor: string) => {
    setDimensoes(prev => {
      const idx = prev.findIndex(d => d.nome === dimensaoNome);
      if (idx >= 0) {
        const dim = prev[idx];
        if (dim.selecionados.includes(valor)) return prev;
        const nova = [...prev];
        nova[idx] = { ...dim, selecionados: [...dim.selecionados, valor] };
        return nova;
      }
      return [...prev, { nome: dimensaoNome, label: dimensaoNome, selecionados: [valor], totalOpcoes: 0, opcoes: [] }];
    });
  }, []);

  const removerFiltro = useCallback((dimensaoNome: string, valor: string) => {
    setDimensoes(prev => {
      const idx = prev.findIndex(d => d.nome === dimensaoNome);
      if (idx < 0) return prev;
      const dim = prev[idx];
      const novos = dim.selecionados.filter(v => v !== valor);
      if (novos.length === 0) {
        return prev.filter(d => d.nome !== dimensaoNome);
      }
      const nova = [...prev];
      nova[idx] = { ...dim, selecionados: novos };
      return nova;
    });
  }, []);

  const limparDimensao = useCallback((dimensaoNome: string) => {
    setDimensoes(prev => prev.filter(d => d.nome !== dimensaoNome));
  }, []);

  const limparTodos = useCallback(() => {
    setDimensoes([]);
  }, []);

  const registrarDimensoes = useCallback((dims: Omit<DimensaoFiltro, 'selecionados'>[]) => {
    setDimensoes(prev => {
      const mapa = new Map(prev.map(d => [d.nome, d]));
      for (const dim of dims) {
        const existing = mapa.get(dim.nome);
        if (existing) {
          mapa.set(dim.nome, { ...dim, selecionados: existing.selecionados });
        } else {
          mapa.set(dim.nome, { ...dim, selecionados: [] });
        }
      }
      return Array.from(mapa.values());
    });
  }, []);

  const toApiParams = useCallback((): Record<string, string | undefined> => {
    const params: Record<string, string | undefined> = {
      dataInicio: periodo.dataInicio,
      dataFim: periodo.dataFim,
    };
    if (comparacao.ativo) {
      params.compDataInicio = comparacao.dataInicio;
      params.compDataFim = comparacao.dataFim;
    }
    for (const dim of dimensoes) {
      if (dim.selecionados.length > 0) {
        params[`filtro_${dim.nome}`] = dim.selecionados.join(',');
      }
    }
    return params;
  }, [periodo, comparacao, dimensoes]);

  return {
    // State
    periodo,
    comparacao,
    dimensoes,
    totalRegistros,
    totalFiltrado,
    variacaoPeriodo,
    // Actions
    setPeriodo,
    setComparacao,
    toggleComparacao,
    adicionarFiltro,
    removerFiltro,
    limparDimensao,
    limparTodos,
    setTotalRegistros,
    setTotalFiltrado,
    setVariacaoPeriodo,
    registrarDimensoes,
    toApiParams,
  };
}
