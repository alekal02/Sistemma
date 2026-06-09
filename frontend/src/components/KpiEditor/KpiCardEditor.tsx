import { useState, useEffect } from 'react';
import type { KpiConfig, ColunaDetectada, PreviewState, ConstanteGlobal } from './KpiEditorTypes';
import { FMT_OPTS } from './KpiEditorTypes';
import KpiPreview from './KpiPreview';
import KpiContextFields from './KpiContextFields';
import KpiFormulaSection from './KpiFormulaSection';

interface KpiCardEditorProps {
  kpi: KpiConfig;
  idx: number;
  total: number;
  colunas: ColunaDetectada[];
  colunasNum: ColunaDetectada[];
  colunasTexto: ColunaDetectada[];
  constantesGlobais: Record<string, ConstanteGlobal>;
  previewStates: Record<number, PreviewState>;
  modoExibicao: 'simples' | 'completo';
  onChange: (idx: number, campo: string, valor: any) => void;
  onMoveUp: (idx: number) => void;
  onMoveDown: (idx: number) => void;
  onDuplicate: (idx: number) => void;
  onRemove: (idx: number) => void;
  fazerPreview: (idx: number) => void;
  agendarPreview: (idx: number) => void;
}

export default function KpiCardEditor({
  kpi, idx, total, colunas, colunasNum, colunasTexto,
  constantesGlobais, previewStates, modoExibicao,
  onChange, onMoveUp, onMoveDown, onDuplicate, onRemove,
  fazerPreview, agendarPreview,
}: KpiCardEditorProps) {
  const temFormula = Boolean(kpi.expressao?.trim());

  return (
    <div style={{
      marginBottom: '0.8rem',
      border: '1px solid #e2e8f0',
      borderRadius: '10px',
      background: kpi.ativo ? '#fff' : '#f8fafc',
      opacity: kpi.ativo ? 1 : 0.55,
    }}>
      {/* ─── Header: checkbox + NOME DA KPI + ações ─── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.4rem',
        padding: '0.55rem 0.7rem', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap',
      }}>
        <input
          type="checkbox"
          checked={kpi.ativo}
          onChange={() => onChange(idx, 'ativo', !kpi.ativo)}
          style={{ width: '15px', height: '15px', accentColor: '#22c55e' }}
        />

        <input
          value={kpi.label}
          onChange={e => onChange(idx, 'label', e.target.value)}
          placeholder="Nome do KPI"
          style={{
            flex: '1 1 160px', padding: '0.35rem 0.5rem',
            border: '1px solid #d1d5db', borderRadius: '5px', fontSize: '0.82rem',
            fontWeight: 600,
          }}
        />

        <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
          <button
            onClick={() => onMoveUp(idx)}
            disabled={idx === 0}
            title="Mover para cima"
            style={{
              padding: '0.15rem 0.35rem', borderRadius: '4px',
              border: '1px solid #d1d5db',
              background: idx === 0 ? '#f1f5f9' : '#fff',
              color: idx === 0 ? '#d1d5db' : '#64748b',
              fontSize: '0.7rem', cursor: idx === 0 ? 'not-allowed' : 'pointer', lineHeight: 1,
            }}
          >▲</button>
          <button
            onClick={() => onMoveDown(idx)}
            disabled={idx === total - 1}
            title="Mover para baixo"
            style={{
              padding: '0.15rem 0.35rem', borderRadius: '4px',
              border: '1px solid #d1d5db',
              background: idx === total - 1 ? '#f1f5f9' : '#fff',
              color: idx === total - 1 ? '#d1d5db' : '#64748b',
              fontSize: '0.7rem', cursor: idx === total - 1 ? 'not-allowed' : 'pointer', lineHeight: 1,
            }}
          >▼</button>
          <button
            onClick={() => onDuplicate(idx)}
            title="Duplicar KPI"
            style={{
              padding: '0.15rem 0.35rem', borderRadius: '4px',
              border: '1px solid #d1d5db', background: '#fff',
              color: '#22c55e', fontSize: '0.7rem', cursor: 'pointer', lineHeight: 1,
            }}
          >📋</button>
          <button
            onClick={() => onRemove(idx)}
            style={{
              padding: '0.2rem 0.5rem', borderRadius: '4px', border: 'none',
              background: '#fef2f2', color: '#dc2626',
              fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
            }}
          >Remover</button>
        </div>
      </div>

      {/* ─── Corpo: Simples ou Completo ─── */}
      {modoExibicao === 'simples' ? (
        <SimplesBody
          kpi={kpi} idx={idx} onChange={onChange}
          previewStates={previewStates} fazerPreview={fazerPreview}
        />
      ) : (
        <CompletoBody
          kpi={kpi} idx={idx} colunas={colunas} colunasNum={colunasNum}
          constantesGlobais={constantesGlobais} previewStates={previewStates}
          onChange={onChange} agendarPreview={agendarPreview}
        />
      )}
    </div>
  );
}

