import { FiCheckCircle, FiAlertTriangle } from 'react-icons/fi';
import { formatarNumero } from '../services/kpiEngine';

interface KpiCardProps {
  label: string;
  valor: string;
  unidade?: string;
  categoria?: string;
  cor?: string;
  meta?: number | null;
  alerta?: 'acima' | 'abaixo' | null;
  formato?: string;
  /** Se true, mostra mini gráfico de barras decorativo */
  miniChart?: boolean;
}

const CORES_PADRAO = ['#059669', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#3b82f6', '#ec4899'];

export default function KpiCard({
  label,
  valor,
  unidade,
  categoria,
  cor,
  meta,
  alerta,
  formato = 'numero',
  miniChart = true,
}: KpiCardProps) {
  const valorNum = parseFloat(valor.replace(/[^0-9,.-]/g, '').replace(',', '.'));
  const temMeta = meta !== null && meta !== undefined;
  const atingiuMeta = temMeta && !isNaN(valorNum) && (
    alerta === 'acima' ? valorNum >= meta! :
    alerta === 'abaixo' ? valorNum <= meta! : true
  );

  const corCard = cor || CORES_PADRAO[0];
  const alturasBarras = [0.3, 0.5, 0.7, 0.9, 0.6, 0.8, 1.0];

  return (
    <div className="kpi-card" style={{ borderTopColor: corCard }}>
      {/* Mini gráfico decorativo */}
      {miniChart && (
        <div
          style={{
            position: 'absolute',
            top: '0.5rem',
            right: '0.7rem',
            display: 'flex',
            gap: '2px',
            alignItems: 'flex-end',
            height: '16px',
            opacity: 0.5,
          }}
        >
          {alturasBarras.map((h, bi) => (
            <div
              key={bi}
              style={{
                width: '3px',
                height: Math.round(h * 14) + 'px',
                background: corCard,
                borderRadius: '1px 1px 0 0',
                opacity: 0.6 + h * 0.4,
              }}
            />
          ))}
        </div>
      )}

      {/* Categoria */}
      {categoria && (
        <div className="kpi-card-category">{categoria}</div>
      )}

      {/* Label */}
      <div className="kpi-card-label" style={{ paddingRight: '1.5rem' }}>
        {label}
        {unidade && (
          <span style={{ color: 'var(--color-text-light)', fontWeight: 400, marginLeft: '0.25rem' }}>
            ({unidade})
          </span>
        )}
      </div>

      {/* Valor */}
      <div className="kpi-card-value">{valor}</div>

      {/* Meta e badges */}
      <div className="kpi-card-meta">
        {temMeta && (
          <span
            className={`kpi-card-badge ${atingiuMeta ? 'tag-success' : 'tag-danger'}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.2rem',
            }}
          >
            {atingiuMeta ? <FiCheckCircle size={10} /> : <FiAlertTriangle size={10} />}
            Meta: {formatarNumero(meta!, formato as any)}
          </span>
        )}
        {categoria && (
          <span className="tag tag-neutral" style={{ fontSize: '0.55rem' }}>
            {categoria}
          </span>
        )}
      </div>
    </div>
  );
}

interface KpiGridProps {
  children: React.ReactNode;
}

export function KpiGrid({ children }: KpiGridProps) {
  return <div className="kpi-grid">{children}</div>;
}
