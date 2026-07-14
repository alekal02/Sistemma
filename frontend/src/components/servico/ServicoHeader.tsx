import { memo } from 'react';
import { FiCheck } from 'react-icons/fi';
import type { EtapaMiniFlow, EtapasStatus } from './servicoTypes';

export interface ServicoHeaderProps {
  etapa: EtapaMiniFlow;
  status: EtapasStatus;
  onIrPara: (etapa: EtapaMiniFlow) => void;
}

const ServicoHeader = memo(function ServicoHeader({ etapa, status, onIrPara }: ServicoHeaderProps) {
  return (
    <div className="etapas-nav">
      <button
        className={`etapa-btn ${etapa === 'upload' ? 'active' : ''} ${status.upload === 'done' ? 'done' : ''}`}
        onClick={() => onIrPara('upload')}
      >
        <span className="etapa-num">{status.upload === 'done' ? <FiCheck size={9} /> : '1'}</span> Upload
      </button>
      <div className={`etapa-linha ${status.upload === 'done' ? 'done' : ''}`} />
      <button
        className={`etapa-btn ${etapa === 'revisao' ? 'active' : ''} ${status.revisao === 'done' ? 'done' : ''}`}
        onClick={() => onIrPara('revisao')}
      >
        <span className="etapa-num">{status.revisao === 'done' ? <FiCheck size={9} /> : '2'}</span> Dados
      </button>
      <div className={`etapa-linha ${status.revisao === 'done' ? 'done' : ''}`} />
      <button
        className={`etapa-btn ${etapa === 'config' ? 'active' : ''} ${status.config === 'done' ? 'done' : ''}`}
        onClick={() => onIrPara('config')}
      >
        <span className="etapa-num">{status.config === 'done' ? <FiCheck size={9} /> : '3'}</span> KPIs
      </button>
    </div>
  );
});

export default ServicoHeader;
