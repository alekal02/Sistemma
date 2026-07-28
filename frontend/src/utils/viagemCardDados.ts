/** Helpers para cards de Análise de Viagens — leitura robusta dos dados da planilha/entidade */

import { normalizarDataParaIso } from './normalizarDataIso';
import { contarViagensPorRotaRegistro } from './viagensPorRota';

export interface ColunasCardViagem {
  colPeso?: string;
  colKmTotal?: string;
  colKmSaida?: string;
  colKmChegada?: string;
  colPlaca?: string;
  colMotorista?: string;
  colHoraSaida?: string;
  colHoraChegada?: string;
  colData?: string;
  colTurno?: string;
  colViagens?: string;
  colRegional?: string;
  colDistrito?: string;
}

const normalizar = (s: string) =>
  s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');

function chaveExata(chaves: string[], candidatos: string[]): string | undefined {
  for (const candidato of candidatos) {
    const alvo = normalizar(candidato);
    const found = chaves.find((k) => normalizar(k) === alvo);
    if (found) return found;
  }
  return undefined;
}

function chavePorPredicado(chaves: string[], pred: (norm: string) => boolean): string | undefined {
  return chaves.find((k) => pred(normalizar(k)));
}

/** Detecta colunas com prioridade (evita PESO 1 / KM ROTA 01 em vez dos totais) */
export function detectarColunasCardViagem(registros: Record<string, unknown>[]): ColunasCardViagem {
  const chavesSet = new Set<string>();
  for (const r of registros.slice(0, 50)) {
    Object.keys(r).forEach((k) => chavesSet.add(k));
    const dados = r.dados;
    if (dados && typeof dados === 'object' && !Array.isArray(dados)) {
      Object.keys(dados as object).forEach((k) => chavesSet.add(k));
    }
  }
  const chaves = [...chavesSet];

  const colPeso =
    chaveExata(chaves, ['PESO TOTAL', 'pesoTotal', 'PESOTOTAL']) ||
    chavePorPredicado(chaves, (n) => n.includes('PESO') && n.includes('TOTAL')) ||
    chaveExata(chaves, ['pesoTotal']);

  const colKmTotal =
    chaveExata(chaves, ['KM TOTAL', 'kmTotal', 'KMTOTAL']) ||
    chavePorPredicado(chaves, (n) => n.includes('KM') && n.includes('TOTAL')) ||
    chaveExata(chaves, ['kmTotal']);

  const colKmSaida =
    chaveExata(chaves, ['KM SAIDA', 'KM SAÍDA', 'KM SAIDA BASE', 'KM SAÍDA BASE', 'kmSaida']) ||
    chavePorPredicado(chaves, (n) => n.includes('KM') && (n.includes('SAIDA') || n.includes('SAÍDA')) && !n.includes('ROTA'));

  const colKmChegada =
    chaveExata(chaves, ['KM CHEGADA', 'KM CHEGADA BASE', 'kmChegada']) ||
    chavePorPredicado(chaves, (n) => n.includes('KM') && n.includes('CHEGADA') && !n.includes('ROTA'));

  const colPlaca =
    chaveExata(chaves, ['PLACA', 'placa']) ||
    chavePorPredicado(chaves, (n) => n === 'PLACA' || n.includes('CAMINHAO'));

  const colMotorista =
    chaveExata(chaves, ['MOTORISTA', 'motorista', 'OPERADOR']) ||
    chavePorPredicado(chaves, (n) => n.includes('MOTORISTA') || n === 'OPERADOR');

  const colHoraSaida =
    chaveExata(chaves, ['HORA SAIDA', 'HORA SÁIDA', 'HORA SAIDA BASE', 'HORA SÁIDA BASE', 'horaSaida']) ||
    chavePorPredicado(chaves, (n) => n.includes('HORA') && (n.includes('SAIDA') || n.includes('SAÍDA')) && !n.includes('ROTA'));

  const colHoraChegada =
    chaveExata(chaves, ['HORA CHEGADA', 'HORA CHEGADA BASE', 'horaChegada']) ||
    chavePorPredicado(chaves, (n) => n.includes('HORA') && n.includes('CHEGADA') && !n.includes('ROTA'));

  const colData =
    chaveExata(chaves, ['DATA SAIDA', 'DATA SAÍDA', 'dataSaida']) ||
    chavePorPredicado(chaves, (n) => n.includes('DATA') && !n.includes('UPLOAD'));

  const colTurno = chaveExata(chaves, ['TURNO', 'turno']) || chavePorPredicado(chaves, (n) => n === 'TURNO');

  const colViagens =
    chaveExata(chaves, ['CONTADOR DE VIAGENS', 'VIAGENS POR ROTA', 'viagensPorRota', 'numeroViagens']) ||
    chavePorPredicado(chaves, (n) => n.includes('VIAGEN') && !n.includes('VALIDO'));

  const colRegional =
    chaveExata(chaves, ['REGIONAL', 'regional', 'REGIAO']) ||
    chavePorPredicado(chaves, (n) => n === 'REGIONAL' || n === 'REGIAO');

  const colDistrito =
    chaveExata(chaves, ['DISTRITO', 'distrito', 'BAIRRO']) ||
    chavePorPredicado(chaves, (n) => n === 'DISTRITO' || n === 'BAIRRO');

  return {
    colPeso,
    colKmTotal,
    colKmSaida,
    colKmChegada,
    colPlaca,
    colMotorista,
    colHoraSaida,
    colHoraChegada,
    colData,
    colTurno,
    colViagens,
    colRegional,
    colDistrito,
  };
}

