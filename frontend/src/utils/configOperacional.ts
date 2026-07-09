import { normalizarPlaca } from './normalizarPlaca';
import type { ConfigOperacionalContrato } from './placasReserva';

export type { ConfigOperacionalContrato };

export function parseListaTexto(texto: string): string[] {
  return texto
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseListaPlacasTexto(texto: string): string[] {
  return [...new Set(parseListaTexto(texto).map((s) => normalizarPlaca(s)).filter(Boolean))];
}

export function parseListaNomesTexto(texto: string): string[] {
  return [...new Set(parseListaTexto(texto))];
}

export function listaParaTexto(lista: string[] | undefined | null): string {
  return (lista ?? []).join('\n');
}

export function extrairCadastroOperacionalContrato(
  contrato?: { configOperacional?: ConfigOperacionalContrato | null } | null,
) {
  const cfg = contrato?.configOperacional;
  return {
    placasAtivas: cfg?.placasAtivas ?? [],
    motoristas: cfg?.motoristas ?? [],
    coletores: cfg?.coletores ?? [],
  };
}

export function cadastroOperacionalPreenchido(
  contrato?: { configOperacional?: ConfigOperacionalContrato | null } | null,
): boolean {
  const { placasAtivas, motoristas, coletores } = extrairCadastroOperacionalContrato(contrato);
  return placasAtivas.length > 0 || motoristas.length > 0 || coletores.length > 0;
}
