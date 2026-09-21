import { FiDownload } from 'react-icons/fi';
import './RelatoriosMenu.css';

export interface RelatorioOpcao {
  id: string;
  label: string;
  descricao: string;
}

interface RelatoriosMenuProps {
  opcoes: RelatorioOpcao[];
  marcados: string[];
  onToggle: (id: string) => void;
  onGerar: () => void;
  gerando?: boolean;
  disabled?: boolean;
  titulo?: string;
  variant?: 'panel' | 'compact';
}

export default function RelatoriosMenu({
  opcoes,
  marcados,
  onToggle,
  onGerar,
  gerando = false,
  disabled = false,
  titulo = 'Selecione os relatórios',
  variant = 'panel',
}: RelatoriosMenuProps) {
  const podeGerar = marcados.length > 0 && !gerando && !disabled;
  const labelBtn = gerando
    ? 'Gerando…'
    : marcados.length <= 1
      ? 'Gerar PDF'
      : `Gerar ${marcados.length} PDFs`;

  if (variant === 'compact') {
    return (
      <button
        type="button"
        className="relatorios-menu-btn is-compact"
        onClick={onGerar}
        disabled={!podeGerar}
        title={opcoes[0]?.descricao || titulo}
      >
        <FiDownload size={14} />
        {gerando ? 'Gerando…' : (opcoes[0]?.label || 'PDF')}
      </button>
    );
  }

  return (
    <div className="relatorios-menu">
      <div className="relatorios-menu-titulo">{titulo}</div>
      <div className="relatorios-menu-lista">
        {opcoes.map((op) => {
          const marcado = marcados.includes(op.id);
          return (
            <label key={op.id} className={`relatorios-menu-item${marcado ? ' is-on' : ''}`}>
              <input
                type="checkbox"
                checked={marcado}
                onChange={() => onToggle(op.id)}
              />
              <span>
                <span className="relatorios-menu-label">{op.label}</span>
                <span className="relatorios-menu-desc">{op.descricao}</span>
              </span>
            </label>
          );
        })}
      </div>
      <button
        type="button"
        className="relatorios-menu-btn"
        onClick={onGerar}
        disabled={!podeGerar}
      >
        <FiDownload size={13} />
        {labelBtn}
      </button>
    </div>
  );
}
