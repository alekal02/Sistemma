import type { AnalisePesoColeta, CompararPorTipoServico } from '../services/servicoService';
import {
  calcularViagensEquivalentesResultado,
  fmtNumPeso,
} from './analisePesoComparativoMetricas';
import { recortarPeriodoAteReferencia } from './periodoCicloContrato';
import { toneladasDoPesoKg } from '@sistemma/shared';
import {
  alinharPorOcorrenciaDiaSemana,
  type ParDiaSemanaCiclo,
} from './melhoriaCicloOperacao';

export interface ResumoMelhoriaCiclo {
  servico: CompararPorTipoServico;
  resultadoTon: number;
  cenario: 'PERDA' | 'SUPERÁVIT' | 'NEUTRO';
  pesoIdealKg: number;
  pesoMedioKg: number;
  numeroViagens: number;
  toneladas: number;
  diasOperados: number;
  diasDecorridos: number;
  mediaViagensPorDia: number;
  mediaPesoPorDiaKg: number;
  /** |resultado| × 1000 / pesoIdeal */
  viagensEquivalentes: number | null;
  /** Só conta como “aterro sem necessidade” quando há PERDA */
  viagensEvitaveis: number;
}

export interface DeltaMelhoriaCiclo {
  de: ResumoMelhoriaCiclo;
  para: ResumoMelhoriaCiclo;
  deltaResultadoTon: number;
  deltaViagensEvitaveis: number;
  /** true se reduziu perda (menos viagens evitáveis) ou saiu de perda para neutro/superávit */
  houveMelhoria: boolean;
  textoResumo: string;
}

function pesoIdealKg(a: AnalisePesoColeta): number {
  return Math.round(a.caixaMediaKg * a.densidadeOtima * 100) / 100;
}

function cenarioDe(a: AnalisePesoColeta): 'PERDA' | 'SUPERÁVIT' | 'NEUTRO' {
  if (a.perdaTon < 0) return 'PERDA';
  if (a.perdaTon > 0) return 'SUPERÁVIT';
  return 'NEUTRO';
}

export function montarResumoMelhoriaCiclo(s: CompararPorTipoServico): ResumoMelhoriaCiclo | null {
  const a = s.analisePeso;
  if (!a) return null;
  const viagensEquivalentes = calcularViagensEquivalentesResultado(a);
  const viagensEvitaveis = a.perdaTon < 0 && viagensEquivalentes != null
    ? viagensEquivalentes
    : 0;
  const porDia = (a.porDia || []).filter((d) => d.viagens > 0);
  const diasOperados = porDia.length;
  const diasDecorridos = s.periodo?.dataInicio && s.periodo?.dataFim
    ? recortarPeriodoAteReferencia(s.periodo.dataInicio, s.periodo.dataFim).diasDecorridos
    : diasOperados;
  const denom = diasDecorridos > 0 ? diasDecorridos : diasOperados;
  const toneladas = a.porDia && a.porDia.length > 0
    ? a.porDia.reduce((s, d) => s + toneladasDoPesoKg(Number(d.pesoTotalKg || 0)), 0)
    : toneladasDoPesoKg(a.pesoMedioKg * a.numeroViagens);
  return {
    servico: s,
    resultadoTon: a.perdaTon,
    cenario: cenarioDe(a),
    pesoIdealKg: pesoIdealKg(a),
    pesoMedioKg: a.pesoMedioKg,
    numeroViagens: a.numeroViagens,
    toneladas,
    diasOperados,
    diasDecorridos,
    mediaViagensPorDia: denom > 0
      ? Math.round((a.numeroViagens / denom) * 10) / 10
      : a.numeroViagens,
    mediaPesoPorDiaKg: denom > 0
      ? Math.round((a.pesoMedioKg * a.numeroViagens) / denom * 100) / 100
      : a.pesoMedioKg,
    viagensEquivalentes,
    viagensEvitaveis,
  };
}

export type DiaComparadoCiclo = ParDiaSemanaCiclo<
  NonNullable<AnalisePesoColeta['porDia']>[number]
>;

