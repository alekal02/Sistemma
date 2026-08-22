import { useEffect, useState } from 'react';
import {
  calcularCicloMensalContrato,
  deslocarMesReferencia,
  inferirMesReferenciaDeData,
  isIsoDate,
  montarBaselineDia,
  type BaselineDia,
  type DiaSerieOperacional,
  type PeriodoCicloContrato,
} from '@sistemma/shared';
import servicoService from '../services/servicoService';
import { isRequestAborted } from '../services/abortableRequest';

type DiaApi = {
  data: string;
  rotas: number;
  viagens: number;
  pesoTotalKg: number;
  pesoTotalTon?: number;
  kmTotal: number;
};

function serieDeApi(dias: DiaApi[] | undefined): DiaSerieOperacional[] {
  return (dias || [])
    .filter((d) => isIsoDate(d?.data))
    .map((d) => ({
      data: d.data,
      viagens: Number(d.viagens || 0),
      rotas: Number(d.rotas || 0),
      toneladas: Number(d.pesoTotalTon ?? (Number(d.pesoTotalKg || 0) / 1000)),
      km: Number(d.kmTotal || 0),
      // resumo-ciclo-por-dia não devolve horas; a métrica ton/hora fica sem valor.
      horas: 0,
    }));
}

export interface ReguaDia {
  baseline: BaselineDia | null;
  ciclo: PeriodoCicloContrato | null;
  carregando: boolean;
}

/**
 * Régua temporal do dia: compara o dia com o mesmo dia da semana no ciclo,
 * com a mediana do ciclo e com o dia equivalente do ciclo anterior.
 */
export function useReguaDia(opts: {
  contractId?: string;
  servicoId?: string;
  dataIso: string;
  diaInicioCiclo: number;
  /** Serviços por unidade não usam viagem/tonelada; a régua não se aplica. */
  ativo?: boolean;
}): ReguaDia {
  const { contractId, servicoId, dataIso, diaInicioCiclo } = opts;
  const ativo = opts.ativo !== false;

  const [estado, setEstado] = useState<ReguaDia>({
    baseline: null,
    ciclo: null,
    carregando: false,
  });

  useEffect(() => {
    if (!contractId || !servicoId || !isIsoDate(dataIso) || !ativo) {
      setEstado({ baseline: null, ciclo: null, carregando: false });
      return;
    }

    const ref = inferirMesReferenciaDeData(dataIso, diaInicioCiclo);
    const ciclo = calcularCicloMensalContrato(ref.ano, ref.mes, diaInicioCiclo);
    const prev = deslocarMesReferencia(ciclo.mesReferencia, ciclo.anoReferencia, -1);
    const anterior = calcularCicloMensalContrato(prev.ano, prev.mes, diaInicioCiclo);

    let cancelado = false;
    setEstado((s) => ({ ...s, ciclo, carregando: true }));

    Promise.all([
      servicoService.getResumoCicloPorDia(
        contractId,
        servicoId,
        { dataInicio: ciclo.dataInicio, dataFim: ciclo.dataFim },
        { abortKey: 'servico:getResumoCicloPorDia:regua-dia-atual' },
      ),
      servicoService.getResumoCicloPorDia(
        contractId,
        servicoId,
        { dataInicio: anterior.dataInicio, dataFim: anterior.dataFim },
        { abortKey: 'servico:getResumoCicloPorDia:regua-dia-anterior' },
      ).catch((): null => null),
    ])
      .then(([atual, ant]) => {
        if (cancelado) return;
        setEstado({
          ciclo,
          carregando: false,
          baseline: montarBaselineDia({
            dataIso,
            diasCiclo: serieDeApi(atual?.dias),
            diasCicloAnterior: serieDeApi(ant?.dias),
          }),
        });
      })
      .catch((err) => {
        if (cancelado || isRequestAborted(err)) return;
        setEstado({ baseline: null, ciclo, carregando: false });
      });

    return () => {
      cancelado = true;
    };
  }, [contractId, servicoId, dataIso, diaInicioCiclo, ativo]);

  return estado;
}

export default useReguaDia;
