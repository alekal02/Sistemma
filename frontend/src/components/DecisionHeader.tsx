/* ============================================
   DecisionHeader — Painel de Prioridades e Score
   
   Exibe no topo do dashboard:
   - Score geral por categoria (💰📋)
   - Lista de prioridades com ações sugeridas
   - Barra de resumo de saúde do dashboard
   ============================================ */

import { useState, useCallback } from 'react'
import { FiAlertTriangle, FiAlertCircle, FiChevronDown, FiChevronUp, FiX, FiBarChart2 } from 'react-icons/fi'
import type { AlertaDecisao, ScoreCategoria, StatusDecisao } from '../types/decision'

/* ─── CONSTANTES ─── */

const CORES_SCORE: Record<StatusDecisao, { bg: string; text: string; bar: string }> = {
  ok: { bg: '#f0fdf4', text: '#15803d', bar: '#22c55e' },
  atencao: { bg: '#fffbeb', text: '#b45309', bar: '#f59e0b' },
  critico: { bg: '#fef2f2', text: '#dc2626', bar: '#ef4444' },
}

const ICONES_STATUS: Record<StatusDecisao, React.ReactNode> = {
  ok: <FiBarChart2 size={14} />,
  atencao: <FiAlertCircle size={14} />,
  critico: <FiAlertTriangle size={14} />,
}

/* ─── COMPONENTE: Score Badge ─── */

