/* ============================================
   BibliotecaGraficosPadrao — Tela completa de administração
   da biblioteca de gráficos padrão
   Fluxo: Seleção de Tipo de Serviço → Listagem de Gráficos do tipo
   URL: /graficos-padrao
   ============================================ */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiPlus, FiEdit2, FiTrash2, FiArrowLeft,
  FiSearch, FiToggleLeft, FiToggleRight,
  FiBarChart2, FiStar, FiGrid, FiSave, FiX,
  FiCheck, FiPower, FiRefreshCw,
} from 'react-icons/fi';
import { useToast } from '../contexts/ToastContext';
import graficosPadraoService from '../services/graficosPadraoService';
import type { GraficoPadraoConfig } from '../services/graficosPadraoService';
import { TIPOS_SERVICO_LABELS, TIPOS_SERVICO_META } from '../types';
import '../styles/ContratoDetalhe.css';

// ─── Helpers ───

function getTipoLabel(tipo: string): string {
  return (TIPOS_SERVICO_LABELS as any)[tipo] || tipo;
}

function getTipoCor(tipo: string): string {
  const cores: Record<string, string> = {
    coleta_caminhao: '#6366f1',
    rocadeira: '#22c55e',
    poda: '#f59e0b',
    capina: '#14b8a6',
    varricao: '#8b5cf6',
    pintura_meio_fio: '#ec4899',
    remocao: '#f97316',
    geral: '#64748b',
  };
  return cores[tipo] || '#6366f1';
}

const ESTILOS_GRAFICO: Record<string, { bg: string; icon: string; label: string }> = {
  barra: { bg: '#eff6ff', icon: '📊', label: 'Barras' },
  linha: { bg: '#f0fdf4', icon: '📈', label: 'Linha' },
  pizza: { bg: '#fefce8', icon: '🥧', label: 'Pizza' },
  area: { bg: '#f5f3ff', icon: '🗺️', label: 'Área' },
  donut: { bg: '#fdf2f8', icon: '🍩', label: 'Donut' },
};

const TIPOS_GRAFICO = ['barra', 'linha', 'pizza', 'area', 'donut'] as const;

