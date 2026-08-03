/**
 * Agregações SQL de coleta — escala para 600k+/mês sem materializar linhas.
 */
import AppDataSource from '../database/data-source';
import { ColetaData } from '../entities/ColetaData';
import { PlanilhaUpload } from '../entities/PlanilhaUpload';
import { aplicarFiltroViagensValidasDashboard } from './validacaoViagemService';
import { separarMelhoresPiores } from './rankingOperacionalService';
import { sqlSumViagens } from './viagensPorRotaService';

export interface MetricasColetaSql {
  registros: number;
  viagens: number;
  pesoTotalKg: number;
  pesoTotalTon: number;
  kmTotal: number;
  horasProdutivas: number;
  placas: number;
  motoristas: number;
  regionais: number;
  distritos: number;
  somaColetores: number;
  faturamento: number;
  fatPorTipo: Record<string, number>;
}

export interface LinhaRankingColeta {
  chave: string;
  label: string;
  viagens: number;
  tonelagem: number;
  kmTotal: number;
  horasProdutivas: number;
  tonPorViagem: number;
  kmPorViagem: number;
  placa?: string;
  /** Tipo predominante do grupo (placa/motorista) — para eficiência vs ideal. */
  tipoCaminhao?: string;
}

export interface AgregacaoColetaResult {
  resumo: MetricasColetaSql;
  porMotorista: LinhaRankingColeta[];
  porPlaca: LinhaRankingColeta[];
  porDistrito: LinhaRankingColeta[];
  dataInicio: string | null;
  dataFim: string | null;
}

async function getUploadIds(servicoId: string): Promise<number[]> {
  const rows = await AppDataSource.getRepository(PlanilhaUpload).find({
    where: { servico_id: servicoId },
    select: ['id'],
  });
  return rows.map((u) => u.id);
}

