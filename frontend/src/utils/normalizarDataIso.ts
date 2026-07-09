function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Date do banco/Excel (meia-noite UTC) vs datetime local */
function dateParaIso(val: Date): string {
  if (
    val.getUTCHours() === 0
    && val.getUTCMinutes() === 0
    && val.getUTCSeconds() === 0
    && val.getUTCMilliseconds() === 0
  ) {
    return `${val.getUTCFullYear()}-${pad2(val.getUTCMonth() + 1)}-${pad2(val.getUTCDate())}`;
  }
  return `${val.getFullYear()}-${pad2(val.getMonth() + 1)}-${pad2(val.getDate())}`;
}

function excelSerialParaIso(serial: number): string | null {
  if (serial < 1 || serial >= 2958466) return null;
  const utcDays = Math.floor(serial - 25569);
  const d = new Date(utcDays * 86400000);
  if (isNaN(d.getTime())) return null;
  return dateParaIso(d);
}

/**
 * Converte valor de planilha/banco para yyyy-MM-dd (comparação segura entre máquinas).
 */
export function normalizarDataParaIso(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null;

  if (val instanceof Date && !isNaN(val.getTime())) {
    return dateParaIso(val);
  }

  if (typeof val === 'number' && !isNaN(val)) {
    return excelSerialParaIso(val);
  }

  const s = String(val).trim();
  if (!s || s === '—') return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (br) {
    return `${br[3]}-${pad2(Number(br[2]))}-${pad2(Number(br[1]))}`;
  }

  const num = Number(s.replace(',', '.'));
  if (!isNaN(num)) {
    const fromSerial = excelSerialParaIso(num);
    if (fromSerial) return fromSerial;
  }

  const dt = new Date(s);
  if (!isNaN(dt.getTime()) && s.length >= 8) {
    return dateParaIso(dt);
  }

  return null;
}
