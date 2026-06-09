import { FiPlay, FiAlertCircle, FiInfo } from 'react-icons/fi';
import type { PreviewState } from './KpiEditorTypes';

interface KpiPreviewProps {
  idx: number;
  previewStates: Record<number, PreviewState>;
  fazerPreview: (idx: number) => void;
}

export default function KpiPreview({ idx, previewStates, fazerPreview }: KpiPreviewProps) {
  const state = previewStates[idx];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem' }}>
        <button
          onClick={() => fazerPreview(idx)}
          style={{
            padding: '0.25rem 0.55rem',
            borderRadius: '5px',
            border: '1px solid #22c55e',
            background: '#f0fdf4',
            color: '#15803d',
            fontSize: '0.7rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
          }}
        >
          <FiPlay size={11} /> Testar
        </button>
        {state?.loading ? (
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Calculando...</span>
        ) : state?.erro ? (
          <span style={{ fontSize: '0.72rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <FiAlertCircle size={12} /> {state.erro}
          </span>
        ) : state?.valor ? (
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#16a34a' }}>{state.valor}</span>
        ) : (
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Clique em Testar para ver o valor</span>
        )}
      </div>

      {/* ═══ Debug: colunas ausentes ═══ */}
      {state && !state.loading && !state.erro && state.colunasAusentes && state.colunasAusentes.length > 0 && (
        <div style={{
          marginTop: '0.3rem',
          padding: '0.25rem 0.5rem',
          background: '#fef2f2',
          borderRadius: '5px',
          border: '1px solid #fecaca',
          fontSize: '0.68rem',
          color: '#b91c1c',
          display: 'flex',
          alignItems: 'center',
          gap: '0.3rem',
          flexWrap: 'wrap',
        }}>
          <FiAlertCircle size={11} />
          <span style={{ fontWeight: 600 }}>Colunas nao encontradas nos dados:</span>
          {state.colunasAusentes.map((col, i) => (
            <code key={i} style={{ background: '#fecaca', padding: '0.05rem 0.3rem', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 700 }}>{col}</code>
          ))}
        </div>
      )}

      {/* ═══ Debug: valores disponiveis ═══ */}
      {state && !state.loading && state.valoresDisponiveis && Object.keys(state.valoresDisponiveis).length > 0 && (
        <div style={{
          marginTop: '0.2rem',
          padding: '0.2rem 0.5rem',
          background: '#f8fafc',
          borderRadius: '5px',
          border: '1px solid #e2e8f0',
          fontSize: '0.65rem',
          color: '#64748b',
          display: 'flex',
          alignItems: 'center',
          gap: '0.3rem',
          flexWrap: 'wrap',
        }}>
          <FiInfo size={10} />
          <span>Constantes disponiveis:</span>
          {Object.entries(state.valoresDisponiveis).map(([nome, val]) => (
            <code key={nome} style={{ background: '#fef3c7', padding: '0.05rem 0.3rem', borderRadius: '3px', color: '#b45309', fontWeight: 600, fontSize: '0.6rem' }}>
              {nome} = {val}
            </code>
          ))}
        </div>
      )}
    </div>
  );
}
