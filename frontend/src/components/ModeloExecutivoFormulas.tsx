/* ============================================
   ModeloExecutivoFormulas — Componente de Visualização e Edição
   ═══════════════════════════════════════════════════════════
   Exibe as fórmulas do Modelo Executivo em formato de tabela
   com campos editáveis inline e botão de restaurar original.
   ============================================ */

import { useState, useEffect, useCallback } from 'react';
import {
  FiCopy, FiCheck, FiRefreshCw, FiEdit2, FiTrash2, FiSave,
  FiX, FiAlertCircle, FiInfo, FiDownload,
} from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import type {
  GrupoModeloExecutivo,
  KpiModeloExecutivo,
  KpiConfig,
  ModeloExecutivoResponse,
} from './KpiEditor/KpiEditorTypes';

interface Props {
  contractId: string;
  servicoId: string;
  /** Callback disparado quando o modelo é aplicado com sucesso */
  onAplicado?: (kpis: KpiConfig[]) => void;
  /** Callback para fechar/fechar o modal */
  onClose?: () => void;
  /** Se deve exibir como modal ou inline */
  modo?: 'modal' | 'inline';
}

export default function ModeloExecutivoFormulas({ contractId, servicoId, onAplicado, onClose, modo = 'inline' }: Props) {
  const { token } = useAuth();
  const { adicionarToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [aplicando, setAplicando] = useState(false);
  const [modelo, setModelo] = useState<ModeloExecutivoResponse | null>(null);
  const [substituir, setSubstituir] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [editandoFormula, setEditandoFormula] = useState<string | null>(null);
  const [formulaEditada, setFormulaEditada] = useState('');

  // Carregar modelo
  useEffect(() => {
    let ativo = true;
    setLoading(true);

    fetch(`/api/contracts/${contractId}/servicos/${servicoId}/modelo-executivo`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (ativo && data) setModelo(data);
      })
      .catch(() => {})
      .finally(() => { if (ativo) setLoading(false); });

    return () => { ativo = false; };
  }, [contractId, servicoId, token]);

  // Aplicar modelo executivo
  const handleAplicar = useCallback(async () => {
    setAplicando(true);
    try {
      const res = await fetch(`/api/contracts/${contractId}/servicos/${servicoId}/aplicar-modelo-executivo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ substituir }),
      });

      if (res.ok) {
        const data = await res.json();
        adicionarToast(data.message || 'Modelo Executivo aplicado!', 'success');
        setModelo(prev => prev ? { ...prev, temModeloAplicado: true } : prev);
        if (onAplicado && data.kpis) onAplicado(data.kpis);
        if (onClose) onClose();
      } else {
        const err = await res.json();
        adicionarToast(err.error || 'Erro ao aplicar', 'error');
      }
    } catch {
      adicionarToast('Erro ao aplicar modelo', 'error');
    } finally {
      setAplicando(false);
    }
  }, [contractId, servicoId, token, substituir, onAplicado, onClose, adicionarToast]);

  // Contagem total de indicadores
  const totalIndicadores = modelo?.modelo?.reduce((acc, g) => acc + g.indicadores.length, 0) || 0;

  // Iniciar edição de fórmula
  const iniciarEdicao = (formula: string) => {
    setEditandoFormula(formula);
    setFormulaEditada(formula);
  };

  const salvarEdicao = () => {
    adicionarToast('💡 Edite as fórmulas diretamente na seção de Indicadores após aplicar o modelo.', 'info');
    setEditandoFormula(null);
  };

  const cancelarEdicao = () => {
    setEditandoFormula(null);
    setFormulaEditada('');
  };

  // Container principal
  const containerStyle: React.CSSProperties = modo === 'modal' ? {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.5)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '1rem',
  } : {};

  const cardStyle: React.CSSProperties = modo === 'modal' ? {
    background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '680px',
    maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  } : {
    background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0',
    overflow: 'hidden',
  };

  if (loading) {
    const content = (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
        <FiRefreshCw className="spin" size={24} style={{ marginBottom: '0.5rem' }} />
        <div>Carregando modelo executivo...</div>
      </div>
    );
    if (modo === 'modal') {
      return (
        <div style={containerStyle}>
          <div style={cardStyle}>{content}</div>
        </div>
      );
    }
    return content;
  }

  if (!modelo) {
    const content = (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>
        <FiAlertCircle size={24} style={{ marginBottom: '0.5rem' }} />
        <div>Erro ao carregar modelo executivo.</div>
      </div>
    );
    if (modo === 'modal') {
      return (
        <div style={containerStyle}>
          <div style={cardStyle}>{content}</div>
        </div>
      );
    }
    return content;
  }

  const content = (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{
        padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#f8fafc',
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
            <FiDownload size={16} style={{ marginRight: '0.35rem', color: '#6366f1' }} />
            Modelo Executivo
          </h3>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.72rem', color: '#64748b' }}>
            {totalIndicadores} indicadores • {modelo.modelo.length} categorias
            {modelo.temModeloAplicado && ' • ✅ Já aplicado'}
          </p>
        </div>
        {modo === 'modal' && onClose && (
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8',
            padding: '0.25rem', borderRadius: '4px',
          }}>
            <FiX size={20} />
          </button>
        )}
      </div>

      {/* Body - scrollável */}
      <div style={{
        padding: '1rem 1.25rem', overflowY: 'auto', flex: 1,
        maxHeight: modo === 'modal' ? '60vh' : '400px',
      }}>
        {/* Valores do Contrato */}
        {Object.keys(modelo.valoresContrato).length > 0 && (
          <div style={{
            background: '#f0f9ff', borderRadius: '6px', border: '1px solid #bae6fd',
            padding: '0.5rem 0.75rem', marginBottom: '0.75rem',
            fontSize: '0.72rem',
          }}>
            <div style={{ fontWeight: 600, color: '#0369a1', marginBottom: '0.3rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Valores do Contrato
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {Object.entries(modelo.valoresContrato).filter(([_, v]) => v != null).map(([key, val]) => (
                <span key={key} style={{
                  background: '#fff', padding: '0.15rem 0.4rem', borderRadius: '4px',
                  border: '1px solid #e0f2fe', fontSize: '0.68rem',
                }}>
                  <strong>{key.replace('_', ' ')}:</strong>{' '}
                  {Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Grupos de indicadores */}
        {modelo.modelo.map((grupo) => (
          <div key={grupo.nome} style={{ marginBottom: '0.75rem' }}>
            <button
              onClick={() => setExpandido(expandido === grupo.nome ? null : grupo.nome)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                width: '100%', padding: '0.4rem 0.6rem',
                background: expandido === grupo.nome ? '#f1f5f9' : '#f8fafc',
                border: '1px solid #e2e8f0', borderRadius: '6px',
                cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                color: '#334155',
              }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: '2px',
                background: grupo.cor, flexShrink: 0,
              }} />
              {grupo.nome}
              <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '0.68rem' }}>
                {grupo.indicadores.length} indicadores
              </span>
              <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>
                {expandido === grupo.nome ? '▲' : '▼'}
              </span>
            </button>

            {expandido === grupo.nome && (
              <div style={{ marginTop: '0.35rem', paddingLeft: '0.25rem' }}>
                {grupo.indicadores.map((indicador) => (
                  <div key={indicador.nome} style={{
                    display: 'flex', alignItems: 'flex-start', gap: '0.35rem',
                    padding: '0.4rem 0.6rem', borderBottom: '1px solid #f1f5f9',
                    fontSize: '0.72rem',
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: indicador.cor, flexShrink: 0, marginTop: '0.3rem',
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '0.15rem' }}>
                        {indicador.label}
                        <span style={{
                          marginLeft: '0.35rem', fontSize: '0.58rem', fontWeight: 400,
                          color: '#94a3b8', textTransform: 'uppercase',
                        }}>
                          {indicador.formato === 'moeda' ? 'R$' : indicador.formato === 'porcentagem' ? '%' : 'No'}
                        </span>
                      </div>

                      {/* Fórmula editável */}
                      {editandoFormula === indicador.formula ? (
                        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                          <input
                            value={formulaEditada}
                            onChange={e => setFormulaEditada(e.target.value)}
                            style={{
                              flex: 1, fontSize: '0.68rem', fontFamily: 'monospace',
                              padding: '0.2rem 0.35rem', border: '1px solid #6366f1',
                              borderRadius: '4px', background: '#f0f0ff',
                            }}
                            autoFocus
                          />
                          <button onClick={salvarEdicao} className="btn-icon" style={{ color: '#059669' }} title="Confirmar">
                            <FiCheck size={12} />
                          </button>
                          <button onClick={cancelarEdicao} className="btn-icon" style={{ color: '#ef4444' }} title="Cancelar">
                            <FiX size={12} />
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => iniciarEdicao(indicador.formula)}
                          style={{
                            fontFamily: 'monospace', fontSize: '0.65rem', color: '#6366f1',
                            background: '#f0f0ff', padding: '0.15rem 0.35rem',
                            borderRadius: '4px', cursor: 'pointer',
                            wordBreak: 'break-all', lineHeight: 1.4,
                            display: 'flex', alignItems: 'center', gap: '0.25rem',
                          }}
                          title="Clique para editar"
                        >
                          <FiEdit2 size={10} style={{ flexShrink: 0 }} />
                          {indicador.formula}
                        </div>
                      )}

                      {indicador.descricao && (
                        <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: '0.1rem' }}>
                          {indicador.descricao}
                        </div>
                      )}

                      {indicador.colunasUsadas.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.15rem' }}>
                          {indicador.colunasUsadas.map(col => (
                            <span key={col} style={{
                              fontSize: '0.55rem', background: '#f1f5f9',
                              color: '#475569', padding: '0.05rem 0.3rem',
                              borderRadius: '3px',
                            }}>
                              {col}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Dica sobre edição */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.35rem',
          padding: '0.5rem 0.6rem', background: '#fefce8',
          border: '1px solid #fde047', borderRadius: '6px',
          fontSize: '0.7rem', color: '#854d0e', marginTop: '0.5rem',
        }}>
          <FiInfo size={14} />
          <span>
            Após aplicar, as fórmulas ficarão disponíveis na seção <strong>Indicadores</strong> do serviço,
            onde você poderá editá-las livremente.
          </span>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '0.75rem 1.25rem', borderTop: '1px solid #e2e8f0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '0.5rem', background: '#f8fafc',
      }}>
        <label style={{
          display: 'flex', alignItems: 'center', gap: '0.3rem',
          fontSize: '0.72rem', color: '#64748b', cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={substituir}
            onChange={e => setSubstituir(e.target.checked)}
            style={{ width: 14, height: 14 }}
          />
          Substituir indicadores existentes
        </label>

        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {onClose && (
            <button className="btn btn-secondary btn-sm" onClick={onClose}>
              Cancelar
            </button>
          )}
          <button
            className="btn btn-primary btn-sm"
            onClick={handleAplicar}
            disabled={aplicando}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.3rem',
              background: '#6366f1', color: '#fff', border: 'none',
              padding: '0.35rem 0.75rem', borderRadius: '6px',
              fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
              opacity: aplicando ? 0.7 : 1,
            }}
          >
            {aplicando ? <FiRefreshCw className="spin" size={13} /> : <FiCopy size={13} />}
            {aplicando ? 'Aplicando...' : `Aplicar ${totalIndicadores} indicadores`}
          </button>
        </div>
      </div>
    </div>
  );

  if (modo === 'modal') {
    return (
      <div style={containerStyle} onClick={onClose}>
        <div onClick={e => e.stopPropagation()}>
          {content}
        </div>
      </div>
    );
  }

  return content;
}
