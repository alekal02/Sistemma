/**
 * Métricas operacionais de roçada a partir dos registros do dia.
 * Área fica no JSONB (Area m² / AREA_M2 / M2).
 */

function num(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const s = String(v).trim().replace(/\s/g, '').replace(/R\$/gi, '');
  if (!s) return 0;
  let n: number;
  if (s.includes(',') && s.includes('.')) {
    n = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? Number(s.replace(/\./g, '').replace(',', '.'))
      : Number(s.replace(/,/g, ''));
  } else if (s.includes(',')) {
    n = Number(s.replace(',', '.'));
  } else {
    n = Number(s);
  }
  return !Number.isNaN(n) && n > 0 ? n : 0;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function areaDoRegistro(r: Record<string, unknown>): number {
  return num(
    r['Area m²'] ?? r.AREA_M2 ?? r.M2 ?? r.AREA_ROCADA ?? r.areaM2 ?? r['Área'],
  );
}

export interface ResumoRocadaDia {
  registros: number;
  areaM2: number;
  areaManualM2?: number;
  areaMecanizadaM2?: number;
  registrosManual?: number;
  registrosMecanizada?: number;
  bairros: number;
  operadores: number;
  equipes: number;
  equipamentos: number;
}

export interface LinhaRocadaAgrupada {
  chave: string;
  label: string;
  registros: number;
  areaM2: number;
}

export type StatusVsMediaRocada = 'acima' | 'na_media' | 'abaixo';

export interface FrotaRocadaCiclo {
  equipes: number;
  equipamentos: number;
  labelsEquipamento?: string[];
}

export interface LinhaProducaoUnidade extends LinhaRocadaAgrupada {
  vsMedia: number;
  status: StatusVsMediaRocada;
}

export interface ResumoProducaoUnidade {
  unidadeSingular: string;
  unidadePlural: string;
  ativas: number;
  frota: number;
  total: number;
  media: number;
  ausentes: string[];
  linhas: LinhaProducaoUnidade[];
}

function normalizarRotuloTipo(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

export function equipeEhApenasTipo(linhas: LinhaRocadaAgrupada[]): boolean {
  const uteis = (linhas || []).filter((l) => l.label && l.label !== 'Não informado' && l.areaM2 > 0);
  if (uteis.length === 0) return true;
  return uteis.every((l) => {
    const n = normalizarRotuloTipo(l.label);
    return n === 'MANUAL' || n === 'MECANIZADA' || n === 'ROCADA' || n === 'ROCAD';
  });
}

function statusVsMedia(area: number, media: number): StatusVsMediaRocada {
  if (!(media > 0)) return 'na_media';
  if (area >= media * 1.1) return 'acima';
  if (area <= media * 0.9) return 'abaixo';
  return 'na_media';
}

/** Produção por trator (equipamento) ou equipe, com média do dia e cobertura da frota do ciclo. */
export function resumirProducaoPorUnidade(opts: {
  porEquipamento?: LinhaRocadaAgrupada[];
  porEquipe?: LinhaRocadaAgrupada[];
  frotaCiclo?: FrotaRocadaCiclo | null;
  preferirTrator?: boolean;
}): ResumoProducaoUnidade {
  const equipeSoTipo = equipeEhApenasTipo(opts.porEquipe || []);
  const equips = (opts.porEquipamento || []).filter((l) => l.label && l.label !== 'Não informado' && l.areaM2 > 0);
  const equipes = (opts.porEquipe || []).filter((l) => l.label && l.label !== 'Não informado' && l.areaM2 > 0);
  const usarTrator = Boolean(opts.preferirTrator || equips.length > 0 || equipeSoTipo);
  const ativas = usarTrator ? equips : equipes;
  const n = ativas.length;
  const total = ativas.reduce((s, l) => s + Number(l.areaM2 || 0), 0);
  const media = n > 0 ? total / n : 0;
  const frotaInformada = usarTrator
    ? Number(opts.frotaCiclo?.equipamentos || 0)
    : Number(opts.frotaCiclo?.equipes || 0);
  const frota = Math.max(frotaInformada, n);
  const labelsFrota = usarTrator ? (opts.frotaCiclo?.labelsEquipamento || []) : [];
  const presentes = new Set(ativas.map((l) => l.label));
  const ausentes = labelsFrota.filter((lab) => lab && !presentes.has(lab));
  return {
    unidadeSingular: usarTrator ? 'trator' : 'equipe',
    unidadePlural: usarTrator ? 'tratores' : 'equipes',
    ativas: n,
    frota,
    total,
    media,
    ausentes,
    linhas: [...ativas]
      .sort((a, b) => b.areaM2 - a.areaM2)
      .map((l) => ({
        ...l,
        vsMedia: media > 0 ? l.areaM2 / media : 1,
        status: statusVsMedia(l.areaM2, media),
      })),
  };
}

export function labelStatusVsMedia(status: StatusVsMediaRocada): string {
  if (status === 'acima') return 'Acima da média';
  if (status === 'abaixo') return 'Abaixo da média';
  return 'Na média';
}

export interface AnaliseRocadaDia {
  resumo: ResumoRocadaDia;
  porBairro: LinhaRocadaAgrupada[];
  porOperador: LinhaRocadaAgrupada[];
  porEquipe: LinhaRocadaAgrupada[];
  porEquipamento: LinhaRocadaAgrupada[];
  frotaCiclo?: FrotaRocadaCiclo;
}

function agregar(
  registros: Record<string, unknown>[],
  pick: (r: Record<string, unknown>) => string | null,
  fallback = 'Não informado',
): LinhaRocadaAgrupada[] {
  const mapa = new Map<string, LinhaRocadaAgrupada>();
  for (const r of registros) {
    const label = pick(r) || fallback;
    const cur = mapa.get(label) || { chave: label, label, registros: 0, areaM2: 0 };
    cur.registros += 1;
    cur.areaM2 += areaDoRegistro(r);
    mapa.set(label, cur);
  }
  return [...mapa.values()].sort((a, b) => b.areaM2 - a.areaM2);
}

function tipoExecucaoDoRegistro(r: Record<string, unknown>): 'manual' | 'mecanizada' | 'desconhecido' {
  const bruto = String(
    r.TIPO_EXECUCAO ?? r._tipoExecucao ?? r.TIPO ?? r.Tipo ?? r.tipo ?? '',
  ).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (/\bMANUAL\b/.test(bruto) || bruto.includes('MAO DE OBRA') || bruto.includes('ENXADA')) return 'manual';
  if (
    bruto.includes('MECAN')
    || bruto.includes('TRATOR')
    || bruto.includes('ROCADEIRA')
    || bruto.includes('GIRO')
    || bruto.includes('MAQUINA')
  ) {
    return 'mecanizada';
  }
  return 'desconhecido';
}

function localDoRegistro(r: Record<string, unknown>): string | null {
  return str(
    r.BAIRRO ?? r.bairro ?? r.TRECHO ?? r.LOCAL ?? r.regional ?? r.REGIONAL
    ?? r.LOGRADOURO ?? r.LOCALIZACAO ?? r['LOCALIZAÇÃO'],
  );
}

function segmentoDoRegistro(r: Record<string, unknown>): string | null {
  const inicio = str(r.INICIO ?? r['INÍCIO']);
  const termino = str(r.TERMINO ?? r['TÉRMINO']);
  if (inicio || termino) return [inicio, termino].filter(Boolean).join(' → ');
  return str(r.Operador ?? r.OPERADOR ?? r.motorista ?? r.ENDERECO ?? r['ENDEREÇO'] ?? r.ENDEREÇO);
}

function equipeDoRegistro(r: Record<string, unknown>): string | null {
  return str(r.Equipe ?? r.EQUIPE ?? r.PERIODICIDADE ?? r.turno ?? r.TURNO);
}

function equipamentoDoRegistro(r: Record<string, unknown>): string | null {
  const eq = str(r.Equipamento ?? r.EQUIPAMENTO ?? r.tipoCaminhao);
  if (!eq) return null;
  const n = eq.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (n === 'ROCADA' || n === 'MANUAL' || n === 'MECANIZADA') return null;
  return eq;
}

export function analisarRocadaDia(registros: Record<string, unknown>[]): AnaliseRocadaDia {
  const areaM2 = registros.reduce((s, r) => s + areaDoRegistro(r), 0);
  let areaManualM2 = 0;
  let areaMecanizadaM2 = 0;
  for (const r of registros) {
    const a = areaDoRegistro(r);
    const t = tipoExecucaoDoRegistro(r);
    if (t === 'manual') areaManualM2 += a;
    else if (t === 'mecanizada') areaMecanizadaM2 += a;
  }
  const bairros = new Set(registros.map(localDoRegistro).filter(Boolean));
  const operadores = new Set(registros.map(segmentoDoRegistro).filter(Boolean));
  const equipes = new Set(registros.map(equipeDoRegistro).filter(Boolean));
  const equipamentos = new Set(registros.map(equipamentoDoRegistro).filter(Boolean));

  return {
    resumo: {
      registros: registros.length,
      areaM2,
      areaManualM2: Math.round(areaManualM2 * 100) / 100,
      areaMecanizadaM2: Math.round(areaMecanizadaM2 * 100) / 100,
      registrosManual: registros.filter((r) => tipoExecucaoDoRegistro(r) === 'manual').length,
      registrosMecanizada: registros.filter((r) => tipoExecucaoDoRegistro(r) === 'mecanizada').length,
      bairros: bairros.size,
      operadores: operadores.size,
      equipes: equipes.size,
      equipamentos: equipamentos.size,
    },
    porBairro: agregar(registros, localDoRegistro),
    porOperador: agregar(registros, segmentoDoRegistro),
    porEquipe: agregar(registros, equipeDoRegistro),
    porEquipamento: agregar(registros, equipamentoDoRegistro),
  };
}

export function fmtAreaM2(v: number): string {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}
