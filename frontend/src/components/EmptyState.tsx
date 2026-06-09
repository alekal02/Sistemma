import type { ReactNode } from 'react';
import { FiDatabase, FiUpload, FiSettings, FiBarChart2 } from 'react-icons/fi';

interface EmptyStateProps {
  icone?: 'upload' | 'config' | 'data' | 'chart' | ReactNode;
  titulo: string;
  descricao: string;
  acoes?: {
    label: string;
    onClick: () => void;
    variante?: 'primary' | 'secondary' | 'success';
    icone?: ReactNode;
  }[];
}

const iconesMap = {
  upload: FiUpload,
  config: FiSettings,
  data: FiDatabase,
  chart: FiBarChart2,
};

export default function EmptyState({ icone, titulo, descricao, acoes }: EmptyStateProps) {
  const IconComponent = typeof icone === 'string' ? iconesMap[icone as keyof typeof iconesMap] : null;

  return (
    <div
      style={{
        textAlign: 'center',
        padding: '3rem 2rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem',
      }}
    >
      {IconComponent ? (
        <IconComponent size={48} style={{ opacity: 0.3, color: 'var(--color-text-light)' }} />
      ) : typeof icone === 'object' ? (
        <div style={{ opacity: 0.3 }}>{icone}</div>
      ) : (
        <FiDatabase size={48} style={{ opacity: 0.3, color: 'var(--color-text-light)' }} />
      )}

      <div>
        <h3
          style={{
            margin: '0 0 0.35rem',
            fontSize: '1rem',
            color: 'var(--color-text-secondary)',
          }}
        >
          {titulo}
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: '0.85rem',
            color: 'var(--color-text-light)',
            maxWidth: '400px',
            lineHeight: 1.5,
          }}
        >
          {descricao}
        </p>
      </div>

      {acoes && acoes.length > 0 && (
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.5rem' }}>
          {acoes.map((acao, i) => (
            <button
              key={i}
              className={`btn ${acao.variante === 'success' ? 'btn-success' : acao.variante === 'secondary' ? 'btn-secondary' : 'btn-primary'} btn-lg`}
              onClick={acao.onClick}
            >
              {acao.icone}
              {acao.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