function toIsoDate(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parsePeriodo(opts: { dataInicio?: string; dataFim?: string; data?: string }) {
  const dataUnica = opts.data && /^\d{4}-\d{2}-\d{2}$/.test(opts.data) ? opts.data : null;
  const dataInicio = dataUnica
    || (opts.dataInicio && /^\d{4}-\d{2}-\d{2}$/.test(opts.dataInicio) ? opts.dataInicio : null);
  const dataFim = dataUnica
    || (opts.dataFim && /^\d{4}-\d{2}-\d{2}$/.test(opts.dataFim) ? opts.dataFim : null);
  return { dataInicio, dataFim };
}

function baseQb(
  uploadIds: number[],
  dataInicio: string | null,
  dataFim: string | null,
  alias = 'c',
) {
  const repo = AppDataSource.getRepository(ColetaData);
  const qb = repo.createQueryBuilder(alias)
    .where(`${alias}.planilhaUploadId IN (:...uploadIds)`, { uploadIds });
  aplicarFiltroViagensValidasDashboard(qb, alias);
  // dataSaida costuma ser meio-dia UTC — usar janela completa do dia
  if (dataInicio) qb.andWhere(`${alias}.dataSaida >= :inicio`, { inicio: `${dataInicio}T00:00:00.000Z` });
  if (dataFim) qb.andWhere(`${alias}.dataSaida <= :fim`, { fim: `${dataFim}T23:59:59.999Z` });
  return qb;
}

/** Expressão SQL: tarifa R$/ton por tipo de caminhão. */
function sqlTarifaPorTipo(valoresFixos: Record<string, number>): string {
  const truck = Number(valoresFixos.VALOR_TRUCK || valoresFixos.VALOR_TONELADA || 0);
  const toco = Number(valoresFixos.VALOR_TOCO || valoresFixos.VALOR_TONELADA || 0);
  const mini = Number(valoresFixos.VALOR_MINI || valoresFixos.VALOR_TONELADA || 0);
  const basc = Number(valoresFixos.VALOR_BASCULANTE || valoresFixos.VALOR_TONELADA || 0);
  const fallback = Number(valoresFixos.VALOR_TONELADA || truck || 0);
  return `
    CASE
      WHEN UPPER(TRIM(COALESCE(c."tipoCaminhao", ''))) LIKE '%MINI%' THEN ${mini}
      WHEN UPPER(TRIM(COALESCE(c."tipoCaminhao", ''))) LIKE '%TOCO%' THEN ${toco}
      WHEN UPPER(TRIM(COALESCE(c."tipoCaminhao", ''))) LIKE '%BASC%' THEN ${basc}
      WHEN UPPER(TRIM(COALESCE(c."tipoCaminhao", ''))) LIKE '%TRUCK%' THEN ${truck}
      ELSE ${fallback}
    END
  `;
}

/** Tipo predominante = o que mais aparece ordenado por viagens da linha. */
const SQL_TIPO_PREDOMINANTE =
  `(ARRAY_AGG(NULLIF(TRIM(c."tipoCaminhao"), '') ORDER BY COALESCE(c."viagensPorRota", 0) DESC NULLS LAST))[1]`;

function mapRanking(rows: any[]): LinhaRankingColeta[] {
  return rows.map((r) => {
    const label = String(r.label || 'Não informado').trim() || 'Não informado';
    const viagens = Number(r.viagens || 0);
    const pesoKg = Number(r.peso_kg || 0);
    const tonelagem = round2(pesoKg / 1000);
    const kmTotal = round2(Number(r.km_total || 0));
    const horas = round2(Number(r.horas || 0));
    const tipoRaw = r.tipo_caminhao != null ? String(r.tipo_caminhao).trim() : '';
    return {
      chave: label,
      label,
      viagens,
      tonelagem,
      kmTotal,
      horasProdutivas: horas,
      tonPorViagem: viagens > 0 ? round2(tonelagem / viagens) : 0,
      kmPorViagem: viagens > 0 ? round2(kmTotal / viagens) : 0,
      placa: r.placa ? String(r.placa) : undefined,
      tipoCaminhao: tipoRaw || undefined,
    };
  });
}

export async function getMetricasColetaSql(
  servicoId: string,
  opts: { dataInicio?: string; dataFim?: string; data?: string } = {},
  valoresFixos: Record<string, number> = {},
): Promise<MetricasColetaSql> {
  const uploadIds = await getUploadIds(servicoId);
  const vazio: MetricasColetaSql = {
    registros: 0, viagens: 0, pesoTotalKg: 0, pesoTotalTon: 0, kmTotal: 0,
    horasProdutivas: 0, placas: 0, motoristas: 0, regionais: 0, distritos: 0,
    somaColetores: 0, faturamento: 0, fatPorTipo: {},
  };
  if (!uploadIds.length) return vazio;

  const { dataInicio, dataFim } = parsePeriodo(opts);
  const tarifa = sqlTarifaPorTipo(valoresFixos);

  const resumoRaw = await baseQb(uploadIds, dataInicio, dataFim)
    .select([
      'COUNT(*)::int AS registros',
      `${sqlSumViagens('c')} AS viagens`,
      'COALESCE(SUM(COALESCE(c."pesoTotal", 0)), 0) AS peso_kg',
      'COALESCE(SUM(COALESCE(c."kmTotal", 0)), 0) AS km_total',
      `COALESCE(SUM(CASE WHEN c."horasForaUnidade" BETWEEN 0 AND 24 THEN c."horasForaUnidade" ELSE 0 END), 0) AS horas`,
      `COUNT(DISTINCT NULLIF(TRIM(c.placa), ''))::int AS placas`,
      `COUNT(DISTINCT NULLIF(TRIM(c.motorista), ''))::int AS motoristas`,
      `COUNT(DISTINCT NULLIF(TRIM(c.regional), ''))::int AS regionais`,
      `COUNT(DISTINCT NULLIF(TRIM(c.distrito), ''))::int AS distritos`,
      'COALESCE(SUM(COALESCE(c."numeroColetores", 0)), 0) AS soma_coletores',
      `COALESCE(SUM((COALESCE(c."pesoTotal", 0) / 1000.0) * (${tarifa})), 0) AS faturamento`,
    ])
    .getRawOne();

  const porTipo = await baseQb(uploadIds, dataInicio, dataFim)
    .select([
      `COALESCE(NULLIF(TRIM(c."tipoCaminhao"), ''), 'Não informado') AS tipo`,
      `COALESCE(SUM((COALESCE(c."pesoTotal", 0) / 1000.0) * (${tarifa})), 0) AS fat`,
    ])
    .groupBy(`COALESCE(NULLIF(TRIM(c."tipoCaminhao"), ''), 'Não informado')`)
    .getRawMany();

  const pesoKg = Number(resumoRaw?.peso_kg || 0);
  const fatPorTipo: Record<string, number> = {};
  for (const r of porTipo) {
    const t = String(r.tipo || 'Não informado');
    fatPorTipo[t] = round2(Number(r.fat || 0));
  }

  return {
    registros: Number(resumoRaw?.registros || 0),
    viagens: Number(resumoRaw?.viagens || 0),
    pesoTotalKg: pesoKg,
    pesoTotalTon: round2(pesoKg / 1000),
    kmTotal: round2(Number(resumoRaw?.km_total || 0)),
    horasProdutivas: round2(Number(resumoRaw?.horas || 0)),
    placas: Number(resumoRaw?.placas || 0),
    motoristas: Number(resumoRaw?.motoristas || 0),
    regionais: Number(resumoRaw?.regionais || 0),
    distritos: Number(resumoRaw?.distritos || 0),
    somaColetores: Number(resumoRaw?.soma_coletores || 0),
    faturamento: round2(Number(resumoRaw?.faturamento || 0)),
    fatPorTipo,
  };
}

export async function getAgregacaoColeta(
  servicoId: string,
  opts: {
    dataInicio?: string;
    dataFim?: string;
    data?: string;
    topN?: number;
    valoresFixos?: Record<string, number>;
  } = {},
): Promise<AgregacaoColetaResult> {
  const uploadIds = await getUploadIds(servicoId);
  const { dataInicio, dataFim } = parsePeriodo(opts);
  const topN = Math.min(Math.max(opts.topN || 50, 5), 200);
  const valoresFixos = opts.valoresFixos || {};

  const resumo = await getMetricasColetaSql(servicoId, opts, valoresFixos);
  const vazio: AgregacaoColetaResult = {
    resumo,
    porMotorista: [],
    porPlaca: [],
    porDistrito: [],
    dataInicio: dataInicio,
    dataFim: dataFim,
  };
  if (!uploadIds.length || resumo.registros === 0) return vazio;

  const labelMotorista = `COALESCE(NULLIF(TRIM(c.motorista), ''), 'Não informado')`;
  const labelPlaca = `COALESCE(NULLIF(TRIM(c.placa), ''), 'Não informado')`;
  const labelDistrito = `COALESCE(NULLIF(TRIM(c.distrito), ''), NULLIF(TRIM(c.regional), ''), 'Não informado')`;

  const selectGrupo = (labelExpr: string) => [
    `${labelExpr} AS label`,
    `${sqlSumViagens('c')} AS viagens`,
    'COALESCE(SUM(COALESCE(c."pesoTotal", 0)), 0) AS peso_kg',
    'COALESCE(SUM(COALESCE(c."kmTotal", 0)), 0) AS km_total',
    `COALESCE(SUM(CASE WHEN c."horasForaUnidade" BETWEEN 0 AND 24 THEN c."horasForaUnidade" ELSE 0 END), 0) AS horas`,
  ];

  const [porMotorista, porPlaca, porDistrito, bounds] = await Promise.all([
    baseQb(uploadIds, dataInicio, dataFim)
      .select([
        ...selectGrupo(labelMotorista),
        `STRING_AGG(DISTINCT NULLIF(TRIM(c.placa), ''), ', ') AS placa`,
        `${SQL_TIPO_PREDOMINANTE} AS tipo_caminhao`,
      ])
      .groupBy(labelMotorista)
      .orderBy('peso_kg', 'DESC')
      .limit(topN)
      .getRawMany(),
    baseQb(uploadIds, dataInicio, dataFim)
      .select([...selectGrupo(labelPlaca), `${SQL_TIPO_PREDOMINANTE} AS tipo_caminhao`])
      .groupBy(labelPlaca)
      .orderBy('peso_kg', 'DESC')
      .limit(topN)
      .getRawMany(),
    baseQb(uploadIds, dataInicio, dataFim)
      .select([...selectGrupo(labelDistrito), `${SQL_TIPO_PREDOMINANTE} AS tipo_caminhao`])
      .groupBy(labelDistrito)
      .orderBy('peso_kg', 'DESC')
      .limit(topN)
      .getRawMany(),
    baseQb(uploadIds, dataInicio, dataFim)
      .select(['MIN(c.dataSaida) AS min_d', 'MAX(c.dataSaida) AS max_d'])
      .getRawOne(),
  ]);

  return {
    resumo,
    porMotorista: mapRanking(porMotorista),
    porPlaca: mapRanking(porPlaca),
    porDistrito: mapRanking(porDistrito),
    dataInicio: dataInicio || toIsoDate(bounds?.min_d),
    dataFim: dataFim || toIsoDate(bounds?.max_d),
  };
}

/** Rankings no formato esperado por getKpiOperacionalMotoristas. */
export async function getRankingsColetaSql(
  servicoId: string,
  opts: { dataInicio?: string; dataFim?: string; topN?: number } = {},
) {
  const agg = await getAgregacaoColeta(servicoId, { ...opts, topN: opts.topN || 100 });
  const motoristas = agg.porMotorista.map((m) => ({
    motorista: m.label,
    placa: m.placa || '',
    viagens: m.viagens,
    tonelagem: m.tonelagem,
    kmTotal: m.kmTotal,
    horasProdutivas: m.horasProdutivas,
    tonPorViagem: m.tonPorViagem,
    kmPorViagem: m.kmPorViagem,
    tonPorKm: m.kmTotal > 0 ? round2((m.tonelagem / m.kmTotal) * 10000) / 10000 : 0,
    tonPorHora: m.horasProdutivas > 0 ? round2(m.tonelagem / m.horasProdutivas) : 0,
  }));
  const coletores = agg.porPlaca.map((p) => ({
    placa: p.label,
    viagens: p.viagens,
    tonelagem: p.tonelagem,
    kmTotal: p.kmTotal,
    tonPorViagem: p.tonPorViagem,
  }));
  const rotas = agg.porDistrito.map((r) => ({
    rota: r.label,
    viagens: r.viagens,
    tonelagem: r.tonelagem,
    kmTotal: r.kmTotal,
    tonPorViagem: r.tonPorViagem,
  }));

  return {
    motoristas,
    coletores,
    rotas,
    rankings: {
      motoristas: separarMelhoresPiores(motoristas, (m) => m.tonelagem),
      coletores: separarMelhoresPiores(coletores, (c) => c.tonelagem),
      rotas: separarMelhoresPiores(rotas, (r) => r.tonelagem),
    },
    metadados: {
      totalViagens: agg.resumo.viagens,
      totalTonelagem: agg.resumo.pesoTotalTon,
      totalKm: agg.resumo.kmTotal,
      temMotorista: motoristas.length > 0,
      temRota: rotas.length > 0,
      temColetores: coletores.length > 0,
      colunaRota: 'distrito',
      colunaRotaLabel: 'Distrito / Regional',
      modo: 'coleta-sql',
    },
  };
}

/**
 * Resolve expressão de KPI de coleta via métricas SQL.
 * Retorna null se a fórmula não for reconhecida (fallback in-memory).
 */
export function resolverKpiColetaSql(
  expressao: string,
  metricas: MetricasColetaSql,
  valoresFixos: Record<string, number>,
): number | null {
  const expr = (expressao || '').trim();
  if (!expr) return null;

  const compact = expr.replace(/\s+/g, '').toUpperCase()
    .replace(/PESOTOTAL/g, 'PESO_TOTAL')
    .replace(/KMTOTAL/g, 'KM_TOTAL')
    .replace(/TIPOCAMINHAO|TIPODECAMINHAO/g, 'TIPO_CAMINHAO');

  const m = metricas;

  if (/^VIAGENS_POR_ROTA\(\)$/i.test(compact) || /^VIAGENS_VALIDADAS\(\)$/i.test(compact)) {
    return m.viagens;
  }
  if (/^COUNT\(\*\)$/i.test(compact)) return m.registros;
  if (/^SUM\(PESO_TOTAL\)$/i.test(compact) || /^SUM\(PESO\)$/i.test(compact)) return m.pesoTotalKg;
  if (/^SUM\(PESO_TOTAL\)\/1000$/i.test(compact)) return m.pesoTotalTon;
  if (/^SUM\(KM_TOTAL\)$/i.test(compact) || /^SUM\(KM\)$/i.test(compact)) return m.kmTotal;
  if (/COUNTDISTINCT\(MOTORISTA\)/i.test(compact) && /^COUNTDISTINCT\(MOTORISTA\)$/i.test(compact)) {
    return m.motoristas;
  }
  if (/COUNTDISTINCT\(PLACA\)/i.test(compact) && /^COUNTDISTINCT\(PLACA\)$/i.test(compact)) {
    return m.placas;
  }
  if (/COUNTDISTINCT\(REGIONAL\)/i.test(compact)) return m.regionais;
  if (/COUNTDISTINCT\(DISTRITO\)/i.test(compact)) return m.distritos;

  if (/^FATURAMENTO_EST\(/i.test(compact)) return m.faturamento;

  // SUM(PESO TOTAL)/1000 * VALOR_TRUCK (legado)
  if (/^SUM\(PESO_TOTAL\)\/1000\*VALOR_TRUCK$/i.test(compact)) {
    return m.pesoTotalTon * Number(valoresFixos.VALOR_TRUCK || valoresFixos.VALOR_TONELADA || 0);
  }

  // DIVIDE(a, b) padrões
  const div = (a: number, b: number) => (b > 0 ? a / b : 0);

  if (/^DIVIDE\(SUM\(PESO_TOTAL\),VIAGENS_POR_ROTA\(\)\)$/i.test(compact)) {
    return div(m.pesoTotalKg, m.viagens);
  }
  if (/^DIVIDE\(SUM\(PESO_TOTAL\)\/1000,VIAGENS_POR_ROTA\(\)\)$/i.test(compact)) {
    return div(m.pesoTotalTon, m.viagens);
  }
  if (/^DIVIDE\(SUM\(KM_TOTAL\),VIAGENS_POR_ROTA\(\)\)$/i.test(compact)) {
    return div(m.kmTotal, m.viagens);
  }
  if (/^DIVIDE\(SUM\(PESO_TOTAL\)\/1000,SUM\(KM_TOTAL\)\)$/i.test(compact)) {
    return div(m.pesoTotalTon, m.kmTotal);
  }
  if (/^DIVIDE\(FATURAMENTO_EST\([^)]*\),SUM\(KM_TOTAL\)\)$/i.test(compact)) {
    return div(m.faturamento, m.kmTotal);
  }
  if (/^DIVIDE\(FATURAMENTO_EST\([^)]*\),VIAGENS_POR_ROTA\(\)\)$/i.test(compact)) {
    return div(m.faturamento, m.viagens);
  }
  if (/HORAS_PRODUTIVAS/i.test(compact)) {
    if (/^DIVIDE\(HORAS_PRODUTIVAS\([^)]*\),VIAGENS_POR_ROTA\(\)\)$/i.test(compact)) {
      return div(m.horasProdutivas, m.viagens);
    }
    if (/^DIVIDE\(FATURAMENTO_EST\([^)]*\),HORAS_PRODUTIVAS\([^)]*\)\)$/i.test(compact)) {
      return div(m.faturamento, m.horasProdutivas);
    }
    if (/^HORAS_PRODUTIVAS\(/i.test(compact)) return m.horasProdutivas;
  }

  // DIVIDE(SUM(PESO TOTAL)/1000, COUNT DISTINCT(PLACA|MOTORISTA))
  const divDistinct = compact.match(
    /^DIVIDE\(SUM\(PESO_TOTAL\)\/1000,COUNTDISTINCT\((PLACA|MOTORISTA)\)\)$/i,
  );
  if (divDistinct) {
    const den = divDistinct[1].toUpperCase() === 'PLACA' ? m.placas : m.motoristas;
    return div(m.pesoTotalTon, den);
  }

  return null;
}

