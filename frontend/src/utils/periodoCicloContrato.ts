export interface PeriodoCicloContrato {
  mesReferencia: number;
  anoReferencia: number;
  diaInicioCiclo: number;
  dataInicio: string;
  dataFim: string;
  label: string;
}

export function normalizarDiaInicioCiclo(dia?: number | null): number {
  if (dia == null || Number.isNaN(Number(dia))) return 1;
  return Math.min(28, Math.max(1, Math.floor(Number(dia))));
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toISODate(ano: number, mes: number, dia: number): string {
  return `${ano}-${pad2(mes)}-${pad2(dia)}`;
}

function formatarDataBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function inferirMesReferenciaAtual(
  diaInicioCiclo: number = 1,
  hoje: Date = new Date(),
): { ano: number; mes: number } {
  const d = normalizarDiaInicioCiclo(diaInicioCiclo);
  let mes = hoje.getMonth() + 1;
  let ano = hoje.getFullYear();

  if (d > 1 && hoje.getDate() >= d) {
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }

  return { ano, mes };
}

/** Mês de referência do ciclo que contém a data informada (yyyy-MM-dd). */
export function inferirMesReferenciaDeData(
  dataIso: string,
  diaInicioCiclo: number = 1,
): { ano: number; mes: number } {
  const d = normalizarDiaInicioCiclo(diaInicioCiclo);
  const [anoStr, mesStr, diaStr] = dataIso.split('-');
  const ano = parseInt(anoStr, 10);
  const mes = parseInt(mesStr, 10);
  const dia = parseInt(diaStr, 10);
  if (!ano || !mes || !dia) return inferirMesReferenciaAtual(diaInicioCiclo);

  if (d === 1) return { ano, mes };

  if (dia >= d) {
    let mesRef = mes + 1;
    let anoRef = ano;
    if (mesRef > 12) {
      mesRef = 1;
      anoRef += 1;
    }
    return { ano: anoRef, mes: mesRef };
  }

  return { ano, mes };
}

export function calcularCicloMensalContrato(
  anoReferencia: number,
  mesReferencia: number,
  diaInicioCiclo: number = 1,
): PeriodoCicloContrato {
  const d = normalizarDiaInicioCiclo(diaInicioCiclo);

  let dataInicio: string;
  let dataFim: string;

  if (d === 1) {
    const ultimoDia = new Date(anoReferencia, mesReferencia, 0).getDate();
    dataInicio = toISODate(anoReferencia, mesReferencia, 1);
    dataFim = toISODate(anoReferencia, mesReferencia, ultimoDia);
  } else {
    const mesAnt = mesReferencia === 1 ? 12 : mesReferencia - 1;
    const anoAnt = mesReferencia === 1 ? anoReferencia - 1 : anoReferencia;
    dataInicio = toISODate(anoAnt, mesAnt, d);
    dataFim = toISODate(anoReferencia, mesReferencia, d - 1);
  }

  const nomeMes = new Date(anoReferencia, mesReferencia - 1, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });

  const label = d === 1
    ? nomeMes
    : `${nomeMes} (${formatarDataBr(dataInicio)} a ${formatarDataBr(dataFim)})`;

  return {
    mesReferencia,
    anoReferencia,
    diaInicioCiclo: d,
    dataInicio,
    dataFim,
    label,
  };
}

export function mesInputParaReferencia(value: string): { mes: number; ano: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const ano = parseInt(match[1], 10);
  const mes = parseInt(match[2], 10);
  if (mes < 1 || mes > 12 || ano < 2000) return null;
  return { mes, ano };
}

export function referenciaParaMesInput(ano: number, mes: number): string {
  return `${ano}-${pad2(mes)}`;
}

export function deslocarMesReferencia(
  mes: number,
  ano: number,
  delta: number,
): { mes: number; ano: number } {
  let m = mes + delta;
  let y = ano;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return { mes: m, ano: y };
}

const STORAGE_PERIODOS = '@sistemma:periodos-comparar';

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

