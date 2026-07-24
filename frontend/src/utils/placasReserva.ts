import { normalizarPlaca } from './normalizarPlaca';

export interface ConfigOperacionalContrato {
  placasReserva?: string[];
  placasAtivas?: string[];
  motoristas?: string[];
  coletores?: string[];
  pesoMaximoKg?: { MINI?: number; TOCO?: number; BASCULANTE?: number; TRUCK?: number };
  volumeL?: { MINI?: number; TOCO?: number; BASCULANTE?: number; TRUCK?: number };
  densidadeResiduoKgL?: number | null;
  densidadeKgL?: { MINI?: number; TOCO?: number; BASCULANTE?: number; TRUCK?: number };
}

export function normalizarListaPlacasReserva(raw: unknown): string[] {
  if (!raw) return [];
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((v) => normalizarPlaca(String(v))).filter(Boolean))];
}

export function parsePlacasReservaTexto(texto: string): string[] {
  return [...new Set(
    texto
      .split(/[\n,;]+/)
      .map((s) => normalizarPlaca(s.trim()))
      .filter(Boolean),
  )];
}

export function placasReservaParaTexto(placas: string[]): string {
  return placas.join('\n');
}

export function ehPlacaReserva(placa: string | null | undefined, placasReserva?: string[]): boolean {
  if (!placasReserva?.length) return false;
  const p = normalizarPlaca(placa);
  if (!p) return false;
  const set = new Set(placasReserva.map(normalizarPlaca));
  return set.has(p);
}

export function extrairPlacasReservaContrato(
  contrato?: { configOperacional?: ConfigOperacionalContrato | null } | null,
): string[] {
  return normalizarListaPlacasReserva(contrato?.configOperacional?.placasReserva);
}

export function resumirFrotaOperacao(
  placasAtivas: string[],
  placasReserva?: string[],
): { titulares: number; reserva: number; total: number; placasReservaAtivas: string[] } {
  const setReserva = new Set((placasReserva ?? []).map(normalizarPlaca));
  const placasReservaAtivas: string[] = [];
  for (const pl of placasAtivas) {
    const n = normalizarPlaca(pl);
    if (n && setReserva.has(n)) placasReservaAtivas.push(pl);
  }
  const total = placasAtivas.length;
  const reserva = placasReservaAtivas.length;
  return { titulares: total - reserva, reserva, total, placasReservaAtivas };
}
