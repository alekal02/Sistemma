import { ColetaData } from '../entities/ColetaData';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Formata Date (UTC) como dd/mm/aaaa — alinhado ao serial Excel */
export function formatarDatePtBrUtc(date: Date): string {
  return `${pad2(date.getUTCDate())}/${pad2(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

/** Formata Date local como dd/mm/aaaa (ex.: coluna date do Postgres) */
export function formatarDatePtBrLocal(date: Date): string {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function parseIsoYmd(texto: string): string | null {
  const m = texto.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function parseBr(texto: string): string | null {
  const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${pad2(Number(m[1]))}/${pad2(Number(m[2]))}/${m[3]}`;
}

/**
 * Converte valor de célula Excel / banco / string para exibição dd/mm/aaaa.
 * Usado em relatórios de inconsistência e previews de planilha.
 */
export function formatarDataPlanilha(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null;

  if (val instanceof Date && !isNaN(val.getTime())) {
    // Serial Excel via fromExcelDate usa meia-noite UTC
    if (val.getUTCHours() === 0 && val.getUTCMinutes() === 0 && val.getUTCSeconds() === 0) {
      return formatarDatePtBrUtc(val);
    }
    return formatarDatePtBrLocal(val);
  }

  if (typeof val === 'number' && !isNaN(val)) {
    if (val >= 1 && val < 2958466) {
      const d = ColetaData.fromExcelDate(val);
      return d ? formatarDatePtBrUtc(d) : null;
    }
    return String(val);
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;

    const br = parseBr(trimmed);
    if (br) return br;

    const iso = parseIsoYmd(trimmed);
    if (iso) return iso;

    const num = Number(trimmed.replace(',', '.'));
    if (!isNaN(num) && num >= 1 && num < 2958466) {
      const d = ColetaData.fromExcelDate(num);
      if (d) return formatarDatePtBrUtc(d);
    }

    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime()) && trimmed.length >= 8) {
      return formatarDatePtBrLocal(parsed);
    }

    return trimmed;
  }

  return String(val);
}

/** Formata dataSaida do banco para relatórios */
export function formatarDataSaida(val: Date | string | null | undefined): string | null {
  return formatarDataPlanilha(val);
}

/** Converte célula de planilha (serial, string ou Date) para Date */
export function parseDataPlanilha(val: unknown): Date | null {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  if (typeof val === 'number' && !isNaN(val) && val >= 1 && val < 2958466) {
    return ColetaData.fromExcelDate(val);
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    const br = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (br) return new Date(Date.UTC(+br[3], +br[2] - 1, +br[1]));
    const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    const num = Number(trimmed.replace(',', '.'));
    if (!isNaN(num) && num >= 1 && num < 2958466) return ColetaData.fromExcelDate(num);
  }
  return null;
}

/** Serial Excel fora da faixa operacional esperada (≈ 2009–2064) */
export function excelSerialDataInvalido(valor: number): boolean {
  return valor < 40000 || valor > 60000;
}
