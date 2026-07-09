import { useMemo } from 'react';
import { FiCalendar, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import {
  calcularCicloMensalContrato,
  deslocarMesReferencia,
  inferirMesReferenciaAtual,
  referenciaParaMesInput,
  mesInputParaReferencia,
  type PeriodoCicloContrato,
} from '../utils/periodoCicloContrato';

interface ExecutivoCicloSelectorProps {
  diaInicioCiclo: number;
  mes: number;
  ano: number;
  onChange: (mes: number, ano: number) => void;
  disabled?: boolean;
}

export default function ExecutivoCicloSelector({
  diaInicioCiclo,
  mes,
  ano,
  onChange,
  disabled = false,
}: ExecutivoCicloSelectorProps) {
  const ciclo: PeriodoCicloContrato = useMemo(
    () => calcularCicloMensalContrato(ano, mes, diaInicioCiclo),
    [ano, mes, diaInicioCiclo],
  );

  const irParaAtual = () => {
    const ref = inferirMesReferenciaAtual(diaInicioCiclo);
    onChange(ref.mes, ref.ano);
  };

  const irAnterior = () => {
    const ref = deslocarMesReferencia(mes, ano, -1);
    onChange(ref.mes, ref.ano);
  };

  const irProximo = () => {
    const ref = deslocarMesReferencia(mes, ano, 1);
    onChange(ref.mes, ref.ano);
  };

  const refAtual = inferirMesReferenciaAtual(diaInicioCiclo);
  const ehCicloAtual = mes === refAtual.mes && ano === refAtual.ano;

  return (
    <div className="exec-ciclo-bar">
      <div className="exec-ciclo-nav">
        <button
          type="button"
          className="exec-ciclo-btn"
          onClick={irAnterior}
          disabled={disabled}
          title="Ciclo anterior"
        >
          <FiChevronLeft size={16} />
        </button>
        <div className="exec-ciclo-info">
          <span className="exec-ciclo-label">
            <FiCalendar size={13} />
            Ciclo do contrato
          </span>
          <strong className="exec-ciclo-titulo">{ciclo.label}</strong>
          <span className="exec-ciclo-intervalo">
            {ciclo.dataInicio.split('-').reverse().join('/')}
            {' — '}
            {ciclo.dataFim.split('-').reverse().join('/')}
          </span>
        </div>
        <button
          type="button"
          className="exec-ciclo-btn"
          onClick={irProximo}
          disabled={disabled}
          title="Próximo ciclo"
        >
          <FiChevronRight size={16} />
        </button>
      </div>

      <div className="exec-ciclo-acoes">
        <input
          type="month"
          className="exec-ciclo-month"
          value={referenciaParaMesInput(ano, mes)}
          disabled={disabled}
          onChange={(e) => {
            const ref = mesInputParaReferencia(e.target.value);
            if (ref) onChange(ref.mes, ref.ano);
          }}
          title="Selecionar mês de referência do ciclo"
        />
        {!ehCicloAtual && (
          <button
            type="button"
            className="exec-ciclo-atual"
            onClick={irParaAtual}
            disabled={disabled}
          >
            Ciclo atual
          </button>
        )}
      </div>
    </div>
  );
}
