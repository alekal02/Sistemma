import { normalizarPlaca } from './normalizarPlaca';

export function normalizarListaPlacasReserva(raw: unknown): string[] {
  if (!raw) return [];
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((v) => normalizarPlaca(String(v))).filter(Boolean))];
}
