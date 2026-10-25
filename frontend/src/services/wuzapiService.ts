import api from './api'

export interface WuzapiStatus {
  configurado: boolean
  url: string | null
  tokenExiste: boolean
  webhookSecretExiste: boolean
  webhookUrl?: string
  conectado?: boolean
  logado?: boolean
  qrCode?: string | null
  sessao?: {
    connected?: boolean
    loggedIn?: boolean
    jid?: string
    webhook?: string
    events?: string
  } | null
  mensagem?: string
  erroSessao?: string
  wuzapiOffline?: boolean
  wuzapiOnline?: boolean
}

export interface WhatsappGrupoMapaItem {
  id: string
  grupoJid: string
  nomeGrupo: string | null
  servicoId: string
  servicoNome: string | null
  contratoNome: string | null
  ativo: boolean
  estrategia: string
  responderPdf: boolean
  criadoEm: string
}

export interface WhatsappGrupoWhatsAppItem {
  jid: string
  nome: string
  participantes: number
  jaMapeado?: boolean
}

export interface RecebimentoWhatsapp {
  em: string
  grupoJid: string
  nomeGrupo: string | null
  tipo: 'relatorio' | 'planilha' | 'ignorado'
  resumo: string
}

export interface WhatsappGrupoPayload {
  grupoJid: string
  nomeGrupo?: string | null
  servicoId: string
  estrategia?: string
  responderPdf?: boolean
  ativo?: boolean
}

const wuzapiService = {
  async status(): Promise<WuzapiStatus> {
    const { data } = await api.get<WuzapiStatus>('/wuzapi/status')
    return data
  },

  async connect(): Promise<{ sucesso: boolean; message?: string; qrCode?: string | null; erro?: string }> {
    const { data } = await api.post('/wuzapi/connect', {})
    return data
  },

  async disconnect(): Promise<{ sucesso: boolean; message?: string; erro?: string }> {
    const { data } = await api.post('/wuzapi/disconnect', {})
    return data
  },

  async qr(): Promise<{ sucesso: boolean; qrCode?: string | null }> {
    const { data } = await api.get('/wuzapi/qr')
    return data
  },

  async listarGruposWhatsApp(): Promise<WhatsappGrupoWhatsAppItem[]> {
    const { data } = await api.get<{ grupos: WhatsappGrupoWhatsAppItem[] }>('/wuzapi/grupos-whatsapp')
    return data.grupos || []
  },

  async listarRecebimentos(): Promise<RecebimentoWhatsapp[]> {
    const { data } = await api.get<{ recebimentos: RecebimentoWhatsapp[] }>('/wuzapi/recebimentos')
    return data.recebimentos || []
  },

  async listarGrupos(): Promise<WhatsappGrupoMapaItem[]> {
    const { data } = await api.get<WhatsappGrupoMapaItem[]>('/wuzapi/grupos')
    return Array.isArray(data) ? data : []
  },

  async criarGrupo(payload: WhatsappGrupoPayload): Promise<WhatsappGrupoMapaItem> {
    const { data } = await api.post<WhatsappGrupoMapaItem>('/wuzapi/grupos', payload)
    return data
  },

  async atualizarGrupo(id: string, payload: Partial<WhatsappGrupoPayload>): Promise<WhatsappGrupoMapaItem> {
    const { data } = await api.put<WhatsappGrupoMapaItem>(`/wuzapi/grupos/${id}`, payload)
    return data
  },

  async excluirGrupo(id: string): Promise<void> {
    await api.delete(`/wuzapi/grupos/${id}`)
  },
}

export default wuzapiService
