/** Verifica se o intervalo [dataInicio, dataFim] cobre pelo menos parte de [dadosIni, dadosFim] */
import { normalizarDataParaIso } from './normalizarDataIso';

export function periodosTemSobreposicao(
  dataInicio: string,
  dataFim: string,
  dadosIni: string,
  dadosFim: string,
): boolean {
  const ini = new Date(dataInicio);
  const fim = new Date(dataFim + 'T23:59:59');
  const dIni = new Date(dadosIni);
  const dFim = new Date(dadosFim + 'T23:59:59');
  if (isNaN(ini.getTime()) || isNaN(fim.getTime()) || isNaN(dIni.getTime()) || isNaN(dFim.getTime())) {
    return true;
  }
  return dIni <= fim && dFim >= ini;
}

export function formatarIsoParaBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export interface PeriodoIso {
  dataInicio: string;
  dataFim: string;
}

/** Calcula min/max de dataSaida em registros brutos do serviço */
export function calcularPeriodoDosDados(dados: Record<string, unknown>[]): PeriodoIso | null {
  const datas = dados
    .map((d) => normalizarDataParaIso(
      d.dataSaida ?? d['DATA SAIDA'] ?? d['DATA SAÍDA'] ?? d['DATA'],
    ))
    .filter((d): d is string => !!d);

  if (datas.length === 0) return null;
  datas.sort((a, b) => a.localeCompare(b));
  return {
    dataInicio: datas[0],
    dataFim: datas[datas.length - 1],
  };
}

export function unirPeriodos(a: PeriodoIso | null, b: PeriodoIso | null): PeriodoIso | null {
  if (!a) return b;
  if (!b) return a;
  return {
    dataInicio: a.dataInicio < b.dataInicio ? a.dataInicio : b.dataInicio,
    dataFim: a.dataFim > b.dataFim ? a.dataFim : b.dataFim,
  };
}
