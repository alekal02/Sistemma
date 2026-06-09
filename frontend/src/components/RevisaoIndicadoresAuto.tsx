/* ============================================
   RevisaoIndicadoresAuto — Tela de Revisão Pós-Upload
   Exibe indicadores e gráficos sugeridos automaticamente
   após o upload da planilha. Usuário confirma ou ajusta.
   ============================================ */

import { useState, useEffect, useMemo } from 'react';
import {
  FiCheck, FiX, FiBarChart2, FiPieChart, FiTrendingUp,
  FiInfo, FiRefreshCw, FiAlertCircle, FiCheckCircle,
} from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import type {
  KpiConfig, GraficoConfig, ColunaDetectada, PreviewState,
} from './KpiEditor/KpiEditorTypes';

// ─── Tipos Locais ───

interface IndicadorSugerido {
  coluna: string;
  operacao: string;
  nomeSugerido: string;
  formato: 'numero' | 'moeda' | 'porcentagem';
  categoria?: string;
  descricao?: string;
  expressao?: string;
  unidade?: string;
  financeiro?: boolean;
  performance?: boolean;
  cor?: string;
  _kpiConfig?: KpiConfig;
  _uid?: number;
}

interface GraficoSugeridoItem {
  tipo: 'barra' | 'linha' | 'pizza';
  titulo: string;
  eixoX: string;
  eixoY: string;
  descricao?: string;
  automatico: boolean;
}

interface AnaliseResponse {
  servicoId: string;
  servicoNome: string;
  totalRegistros: number;
  colunas: ColunaDetectada[];
  indicadoresSugeridos: IndicadorSugerido[];
  graficosSugeridos: GraficoSugeridoItem[];
  colunasOriginais: string[];
  indicadores: KpiConfig[];
  graficos: GraficoConfig[];
  geradoEm: string;
  temColunasNovas?: boolean;
  colunasRemovidas?: string[];
  colunasAdicionadas?: string[];
}

interface Props {
  contractId: string;
  servicoId: string;
  servicoNome: string;
  onConfirm: (indicadores: KpiConfig[], graficos: GraficoConfig[]) => void;
  onSkip: () => void;
  onBack: () => void;
}

const CORES_POR_CATEGORIA: Record<string, string> = {
  'Financeiro': '#059669',
  'Produtividade': '#3b82f6',
  'Operacional': '#f59e0b',
  'Custo': '#ef4444',
  'Qualidade': '#a855f7',
  'Eficiencia': '#14b8a6',
  'Outro': '#64748b',
};

const CATEGORIAS_ORDEM = ['Financeiro', 'Produtividade', 'Operacional', 'Eficiencia', 'Custo', 'Qualidade', 'Outro'];

function gerarFormula(ind: IndicadorSugerido): string {
  if (ind.expressao) return ind.expressao;
  const col = ind.coluna;
  const op = ind.operacao;
  switch (op) {
    case 'sum': return 'SUM(' + col + ')';
    case 'avg': return 'AVG(' + col + ')';
    case 'min': return 'MIN(' + col + ')';
    case 'max': return 'MAX(' + col + ')';
    case 'count': return 'COUNT(*)';
    case 'count_distinct': return 'COUNT DISTINCT(' + col + ')';
    case 'soma_horas': return 'SUM_HOURS(' + col + ')';
    case 'periodo': return 'DATE_RANGE(' + col + ')';
    default: return op.toUpperCase() + '(' + col + ')';
  }
}

