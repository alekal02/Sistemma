/* ============================================
   KPI UNIVERSAL SERVICE — Consome /api/kpis-universais
   ============================================ */
import api from './api';

export interface PlaceholderKpi {
  nome: string;
  label: string;
  colunasCandidatas: string[];
  resolvido?: boolean;
}

export interface KpiUniversal {
  id: string;
  nome: string;
  label: string;
  formula: string;
  agregacao: string;
  formato: string;
  unidade: string | null;
  categoria: string;
  cor: string;
  descricao: string | null;
  metaSugerida: number | null;
  tipoServico: string;
  placeholders: PlaceholderKpi[] | null;
  isPersonalizado: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export interface KpiAtivado {
  nome: string;
  label: string;
  expressao: string;
  agregacao: string;
  formato: string;
  unidade: string | null;
  categoria: string;
  cor: string;
  descricao: string | null;
  meta: number | null;
  ativo: boolean;
  origemUniversal: string;
  placeholdersNaoResolvidos?: string[];
  placeholdersResolvidos?: Record<string, string>;
}

export interface FalhaPlaceholder {
  nome: string;
  label: string;
  colunasCandidatas: string[];
}

const kpiUniversalService = {
  /** Lista todos os KPIs universais, opcionalmente filtrados por tipo de serviço */
  async listar(tipoServico?: string): Promise<{ kpis: KpiUniversal[]; total: number }> {
    const params = tipoServico ? `?tipoServico=${tipoServico}` : '';
    const { data } = await api.get(`/kpis-universais${params}`);
    return data;
  },

  /** Busca um KPI universal por ID */
  async buscarUm(id: string): Promise<KpiUniversal> {
    const { data } = await api.get(`/kpis-universais/${id}`);
    return data;
  },

  /** Cria um novo KPI universal */
  async criar(kpi: Partial<KpiUniversal>): Promise<KpiUniversal> {
    const { data } = await api.post('/kpis-universais', kpi);
    return data;
  },

  /** Atualiza um KPI universal */
  async atualizar(id: string, kpi: Partial<KpiUniversal>): Promise<KpiUniversal> {
    const { data } = await api.put(`/kpis-universais/${id}`, kpi);
    return data;
  },

  /** Exclui um KPI universal */
  async excluir(id: string): Promise<void> {
    await api.delete(`/kpis-universais/${id}`);
  },

  /** Duplica um KPI universal */
  async duplicar(id: string): Promise<KpiUniversal> {
    const { data } = await api.post(`/kpis-universais/duplicar/${id}`);
    return data;
  },

  /** Ativa um KPI universal em um serviço (retorna KPI com placeholders resolvidos) */
  async ativarEmServico(kpiId: string, servicoId: string): Promise<{
    kpi: KpiAtivado;
    resolvido: boolean;
    placeholdersResolvidos: Record<string, string>;
    placeholdersNaoResolvidos: FalhaPlaceholder[];
  }> {
    const { data } = await api.post(`/kpis-universais/${kpiId}/ativar/${servicoId}`);
    return data;
  },

  /** Ativa múltiplos KPIs universais em um serviço */
  async ativarMultiplos(servicoId: string, kpiIds: string[]): Promise<{
    kpis: KpiAtivado[];
    totalAtivados: number;
    totalComFalha: number;
    falhas?: { kpiNome: string; placeholders: FalhaPlaceholder[] }[];
  }> {
    const { data } = await api.post('/kpis-universais/ativar-multiplos', { servicoId, kpiIds });
    return data;
  },

  /** Lista tipos de serviço que têm KPIs universais */
  async listarTiposComKpis(): Promise<{ tipos: { tipo: string; total: number }[] }> {
    const { data } = await api.get('/kpis-universais/tipos');
    return data;
  },

  /** Importa KPIs de um serviço existente para a biblioteca universal */
  async importarDeServico(servicoId: string, tipoServico: string, kpiIds?: string[]): Promise<{
    kpis: KpiUniversal[];
    totalImportados: number;
  }> {
    const { data } = await api.post('/kpis-universais/importar-de-servico', { servicoId, tipoServico, kpiIds });
    return data;
  },

  /** Verifica KPIs de origem universal em um serviço */
  async verificarServico(servicoId: string): Promise<{
    totalKpis: number;
    kpisUniversal: number;
    kpis: any[];
  }> {
    const { data } = await api.get(`/kpis-universais/verificar-servico/${servicoId}`);
    return data;
  },
};

export default kpiUniversalService;
