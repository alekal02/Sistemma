/**
 * Unidade operacional do serviço — define como o ciclo/dashboard
 * exibe a métrica principal (m², km, m linear, árvores vs coleta).
 */

export type ModoMetricaServico =
  | 'coleta'
  | 'rocada'
  | 'km_linear'
  | 'metro_linear'
  | 'arvores';

export interface UnidadeOperacional {
  modo: ModoMetricaServico;
  /** Rótulo curto da métrica (ex.: Área, Extensão) */
  labelMetrica: string;
  /** Sufixo padrão (m², km, m, arv) */
  sufixo: string;
  /** Se true, não usa painel/validação de viagem de coleta */
  semViagemColeta: boolean;
}

export function unidadeOperacionalDoTipo(tipoServico?: string | null): UnidadeOperacional {
  switch (String(tipoServico || '')) {
    case 'rocadeira':
      return { modo: 'rocada', labelMetrica: 'Área', sufixo: 'm²', semViagemColeta: true };
    case 'capina':
      // Planilha traz QUANTITATIVO em km ou m; sempre espelhamos metro linear nos KPIs
      return { modo: 'metro_linear', labelMetrica: 'Metro linear', sufixo: 'm', semViagemColeta: true };
    case 'varricao':
      return { modo: 'km_linear', labelMetrica: 'KM linear', sufixo: 'km', semViagemColeta: true };
    case 'poda':
      return { modo: 'arvores', labelMetrica: 'Árvores', sufixo: 'arv', semViagemColeta: true };
    case 'pintura_meio_fio':
      return { modo: 'metro_linear', labelMetrica: 'Metro linear', sufixo: 'm', semViagemColeta: true };
    default:
      return { modo: 'coleta', labelMetrica: 'Viagens', sufixo: '', semViagemColeta: false };
  }
}

export function ehServicoPorUnidade(tipoServico?: string | null): boolean {
  return unidadeOperacionalDoTipo(tipoServico).semViagemColeta;
}

/** Escolhe valor + sufixo do dia conforme o tipo e os campos agregados */
export function metricaPrincipalDoDia(
  tipoServico: string | undefined | null,
  d: {
    areaM2?: number;
    metroLinear?: number;
    kmLinear?: number;
    qtdArvore?: number;
    quantitativo?: number;
    viagens?: number;
    rotas?: number;
  },
): { valor: number; sufixo: string; label: string } {
  const u = unidadeOperacionalDoTipo(tipoServico);
  const area = Number(d.areaM2 || 0);
  const kmLin = Number(d.kmLinear || 0);
  const mLin = Number(d.metroLinear || 0);
  const arv = Number(d.qtdArvore || 0);

  if (u.modo === 'rocada') {
    return { valor: area, sufixo: 'm²', label: 'Área' };
  }
  if (u.modo === 'arvores') {
    return { valor: arv || Number(d.quantitativo || 0), sufixo: 'arv', label: 'Árvores' };
  }
  if (u.modo === 'km_linear') {
    // Capina pode vir em km; se só houver metro linear, exibe metros
    if (kmLin > 0) return { valor: kmLin, sufixo: 'km', label: u.labelMetrica };
    if (mLin > 0) return { valor: mLin, sufixo: 'm', label: 'Metro linear' };
    return { valor: Number(d.quantitativo || 0), sufixo: u.sufixo, label: u.labelMetrica };
  }
  if (u.modo === 'metro_linear') {
    if (mLin > 0) return { valor: mLin, sufixo: 'm', label: 'Metro linear' };
    if (kmLin > 0) return { valor: kmLin, sufixo: 'km', label: 'KM linear' };
    return { valor: Number(d.quantitativo || 0), sufixo: 'm', label: 'Metro linear' };
  }
  return { valor: Number(d.viagens || 0), sufixo: '', label: 'Viagens' };
}

export function diaTemOperacaoUnidade(
  tipoServico: string | undefined | null,
  d: {
    areaM2?: number;
    metroLinear?: number;
    kmLinear?: number;
    qtdArvore?: number;
    quantitativo?: number;
    viagens?: number;
    rotas?: number;
  },
): boolean {
  const u = unidadeOperacionalDoTipo(tipoServico);
  if (u.modo === 'coleta') return Number(d.viagens || 0) > 0;
  const m = metricaPrincipalDoDia(tipoServico, d);
  return m.valor > 0 || Number(d.rotas || 0) > 0;
}

export function formatarMetricaUnidade(valor: number, sufixo: string, dec = 1): string {
  const n = Number(valor) || 0;
  const casas = sufixo === 'm²' || sufixo === 'arv' ? 0 : (n >= 100 ? 1 : 3);
  const fmt = n.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: dec ?? casas,
  });
  return sufixo ? `${fmt} ${sufixo}` : fmt;
}
