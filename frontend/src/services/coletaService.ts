/* ============================================
   COLETA SERVICE — Consome /api/coleta
   ============================================ */
import api from './api'
import { nextAbortSignal } from './abortableRequest'

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
};

export interface TopMotorista {
  motorista: string
  total_peso: number
  quantidade: number
  total_km: number
  total_viagens: number
};

export interface DadosPorDiaSemana {
  diaSemana: number
  quantidade: number
  total_peso: number
  total_km: number
  total_viagens: number
};

const DIAS_SEMANA = ['', 'Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

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
  importadas?: number
  importados?: number
  erros?: number
  mensagem: string
  viagensInconsistentes?: number
  viagensValidasDashboard?: number
  viagensCorrigidas?: number
  consolidacao?: {
    registrosRemovidosAusentes: number
    uploadsRemovidos: number
    uploadsRemovidosIds: number[]
    diasRemovidosAusentes: string[]
  }
  resumo?: {
    viagensInconsistentes?: number
    viagensValidasDashboard?: number
    viagensCorrigidas?: number
  }
  avisos?: string[]
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
    const response = await api.get<DashboardColeta>(url, {
      signal: nextAbortSignal('coleta:dashboard'),
    })
    return response.data
  },

  /** Faz upload de planilha XLSX / XLSM */
  async uploadPlanilha(
    file: File,
    servicoId?: string,
    estrategia?: 'ignorar' | 'substituir' | 'atualizar_data' | 'inserir_data',
  ): Promise<ResultadoUpload> {
    const formData = new FormData()
    formData.append('planilha', file)
    if (servicoId) formData.append('servico_id', servicoId)
    if (estrategia) formData.append('estrategia', estrategia)
    const response = await api.post<ResultadoUpload>('/coleta/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  /** Upload no contrato: detecta tipo (CONSOLIDADO / coleta / roçada) e envia ao serviço certo. */
  async uploadPlanilhaContrato(
    file: File,
    contractId: string,
    estrategia: 'ignorar' | 'substituir' | 'atualizar_data' | 'inserir_data' = 'atualizar_data',
  ) {
    const formData = new FormData()
    formData.append('planilha', file)
    formData.append('contract_id', contractId)
    formData.append('estrategia', estrategia)
    const { data } = await api.post('/coleta/upload/contrato', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data as ResultadoUpload & {
      modo?: string
      tipoDetectado?: 'unificado' | 'coleta' | 'rocada' | 'desconhecido'
      tipoDetectadoLabel?: string
      servicoId?: string
      servicoNome?: string
      splitPorServico?: Array<{
        servicoId: string
        servicoNome: string
        tipoSistema: string
        importados: number
        quantitativoTotal: number
      }>
      porTipo?: Array<{
        tipoSistema: string
        tipoLabel: string
        registros: number
        quantitativoTotal: number
        undPrincipal: string | null
      }>
      avisos?: string[]
    }
  },

  /** Preview do layout unificado (DATA|UND|QUANTITATIVO|TIPO DE SERVIÇO) */
  async previewServicosUnificados(file: File, servicoId?: string) {
    const formData = new FormData()
    formData.append('planilha', file)
    if (servicoId) formData.append('servico_id', servicoId)
    const { data } = await api.post('/coleta/upload/preview-servicos-unificados', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data as {
      sucesso: boolean
      ehUnificado: boolean
      arquivo?: string
      mensagem: string
      modelo?: string
      abasUsadas?: string[]
      avisos?: string[]
      podeImportar?: boolean
      porTipo?: Array<{
        tipoSistema: string
        tipoLabel: string
        registros: number
        quantitativoTotal: number
        undPrincipal: string | null
        dias: number
        bairros: number
      }>
      resumo?: {
        modelo: string
        modeloLabel?: string
        abas: number
        registros: number
        porTipo?: Array<{
          tipoSistema: string
          tipoLabel: string
          registros: number
          quantitativoTotal: number
          undPrincipal: string | null
          dias: number
          bairros: number
        }>
        podeImportar?: boolean
        avisos?: string[]
      }
    }
  },

  /** Preview multi-modelo de planilha de roçada (filtra Manual/Mecanizada pelo serviço) */
  async previewRocada(file: File, servicoId?: string) {
    const formData = new FormData()
    formData.append('planilha', file)
    if (servicoId) formData.append('servico_id', servicoId)
    const { data } = await api.post('/coleta/upload/preview-rocada', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data as {
      sucesso: boolean
      arquivo?: string
      mensagem: string
      modelo: string
      abasUsadas: string[]
      avisos: string[]
      podeImportar?: boolean
      linhasSemArea?: number
      semColunaArea?: boolean
      filtroTipoAplicado?: 'manual' | 'mecanizada' | null
      servicoNome?: string
      amostraSemArea?: Array<{
        aba: string
        linha: number
        data: string | null
        bairro: string | null
        motivo: string
      }>
      porTipoExecucao?: {
        manual: { registros: number; areaM2: number }
        mecanizada: { registros: number; areaM2: number }
        desconhecido: { registros: number; areaM2: number }
      }
      resumo: {
        modelo: string
        modeloLabel?: string
        abas: number
        registros: number
        areaTotalM2: number
        dias: number
        bairros: number
        linhasSemArea?: number
        semColunaArea?: boolean
        podeImportar?: boolean
        porTipoExecucao?: {
          manual: { registros: number; areaM2: number }
          mecanizada: { registros: number; areaM2: number }
          desconhecido: { registros: number; areaM2: number }
        }
      }
    }
  },

  /** Conferência diária — planilha vs sistema (por data) */
  async conferenciaDiaria(file: File, servicoId: string) {
    const formData = new FormData()
    formData.append('planilha', file)
    formData.append('servico_id', servicoId)
    const { data } = await api.post('/coleta/upload/conferencia-diaria', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data as {
      sucesso: boolean
      arquivo?: string
      totalDatasPlanilha: number
      diasNovos: number
      diasIguais: number
      diasDivergentes: number
      diasBloqueados: number
      diasSomenteSistema: number
      temDivergencia: boolean
      ultimaDataPlanilha: string | null
      ultimaDataSistema: string | null
      recomendacao: string
      dias: Array<{
        data: string
        dataBr: string
        status: 'novo' | 'igual' | 'divergente' | 'bloqueado' | 'somente_sistema'
        planilha: { rotas: number; viagens: number; pesoKg: number; km: number } | null
        sistema: { rotas: number; viagens: number; pesoKg: number; km: number } | null
        diferencas: string[]
      }>
    }
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
    const response = await api.get(url, {
      signal: nextAbortSignal('coleta:listarDados'),
    })
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
          kmRotaAlto: number
        }
      }
    }>
  },

  /** Gera relatório de qualidade do último upload de um serviço */
  async relatorioQualidadeServico(servicoId: string) {
    const response = await api.get(`/coleta/qualidade/servico/${servicoId}`)
    return response.data
  },

  /** Exclui um upload de planilha */
  async excluirUpload(id: number) {
    await api.delete(`/coleta/uploads/${id}`)
  },

  /** Lista uploads de um serviço */
  async listarUploadsServico(servicoId: string) {
    const response = await api.get('/coleta/uploads', { params: { servico_id: servicoId } })
    return response.data
  },

  /** Lista uploads do dia agrupados por contrato (data=YYYY-MM-DD, timezone SP) */
  async listarUploadsPorDia(data?: string) {
    const response = await api.get('/coleta/uploads/por-dia', {
      params: data ? { data } : undefined,
    })
    return response.data as Promise<{
      data: string
      totalUploads: number
      totalContratos: number
      contratos: {
        contratoId: string
        numeroContrato: string
        contratoStatus: string
        totalUploads: number
        totalLinhasImportadas: number
        uploads: {
          uploadId: number
          nomeArquivo: string
          criadoEm: string
          totalLinhas: number
          linhasImportadas: number
          usuarioNome: string | null
          contratoId: string
          numeroContrato: string
          contratoStatus: string
          servicoId: string
          servicoNome: string
          servicoTipo: string
        }[]
      }[]
      uploads: unknown[]
    }>
  },
}

export default coletaService
