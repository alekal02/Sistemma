/**
 * Ranking viagem a viagem vs ideal do próprio tipo (Mini, Toco, …).
 * Escala: <50% péssimo · 50–90% ruim · 90–110% ótimo · 110–120% ruim · >120% péssimo.
 */
import {
  COR_NOTA_IDEAL,
  LABEL_FAIXA_IDEAL,
  LABEL_NOTA_IDEAL,
  PCT_IDEAL_MAX,
  PCT_IDEAL_MIN,
  PCT_MARGEM_IDEAL,
  PCT_PESSIMO_ALTO,
  PCT_PESSIMO_BAIXO,
  classificarPctIdeal,
  notaDaFaixaIdeal,
  type NotaIdealViagem,
  type TipoLimiteCaminhao,
} from './limitesCaminhaoContrato';
import type { ResumoCapacidadeDia, ViagemCapacidadeItem } from './capacidadeViagemDia';

export type StatusRankingViagem = NotaIdealViagem;

export interface RankingViagemTipoItem {
  id: string;
  placa: string;
  tipo: TipoLimiteCaminhao | null;
  tipoLabel: string;
  rota: string;
  pesoKg: number;
  toneladas: number;
  pesoIdealKg: number | null;
  /** Densidade efetiva (kg/L) usada no ideal desta viagem. */
  densidadeKgL: number | null;
  mediaTipoKg: number | null;
  pctIdeal: number | null;
  pctMediaTipo: number | null;
  /** % da referência usada no ranking (ideal do tipo, senão média do tipo). */
  pctRef: number;
  refLabel: string;
  status: StatusRankingViagem;
  faixaLabel: string;
  classificacao: ViagemCapacidadeItem['classificacao'];
  /** Desvio absoluto do ideal (para ordenar piores). */
  desvioAbsPct: number;
}

export const LABEL_STATUS_RANKING: Record<StatusRankingViagem, string> = {
  pessimo: LABEL_NOTA_IDEAL.pessimo,
  ruim: LABEL_NOTA_IDEAL.ruim,
  otimo: LABEL_NOTA_IDEAL.otimo,
};

export const COR_STATUS_RANKING: Record<StatusRankingViagem, string> = {
  pessimo: COR_NOTA_IDEAL.pessimo,
  ruim: COR_NOTA_IDEAL.ruim,
  otimo: COR_NOTA_IDEAL.otimo,
};

export {
  PCT_MARGEM_IDEAL,
  PCT_IDEAL_MIN,
  PCT_IDEAL_MAX,
  PCT_PESSIMO_BAIXO,
  PCT_PESSIMO_ALTO,
};

export function statusRankingViagem(v: ViagemCapacidadeItem): StatusRankingViagem {
  if (v.notaIdeal) return v.notaIdeal;
  const pct = v.ocupacaoPct ?? v.pctMediaTipo;
  if (pct == null) return 'ruim';
  return notaDaFaixaIdeal(classificarPctIdeal(pct));
}

function pctRefViagem(v: ViagemCapacidadeItem): { pctRef: number; refLabel: string; pctIdeal: number | null } {
  if (v.pesoIdealKg != null && v.pesoIdealKg > 0 && v.ocupacaoPct != null) {
    return {
      pctRef: v.ocupacaoPct,
      refLabel: `ideal ${v.tipoLabel}`,
      pctIdeal: v.ocupacaoPct,
    };
  }
  if (v.pctMediaTipo != null) {
    return {
      pctRef: v.pctMediaTipo,
      refLabel: `média ${v.tipoLabel}`,
      pctIdeal: null,
    };
  }
  return { pctRef: 100, refLabel: v.tipoLabel, pctIdeal: null };
}

export function statusPorPctIdeal(pct: number | null | undefined): StatusRankingViagem | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  return notaDaFaixaIdeal(classificarPctIdeal(pct));
}

export function montarRankingViagensPorTipo(
  capacidade: ResumoCapacidadeDia | null | undefined,
): RankingViagemTipoItem[] {
  if (!capacidade?.viagens?.length) return [];

  const ordemStatus: Record<StatusRankingViagem, number> = { pessimo: 0, ruim: 1, otimo: 2 };

  return capacidade.viagens
    .filter((v) => v.pesoKg > 0)
    .map((v, i) => {
      const { pctRef, refLabel, pctIdeal } = pctRefViagem(v);
      const status = statusRankingViagem(v);
      return {
        id: `${v.placa}-${v.tipo || 'x'}-${i}-${Math.round(v.pesoKg)}`,
        placa: v.placa,
        tipo: v.tipo,
        tipoLabel: v.tipoLabel,
        rota: v.rota,
        pesoKg: v.pesoKg,
        toneladas: Math.round((v.pesoKg / 1000) * 100) / 100,
        pesoIdealKg: v.pesoIdealKg,
        densidadeKgL: v.densidadeKgL ?? null,
        mediaTipoKg: v.mediaTipoKg,
        pctIdeal,
        pctMediaTipo: v.pctMediaTipo,
        pctRef,
        refLabel,
        status,
        faixaLabel: v.faixaIdeal ? LABEL_FAIXA_IDEAL[v.faixaIdeal] : LABEL_NOTA_IDEAL[status],
        classificacao: v.classificacao,
        desvioAbsPct: Math.abs(pctRef - 100),
      };
    })
    .sort((a, b) => {
      const ds = ordemStatus[a.status] - ordemStatus[b.status];
      if (ds !== 0) return ds;
      return b.desvioAbsPct - a.desvioAbsPct;
    });
}

/** Tipos presentes no ranking (ordem fixa Mini → Truck). */
export function tiposPresentesRanking(
  itens: RankingViagemTipoItem[],
): TipoLimiteCaminhao[] {
  const ordem: TipoLimiteCaminhao[] = ['MINI', 'TOCO', 'BASCULANTE', 'TRUCK'];
  const set = new Set(itens.map((i) => i.tipo).filter(Boolean) as TipoLimiteCaminhao[]);
  return ordem.filter((t) => set.has(t));
}
