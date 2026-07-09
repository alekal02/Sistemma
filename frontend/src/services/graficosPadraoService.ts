import api from './api';

export interface GraficoPadraoConfig {
  id: string;
  key: string;
  tipoServico: string;
  ativo: boolean;
  titulo: string;
  tipo: 'barra' | 'linha' | 'pizza' | 'area' | 'donut';
  placeholderEixoX: string[] | null;
  placeholderEixoY: string[] | null;
  descricao: string | null;
  categoria: string;
  ordem: number;
  isContagem: boolean;
  cor: string;
  isPersonalizado: boolean;
  servicoOrigemId: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface GraficoPadraoResponse {
  graficos: GraficoPadraoConfig[];
  agrupados: Record<string, GraficoPadraoConfig[]>;
  total: number;
  tiposComGraficos: string[];
}

const graficosPadraoService = {
  async listarBiblioteca(tipoServico?: string, apenasAtivos?: boolean): Promise<GraficoPadraoResponse> {
    const params: Record<string, string> = {};
    if (tipoServico) params.tipoServico = tipoServico;
    if (apenasAtivos) params.apenasAtivos = 'true';
    const { data } = await api.get<GraficoPadraoResponse>('/graficos-padrao/biblioteca', { params });
    return data;
  },

  async toggleAtivo(id: string, ativo: boolean): Promise<{ message: string; grafico: GraficoPadraoConfig }> {
    const { data } = await api.put(`/graficos-padrao/biblioteca/${id}/ativar`, { ativo });
    return data;
  },

  async atualizarConfig(
    id: string,
    payload: Partial<GraficoPadraoConfig>,
  ): Promise<{ message: string; grafico: GraficoPadraoConfig }> {
    const { data } = await api.put(`/graficos-padrao/biblioteca/${id}`, payload);
    return data;
  },

  async salvarComoPadrao(payload: {
    servicoId: string;
    titulo: string;
    tipo: string;
    placeholderEixoX: string[];
    placeholderEixoY: string[];
    descricao?: string;
    categoria?: string;
    cor?: string;
  }): Promise<{ message: string; grafico: GraficoPadraoConfig }> {
    const { data } = await api.post('/graficos-padrao/salvar-padrao', payload);
    return data;
  },

  async excluir(id: string): Promise<{ message: string }> {
    const { data } = await api.delete(`/graficos-padrao/biblioteca/${id}`);
    return data;
  },

  async verificarServico(servicoId: string): Promise<unknown> {
    const { data } = await api.get(`/graficos-padrao/biblioteca/verificar-servico/${servicoId}`);
    return data;
  },
};

export default graficosPadraoService;
