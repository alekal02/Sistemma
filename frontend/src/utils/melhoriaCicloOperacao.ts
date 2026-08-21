import type { DadoDiario } from './relatorioDiario';
import { fmtNum } from './relatorioDiario';
import { formatarMetricaUnidade } from './unidadeServico';

export type ModoMelhoriaOperacao = 'coleta' | 'unidade';

export interface TotaisMelhoriaCiclo {
  viagens: number;
  rotas: number;
  toneladas: number;
  km: number;
  metricaUnidade: number;
  metricaLabel: string;
  metricaSufixo: string;
  diasOperados: number;
  diasNoCiclo: number;
  /** Dias de calendário no recorte (início do ciclo até hoje, ou ciclo fechado). */
  diasDecorridos: number;
  mediaViagensPorDia: number;
  mediaTonPorDia: number;
  mediaTonPorViagem: number;
  mediaKmPorDia: number;
  mediaKmPorViagem: number;
  mediaMetricaPorDia: number;
}

export const DIAS_SEMANA_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

export interface DiaComparadoOperacao {
  ordem: number;
  ant: DadoDiario | null;
  atual: DadoDiario | null;
  /** 0=domingo … 6=sábado */
  diaSemana: number;
  /** 1ª, 2ª… ocorrência desse dia da semana no ciclo */
  ocorrencia: number;
}