export default function BibliotecaGraficosPadrao() {
  const navigate = useNavigate();
  const { adicionarToast } = useToast();

  // ─── Estado de navegação entre telas ───
  const [tipoSelecionado, setTipoSelecionado] = useState<string | null>(null);

  // ─── Estado dos gráficos ───
  const [graficos, setGraficos] = useState<GraficoPadraoConfig[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');

  // ─── Estado dos tipos (tela inicial) ───
  const [tiposComGraficos, setTiposComGraficos] = useState<{ tipo: string; total: number; ativos: number }[]>([]);
  const [carregandoTipos, setCarregandoTipos] = useState(true);

  // ─── Estado do formulário ───
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [confirmarExcluir, setConfirmarExcluir] = useState<string | null>(null);
  const [toggleGraficoId, setToggleGraficoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [form, setForm] = useState({
    titulo: '',
    tipo: 'barra' as string,
    placeholderEixoX: '',
    placeholderEixoY: '',
    descricao: '',
    categoria: 'Operacional',
    cor: '#6366f1',
    ordem: 99,
    isContagem: false,
    tipoServico: 'coleta_caminhao',
  });

  // ─── Carregamento dos tipos (tela inicial) ───
  const carregarTipos = useCallback(async () => {
    setCarregandoTipos(true);
    try {
      const data = await graficosPadraoService.listarBiblioteca();
      // Calcular contagem por tipo a partir dos dados agrupados
      if (data.agrupados) {
        const tipos: { tipo: string; total: number; ativos: number }[] = [];
        for (const [tipo, graficos] of Object.entries(data.agrupados)) {
          tipos.push({
            tipo,
            total: graficos.length,
            ativos: graficos.filter(g => g.ativo).length,
          });
        }
        setTiposComGraficos(tipos);
      }
    } catch {
      adicionarToast('Erro ao carregar tipos de serviço', 'error');
    } finally {
      setCarregandoTipos(false);
    }
  }, [adicionarToast]);

  // ─── Carregamento dos gráficos (tela de listagem) ───
  const carregarGraficos = useCallback(async (tipo?: string) => {
    setCarregando(true);
    try {
      const data = await graficosPadraoService.listarBiblioteca(
        tipo === '__todos__' ? undefined : (tipo ?? undefined)
      );
      setGraficos(data.graficos);
    } catch {
      adicionarToast('Erro ao carregar gráficos', 'error');
    } finally {
      setCarregando(false);
    }
  }, [adicionarToast]);

  // Carrega tipos ao montar
  useEffect(() => {
    carregarTipos();
  }, [carregarTipos]);

  // Carrega gráficos quando seleciona um tipo
  useEffect(() => {
    if (tipoSelecionado !== null) {
      carregarGraficos(tipoSelecionado);
    } else {
      setGraficos([]);
    }
  }, [tipoSelecionado, carregarGraficos]);

  // ─── Toggle ativo/inativo ───
  const handleToggleGrafico = useCallback(async (graficoId: string, ativo: boolean) => {
    setToggleGraficoId(graficoId);
    try {
      await graficosPadraoService.toggleAtivo(graficoId, ativo);
      adicionarToast(ativo ? 'Gráfico ativado' : 'Gráfico desativado', 'success');
      setGraficos(prev =>
        prev.map(g => g.id === graficoId ? { ...g, ativo } : g)
      );
      // Atualiza contagem dos tipos
      carregarTipos();
    } catch {
      adicionarToast('Erro ao alterar status', 'error');
    } finally {
      setToggleGraficoId(null);
    }
  }, [adicionarToast, carregarTipos]);

  // ─── Ações ───
  const handleExcluir = async (id: string) => {
    try {
      await graficosPadraoService.excluir(id);
      adicionarToast('Gráfico personalizado removido', 'success');
      setConfirmarExcluir(null);
      carregarGraficos(tipoSelecionado === '__todos__' ? undefined : (tipoSelecionado ?? undefined));
      carregarTipos();
    } catch {
      adicionarToast('Erro ao remover gráfico', 'error');
    }
  };

  const handleEditar = (grafico: GraficoPadraoConfig) => {
    setEditandoId(grafico.id);
    setForm({
      titulo: grafico.titulo,
      tipo: grafico.tipo,
      placeholderEixoX: (grafico.placeholderEixoX || []).join(', '),
      placeholderEixoY: (grafico.placeholderEixoY || []).join(', '),
      descricao: grafico.descricao || '',
      categoria: grafico.categoria,
      cor: grafico.cor,
      ordem: grafico.ordem,
      isContagem: grafico.isContagem,
      tipoServico: grafico.tipoServico,
    });
    setMostrarForm(true);
  };

  const handleNovo = () => {
    setEditandoId(null);
    setForm({
      titulo: '',
      tipo: 'barra',
      placeholderEixoX: '',
      placeholderEixoY: '',
      descricao: '',
      categoria: 'Operacional',
      cor: '#6366f1',
      ordem: 99,
      isContagem: false,
      tipoServico: tipoSelecionado && tipoSelecionado !== '__todos__' ? tipoSelecionado : 'coleta_caminhao',
    });
    setMostrarForm(true);
  };

  const handleSalvar = async () => {
    if (!form.titulo) {
      adicionarToast('Preencha o título do gráfico', 'warning');
      return;
    }

    setSalvando(true);
    const eixoX = form.placeholderEixoX.split(',').map(s => s.trim()).filter(Boolean);
    const eixoY = form.placeholderEixoY.split(',').map(s => s.trim()).filter(Boolean);

    try {
      if (editandoId) {
        await graficosPadraoService.atualizarConfig(editandoId, {
          titulo: form.titulo,
          tipo: form.tipo as any,
          placeholderEixoX: eixoX,
          placeholderEixoY: eixoY,
          descricao: form.descricao || null,
          categoria: form.categoria,
          cor: form.cor,
          ordem: form.ordem,
          isContagem: form.isContagem,
        } as any);
        adicionarToast('Gráfico atualizado na biblioteca!', 'success');
      } else {
        // Criar gráfico personalizado na biblioteca
        await graficosPadraoService.salvarComoPadrao({
          tipoServico: form.tipoServico,
          titulo: form.titulo,
          tipo: form.tipo,
          placeholderEixoX: eixoX,
          placeholderEixoY: eixoY,
          descricao: form.descricao,
          categoria: form.categoria,
          cor: form.cor,
        });
        adicionarToast('Gráfico personalizado criado na biblioteca!', 'success');
      }
      setMostrarForm(false);
      setEditandoId(null);
      carregarGraficos(tipoSelecionado === '__todos__' ? undefined : (tipoSelecionado ?? undefined));
      carregarTipos();
    } catch {
      adicionarToast('Erro ao salvar gráfico', 'error');
    } finally {
      setSalvando(false);
    }
  };

  // ─── Bulk actions ───
  const handleAtivarTodos = async () => {
    try {
      for (const g of graficos) {
        if (!g.ativo) {
          await graficosPadraoService.toggleAtivo(g.id, true);
        }
      }
      adicionarToast('Todos os gráficos ativados!', 'success');
      carregarGraficos(tipoSelecionado === '__todos__' ? undefined : (tipoSelecionado ?? undefined));
      carregarTipos();
    } catch {
      adicionarToast('Erro ao ativar todos', 'error');
    }
  };

  const handleDesativarTodos = async () => {
    try {
      for (const g of graficos) {
        if (g.ativo) {
          await graficosPadraoService.toggleAtivo(g.id, false);
        }
      }
      adicionarToast('Todos os gráficos desativados!', 'success');
      carregarGraficos(tipoSelecionado === '__todos__' ? undefined : (tipoSelecionado ?? undefined));
      carregarTipos();
    } catch {
      adicionarToast('Erro ao desativar todos', 'error');
    }
  };

  // ─── Gráficos filtrados pela busca ───
  const graficosFiltrados = useMemo(() => {
    if (!busca) return graficos;
    const termo = busca.toLowerCase();
    return graficos.filter(g =>
      g.titulo.toLowerCase().includes(termo) ||
      g.descricao?.toLowerCase().includes(termo) ||
      g.categoria?.toLowerCase().includes(termo)
    );
  }, [graficos, busca]);

  const graficosAgrupados = useMemo(() => {
    return graficosFiltrados.reduce<Record<string, GraficoPadraoConfig[]>>((acc, g) => {
      const cat = g.categoria || 'Sem categoria';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(g);
      return acc;
    }, {});
  }, [graficosFiltrados]);

  const categoriasOrdenadas = useMemo(() =>
    Object.entries(graficosAgrupados).sort(([a], [b]) => a.localeCompare(b)),
    [graficosAgrupados]
  );

  const isTodos = tipoSelecionado === '__todos__';

  // ─── Tela de Seleção de Tipo ───
  function renderTelaSelecaoTipo() {
    const todosTipos = Object.keys(TIPOS_SERVICO_LABELS) as string[];
    const contagemMap = new Map(tiposComGraficos.map(t => [t.tipo, t]));
    const tiposRender = todosTipos.map(tipo => ({
      tipo,
      label: (TIPOS_SERVICO_LABELS as any)[tipo] || tipo,
      stats: contagemMap.get(tipo),
      descricao: (TIPOS_SERVICO_META as any)[tipo]?.descricao || '',
    }));

    const totalGeral = tiposComGraficos.reduce((acc, t) => acc + t.total, 0);
    const ativosGeral = tiposComGraficos.reduce((acc, t) => acc + t.ativos, 0);

    return (
      <div style={{ padding: '1.5rem 2rem', maxWidth: '960px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button className="btn btn-ghost" onClick={() => navigate(-1)}>
              <FiArrowLeft size={14} /> Voltar
            </button>
            <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b' }}>
              Biblioteca de Gráficos Padrão
            </h2>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{
              fontSize: '0.72rem', color: '#94a3b8', background: '#f1f5f9',
              padding: '0.3rem 0.6rem', borderRadius: '6px',
            }}>
              {totalGeral} gráfico(s) · {ativosGeral} ativo(s)
            </span>
          </div>
        </div>

        {/* Subtítulo */}
        <p style={{ color: '#64748b', fontSize: '0.88rem', marginBottom: '1.25rem' }}>
          Selecione um tipo de serviço para visualizar e gerenciar seus gráficos padrão.
          Ative ou desative gráficos individuais, edite configurações ou crie novos gráficos personalizados.
        </p>

        {/* Grid de tipos */}
        {carregandoTipos ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
            {[1,2,3,4].map(i => (
              <div key={i} className="skeleton" style={{ height: '120px', borderRadius: '10px' }} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
            {/* Card "Todos os tipos" */}
            <div
              onClick={() => setTipoSelecionado('__todos__')}
              style={{
                background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
                borderRadius: '10px', padding: '1rem',
                border: '2px dashed #d1d5db', cursor: 'pointer',
                transition: 'all 0.15s', display: 'flex', flexDirection: 'column', gap: '0.4rem',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.background = '#f5f3ff'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.background = '#f8fafc'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '8px',
                  background: '#e2e8f0', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '1.1rem',
                }}>
                  <FiGrid size={18} color="#64748b" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>
                    🔍 Ver Todos
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    {totalGeral} gráfico(s)
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.3 }}>
                Visualizar todos os gráficos de todos os tipos de serviço
              </div>
              {ativosGeral > 0 && (
                <div><span style={{
                  display: 'inline-block', background: '#ecfdf5', color: '#16a34a',
                  fontSize: '0.68rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '4px',
                }}>
                  {ativosGeral} ativo(s)
                </span></div>
              )}
            </div>

            {/* Cards de cada tipo */}
            {tiposRender.map(({ tipo, label, stats, descricao }) => (
              <div
                key={tipo}
                onClick={() => setTipoSelecionado(tipo)}
                style={{
                  background: 'white', borderRadius: '10px', padding: '1rem',
                  border: '1px solid #e2e8f0', cursor: 'pointer',
                  transition: 'all 0.15s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  display: 'flex', flexDirection: 'column', gap: '0.4rem',
                  opacity: stats ? 1 : 0.5,
                }}
                onMouseEnter={e => {
                  if (stats) {
                    e.currentTarget.style.borderColor = getTipoCor(tipo);
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#e2e8f0';
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '8px',
                    background: getTipoCor(tipo) + '15',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '1.1rem',
                  }}>
                    {label.split(' ')[0]}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>
                      {label}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                      {stats ? `${stats.total} gráfico(s)` : 'Sem gráficos'}
                    </div>
                  </div>
                </div>
                <div style={{
                  fontSize: '0.72rem', color: '#64748b', lineHeight: 1.3,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>
                  {descricao}
                </div>
                {stats && (
                  <div style={{ marginTop: '0.25rem', display: 'flex', gap: '0.4rem' }}>
                    {stats.total > 0 && (
                      <span style={{
                        display: 'inline-block', background: getTipoCor(tipo) + '12',
                        color: getTipoCor(tipo), fontSize: '0.68rem', fontWeight: 600,
                        padding: '0.15rem 0.5rem', borderRadius: '4px',
                      }}>
                        {stats.total} total
                      </span>
                    )}
                    {stats.ativos > 0 && (
                      <span style={{
                        display: 'inline-block', background: '#ecfdf5',
                        color: '#16a34a', fontSize: '0.68rem', fontWeight: 600,
                        padding: '0.15rem 0.5rem', borderRadius: '4px',
                      }}>
                        {stats.ativos} ativo(s)
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Tela de Listagem de Gráficos ───
  function renderTelaListagemGraficos() {
    const tipoLabel = isTodos
      ? '🔍 Todos os Tipos'
      : getTipoLabel(tipoSelecionado || '');

    const totalAtivos = graficos.filter(g => g.ativo).length;
    const totalInativos = graficos.filter(g => !g.ativo).length;

    return (
      <div style={{ padding: '1.5rem 2rem', maxWidth: '1100px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button className="btn btn-ghost" onClick={() => setTipoSelecionado(null)}>
              <FiArrowLeft size={14} /> Tipos
            </button>
            <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b' }}>
              {tipoLabel}
            </h2>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button className="btn btn-sm" onClick={handleDesativarTodos}
              disabled={totalInativos === graficos.length}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.25rem',
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px',
                padding: '0.35rem 0.6rem', fontSize: '0.7rem', fontWeight: 600,
                color: '#dc2626', cursor: 'pointer',
                opacity: totalInativos === graficos.length ? 0.5 : 1,
              }}
              title="Desativar todos"
            >
              <FiPower size={11} /> Desativar Todos
            </button>
            <button className="btn btn-sm" onClick={handleAtivarTodos}
              disabled={totalAtivos === graficos.length}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.25rem',
                background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px',
                padding: '0.35rem 0.6rem', fontSize: '0.7rem', fontWeight: 600,
                color: '#16a34a', cursor: 'pointer',
                opacity: totalAtivos === graficos.length ? 0.5 : 1,
              }}
              title="Ativar todos"
            >
              <FiCheck size={11} /> Ativar Todos
            </button>
            <button className="btn btn-primary" onClick={handleNovo}
              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem' }}>
              <FiPlus size={13} /> Novo Gráfico
            </button>
          </div>
        </div>

        {/* Resumo */}
        <div style={{
          display: 'flex', gap: '0.75rem', marginBottom: '1rem',
          alignItems: 'center', flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            <span style={{ fontWeight: 700, color: '#16a34a' }}>{totalAtivos}</span> ativo(s)
            <span style={{ margin: '0 0.4rem', color: '#cbd5e1' }}>·</span>
            <span style={{ fontWeight: 700, color: '#dc2626' }}>{totalInativos}</span> inativo(s)
            <span style={{ margin: '0 0.4rem', color: '#cbd5e1' }}>·</span>
            <span style={{ fontWeight: 700, color: '#1e293b' }}>{graficos.length}</span> total
          </div>
        </div>

        {/* Busca */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '350px' }}>
            <FiSearch size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Buscar gráfico por título, descrição ou categoria..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{
                width: '100%', padding: '0.45rem 0.45rem 0.45rem 2rem',
                border: '1px solid #e2e8f0', borderRadius: '6px',
                fontSize: '0.82rem', outline: 'none',
              }}
            />
          </div>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
            {graficosFiltrados.length} gráfico(s)
          </span>
        </div>

        {/* Lista de gráficos */}
        {carregando ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[1,2,3,4].map(i => (
              <div key={i} className="skeleton" style={{ height: '64px', borderRadius: '8px' }} />
            ))}
          </div>
        ) : graficosFiltrados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
            <FiBarChart2 size={40} style={{ opacity: 0.2, marginBottom: '0.75rem' }} />
            <h3 style={{ fontSize: '1rem', margin: '0 0 0.3rem' }}>
              Nenhum gráfico encontrado
            </h3>
            <p style={{ fontSize: '0.85rem', margin: 0 }}>
              {busca
                ? 'Nenhum gráfico corresponde à sua busca.'
                : `Nenhum gráfico cadastrado para este tipo.`}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {categoriasOrdenadas.map(([categoria, graficosDaCategoria]) => (
              <div key={categoria}>
                <h3 style={{
                  fontSize: '0.82rem', color: '#475569',
                  marginBottom: '0.4rem', marginTop: 0,
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                }}>
                  <span style={{
                    display: 'inline-block', width: '12px', height: '12px',
                    borderRadius: '3px', background: graficosDaCategoria[0]?.cor || '#6366f1',
                  }} />
                  {categoria}
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 400 }}>
                    ({graficosDaCategoria.length})
                  </span>
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {graficosDaCategoria.map(grafico => {
                    const estilo = ESTILOS_GRAFICO[grafico.tipo] || { bg: '#f1f5f9', icon: '📊', label: grafico.tipo };

                    return (
                      <div
                        key={grafico.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.65rem',
                          padding: '0.5rem 0.75rem',
                          background: grafico.ativo ? 'white' : '#f8fafc',
                          borderRadius: '8px',
                          border: `1px solid ${grafico.ativo ? '#e2e8f0' : '#f1f5f9'}`,
                          opacity: grafico.ativo ? 1 : 0.65,
                          transition: 'all 0.15s',
                        }}
                      >
                        {/* Ícone do tipo */}
                        <span style={{
                          fontSize: '1rem', width: '30px', height: '30px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: estilo.bg, borderRadius: '6px', flexShrink: 0,
                        }}>
                          {estilo.icon}
                        </span>

                        {/* Info principal */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '0.82rem', color: '#1e293b' }}>
                              {grafico.titulo}
                            </strong>
                            <span style={{
                              fontSize: '0.62rem', background: estilo.bg, color: '#475569',
                              padding: '0.08rem 0.3rem', borderRadius: '4px', fontWeight: 600,
                            }}>
                              {estilo.label}
                            </span>
                            {grafico.isPersonalizado && (
                              <span style={{
                                fontSize: '0.58rem', background: '#fefce8', color: '#b45309',
                                padding: '0.08rem 0.25rem', borderRadius: '4px', fontWeight: 600,
                                border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '2px',
                              }}>
                                <FiStar size={8} /> Personalizado
                              </span>
                            )}
                            {!isTodos && (
                              <span style={{
                                fontSize: '0.6rem', background: getTipoCor(grafico.tipoServico) + '12',
                                color: getTipoCor(grafico.tipoServico), padding: '0.08rem 0.3rem',
                                borderRadius: '4px', fontWeight: 600,
                              }}>
                                {getTipoLabel(grafico.tipoServico).replace(/^[^\s]+\s/, '').trim()}
                              </span>
                            )}
                          </div>
                          <div style={{
                            fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.1rem',
                            display: 'flex', gap: '0.5rem', flexWrap: 'wrap',
                          }}>
                            <span>X: <code style={{ background: '#f1f5f9', padding: '0.05rem 0.25rem', borderRadius: '3px', fontSize: '0.65rem' }}>
                              {(grafico.placeholderEixoX || []).join(', ')}
                            </code></span>
                            {(grafico.placeholderEixoY || []).length > 0 && (
                              <span>Y: <code style={{ background: '#f1f5f9', padding: '0.05rem 0.25rem', borderRadius: '3px', fontSize: '0.65rem' }}>
                                {(grafico.placeholderEixoY || []).join(', ')}
                              </code></span>
                            )}
                          </div>
                        </div>

                        {/* Ações */}
                        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', flexShrink: 0 }}>
                          {/* Toggle ativo/inativo */}
                          <button
                            onClick={() => handleToggleGrafico(grafico.id, !grafico.ativo)}
                            disabled={toggleGraficoId === grafico.id}
                            title={grafico.ativo ? 'Desativar' : 'Ativar'}
                            style={{
                              background: grafico.ativo ? '#ecfdf5' : '#f1f5f9',
                              border: `1px solid ${grafico.ativo ? '#86efac' : '#e2e8f0'}`,
                              borderRadius: '6px', padding: '0.3rem 0.5rem',
                              cursor: 'pointer', display: 'flex', alignItems: 'center',
                              gap: '0.2rem', color: grafico.ativo ? '#16a34a' : '#94a3b8',
                              fontSize: '0.68rem', fontWeight: 600, transition: 'all 0.15s',
                            }}
                          >
                            {toggleGraficoId === grafico.id ? (
                              <span style={{ fontSize: '0.65rem' }}>...</span>
                            ) : grafico.ativo ? (
                              <><FiToggleRight size={13} /> Ativo</>
                            ) : (
                              <><FiToggleLeft size={13} /> Inativo</>
                            )}
                          </button>

                          {/* Editar */}
                          <button
                            onClick={() => handleEditar(grafico)}
                            title="Editar configuração"
                            style={{
                              background: '#f1f5f9', border: 'none', borderRadius: '4px',
                              padding: '0.3rem 0.4rem', cursor: 'pointer', color: '#475569',
                              fontSize: '0.72rem',
                            }}
                          >
                            <FiEdit2 size={12} />
                          </button>

                          {/* Excluir (apenas personalizados) */}
                          {grafico.isPersonalizado && (
                            <>
                              {confirmarExcluir === grafico.id ? (
                                <div style={{ display: 'flex', gap: '0.2rem' }}>
                                  <button
                                    onClick={() => handleExcluir(grafico.id)}
                                    style={{
                                      background: '#dc2626', color: 'white', border: 'none',
                                      borderRadius: '4px', padding: '0.25rem 0.35rem',
                                      fontSize: '0.6rem', cursor: 'pointer', fontWeight: 600,
                                    }}
                                  >
                                    Confirmar
                                  </button>
                                  <button
                                    onClick={() => setConfirmarExcluir(null)}
                                    style={{
                                      background: '#e2e8f0', border: 'none', borderRadius: '4px',
                                      padding: '0.25rem 0.35rem', fontSize: '0.6rem', cursor: 'pointer',
                                    }}
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmarExcluir(grafico.id)}
                                  title="Remover da biblioteca"
                                  style={{
                                    background: '#fef2f2', border: 'none', borderRadius: '4px',
                                    padding: '0.3rem 0.4rem', cursor: 'pointer', color: '#dc2626',
                                    fontSize: '0.72rem',
                                  }}
                                >
                                  <FiTrash2 size={12} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Modal de Formulário ───
  function renderFormModal() {
    return (
      <div className="modal-backdrop" onClick={() => setMostrarForm(false)}>
        <div className="modal" onClick={e => e.stopPropagation()} style={{
          maxWidth: '600px', maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
        }}>
          <div className="modal-header">
            <h3 style={{ margin: 0, fontSize: '1rem' }}>
              <FiBarChart2 size={14} style={{ marginRight: '0.4rem' }} />
              {editandoId ? 'Editar Gráfico' : 'Novo Gráfico Personalizado'}
            </h3>
            <button
              className="btn-ghost"
              onClick={() => setMostrarForm(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '0.3rem', borderRadius: '4px' }}
            >
              <FiX size={16} />
            </button>
          </div>
          <div className="modal-body" style={{ padding: '1rem 1.25rem', overflow: 'auto', flex: 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              {/* Título */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>Título *</label>
                <input
                  type="text" value={form.titulo}
                  onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                  placeholder="Ex: Tonelagem por Veículo"
                  style={{
                    width: '100%', padding: '0.4rem 0.5rem',
                    border: '1px solid #e2e8f0', borderRadius: '6px',
                    fontSize: '0.82rem', marginTop: '0.2rem',
                  }}
                />
              </div>

              {/* Tipo de Serviço */}
              <div>
                <label style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>Tipo de Serviço</label>
                <select
                  value={form.tipoServico}
                  onChange={e => setForm(f => ({ ...f, tipoServico: e.target.value }))}
                  disabled={!!editandoId}
                  style={{
                    width: '100%', padding: '0.4rem 0.5rem',
                    border: '1px solid #e2e8f0', borderRadius: '6px',
                    fontSize: '0.82rem', marginTop: '0.2rem',
                    opacity: editandoId ? 0.6 : 1,
                  }}
                >
                  {Object.entries(TIPOS_SERVICO_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Tipo de Gráfico */}
              <div>
                <label style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>Tipo de Gráfico</label>
                <select
                  value={form.tipo}
                  onChange={e => setForm(f => ({ ...f, tipo: e.target.value, isContagem: ['pizza', 'donut'].includes(e.target.value) || f.isContagem }))}
                  style={{
                    width: '100%', padding: '0.4rem 0.5rem',
                    border: '1px solid #e2e8f0', borderRadius: '6px',
                    fontSize: '0.82rem', marginTop: '0.2rem',
                  }}
                >
                  {TIPOS_GRAFICO.map(t => {
                    const info = ESTILOS_GRAFICO[t];
                    return (
                      <option key={t} value={t}>
                        {info.icon} {info.label}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Categoria */}
              <div>
                <label style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>Categoria</label>
                <input
                  type="text" value={form.categoria}
                  onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                  placeholder="Ex: Operacional"
                  style={{
                    width: '100%', padding: '0.4rem 0.5rem',
                    border: '1px solid #e2e8f0', borderRadius: '6px',
                    fontSize: '0.82rem', marginTop: '0.2rem',
                  }}
                />
              </div>

              {/* Ordem */}
              <div>
                <label style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>Ordem</label>
                <input
                  type="number" value={form.ordem}
                  onChange={e => setForm(f => ({ ...f, ordem: Number(e.target.value) }))}
                  min={1} max={999}
                  style={{
                    width: '100%', padding: '0.4rem 0.5rem',
                    border: '1px solid #e2e8f0', borderRadius: '6px',
                    fontSize: '0.82rem', marginTop: '0.2rem',
                  }}
                />
              </div>

              {/* Cor */}
              <div>
                <label style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>Cor</label>
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem' }}>
                  <input
                    type="color" value={form.cor}
                    onChange={e => setForm(f => ({ ...f, cor: e.target.value }))}
                    style={{ width: '36px', height: '32px', padding: '2px', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer' }}
                  />
                  <input
                    type="text" value={form.cor}
                    onChange={e => setForm(f => ({ ...f, cor: e.target.value }))}
                    style={{ flex: 1, padding: '0.4rem 0.5rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.82rem' }}
                  />
                </div>
              </div>

              {/* Placeholder Eixo X */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>
                  Placeholders Eixo X (separados por vírgula)
                </label>
                <input
                  type="text" value={form.placeholderEixoX}
                  onChange={e => setForm(f => ({ ...f, placeholderEixoX: e.target.value }))}
                  placeholder="Ex: CAMINHAO, PLACA, VEICULO"
                  style={{
                    width: '100%', padding: '0.4rem 0.5rem',
                    border: '1px solid #e2e8f0', borderRadius: '6px',
                    fontSize: '0.82rem', fontFamily: 'monospace', marginTop: '0.2rem',
                  }}
                />
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                  Colunas candidatas para agrupar os dados no eixo X (em ordem de prioridade)
                </div>
              </div>

              {/* Placeholder Eixo Y */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>
                  Placeholders Eixo Y (separados por vírgula)
                </label>
                <input
                  type="text" value={form.placeholderEixoY}
                  onChange={e => setForm(f => ({ ...f, placeholderEixoY: e.target.value }))}
                  placeholder="Ex: PESO TOTAL, PESO, PESOTOTAL"
                  style={{
                    width: '100%', padding: '0.4rem 0.5rem',
                    border: '1px solid #e2e8f0', borderRadius: '6px',
                    fontSize: '0.82rem', fontFamily: 'monospace', marginTop: '0.2rem',
                  }}
                />
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                  Colunas candidatas para os valores no eixo Y (deixe vazio para gráficos de contagem)
                </div>
              </div>

              {/* É contagem? */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={form.isContagem}
                    onChange={e => setForm(f => ({ ...f, isContagem: e.target.checked }))}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  Gráfico de contagem (conta registros ao invés de somar valores)
                </label>
              </div>

              {/* Descrição */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>Descrição</label>
                <textarea
                  value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="Descreva o que este gráfico mostra..."
                  rows={2}
                  style={{
                    width: '100%', padding: '0.4rem 0.5rem',
                    border: '1px solid #e2e8f0', borderRadius: '6px',
                    fontSize: '0.82rem', marginTop: '0.2rem', resize: 'vertical',
                  }}
                />
              </div>
            </div>
          </div>
          <div className="modal-footer" style={{
            padding: '0.75rem 1.25rem', borderTop: '1px solid #e2e8f0',
            display: 'flex', gap: '0.5rem', justifyContent: 'flex-end',
          }}>
            <button
              className="btn btn-ghost"
              onClick={() => setMostrarForm(false)}
              style={{ fontSize: '0.82rem' }}
            >
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSalvar}
              disabled={salvando}
              style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
            >
              {salvando ? (
                <><FiRefreshCw size={12} className="spin" /> Salvando...</>
              ) : (
                <><FiSave size={12} /> {editandoId ? 'Atualizar' : 'Criar Gráfico'}</>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render principal ───
  return (
    <>
      {tipoSelecionado === null ? renderTelaSelecaoTipo() : renderTelaListagemGraficos()}
      {mostrarForm && renderFormModal()}

      {/* Estilos globais */}
      <style>{`
        .modal-backdrop {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.4);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000;
        }
        .modal {
          background: white; border-radius: 12px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.2);
          width: 90%; max-width: 560px;
        }
        .modal-header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 0.85rem 1.25rem; border-bottom: 1px solid #e2e8f0;
        }
        .modal-body { padding: 1rem 1.25rem; }
        .modal-footer {
          padding: 0.75rem 1.25rem; border-top: 1px solid #e2e8f0;
          display: flex; gap: 0.5rem; justify-content: flex-end;
        }
        .btn-ghost {
          background: none; border: none; cursor: pointer;
          color: #64748b; padding: 0.3rem; border-radius: 4px;
          display: flex; align-items: center;
        }
        .btn-ghost:hover { background: #f1f5f9; }
        .btn-primary {
          background: #6366f1; color: white; border: none;
          border-radius: 6px; padding: 0.45rem 0.85rem;
          font-weight: 600; cursor: pointer; font-size: 0.82rem;
        }
        .btn-primary:hover { background: #4f46e5; }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-sm { font-size: 0.75rem; padding: 0.3rem 0.5rem; border-radius: 5px; }
        .skeleton {
          background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
          background-size: 200% 100%; animation: shimmer 1.5s infinite;
          border-radius: 6px;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </>
  );
}
