import type { OperacaoDiaAnalise } from './operacaoDia';
import {
  LABEL_TIPO_CAMINHAO,
  TIPOS_LIMITE_CAMINHAO,
  normalizarTipoCaminhaoPeso,
  pctIdealForaDaMargem,
  resolverPesosIdeaisKg,
  type DensidadeResiduoInput,
  type MapaLimiteCaminhao,
} from './limitesCaminhaoContrato';

export type PontoViagemTipo = {
  tipo: string;
  label: string;
  pesoIdealKg: number;
  pesoColetadoKg: number;
  viagens: number;
  tonMediaViagem: number;
  pctIdeal: number | null;
  gargalo: boolean;
};

export function montarPontosViagemPorTipo(
  analise: OperacaoDiaAnalise,
  volumeL?: MapaLimiteCaminhao | null,
  densidade?: DensidadeResiduoInput,
): PontoViagemTipo[] {
  const ideais = resolverPesosIdeaisKg(volumeL, densidade);
  return TIPOS_LIMITE_CAMINHAO.map((tipo) => {
    const g = analise.porTipoCaminhao.find((x) => normalizarTipoCaminhaoPeso(x.chave) === tipo);
    if (!g || g.viagens <= 0) return null;
    const pesoIdealKg = ideais[tipo];
    const pesoColetadoKg = Math.round(g.tonMediaViagem * 1000);
    const pctIdeal = pesoIdealKg > 0
      ? Math.round((pesoColetadoKg / pesoIdealKg) * 1000) / 10
      : null;
    return {
      tipo,
      label: LABEL_TIPO_CAMINHAO[tipo],
      pesoIdealKg,
      pesoColetadoKg,
      viagens: g.viagens,
      tonMediaViagem: g.tonMediaViagem,
      pctIdeal,
      gargalo: pctIdealForaDaMargem(pctIdeal),
    };
  }).filter(Boolean) as PontoViagemTipo[];
}
