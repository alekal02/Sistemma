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

export interface AnaliseRocadaDia {
  resumo: ResumoRocadaDia;
  porBairro: LinhaRocadaAgrupada[];
  porOperador: LinhaRocadaAgrupada[];
  porEquipe: LinhaRocadaAgrupada[];
  porEquipamento: LinhaRocadaAgrupada[];
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

export function analisarRocadaDia(registros: Record<string, unknown>[]): AnaliseRocadaDia {
  const areaM2 = registros.reduce((s, r) => s + areaDoRegistro(r), 0);
  const bairros = new Set(registros.map((r) => str(r.BAIRRO ?? r.bairro ?? r.regional ?? r.REGIONAL)).filter(Boolean));
  const operadores = new Set(registros.map((r) => str(r.Operador ?? r.OPERADOR ?? r.motorista ?? r.MOTORISTA)).filter(Boolean));
  const equipes = new Set(registros.map((r) => str(r.Equipe ?? r.EQUIPE ?? r.turno ?? r.TURNO)).filter(Boolean));
  const equipamentos = new Set(registros.map((r) => str(r.Equipamento ?? r.EQUIPAMENTO ?? r.tipoCaminhao)).filter(Boolean));

  return {
    resumo: {
      registros: registros.length,
      areaM2,
      bairros: bairros.size,
      operadores: operadores.size,
      equipes: equipes.size,
      equipamentos: equipamentos.size,
    },
    porBairro: agregar(registros, (r) => str(r.BAIRRO ?? r.bairro ?? r.regional ?? r.REGIONAL)),
    porOperador: agregar(registros, (r) => str(r.Operador ?? r.OPERADOR ?? r.motorista ?? r.MOTORISTA)),
    porEquipe: agregar(registros, (r) => str(r.Equipe ?? r.EQUIPE ?? r.turno ?? r.TURNO)),
    porEquipamento: agregar(registros, (r) => str(r.Equipamento ?? r.EQUIPAMENTO ?? r.tipoCaminhao)),
  };
}

export function fmtAreaM2(v: number): string {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}