/* ─── Modo Simples — agora com descrição visível + fórmula + edição inline ─── */
function SimplesBody({ kpi, idx, onChange, previewStates, fazerPreview }: {
  kpi: KpiConfig; idx: number; onChange: (idx: number, campo: string, valor: any) => void;
  previewStates: Record<number, PreviewState>; fazerPreview: (idx: number) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [editDesc, setEditDesc] = useState(kpi.descricao || '');
  const [editExpr, setEditExpr] = useState(kpi.expressao || '');

  // Sincroniza se edição for cancelada
  useEffect(function() {
    if (!editando) {
      setEditDesc(kpi.descricao || '');
      setEditExpr(kpi.expressao || '');
    }
  }, [kpi.descricao, kpi.expressao, editando]);

  function salvarEdicao() {
    onChange(idx, 'descricao', editDesc);
    onChange(idx, 'expressao', editExpr);
    setEditando(false);
  }

  const expressao = kpi.expressao || '';
  const descricao = kpi.descricao || '';
  const descricaoExibida = descricao || 'Clique em "Editar" para adicionar descricao...';

  return (
    <div style={{ padding: '0.55rem 0.7rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
        <FormatoSelector value={kpi.formato} onChange={v => onChange(idx, 'formato', v)} />
        <div style={{ flex: '1 1 200px' }} />

        {/* Botão Editar */}
        <button
          onClick={function(e) { e.stopPropagation(); if (editando) { salvarEdicao(); } else { setEditDesc(descricao); setEditExpr(expressao); setEditando(true); } }}
          style={{
            padding: '0.2rem 0.6rem', borderRadius: '5px',
            border: '1px solid ' + (editando ? '#22c55e' : '#cbd5e1'),
            background: editando ? '#f0fdf4' : '#fff',
            color: editando ? '#15803d' : '#64748b',
            fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '0.25rem',
          }}
        >
          {editando ? (<>✓ Salvar</>) : (<>✏️ Editar</>)}
        </button>
        {editando && (
          <button
            onClick={function(e) { e.stopPropagation(); setEditando(false); }}
            style={{
              padding: '0.2rem 0.6rem', borderRadius: '5px',
              border: '1px solid #e2e8f0', background: '#fff',
              color: '#94a3b8', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
            }}
          >Cancelar</button>
        )}
      </div>

      {editando ? (
        /* ─── Modo Edição ─── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', background: '#fefce8', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.5rem 0.6rem', marginBottom: '0.4rem' }}>
          <div>
            <label style={{ fontSize: '0.6rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', display: 'block', marginBottom: '0.15rem' }}>Descricao</label>
            <textarea
              value={editDesc}
              onChange={function(e) { setEditDesc(e.target.value); }}
              rows={2}
              placeholder="Ex: Média de peso transportado por viagem em toneladas"
              style={{
                width: '100%', padding: '0.3rem 0.45rem',
                border: '1px solid #d1d5db', borderRadius: '5px',
                fontSize: '0.78rem', fontFamily: 'inherit', resize: 'vertical',
                background: '#fff', boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.6rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', display: 'block', marginBottom: '0.15rem' }}>Formula</label>
            <textarea
              value={editExpr}
              onChange={function(e) { setEditExpr(e.target.value); }}
              rows={2}
              placeholder="Ex: SUM(PESO TOTAL) / 1000"
              style={{
                width: '100%', padding: '0.3rem 0.45rem',
                border: '1px solid #d1d5db', borderRadius: '5px',
                fontSize: '0.78rem', fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace",
                resize: 'vertical', background: '#fff', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      ) : (
        /* ─── Modo Visualização ─── */
        <>
          {/* Descrição */}
          <div style={{
            fontSize: '0.72rem', color: '#475569', lineHeight: 1.45,
            marginBottom: '0.25rem', padding: '0.3rem 0.5rem',
            background: '#f8fafc', borderRadius: '6px',
            border: '1px solid #e2e8f0',
          }}>
            <span style={{ fontWeight: 600, color: '#64748b', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.3px', marginRight: '0.3rem' }}>Descricao:</span>
            {descricaoExibida}
          </div>

          {/* Fórmula */}
          {expressao ? (
            <div style={{
              fontSize: '0.72rem', fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace",
              color: '#0369a1', background: '#e0f2fe', padding: '0.3rem 0.5rem',
              borderRadius: '6px', border: '1px solid #bae6fd', marginBottom: '0.35rem',
              lineHeight: 1.4, wordBreak: 'break-all', whiteSpace: 'normal',
            }}>
              <span style={{ fontWeight: 700, fontSize: '0.6rem', color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Formula: </span>
              {expressao}
            </div>
          ) : (
            <div style={{
              fontSize: '0.68rem', color: '#94a3b8', fontStyle: 'italic',
              padding: '0.2rem 0.5rem', marginBottom: '0.3rem',
            }}>
              Sem formula — usa agregacao simples
            </div>
          )}
        </>
      )}

      <KpiPreview idx={idx} previewStates={previewStates} fazerPreview={fazerPreview} />
    </div>
  );
}

/* ─── Modo Completo ─── */
function CompletoBody({ kpi, idx, colunas, colunasNum, constantesGlobais, previewStates, onChange, agendarPreview }: {
  kpi: KpiConfig; idx: number; colunas: ColunaDetectada[]; colunasNum: ColunaDetectada[];
  constantesGlobais: Record<string, ConstanteGlobal>;
  previewStates: Record<number, PreviewState>;
  onChange: (idx: number, campo: string, valor: any) => void;
  agendarPreview: (idx: number) => void;
}) {
  return (
    <div style={{ padding: '0.55rem 0.7rem' }}>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <FormatoSelector value={kpi.formato} onChange={v => onChange(idx, 'formato', v)} />
      </div>

      <KpiFormulaSection
        kpi={kpi} idx={idx} colunas={colunas} colunasNum={colunasNum}
        constantesGlobais={constantesGlobais} previewStates={previewStates}
        agendarPreview={agendarPreview} onChange={(campo, valor) => onChange(idx, campo, valor)}
      />

      <KpiContextFields kpi={kpi} onChange={(campo, valor) => onChange(idx, campo, valor)} />
    </div>
  );
}

/* ─── Sub-componentes ─── */

function FormatoSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={{ fontSize: '0.6rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '0.2rem' }}>Formato</label>
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        {FMT_OPTS.map(fmt => (
          <button key={fmt.value} type="button" onClick={() => onChange(fmt.value)}
            style={{
              padding: '0.2rem 0.5rem', borderRadius: '4px',
              border: value === fmt.value ? '2px solid #22c55e' : '1px solid #d1d5db',
              background: value === fmt.value ? fmt.bg : '#fff',
              color: value === fmt.value ? fmt.cor : '#94a3b8',
              fontSize: '0.7rem', fontWeight: value === fmt.value ? 700 : 500, cursor: 'pointer',
            }}>
            {fmt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
