/* ============================================
   CLIENTE API — Axios configurado com JWT
   ============================================ */
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3200/api'

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// Interceptor: adiciona token JWT em toda requisição
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('@abastecimento:token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Interceptor: trata erro 401 redirecionando para login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // ⚠️ Não redireciona se for a rota de login (senão o catch do Login.tsx nunca executa)
    const isLoginRoute = error.config?.url?.includes('/auth/login')
    if (error.response?.status === 401 && !isLoginRoute) {
      localStorage.removeItem('@abastecimento:token')
      localStorage.removeItem('@abastecimento:user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api

/* ============================================
   SERVIÇOS DE AUTENTICAÇÃO
   ============================================ */
export const authService = {
  async login(email: string, senha: string) {
    const { data } = await api.post('/auth/login', { email, senha })
    return data
  },

  async register(nome: string, email: string, senha: string) {
    const { data } = await api.post('/auth/register', { nome, email, senha })
    return data
  },

  async me() {
    const { data } = await api.get('/auth/me')
    return data
  },

  async updateProfile(dados: { nome?: string; email?: string; senha?: string }) {
    const { data } = await api.put('/auth/profile', dados)
    return data
  },
}

/* ============================================
   SERVIÇOS DE ABASTECIMENTO
   ============================================ */
export const abastecimentoService = {
  async uploadImagem(imagemBase64: string) {
    const { data } = await api.post('/abastecimentos/upload', { imagem: imagemBase64 })
    return data
  },

  async criar(dados: {
    placa: string
    litragem: number
    valor: number
    dataAbastecimento: string
    horario: string
    imagemUrl?: string
    observacoes?: string
  }) {
    const { data } = await api.post('/abastecimentos', dados)
    return data
  },

  async listar(filtros?: { placa?: string; dataInicio?: string; dataFim?: string }) {
    const params = new URLSearchParams()
    if (filtros?.placa) params.append('placa', filtros.placa)
    if (filtros?.dataInicio) params.append('dataInicio', filtros.dataInicio)
    if (filtros?.dataFim) params.append('dataFim', filtros.dataFim)
    const query = params.toString()
    const { data } = await api.get(`/abastecimentos${query ? `?${query}` : ''}`)
    return data
  },
}

/* ============================================
   SERVIÇOS DE DASHBOARD
   ============================================ */
export const dashboardService = {
  async hoje() {
    const { data } = await api.get('/dashboard/hoje')
    return data
  },
}

/* ============================================
   SERVIÇOS DE CAMINHÕES
   ============================================ */
export const caminhaoService = {
  /** Lista todos os caminhões */
  async listar() {
    const { data } = await api.get('/caminhoes')
    return data
  },

  /** Busca caminhões por termo da placa (autocomplete) */
  async autocomplete(termo: string) {
    const { data } = await api.get(`/caminhoes/autocomplete?termo=${encodeURIComponent(termo)}`)
    return data
  },

  /** Cria um novo caminhão (admin) */
  async criar(dados: { modelo: string; ano: number; placa: string; codigo: string }) {
    const { data } = await api.post('/caminhoes', dados)
    return data
  },

  /** Atualiza um caminhão (admin) */
  async atualizar(id: string, dados: { modelo?: string; ano?: number; placa?: string; codigo?: string }) {
    const { data } = await api.put(`/caminhoes/${id}`, dados)
    return data
  },

  /** Exclui um caminhão (admin) */
  async excluir(id: string) {
    const { data } = await api.delete(`/caminhoes/${id}`)
    return data
  },
}
