/* ============================================
   ABASTECIMENTO SERVICE — CRUD de abastecimentos
   Consome /api/abastecimentos via cliente axios com JWT
   ============================================ */
import api from './api'
import type { Abastecimento } from '../types'

export interface AbastecimentoPayload {
  placa: string
  litragem: string | null
  valor: string | null
  dataHora: string
  dataAbastecimento: string
  imagemUrl: string
  litragemExtraida?: number | null
  valorExtraido?: number | null
}

export interface AbastecimentoListarParams {
  placa?: string
  dataInicio?: string
  dataFim?: string
  usuarioCriadorId?: string
  page?: number
  limit?: number
}

export interface AbastecimentoListarResponse {
  sucesso: boolean
  abastecimentos: Abastecimento[]
  total: number
  pagina: number
  totalPaginas: number
  limite: number
}

const abastecimentoService = {
  /** Envia imagem para extração OCR/LLM */
  async uploadImagem(imagemBase64: string) {
    const response = await api.post('/abastecimentos/upload', { imagem: imagemBase64 })
    return response.data
  },

  /** Cria um novo abastecimento */
  async criar(dados: AbastecimentoPayload) {
    const response = await api.post('/abastecimentos', dados)
    return response.data
  },

  /** Atualiza um abastecimento (admin) */
  async atualizar(id: string, dados: Partial<AbastecimentoPayload>) {
    const response = await api.put(`/abastecimentos/${id}`, dados)
    return response.data
  },

  /** Lista logs de alteração de um abastecimento (admin) */
  async listarLogsPorAbastecimento(abastecimentoId: string) {
    const response = await api.get(`/abastecimentos/${abastecimentoId}/logs`)
    return response.data
  },

  /** Lista todos os logs de alteração (admin) */
  async listarTodosLogs(params?: {
    page?: number
    limit?: number
    placa?: string
    dataInicio?: string
    dataFim?: string
    alteradoPorId?: string
  }) {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.append('page', String(params.page))
    if (params?.limit) searchParams.append('limit', String(params.limit))
    if (params?.placa) searchParams.append('placa', params.placa)
    if (params?.dataInicio) searchParams.append('dataInicio', params.dataInicio)
    if (params?.dataFim) searchParams.append('dataFim', params.dataFim)
    if (params?.alteradoPorId) searchParams.append('alteradoPorId', params.alteradoPorId)
    const query = searchParams.toString()
    const url = query ? `/abastecimentos/logs?${query}` : '/abastecimentos/logs'
    const response = await api.get(url)
    return response.data
  },

  /** Lista abastecimentos com filtros */
  async listar(params?: AbastecimentoListarParams): Promise<AbastecimentoListarResponse> {
    const searchParams = new URLSearchParams()
    if (params?.placa) searchParams.append('placa', params.placa)
    if (params?.dataInicio) searchParams.append('dataInicio', params.dataInicio)
    if (params?.dataFim) searchParams.append('dataFim', params.dataFim)
    if (params?.usuarioCriadorId) searchParams.append('usuarioCriadorId', params.usuarioCriadorId)
    if (params?.page) searchParams.append('page', String(params.page))
    if (params?.limit !== undefined) searchParams.append('limit', String(params.limit))

    const query = searchParams.toString()
    const url = query ? `/abastecimentos?${query}` : '/abastecimentos'
    const response = await api.get<AbastecimentoListarResponse>(url)
    return response.data
  },
}

export default abastecimentoService
