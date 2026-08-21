export {
  type PeriodoCicloContrato,
  type PeriodoContratoQuery,
  type QuinzenaPeriodo,
  type PeriodoRecortadoCiclo,
  type JanelasComparativoCiclo,
  normalizarDiaInicioCiclo,
  inferirMesReferenciaAtual,
  inferirMesReferenciaDeData,
  inferirCicloReferenciaDeDatas,
  calcularCicloMensalContrato,
  deslocarMesReferencia,
  limitarDiasAusentesAoPeriodoDaPlanilha,
  mesInputParaReferencia,
  referenciaParaMesInput,
  listarDatasIntervalo,
  calcularQuinzenasDoPeriodo,
  isIsoDate,
  formatarDataBr,
  isoHojeLocal,
  recortarPeriodoAteReferencia,
  primeirosNDiasPeriodo,
  montarJanelasComparativoCiclo,
} from '@sistemma/shared';

import {
  calcularCicloMensalContrato,
  calcularQuinzenasDoPeriodo,
  deslocarMesReferencia,
  inferirMesReferenciaAtual,
  listarDatasIntervalo,
  normalizarDiaInicioCiclo,
  primeirosNDiasPeriodo,
  recortarPeriodoAteReferencia,
  type PeriodoContratoQuery,
} from '@sistemma/shared';

const STORAGE_PERIODOS = '@sistemma:periodos-comparar';

export type PeriodoModo = 'mediacao' | 'datas';

export interface PeriodoContratoState {
  modo: PeriodoModo;
  mes: number;
  ano: number;
  dataInicio: string;
  dataFim: string;
}

export function salvarPeriodosComparar(
  tipoServico: string,
  periodos: Record<string, PeriodoContratoState>,
): void {
  try {
    localStorage.setItem(`${STORAGE_PERIODOS}:${tipoServico}`, JSON.stringify(periodos));
  } catch { /* ignore */ }
}

export function carregarPeriodosComparar(
  tipoServico: string,
): Record<string, PeriodoContratoState> | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PERIODOS}:${tipoServico}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function periodoPadraoContrato(diaInicioCiclo: number = 1): PeriodoContratoState {
  const { mes, ano } = inferirMesReferenciaAtual(diaInicioCiclo);
  const ciclo = calcularCicloMensalContrato(ano, mes, diaInicioCiclo);
  const recorte = recortarPeriodoAteReferencia(ciclo.dataInicio, ciclo.dataFim);
  return {
    modo: 'mediacao',
    mes,
    ano,
    dataInicio: recorte.dataInicio,
    dataFim: recorte.dataFim,
  };
}

/** Recorta o período do contrato para a 1ª ou 2ª quinzena (modo datas). */
export function aplicarQuinzenaAoPeriodo(
  periodo: PeriodoContratoState,
  quinzena: 1 | 2,
): PeriodoContratoState | null {
  const { primeira, segunda } = calcularQuinzenasDoPeriodo(periodo.dataInicio, periodo.dataFim);
  const q = quinzena === 1 ? primeira : segunda;
  if (!q) return null;
  return {
    ...periodo,
    modo: 'datas',
    dataInicio: q.dataInicio,
    dataFim: q.dataFim,
  };
}

/**
 * Ciclo imediatamente anterior ao período informado (mês de referência − 1).
 * Usa o dia de início do ciclo do contrato para recalcular o intervalo.
 */
export function aplicarCicloAnteriorAoPeriodo(
  periodo: PeriodoContratoState,
  diaInicioCiclo: number = 1,
): PeriodoContratoState {
  const dia = normalizarDiaInicioCiclo(diaInicioCiclo);
  const prev = deslocarMesReferencia(periodo.mes, periodo.ano, -1);
  const ciclo = calcularCicloMensalContrato(prev.ano, prev.mes, dia);
  const n = listarDatasIntervalo(periodo.dataInicio, periodo.dataFim).length;
  const janela = primeirosNDiasPeriodo(ciclo.dataInicio, ciclo.dataFim, n);
  return {
    modo: 'datas',
    mes: prev.mes,
    ano: prev.ano,
    dataInicio: janela.dataInicio,
    dataFim: janela.dataFim,
  };
}

export function buildPeriodosPorContratoQuery(
  periodos: Record<string, PeriodoContratoState>,
): Record<string, PeriodoContratoQuery> {
  const out: Record<string, PeriodoContratoQuery> = {};
  for (const [id, p] of Object.entries(periodos)) {
    out[id] = {
      dataInicio: p.dataInicio,
      dataFim: p.dataFim,
      mes: p.mes,
      ano: p.ano,
    };
  }
  return out;
}
