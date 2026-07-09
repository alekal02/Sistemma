/**
 * Contagem de viagens por rota (linha) — alinhado ao backend viagensPorRotaService.
 * Cada linha = 1 rota; CONTADOR DE VIAGENS = 1–4 viagens na rota.
 */
import { obterValorRegistro, paraNumero } from './viagemCardDados';

export const MAX_VIAGENS_DENTRO_ROTA = 4;

const COLUNAS_CONTADOR = [
  'CONTADOR DE VIAGENS',
  'CONTADOR VIAGENS',
  'Nº DE VIAGENS',
  'NUMERO DE VIAGENS',
  'NÚMERO DE VIAGENS',
  'NR VIAGENS',
  'NUMERO VIAGENS',
];

const COLUNAS_PESO = ['PESO 1', 'PESO 2', 'PESO 3', 'PESO 4'] as const;

const normalizar = (s: string) =>
  s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');

function encontrarValor(dado: Record<string, unknown>, nomeColuna: string): unknown {
  if (dado[nomeColuna] !== undefined && dado[nomeColuna] !== null && dado[nomeColuna] !== '') {
    return dado[nomeColuna];
  }
  const alvo = normalizar(nomeColuna);
  for (const [k, v] of Object.entries(dado)) {
    if (v !== null && v !== undefined && v !== '' && normalizar(k) === alvo) return v;
  }
  const dados = dado.dados;
  if (dados && typeof dados === 'object' && !Array.isArray(dados)) {
    return encontrarValor(dados as Record<string, unknown>, nomeColuna);
  }
  return undefined;
}

function contadorPlausivel(n: number): boolean {
  return !isNaN(n) && n > 0 && n <= MAX_VIAGENS_DENTRO_ROTA;
}

function limitarViagens(n: number): number {
  if (isNaN(n) || n <= 0) return 0;
  return Math.min(Math.round(n), MAX_VIAGENS_DENTRO_ROTA);
}

function valorPreenchido(val: unknown): boolean {
  if (val === null || val === undefined || val === '') return false;
  const n = paraNumero(val);
  return n > 0 || String(val).trim().length > 0;
}

export function obterContadorViagensRegistro(registro: Record<string, unknown>): number | null {
  for (const col of COLUNAS_CONTADOR) {
    const n = paraNumero(encontrarValor(registro, col));
    if (contadorPlausivel(n)) return Math.round(n);
    if (!isNaN(n) && n > MAX_VIAGENS_DENTRO_ROTA) return MAX_VIAGENS_DENTRO_ROTA;
  }

  const numeroViagens = paraNumero(registro.numeroViagens);
  if (contadorPlausivel(numeroViagens)) return Math.round(numeroViagens);

  const viagensPorRota = paraNumero(registro.viagensPorRota);
  if (contadorPlausivel(viagensPorRota)) return Math.round(viagensPorRota);

  return null;
}

function contarViagensPreenchidasPorPeso(registro: Record<string, unknown>): number {
  let total = 0;
  for (let i = 1; i <= 4; i++) {
    const col = `PESO ${i}`;
    const campo = `peso${i}` as keyof typeof registro;
    const n = paraNumero(encontrarValor(registro, col) ?? registro[campo]);
    if (n > 0) total++;
  }
  return total;
}

function registroTemDadosOperacionais(registro: Record<string, unknown>): boolean {
  const peso = paraNumero(obterValorRegistro(registro, undefined, 'pesoTotal') ?? encontrarValor(registro, 'PESO TOTAL'));
  const km = paraNumero(obterValorRegistro(registro, undefined, 'kmTotal') ?? encontrarValor(registro, 'KM TOTAL'));
  return peso > 0 || km > 0;
}

/** Viagens dentro da rota (contador → pesos → 1 operacional). */
export function contarViagensPorRotaRegistro(registro: Record<string, unknown>): number {
  const contador = obterContadorViagensRegistro(registro);
  if (contador !== null && contador > 0) return limitarViagens(contador);

  const porPeso = contarViagensPreenchidasPorPeso(registro);
  if (porPeso > 0) return porPeso;

  if (registroTemDadosOperacionais(registro)) return 1;
  return 0;
}

export function sumarizarViagensPorRota(dados: Record<string, unknown>[]): number {
  return dados.reduce((acc, reg) => acc + contarViagensPorRotaRegistro(reg), 0);
}
