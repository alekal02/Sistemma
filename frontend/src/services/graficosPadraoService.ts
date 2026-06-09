const API_URL = '/api/graficos-padrao';
const TOKEN_KEY = '@abastecimento:token';

async function getHeaders(): Promise<Record<string, string>> {
  const token = localStorage.getItem(TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

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
  /**
   * Lista a biblioteca de gráficos padrão
   */
  async listarBiblioteca(tipoServico?: string, apenasAtivos?: boolean): Promise<GraficoPadraoResponse> {
    const params = new URLSearchParams();
    if (tipoServico) params.set('tipoServico', tipoServico);
    if (apenasAtivos) params.set('apenasAtivos', 'true');

    const url = `${API_URL}/biblioteca${params.toString() ? '?' + params.toString() : ''}`;
    const res = await fetch(url, { headers: await getHeaders() });
    if (!res.ok) throw new Error('Erro ao carregar biblioteca de gráficos');
    return res.json();
  },

  /**
   * Ativa/desativa um gráfico na biblioteca
   */
  async toggleAtivo(id: string, ativo: boolean): Promise<{ message: string; grafico: GraficoPadraoConfig }> {
    const res = await fetch(`${API_URL}/biblioteca/${id}/ativar`, {
      method: 'PUT',
      headers: await getHeaders(),
      body: JSON.stringify({ ativo }),
    });
    if (!res.ok) throw new Error('Erro ao alterar status do gráfico');
    return res.json();
  },

  /**
   * Atualiza configuração de um gráfico na biblioteca
   */
  async atualizarConfig(id: string, data: Partial<GraficoPadraoConfig>): Promise<{ message: string; grafico: GraficoPadraoConfig }> {
    const res = await fetch(`${API_URL}/biblioteca/${id}`, {
      method: 'PUT',
      headers: await getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Erro ao atualizar gráfico');
    return res.json();
  },

  /**
   * Salva um gráfico personalizado como padrão
   */
  async salvarComoPadrao(data: {
    servicoId: string;
    titulo: string;
    tipo: string;
    placeholderEixoX: string[];
    placeholderEixoY: string[];
    descricao?: string;
    categoria?: string;
    cor?: string;
  }): Promise<{ message: string; grafico: GraficoPadraoConfig }> {
    const res = await fetch(`${API_URL}/salvar-padrao`, {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Erro ao salvar gráfico como padrão');
    return res.json();
  },

  /**
   * Remove um gráfico personalizado da biblioteca
   */
  async excluir(id: string): Promise<{ message: string }> {
    const res = await fetch(`${API_URL}/biblioteca/${id}`, {
      method: 'DELETE',
      headers: await getHeaders(),
    });
    if (!res.ok) throw new Error('Erro ao excluir gráfico');
    return res.json();
  },

  /**
   * Verifica gráficos padrão para um serviço específico
   */
  async verificarServico(servicoId: string): Promise<any> {
    const res = await fetch(`${API_URL}/biblioteca/verificar-servico/${servicoId}`, {
      headers: await getHeaders(),
    });
    if (!res.ok) throw new Error('Erro ao verificar gráficos do serviço');
    return res.json();
  },
};

export default graficosPadraoService;