/** Emparelha os dias pela ocorrência do dia da semana (1ª seg × 1ª seg). */
export function alinharDiasCicloAnteriorAtual(
  anterior: CompararPorTipoServico,
  atual: CompararPorTipoServico,
): DiaComparadoCiclo[] {
  return alinharPorOcorrenciaDiaSemana(
    anterior.analisePeso?.porDia || [],
    atual.analisePeso?.porDia || [],
  );
}

export function calcularDeltaMelhoria(
  de: ResumoMelhoriaCiclo,
  para: ResumoMelhoriaCiclo,
): DeltaMelhoriaCiclo {
  const deltaResultadoTon = Math.round((para.resultadoTon - de.resultadoTon) * 100) / 100;
  const deltaViagensEvitaveis = Math.round((de.viagensEvitaveis - para.viagensEvitaveis) * 10) / 10;
  const houveMelhoria = para.viagensEvitaveis < de.viagensEvitaveis
    || (de.cenario === 'PERDA' && para.cenario !== 'PERDA');

  const nome = para.servico.contratoNome || para.servico.nome;
  let textoResumo: string;
  if (de.viagensEvitaveis <= 0 && para.viagensEvitaveis <= 0) {
    textoResumo = `${nome}: sem perda por subcarga nos dois ciclos (nenhuma viagem evitável estimada).`;
  } else if (houveMelhoria && deltaViagensEvitaveis > 0) {
    textoResumo = (
      `${nome}: melhoria de ~${fmtNumPeso(deltaViagensEvitaveis, 1)} viagens ao aterro evitáveis `
      + `(perda ${fmtNumPeso(Math.abs(de.resultadoTon), 2)} → ${fmtNumPeso(Math.abs(para.resultadoTon), 2)} TON).`
    );
  } else if (para.viagensEvitaveis > de.viagensEvitaveis) {
    textoResumo = (
      `${nome}: piora de ~${fmtNumPeso(Math.abs(deltaViagensEvitaveis), 1)} viagens evitáveis `
      + `(mais subcarga no ciclo atual).`
    );
  } else {
    textoResumo = `${nome}: resultado em toneladas mudou em ${fmtNumPeso(deltaResultadoTon, 2)} TON.`;
  }

  return {
    de,
    para,
    deltaResultadoTon,
    deltaViagensEvitaveis,
    houveMelhoria,
    textoResumo,
  };
}

/** Emparelha ciclo anterior × ciclo atual pelo id do serviço. */
export function montarMelhoriaCicloAnteriorAtual(
  anterior: CompararPorTipoServico[],
  atual: CompararPorTipoServico[],
): {
  resumosAnterior: ResumoMelhoriaCiclo[];
  resumosAtual: ResumoMelhoriaCiclo[];
  deltas: DeltaMelhoriaCiclo[];
} {
  const mapAnt = new Map(
    anterior
      .map(montarResumoMelhoriaCiclo)
      .filter((r): r is ResumoMelhoriaCiclo => r != null)
      .map((r) => [r.servico.id, r]),
  );
  const resumosAtual = atual
    .map(montarResumoMelhoriaCiclo)
    .filter((r): r is ResumoMelhoriaCiclo => r != null);
  const resumosAnterior: ResumoMelhoriaCiclo[] = [];
  const deltas: DeltaMelhoriaCiclo[] = [];

  for (const atualR of resumosAtual) {
    const ant = mapAnt.get(atualR.servico.id);
    if (!ant) continue;
    resumosAnterior.push(ant);
    deltas.push(calcularDeltaMelhoria(ant, atualR));
  }

  return { resumosAnterior, resumosAtual, deltas };
}

/** @deprecated Preferir montarMelhoriaCicloAnteriorAtual (ciclo anterior → atual). */
export function montarMelhoriaEntreCiclos(servicos: CompararPorTipoServico[]): {
  resumos: ResumoMelhoriaCiclo[];
  deltas: DeltaMelhoriaCiclo[];
} {
  const resumos = servicos
    .map(montarResumoMelhoriaCiclo)
    .filter((r): r is ResumoMelhoriaCiclo => r != null);
  const deltas: DeltaMelhoriaCiclo[] = [];
  for (let i = 1; i < resumos.length; i++) {
    deltas.push(calcularDeltaMelhoria(resumos[0], resumos[i]));
  }
  return { resumos, deltas };
}
