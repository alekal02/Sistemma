/* ============================================
   SERVICO SERVICE — Consome /api/contracts e /api/dashboard
   ============================================ */
import api from './api';
import { nextAbortSignal, resolveAbortSignal } from './abortableRequest';
import {
  cachedFetch,
  chavePadraoServico,
  invalidateCacheExact,
  invalidateCachePrefix,
} from './requestCache';

export function invalidatePadraoServico(contractId: string, servicoId: string): void {
  invalidateCacheExact(chavePadraoServico(contractId, servicoId));
}

export function invalidateCachesServico(contractId: string, servicoId: string): void {
  invalidatePadraoServico(contractId, servicoId);
  invalidateCachePrefix(`planilha:${contractId}:${servicoId}`);
  invalidateCachePrefix(`dia:${contractId}:${servicoId}`);
  invalidateCachePrefix(`brutos:${contractId}:${servicoId}`);
  invalidateCachePrefix(`coleta-agg:${contractId}:${servicoId}`);
  invalidateCachePrefix(`kpi-valores:${contractId}:${servicoId}`);
}

export interface KpiConsolidadoItem {
  id: string;
  nome: string;
  valor: number | null;
  formatado: string;
  formato: 'numero' | 'moeda' | 'porcentagem';
  origem: 'contrato' | 'servico';
}

export interface ServicoConsolidado {
  id: string;
  servicoNome: string;
  tipoServico?: string;
  contratoId: string;
  contratoNome: string;
  kpis: KpiConsolidadoItem[];
  ultimoUpload: string | null;
  totalRegistros: number;
  temConfigDashboard: boolean;
}

export interface FiltrosDashboardPrincipal {
  dataInicio?: string;
  dataFim?: string;
  placa?: string;
  regional?: string;
  tipoCaminhao?: string;
  /** resumo = metadados rápidos; completo = KPIs calculados */
  modo?: 'resumo' | 'completo';
}

export interface FiltrosDisponiveis {
  tiposCaminhao: string[];
}

export interface KpisConsolidadoResponse {
  servicos: ServicoConsolidado[];
  filtrosDisponiveis?: FiltrosDisponiveis;
  modo?: 'resumo' | 'completo';
}

export interface CompararKpiCelula {
  valor: number | null;
  formatado: string;
  formato: string;
}

export interface CompararKpiAnalise {
  min: number | null;
  max: number | null;
  media: number | null;
  amplitude: number | null;
  amplitudePct: number | null;
  melhorId: string | null;
  piorId: string | null;
  variacoes: Record<string, { pctVsMelhor: number | null; pctVsMedia: number | null }>;
}

export interface CompararKpiLinha {
  chave: string;
  nome: string;
  formato: string;
  secaoPeso?: 'operacao' | 'faixa' | 'frota' | 'cenario';
  valores: Record<string, CompararKpiCelula>;
  analise?: CompararKpiAnalise;
}

export interface PeriodoCicloContrato {
  mesReferencia: number;
  anoReferencia: number;
  diaInicioCiclo: number;
  dataInicio: string;
  dataFim: string;
  label: string;
}

/** Extremo de peso de uma viagem (pesoMedioKg = peso da viagem em kg; nome = rota). */
export interface RotaPesoExtremo {
  nome: string;
  pesoMedioKg: number;
  viagens: number;
}

export interface AnalisePesoColeta {
  numeroViagens: number;
  pesoMedioKg: number;
  /** Menor peso de viagem no ciclo */
  rotaMinima: RotaPesoExtremo | null;
  /** Maior peso de viagem no ciclo */
  rotaMaxima: RotaPesoExtremo | null;
  faixas: Array<{ label: string; quantidade: number; pct: number }>;
  tiposCaminhao: { MINI: number; TOCO: number; BASCULANTE: number; TRUCK: number; soma: number };
  caminhoesUnicos: number;
  caixaMediaKg: number;
  densidadeOtima: number;
  mediaIdealKg: number;
  perdaTon: number;
}

export interface CompararPorTipoServico {
  id: string;
  nome: string;
  tipo: string;
  contratoId?: string;
  contratoNome?: string;
  totalRegistros: number;
  periodo?: PeriodoCicloContrato;
  analisePeso?: AnalisePesoColeta | null;
}

export interface FiltrosComparacao {
  periodosPorContrato?: Record<string, {
    mes?: number;
    ano?: number;
    dataInicio?: string;
    dataFim?: string;
  }>;
  mesReferencia?: number;
  anoReferencia?: number;
  dataInicio?: string;
  dataFim?: string;
}

