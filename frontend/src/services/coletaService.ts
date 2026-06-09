/* ============================================
   COLETA SERVICE — Consome /api/coleta
   ============================================ */
import api from './api'

export interface ResumoColeta {
  totalRegistros: number
  totalPeso: number
  mediaPeso: number
  totalKm: number
  mediaKm: number
  totalViagens: number
  mediaViagens: number
  totalHorasFora: number
  mediaHorasFora: number
  totalCaminhoes: number
  totalMotoristas: number
  totalRegionais: number
  totalColetores: number
  totalHorasTrabalhadas: number
}

export interface PesoPorRegional {
  regional: string
  total_peso: number
  quantidade: number
}

export interface PesoPorDia {
  data: string
  total_peso: number
  quantidade: number
  total_km: number
  total_viagens: number
}

export interface TopPlaca {
  placa: string
  total_peso: number
  quantidade: number
  total_km: number
  total_viagens: number
}

export interface TipoCaminhao {
  tipo: string
  quantidade: number
  total_peso: number
  media_peso: number
}

export interface DadosPorTurno {
  turno: string
  quantidade: number
  total_peso: number
  media_peso: number
}

export interface TopMotorista {
  motorista: string
  total_peso: number
  quantidade: number
  total_km: number
  total_viagens: number
}

export interface DadosPorDiaSemana {
  diaSemana: number
  quantidade: number
  total_peso: number
  total_km: number
  total_viagens: number
}

const DIAS_SEMANA = ['', 'Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function nomeDiaSemana(dia: number): string {
  return DIAS_SEMANA[dia] || `Dia ${dia}`
}

export interface DashboardColeta {
  resumo: ResumoColeta
  pesoPorRegional: PesoPorRegional[]
  pesoPorDia: PesoPorDia[]
  topPlacas: TopPlaca[]
  tipoCaminhao: TipoCaminhao[]
  dadosPorTurno: DadosPorTurno[]
  topMotoristas: TopMotorista[]
  dadosPorDiaSemana: DadosPorDiaSemana[]
  listaRegionais: string[]
  listaDistritos: string[]
  listaUploads: { id: number; nome: string; criadoEm: Date; totalLinhas: number; importadas: number }[]
}

export interface ResultadoUpload {
  sucesso: boolean
  planilhaUploadId: number
  totalLinhas: number
  importadas: number
  erros: number
  mensagem: string
}

const coletaService = {
  /** Busca dados agregados do dashboard */
  async dashboard(filtros?: { dataInicio?: string; dataFim?: string; regional?: string; distrito?: string; planilhaId?: number }): Promise<DashboardColeta> {
    const params = new URLSearchParams()
    if (filtros?.dataInicio) params.set('dataInicio', filtros.dataInicio)
    if (filtros?.dataFim) params.set('dataFim', filtros.dataFim)
    if (filtros?.regional) params.set('regional', filtros.regional)
    if (filtros?.distrito) params.set('distrito', filtros.distrito)
    if (filtros?.planilhaId) params.set('planilhaId', String(filtros.planilhaId))
    const query = params.toString()
    const url = query ? `/coleta/dashboard?${query}` : '/coleta/dashboard'
    const response = await api.get<DashboardColeta>(url)
    return response.data
  },

  /** Faz upload de planilha XLSX */
  async uploadPlanilha(file: File, servicoId?: string): Promise<ResultadoUpload> {
    const formData = new FormData()
    formData.append('planilha', file)
    if (servicoId) formData.append('servico_id', servicoId)
    const response = await api.post<ResultadoUpload>('/coleta/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  /** Lista histórico de uploads */
  async listarUploads() {
    const response = await api.get('/coleta/uploads')
    return response.data
  },

  /** Lista dados brutos com paginação */
  async listarDados(params?: { page?: number; limit?: number; regional?: string; turno?: string; placa?: string; dataInicio?: string; dataFim?: string; planilhaId?: number }) {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set('page', String(params.page))
    if (params?.limit) searchParams.set('limit', String(params.limit))
    if (params?.regional) searchParams.set('regional', params.regional)
    if (params?.turno) searchParams.set('turno', params.turno)
    if (params?.placa) searchParams.set('placa', params.placa)
    if (params?.dataInicio) searchParams.set('dataInicio', params.dataInicio)
    if (params?.dataFim) searchParams.set('dataFim', params.dataFim)
    if (params?.planilhaId) searchParams.set('planilhaId', String(params.planilhaId))
    const query = searchParams.toString()
    const url = query ? `/coleta/dados?${query}` : '/coleta/dados'
    const response = await api.get(url)
    return response.data
  },

  /** Atualiza um registro de coleta */
  async atualizarDado(id: number, dados: Record<string, any>) {
    const response = await api.put(`/coleta/dados/${id}`, dados)
    return response.data
  },

  /** Exclui um registro de coleta */
  async excluirDado(id: number) {
    const response = await api.delete(`/coleta/dados/${id}`)
    return response.data
  },

  /** Renomeia o arquivo de um upload */
  async renomearUpload(id: number, nome: string) {
    const response = await api.put(`/coleta/uploads/${id}/rename`, { nome })
    return response.data
  },

  /** Busca estudo detalhado das viagens de um registro de coleta */
  async getEstudoViagens(id: number) {
    const response = await api.get(`/coleta/estudo-viagens/${id}`)
    return response.data as Promise<{
      viagens: {
        numero: number
        km: number | null
        hora: number | null
        horaFormatada: string
        duracaoMinutos: number
        duracaoFormatada: string
        velocidadeMedia: number | null
      }[]
      totalKm: number
      totalHoras: number
    }>
  },

  /** Gera relatório de qualidade dos dados de um upload específico */
  async relatorioQualidade(uploadId: number) {
    const response = await api.get(`/coleta/qualidade/${uploadId}`)
    return response.data as Promise<{
      uploadId: number
      nomeArquivo: string
      totalRegistros: number
      totalProblemas: number
      pontuacaoQualidade: number
      problemas: {
        tipo: string
        label: string
        descricao: string
        gravidade: 'crítico' | 'alto' | 'médio' | 'baixo'
        quantidade: number
        percentual: number
        amostra: {
          id: number
          placa: string | null
          motorista: string | null
          data: string | null
          valorAtual: any
        }[]
      }[]
      resumo: {
        registrosValidos: number
        registrosComAlgumProblema: number
        percentualValido: number
        categorias: {
          kmNegativo: number
          semPeso: number
          semKmInicial: number
          semKmFinal: number
          semKmTotal: number
          semPlaca: number
          semMotorista: number
        }
      }
    }>
  },

  /** Gera relatório de qualidade do último upload de um serviço */
  async relatorioQualidadeServico(servicoId: string) {
    const response = await api.get(`/coleta/qualidade/servico/${servicoId}`)
    return response.data
  },
}

export default coletaService
