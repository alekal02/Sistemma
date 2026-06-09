/* ============================================
   SERVICO SERVICE — Consome /api/contracts e /api/dashboard
   ============================================ */
import api from './api';

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
}

export interface FiltrosDisponiveis {
  tiposCaminhao: string[];
}

export interface KpisConsolidadoResponse {
  servicos: ServicoConsolidado[];
  filtrosDisponiveis?: FiltrosDisponiveis;
}

const servicoService = {
  /** Busca KPIS consolidados de todos os serviços para o Dashboard Principal */
  async getKpisConsolidado(filtros?: FiltrosDashboardPrincipal): Promise<KpisConsolidadoResponse> {
    const params = new URLSearchParams();
    if (filtros) {
      if (filtros.dataInicio) params.set('dataInicio', filtros.dataInicio);
      if (filtros.dataFim) params.set('dataFim', filtros.dataFim);
      if (filtros.placa) params.set('placa', filtros.placa);
      if (filtros.regional) params.set('regional', filtros.regional);
      if (filtros.tipoCaminhao) params.set('tipoCaminhao', filtros.tipoCaminhao);
    }
    const query = params.toString();
    const url = query ? `/dashboard/kpis-consolidado?${query}` : '/dashboard/kpis-consolidado';
    const { data } = await api.get<KpisConsolidadoResponse>(url);
    return data;
  },
};

export default servicoService;
