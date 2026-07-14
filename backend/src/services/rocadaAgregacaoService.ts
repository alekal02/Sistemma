/**
 * Agregações SQL de roçada — escala para 500k+ registros sem materializar linhas.
 */
import AppDataSource from '../database/data-source';
import { ColetaData } from '../entities/ColetaData';
import { PlanilhaUpload } from '../entities/PlanilhaUpload';
import { aplicarFiltroViagensValidasDashboard } from './validacaoViagemService';
import { calcularFaturamentoRocadaPorAreas } from '../utils/rocadaTipoExecucao';

/** Expressão SQL da área m² no JSONB (aliases canônicos). */
export const AREA_M2_SQL = `
  COALESCE(
    NULLIF(c.dados->>'Area m²', '')::double precision,
    NULLIF(c.dados->>'AREA_M2', '')::double precision,
    NULLIF(c.dados->>'M2', '')::double precision,
    NULLIF(c.dados->>'AREA_ROCADA', '')::double precision,
    0
  )
`;

/** Texto usado para classificar Manual × Mecanizada (inclui campos gravados no upload). */
export const TEXTO_TIPO_EXEC_SQL = `UPPER(TRIM(BOTH FROM CONCAT_WS(' ',
  COALESCE(c.dados->>'TIPO_EXECUCAO', ''),
  COALESCE(c.dados->>'_tipoExecucao', ''),
  COALESCE(c.dados->>'TIPO', ''),
  COALESCE(c.dados->>'Tipo', ''),
  COALESCE(c.tipoCaminhao, ''),
  COALESCE(c.dados->>'Equipamento', ''),
  COALESCE(c.dados->>'EQUIPAMENTO', '')
)))`;

export const IS_MANUAL_SQL = `(
  ${TEXTO_TIPO_EXEC_SQL} ~* '\\mMANUAL\\M'
  OR ${TEXTO_TIPO_EXEC_SQL} LIKE '%MAO DE OBRA%'
  OR ${TEXTO_TIPO_EXEC_SQL} LIKE '%ENXADA%'
)`;

export const IS_MECANIZADA_SQL = `(
  ${TEXTO_TIPO_EXEC_SQL} LIKE '%MECAN%'
  OR ${TEXTO_TIPO_EXEC_SQL} LIKE '%TRATOR%'
  OR ${TEXTO_TIPO_EXEC_SQL} LIKE '%ROCADEIRA%'
  OR ${TEXTO_TIPO_EXEC_SQL} LIKE '%GIRO%'
  OR ${TEXTO_TIPO_EXEC_SQL} LIKE '%MAQUINA%'
  OR ${TEXTO_TIPO_EXEC_SQL} LIKE '%MOTORIZ%'
)`;

export interface LinhaRocadaAgregada {
  chave: string;
  label: string;
  registros: number;
  areaM2: number;
}

export interface ResumoRocadaAgregado {
  registros: number;
  areaM2: number;
  areaManualM2: number;
  areaMecanizadaM2: number;
  areaDesconhecidaM2: number;
  registrosManual: number;
  registrosMecanizada: number;
  registrosDesconhecido: number;
  bairros: number;
  operadores: number;
  equipes: number;
  equipamentos: number;
}

/** Bloco completo de um tipo (Manual ou Mecanizada) para o dashboard separado. */
export interface BlocoTipoRocada {
  tipo: 'manual' | 'mecanizada';
  label: string;
  registros: number;
  areaM2: number;
  bairros: number;
  operadores: number;
  equipes: number;
  equipamentos: number;
  porBairro: LinhaRocadaAgregada[];
  porOperador: LinhaRocadaAgregada[];
  porEquipe: LinhaRocadaAgregada[];
  porEquipamento: LinhaRocadaAgregada[];
}

