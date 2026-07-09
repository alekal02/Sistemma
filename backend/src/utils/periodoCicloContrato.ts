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

/** Inferência a partir de várias datas — usa a data mais recente. */
export function inferirCicloReferenciaDeDatas(
  datasIso: string[],
  diaInicioCiclo: number = 1,
): { mesReferencia: number; anoReferencia: number } | null {
  const validas = datasIso.filter(isIsoDate).sort();
  if (validas.length === 0) return null;
  const ref = inferirMesReferenciaDeData(validas[validas.length - 1], diaInicioCiclo);
  return { mesReferencia: ref.mes, anoReferencia: ref.ano };
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

export interface PeriodoContratoQuery {
  mes?: number;
  ano?: number;
  dataInicio?: string;
  dataFim?: string;
}

function isIsoDate(s?: string): boolean {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function parsePeriodosPorContratoQuery(
  query: Record<string, any>,
): Record<string, PeriodoContratoQuery> {
  const raw = query.periodosPorContrato;
  if (!raw || typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const result: Record<string, PeriodoContratoQuery> = {};
    for (const [id, val] of Object.entries(parsed)) {
      const v = val as PeriodoContratoQuery;
      const item: PeriodoContratoQuery = {};
      if (isIsoDate(v?.dataInicio) && isIsoDate(v?.dataFim)) {
        item.dataInicio = v.dataInicio;
        item.dataFim = v.dataFim;
      }
      const mes = parseInt(String(v?.mes), 10);
      const ano = parseInt(String(v?.ano), 10);
      if (!Number.isNaN(mes) && !Number.isNaN(ano) && mes >= 1 && mes <= 12 && ano >= 2000) {
        item.mes = mes;
        item.ano = ano;
      }
      if (id && (item.dataInicio || item.mes)) {
        result[id] = item;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function resolverFiltrosPeriodoQuery(
  query: Record<string, any>,
  diaInicioCiclo?: number | null,
  contractId?: string | null,
): {
  filtros: { dataInicio?: string; dataFim?: string };
  periodo?: PeriodoCicloContrato;
} {
  const d = normalizarDiaInicioCiclo(diaInicioCiclo);
  const periodosMap = parsePeriodosPorContratoQuery(query);

  if (contractId && periodosMap[contractId]?.dataInicio && periodosMap[contractId]?.dataFim) {
    const p = periodosMap[contractId];
    return {
      filtros: { dataInicio: p.dataInicio, dataFim: p.dataFim },
      periodo: {
        mesReferencia: 0,
        anoReferencia: 0,
        diaInicioCiclo: d,
        dataInicio: p.dataInicio!,
        dataFim: p.dataFim!,
        label: `${formatarDataBr(p.dataInicio!)} a ${formatarDataBr(p.dataFim!)}`,
      },
    };
  }

  if (!contractId && (query.dataInicio || query.dataFim)) {
    const dataInicio = query.dataInicio as string | undefined;
    const dataFim = query.dataFim as string | undefined;
    return {
      filtros: { dataInicio, dataFim },
      periodo: isIsoDate(dataInicio) && isIsoDate(dataFim) ? {
        mesReferencia: 0,
        anoReferencia: 0,
        diaInicioCiclo: d,
        dataInicio: dataInicio!,
        dataFim: dataFim!,
        label: `${formatarDataBr(dataInicio!)} a ${formatarDataBr(dataFim!)}`,
      } : undefined,
    };
  }

  let mesRef = query.mesReferencia != null ? parseInt(String(query.mesReferencia), 10) : NaN;
  let anoRef = query.anoReferencia != null ? parseInt(String(query.anoReferencia), 10) : NaN;

  if (contractId && periodosMap[contractId]?.mes && periodosMap[contractId]?.ano) {
    mesRef = periodosMap[contractId].mes!;
    anoRef = periodosMap[contractId].ano!;
  }

  let ano: number;
  let mes: number;
  if (!Number.isNaN(mesRef) && !Number.isNaN(anoRef) && mesRef >= 1 && mesRef <= 12 && anoRef >= 2000) {
    ano = anoRef;
    mes = mesRef;
  } else {
    ({ ano, mes } = inferirMesReferenciaAtual(d));
  }

  const periodo = calcularCicloMensalContrato(ano, mes, d);
  return {
    filtros: { dataInicio: periodo.dataInicio, dataFim: periodo.dataFim },
    periodo,
  };
}
