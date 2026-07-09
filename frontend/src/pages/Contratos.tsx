import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiPlus, FiEdit2, FiSave, FiAlertCircle, FiArrowRight, FiTrash2,
  FiCheckCircle, FiAlertTriangle, FiBarChart2, FiDatabase, FiClock, FiRefreshCw,
} from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import contractService, { type ContratoSaude } from '../services/contractService';
import { TIPOS_SERVICO_LABELS } from '../types';
import '../styles/Contratos.css';

interface FormData {
  numeroContrato: string;
  diaInicioCiclo: number;
}

const formVazio: FormData = {
  numeroContrato: '',
  diaInicioCiclo: 1,
};

export default function Contratos() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { adicionarToast } = useToast();

  const [contratos, setContratos] = useState<ContratoSaude[]>([]);
  const [carregando, setCarregando] = useState(false);

  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(formVazio);
  const [salvando, setSalvando] = useState(false);

  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  const carregarContratos = useCallback(async () => {
    setCarregando(true);
    try {
      const lista = await contractService.listarSaude();
      setContratos(lista);
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      adicionarToast(msg || 'Erro ao carregar contratos', 'error');
    } finally {
      setCarregando(false);
    }
  }, [adicionarToast]);

  useEffect(() => {
    carregarContratos();
  }, [carregarContratos]);

  function formatarUltimoUpload(data: string | null): string {
    if (!data) return 'Nunca';
    const d = new Date(data);
    const agora = new Date();
    const diffMs = agora.getTime() - d.getTime();
    const diffHoras = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHoras < 1) return 'Agora mesmo';
    if (diffHoras < 24) return 'Há ' + diffHoras + 'h';
    const diffDias = Math.floor(diffHoras / 24);
    if (diffDias < 7) return 'Há ' + diffDias + 'd';
    return d.toLocaleDateString('pt-BR');
  }

  function estaDesatualizado(data: string | null): boolean {
    if (!data) return true;
    return Date.now() - new Date(data).getTime() > 7 * 24 * 60 * 60 * 1000;
  }

  /** Cor e rótulo do status de saúde */
  function statusSaudeData(saude: string): { cor: string; bg: string; label: string; } {
    switch (saude) {
      case 'green':
        return { cor: '#22c55e', bg: '#f0fdf4', label: 'Saudável' };
      case 'yellow':
        return { cor: '#f59e0b', bg: '#fefce8', label: 'Atenção' };
      case 'red':
        return { cor: '#ef4444', bg: '#fef2f2', label: 'Crítico' };
      default:
        return { cor: '#94a3b8', bg: '#f8fafc', label: 'N/D' };
    }
  }

  const abrirModalNovo = () => {
    setEditandoId(null);
    setForm(formVazio);
    setModalAberto(true);
  };

  const abrirModalEditar = (contrato: ContratoSaude) => {
    setEditandoId(contrato.id);
    setForm({
      numeroContrato: contrato.numeroContrato,
      diaInicioCiclo: contrato.diaInicioCiclo ?? 1,
    });
    setModalAberto(true);
  };

  const fecharModal = () => {
    setModalAberto(false);
    setEditandoId(null);
    setForm(formVazio);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: name === 'diaInicioCiclo' ? Number(value) : value,
    }));
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      adicionarToast('Sessão expirada. Faça login novamente.', 'warning');
      navigate('/login');
      return;
    }
    if (!form.numeroContrato.trim()) {
      adicionarToast('Nome do contrato é obrigatório', 'warning');
      return;
    }
    setSalvando(true);
    try {
      const body = {
        numeroContrato: form.numeroContrato.trim(),
        diaInicioCiclo: form.diaInicioCiclo,
      };
      if (editandoId) {
        await contractService.atualizar(editandoId, body);
        adicionarToast('Contrato atualizado!', 'success');
      } else {
        await contractService.criar(body);
        adicionarToast('Contrato cadastrado!', 'success');
      }
      fecharModal();
      await carregarContratos();
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      adicionarToast(msg || 'Erro ao salvar contrato', 'error');
    } finally {
      setSalvando(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!excluindoId) return;
    try {
      await contractService.excluir(excluindoId);
      adicionarToast('Contrato excluído!', 'success');
      setExcluindoId(null);
      await carregarContratos();
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      adicionarToast(msg || 'Erro ao excluir contrato', 'error');
    }
  };

  const totalServicos = contratos.reduce((s, c) => s + c.totalServicos, 0);
  const totalRegistros = contratos.reduce((s, c) => s + c.totalRegistros, 0);
  const totalKpis = contratos.reduce((s, c) => s + c.totalKpisAtivos, 0);
  const contratosComProblemas = contratos.filter(c => c.statusSaude !== 'green').length;

  return (
    <div className="contratos-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.15rem' }}>
        <h2 style={{ margin: 0 }}>Meus Contratos</h2>
        <button className="btn btn-sm btn-ghost" onClick={carregarContratos} title="Recarregar">
          <FiRefreshCw size={13} />
        </button>
      </div>
      <p className="subtitle">Gerencie seus contratos e serviços</p>

      {/* ═══ KPIs do topo ═══ */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: '0.75rem', marginBottom: '1.25rem',
      }}>
        <div style={{
          background: '#fff', borderRadius: '8px', padding: '0.65rem 0.85rem',
          border: '1px solid #e2e8f0', borderTop: '3px solid #22c55e',
        }}>
          <div style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
            Contratos
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>{contratos.length}</div>
        </div>
        <div style={{
          background: '#fff', borderRadius: '8px', padding: '0.65rem 0.85rem',
          border: '1px solid #e2e8f0', borderTop: '3px solid #14b8a6',
        }}>
          <div style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
            Serviços
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>{totalServicos}</div>
        </div>
        <div style={{
          background: '#fff', borderRadius: '8px', padding: '0.65rem 0.85rem',
          border: '1px solid #e2e8f0', borderTop: '3px solid #f59e0b',
        }}>
          <div style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
            Registros
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>{totalRegistros.toLocaleString('pt-BR')}</div>
        </div>
        <div style={{
          background: '#fff', borderRadius: '8px', padding: '0.65rem 0.85rem',
          border: '1px solid #e2e8f0', borderTop: '3px solid #8b5cf6',
        }}>
          <div style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
            KPIs Ativos
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>{totalKpis}</div>
        </div>
      </div>

      {/* ═══ Alerta de contratos com problemas ═══ */}
      {contratosComProblemas > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.55rem 0.85rem', borderRadius: '8px',
          background: '#fefce8', border: '1px solid #fde68a',
          fontSize: '0.78rem', color: '#92400e', fontWeight: 500,
          marginBottom: '1rem',
        }}>
          <FiAlertTriangle size={15} style={{ color: '#f59e0b', flexShrink: 0 }} />
          <span>{contratosComProblemas} contrato(s) com serviços sem KPIs configurados ou desatualizados</span>
        </div>
      )}

      {/* ═══ Header ═══ */}
      <div className="contratos-header">
        <div style={{ flex: 1 }} />
        <button className="btn-novo-contrato" onClick={abrirModalNovo}>
          <FiPlus size={16} /> Novo Contrato
        </button>
      </div>

      {/* ═══ Tabela ═══ */}
      {carregando ? (
        <p className="carregando-state">Carregando contratos...</p>
      ) : contratos.length === 0 ? (
        <p className="empty-state">
          Nenhum contrato cadastrado.
          <br />
          <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
            Clique em "Novo Contrato" para começar.
          </span>
        </p>
      ) : (
        <table className="tabela-contratos">
          <thead>
            <tr>
              <th style={{ width: '24px' }}></th>
              <th>Contrato</th>
              <th>Status</th>
              <th>Tipos</th>
              <th>Serviços</th>
              <th>Registros</th>
              <th>KPIs</th>
              <th>Último Upload</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {contratos.map(contrato => {
              const sd = statusSaudeData(contrato.statusSaude);
              const desatualizado = estaDesatualizado(contrato.ultimoUpload);

              return (
                <tr
                  key={contrato.id}
                  className="contrato-row-clickable"
                  onClick={() => navigate('/contratos/' + contrato.id)}
                  style={{ opacity: contrato.status === 'encerrado' ? 0.6 : 1 }}
                >
                  {/* ═══ Indicador de saúde ═══ */}
                  <td style={{ textAlign: 'center', padding: '0.5rem' }}>
                    <div style={{
                      width: '10px', height: '10px', borderRadius: '50%',
                      background: sd.cor, margin: '0 auto',
                      boxShadow: `0 0 6px ${sd.cor}44`,
                    }} title={sd.label} />
                  </td>

                  <td>
                    <strong>{contrato.numeroContrato}</strong>
                    {(contrato.diaInicioCiclo ?? 1) > 1 && (
                      <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '0.1rem' }}>
                        Medição dia {contrato.diaInicioCiclo}
                      </div>
                    )}
                  </td>

                  <td>
                    <span className={'status-badge ' + (contrato.status || 'ativo')}>
                      {contrato.status || 'ativo'}
                    </span>
                  </td>

                  {/* ═══ Badges de tipo ═══ */}
                  <td>
                    <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap' }}>
                      {contrato.tiposServico.slice(0, 3).map(t => (
                        <span key={t} style={{
                          fontSize: '0.58rem', fontWeight: 600,
                          padding: '0.05rem 0.3rem', borderRadius: '3px',
                          background: '#eef2ff', color: '#4338ca',
                          whiteSpace: 'nowrap',
                        }}>
                          {(TIPOS_SERVICO_LABELS as any)[t] || t}
                        </span>
                      ))}
                      {contrato.tiposServico.length > 3 && (
                        <span style={{ fontSize: '0.58rem', color: '#94a3b8' }}>
                          +{contrato.tiposServico.length - 3}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* ═══ Serviços ═══ */}
                  <td>
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>
                      {contrato.totalServicos}
                    </span>
                    {contrato.totalServicos > 0 && (
                      <span style={{
                        fontSize: '0.65rem',
                        color: contrato.servicosConfigurados < contrato.totalServicos ? '#f59e0b' : '#22c55e',
                        marginLeft: '0.3rem'
                      }}>
                        ({contrato.servicosConfigurados} config.)
                      </span>
                    )}
                  </td>

                  {/* ═══ Registros ═══ */}
                  <td>
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>
                      {contrato.totalRegistros.toLocaleString('pt-BR')}
                    </span>
                  </td>

                  {/* ═══ KPIs ═══ */}
                  <td>
                    <span style={{ fontWeight: 600, color: contrato.totalKpisAtivos > 0 ? '#8b5cf6' : '#94a3b8' }}>
                      {contrato.totalKpisAtivos > 0 ? contrato.totalKpisAtivos : '-'}
                    </span>
                  </td>

                  {/* ═══ Último Upload ═══ */}
                  <td>
                    <span style={{
                      fontSize: '0.75rem',
                      color: desatualizado ? '#f59e0b' : '#64748b',
                      display: 'flex', alignItems: 'center', gap: '0.2rem',
                    }}>
                      <FiClock size={10} />
                      {formatarUltimoUpload(contrato.ultimoUpload)}
                    </span>
                  </td>

                  {/* ═══ Ações ═══ */}
                  <td>
                    <button
                      className="acao-btn acao-btn-editar"
                      onClick={(e) => { e.stopPropagation(); abrirModalEditar(contrato); }}
                      title="Editar contrato"
                    >
                      <FiEdit2 size={13} />
                    </button>
                    {isAdmin && (
                      <button
                        className="acao-btn acao-btn-excluir"
                        onClick={(e) => { e.stopPropagation(); setExcluindoId(contrato.id); }}
                        title="Excluir contrato"
                      >
                        <FiTrash2 size={13} />
                      </button>
                    )}
                    <button
                      className="acao-btn acao-btn-dashboard"
                      onClick={(e) => { e.stopPropagation(); navigate('/contratos/' + contrato.id); }}
                      title="Ver detalhes do contrato"
                    >
                      <FiArrowRight size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* ═══ Modal Novo/Editar ═══ */}
      {modalAberto && (
        <div className="modal-overlay" onClick={fecharModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{editandoId ? 'Editar Contrato' : 'Novo Contrato'}</h3>
            <form onSubmit={handleSalvar} className="modal-form">
              <div className="form-group">
                <label htmlFor="numeroContrato">Nome do Contrato</label>
                <input
                  id="numeroContrato" name="numeroContrato" type="text"
                  value={form.numeroContrato} onChange={handleChange}
                  placeholder="Ex: Contrato Prefeitura SP"
                  required autoFocus disabled={salvando}
                />
              </div>
              <div className="form-group">
                <label htmlFor="diaInicioCiclo">Dia de início da medição mensal</label>
                <select
                  id="diaInicioCiclo"
                  name="diaInicioCiclo"
                  value={form.diaInicioCiclo}
                  onChange={handleChange}
                  disabled={salvando}
                >
                  <option value={1}>Dia 1 (mês civil)</option>
                  {Array.from({ length: 27 }, (_, i) => i + 2).map(d => (
                    <option key={d} value={d}>Dia {d}</option>
                  ))}
                </select>
                <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.25rem', display: 'block' }}>
                  Ex.: dia 25 = medição de 25 do mês anterior até 24 do mês de referência.
                </span>
              </div>
              <div className="modal-actions">
                <button type="submit" disabled={salvando} className="btn-salvar">
                  <FiSave size={15} /> {salvando ? 'Salvando...' : 'Salvar'}
                </button>
                <button type="button" onClick={fecharModal} className="btn-cancelar">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ Modal Excluir ═══ */}
      {excluindoId !== null && (
        <div className="modal-overlay" onClick={() => setExcluindoId(null)}>
          <div className="modal-excluir" onClick={e => e.stopPropagation()}>
            <FiAlertCircle size={40} color="#ef4444" />
            <h3>Excluir contrato?</h3>
            <p>Esta ação não pode ser desfeita.</p>
            <div className="modal-excluir-acoes">
              <button className="btn-cancelar" onClick={() => setExcluindoId(null)}>Cancelar</button>
              <button className="btn-confirmar-excluir" onClick={confirmarExclusao}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