const ALIAS_ENTIDADE: Record<string, string[]> = {
  placa: ['placa', 'PLACA'],
  motorista: ['motorista', 'MOTORISTA'],
  dataSaida: ['dataSaida', 'DATA SAIDA', 'DATA SAÍDA'],
  turno: ['turno', 'TURNO'],
  regional: ['regional', 'REGIONAL'],
  distrito: ['distrito', 'DISTRITO'],
  pesoTotal: ['pesoTotal', 'PESO TOTAL'],
  kmTotal: ['kmTotal', 'KM TOTAL'],
  kmSaida: ['kmSaida', 'KM SAIDA', 'KM SAÍDA'],
  kmChegada: ['kmChegada', 'KM CHEGADA'],
  horaSaida: ['horaSaida', 'HORA SAIDA', 'HORA SÁIDA'],
  horaChegada: ['horaChegada', 'HORA CHEGADA'],
  viagens: ['viagensPorRota', 'numeroViagens', 'VIAGENS POR ROTA', 'CONTADOR DE VIAGENS'],
};

export function obterValorRegistro(
  dado: Record<string, unknown>,
  colKey: string | undefined,
  entidadeKey?: keyof typeof ALIAS_ENTIDADE,
): unknown {
  if (!dado) return undefined;

  if (entidadeKey && ALIAS_ENTIDADE[entidadeKey]) {
    for (const alias of ALIAS_ENTIDADE[entidadeKey]) {
      const v = dado[alias];
      if (v !== null && v !== undefined && v !== '') return v;
    }
  }

  if (colKey) {
    const direto = dado[colKey];
    if (direto !== null && direto !== undefined && direto !== '') return direto;
    const alvo = normalizar(colKey);
    for (const [k, v] of Object.entries(dado)) {
      if (v !== null && v !== undefined && v !== '' && normalizar(k) === alvo) return v;
    }
  }

  const dados = dado.dados;
  if (dados && typeof dados === 'object' && !Array.isArray(dados)) {
    return obterValorRegistro(dados as Record<string, unknown>, colKey, entidadeKey);
  }

  return undefined;
}

