/**
 * Utilitários de agregação de gráficos — espelham a lógica do backend
 * para fallback local quando o batch de gráficos não está disponível.
 */

export function detectarEixoXEhData(eixoX: string): boolean {
  const colNorm = eixoX.trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
  return colNorm.includes('DATA') || colNorm.includes('DIA') || colNorm.includes('MES') || colNorm.includes('ANO');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function parseDataLocal(val: unknown): Date | null {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date && !isNaN(val.getTime())) return val;

  if (typeof val === 'number' && !isNaN(val) && val >= 1 && val < 2958466) {
    const d = new Date(Date.UTC(1899, 11, 30));
    d.setUTCDate(d.getUTCDate() + Math.floor(val));
    return d;
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    const br = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (br) return new Date(Date.UTC(+br[3], +br[2] - 1, +br[1]));
    const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    const num = Number(trimmed.replace(',', '.'));
    if (!isNaN(num) && num >= 1 && num < 2958466) {
      const d = new Date(Date.UTC(1899, 11, 30));
      d.setUTCDate(d.getUTCDate() + Math.floor(num));
      return d;
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime()) && trimmed.length >= 8) return parsed;
  }

  return null;
}

export function formatarDataExibicao(val: unknown): string {
  const parsed = parseDataLocal(val);
  if (parsed) {
    return `${pad2(parsed.getUTCDate())}/${pad2(parsed.getUTCMonth() + 1)}/${parsed.getUTCFullYear()}`;
  }
  return val != null ? String(val) : 'N/A';
}

type EntradaAgregada = { sortKey: number; label: string; value: number };

export function ordenarDadosGrafico(
  entradas: EntradaAgregada[],
  eixoXEhData: boolean,
  tipo: 'barra' | 'linha' | 'pizza',
  topN: number,
): { name: string; value: number }[] {
  if (eixoXEhData && (tipo === 'barra' || tipo === 'linha')) {
    return entradas
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(e => ({ name: e.label, value: e.value }));
  }

  return [...entradas]
    .sort((a, b) => b.value - a.value)
    .slice(0, topN)
    .map(e => ({ name: e.label, value: e.value }));
}

export function agregarSerieLocal(
  eixoX: string,
  eixoY: string,
  dadosBrutos: Record<string, unknown>[],
  colunasHoraSet: Set<string>,
  tipo: 'barra' | 'linha' | 'pizza' = 'barra',
  topN = 10,
  encontrarValor: (d: Record<string, unknown>, col: string) => unknown,
  serialParaMinutos: (v: unknown) => number,
): { name: string; value: number }[] {
  const eixoXEhData = detectarEixoXEhData(eixoX);

  if (tipo === 'pizza') {
    const contagem: Record<string, number> = {};
    for (const d of dadosBrutos) {
      const rawKey = encontrarValor(d, eixoX);
      const label = eixoXEhData ? formatarDataExibicao(rawKey) : String(rawKey ?? 'N/A');
      contagem[label] = (contagem[label] || 0) + 1;
    }
    return Object.entries(contagem)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([name, value]) => ({ name, value }));
  }

  const nomeUpperY = eixoY.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const temKM = nomeUpperY.includes('KM') || nomeUpperY.includes('KILOMETRO') || nomeUpperY.includes('QUILOMETRO');
  const isHoraY = colunasHoraSet.has(eixoY) || (!temKM && (
    nomeUpperY.includes('HORA') || nomeUpperY.includes('HORAR') ||
    nomeUpperY.includes('TEMPO') || nomeUpperY.includes('DURACAO') ||
    nomeUpperY.includes('MINUT') || nomeUpperY.includes('ENTRADA') ||
    nomeUpperY.includes('SAIDA') || nomeUpperY.includes('CHEGADA')
  ));

  const acc = new Map<number, EntradaAgregada>();

  for (const d of dadosBrutos) {
    const rawKey = encontrarValor(d, eixoX);
    let sortKey: number;
    let label: string;

    if (eixoXEhData) {
      const parsed = parseDataLocal(rawKey);
      label = formatarDataExibicao(rawKey);
      sortKey = parsed ? parsed.getTime() : 0;
    } else {
      label = String(rawKey ?? 'N/A');
      sortKey = label.split('').reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0);
    }

    const valRaw = encontrarValor(d, eixoY);
    const val = isHoraY ? serialParaMinutos(valRaw) : Number(valRaw) || 0;

    const existente = acc.get(sortKey);
    if (existente) {
      existente.value += val;
    } else {
      acc.set(sortKey, { sortKey, label, value: val });
    }
  }

  return ordenarDadosGrafico([...acc.values()], eixoXEhData, tipo, topN);
}
