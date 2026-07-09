/** Canonicaliza placa BR — ABC-1234 e ABC1234 contam como o mesmo veículo. */
export function normalizarPlaca(raw: string | null | undefined): string {
  const p = String(raw ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s.\-/]/g, '');

  if (!p || p === '—' || p === '-') return '';
  return p;
}
