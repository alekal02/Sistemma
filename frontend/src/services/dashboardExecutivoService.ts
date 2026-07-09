/* ============================================
   DASHBOARD EXECUTIVO SERVICE
   Consome /api/dashboard/executivo
   ============================================ */
import api, { TIMEOUT_ENDPOINTS_PESADOS_MS } from './api'

export interface Variacao {
  valor: number
  tipo: 'aumento' | 'reducao' | 'estavel' | 'sem_base'
}

export interface IndicadorCard {
  valor: number
  formatado: string
  variacao: Variacao
  minitendenciaSvg?: string
}

export interface IndicadorOpCard {
  valor: number
  formatado: string
  variacao: Variacao
}

export interface FaturamentoPorTipo {
  tipo: string
  valor: number
  percentual: number
}

export interface TendenciaDia {
  data: string
  label: string
  valor: number
}

export interface VolumePorPeriodo {
  data: string
  label: string
  faturamento: number
  custo: number
  usandoEstimativa?: boolean
  semColeta?: boolean
}

export interface KmPorColetor {
  coletor: string
  km: number
  tonelagem: number
}

export interface CustoPorKm {
  atual: number
  anterior: number
  variacao: Variacao
  disponivel: boolean
  origem: 'abastecimentos' | 'contrato'
}

export interface MargemPorTipo {
  tipo: string
  receita: number
  custo: number
  margem: number
}

export interface FaturamentoPorColetor {
  coletor: string
  faturamento: number
}

export interface ProjecaoMensal {
  projecao: number
  mediaDiaria: number
  diasRestantes: number
  diasPassados: number
}

export interface ProdutividadeColetor {
  coletor: string
  tonelagem: number
  viagens: number
  km: number
  tonPorDia: number
}

export interface KmMedioViagem {
  atual: number
  anterior: number
  variacao: Variacao
}

export interface HorasMedias {
  atual: number
  anterior: number
  variacao: Variacao
}

export interface UtilizacaoFrota {
  ativos: number
  total: number
  percentual: number
}

export interface ComparacaoAnteriorInfo {
  label: string
  registrosPlanilha: number
  abastecimentos: number
  temBasePlanilha: boolean
  temBaseAbastecimento: boolean
}

export interface PeriodoInfo {
  label: string
  inicio: string
  fim: string
  inicioAnterior: string
  fimAnterior: string
  comparacaoAnterior?: ComparacaoAnteriorInfo
}

export interface FiltrosInfo {
  periodo: string
  contractId: string | null
  servicoId: string | null
  mesReferencia?: number | null
  anoReferencia?: number | null
  contratosDisponiveis: { id: string; nome: string }[]
  servicosDisponiveis: { id: string; nome: string; contractId: string }[]
}

export interface FinanceiroPainel {
  faturamento: IndicadorCard
  custoOperacional: IndicadorCard
  margemBruta: IndicadorCard
  ticketMedio: IndicadorCard
  receitaHora: IndicadorCard
  temValor: boolean
}

export interface OperacionalPainel {
  tonelagem: IndicadorOpCard
  kmRodados: IndicadorOpCard
  viagens: IndicadorOpCard
  coletoresAtivos: IndicadorOpCard
  horasProdutivas: IndicadorOpCard
  eficiencia: IndicadorOpCard
}

export interface ReceitaDiaria {
  label: string
  valor: number
  km?: number
  horas?: number
  faturamento?: number
}

export interface GraficosPainel {
  usandoEstimativa?: boolean
  receitaKmDiario: ReceitaDiaria[]
  receitaHoraDiario: ReceitaDiaria[]
  receitaKmMedio: number
  receitaHoraMedia: number
  // 🆕 Novos gráficos de receita
  receitaDiaria?: { label: string; valor: number; data?: string; km?: number; horas?: number }[]
  rankingMotoristas?: { motorista: string; placa: string; faturamento: number; viagens: number }[]
  receitaPorRegional?: { regional: string; faturamento: number; viagens: number }[]
  receitaPorDiaSemana?: { diaSemana: number; diaNome: string; faturamento: number; viagens: number }[]
  receitaPorTurno?: { turno: string; faturamento: number; viagens: number; mediaPorViagem: number }[]
}