export function diaSemanaIso(iso: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return -1;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** Ex.: 1ª qua, 2º sáb — mesma ocorrência do dia da semana nos dois ciclos. */
export function rotuloOcorrenciaDiaSemana(diaSemana: number, ocorrencia: number): string {
  if (diaSemana < 0 || diaSemana > 6 || ocorrencia < 1) return '—';
  const nome = DIAS_SEMANA_CURTO[diaSemana];
  const ord = diaSemana === 0 || diaSemana === 6 ? `${ocorrencia}º` : `${ocorrencia}ª`;
  return `${ord} ${nome}`;
}

export interface ParDiaSemanaCiclo<T extends { data: string }> {
  ordem: number;
  ant: T | null;
  atual: T | null;
  diaSemana: number;
  ocorrencia: number;
}

/**
 * Emparelha a N-ésima segunda do ciclo anterior com a N-ésima segunda do atual
 * (terça com terça, domingo com domingo…). Evita cruzar dia útil com fim de semana
 * quando os ciclos começam em dias diferentes.
 * A ordem segue o calendário do ciclo atual (dias decorridos).
 */
export function alinharPorOcorrenciaDiaSemana<T extends { data: string }>(
  anterior: T[],
  atual: T[],
): ParDiaSemanaCiclo<T>[] {
  const ant = [...anterior].filter((d) => d?.data).sort((a, b) => a.data.localeCompare(b.data));
  const atu = [...atual].filter((d) => d?.data).sort((a, b) => a.data.localeCompare(b.data));

  const mapaAnt = new Map<string, T>();
  const contAnt = [0, 0, 0, 0, 0, 0, 0];
  for (const d of ant) {
    const w = diaSemanaIso(d.data);
    if (w < 0) continue;
    contAnt[w] += 1;
    mapaAnt.set(`${w}:${contAnt[w]}`, d);
  }

  const linhas: ParDiaSemanaCiclo<T>[] = [];
  const contAtu = [0, 0, 0, 0, 0, 0, 0];
  for (const d of atu) {
    const w = diaSemanaIso(d.data);
    if (w < 0) continue;
    contAtu[w] += 1;
    linhas.push({
      ordem: linhas.length + 1,
      ant: mapaAnt.get(`${w}:${contAtu[w]}`) ?? null,
      atual: d,
      diaSemana: w,
      ocorrencia: contAtu[w],
    });
  }
  return linhas;
}

export interface VariacaoNum {
  abs: number;
  pct: number | null;
}

export function diaTemProducao(d: DadoDiario | null | undefined, modo: ModoMelhoriaOperacao): boolean {
  if (!d) return false;
  if (modo === 'unidade') {
    return (d.metricaUnidade || 0) > 0 || d.rotas > 0 || (d.areaM2 || 0) > 0;
  }
  return d.viagens > 0 || d.toneladas > 0 || d.rotas > 0;
}

export function resumirCicloOperacao(
  dias: DadoDiario[],
  modo: ModoMelhoriaOperacao,
): TotaisMelhoriaCiclo {
  const ativos = dias.filter((d) => diaTemProducao(d, modo));
  const viagens = ativos.reduce((s, d) => s + d.viagens, 0);
  const rotas = ativos.reduce((s, d) => s + d.rotas, 0);
  const toneladas = ativos.reduce((s, d) => s + d.toneladas, 0);
  const km = ativos.reduce((s, d) => s + d.km, 0);
  const metricaUnidade = ativos.reduce((s, d) => s + (d.metricaUnidade || 0), 0);
  const amostra = ativos.find((d) => (d.metricaLabel || d.metricaSufixo));
  const diasOperados = ativos.length;
  const diasDecorridos = dias.length;
  const denom = diasDecorridos > 0 ? diasDecorridos : 0;
  return {
    viagens,
    rotas,
    toneladas,
    km,
    metricaUnidade,
    metricaLabel: amostra?.metricaLabel || (modo === 'unidade' ? 'Produção' : 'Viagens'),
    metricaSufixo: amostra?.metricaSufixo || '',
    diasOperados,
    diasNoCiclo: diasDecorridos,
    diasDecorridos,
    mediaViagensPorDia: denom > 0 ? viagens / denom : 0,
    mediaTonPorDia: denom > 0 ? toneladas / denom : 0,
    mediaTonPorViagem: viagens > 0 ? toneladas / viagens : 0,
    mediaKmPorDia: denom > 0 ? km / denom : 0,
    mediaKmPorViagem: viagens > 0 ? km / viagens : 0,
    mediaMetricaPorDia: denom > 0 ? metricaUnidade / denom : 0,
  };
}

/** Emparelha pela ocorrência do dia da semana (1ª seg × 1ª seg). */
export function alinharDiasCicloOperacao(
  anterior: DadoDiario[],
  atual: DadoDiario[],
): DiaComparadoOperacao[] {
  return alinharPorOcorrenciaDiaSemana(anterior, atual);
}

export function variacaoAbsPct(atual: number, anterior: number): VariacaoNum {
  const abs = atual - anterior;
  if (anterior === 0) {
    return { abs, pct: atual === 0 ? 0 : null };
  }
  return { abs, pct: Math.round((abs / Math.abs(anterior)) * 1000) / 10 };
}

export function metricaPrincipalDia(
  d: DadoDiario | null,
  modo: ModoMelhoriaOperacao,
): number {
  if (!d) return 0;
  if (modo === 'unidade') return d.metricaUnidade || 0;
  return d.toneladas;
}

export function destacarVariacaoDiaria(
  dias: DiaComparadoOperacao[],
  modo: ModoMelhoriaOperacao,
): { melhor: DiaComparadoOperacao | null; pior: DiaComparadoOperacao | null } {
  let melhor: DiaComparadoOperacao | null = null;
  let pior: DiaComparadoOperacao | null = null;
  let maxDelta = 0;
  let minDelta = 0;
  for (const linha of dias) {
    const temAnt = diaTemProducao(linha.ant, modo);
    const temAtu = diaTemProducao(linha.atual, modo);
    if (!temAnt && !temAtu) continue;
    const delta = metricaPrincipalDia(linha.atual, modo) - metricaPrincipalDia(linha.ant, modo);
    if (delta > maxDelta) {
      maxDelta = delta;
      melhor = linha;
    }
    if (delta < minDelta) {
      minDelta = delta;
      pior = linha;
    }
  }
  return { melhor, pior };
}

function fmtPct(pct: number | null): string {
  if (pct == null) return 'sem base no ciclo anterior';
  if (pct === 0) return 'estável';
  const sinal = pct > 0 ? '+' : '−';
  return `${sinal}${fmtNum(Math.abs(pct), 1)}%`;
}

function dataCurta(d: DadoDiario | null): string {
  if (!d?.data) return '—';
  const [y, m, day] = d.data.split('-');
  return `${day}/${m}/${y}`;
}

function textoMetrica(totais: TotaisMelhoriaCiclo, modo: ModoMelhoriaOperacao): string {
  if (modo === 'unidade') {
    return formatarMetricaUnidade(totais.metricaUnidade, totais.metricaSufixo);
  }
  return `${fmtNum(totais.toneladas, 2)} t`;
}

/**
 * Frases curtas para gerentes: o que mudou no ciclo, em linguagem de operação.
 */
export function montarLeituraGerencial(opts: {
  modo: ModoMelhoriaOperacao;
  anterior: TotaisMelhoriaCiclo;
  atual: TotaisMelhoriaCiclo;
  dias: DiaComparadoOperacao[];
  labelAnterior: string;
  labelAtual: string;
}): string[] {
  const { modo, anterior: ant, atual: atu, dias, labelAnterior, labelAtual } = opts;
  const frases: string[] = [];

  if (atu.diasOperados <= 0) {
    frases.push(`Não há operação registrada no ${labelAtual}.`);
    return frases;
  }

  if (ant.diasOperados <= 0) {
    frases.push(
      `O ${labelAtual} tem operação, mas o ${labelAnterior} não registrou produção — a tabela diária mostra só o ciclo atual.`,
    );
    if (modo === 'coleta') {
      frases.push(
        `Neste ciclo: ${fmtNum(atu.viagens, 0)} viagens, ${fmtNum(atu.toneladas, 2)} t e ${fmtNum(atu.km, 0)} km `
        + `em ${atu.diasDecorridos} dia(s) decorrido(s) do ciclo (${atu.diasOperados} com operação).`,
      );
    } else {
      frases.push(
        `Neste ciclo: ${textoMetrica(atu, modo)} em ${atu.diasDecorridos} dia(s) decorrido(s) `
        + `(${atu.diasOperados} com operação).`,
      );
    }
    return frases;
  }

  const prodAnt = modo === 'unidade' ? ant.metricaUnidade : ant.toneladas;
  const prodAtu = modo === 'unidade' ? atu.metricaUnidade : atu.toneladas;
  const vProd = variacaoAbsPct(prodAtu, prodAnt);
  const nomeProd = modo === 'unidade' ? (atu.metricaLabel || 'produção') : 'toneladas coletadas';
  const sentido = vProd.abs > 0 ? 'acima' : vProd.abs < 0 ? 'abaixo' : 'no mesmo patamar';
  frases.push(
    `${nomeProd[0].toUpperCase()}${nomeProd.slice(1)}: ${textoMetrica(atu, modo)} no ciclo atual, `
    + `${sentido} do ciclo anterior (${textoMetrica(ant, modo)}${vProd.pct == null ? '' : `, ${fmtPct(vProd.pct)}`}).`,
  );

  if (modo === 'coleta') {
    const vVg = variacaoAbsPct(atu.viagens, ant.viagens);
    frases.push(
      `Ritmo: ${fmtNum(atu.mediaTonPorDia, 2)} t/dia e ${fmtNum(atu.mediaViagensPorDia, 1)} viagens/dia `
      + `nos ${atu.diasDecorridos} dias decorridos do ciclo (${atu.diasOperados} com operação), `
      + `contra ${fmtNum(ant.mediaTonPorDia, 2)} t/dia e ${fmtNum(ant.mediaViagensPorDia, 1)} viagens/dia `
      + `nos mesmos ${ant.diasDecorridos} dias do ciclo anterior `
      + `(${fmtNum(ant.viagens, 0)} → ${fmtNum(atu.viagens, 0)} viagens, ${fmtPct(vVg.pct)}).`,
    );
    if (ant.mediaTonPorViagem > 0 || atu.mediaTonPorViagem > 0) {
      const vMed = variacaoAbsPct(atu.mediaTonPorViagem, ant.mediaTonPorViagem);
      frases.push(
        `Carga média por viagem: ${fmtNum(atu.mediaTonPorViagem, 2)} t `
        + `(ciclo anterior: ${fmtNum(ant.mediaTonPorViagem, 2)} t, ${fmtPct(vMed.pct)}).`,
      );
    }
    const vKm = variacaoAbsPct(atu.km, ant.km);
    frases.push(
      `Quilometragem: ${fmtNum(atu.km, 0)} km no ciclo atual, contra ${fmtNum(ant.km, 0)} km no anterior `
      + `(${fmtPct(vKm.pct)}; média ${fmtNum(ant.mediaKmPorDia, 0)} → ${fmtNum(atu.mediaKmPorDia, 0)} km/dia do ciclo).`,
    );
    if (ant.rotas > 0 || atu.rotas > 0) {
      const vRotas = variacaoAbsPct(atu.rotas, ant.rotas);
      frases.push(
        `Rotas (linhas da planilha): ${fmtNum(ant.rotas, 0)} → ${fmtNum(atu.rotas, 0)} (${fmtPct(vRotas.pct)}).`,
      );
    }
  } else {
    frases.push(
      `Ritmo: média de ${formatarMetricaUnidade(atu.mediaMetricaPorDia, atu.metricaSufixo)} por dia do ciclo `
      + `(${atu.diasDecorridos} dias decorridos, ${atu.diasOperados} com serviço), `
      + `contra ${formatarMetricaUnidade(ant.mediaMetricaPorDia, ant.metricaSufixo)} nos mesmos `
      + `${ant.diasDecorridos} dias do ciclo anterior.`,
    );
  }

  const { melhor, pior } = destacarVariacaoDiaria(dias, modo);
  if (melhor) {
    const delta = metricaPrincipalDia(melhor.atual, modo) - metricaPrincipalDia(melhor.ant, modo);
    const unidade = modo === 'unidade'
      ? formatarMetricaUnidade(Math.abs(delta), atu.metricaSufixo)
      : `${fmtNum(Math.abs(delta), 2)} t`;
    const { rotulo, na, mesma } = {
      rotulo: rotuloOcorrenciaDiaSemana(melhor.diaSemana, melhor.ocorrencia),
      na: melhor.diaSemana === 0 || melhor.diaSemana === 6 ? 'no' : 'na',
      mesma: melhor.diaSemana === 0 || melhor.diaSemana === 6 ? 'ao mesmo' : 'à mesma',
    };
    frases.push(
      `Maior ganho ${na} ${rotulo} (${dataCurta(melhor.atual)}): +${unidade} em relação ${mesma} ${rotulo} do ciclo anterior.`,
    );
  }
  if (pior) {
    const delta = metricaPrincipalDia(pior.atual, modo) - metricaPrincipalDia(pior.ant, modo);
    const unidade = modo === 'unidade'
      ? formatarMetricaUnidade(Math.abs(delta), atu.metricaSufixo)
      : `${fmtNum(Math.abs(delta), 2)} t`;
    const { rotulo, na, mesma } = {
      rotulo: rotuloOcorrenciaDiaSemana(pior.diaSemana, pior.ocorrencia),
      na: pior.diaSemana === 0 || pior.diaSemana === 6 ? 'no' : 'na',
      mesma: pior.diaSemana === 0 || pior.diaSemana === 6 ? 'ao mesmo' : 'à mesma',
    };
    frases.push(
      `Ponto de atenção ${na} ${rotulo} (${dataCurta(pior.atual)}): −${unidade} versus ${mesma} ${rotulo} do ciclo anterior.`,
    );
  }

  return frases;
}
