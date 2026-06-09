/* ============================================
   DecisionCard — Card para Tomada de Decisão
   
   Exibe um KPI com:
   - Semáforo de status (🟢🟡🔴)
   - Badge de categoria (💰📋)
   - Valor formatado grande
   - Variação vs período anterior
   - Botão de ação sugerida (quando não-ok)
   - Mini gráfico de barras decorativo
   ============================================ */

import { useCallback, useState } from 'react'
import { FiDollarSign, FiTruck, FiAlertTriangle, FiCheckCircle, FiInfo, FiX } from 'react-icons/fi'
import type { KpiDecisao, StatusDecisao, CategoriaKpi } from '../types/decision'

/* ─── CONSTANTES DE COR ─── */

const CORES_STATUS: Record<StatusDecisao, { borda: string; fundo: string; texto: string; badge: string }> = {
  ok: {
    borda: '#22c55e',
    fundo: '#f0fdf4',
    texto: '#15803d',
    badge: '✅ Normal',
  },
  atencao: {
    borda: '#f59e0b',
    fundo: '#fffbeb',
    texto: '#b45309',
    badge: '⚠️ Atenção',
  },
  critico: {
    borda: '#ef4444',
    fundo: '#fef2f2',
    texto: '#dc2626',
    badge: '🔴 Ação necessária',
  },
}

const CORES_CATEGORIA: Record<CategoriaKpi, { icone: React.ReactNode; label: string; cor: string }> = {
  receita: { icone: <FiDollarSign size={13} />, label: '💰 Receita', cor: '#f59e0b' },
  operacional: { icone: <FiTruck size={13} />, label: '📋 Operacional', cor: '#3b82f6' },
  indefinido: { icone: <FiInfo size={13} />, label: '📊 Geral', cor: '#64748b' },
}

const ALTURAS_BARRAS = [0.3, 0.5, 0.7, 0.9, 0.6, 0.8, 1.0]

/* ─── COMPONENTE ─── */

interface DecisionCardProps {
  kpi: KpiDecisao
  /** Se true, exibe em tamanho reduzido para grids de comparação */
  compact?: boolean
  /** Callback quando o usuário clica em "O que fazer?" */
  onAction?: (kpi: KpiDecisao) => void
  /** Ícone personalizado (opcional) */
  iconePersonalizado?: React.ReactNode
}