export function paraNumero(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  let parsed: number;
  if (s.includes(',') && s.includes('.')) {
    parsed = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  } else if (s.includes(',')) {
    parsed = parseFloat(s.replace(',', '.'));
  } else {
    parsed = parseFloat(s);
  }
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function serialParaMin(v: unknown): number {
  if (typeof v === 'number' && v > 0) {
    const dias = Math.floor(v);
    const fracao = v - dias;
    return Math.round(dias * 24 * 60 + fracao * 24 * 60);
  }
  if (typeof v === 'string' && /^\d{1,2}:\d{2}/.test(v)) {
    const [h, m] = v.split(':').map(Number);
    return h * 60 + (m || 0);
  }
  return 0;
}

export function fmtNum(n: number, dec = 2): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function fmtMin(min: number): string {
  const h = Math.floor(Math.abs(min) / 60);
  const m = Math.round(Math.abs(min) % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface MetricasCardViagem {
  placa: string;
  motorista: string;
  dataStr: string;
  turno: string;
  viagens: number;
  regional: string;
  distrito: string;
  peso: number;
  toneladas: number;
  kmFinal: number;
  horasTrabalhadas: number;
  eficiencia: number;
  tonKm: number;
}

export function extrairMetricasCardViagem(
  dado: Record<string, unknown>,
  cols: ColunasCardViagem,
): MetricasCardViagem {
  const peso = paraNumero(obterValorRegistro(dado, cols.colPeso, 'pesoTotal'));
  const kmTotal = paraNumero(obterValorRegistro(dado, cols.colKmTotal, 'kmTotal'));
  const kmSaida = paraNumero(obterValorRegistro(dado, cols.colKmSaida, 'kmSaida'));
  const kmChegada = paraNumero(obterValorRegistro(dado, cols.colKmChegada, 'kmChegada'));
  /** Distância operacional plausível; hodômetro absoluto / chegada < saída → 0 */
  const MAX_KM_VIAGEM = 300;
  const kmCalculado = (kmChegada > kmSaida && (kmChegada - kmSaida) <= MAX_KM_VIAGEM)
    ? (kmChegada - kmSaida)
    : 0;
  const kmBruto = kmTotal > 0 ? kmTotal : kmCalculado;
  const alertaHodometro = Boolean(dado._alertaKmHodometro)
    || Boolean((dado.dados as Record<string, unknown> | undefined)?._alertaKmHodometro);
  const kmFinal = (!alertaHodometro && kmBruto > 0 && kmBruto <= MAX_KM_VIAGEM) ? kmBruto : 0;

  const horaSaida = serialParaMin(obterValorRegistro(dado, cols.colHoraSaida, 'horaSaida'));
  const horaChegada = serialParaMin(obterValorRegistro(dado, cols.colHoraChegada, 'horaChegada'));
  const horasTrabalhadas = horaChegada > horaSaida ? (horaChegada - horaSaida) / 60 : 0;

  const data = obterValorRegistro(dado, cols.colData, 'dataSaida');
  const dataIso = normalizarDataParaIso(data);
  const dataStr = dataIso ?? '—';

  const placaRaw = obterValorRegistro(dado, cols.colPlaca, 'placa');
  const motoristaRaw = obterValorRegistro(dado, cols.colMotorista, 'motorista');
  const turnoRaw = obterValorRegistro(dado, cols.colTurno, 'turno');
  const regionalRaw = obterValorRegistro(dado, cols.colRegional, 'regional');
  const distritoRaw = obterValorRegistro(dado, cols.colDistrito, 'distrito');
  const viagens = contarViagensPorRotaRegistro(dado);

  const toneladas = peso / 1000;
  const tonKm = kmFinal > 0 ? (toneladas / kmFinal) * 100 : 0;
  const eficiencia = peso > 0 && kmFinal > 0 ? peso / kmFinal : 0;

  return {
    placa: placaRaw ? String(placaRaw).toUpperCase() : '—',
    motorista: motoristaRaw ? String(motoristaRaw) : '—',
    dataStr,
    turno: turnoRaw ? String(turnoRaw) : '—',
    viagens,
    regional: regionalRaw ? String(regionalRaw) : '—',
    distrito: distritoRaw ? String(distritoRaw) : '—',
    peso,
    toneladas,
    kmFinal,
    horasTrabalhadas,
    eficiencia,
    tonKm,
  };
}
