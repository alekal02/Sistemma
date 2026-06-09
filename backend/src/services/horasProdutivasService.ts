import { encontrarValorColuna } from './FormulaEngine';

/** Fórmula canônica de Receita por Hora (faturamento ÷ horas produtivas totais) */
export const FORMULA_RECEITA_POR_HORA =
  'ROUND(DIVIDE(FATURAMENTO_EST(PESO TOTAL, TIPO DE CAMINHÃO), HORAS_PRODUTIVAS(HORA SAIDA BASE, HORA CHEGADA BASE)), 2)';

function normalizarChave(chave: string): string {
  return chave.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
}

function detectarColuna(dados: Record<string, any>[], candidatos: string[]): string {
  if (!dados?.length) return '';
  const chaves = Object.keys(dados[0]);
  for (const candidato of candidatos) {
    const norm = normalizarChave(candidato);
    for (const chave of chaves) {
      if (normalizarChave(chave) === norm) return chave;
    }
  }
  for (const chave of chaves) {
    const chaveNorm = normalizarChave(chave);
    for (const candidato of candidatos) {
      const norm = normalizarChave(candidato);
      if (chaveNorm.includes(norm) || norm.includes(chaveNorm)) return chave;
    }
  }
  return '';
}

/** Horas produtivas de um único registro (viagem) */
export function extrairHorasProdutivasRegistro(obj: Record<string, any>): number {
  const horasEntidade = Number(obj.horasForaUnidade) || Number(obj.tempoForaUnidade) || 0;
  if (horasEntidade > 0 && horasEntidade <= 24) {
    return Math.round(horasEntidade * 100) / 100;
  }
  if (horasEntidade > 24 && horasEntidade < 1000) {
    return Math.round((horasEntidade / 60) * 100) / 100;
  }

  const colHoras = [
    'HORAS QUE FICA FORA DA UNIDADE', 'HORAS FORA UNIDADE', 'HORAS_FORA_UNIDADE',
    'horasForaUnidade', 'TEMPO FORA', 'HORAS PRODUTIVAS', 'tempoForaUnidade',
  ];
  for (const col of colHoras) {
    const norm = normalizarChave(col);
    for (const chave of Object.keys(obj)) {
      const chaveNorm = normalizarChave(chave);
      if (chaveNorm.includes(norm) || norm.includes(chaveNorm)) {
        const valor = Number(obj[chave]) || 0;
        if (valor > 0 && valor <= 24) return Math.round(valor * 100) / 100;
      }
    }
  }

  const horaSaidaEnt = Number(obj.horaSaida) || 0;
  const horaChegadaEnt = Number(obj.horaChegada) || 0;
  if (horaSaidaEnt > 0 && horaChegadaEnt > 0) {
    return diffHorasSaidaChegada(horaSaidaEnt, horaChegadaEnt);
  }

  return 0;
}

function diffHorasSaidaChegada(saida: number, chegada: number): number {
  if (saida <= 0 || chegada <= 0) return 0;
  let diff = 0;
  if (saida < 1 && chegada < 1) {
    diff = chegada < saida ? (chegada + 1 - saida) * 24 : (chegada - saida) * 24;
  } else {
    diff = chegada < saida ? chegada + 24 - saida : chegada - saida;
  }
  return diff > 0 && diff < 100 ? Math.round(diff * 100) / 100 : 0;
}

/**
 * Soma horas produtivas — mesmo critério de HORAS_PRODUTIVAS() na FormulaEngine:
 * diferença HORA CHEGADA BASE − HORA SAÍDA BASE por viagem (com virada de dia).
 */
export function calcularHorasProdutivasTotal(dados: Record<string, any>[]): number {
  if (!dados?.length) return 0;

  const colHora = detectarColuna(dados, [
    'HORA SAIDA BASE', 'HORA SÁIDA BASE', 'HORA SAIDA', 'HORA SÁIDA',
    'HORASAIDA', 'HORA_SAIDA', 'horaSaida', 'HR SAIDA BASE', 'HR_SAIDA_BASE', 'SAIDA BASE',
  ]);
  const colHoraChegada = detectarColuna(dados, [
    'HORA CHEGADA BASE', 'HORA CHEGADA', 'HORACHEGADA', 'HORA_CHEGADA', 'horaChegada',
    'HR CHEGA BASE', 'HR_CHEGA_BASE', 'CHEGADA BASE',
  ]);

  if (colHoraChegada && colHora && colHoraChegada !== colHora) {
    let total = 0;
    for (const d of dados) {
      const saida = Number(encontrarValorColuna(d, colHora)) || 0;
      const chegada = Number(encontrarValorColuna(d, colHoraChegada)) || 0;
      total += diffHorasSaidaChegada(saida, chegada);
    }
    if (total > 0) return Math.round(total * 100) / 100;
  }

  let total = 0;
  for (const d of dados) {
    total += extrairHorasProdutivasRegistro(d);
  }

  return Math.round(total * 100) / 100;
}