export default function DecisionCard({ kpi, compact = false, onAction, iconePersonalizado }: DecisionCardProps) {
  const [showAcao, setShowAcao] = useState(false)
  
  const corStatus = CORES_STATUS[kpi.status]
  const corCat = CORES_CATEGORIA[kpi.categoria]
  const precisaAcao = kpi.status !== 'ok'

  const handleActionClick = useCallback(() => {
    if (onAction) {
      onAction(kpi)
    } else {
      setShowAcao(!showAcao)
    }
  }, [kpi, onAction, showAcao])

  return (
    <div
      className="decision-card"
      style={{
        background: '#fff',
        borderRadius: '12px',
        border: `1px solid ${corStatus.borda}20`,
        borderLeft: `4px solid ${corStatus.borda}`,
        boxShadow: `0 1px 4px ${corStatus.borda}10`,
        padding: compact ? '0.65rem' : '0.85rem',
        position: 'relative',
        overflow: 'hidden',
        transition: 'box-shadow 0.2s, transform 0.15s',
        minWidth: 0,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = `0 4px 16px ${corStatus.borda}20`
        e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = `0 1px 4px ${corStatus.borda}10`
        e.currentTarget.style.transform = ''
      }}
    >
      {/* Mini gráfico decorativo */}
      <div
        style={{
          position: 'absolute',
          top: '0.5rem',
          right: '0.7rem',
          display: 'flex',
          gap: '2px',
          alignItems: 'flex-end',
          height: '16px',
          opacity: 0.3,
        }}
      >
        {ALTURAS_BARRAS.map((h, bi) => (
          <div
            key={bi}
            style={{
              width: '3px',
              height: `${Math.round(h * 14)}px`,
              background: corStatus.borda,
              borderRadius: '1px 1px 0 0',
              opacity: 0.5 + h * 0.5,
            }}
          />
        ))}
      </div>

      {/* Header: Categoria + Status */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: compact ? '0.3rem' : '0.4rem',
        }}
      >
        {/* Categoria */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            fontSize: compact ? '0.55rem' : '0.6rem',
            fontWeight: 700,
            color: corCat.cor,
            textTransform: 'uppercase',
            letterSpacing: '0.03em',
          }}
        >
          {iconePersonalizado || corCat.icone}
          {!compact && <span>{corCat.label}</span>}
        </span>

        {/* Badge de status */}
        <span
          style={{
            fontSize: compact ? '0.5rem' : '0.58rem',
            fontWeight: 700,
            color: corStatus.texto,
            background: corStatus.fundo,
            padding: '0.1rem 0.4rem',
            borderRadius: '4px',
            border: `1px solid ${corStatus.borda}40`,
            whiteSpace: 'nowrap',
          }}
        >
          {compact ? (
            kpi.status === 'ok' ? '🟢' : kpi.status === 'atencao' ? '🟡' : '🔴'
          ) : (
            corStatus.badge
          )}
        </span>
      </div>

      {/* Label */}
      <div
        style={{
          fontSize: compact ? '0.6rem' : '0.68rem',
          color: '#64748b',
          fontWeight: 600,
          marginBottom: compact ? '0.1rem' : '0.15rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          paddingRight: '1.2rem',
        }}
        title={kpi.nome}
      >
        {kpi.nome}
      </div>

      {/* Valor */}
      <div
        style={{
          fontSize: compact ? '1rem' : '1.35rem',
          fontWeight: 700,
          color: '#0f172a',
          lineHeight: 1.2,
          marginBottom: compact ? '0.15rem' : '0.25rem',
          overflowWrap: 'break-word',
          wordBreak: 'break-word',
        }}
      >
        {kpi.formatado}
      </div>

      {/* Variação */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.3rem',
          fontSize: compact ? '0.58rem' : '0.68rem',
          color: kpi.variacao.tipo === 'positiva' ? '#059669' : kpi.variacao.tipo === 'negativa' ? '#dc2626' : '#94a3b8',
          fontWeight: 600,
        }}
      >
        <span>{kpi.variacao.label}</span>
        {kpi.variacao.tipo !== 'estavel' && (
          <span style={{ fontSize: '0.58rem', fontWeight: 400, color: '#94a3b8' }}>
            vs período anterior
          </span>
        )}
      </div>

      {/* Botão de ação (apenas para status não-ok) */}
      {precisaAcao && (
        <div style={{ marginTop: compact ? '0.35rem' : '0.5rem' }}>
          <button
            onClick={handleActionClick}
            className="btn-decision-action"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: compact ? '0.58rem' : '0.65rem',
              fontWeight: 700,
              padding: compact ? '0.2rem 0.45rem' : '0.25rem 0.55rem',
              background: corStatus.fundo,
              color: corStatus.texto,
              border: `1px solid ${corStatus.borda}40`,
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {kpi.status === 'critico' ? <FiAlertTriangle size={11} /> : <FiInfo size={11} />}
            {compact ? 'Ação' : '💡 O que fazer?'}
          </button>

          {/* Painel de ação expandido */}
          {showAcao && kpi.acaoSugerida && (
            <div
              style={{
                marginTop: '0.4rem',
                padding: '0.5rem 0.6rem',
                background: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                fontSize: compact ? '0.6rem' : '0.68rem',
                position: 'relative',
              }}
            >
              <button
                onClick={() => setShowAcao(false)}
                style={{
                  position: 'absolute',
                  top: '0.25rem',
                  right: '0.25rem',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  padding: '0.1rem',
                  display: 'flex',
                }}
              >
                <FiX size={12} />
              </button>

              {kpi.motivo && (
                <div style={{ marginBottom: '0.25rem' }}>
                  <span style={{ fontWeight: 700, color: corStatus.texto }}>⚠️ {kpi.motivo}</span>
                </div>
              )}

              {kpi.impacto && (
                <div style={{ marginBottom: '0.25rem', color: '#64748b' }}>
                  <span style={{ fontWeight: 600 }}>Impacto: </span>
                  {kpi.impacto}
                </div>
              )}

              <div style={{ color: '#1e293b' }}>
                <span style={{ fontWeight: 600 }}>💡 Ação: </span>
                {kpi.acaoSugerida}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