/* ═══ Novos KPIs de Receita ═══ */
export interface FaturamentoPorRegional {
  regional: string
  faturamento: number
  viagens: number
}

export interface FaturamentoPorMotorista {
  motorista: string
  placa: string
  faturamento: number
  viagens: number
}

export interface FaturamentoPorTurno {
  turno: string
  faturamento: number
  tonelagem: number
  viagens: number
  mediaPorViagem: number
}

export interface FaturamentoPorDiaSemana {
  diaSemana: number
  diaNome: string
  faturamento: number
  tonelagem: number
  viagens: number
}

export interface TicketMedioPorMotorista {
  motorista: string
  placa: string
  ticketMedio: number
  viagens: number
  faturamento: number
}

export interface CenarioProjecao {
  nome: string
  valor: number
  diferenca: number
}

export interface ProjecaoCenarios {
  cenarios: CenarioProjecao[]
  diasRestantes: number
  diasPassados: number
}

export interface AnaliseFinanceira {
  margemPorTipo: MargemPorTipo[]
  faturamentoPorColetor: FaturamentoPorColetor[]
  faturamentoPorRegional?: FaturamentoPorRegional[]
  faturamentoPorMotorista?: FaturamentoPorMotorista[]
  faturamentoPorTurno?: FaturamentoPorTurno[]
  faturamentoPorDiaSemana?: FaturamentoPorDiaSemana[]
  ticketMedioPorMotorista?: TicketMedioPorMotorista[]
  projecaoMensal: ProjecaoMensal
  projecaoCenarios?: ProjecaoCenarios
}

export interface AnaliseOperacional {
  produtividadePorColetor: ProdutividadeColetor[]
  kmMedioViagem: KmMedioViagem
  horasMedias: HorasMedias
  utilizacaoFrota: UtilizacaoFrota
  motoristas: MotoristaKpi[]
  totalMotoristas: number
}

export interface KpiCalculadoExecutivo {
  id: string
  nome: string
  valor: number | null
  formatado: string
  formato: string
  origem?: string
  erro?: string
  detalhe?: string
  faturamentoRealizado?: number
  faturamentoProjetado?: number
  ehProjecaoCiclo?: boolean
}

export interface Metadados {
  totalRegistrosAtual: number
  totalRegistrosAnterior: number
  totalRotasAtual?: number
  totalRotasAnterior?: number
  totalViagensAtual?: number
  totalViagensAnterior?: number
  totalAbastecimentosAtual: number
  totalAbastecimentosAnterior: number
  dataGeracao: string
  fonteDados?: string
  cacheHit?: boolean
  cacheIdadeSegundos?: number
  cacheValidoAte?: string
}

export interface ResumoCicloExecutivo {
  rotas: number
  viagens: number
  toneladas: number
  km: number
  horasProdutivas: number
  coletoresAtivos: number
  faturamento: number
  receitaTon: number
  receitaKm: number
  ticketMedio: number
  tonPorViagem: number
}

export interface DashboardExecutivoResponse {
  periodo: PeriodoInfo
  filtros: FiltrosInfo
  financeiro: FinanceiroPainel
  operacional: OperacionalPainel
  graficos: GraficosPainel
  analiseFinanceira: AnaliseFinanceira
  analiseOperacional: AnaliseOperacional
  kpisCalculados?: KpiCalculadoExecutivo[]
  resumoCiclo?: ResumoCicloExecutivo
  metadados: Metadados
}

export interface FiltrosExecutivo {
  periodo?: string
  dataInicio?: string
  dataFim?: string
  mesReferencia?: number
  anoReferencia?: number
  contractId?: string
  servicoId?: string
}

export interface PdfSecoes {
  financeira: boolean;
  operacional: boolean;
  graficos: boolean;
  customizados: boolean;
}

/* ═══ KPIs Operacionais por Motorista e Rota ═══ */

export interface MotoristaKpi {
  motorista: string;
  placa: string;
  viagens: number;
  tonelagem: number;
  kmTotal: number;
  horasProdutivas: number;
  tonPorViagem: number;
  kmPorViagem: number;
  tonPorKm: number;
  tonPorHora: number;
}

export interface RotaKpi {
  rota: string;
  viagens: number;
  tonelagem: number;
  kmTotal: number;
  tonPorViagem: number;
}

