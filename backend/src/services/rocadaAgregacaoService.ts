/**
 * Agregações SQL de roçada — escala para 500k+ registros sem materializar linhas.
 */
import AppDataSource from '../database/data-source';
import { ColetaData } from '../entities/ColetaData';
import { PlanilhaUpload } from '../entities/PlanilhaUpload';
import { aplicarFiltroViagensValidasDashboard } from './validacaoViagemService';

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

export interface LinhaRocadaAgregada {
  chave: string;
  label: string;
  registros: number;
  areaM2: number;
}

export interface ResumoRocadaAgregado {
  registros: number;
  areaM2: number;
  bairros: number;
  operadores: number;
  equipes: number;
  equipamentos: number;
}

export interface AgregacaoRocadaResult {
  resumo: ResumoRocadaAgregado;
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

export async function getAgregacaoRocada(
  servicoId: string,
  opts: { dataInicio?: string; dataFim?: string; data?: string; topN?: number } = {},
): Promise<AgregacaoRocadaResult> {
  const uploadIds = await getUploadIds(servicoId);
  const vazio: AgregacaoRocadaResult = {
    resumo: { registros: 0, areaM2: 0, bairros: 0, operadores: 0, equipes: 0, equipamentos: 0 },
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

  const repo = AppDataSource.getRepository(ColetaData);

  const baseWhere = (alias = 'c') => {
    const qb = repo.createQueryBuilder(alias)
      .where(`${alias}.planilhaUploadId IN (:...uploadIds)`, { uploadIds });
    aplicarFiltroViagensValidasDashboard(qb, alias);
    if (dataInicio) qb.andWhere(`${alias}.dataSaida >= :inicio`, { inicio: dataInicio });
    if (dataFim) qb.andWhere(`${alias}.dataSaida <= :fim`, { fim: dataFim });
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
    resumo: {
      registros: Number(resumoRaw?.registros || 0),
      areaM2: Math.round(Number(resumoRaw?.area_m2 || 0) * 100) / 100,
      bairros: Number(resumoRaw?.bairros || 0),
      operadores: Number(resumoRaw?.operadores || 0),
      equipes: Number(resumoRaw?.equipes || 0),
      equipamentos: Number(resumoRaw?.equipamentos || 0),
    },
    porBairro: mapGrupo(porBairro),
    porOperador: mapGrupo(porOperador),
    porEquipe: mapGrupo(porEquipe),
    porEquipamento: mapGrupo(porEquipamento),
    dataInicio: dataInicio || toIsoDate(resumoRaw?.min_d),
    dataFim: dataFim || toIsoDate(resumoRaw?.max_d),
  };
}

/** Métricas SQL para KPIs de template de roçada (sem carregar linhas). */
export async function getMetricasRocadaSql(
  servicoId: string,
  opts: { dataInicio?: string; dataFim?: string } = {},
): Promise<{
  areaM2: number;
  registros: number;
  equipes: number;
  operadores: number;
  equipamentos: number;
  bairros: number;
}> {
  const agg = await getAgregacaoRocada(servicoId, opts);
  return {
    areaM2: agg.resumo.areaM2,
    registros: agg.resumo.registros,
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

  // SUM(AREA_M2) * VALOR_M2
  if (/^SUM\s*\(\s*AREA_M2\s*\)\s*\*\s*VALOR_M2$/i.test(norm.replace(/\s+/g, ''))) {
    const v = Number(valoresFixos.VALOR_M2 || 0);
    return metricas.areaM2 * v;
  }
  if (/^SUM\s*\(\s*AREA_M2\s*\)$/i.test(norm.replace(/\s+/g, ''))) {
    return metricas.areaM2;
  }
  if (/^COUNT\s*\(\s*\*\s*\)$/i.test(norm.replace(/\s+/g, ''))) {
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

  // DIVIDE(SUM(AREA_M2), COUNT DISTINCT(X))
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