export interface PeriodoContratoQuery {
  mes?: number;
  ano?: number;
  dataInicio?: string;
  dataFim?: string;
}

export type PeriodoModo = 'mediacao' | 'datas';

export interface PeriodoContratoState {
  modo: PeriodoModo;
  mes: number;
  ano: number;
  dataInicio: string;
  dataFim: string;
}

export function periodoPadraoContrato(diaInicioCiclo: number = 1): PeriodoContratoState {
  const { mes, ano } = inferirMesReferenciaAtual(diaInicioCiclo);
  const ciclo = calcularCicloMensalContrato(ano, mes, diaInicioCiclo);
  return {
    modo: 'mediacao',
    mes,
    ano,
    dataInicio: ciclo.dataInicio,
    dataFim: ciclo.dataFim,
  };
}

/** Lista todas as datas ISO (inclusive) entre dataInicio e dataFim */
export function listarDatasIntervalo(dataInicio: string, dataFim: string): string[] {
  const datas: string[] = [];
  const atual = new Date(`${dataInicio}T12:00:00`);
  const fim = new Date(`${dataFim}T12:00:00`);
  if (isNaN(atual.getTime()) || isNaN(fim.getTime()) || atual > fim) return datas;

  while (atual <= fim) {
    const y = atual.getFullYear();
    const m = String(atual.getMonth() + 1).padStart(2, '0');
    const d = String(atual.getDate()).padStart(2, '0');
    datas.push(`${y}-${m}-${d}`);
    atual.setDate(atual.getDate() + 1);
  }
  return datas;
}

export interface QuinzenaPeriodo {
  numero: 1 | 2;
  dataInicio: string;
  dataFim: string;
  label: string;
}

/**
 * Divide o período do ciclo em quinzenas (15 + restante).
 * Ex.: ciclo de 30 dias → 1ª = dias 1–15, 2ª = dias 16–30.
 */
export function calcularQuinzenasDoPeriodo(
  dataInicio: string,
  dataFim: string,
): { primeira: QuinzenaPeriodo; segunda: QuinzenaPeriodo | null } {
  const dias = listarDatasIntervalo(dataInicio, dataFim);
  if (dias.length === 0) {
    return {
      primeira: {
        numero: 1,
        dataInicio,
        dataFim,
        label: `1ª quinzena (${formatarDataBr(dataInicio)} a ${formatarDataBr(dataFim)})`,
      },
      segunda: null,
    };
  }

  const q1FimIdx = Math.min(14, dias.length - 1);
  const primeira: QuinzenaPeriodo = {
    numero: 1,
    dataInicio: dias[0],
    dataFim: dias[q1FimIdx],
    label: `1ª quinzena (${formatarDataBr(dias[0])} a ${formatarDataBr(dias[q1FimIdx])})`,
  };

  if (q1FimIdx >= dias.length - 1) {
    return { primeira, segunda: null };
  }

  const segunda: QuinzenaPeriodo = {
    numero: 2,
    dataInicio: dias[q1FimIdx + 1],
    dataFim: dias[dias.length - 1],
    label: `2ª quinzena (${formatarDataBr(dias[q1FimIdx + 1])} a ${formatarDataBr(dias[dias.length - 1])})`,
  };
  return { primeira, segunda };
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
  return {
    modo: 'mediacao',
    mes: prev.mes,
    ano: prev.ano,
    dataInicio: ciclo.dataInicio,
    dataFim: ciclo.dataFim,
  };
}

export function buildPeriodosPorContratoQuery(
  periodos: Record<string, PeriodoContratoState>,
): Record<string, PeriodoContratoQuery> {
  const out: Record<string, PeriodoContratoQuery> = {};
  for (const [id, p] of Object.entries(periodos)) {
    if (p.modo === 'datas') {
      out[id] = { dataInicio: p.dataInicio, dataFim: p.dataFim };
    } else {
      out[id] = { mes: p.mes, ano: p.ano };
    }
  }
  return out;
}