export function metricaExecutivaDeColetaSql(m: MetricasColetaSql, temValor: boolean) {
  const div = (a: number, b: number) => (b > 0 ? round2(a / b) : 0);
  return {
    viagens: m.viagens,
    qtdColetores: m.placas,
    pesoTotalTon: m.pesoTotalTon,
    kmTotal: m.kmTotal,
    horasProdutivas: m.horasProdutivas,
    horasMediaRotas: div(m.horasProdutivas, m.viagens),
    faturamento: m.faturamento,
    fatPorTipo: m.fatPorTipo,
    tonKm: div(m.pesoTotalTon, m.kmTotal),
    prodColetor: div(m.pesoTotalTon, m.placas || m.somaColetores),
    kmMedioViagem: div(m.kmTotal, m.viagens),
    tonMediaColeta: div(m.pesoTotalTon, m.viagens),
    receitaKm: div(m.faturamento, m.kmTotal),
    receitaHora: div(m.faturamento, m.horasProdutivas),
    temValor,
  };
}

/** Colunas de entidade mapeáveis para GROUP BY SQL. */
const EIXO_SQL: Record<string, { dim: string }> = {
  DATASAIDA: { dim: 'data' },
  DATADESSAIDA: { dim: 'data' },
  DATA: { dim: 'data' },
  DIA: { dim: 'data' },
  REGIONAL: { dim: 'regional' },
  REGIAO: { dim: 'regional' },
  DISTRITO: { dim: 'distrito' },
  BAIRRO: { dim: 'distrito' },
  PLACA: { dim: 'placa' },
  CAMINHAO: { dim: 'placa' },
  MOTORISTA: { dim: 'motorista' },
  TURNO: { dim: 'turno' },
  TIPOCAMINHAO: { dim: 'tipo' },
};

