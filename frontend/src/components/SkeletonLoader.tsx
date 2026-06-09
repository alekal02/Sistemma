interface SkeletonLoaderProps {
  tipo?: 'card' | 'chart' | 'text' | 'table' | 'kpi-grid';
  quantidade?: number;
}

export default function SkeletonLoader({ tipo = 'text', quantidade = 1 }: SkeletonLoaderProps) {
  if (tipo === 'kpi-grid') {
    return (
      <div className="kpi-grid">
        {Array.from({ length: quantidade || 4 }).map((_, i) => (
          <div key={i} className="skeleton skeleton-card" />
        ))}
      </div>
    );
  }

  if (tipo === 'chart') {
    return (
      <div className="chart-grid">
        {Array.from({ length: quantidade || 2 }).map((_, i) => (
          <div key={i} className="skeleton skeleton-chart" />
        ))}
      </div>
    );
  }

  if (tipo === 'table') {
    return (
      <div style={{ padding: '1rem' }}>
        {Array.from({ length: quantidade || 5 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
            {Array.from({ length: 4 }).map((_, j) => (
              <div
                key={j}
                className="skeleton skeleton-text"
                style={{ width: `${20 + j * 10}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ padding: '0.5rem 0' }}>
      {Array.from({ length: quantidade }).map((_, i) => (
        <div key={i} style={{ marginBottom: '0.5rem' }}>
          <div className="skeleton skeleton-text" style={{ width: `${40 + Math.random() * 40}%` }} />
          <div className="skeleton skeleton-text skeleton-text-sm" />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton específico para o Resumo Executivo
 */
export function ExecSummarySkeleton() {
  return (
    <div
      style={{
        background: 'var(--color-bg-dark)',
        borderRadius: '12px',
        padding: '1.1rem 1.25rem',
        marginBottom: '1.25rem',
      }}
    >
      <div
        className="skeleton"
        style={{
          height: '10px',
          width: '120px',
          marginBottom: '0.7rem',
          background: 'linear-gradient(90deg, #334155 25%, #475569 50%, #334155 75%)',
          backgroundSize: '200px 100%',
          animation: 'shimmer 2.5s infinite',
          borderRadius: '4px',
        }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.6rem' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="skeleton"
            style={{
              height: '48px',
              borderRadius: '8px',
              background: 'linear-gradient(90deg, #334155 25%, #475569 50%, #334155 75%)',
              backgroundSize: '200px 100%',
              animation: 'shimmer 2.5s infinite',
            }}
          />
        ))}
      </div>
    </div>
  );
}