export interface AgregacaoRocadaResult {
  resumo: ResumoRocadaAgregado;
  /** Ranking Manual × Mecanizada (para gráfico / cards) */
  porTipo: LinhaRocadaAgregada[];
  /** Dados e rankings separados por tipo */
  manual: BlocoTipoRocada | null;
  mecanizada: BlocoTipoRocada | null;
  porBairro: LinhaRocadaAgregada[];
  porOperador: LinhaRocadaAgregada[];
  porEquipe: LinhaRocadaAgregada[];
  porEquipamento: LinhaRocadaAgregada[];
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

function mapGrupo(rows: any[]): LinhaRocadaAgregada[] {
  return rows.map((r) => {
    const label = String(r.label || 'Não informado').trim() || 'Não informado';
    return {
      chave: label,
      label,
      registros: Number(r.registros || 0),
      areaM2: Math.round(Number(r.area_m2 || 0) * 100) / 100,
    };
  });
}

function filtroTipoSql(tipo?: 'manual' | 'mecanizada' | null): string | null {
  if (tipo === 'manual') return IS_MANUAL_SQL;
  if (tipo === 'mecanizada') return `NOT (${IS_MANUAL_SQL}) AND ${IS_MECANIZADA_SQL}`;
  return null;
}

type AggOpts = {
  dataInicio?: string;
  dataFim?: string;
  data?: string;
  topN?: number;
  tipoExecucao?: 'manual' | 'mecanizada' | null;
  incluirBlocosPorTipo?: boolean;
};

async function agregarEscopo(
  uploadIds: number[],
  dataInicio: string | null,
  dataFim: string | null,
  topN: number,
  tipoExecucao?: 'manual' | 'mecanizada' | null,
): Promise<{
  resumoRaw: any;
  porBairro: LinhaRocadaAgregada[];
  porOperador: LinhaRocadaAgregada[];
  porEquipe: LinhaRocadaAgregada[];
  porEquipamento: LinhaRocadaAgregada[];
}> {
  const repo = AppDataSource.getRepository(ColetaData);
  const tipoSql = filtroTipoSql(tipoExecucao || null);

  const baseWhere = (alias = 'c') => {
    const qb = repo.createQueryBuilder(alias)
      .where(`${alias}.planilhaUploadId IN (:...uploadIds)`, { uploadIds });
    aplicarFiltroViagensValidasDashboard(qb, alias);
    if (dataInicio) qb.andWhere(`${alias}.dataSaida >= :inicio`, { inicio: dataInicio });
    if (dataFim) qb.andWhere(`${alias}.dataSaida <= :fim`, { fim: dataFim });
    if (tipoSql) qb.andWhere(tipoSql.replace(/\bc\./g, `${alias}.`));
    return qb;
  };

  const labelBairro = `COALESCE(NULLIF(TRIM(c.regional), ''), NULLIF(TRIM(c.dados->>'BAIRRO'), ''), 'Não informado')`;
  const labelOperador = `COALESCE(NULLIF(TRIM(c.motorista), ''), NULLIF(TRIM(c.dados->>'Operador'), ''), NULLIF(TRIM(c.dados->>'OPERADOR'), ''), 'Não informado')`;
  const labelEquipe = `COALESCE(NULLIF(TRIM(c.turno), ''), NULLIF(TRIM(c.dados->>'Equipe'), ''), NULLIF(TRIM(c.dados->>'EQUIPE'), ''), 'Não informado')`;
  const labelEquip = `COALESCE(NULLIF(TRIM(c.tipoCaminhao), ''), NULLIF(TRIM(c.dados->>'Equipamento'), ''), NULLIF(TRIM(c.dados->>'EQUIPAMENTO'), ''), 'Não informado')`;

  const [resumoRaw, porBairro, porOperador, porEquipe, porEquipamento] = await Promise.all([
    baseWhere()
      .select([
        'COUNT(*)::int AS registros',
        `COALESCE(SUM(${AREA_M2_SQL}), 0) AS area_m2`,
        `COALESCE(SUM(CASE WHEN ${IS_MANUAL_SQL} THEN ${AREA_M2_SQL} ELSE 0 END), 0) AS area_manual_m2`,
        `COALESCE(SUM(CASE WHEN NOT (${IS_MANUAL_SQL}) AND ${IS_MECANIZADA_SQL} THEN ${AREA_M2_SQL} ELSE 0 END), 0) AS area_mecanizada_m2`,
        `COALESCE(SUM(CASE WHEN NOT (${IS_MANUAL_SQL}) AND NOT (${IS_MECANIZADA_SQL}) THEN ${AREA_M2_SQL} ELSE 0 END), 0) AS area_desconhecida_m2`,
        `COALESCE(SUM(CASE WHEN ${IS_MANUAL_SQL} THEN 1 ELSE 0 END), 0)::int AS registros_manual`,
        `COALESCE(SUM(CASE WHEN NOT (${IS_MANUAL_SQL}) AND ${IS_MECANIZADA_SQL} THEN 1 ELSE 0 END), 0)::int AS registros_mecanizada`,
        `COALESCE(SUM(CASE WHEN NOT (${IS_MANUAL_SQL}) AND NOT (${IS_MECANIZADA_SQL}) THEN 1 ELSE 0 END), 0)::int AS registros_desconhecido`,
        `COUNT(DISTINCT ${labelBairro})::int AS bairros`,
        `COUNT(DISTINCT ${labelOperador})::int AS operadores`,
        `COUNT(DISTINCT ${labelEquipe})::int AS equipes`,
        `COUNT(DISTINCT ${labelEquip})::int AS equipamentos`,
        'MIN(c.dataSaida) AS min_d',
        'MAX(c.dataSaida) AS max_d',
      ])
      .getRawOne(),
    baseWhere()
      .select([
        `${labelBairro} AS label`,
        'COUNT(*)::int AS registros',
        `COALESCE(SUM(${AREA_M2_SQL}), 0) AS area_m2`,
      ])
      .groupBy(labelBairro)
      .orderBy('area_m2', 'DESC')
      .limit(topN)
      .getRawMany(),
    baseWhere()
      .select([
        `${labelOperador} AS label`,
        'COUNT(*)::int AS registros',
        `COALESCE(SUM(${AREA_M2_SQL}), 0) AS area_m2`,
      ])
      .groupBy(labelOperador)
      .orderBy('area_m2', 'DESC')
      .limit(topN)
      .getRawMany(),
    baseWhere()
      .select([
        `${labelEquipe} AS label`,
        'COUNT(*)::int AS registros',
        `COALESCE(SUM(${AREA_M2_SQL}), 0) AS area_m2`,
      ])
      .groupBy(labelEquipe)
      .orderBy('area_m2', 'DESC')
      .limit(topN)
      .getRawMany(),
    baseWhere()
      .select([
        `${labelEquip} AS label`,
        'COUNT(*)::int AS registros',
        `COALESCE(SUM(${AREA_M2_SQL}), 0) AS area_m2`,
      ])
      .groupBy(labelEquip)
      .orderBy('area_m2', 'DESC')
      .limit(topN)
      .getRawMany(),
  ]);

  return {
    resumoRaw,
    porBairro: mapGrupo(porBairro),
    porOperador: mapGrupo(porOperador),
    porEquipe: mapGrupo(porEquipe),
    porEquipamento: mapGrupo(porEquipamento),
  };
}

function blocoDeEscopo(
  tipo: 'manual' | 'mecanizada',
  escopo: Awaited<ReturnType<typeof agregarEscopo>>,
): BlocoTipoRocada {
  const r = escopo.resumoRaw;
  return {
    tipo,
    label: tipo === 'manual' ? 'Manual' : 'Mecanizada',
    registros: Number(r?.registros || 0),
    areaM2: Math.round(Number(r?.area_m2 || 0) * 100) / 100,
    bairros: Number(r?.bairros || 0),
    operadores: Number(r?.operadores || 0),
    equipes: Number(r?.equipes || 0),
    equipamentos: Number(r?.equipamentos || 0),
    porBairro: escopo.porBairro,
    porOperador: escopo.porOperador,
    porEquipe: escopo.porEquipe,
    porEquipamento: escopo.porEquipamento,
  };
}

export async function getAgregacaoRocada(
  servicoId: string,
  opts: AggOpts = {},
): Promise<AgregacaoRocadaResult> {
  const uploadIds = await getUploadIds(servicoId);
  const vazio: AgregacaoRocadaResult = {
    resumo: {
      registros: 0,
      areaM2: 0,
      areaManualM2: 0,
      areaMecanizadaM2: 0,
      areaDesconhecidaM2: 0,
      registrosManual: 0,
      registrosMecanizada: 0,
      registrosDesconhecido: 0,
      bairros: 0,
      operadores: 0,
      equipes: 0,
      equipamentos: 0,
    },
    porTipo: [],
    manual: null,
    mecanizada: null,
    porBairro: [],
    porOperador: [],
    porEquipe: [],
    porEquipamento: [],
    dataInicio: opts.data || opts.dataInicio || null,
    dataFim: opts.data || opts.dataFim || null,
  };
  if (!uploadIds.length) return vazio;

  const dataUnica = opts.data && /^\d{4}-\d{2}-\d{2}$/.test(opts.data) ? opts.data : null;
  const dataInicio = dataUnica || (opts.dataInicio && /^\d{4}-\d{2}-\d{2}$/.test(opts.dataInicio) ? opts.dataInicio : null);
  const dataFim = dataUnica || (opts.dataFim && /^\d{4}-\d{2}-\d{2}$/.test(opts.dataFim) ? opts.dataFim : null);
  const topN = Math.min(Math.max(opts.topN || 50, 5), 200);
  const filtro = opts.tipoExecucao === 'manual' || opts.tipoExecucao === 'mecanizada'
    ? opts.tipoExecucao
    : null;
  const incluirBlocos = opts.incluirBlocosPorTipo !== false && !filtro;

  const total = await agregarEscopo(uploadIds, dataInicio, dataFim, topN, filtro);
  const r = total.resumoRaw;

  const resumo: ResumoRocadaAgregado = {
    registros: Number(r?.registros || 0),
    areaM2: Math.round(Number(r?.area_m2 || 0) * 100) / 100,
    areaManualM2: Math.round(Number(r?.area_manual_m2 || 0) * 100) / 100,
    areaMecanizadaM2: Math.round(Number(r?.area_mecanizada_m2 || 0) * 100) / 100,
    areaDesconhecidaM2: Math.round(Number(r?.area_desconhecida_m2 || 0) * 100) / 100,
    registrosManual: Number(r?.registros_manual || 0),
    registrosMecanizada: Number(r?.registros_mecanizada || 0),
    registrosDesconhecido: Number(r?.registros_desconhecido || 0),
    bairros: Number(r?.bairros || 0),
    operadores: Number(r?.operadores || 0),
    equipes: Number(r?.equipes || 0),
    equipamentos: Number(r?.equipamentos || 0),
  };

  const porTipo: LinhaRocadaAgregada[] = [];
  if (resumo.areaManualM2 > 0 || resumo.registrosManual > 0) {
    porTipo.push({
      chave: 'manual',
      label: 'Manual',
      registros: resumo.registrosManual,
      areaM2: resumo.areaManualM2,
    });
  }
  if (resumo.areaMecanizadaM2 > 0 || resumo.registrosMecanizada > 0) {
    porTipo.push({
      chave: 'mecanizada',
      label: 'Mecanizada',
      registros: resumo.registrosMecanizada,
      areaM2: resumo.areaMecanizadaM2,
    });
  }
  if (resumo.areaDesconhecidaM2 > 0 || resumo.registrosDesconhecido > 0) {
    porTipo.push({
      chave: 'desconhecido',
      label: 'Não classificado',
      registros: resumo.registrosDesconhecido,
      areaM2: resumo.areaDesconhecidaM2,
    });
  }

  let manual: BlocoTipoRocada | null = null;
  let mecanizada: BlocoTipoRocada | null = null;

  if (incluirBlocos && (resumo.registrosManual > 0 || resumo.registrosMecanizada > 0)) {
    const [escMan, escMec] = await Promise.all([
      resumo.registrosManual > 0
        ? agregarEscopo(uploadIds, dataInicio, dataFim, topN, 'manual')
        : null,
      resumo.registrosMecanizada > 0
        ? agregarEscopo(uploadIds, dataInicio, dataFim, topN, 'mecanizada')
        : null,
    ]);
    if (escMan) manual = blocoDeEscopo('manual', escMan);
    if (escMec) mecanizada = blocoDeEscopo('mecanizada', escMec);
  } else if (filtro === 'manual') {
    manual = blocoDeEscopo('manual', total);
  } else if (filtro === 'mecanizada') {
    mecanizada = blocoDeEscopo('mecanizada', total);
  }

  return {
    resumo,
    porTipo,
    manual,
    mecanizada,
    porBairro: total.porBairro,
    porOperador: total.porOperador,
    porEquipe: total.porEquipe,
    porEquipamento: total.porEquipamento,
    dataInicio: dataInicio || toIsoDate(r?.min_d),
    dataFim: dataFim || toIsoDate(r?.max_d),
  };
}

/** Métricas SQL para KPIs de template de roçada (sem carregar linhas). */
export async function getMetricasRocadaSql(
  servicoId: string,
  opts: { dataInicio?: string; dataFim?: string } = {},
): Promise<{
  areaM2: number;
  areaManualM2: number;
  areaMecanizadaM2: number;
  areaDesconhecidaM2: number;
  registros: number;
  registrosManual: number;
  registrosMecanizada: number;
  equipes: number;
  operadores: number;
  equipamentos: number;
  bairros: number;
}> {
  const agg = await getAgregacaoRocada(servicoId, { ...opts, incluirBlocosPorTipo: false });
  return {
    areaM2: agg.resumo.areaM2,
    areaManualM2: agg.resumo.areaManualM2,
    areaMecanizadaM2: agg.resumo.areaMecanizadaM2,
    areaDesconhecidaM2: agg.resumo.areaDesconhecidaM2,
    registros: agg.resumo.registros,
    registrosManual: agg.resumo.registrosManual,
    registrosMecanizada: agg.resumo.registrosMecanizada,
    equipes: agg.resumo.equipes,
    operadores: agg.resumo.operadores,
    equipamentos: agg.resumo.equipamentos,
    bairros: agg.resumo.bairros,
  };
}

/**
 * Resolve expressão de KPI de roçada via métricas SQL.
 * Retorna null se a fórmula não for reconhecida (fallback in-memory).
 */
export function resolverKpiRocadaSql(
  expressao: string,
  metricas: Awaited<ReturnType<typeof getMetricasRocadaSql>>,
  valoresFixos: Record<string, number>,
): number | null {
  const expr = (expressao || '').trim();
  if (!expr) return null;

  const norm = expr
    .replace(/\s+/g, ' ')
    .replace(/Area\s*m²/gi, 'AREA_M2')
    .replace(/Área\s*m²/gi, 'AREA_M2')
    .replace(/AREA_ROCADA/gi, 'AREA_M2')
    .toUpperCase();

  const compact = norm.replace(/\s+/g, '');

  if (/^SUM\s*\(\s*AREA_M2\s*\)\s*\*\s*VALOR_M2$/i.test(compact)) {
    return calcularFaturamentoRocadaPorAreas(
      {
        manual: metricas.areaManualM2,
        mecanizada: metricas.areaMecanizadaM2,
        desconhecido: metricas.areaDesconhecidaM2,
      },
      valoresFixos,
    );
  }
  if (/^SUM\s*\(\s*AREA_MANUAL_M2\s*\)$/i.test(compact) || /^SUM\s*\(\s*AREA_M2_MANUAL\s*\)$/i.test(compact)) {
    return metricas.areaManualM2;
  }
  if (/^SUM\s*\(\s*AREA_MECANIZADA_M2\s*\)$/i.test(compact) || /^SUM\s*\(\s*AREA_M2_MECANIZADA\s*\)$/i.test(compact)) {
    return metricas.areaMecanizadaM2;
  }
  if (/^SUM\s*\(\s*AREA_M2\s*\)$/i.test(compact)) {
    return metricas.areaM2;
  }
  if (/^COUNT\s*\(\s*\*\s*\)$/i.test(compact)) {
    return metricas.registros;
  }
  if (/COUNT\s+DISTINCT\s*\(\s*EQUIPE\s*\)/i.test(norm)) {
    if (/^COUNT\s+DISTINCT\s*\(\s*EQUIPE\s*\)$/i.test(norm.trim())) return metricas.equipes;
  }
  if (/COUNT\s+DISTINCT\s*\(\s*OPERADOR\s*\)/i.test(norm)) {
    if (/^COUNT\s+DISTINCT\s*\(\s*OPERADOR\s*\)$/i.test(norm.trim())) return metricas.operadores;
  }
  if (/COUNT\s+DISTINCT\s*\(\s*EQUIPAMENTO\s*\)/i.test(norm)) {
    if (/^COUNT\s+DISTINCT\s*\(\s*EQUIPAMENTO\s*\)$/i.test(norm.trim())) return metricas.equipamentos;
  }
  if (/COUNT\s+DISTINCT\s*\(\s*BAIRRO\s*\)/i.test(norm)) {
    if (/^COUNT\s+DISTINCT\s*\(\s*BAIRRO\s*\)$/i.test(norm.trim())) return metricas.bairros;
  }

  const divMatch = norm.match(
    /^DIVIDE\s*\(\s*SUM\s*\(\s*AREA_M2\s*\)\s*,\s*COUNT\s+DISTINCT\s*\(\s*(EQUIPE|OPERADOR|EQUIPAMENTO|BAIRRO)\s*\)\s*\)$/i,
  );
  if (divMatch) {
    const dim = divMatch[1].toUpperCase();
    const den =
      dim === 'EQUIPE' ? metricas.equipes
        : dim === 'OPERADOR' ? metricas.operadores
          : dim === 'EQUIPAMENTO' ? metricas.equipamentos
            : metricas.bairros;
    return den > 0 ? metricas.areaM2 / den : 0;
  }

  return null;
}