function normCol(s: string): string {
  return s.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
}

function dimSql(dim: string): string | null {
  switch (dim) {
    case 'data': return `TO_CHAR(c."dataSaida", 'YYYY-MM-DD')`;
    case 'regional': return `COALESCE(NULLIF(TRIM(c.regional), ''), 'N/A')`;
    case 'distrito': return `COALESCE(NULLIF(TRIM(c.distrito), ''), 'N/A')`;
    case 'placa': return `COALESCE(NULLIF(TRIM(c.placa), ''), 'N/A')`;
    case 'motorista': return `COALESCE(NULLIF(TRIM(c.motorista), ''), 'N/A')`;
    case 'turno': return `COALESCE(NULLIF(TRIM(c.turno), ''), 'N/A')`;
    case 'tipo': return `COALESCE(NULLIF(TRIM(c."tipoCaminhao"), ''), 'N/A')`;
    default: return null;
  }
}

function metricaSql(eixoYNorm: string): string {
  if (!eixoYNorm || eixoYNorm === 'COUNT' || eixoYNorm === 'COUNT(*)') return 'COUNT(*)::float';
  if (eixoYNorm.includes('PESO')) return 'COALESCE(SUM(COALESCE(c."pesoTotal", 0)), 0)';
  if (eixoYNorm.includes('KM')) return 'COALESCE(SUM(COALESCE(c."kmTotal", 0)), 0)';
  if (eixoYNorm.includes('VIAGEM') || eixoYNorm.includes('VIAGENS')) {
    return sqlSumViagens('c');
  }
  if (eixoYNorm.includes('HORA')) {
    return `COALESCE(SUM(CASE WHEN c."horasForaUnidade" BETWEEN 0 AND 24 THEN c."horasForaUnidade" ELSE 0 END), 0)`;
  }
  return 'COUNT(*)::float';
}

