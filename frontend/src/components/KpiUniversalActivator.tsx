/* ============================================
   KpiUniversalActivator — Modal de ativação de KPIs universais
   Exibido ao selecionar um tipo de serviço no cadastro/edição
   ============================================ */

import { useState, useEffect } from 'react';
import { FiX, FiCheck, FiInfo, FiAlertTriangle } from 'react-icons/fi';
import kpiUniversalService from '../services/kpiUniversalService';
import type { KpiUniversal } from '../services/kpiUniversalService';

interface Props {
  tipoServico: string;
  servicoId: string;
  servicoNome: string;
  token: string;
  onClose: () => void;
  onConfirm: (kpisAtivados: any[]) => void;
  /** IDs dos KPIs universais já ativos neste serviço (para pré-selecionar) */
  kpisJaAtivos?: string[];
}

type Etapa = 'pergunta' | 'selecao' | 'carregando' | 'resultado';

export default function KpiUniversalActivator({
  tipoServico,
  servicoId,
  servicoNome,
  token,
  onClose,
  onConfirm,
  kpisJaAtivos,
}: Props) {
  const [etapa, setEtapa] = useState<Etapa>('carregando');
  const [kpisDisponiveis, setKpisDisponiveis] = useState<KpiUniversal[]>([]);
  const [kpisSelecionados, setKpisSelecionados] = useState<Set<string>>(new Set());
  const [kpisAtivados, setKpisAtivados] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  // Labels legíveis dos tipos
  const tipoLabel: Record<string, string> = {
    coleta_caminhao: '🚛 Coleta com Caminhão',
    rocadeira: '🌿 Roçadeira',
    poda: '✂️ Poda',
    capina: '🧹 Capina',
    varricao: '🧹 Varrição',
    pintura_meio_fio: '🎨 Pintura Meio-Fio',
    remocao: '🚛 Remoção',
    geral: '📋 Geral',
  };

  useEffect(() => {
    carregarKpis();
  }, [tipoServico]);

  const carregarKpis = async () => {
    setCarregando(true);
    try {
      const data = await kpiUniversalService.listar(tipoServico);
      if (data.kpis.length === 0) {
        setErro(`Nenhum KPI universal cadastrado para ${tipoLabel[tipoServico] || tipoServico}.`);
        setEtapa('resultado');
      } else {
        setKpisDisponiveis(data.kpis);
        // Pré-seleciona KPIs já ativos (ou todos se for primeira ativação)
        if (kpisJaAtivos && kpisJaAtivos.length > 0) {
          const jaAtivos = new Set(kpisJaAtivos);
          const selecionados = new Set(data.kpis.filter(k => jaAtivos.has(k.id)).map(k => k.id));
          // Se nenhum KPI dos já ativos foi encontrado, seleciona todos
          if (selecionados.size === 0) {
            setKpisSelecionados(new Set(data.kpis.map(k => k.id)));
          } else {
            setKpisSelecionados(selecionados);
          }
        } else {
          setKpisSelecionados(new Set(data.kpis.map(k => k.id)));
        }
        setEtapa('pergunta');
      }
    } catch {
      setErro('Erro ao carregar KPIs universais');
      setEtapa('resultado');
    } finally {
      setCarregando(false);
    }
  };

  const toggleKpi = (id: string) => {
    setKpisSelecionados(prev => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  };

  const handleSelecionarTodos = () => {
    setKpisSelecionados(new Set(kpisDisponiveis.map(k => k.id)));
  };

  const handleLimparSelecao = () => {
    setKpisSelecionados(new Set());
  };

  const handleAtivar = async () => {
    if (kpisSelecionados.size === 0) return;

    setCarregando(true);
    setEtapa('carregando');
    try {
      const result = await kpiUniversalService.ativarMultiplos(
        servicoId,
        Array.from(kpisSelecionados)
      );
      setKpisAtivados(result.kpis);
      setEtapa('resultado');
    } catch {
      setErro('Erro ao ativar KPIs universais');
      setEtapa('resultado');
    } finally {
      setCarregando(false);
    }
  };

  // Etapa de carregamento inicial
  if (etapa === 'carregando') {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
          <div className="modal-header">
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Carregando KPIs Universais...</h3>
            <button className="btn-ghost" onClick={onClose}><FiX size={18} /></button>
          </div>
          <div className="modal-body" style={{ textAlign: 'center', padding: '2rem' }}>
            <div className="skeleton" style={{ height: '20px', width: '80%', margin: '0 auto 1rem' }} />
            <div className="skeleton" style={{ height: '20px', width: '60%', margin: '0 auto 1rem' }} />
            <div className="skeleton" style={{ height: '20px', width: '70%', margin: '0 auto' }} />
          </div>
        </div>
      </div>
    );
  }

  // Etapa de pergunta
  if (etapa === 'pergunta') {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
          <div className="modal-header">
            <h3 style={{ margin: 0, fontSize: '1rem' }}>
              🎯 Carregar KPIs Universais?
            </h3>
            <button className="btn-ghost" onClick={onClose}><FiX size={18} /></button>
          </div>
          <div className="modal-body" style={{ padding: '1.25rem' }}>
            <p style={{ fontSize: '0.88rem', color: '#475569', marginBottom: '1rem' }}>
              {kpisJaAtivos && kpisJaAtivos.length > 0
                ? <>Gerenciar KPIs universais para <strong>{tipoLabel[tipoServico] || tipoServico}</strong>?</>
                : <>Deseja pré-carregar os KPIs universais para <strong>{tipoLabel[tipoServico] || tipoServico}</strong>?</>}
              <br />
              {kpisDisponiveis.length} KPI(s) disponível(is) para este tipo de serviço.
              {kpisJaAtivos && kpisJaAtivos.length > 0 && (
                <> · <strong style={{ color: '#15803d' }}>{kpisJaAtivos.length} já ativo(s)</strong></>
              )}
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button
                className="btn btn-primary"
                onClick={() => setEtapa('selecao')}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
              >
                <FiCheck size={14} /> Escolher Quais
              </button>
              <button
                className="btn btn-success"
                onClick={async () => {
                  setKpisSelecionados(new Set(kpisDisponiveis.map(k => k.id)));
                  await handleAtivar();
                }}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}
              >
                <FiCheck size={14} /> Carregar Todos
              </button>
            </div>

            <button
              className="btn btn-ghost"
              onClick={onClose}
              style={{ width: '100%', color: '#64748b' }}
            >
              {kpisJaAtivos && kpisJaAtivos.length > 0 ? 'Manter seleção atual' : 'Não, começar sem KPIs'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Etapa de seleção
  if (etapa === 'selecao') {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
          <div className="modal-header">
            <h3 style={{ margin: 0, fontSize: '1rem' }}>
              Selecionar KPIs — {tipoLabel[tipoServico] || tipoServico}
            </h3>
            <button className="btn-ghost" onClick={onClose}><FiX size={18} /></button>
          </div>
          <div className="modal-body" style={{ padding: '0.75rem 1.25rem', overflow: 'auto', flex: 1 }}>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <button className="btn btn-sm" onClick={handleSelecionarTodos} style={{ background: '#e0e7ff', border: 'none', borderRadius: '4px', padding: '0.25rem 0.5rem', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 600, color: '#4338ca' }}>
                Selecionar Todos
              </button>
              <button className="btn btn-sm" onClick={handleLimparSelecao} style={{ background: '#f1f5f9', border: 'none', borderRadius: '4px', padding: '0.25rem 0.5rem', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 600, color: '#64748b' }}>
                Limpar
              </button>
              <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center' }}>
                {kpisSelecionados.size} de {kpisDisponiveis.length} selecionados
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {kpisDisponiveis.map(kpi => (
                <label
                  key={kpi.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.6rem',
                    padding: '0.7rem 0.75rem',
                    borderRadius: '8px',
                    border: `2px solid ${kpisSelecionados.has(kpi.id) ? kpi.cor : '#e2e8f0'}`,
                    background: kpisSelecionados.has(kpi.id) ? '#f8fafc' : 'white',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={kpisSelecionados.has(kpi.id)}
                    onChange={() => toggleKpi(kpi.id)}
                    style={{ marginTop: '0.2rem', accentColor: kpi.cor }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.15rem' }}>
                      <span style={{
                        display: 'inline-block',
                        width: '10px',
                        height: '10px',
                        borderRadius: '3px',
                        background: kpi.cor,
                      }} />
                      <strong style={{ fontSize: '0.85rem', color: '#1e293b' }}>{kpi.label}</strong>
                      {kpi.unidade && (
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8', background: '#f1f5f9', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>
                          {kpi.unidade}
                        </span>
                      )}
                      <span style={{
                        fontSize: '0.65rem',
                        padding: '0.1rem 0.35rem',
                        borderRadius: '3px',
                        background: '#f1f5f9',
                        color: '#64748b',
                        textTransform: 'uppercase',
                        fontWeight: 600,
                      }}>
                        {kpi.categoria}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      <code style={{ background: '#f1f5f9', padding: '0.1rem 0.3rem', borderRadius: '3px', fontSize: '0.72rem' }}>
                        {kpi.formula}
                      </code>
                    </div>
                    {kpi.descricao && (
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                        <FiInfo size={11} style={{ marginRight: '0.2rem', verticalAlign: 'middle' }} />
                        {kpi.descricao}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="modal-footer" style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: '0.82rem' }}>
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              onClick={handleAtivar}
              disabled={kpisSelecionados.size === 0 || carregando}
              style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
            >
              {carregando ? 'Ativando...' : `Ativar ${kpisSelecionados.size} KPI(s)`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Etapa de resultado
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: '1rem' }}>
            {erro ? '⚠️ Erro' : '✅ KPIs Ativados!'}
          </h3>
          <button className="btn-ghost" onClick={onClose}><FiX size={18} /></button>
        </div>
        <div className="modal-body" style={{ padding: '1.25rem' }}>
          {erro ? (
            <p style={{ color: '#dc2626', fontSize: '0.88rem' }}>{erro}</p>
          ) : (
            <>
              <p style={{ fontSize: '0.88rem', color: '#475569', marginBottom: '0.75rem' }}>
                {kpisAtivados.length} KPI(s) universal(is) ativado(s) em <strong>{servicoNome}</strong>.
              </p>

              {kpisAtivados.filter(k => k.placeholdersNaoResolvidos?.length > 0).length > 0 && (
                <div style={{
                  background: '#fef3c7',
                  border: '1px solid #f59e0b',
                  borderRadius: '6px',
                  padding: '0.6rem 0.75rem',
                  marginBottom: '0.75rem',
                  fontSize: '0.78rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.4rem',
                }}>
                  <FiAlertTriangle size={14} style={{ color: '#d97706', flexShrink: 0, marginTop: '0.1rem' }} />
                  <div>
                    <strong style={{ color: '#92400e' }}>Placeholders não resolvidos:</strong>
                    <span style={{ color: '#92400e' }}>
                      {' '}Alguns KPIs têm placeholders que não foram encontrados nas colunas da planilha.
                      Você pode ajustá-los manualmente no editor de indicadores.
                    </span>
                  </div>
                </div>
              )}

              <div style={{ maxHeight: '250px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {kpisAtivados.map((kpi, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.35rem 0.5rem',
                    background: kpi.placeholdersNaoResolvidos?.length ? '#fffbeb' : '#f0fdf4',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                  }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '2px',
                      background: kpi.cor || '#6366f1',
                      flexShrink: 0,
                    }} />
                    <span style={{ flex: 1, color: '#1e293b' }}>{kpi.label}</span>
                    {kpi.placeholdersNaoResolvidos?.length > 0 && (
                      <span style={{ fontSize: '0.68rem', color: '#d97706', background: '#fef3c7', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>
                        ⚠️ {kpi.placeholdersNaoResolvidos.length} placeholder(s)
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="modal-footer" style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-primary"
            onClick={() => {
              onConfirm(kpisAtivados);
              onClose();
            }}
            style={{ fontSize: '0.82rem' }}
          >
            {erro ? 'Fechar' : 'Ir para Indicadores'}
          </button>
        </div>
      </div>
    </div>
  );
}