export interface CompararInsight {
  kpi: string;
  amplitudePct: number | null;
  melhorServico?: string;
  melhorContrato?: string;
  piorServico?: string;
  piorContrato?: string;
  melhorValor?: string;
  piorValor?: string;
}

export interface CompararPorTipoResponse {
  escopo?: 'global' | 'contrato';
  contratoId?: string;
  contratoNome?: string;
  diaInicioCiclo?: number;
  periodo?: PeriodoCicloContrato;
  periodosDistintos?: boolean;
  tipoServico: string;
  tipoServicoLabel: string;
  servicos: CompararPorTipoServico[];
  kpiLinhas: CompararKpiLinha[];
  insights?: CompararInsight[];
  resumo?: {
    totalServicos: number;
    totalContratos: number;
    totalKpis: number;
    kpisComVariacao: number;
  };
  mensagem?: string;
}

export interface ServicoPorTipoItem {
  id: string;
  nome: string;
  tipo: string;
  contratoId: string;
  contratoNome: string;
  totalRegistros: number;
  temKpis: boolean;
}

const servicoService = {
  /** Busca KPIS consolidados de todos os serviços para o Dashboard Principal */
  async getKpisConsolidado(filtros?: FiltrosDashboardPrincipal): Promise<KpisConsolidadoResponse> {
    const params = new URLSearchParams();
    if (filtros) {
      if (filtros.modo) params.set('modo', filtros.modo);
      if (filtros.dataInicio) params.set('dataInicio', filtros.dataInicio);
      if (filtros.dataFim) params.set('dataFim', filtros.dataFim);
      if (filtros.placa) params.set('placa', filtros.placa);
      if (filtros.regional) params.set('regional', filtros.regional);
      if (filtros.tipoCaminhao) params.set('tipoCaminhao', filtros.tipoCaminhao);
    }
    const query = params.toString();
    const url = query ? `/dashboard/kpis-consolidado?${query}` : '/dashboard/kpis-consolidado';
    const { data } = await api.get<KpisConsolidadoResponse>(url, {
      signal: nextAbortSignal('servico:getKpisConsolidado'),
    });
    return data;
  },

  /** Lista serviços de um contrato (id, nome, tipo) */
  async listarServicosContrato(contratoId: string): Promise<Array<{ id: string; nome: string; tipo: string }>> {
    const { data } = await api.get<{ servicos: Array<{ id: string; nome: string; tipo: string }> }>(
      `/contracts/${contratoId}/servicos`,
    );
    return data.servicos || [];
  },

  /** Compara KPIs entre serviços do mesmo tipo dentro de um contrato */
  async compararPorTipo(
    contratoId: string,
    tipoServico: string,
    filtros?: FiltrosComparacao,
  ): Promise<CompararPorTipoResponse> {
    const params = new URLSearchParams({ tipoServico });
    if (filtros?.periodosPorContrato && Object.keys(filtros.periodosPorContrato).length > 0) {
      params.set('periodosPorContrato', JSON.stringify(filtros.periodosPorContrato));
    }
    if (filtros?.mesReferencia) params.set('mesReferencia', String(filtros.mesReferencia));
    if (filtros?.anoReferencia) params.set('anoReferencia', String(filtros.anoReferencia));
    if (filtros?.dataInicio) params.set('dataInicio', filtros.dataInicio);
    if (filtros?.dataFim) params.set('dataFim', filtros.dataFim);
    const { data } = await api.get<CompararPorTipoResponse>(
      `/contracts/${contratoId}/servicos/comparar-por-tipo?${params.toString()}`,
      { signal: nextAbortSignal('servico:compararPorTipo') },
    );
    return data;
  },

  /** Lista serviços de um tipo em todos os contratos */
  async listarServicosPorTipo(tipoServico: string): Promise<{
    servicos: ServicoPorTipoItem[];
    tiposDisponiveis: Array<{ tipo: string; label: string }>;
  }> {
    const params = new URLSearchParams({ tipoServico });
    const { data } = await api.get<{
      servicos: ServicoPorTipoItem[];
      tiposDisponiveis: Array<{ tipo: string; label: string }>;
    }>(`/dashboard/servicos-por-tipo?${params.toString()}`);
    return data;
  },

  /** Compara KPIs entre serviços do mesmo tipo — inclusive entre contratos */
  async compararGlobal(
    tipoServico: string,
    servicoIds: string[],
    filtros?: FiltrosComparacao,
  ): Promise<CompararPorTipoResponse> {
    const params = new URLSearchParams({ tipoServico, servicoIds: servicoIds.join(',') });
    if (filtros?.periodosPorContrato && Object.keys(filtros.periodosPorContrato).length > 0) {
      params.set('periodosPorContrato', JSON.stringify(filtros.periodosPorContrato));
    }
    if (filtros?.mesReferencia) params.set('mesReferencia', String(filtros.mesReferencia));
    if (filtros?.anoReferencia) params.set('anoReferencia', String(filtros.anoReferencia));
    if (filtros?.dataInicio) params.set('dataInicio', filtros.dataInicio);
    if (filtros?.dataFim) params.set('dataFim', filtros.dataFim);
    const { data } = await api.get<CompararPorTipoResponse>(
      `/dashboard/comparar-por-tipo?${params.toString()}`,
      { signal: nextAbortSignal('servico:compararGlobal') },
    );
    return data;
  },

  async getPadrao(contractId: string, servicoId: string, opts?: { force?: boolean }) {
    return cachedFetch(
      chavePadraoServico(contractId, servicoId),
      async () => {
        const { data } = await api.get(`/contracts/${contractId}/servicos/${servicoId}/padrao`);
        return data;
      },
      { force: opts?.force },
    );
  },

  /** Busca paginada da planilha — uma requisição por página (sem fetch por linha). */
  async buscarDadosPlanilha(
    contractId: string,
    servicoId: string,
    opts?: { pagina?: number; limite?: number; uploadId?: string },
  ) {
    const pagina = opts?.pagina ?? 1;
    const limite = opts?.limite ?? 100;
    const uploadId = opts?.uploadId;
    const chave = `planilha:${contractId}:${servicoId}:${pagina}:${limite}:${uploadId || ''}`;

    return cachedFetch(chave, () => this.getDadosPaginados(contractId, servicoId, {
      page: pagina,
      limit: limite,
      uploadId,
    }), { ttlMs: 60_000 });
  },

  async getDadosBrutos(contractId: string, servicoId: string, limite = 500) {
    const chave = `brutos:${contractId}:${servicoId}:${limite}`;
    return cachedFetch(chave, async () => {
      const { data } = await api.get(`/contracts/${contractId}/servicos/${servicoId}/dados-brutos`, {
        params: { limite },
        signal: nextAbortSignal('servico:getDadosBrutos'),
      });
      return data;
    }, { ttlMs: 120_000 });
  },

  /** Registros paginados de um dia — uma requisição por página. */
  async buscarRegistrosDia(
    contractId: string,
    servicoId: string,
    data: string,
    opts?: { pagina?: number; limite?: number; incluirInconsistentes?: boolean },
  ) {
    const pagina = opts?.pagina ?? 1;
    const limite = opts?.limite ?? 100;
    const inc = opts?.incluirInconsistentes ? '1' : '0';
    const chave = `dia:${contractId}:${servicoId}:${data}:${pagina}:${limite}:${inc}`;
    return cachedFetch(chave, () => this.getDadosDia(contractId, servicoId, data, {
      page: pagina,
      limit: limite,
      incluirInconsistentes: opts?.incluirInconsistentes,
    }), { ttlMs: 60_000 });
  },

  async getDadosDia(
    contractId: string,
    servicoId: string,
    data: string,
    opts?: {
      incluirInconsistentes?: boolean;
      page?: number;
      limit?: number;
      /** Baixa o dia inteiro (legado / export). Evitar em volumes grandes. */
      all?: boolean;
    },
  ) {
    const params: Record<string, string | number> = {};
    if (opts?.incluirInconsistentes) params.incluirInconsistentes = '1';
    if (opts?.all) params.all = '1';
    if (opts?.page != null) params.page = opts.page;
    if (opts?.limit != null) params.limit = opts.limit;
    const { data: body } = await api.get(
      `/contracts/${contractId}/servicos/${servicoId}/dados-dia/${data}`,
      { params: Object.keys(params).length ? params : undefined },
    );
    return body as {
      data: string;
      dados: Record<string, unknown>[];
      total: number;
      pagina?: number;
      totalPaginas?: number;
      limit?: number;
      truncado?: boolean;
      apenasValidos: boolean;
      tipoServico?: string | null;
    };
  },

  /**
   * Agregação SQL de coleta (resumo + rankings) — não materializa linhas.
   */
  async getColetaAgregacao(
    contractId: string,
    servicoId: string,
    opts?: { data?: string; dataInicio?: string; dataFim?: string; topN?: number },
  ) {
    const chave = `coleta-agg:${contractId}:${servicoId}:${opts?.data || ''}:${opts?.dataInicio || ''}:${opts?.dataFim || ''}:${opts?.topN ?? ''}`;
    return cachedFetch(chave, async () => {
      const { data } = await api.get(
        `/contracts/${contractId}/servicos/${servicoId}/coleta/agregacao`,
        { params: opts, signal: nextAbortSignal('servico:getColetaAgregacao') },
      );
      return data;
    }, { ttlMs: 120_000 }) as Promise<{
      resumo: {
        registros: number;
        viagens: number;
        pesoTotalKg: number;
        pesoTotalTon: number;
        kmTotal: number;
        horasProdutivas: number;
        placas: number;
        motoristas: number;
        regionais: number;
        distritos: number;
        faturamento: number;
      };
      porMotorista: {
        chave: string; label: string; viagens: number; tonelagem: number;
        kmTotal: number; horasProdutivas: number; tonPorViagem: number; kmPorViagem: number; placa?: string;
      }[];
      porPlaca: {
        chave: string; label: string; viagens: number; tonelagem: number;
        kmTotal: number; horasProdutivas: number; tonPorViagem: number; kmPorViagem: number;
      }[];
      porDistrito: {
        chave: string; label: string; viagens: number; tonelagem: number;
        kmTotal: number; horasProdutivas: number; tonPorViagem: number; kmPorViagem: number;
      }[];
      dataInicio: string | null;
      dataFim: string | null;
      tipoServico?: string;
      modo?: string;
    }>;
  },

  /** KPIs calculados no backend — cache + deduplicação. */
  async getKpiValores(
    contractId: string,
    servicoId: string,
    filtros?: {
      dataInicio?: string;
      dataFim?: string;
      placa?: string;
      regional?: string;
      filtrosDinamicos?: Record<string, string>;
    },
    signal?: AbortSignal,
  ) {
    const f = filtros || {};
    const dinamicos = f.filtrosDinamicos ? JSON.stringify(f.filtrosDinamicos) : '';
    const chave = `kpi-valores:${contractId}:${servicoId}:${f.dataInicio || ''}:${f.dataFim || ''}:${f.placa || ''}:${f.regional || ''}:${dinamicos}`;
    return cachedFetch(chave, async () => {
      const params = new URLSearchParams();
      if (f.dataInicio) params.append('dataInicio', f.dataInicio);
      if (f.dataFim) params.append('dataFim', f.dataFim);
      if (f.placa) params.append('placa', f.placa);
      if (f.regional) params.append('regional', f.regional);
      if (f.filtrosDinamicos) {
        for (const [coluna, valor] of Object.entries(f.filtrosDinamicos)) {
          if (valor) params.append(`filtro_${coluna}`, valor);
        }
      }
      const qs = params.toString();
      const { data } = await api.get(
        `/contracts/${contractId}/servicos/${servicoId}/kpi-valores${qs ? '?' + qs : ''}`,
        { signal: signal ?? nextAbortSignal('servico:getKpiValores') },
      );
      return data;
    }, { ttlMs: 60_000 });
  },

  /**
   * Agregação SQL de roçada (resumo + rankings) — não materializa linhas.
   */
  async getRocadaAgregacao(
    contractId: string,
    servicoId: string,
    opts?: {
      data?: string;
      dataInicio?: string;
      dataFim?: string;
      topN?: number;
      tipoExecucao?: 'manual' | 'mecanizada';
    },
  ) {
    const { data } = await api.get(
      `/contracts/${contractId}/servicos/${servicoId}/rocada/agregacao`,
      { params: opts, signal: nextAbortSignal('servico:getRocadaAgregacao') },
    );
    return data as {
      resumo: {
        registros: number;
        areaM2: number;
        areaManualM2?: number;
        areaMecanizadaM2?: number;
        areaDesconhecidaM2?: number;
        registrosManual?: number;
        registrosMecanizada?: number;
        bairros: number;
        operadores: number;
        equipes: number;
        equipamentos: number;
      };
      porTipo?: { chave: string; label: string; registros: number; areaM2: number }[];
      manual?: {
        tipo: 'manual';
        label: string;
        registros: number;
        areaM2: number;
        bairros: number;
        operadores: number;
        equipes: number;
        equipamentos: number;
        porBairro: { chave: string; label: string; registros: number; areaM2: number }[];
        porOperador: { chave: string; label: string; registros: number; areaM2: number }[];
        porEquipe: { chave: string; label: string; registros: number; areaM2: number }[];
        porEquipamento: { chave: string; label: string; registros: number; areaM2: number }[];
      } | null;
      mecanizada?: {
        tipo: 'mecanizada';
        label: string;
        registros: number;
        areaM2: number;
        bairros: number;
        operadores: number;
        equipes: number;
        equipamentos: number;
        porBairro: { chave: string; label: string; registros: number; areaM2: number }[];
        porOperador: { chave: string; label: string; registros: number; areaM2: number }[];
        porEquipe: { chave: string; label: string; registros: number; areaM2: number }[];
        porEquipamento: { chave: string; label: string; registros: number; areaM2: number }[];
      } | null;
      porBairro: { chave: string; label: string; registros: number; areaM2: number }[];
      porOperador: { chave: string; label: string; registros: number; areaM2: number }[];
      porEquipe: { chave: string; label: string; registros: number; areaM2: number }[];
      porEquipamento: { chave: string; label: string; registros: number; areaM2: number }[];
      dataInicio: string | null;
      dataFim: string | null;
      tipoServico?: string;
    };
  },

  /**
   * Carrega registros só dos dias informados (em paralelo limitado).
   * Evita puxar 20k linhas de uma vez para PDF/export de período.
   */
  async getDadosPorDatas(
    contractId: string,
    servicoId: string,
    datas: string[],
    opts?: { incluirInconsistentes?: boolean; concorrencia?: number },
  ): Promise<Record<string, unknown>[]> {
    const unicas = [...new Set(datas.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))];
    if (!unicas.length) return [];

    const concorrencia = Math.max(1, Math.min(opts?.concorrencia ?? 4, 8));
    const resultado: Record<string, unknown>[] = [];

    for (let i = 0; i < unicas.length; i += concorrencia) {
      const lote = unicas.slice(i, i + concorrencia);
      const partes = await Promise.all(
        lote.map((data) => this.getDadosDia(contractId, servicoId, data, {
          ...opts,
          // Export de período ainda precisa do dia completo (usar com parcimônia).
          all: true,
        })),
      );
      for (const p of partes) {
        if (p.dados?.length) resultado.push(...p.dados);
      }
    }
    return resultado;
  },

  async getDadosPaginados(
    contractId: string,
    servicoId: string,
    params?: { page?: number; limit?: number; uploadId?: string },
  ) {
    const { data } = await api.get(`/contracts/${contractId}/servicos/${servicoId}/dados`, {
      params,
      signal: nextAbortSignal('servico:getDadosPaginados'),
    });
    return data;
  },

  async getInconsistenciasViagens(contractId: string, servicoId: string, revalidar = true) {
    const { data } = await api.get(
      `/contracts/${contractId}/servicos/${servicoId}/inconsistencias-viagens`,
      { params: { revalidar: revalidar ? 1 : 0 } },
    );
    return data;
  },

  async getVerificacaoViagens(
    contractId: string,
    servicoId: string,
    params?: Record<string, string | undefined>,
  ) {
    const { data } = await api.get(
      `/contracts/${contractId}/servicos/${servicoId}/verificacao-viagens`,
      { params, signal: nextAbortSignal('servico:getVerificacaoViagens') },
    );
    return data;
  },

  async getResumoCicloPorDia(
    contractId: string,
    servicoId: string,
    params: { dataInicio: string; dataFim: string },
  ) {
    const { data } = await api.get(
      `/contracts/${contractId}/servicos/${servicoId}/resumo-ciclo-por-dia`,
      { params, signal: nextAbortSignal('servico:getResumoCicloPorDia') },
    );
    return data as {
      dias: Array<{ data: string; rotas: number; viagens: number; pesoTotalKg: number; kmTotal: number; areaM2?: number }>;
      totais: { rotas: number; viagens: number; pesoTotalKg: number; kmTotal: number; areaM2?: number };
      dataInicio: string;
      dataFim: string;
      tipoServico?: string | null;
    };
  },

  async getStatusCiclo(
    contractId: string,
    servicoId: string,
    params: { mesReferencia: number; anoReferencia: number },
  ) {
    const { data } = await api.get(
      `/contracts/${contractId}/servicos/${servicoId}/ciclos/status`,
      { params },
    );
    return data as { mesReferencia: number; anoReferencia: number; fechado: boolean };
  },

  async listarCiclosFechados(contractId: string, servicoId: string) {
    const { data } = await api.get(
      `/contracts/${contractId}/servicos/${servicoId}/ciclos-fechados`,
    );
    return data as {
      ciclos: Array<{
        mesReferencia: number;
        anoReferencia: number;
        dataInicio: string;
        dataFim: string;
        label: string;
        fechadoEm: string;
        uploadIds: number[];
        totalRegistros: number;
      }>;
    };
  },

  async fecharCiclo(
    contractId: string,
    servicoId: string,
    body: { mesReferencia: number; anoReferencia: number },
  ) {
    const { data } = await api.post(
      `/contracts/${contractId}/servicos/${servicoId}/ciclos/fechar`,
      body,
    );
    return data as {
      message: string;
      ciclo: { label: string; dataInicio: string; dataFim: string };
      uploadIds: number[];
      totalRegistros: number;
    };
  },

  async getKpiExecMetrics(contractId: string, servicoId: string, params?: Record<string, string>) {
    const { data } = await api.get(
      `/contracts/${contractId}/servicos/${servicoId}/kpi-exec-metrics`,
      { params, signal: nextAbortSignal('servico:getKpiExecMetrics') },
    );
    return data;
  },

  async getKpiPreview(contractId: string, servicoId: string, body: unknown) {
    const { data } = await api.post(
      `/contracts/${contractId}/servicos/${servicoId}/kpi-preview`,
      body,
    );
    return data;
  },

  async saveConfigDashboard(contractId: string, servicoId: string, configDashboard: unknown) {
    const { data } = await api.put(
      `/contracts/${contractId}/servicos/${servicoId}/config-dashboard`,
      { configDashboard },
    );
    return data;
  },

  async getConfigFaturamento(contractId: string, servicoId: string) {
    const { data } = await api.get(
      `/contracts/${contractId}/servicos/${servicoId}/config-faturamento`,
    );
    return data;
  },

  async saveConfigFaturamento(contractId: string, servicoId: string, configFaturamento: unknown) {
    const { data } = await api.put(
      `/contracts/${contractId}/servicos/${servicoId}/config-faturamento`,
      { configFaturamento },
    );
    return data;
  },

  async aplicarModeloExecutivo(contractId: string, servicoId: string, substituir = false) {
    const { data } = await api.post(
      `/contracts/${contractId}/servicos/${servicoId}/aplicar-modelo-executivo`,
      { substituir },
    );
    return data;
  },

  async getGraficosAgregados(
    contractId: string,
    servicoId: string,
    body: { graficos: unknown[]; filtros?: Record<string, unknown> },
    signal?: AbortSignal,
  ) {
    const { data } = await api.post(
      `/contracts/${contractId}/servicos/${servicoId}/graficos-agregados`,
      body,
      { signal: resolveAbortSignal('servico:getGraficosAgregados', signal) },
    );
    return data;
  },

  async updateColunasTipo(contractId: string, servicoId: string, body: unknown) {
    const { data } = await api.put(
      `/contracts/${contractId}/servicos/${servicoId}/colunas/tipo`,
      body,
    );
    return data;
  },

  async analisarIndicadoresAuto(contractId: string, servicoId: string) {
    const { data } = await api.post(
      `/contracts/${contractId}/servicos/${servicoId}/analisar-indicadores-automaticos`,
    );
    return data;
  },

  async confirmarIndicadoresAuto(contractId: string, servicoId: string, body: unknown) {
    const { data } = await api.post(
      `/contracts/${contractId}/servicos/${servicoId}/confirmar-indicadores-automaticos`,
      body,
    );
    return data;
  },

  async getModeloExecutivo(contractId: string, servicoId: string) {
    const { data } = await api.get(
      `/contracts/${contractId}/servicos/${servicoId}/modelo-executivo`,
    );
    return data;
  },

  async criarServico(contractId: string, body: unknown) {
    const { data } = await api.post(`/contracts/${contractId}/servicos`, body);
    return data;
  },

  async excluirServico(contractId: string, servicoId: string) {
    await api.delete(`/contracts/${contractId}/servicos/${servicoId}`);
  },
};

export default servicoService;