export default function RevisaoIndicadoresAuto({ contractId, servicoId, servicoNome, onConfirm, onSkip, onBack }: Props) {
  const { token } = useAuth();
  const { adicionarToast } = useToast();

  const [analise, setAnalise] = useState<AnaliseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aceitos, setAceitos] = useState<Record<string, boolean>>({});
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [graficosSelecionados, setGraficosSelecionados] = useState<Record<string, boolean>>({});
  const [confirmando, setConfirmando] = useState(false);
  const [guiaAberta, setGuiaAberta] = useState<'indicadores' | 'graficos' | 'colunas'>('indicadores');

  // ═══ EDIÇÃO INLINE ═══
  const [editando, setEditando] = useState<string | null>(null);
  const [editDescricao, setEditDescricao] = useState('');
  const [editFormula, setEditFormula] = useState('');
  const [descricoesEditadas, setDescricoesEditadas] = useState<Record<string, string>>({});
  const [formulasEditadas, setFormulasEditadas] = useState<Record<string, string>>({});

  const todosIds = useMemo(() => {
    if (!analise) return [];
    return analise.indicadoresSugeridos.map(function(_, i) { return 'ind_' + i; });
  }, [analise]);

  const indicadoresPorCategoria = useMemo(function() {
    if (!analise) return new Map<string, number>();
    const mapa = new Map<string, number>();
    for (const ind of analise.indicadoresSugeridos) {
      const cat = ind.categoria || 'Outro';
      mapa.set(cat, (mapa.get(cat) || 0) + 1);
    }
    return mapa;
  }, [analise]);

  const carregarAnalise = async function() {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch('/api/contracts/' + contractId + '/servicos/' + servicoId + '/analisar-indicadores-automaticos', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Erro ao analisar');
      }

      const data: AnaliseResponse = await res.json();
      setAnalise(data);

      const aceitosIniciais: Record<string, boolean> = {};
      const excluidosIniciais = new Set<string>();
      const graficosIniciais: Record<string, boolean> = {};

      data.indicadoresSugeridos.forEach(function(_, i) {
        aceitosIniciais['ind_' + i] = true;
      });

      data.graficosSugeridos.forEach(function(_, i) {
        graficosIniciais['graf_' + i] = true;
      });

      setAceitos(aceitosIniciais);
      setExcluidos(excluidosIniciais);
      setGraficosSelecionados(graficosIniciais);

      if ((data as any).emCache) {
        adicionarToast('Análise recuperada do cache', 'info');
      }
    } catch (err: any) {
      setErro(err.message || 'Erro ao carregar analise');
      adicionarToast('Erro ao analisar indicadores', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(function() { carregarAnalise(); }, [contractId, servicoId]);

  const toggleIndicador = function(uid: string) {
    setAceitos(function(prev) {
      var next: Record<string, boolean> = {};
      for (var k in prev) next[k] = prev[k];
      next[uid] = !next[uid];
      return next;
    });
  };

  const toggleGrafico = function(uid: string) {
    setGraficosSelecionados(function(prev) {
      var next: Record<string, boolean> = {};
      for (var k in prev) next[k] = prev[k];
      next[uid] = !next[uid];
      return next;
    });
  };

  const totalAceitos = Object.values(aceitos).filter(Boolean).length;
  const totalGraficosSelecionados = Object.values(graficosSelecionados).filter(Boolean).length;
  const totalSugeridos = Object.keys(aceitos).length;
  const totalGraficosSugeridos = Object.keys(graficosSelecionados).length;

  const handleConfirmar = async function() {
    if (totalAceitos === 0 && totalGraficosSelecionados === 0) {
      adicionarToast('Selecione pelo menos um indicador ou grafico', 'warning');
      return;
    }

    setConfirmando(true);
    try {
      const indicadoresAceitos: KpiConfig[] = [];
      for (var uid in aceitos) {
        if (!aceitos[uid]) continue;
        var idx = parseInt(uid.replace('ind_', ''));
        var kpiConvertido = analise!.indicadores[idx];
        if (kpiConvertido) {
          if (descricoesEditadas[uid] !== undefined) {
            kpiConvertido.descricao = descricoesEditadas[uid];
          }
          if (formulasEditadas[uid] !== undefined) {
            kpiConvertido.expressao = formulasEditadas[uid];
          }
          indicadoresAceitos.push(kpiConvertido);
        }
      }

      const graficosAceitos: GraficoConfig[] = [];
      for (var uid2 in graficosSelecionados) {
        if (!graficosSelecionados[uid2]) continue;
        idx = parseInt(uid2.replace('graf_', ''));
        var grafico = analise!.graficos[idx];
        if (grafico) graficosAceitos.push(grafico);
      }

      if (indicadoresAceitos.length === 0 && graficosAceitos.length === 0) {
        adicionarToast('Selecione pelo menos um item', 'warning');
        return;
      }

      const res = await fetch('/api/contracts/' + contractId + '/servicos/' + servicoId + '/confirmar-indicadores-automaticos', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          indicadores: indicadoresAceitos,
          graficos: graficosAceitos,
        }),
      });

      if (!res.ok) throw new Error('Erro ao confirmar');

      const result = await res.json();
      adicionarToast(result.message || 'Indicadores confirmados!', 'success');
      onConfirm(indicadoresAceitos, graficosAceitos);
    } catch (err: any) {
      adicionarToast('Erro ao confirmar: ' + (err.message || ''), 'error');
    } finally {
      setConfirmando(false);
    }
  };

  // ─── Loading ───
  if (loading) {
    return (
      <div style={{ padding: '1rem' }}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <FiRefreshCw size={32} className="spin" style={{ color: '#22c55e', marginBottom: '0.75rem' }} />
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Analisando colunas e gerando indicadores...</p>
          <div className="skeleton-flow" style={{ maxWidth: '400px', margin: '1rem auto' }}>
            <div className="skeleton" style={{ height: 50 }} />
            <div className="skeleton" style={{ height: 50, marginTop: 6 }} />
            <div className="skeleton" style={{ height: 50, marginTop: 6 }} />
          </div>
        </div>
      </div>
    );
  }

  // ─── Erro ───
  if (erro) {
    return (
      <div style={{ padding: '1rem' }}>
        <div style={{ textAlign: 'center', padding: '2rem', background: '#fef2f2', borderRadius: '12px', border: '1px solid #fecaca' }}>
          <FiAlertCircle size={32} style={{ color: '#ef4444', marginBottom: '0.5rem' }} />
          <p style={{ color: '#991b1b', fontWeight: 600, fontSize: '0.9rem' }}>{erro}</p>
          <button className="btn btn-sm btn-primary" onClick={carregarAnalise} style={{ marginTop: '0.5rem' }}>
            <FiRefreshCw size={12} /> Tentar novamente
          </button>
          <button className="btn btn-sm btn-ghost" onClick={onSkip} style={{ marginLeft: '0.5rem' }}>
            Pular
          </button>
        </div>
      </div>
    );
  }

  if (!analise) return null;

  // ─── Agrupar indicadores por categoria ───
  const indicadoresPorCat = new Map<string, { uid: string; ind: IndicadorSugerido; idx: number }[]>();
  analise.indicadoresSugeridos.forEach(function(ind, idx) {
    const cat = ind.categoria || 'Outro';
    if (!indicadoresPorCat.has(cat)) indicadoresPorCat.set(cat, []);
    indicadoresPorCat.get(cat)!.push({ uid: 'ind_' + idx, ind: ind, idx: idx });
  });

  const categoriasOrdenadas = Array.from(indicadoresPorCat.keys()).sort(function(a, b) {
    const ia = CATEGORIAS_ORDEM.indexOf(a);
    const ib = CATEGORIAS_ORDEM.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return (
    <div className="revisao-auto" style={{ padding: '0.25rem' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <FiBarChart2 size={16} style={{ color: '#22c55e' }} />
            Indicadores Automaticos
          </h4>
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>
            {analise.totalRegistros.toLocaleString('pt-BR')} registros · {analise.colunas.length} colunas detectadas · gerado em {new Date(analise.geradoEm).toLocaleTimeString('pt-BR')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
          <button className="btn btn-sm btn-ghost" onClick={carregarAnalise} style={{ fontSize: '0.7rem' }}>
            <FiRefreshCw size={11} /> Reanalisar
          </button>
        </div>
      </div>

      {/* COLUNAS NOVAS */}
      {analise.temColunasNovas && (
        <div style={{ background: '#fefce8', border: '1px solid #fde047', borderRadius: '8px', padding: '0.5rem 0.75rem', marginBottom: '0.75rem', fontSize: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600, color: '#854d0e' }}>
            <FiInfo size={14} />
            Colunas detectadas neste upload
          </div>
          {analise.colunasAdicionadas && analise.colunasAdicionadas.length > 0 && (
            <div style={{ marginTop: '0.25rem', color: '#713f12' }}>
              + {analise.colunasAdicionadas.join(', ')}
            </div>
          )}
          {analise.colunasRemovidas && analise.colunasRemovidas.length > 0 && (
            <div style={{ marginTop: '0.15rem', color: '#991b1b' }}>
              - {analise.colunasRemovidas.join(', ')}
            </div>
          )}
        </div>
      )}

      {/* TABS */}
      <div className="config-tabs" style={{ marginBottom: '0.5rem' }}>
        <button className={'config-tab ' + (guiaAberta === 'indicadores' ? 'active' : '')}
          onClick={function() { setGuiaAberta('indicadores'); }}>
          <FiBarChart2 size={11} /> Indicadores
          <span className="indicator-badge" style={{ marginLeft: '0.3rem', background: totalAceitos > 0 ? '#22c55e' : '#e2e8f0', color: '#fff', borderRadius: '99px', padding: '0.05rem 0.4rem', fontSize: '0.6rem', fontWeight: 700 }}>{totalAceitos}/{totalSugeridos}</span>
        </button>
        <button className={'config-tab ' + (guiaAberta === 'graficos' ? 'active' : '')}
          onClick={function() { setGuiaAberta('graficos'); }}>
          <FiPieChart size={11} /> Graficos
          <span className="indicator-badge" style={{ marginLeft: '0.3rem', background: totalGraficosSelecionados > 0 ? '#22c55e' : '#e2e8f0', color: '#fff', borderRadius: '99px', padding: '0.05rem 0.4rem', fontSize: '0.6rem', fontWeight: 700 }}>{totalGraficosSelecionados}/{totalGraficosSugeridos}</span>
        </button>
        <button className={'config-tab ' + (guiaAberta === 'colunas' ? 'active' : '')}
          onClick={function() { setGuiaAberta('colunas'); }}>
          <FiInfo size={11} /> Colunas ({analise.colunas.length})
        </button>
      </div>

      {/* CONTEUDO */}

      {guiaAberta === 'indicadores' && (
        <div>
          {/* Acoes em massa */}
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            <button className="btn btn-sm" style={{ fontSize: '0.68rem', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', padding: '0.2rem 0.5rem', borderRadius: '5px', cursor: 'pointer', fontWeight: 600 }}
              onClick={function() {
                var todos: Record<string, boolean> = {};
                todosIds.forEach(function(id) { todos[id] = true; });
                setAceitos(todos);
              }}>
              <FiCheck size={10} /> Aceitar Todos ({totalSugeridos})
            </button>
            <button className="btn btn-sm" style={{ fontSize: '0.68rem', background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '0.2rem 0.5rem', borderRadius: '5px', cursor: 'pointer', fontWeight: 600 }}
              onClick={function() {
                var todos: Record<string, boolean> = {};
                todosIds.forEach(function(id) { todos[id] = false; });
                setAceitos(todos);
              }}>
              <FiX size={10} /> Remover Todos
            </button>
          </div>

          {/* Resumo por categoria */}
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            {categoriasOrdenadas.map(function(cat) {
              var qtd = indicadoresPorCat.get(cat)?.filter(function(i) { return aceitos[i.uid]; }).length || 0;
              var totalCat = indicadoresPorCat.get(cat)?.length || 0;
              return (
                <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', padding: '0.15rem 0.45rem', borderRadius: '99px', background: qtd > 0 ? '#f0fdf4' : '#f8fafc', border: '1px solid #e2e8f0', fontSize: '0.65rem', fontWeight: 600, color: CORES_POR_CATEGORIA[cat] || '#64748b' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: CORES_POR_CATEGORIA[cat] || '#64748b' }} />
                  {cat}: {qtd}/{totalCat}
                </div>
              );
            })}
          </div>

          {/* Lista de indicadores por categoria */}
          {categoriasOrdenadas.map(function(cat) {
            const items = indicadoresPorCat.get(cat)!;
            return (
              <div key={cat} style={{ marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: CORES_POR_CATEGORIA[cat] || '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem', padding: '0.15rem 0', borderBottom: '2px solid ' + (CORES_POR_CATEGORIA[cat] || '#e2e8f0') }}>
                  {cat} · {items.filter(function(i) { return aceitos[i.uid]; }).length}/{items.length}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {items.map(function({ uid, ind, idx }) {
                    const aceito = aceitos[uid];
                    const editandoEste = editando === uid;
                    const descricaoAtual = descricoesEditadas[uid] !== undefined ? descricoesEditadas[uid] : (ind.descricao || ind.operacao.toUpperCase() + ' de ' + ind.coluna);
                    const formulaAtual = formulasEditadas[uid] !== undefined ? formulasEditadas[uid] : gerarFormula(ind);

                    function abrirEdicao(e: React.MouseEvent) {
                      e.stopPropagation();
                      setEditDescricao(descricaoAtual);
                      setEditFormula(formulaAtual);
                      setEditando(uid);
                    }

                    function salvarEdicao(e: React.MouseEvent) {
                      e.stopPropagation();
                      setDescricoesEditadas(function(prev) {
                        var next: Record<string, string> = {};
                        for (var k in prev) next[k] = prev[k];
                        next[uid] = editDescricao;
                        return next;
                      });
                      setFormulasEditadas(function(prev) {
                        var next: Record<string, string> = {};
                        for (var k in prev) next[k] = prev[k];
                        next[uid] = editFormula;
                        return next;
                      });
                      setEditando(null);
                    }

                    function cancelarEdicao(e: React.MouseEvent) {
                      e.stopPropagation();
                      setEditando(null);
                    }

                    return (
                      <div key={uid} className="auto-ind-card" style={{
                        display: 'flex', alignItems: 'flex-start', gap: '0.4rem',
                        padding: '0.45rem 0.5rem', borderRadius: '6px',
                        background: aceito && !editandoEste ? '#f8fafc' : editandoEste ? '#fefce8' : '#f1f5f9',
                        border: '1px solid ' + (editandoEste ? '#fde68a' : aceito ? '#bbf7d0' : '#e2e8f0'),
                        opacity: aceito || editandoEste ? 1 : 0.55,
                        transition: 'all 0.15s',
                        cursor: editandoEste ? 'default' : 'pointer',
                      }}
                        onClick={editandoEste ? undefined : function() { toggleIndicador(uid); }}
                      >
                        {/* Checkbox */}
                        <div style={{
                          width: 18, height: 18, borderRadius: '4px', marginTop: '2px',
                          background: aceito ? '#22c55e' : '#fff',
                          border: '2px solid ' + (aceito ? '#22c55e' : '#d1d5db'),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}
                          onClick={editandoEste ? undefined : function(e: React.MouseEvent) { e.stopPropagation(); toggleIndicador(uid); }}>
                          {aceito && <FiCheck size={11} color="#fff" />}
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.78rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.1rem' }}>
                            {ind.nomeSugerido}
                            {ind.financeiro && <span style={{ fontSize: '0.55rem', background: '#fef3c7', color: '#b45309', padding: '0.05rem 0.3rem', borderRadius: '3px', fontWeight: 700 }}>R$</span>}
                            {ind.performance && <span style={{ fontSize: '0.55rem', background: '#dbeafe', color: '#1d4ed8', padding: '0.05rem 0.3rem', borderRadius: '3px', fontWeight: 700 }}>⚡</span>}
                          </div>

                          {editandoEste ? (
                            /* MODO EDIÇÃO */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <div>
                                <label style={{ fontSize: '0.6rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '0.05rem' }}>
                                  Descricao
                                </label>
                                <textarea
                                  value={editDescricao}
                                  onChange={function(e) { setEditDescricao(e.target.value); }}
                                  rows={2}
                                  style={{ width: '100%', fontSize: '0.72rem', padding: '0.2rem 0.35rem', border: '1px solid #cbd5e1', borderRadius: '4px', fontFamily: 'inherit', resize: 'vertical', background: '#fff' }}
                                  onClick={function(e: React.MouseEvent) { e.stopPropagation(); }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: '0.6rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '0.05rem' }}>
                                  Formula
                                </label>
                                <textarea
                                  value={editFormula}
                                  onChange={function(e) { setEditFormula(e.target.value); }}
                                  rows={2}
                                  style={{ width: '100%', fontSize: '0.72rem', padding: '0.2rem 0.35rem', border: '1px solid #cbd5e1', borderRadius: '4px', fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace", resize: 'vertical', background: '#fff' }}
                                  onClick={function(e: React.MouseEvent) { e.stopPropagation(); }}
                                />
                              </div>
                              <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end', marginTop: '0.1rem' }}>
                                <button onClick={cancelarEdicao} style={{ fontSize: '0.65rem', padding: '0.15rem 0.5rem', border: '1px solid #e2e8f0', borderRadius: '4px', background: '#fff', color: '#64748b', cursor: 'pointer', fontWeight: 600 }}>
                                  Cancelar
                                </button>
                                <button onClick={salvarEdicao} style={{ fontSize: '0.65rem', padding: '0.15rem 0.5rem', border: 'none', borderRadius: '4px', background: '#22c55e', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                                  Salvar
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* MODO VISUALIZAÇÃO */
                            <>
                              <div style={{ fontSize: '0.7rem', color: '#475569', lineHeight: 1.35, marginBottom: '0.15rem', display: 'flex', alignItems: 'flex-start', gap: '0.2rem' }}>
                                <span style={{ fontWeight: 500, color: '#64748b', flexShrink: 0 }}>Descricao:</span>
                                <span style={{ flex: 1 }}>{descricaoAtual}</span>
                              </div>
                              <div style={{ fontSize: '0.7rem', fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace", color: '#0369a1', background: '#e0f2fe', padding: '0.15rem 0.4rem', borderRadius: '4px', marginTop: '0.15rem', lineHeight: 1.4, border: '1px solid #bae6fd', wordBreak: 'break-all', whiteSpace: 'normal' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.6rem', color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Formula: </span>
                                {formulaAtual}
                              </div>
                              {ind.unidade && (
                                <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: '0.05rem' }}>
                                  Unidade: {ind.unidade}
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {/* Badge + Botao Editar */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-end', flexShrink: 0 }}>
                          <div style={{ fontSize: '0.6rem', fontWeight: 700, padding: '0.1rem 0.35rem', borderRadius: '4px', textAlign: 'center', background: ind.formato === 'moeda' ? '#fef3c7' : ind.formato === 'porcentagem' ? '#dcfce7' : '#f1f5f9', color: ind.formato === 'moeda' ? '#b45309' : ind.formato === 'porcentagem' ? '#15803d' : '#64748b' }}>
                            {ind.formato === 'moeda' ? 'R$' : ind.formato === 'porcentagem' ? '%' : '#'}
                          </div>
                          {!editandoEste && (
                            <button onClick={abrirEdicao} title="Editar descricao e formula" style={{ fontSize: '0.6rem', padding: '0.1rem 0.35rem', border: '1px solid #e2e8f0', borderRadius: '4px', background: '#fff', color: '#64748b', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                              Editar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {totalSugeridos === 0 && (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>
              <FiInfo size={24} style={{ opacity: 0.3 }} />
              <p style={{ marginTop: '0.3rem', fontSize: '0.82rem' }}>Nenhum indicador sugerido para esta planilha.</p>
            </div>
          )}
        </div>
      )}

      {guiaAberta === 'graficos' && (
        <div>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            <button className="btn btn-sm" style={{ fontSize: '0.68rem', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', padding: '0.2rem 0.5rem', borderRadius: '5px', cursor: 'pointer', fontWeight: 600 }}
              onClick={function() {
                var todos: Record<string, boolean> = {};
                Object.keys(graficosSelecionados).forEach(function(k) { todos[k] = true; });
                setGraficosSelecionados(todos);
              }}>
              <FiCheck size={10} /> Aceitar Todos
            </button>
            <button className="btn btn-sm" style={{ fontSize: '0.68rem', background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '0.2rem 0.5rem', borderRadius: '5px', cursor: 'pointer', fontWeight: 600 }}
              onClick={function() {
                var todos: Record<string, boolean> = {};
                Object.keys(graficosSelecionados).forEach(function(k) { todos[k] = false; });
                setGraficosSelecionados(todos);
              }}>
              <FiX size={10} /> Remover Todos
            </button>
          </div>

          {analise.graficosSugeridos.map(function(g, i) {
            const uid = 'graf_' + i;
            const selecionado = graficosSelecionados[uid];
            return (
              <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.5rem', marginBottom: '0.3rem', borderRadius: '6px', cursor: 'pointer', background: selecionado ? '#f8fafc' : '#f1f5f9', border: '1px solid ' + (selecionado ? '#bbf7d0' : '#e2e8f0'), opacity: selecionado ? 1 : 0.55 }}
                onClick={function() { toggleGrafico(uid); }}>
                <div style={{ width: 18, height: 18, borderRadius: '4px', background: selecionado ? '#22c55e' : '#fff', border: '2px solid ' + (selecionado ? '#22c55e' : '#d1d5db'), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selecionado && <FiCheck size={11} color="#fff" />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.78rem', color: '#1e293b' }}>{g.titulo}</div>
                  <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                    {g.tipo === 'pizza' ? 'Distribuicao' : g.tipo === 'linha' ? 'Tendencia' : 'Comparacao'} · X: {g.eixoX}{g.eixoY ? ' · Y: ' + g.eixoY : ''}
                  </div>
                </div>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', padding: '0.1rem 0.35rem', borderRadius: '4px', background: g.tipo === 'pizza' ? '#f3e8ff' : g.tipo === 'linha' ? '#dbeafe' : '#fef3c7', color: g.tipo === 'pizza' ? '#7c3aed' : g.tipo === 'linha' ? '#1d4ed8' : '#b45309' }}>
                  {g.tipo}
                </div>
              </div>
            );
          })}

          {analise.graficosSugeridos.length === 0 && (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>
              <FiBarChart2 size={24} style={{ opacity: 0.3 }} />
              <p style={{ marginTop: '0.3rem', fontSize: '0.82rem' }}>Nenhum grafico sugerido automaticamente.</p>
            </div>
          )}
        </div>
      )}

      {guiaAberta === 'colunas' && (
        <div>
          <div className="estat-grid" style={{ marginBottom: '0.5rem' }}>
            <div className="estat-card">
              <div className="estat-valor" style={{ fontSize: '1rem' }}>{analise.totalRegistros.toLocaleString('pt-BR')}</div>
              <div className="estat-label">Registros</div>
            </div>
            <div className="estat-card">
              <div className="estat-valor" style={{ fontSize: '1rem' }}>{analise.colunas.length}</div>
              <div className="estat-label">Colunas</div>
            </div>
            <div className="estat-card">
              <div className="estat-valor" style={{ fontSize: '1rem' }}>{totalSugeridos}</div>
              <div className="estat-label">Indicadores</div>
            </div>
          </div>

          <table className="colunas-table">
            <thead><tr><th>Coluna</th><th>Tipo</th><th>Unicos</th><th>Nulos</th><th>Amostras</th></tr></thead>
            <tbody>
              {analise.colunas.map(function(c, i) {
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{c.nome}</td>
                    <td>
                      <span style={{ padding: '0.05rem 0.3rem', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 600, color: c.tipo === 'numero' ? '#0369a1' : c.tipo === 'data' ? '#b45309' : c.tipo === 'hora' ? '#7c3aed' : '#64748b', background: c.tipo === 'numero' ? '#e0f2fe' : c.tipo === 'data' ? '#fef3c7' : c.tipo === 'hora' ? '#f3e8ff' : '#f1f5f9' }}>
                        {c.tipo === 'numero' ? '# Num' : c.tipo === 'data' ? 'Data' : c.tipo === 'hora' ? 'Hora' : c.tipo === 'texto' ? 'Aa' : '?'}
                      </span>
                    </td>
                    <td style={{ color: '#94a3b8', fontSize: '0.68rem' }}>{c.valoresUnicos}</td>
                    <td style={{ color: '#94a3b8', fontSize: '0.68rem' }}>{c.nulos}</td>
                    <td style={{ color: '#94a3b8', fontSize: '0.6rem' }}>
                      {(c.amostras || []).slice(0, 3).map(function(a, idx) {
                        return (
                          <span key={idx} style={{ background: '#f1f5f9', borderRadius: '3px', padding: '0.05rem 0.25rem', marginRight: '0.15rem', whiteSpace: 'nowrap' }}>
                            {a != null ? String(a).substring(0, 12) : '-'}
                          </span>
                        );
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ACOES FINAIS */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
          {totalAceitos > 0 ? (
            <span style={{ color: '#15803d', fontWeight: 600 }}>
              <FiCheckCircle size={12} /> {totalAceitos} indicador(es) e {totalGraficosSelecionados} grafico(s) selecionados
            </span>
          ) : (
            <span style={{ color: '#ef4444' }}>Nenhum indicador selecionado</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <button className="btn btn-sm btn-ghost" onClick={onSkip} disabled={confirmando} style={{ fontSize: '0.72rem' }}>
            Pular — configurar depois
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleConfirmar}
            disabled={confirmando || (totalAceitos === 0 && totalGraficosSelecionados === 0)}
            style={{ fontSize: '0.72rem' }}>
            {confirmando ? 'Confirmando...' : 'Confirmar ' + (totalAceitos + totalGraficosSelecionados) + ' itens'}
          </button>
        </div>
      </div>
    </div>
  );
}
