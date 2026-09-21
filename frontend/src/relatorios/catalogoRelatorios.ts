export type RelatorioEscopo = 'ciclo' | 'dia' | 'contrato';

export interface RelatorioCatalogoItem {
  id: string;
  label: string;
  descricao: string;
  escopo: RelatorioEscopo;
  tiposServico?: string[];
}

export const CATALOGO_RELATORIOS: RelatorioCatalogoItem[] = [
  {
    id: 'dia',
    label: 'Relatório do dia',
    descricao: 'Operação do dia escolhido — um PDF por serviço com dados',
    escopo: 'dia',
  },
  {
    id: 'ciclo_contrato',
    label: 'Ciclo do contrato',
    descricao: 'Todos os serviços do ciclo de medição',
    escopo: 'contrato',
  },
  {
    id: 'ciclo',
    label: 'Ciclo operacional',
    descricao: 'Totais e dia a dia do ciclo do serviço',
    escopo: 'ciclo',
  },
  {
    id: 'melhoria',
    label: 'Melhoria do ciclo',
    descricao: 'Comparativo operacional: ciclo anterior × atual',
    escopo: 'ciclo',
  },
  {
    id: 'semanal',
    label: 'Semanal',
    descricao: 'Últimos 7 dias de coleta',
    escopo: 'ciclo',
    tiposServico: ['coleta_caminhao'],
  },
  {
    id: 'quinzenal',
    label: 'Quinzenal',
    descricao: 'Últimos 15 dias de coleta',
    escopo: 'ciclo',
    tiposServico: ['coleta_caminhao'],
  },
  {
    id: 'hodometro',
    label: 'Saúde do hodômetro',
    descricao: 'Caminhões com hodômetro quebrado / KM não informado',
    escopo: 'ciclo',
    tiposServico: ['coleta_caminhao'],
  },
];

export function relatoriosDoContexto(opts: {
  escopo: RelatorioEscopo | RelatorioEscopo[];
  tipoServico?: string;
}): RelatorioCatalogoItem[] {
  const escopos = Array.isArray(opts.escopo) ? opts.escopo : [opts.escopo];
  const tipo = String(opts.tipoServico || '');
  return CATALOGO_RELATORIOS.filter((item) => {
    if (!escopos.includes(item.escopo)) return false;
    if (item.tiposServico?.length && tipo && !item.tiposServico.includes(tipo)) return false;
    return true;
  });
}
