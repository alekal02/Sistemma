export interface DashboardFiltrosState {
  contratoId: string;
  servicoId: string;
  mesRef: number;
  anoRef: number;
  diaInicioCiclo: number;
  contratoLabel?: string;
  servicoLabel?: string;
}

export interface ContratoOpcao {
  id: string;
  numeroContrato: string;
}

export interface ServicoOpcao {
  id: string;
  nome: string;
  tipo: string;
}
