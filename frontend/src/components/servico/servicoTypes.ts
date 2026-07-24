import type { ColunaDetectada } from '../KpiEditor/KpiEditorTypes';

export type EtapaMiniFlow = 'upload' | 'indicadoresAuto' | 'revisao' | 'config';

export interface EtapasStatus {
  upload: 'pending' | 'done';
  indicadoresAuto: 'pending' | 'done' | 'skipped';
  revisao: 'pending' | 'done';
  config: 'pending' | 'done';
}

export interface PlanilhaItem {
  id: number;
  nomeArquivo: string;
  totalLinhas: number;
  linhasImportadas: number;
  criadoEm: string;
}

export interface ServicoMiniFlowProps {
  contractId: string;
  servicoId: string;
  servicoNome: string;
  /** Se informado, evita esperar o /padrao para saber o tipo (ex.: roçada) */
  tipoServico?: string;
  onStatusChange?: (status: EtapasStatus) => void;
  onPlanilhasChange?: (info: {
    totalRegistros: number;
    planilhas: PlanilhaItem[];
    temUpload: boolean;
  }) => void;
}

export interface ConferenciaDiaria {
  diasNovos: number;
  diasIguais: number;
  diasDivergentes: number;
  diasBloqueados: number;
  diasSomenteSistema: number;
  temDivergencia: boolean;
  ultimaDataPlanilha: string | null;
  ultimaDataSistema: string | null;
  recomendacao: string;
  dias: Array<{
    data: string;
    dataBr: string;
    status: 'novo' | 'igual' | 'divergente' | 'bloqueado' | 'somente_sistema';
    planilha: { rotas: number; viagens: number; pesoKg: number; km: number } | null;
    sistema: { rotas: number; viagens: number; pesoKg: number; km: number } | null;
    diferencas: string[];
  }>;
}

export interface ResumoImportacao {
  importados: number;
  validasDashboard: number;
  inconsistentes: number;
  uploadsRemovidos?: number;
  registrosPreservados?: number;
  /** Modelo de planilha de roçada detectado (ex.: qgis, betim_trator) */
  modeloRocada?: string | null;
  modeloRocadaLabel?: string | null;
  areaTotalM2?: number | null;
}

export interface ConfigFaturamentoState {
  tipoCobranca: string;
  valorTonelada: number | null;
  valorMini: number | null;
  valorTruck: number | null;
  valorToco: number | null;
  valorBasculante: number | null;
  valorKmLinear: number | null;
  valorM2: number | null;
  valorM2Manual: number | null;
  valorM2Mecanizada: number | null;
  valorPorArvore: number | null;
  valorPorUnidade: number | null;
  colunaQuantidade: string;
  colunaTipoCaminhao: string;
  ativo: boolean;
}

export type { ColunaDetectada };
