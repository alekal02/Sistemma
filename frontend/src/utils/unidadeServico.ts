/**
 * Unidade operacional do serviço — define como o ciclo/dashboard
 * exibe a métrica principal (m², km, m linear, árvores, pontos vs coleta).
 * O valor oficial vem de metricaOficialServico (@sistemma/shared).
 */
import { metricaDeRegistro, metricaOficialServico, type CamposMetricaServico } from '@sistemma/shared';

export { metricaDeRegistro, metricaOficialServico };

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
      return { modo: 'metro_linear', labelMetrica: 'Metro linear', sufixo: 'm', semViagemColeta: true };
    case 'varricao':
      return { modo: 'km_linear', labelMetrica: 'KM linear', sufixo: 'km', semViagemColeta: true };
    case 'poda':
      return { modo: 'arvores', labelMetrica: 'Árvores', sufixo: 'arv', semViagemColeta: true };
    case 'remocao':
      return { modo: 'arvores', labelMetrica: 'Pontos', sufixo: 'pts', semViagemColeta: true };
    case 'geral':
      return { modo: 'arvores', labelMetrica: 'Pontos', sufixo: 'pts', semViagemColeta: true };
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
  d: CamposMetricaServico & { viagens?: number; rotas?: number },
): { valor: number; sufixo: string; label: string } {
  const u = unidadeOperacionalDoTipo(tipoServico);
  if (u.modo === 'coleta') {
    return { valor: Number(d.viagens || 0), sufixo: '', label: 'Viagens' };
  }
  const m = metricaOficialServico(tipoServico, d);
  return { valor: m.valor, sufixo: m.sufixo, label: m.label };
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
  const casas = sufixo === 'm²' || sufixo === 'arv' || sufixo === 'pts' ? 0 : (n >= 100 ? 1 : 3);
  const fmt = n.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: dec ?? casas,
  });
  return sufixo ? `${fmt} ${sufixo}` : fmt;
}