export interface ColetorKpi {
  coletor: string;
  viagens: number;
  tonelagem: number;
  kmTotal: number;
  tonPorViagem: number;
}

export interface RankingPar<T> {
  melhores: T[];
  piores: T[];
}

export interface KpiOperacionalMotoristasResponse {
  motoristas: MotoristaKpi[];
  coletores: ColetorKpi[];
  rotas: RotaKpi[];
  rankings?: {
    motoristas: RankingPar<MotoristaKpi>;
    coletores: RankingPar<ColetorKpi>;
    rotas: RankingPar<RotaKpi>;
  };
  metadados: {
    totalViagens: number;
    totalTonelagem: number;
    totalKm: number;
    temMotorista: boolean;
    temRota: boolean;
    temColetores?: boolean;
    colunaRota?: string | null;
    colunaRotaLabel?: string | null;
  };
}

const dashboardExecutivoService = {
  /**
   * Carrega KPIs operacionais por motorista e rota
   */
  async carregarKpiMotoristas(
    contractId: string,
    servicoId: string,
    filtros?: {
      dataInicio?: string;
      dataFim?: string;
      placa?: string;
      tipoCaminhao?: string;
      filtrosDinamicos?: Record<string, string>;
    }
  ): Promise<KpiOperacionalMotoristasResponse> {
    const params = new URLSearchParams();
    if (filtros?.dataInicio) params.append('dataInicio', filtros.dataInicio);
    if (filtros?.dataFim) params.append('dataFim', filtros.dataFim);
    if (filtros?.placa) params.append('placa', filtros.placa);
    if (filtros?.tipoCaminhao) params.append('tipoCaminhao', filtros.tipoCaminhao);
    if (filtros?.filtrosDinamicos && Object.keys(filtros.filtrosDinamicos).length > 0) {
      params.append('filtrosDinamicos', JSON.stringify(filtros.filtrosDinamicos));
    }

    const query = params.toString();
    const url = `/contracts/${contractId}/servicos/${servicoId}/kpi-operacional-motoristas${query ? `?${query}` : ''}`;
    const { data } = await api.get<KpiOperacionalMotoristasResponse>(url);
    return data;
  },
  async carregar(filtros?: FiltrosExecutivo & { refresh?: boolean }): Promise<DashboardExecutivoResponse> {
    const params = new URLSearchParams()
    if (filtros?.periodo) params.append('periodo', filtros.periodo)
    if (filtros?.dataInicio) params.append('dataInicio', filtros.dataInicio)
    if (filtros?.dataFim) params.append('dataFim', filtros.dataFim)
    if (filtros?.mesReferencia) params.append('mesReferencia', String(filtros.mesReferencia))
    if (filtros?.anoReferencia) params.append('anoReferencia', String(filtros.anoReferencia))
    if (filtros?.contractId) params.append('contractId', filtros.contractId)
    if (filtros?.servicoId) params.append('servicoId', filtros.servicoId)
    if (filtros?.refresh) params.append('refresh', '1')

    const query = params.toString()
    const { data } = await api.get<DashboardExecutivoResponse>(
      `/dashboard/executivo${query ? `?${query}` : ''}`,
      { timeout: TIMEOUT_ENDPOINTS_PESADOS_MS },
    )
    return data
  },

  /**
   * Gera PDF executivo via backend
   * Retorna blob do PDF para download
   */
  async gerarPdf(params: {
    contractId?: string;
    servicoId?: string;
    servicoNome?: string;
    periodo: string;
    dataInicio?: string;
    dataFim?: string;
    secoes: string[];
  }): Promise<{ blob: Blob; filename: string }> {
    const response = await api.post('/dashboard/executivo/pdf', params, {
      responseType: 'blob',
      timeout: TIMEOUT_ENDPOINTS_PESADOS_MS,
    })

    // Extrair nome do arquivo do header Content-Disposition
    const disposition = response.headers?.['content-disposition'] || ''
    const match = disposition.match(/filename="?(.+?)"?$/i)
    const filename = match?.[1] || 'relatorio_executivo.pdf'

    return { blob: response.data as Blob, filename }
  },
}

export default dashboardExecutivoService