function ScoreBadge({ score }: { score: ScoreCategoria }) {
  const cor = CORES_SCORE[score.status]
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        background: cor.bg,
        borderRadius: '10px',
        padding: '0.5rem 0.85rem',
        border: `1px solid ${cor.bar}30`,
        flex: '0 0 auto',
      }}
    >
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '10px',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.1rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}
      >
        {score.icone}
      </div>
      <div>
        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: cor.text, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
          {score.label}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.1rem' }}>
          {ICONES_STATUS[score.status]}
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: cor.text }}>
            {score.status === 'ok' ? 'OK' : score.status === 'atencao' ? `${score.kpisAtencao} em atenção` : `${score.kpisCriticos} críticos`}
          </span>
        </div>
        {/* Mini barra de saúde */}
        <div
          style={{
            marginTop: '0.2rem',
            height: '3px',
            background: '#e2e8f0',
            borderRadius: '2px',
            overflow: 'hidden',
            width: '100px',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${score.totalKpis > 0 ? (score.kpisOk / score.totalKpis) * 100 : 0}%`,
              background: CORES_SCORE.ok.bar,
              borderRadius: '2px',
              transition: 'width 0.5s',
            }}
          />
        </div>
        <div style={{ fontSize: '0.55rem', color: '#94a3b8', marginTop: '0.05rem' }}>
          {score.kpisOk}/{score.totalKpis} ok
        </div>
      </div>
    </div>
  )
}

/* ─── COMPONENTE: Alerta Card ─── */

function AlertaCard({ alerta, onDismiss }: { alerta: AlertaDecisao; onDismiss?: (id: string) => void }) {
  const cor = CORES_SCORE[alerta.status]
  
  return (
    <div
      style={{
        background: cor.bg,
        borderRadius: '10px',
        padding: '0.7rem 0.85rem',
        border: `1px solid ${cor.bar}30`,
        borderLeft: `3px solid ${cor.bar}`,
        position: 'relative',
      }}
    >
      {onDismiss && (
        <button
          onClick={() => onDismiss(alerta.id)}
          style={{
            position: 'absolute',
            top: '0.3rem',
            right: '0.3rem',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: cor.text,
            opacity: 0.5,
            padding: '0.1rem',
            display: 'flex',
          }}
        >
          <FiX size={12} />
        </button>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
        <div style={{ flexShrink: 0, marginTop: '0.05rem', color: cor.text, fontSize: '0.85rem' }}>
          {alerta.status === 'critico' ? <FiAlertTriangle size={16} /> : <FiAlertCircle size={16} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '0.72rem', color: cor.text }}>
              {alerta.kpiNome}
            </strong>
            <span style={{
              fontSize: '0.58rem',
              fontWeight: 700,
              color: cor.text,
              background: 'rgba(255,255,255,0.5)',
              padding: '0.05rem 0.35rem',
              borderRadius: '4px',
            }}>
              {alerta.valorAtual} {alerta.variacao}
            </span>
          </div>

          <div style={{ fontSize: '0.68rem', color: '#475569', marginTop: '0.15rem', lineHeight: 1.4 }}>
            {alerta.mensagem}
          </div>

          <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '0.1rem' }}>
            <strong>Impacto:</strong> {alerta.impacto}
          </div>

          <div style={{
            fontSize: '0.68rem',
            color: '#1e293b',
            marginTop: '0.2rem',
            padding: '0.25rem 0.4rem',
            background: 'rgba(255,255,255,0.6)',
            borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.8)',
          }}>
            <strong>💡 Ação:</strong> {alerta.acaoSugerida}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── COMPONENTE PRINCIPAL ─── */

interface DecisionHeaderProps {
  scores: ScoreCategoria[]
  prioridades: AlertaDecisao[]
  temPrioridades: boolean
  /** Quantas prioridades mostrar antes de "ver mais" */
  maxPrioridades?: number
  /** Callback para quando o usuário clica em "ver dashboard completo" */
  onVerCompleto?: () => void
}

export default function DecisionHeader({
  scores,
  prioridades,
  temPrioridades,
  maxPrioridades = 3,
  onVerCompleto,
}: DecisionHeaderProps) {
  const [expandido, setExpandido] = useState(temPrioridades)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const prioridadesVisiveis = prioridades.filter(p => !dismissed.has(p.id))
  const temPendentes = prioridadesVisiveis.length > 0

  const handleDismiss = useCallback((id: string) => {
    setDismissed(prev => new Set(prev).add(id))
  }, [])

  const handleReset = useCallback(() => {
    setDismissed(new Set())
  }, [])

  // Se não tem nada a mostrar, render compacto
  if (!temPrioridades && scores.every(s => s.totalKpis === 0)) {
    return null
  }

  return (
    <div style={{ marginBottom: '1.25rem' }}>
      {/* ═══ SCORES ═══ */}
      <div
        style={{
          display: 'flex',
          gap: '0.6rem',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: temPendentes && expandido ? '0.75rem' : '0',
        }}
      >
        {scores.filter(s => s.totalKpis > 0).map(score => (
          <ScoreBadge key={score.categoria} score={score} />
        ))}

        {/* Botão de acesso rápido */}
        {onVerCompleto && (
          <button
            onClick={onVerCompleto}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.65rem',
              fontWeight: 600,
              color: '#64748b',
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '0.35rem 0.6rem',
              cursor: 'pointer',
              marginLeft: 'auto',
              transition: 'all 0.15s',
            }}
          >
            <FiBarChart2 size={12} /> Dashboard Completo
          </button>
        )}
      </div>

      {/* ═══ PRIORIDADES ═══ */}
      {temPendentes && (
        <div>
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.5rem',
              cursor: 'pointer',
            }}
            onClick={() => setExpandido(!expandido)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <FiAlertTriangle size={14} style={{ color: '#dc2626' }} />
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1e293b' }}>
                ⚡ Prioridades — {prioridadesVisiveis.length} item(ns) precisam de ação
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              {dismissed.size > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleReset() }}
                  style={{
                    fontSize: '0.6rem',
                    color: '#64748b',
                    background: '#f1f5f9',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    padding: '0.1rem 0.35rem',
                    cursor: 'pointer',
                  }}
                >
                  Restaurar todos
                </button>
              )}
              {expandido ? <FiChevronUp size={14} color="#64748b" /> : <FiChevronDown size={14} color="#64748b" />}
            </div>
          </div>

          {/* Lista */}
          {expandido && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {prioridadesVisiveis.slice(0, maxPrioridades).map(alerta => (
                <AlertaCard key={alerta.id} alerta={alerta} onDismiss={handleDismiss} />
              ))}
              {prioridadesVisiveis.length > maxPrioridades && (
                <div style={{
                  textAlign: 'center',
                  fontSize: '0.65rem',
                  color: '#94a3b8',
                  padding: '0.3rem',
                }}>
                  +{prioridadesVisiveis.length - maxPrioridades} prioridade(s) oculta(s)
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export { ScoreBadge, AlertaCard }
