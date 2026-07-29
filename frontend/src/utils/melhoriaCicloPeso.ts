import type { AnalisePesoColeta, CompararPorTipoServico } from '../services/servicoService';
import {
  calcularViagensEquivalentesResultado,
  fmtNumPeso,
} from './analisePesoComparativoMetricas';

export interface ResumoMelhoriaCiclo {
  servico: CompararPorTipoServico;
  resultadoTon: number;
  cenario: 'PERDA' | 'SUPERÁVIT' | 'NEUTRO';
  pesoIdealKg: number;
  pesoMedioKg: number;
  numeroViagens: number;
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
  return {
    servico: s,
    resultadoTon: a.perdaTon,
    cenario: cenarioDe(a),
    pesoIdealKg: pesoIdealKg(a),
    pesoMedioKg: a.pesoMedioKg,
    numeroViagens: a.numeroViagens,
    viagensEquivalentes,
    viagensEvitaveis,
  };
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