/**
 * Agrega gráfico via SQL quando eixo X é coluna de entidade conhecida.
 * Retorna null se precisar fallback in-memory.
 */
export async function agregarGraficoColetaSql(
  servicoId: string,
  input: { eixoX: string; eixoY?: string; tipo?: string; topN?: number },
  filtros?: { dataInicio?: string; dataFim?: string },
): Promise<{ dados: { name: string; value: number }[]; total: number; processados: number } | null> {
  const eixoXNorm = normCol(input.eixoX || '');
  const map = EIXO_SQL[eixoXNorm];
  if (!map) return null;

  const uploadIds = await getUploadIds(servicoId);
  if (!uploadIds.length) return { dados: [], total: 0, processados: 0 };

  const { dataInicio, dataFim } = parsePeriodo(filtros || {});
  const dim = dimSql(map.dim);
  if (!dim) return null;

  const topN = Math.min(Math.max(input.topN || 10, 1), 100);
  const yExpr = input.tipo === 'pizza' ? 'COUNT(*)::float' : metricaSql(normCol(input.eixoY || ''));
  const isData = map.dim === 'data';

  const qb = baseQb(uploadIds, dataInicio, dataFim)
    .select([`${dim} AS name`, `${yExpr} AS value`])
    .groupBy(dim);

  if (isData) {
    qb.orderBy('name', 'ASC');
  } else {
    qb.orderBy('value', 'DESC').limit(topN);
  }

  const rows = await qb.getRawMany();
  const dados = rows.map((r) => ({
    name: String(r.name ?? 'N/A'),
    value: round2(Number(r.value || 0)),
  }));
  const total = dados.reduce((s, d) => s + d.value, 0);
  return { dados, total: round2(total), processados: dados.length };
}
