import api from './api'
import { cachedFetch, chaveContrato, invalidateCacheExact } from './requestCache'

export function invalidateContratoCache(id: string): void {
  invalidateCacheExact(chaveContrato(id))
}

export interface ContratoSaude {
  id: string
  numeroContrato: string
  status: 'ativo' | 'encerrado'
  diaInicioCiclo?: number
  statusSaude: 'green' | 'yellow' | 'red'
  totalServicos: number
  servicosConfigurados: number
  servicosComUpload: number
  servicosSemKpi: number
  totalRegistros: number
  totalKpisAtivos: number
  ultimoUpload: string | null
  tiposServico: string[]
}

export interface ContratoDetalhe {
  id: string
  numeroContrato: string
  status: 'ativo' | 'encerrado'
  diaInicioCiclo?: number
  valorTonelada?: number | null
  valorMini?: number | null
  valorTruck?: number | null
  valorToco?: number | null
  valorBasculante?: number | null
  configResumo?: Record<string, unknown> | null
  configOperacional?: {
    placasReserva?: string[];
    placasAtivas?: string[];
    motoristas?: string[];
    coletores?: string[];
    pesoMaximoKg?: { MINI?: number; TOCO?: number; BASCULANTE?: number; TRUCK?: number };
    volumeL?: { MINI?: number; TOCO?: number; BASCULANTE?: number; TRUCK?: number };
    densidadeResiduoKgL?: number | null;
    densidadeKgL?: { MINI?: number; TOCO?: number; BASCULANTE?: number; TRUCK?: number };
  } | null
}

const contractService = {
  async listarSaude(): Promise<ContratoSaude[]> {
    const { data } = await api.get<{ contratos: ContratoSaude[] }>('/contracts/saude')
    const lista = data.contratos || []
    return lista.sort((a, b) =>
      a.numeroContrato.localeCompare(b.numeroContrato, 'pt-BR', { sensitivity: 'base' }),
    )
  },

  async listar(): Promise<Array<{ id: string; numeroContrato: string }>> {
    const { data } = await api.get<{ contratos: Array<{ id: string; numeroContrato: string }> }>('/contracts')
    const lista = data.contratos || []
    return lista.sort((a, b) =>
      a.numeroContrato.localeCompare(b.numeroContrato, 'pt-BR', { sensitivity: 'base' }),
    )
  },

  async buscar(id: string, opts?: { force?: boolean }): Promise<ContratoDetalhe> {
    return cachedFetch(
      chaveContrato(id),
      async () => {
        const { data } = await api.get<ContratoDetalhe>(`/contracts/${id}`)
        return data
      },
      { force: opts?.force },
    )
  },

  async criar(payload: { numeroContrato: string; diaInicioCiclo?: number }): Promise<ContratoDetalhe> {
    const { data } = await api.post<ContratoDetalhe>('/contracts', payload)
    return data
  },

  async atualizar(
    id: string,
    payload: Partial<{
      numeroContrato: string
      diaInicioCiclo: number
      configOperacional: {
        placasReserva?: string[];
        placasAtivas?: string[];
        motoristas?: string[];
        coletores?: string[];
        pesoMaximoKg?: { MINI?: number; TOCO?: number; BASCULANTE?: number; TRUCK?: number };
        volumeL?: { MINI?: number; TOCO?: number; BASCULANTE?: number; TRUCK?: number };
        densidadeResiduoKgL?: number | null;
        densidadeKgL?: { MINI?: number; TOCO?: number; BASCULANTE?: number; TRUCK?: number };
      }
    }>,
  ): Promise<ContratoDetalhe> {
    const { data } = await api.put<ContratoDetalhe>(`/contracts/${id}`, payload)
    invalidateContratoCache(id)
    return data
  },

  async excluir(id: string): Promise<void> {
    await api.delete(`/contracts/${id}`)
  },
}

export default contractService
