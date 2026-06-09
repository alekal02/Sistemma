/* ============================================
   Graficos — Aba de gráficos por tipo de serviço
   Gera gráficos consolidados usando os indicadores
   (KPIs) de cada tipo de serviço como parâmetros.
   URL: /graficos
   ============================================ */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiBarChart2, FiRefreshCw, FiExternalLink, FiInfo,
  FiChevronDown, FiChevronUp, FiTruck, FiSearch,
} from 'react-icons/fi';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { TIPOS_SERVICO_LABELS, TIPOS_SERVICO_META, type TipoServico } from '../types';
import SkeletonLoader from '../components/SkeletonLoader';
import '../styles/Dashboard.css';

/* ─── Cores por tipo de serviço ─── */
const CORES_TIPO: Record<string, string> = {
  coleta_caminhao: '#6366f1',
  rocadeira: '#22c55e',
  poda: '#f59e0b',
  capina: '#14b8a6',
  varricao: '#8b5cf6',
  pintura_meio_fio: '#ec4899',
  remocao: '#f97316',
  geral: '#64748b',
};

const CORES_GRAFICOS = ['#6366f1', '#22c55e', '#f59e0b', '#14b8a6', '#8b5cf6', '#ec4899', '#f97316', '#3b82f6', '#ef4444', '#84cc16'];

/* ─── Interfaces ─── */
interface ServicoComTipo {
  id: string;
  nome: string;
  tipo: string;
  contratoId: string;
  contratoNome: string;
  kpis: { nome: string; valor: number | null; formatado: string; formato: string }[];
  totalRegistros: number;
  ultimoUpload: string | null;
  temConfigDashboard: boolean;
}

interface TipoAgrupado {
  tipo: string;
  label: string;
  cor: string;
  servicos: ServicoComTipo[];
  totalServicos: number;
  totalRegistros: number;
  totalKpis: number;
}

/* ─── Helper: Formatar data ─── */
function formatarData(data: string | null): string {
  if (!data) return 'Nunca';
  const d = new Date(data);
  const agora = new Date();
  const diffDias = Math.floor((agora.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDias === 0) return 'Hoje';
  if (diffDias === 1) return 'Ontem';
  if (diffDias < 7) return `Há ${diffDias} dias`;
  return d.toLocaleDateString('pt-BR');
}

/* ─── Componente Principal ─── */
export default function Graficos() {
  const { token } = useAuth();
  const { adicionarToast } = useToast();
  const navigate = useNavigate();

  const [carregando, setCarregando] = useState(true);
  const [servicos, setServicos] = useState<ServicoComTipo[]>([]);
  const [erro, setErro] = useState('');
  const [tipoExpandido, setTipoExpandido] = useState<string | null>(null);
  const [buscaTipo, setBuscaTipo] = useState('');
  const [visaoAgrupada, setVisaoAgrupada] = useState(true);

  /* ═══ Carregar dados ═══ */
  const carregarDados = useCallback(async () => {
    if (!token) return;
    setCarregando(true);
    setErro('');
    try {
      // 1. Buscar todos os contratos
      const resContratos = await fetch('/api/contracts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resContratos.ok) throw new Error('Erro ao carregar contratos');
      const contratosData = await resContratos.json();
      const contratos: { id: string; numeroContrato: string }[] = contratosData.contratos || [];

      // 2. Buscar KPIs consolidados
      const resConsolidado = await fetch('/dashboard/kpis-consolidado', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const consolidadoData = resConsolidado.ok ? await resConsolidado.json() : { servicos: [] };
      const mapaKpis = new Map<string, { kpis: any[]; totalRegistros: number; ultimoUpload: string | null; temConfigDashboard: boolean }>();
      for (const sv of consolidadoData.servicos || []) {
        mapaKpis.set(sv.id, {
          kpis: sv.kpis || [],
          totalRegistros: sv.totalRegistros || 0,
          ultimoUpload: sv.ultimoUpload || null,
          temConfigDashboard: sv.temConfigDashboard || false,
        });
      }

      // 3. Para cada contrato, buscar serviços com tipo
      const todosServicos: ServicoComTipo[] = [];
      for (const contrato of contratos) {
        try {
          const resServicos = await fetch(`/api/contracts/${contrato.id}/servicos`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!resServicos.ok) continue;
          const servicosData = await resServicos.json();
          const lista = servicosData.servicos || [];

          for (const sv of lista) {
            const infoKpi = mapaKpis.get(sv.id);
            todosServicos.push({
              id: sv.id,
              nome: sv.nome,
              tipo: sv.tipo || 'geral',
              contratoId: contrato.id,
              contratoNome: contrato.numeroContrato,
              kpis: infoKpi?.kpis || [],
              totalRegistros: infoKpi?.totalRegistros || 0,
              ultimoUpload: infoKpi?.ultimoUpload || null,
              temConfigDashboard: infoKpi?.temConfigDashboard || false,
            });
          }
        } catch {
          // Ignora erro de um contrato específico
        }
      }

      setServicos(todosServicos);
    } catch (err: any) {
      console.error('[Graficos] Erro:', err);
      setErro(err.message || 'Erro ao carregar dados');
      adicionarToast('Erro ao carregar gráficos', 'error');
    } finally {
      setCarregando(false);
    }
  }, [token, adicionarToast]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  /* ═══ Agrupar por tipo de serviço ═══ */
  const tiposAgrupados = useMemo<TipoAgrupado[]>(() => {
    const grupos = new Map<string, ServicoComTipo[]>();
    for (const sv of servicos) {
      const tipo = sv.tipo || 'geral';
      if (!grupos.has(tipo)) grupos.set(tipo, []);
      grupos.get(tipo)!.push(sv);
    }

    return Array.from(grupos.entries())
      .map(([tipo, lista]) => ({
        tipo,
        label: (TIPOS_SERVICO_LABELS as any)[tipo] || tipo,
        cor: CORES_TIPO[tipo] || '#6366f1',
        servicos: lista,
        totalServicos: lista.length,
        totalRegistros: lista.reduce((acc, s) => acc + s.totalRegistros, 0),
        totalKpis: lista.reduce((acc, s) => acc + s.kpis.length, 0),
      }))
      .sort((a, b) => b.totalServicos - a.totalServicos);
  }, [servicos]);

  /* ═══ Filtrar tipos pela busca ═══ */
  const tiposFiltrados = useMemo(() => {
    if (!buscaTipo) return tiposAgrupados;
    const termo = buscaTipo.toLowerCase();
    return tiposAgrupados.filter(t =>
      t.label.toLowerCase().includes(termo) ||
      t.tipo.toLowerCase().includes(termo)
    );
  }, [tiposAgrupados, buscaTipo]);

  /* ═══ KPIs agregados por tipo (para gráficos) ═══ */
  const kpisAgregadosPorTipo = useMemo(() => {
    const mapa = new Map<string, Record<string, { soma: number; count: number; formatado: string; formato: string }>>();
    for (const sv of servicos) {
      const tipo = sv.tipo || 'geral';
      if (!mapa.has(tipo)) mapa.set(tipo, {});
      const kpisDoTipo = mapa.get(tipo)!;
      for (const kpi of sv.kpis) {
        if (!kpisDoTipo[kpi.nome]) {
          kpisDoTipo[kpi.nome] = { soma: 0, count: 0, formatado: kpi.formatado, formato: kpi.formato };
        }
        if (kpi.valor !== null) {
          kpisDoTipo[kpi.nome].soma += kpi.valor;
          kpisDoTipo[kpi.nome].count += 1;
        }
      }
    }
    // Converter para array
    const resultado: Record<string, { nome: string; media: number; total: number; formatado: string; formato: string }[]> = {};
    for (const [tipo, kpis] of mapa.entries()) {
      resultado[tipo] = Object.entries(kpis).map(([nome, info]) => ({
        nome,
        media: info.count > 0 ? info.soma / info.count : 0,
        total: info.soma,
        formatado: info.formatado,
        formato: info.formato,
      })).sort((a, b) => b.total - a.total);
    }
    return resultado;
  }, [servicos]);

  /* ═══ Dados para gráfico de pizza: distribuição de registros por tipo ═══ */
  const dadosDistribuicao = useMemo(() => {
    return tiposAgrupados.map(t => ({
      name: t.label.replace(/^[^\s]+\s/, '').trim(),
      value: t.totalRegistros,
      fullLabel: t.label,
      cor: t.cor,
    })).sort((a, b) => b.value - a.value);
  }, [tiposAgrupados]);

  /* ═══ Dados para gráfico de barra: serviços vs KPIs ═══ */
  const dadosServicosKpis = useMemo(() => {
    return tiposAgrupados.map(t => ({
      name: t.label.replace(/^[^\s]+\s/, '').trim(),
      servicos: t.totalServicos,
      kpis: t.totalKpis,
      registros: t.totalRegistros,
    }));
  }, [tiposAgrupados]);

  /* ═══ Alternar expansão de tipo ═══ */
  const toggleTipo = (tipo: string) => {
    setTipoExpandido(prev => prev === tipo ? null : tipo);
  };

  /* ─── Loading ─── */
  if (carregando) {
    return (
      <div style={{ padding: '1.5rem 2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <SkeletonLoader tipo="kpi-grid" quantidade={4} />
        <SkeletonLoader tipo="chart" quantidade={3} />
      </div>
    );
  }

  /* ─── Erro ─── */
  if (erro) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem', maxWidth: '500px', margin: '0 auto' }}>
        <FiBarChart2 size={48} style={{ marginBottom: '1rem', color: '#ef4444', opacity: 0.5 }} />
        <h3 style={{ color: '#dc2626', marginBottom: '0.5rem' }}>Erro ao carregar</h3>
        <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>{erro}</p>
        <button className="btn btn-primary" onClick={carregarDados}>
          <FiRefreshCw size={14} /> Tentar Novamente
        </button>
      </div>
    );
  }

  /* ─── Empty State ─── */
  if (servicos.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{
          width: '72px', height: '72px', borderRadius: '20px',
          background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 1.25rem',
        }}>
          <FiBarChart2 size={32} style={{ color: '#22c55e', opacity: 0.6 }} />
        </div>
        <h2 style={{ color: '#1e293b', marginBottom: '0.35rem', fontSize: '1.2rem' }}>
          Nenhum serviço com dados
        </h2>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Crie contratos e serviços com upload de planilhas para visualizar gráficos por tipo de serviço.
        </p>
        <button className="btn btn-primary" onClick={() => navigate('/contratos')}>
          Ir para Contratos
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.25rem 2rem' }}>
      {/* ═══ HEADER ═══ */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem',
      }}>
        <div>
          <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.35rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <FiBarChart2 size={20} /> Gráficos por Tipo de Serviço
          </h2>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
            <StatChip label="Tipos de Serviço" value={tiposAgrupados.length} color="#6366f1" />
            <StatChip label="Serviços" value={servicos.length} color="#22c55e" />
            <StatChip label="Registros" value={servicos.reduce((a, s) => a + s.totalRegistros, 0)} color="#14b8a6" />
            <StatChip label="KPIs" value={servicos.reduce((a, s) => a + s.kpis.length, 0)} color="#f59e0b" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <button
            className="btn-refresh-moderno"
            onClick={carregarDados}
            title="Recarregar dados"
          >
            <FiRefreshCw size={13} />
            <span className="refresh-text">Atualizar</span>
          </button>
        </div>
      </div>

      {/* ═══ GRÁFICOS GLOBAIS (topo) ═══ */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{
          fontSize: '0.7rem', fontWeight: 700, color: '#64748b',
          textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.75rem',
        }}>
          📊 Visão Geral por Tipo de Serviço
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
          {/* Gráfico 1: Distribuição de Registros por Tipo (Pizza) */}
          <div className="card card-bordered" style={{ padding: '1rem', background: 'white', borderRadius: '10px' }}>
            <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#1e293b' }}>
              🥧 Distribuição de Registros por Tipo
            </h4>
            {dadosDistribuicao.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={dadosDistribuicao}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={40}
                    label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                  >
                    {dadosDistribuicao.map((entry, i) => (
                      <Cell key={i} fill={entry.cor} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => value.toLocaleString('pt-BR')} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: '0.82rem' }}>
                Sem dados disponíveis
              </div>
            )}
          </div>

          {/* Gráfico 2: Serviços vs KPIs por Tipo (Barra) */}
          <div className="card card-bordered" style={{ padding: '1rem', background: 'white', borderRadius: '10px' }}>
            <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#1e293b' }}>
              📊 Serviços e KPIs por Tipo
            </h4>
            {dadosServicosKpis.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dadosServicosKpis}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="servicos" name="Serviços" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="kpis" name="KPIs" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: '0.82rem' }}>
                Sem dados disponíveis
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ LISTAGEM POR TIPO DE SERVIÇO ═══ */}
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{
          fontSize: '0.7rem', fontWeight: 700, color: '#64748b',
          textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.75rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem',
        }}>
          <span>📈 Indicadores por Tipo de Serviço ({tiposFiltrados.length})</span>

          {/* Busca */}
          <div style={{ position: 'relative', width: '220px' }}>
            <FiSearch size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Filtrar tipo..."
              value={buscaTipo}
              onChange={e => setBuscaTipo(e.target.value)}
              style={{
                width: '100%', padding: '0.3rem 0.3rem 0.3rem 1.6rem',
                border: '1px solid #e2e8f0', borderRadius: '6px',
                fontSize: '0.75rem', outline: 'none',
              }}
            />
          </div>
        </div>
      </div>

      {/* Cards por tipo de serviço */}
      {tiposFiltrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '0.85rem' }}>
          Nenhum tipo de serviço encontrado para "{buscaTipo}"
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {tiposFiltrados.map(tipoGroup => {
            const expandido = tipoExpandido === tipoGroup.tipo;
            const kpisDesteTipo = kpisAgregadosPorTipo[tipoGroup.tipo] || [];

            // Dados para gráfico de barras dos KPIs deste tipo
            const dadosKpisTipo = kpisDesteTipo.slice(0, 8).map(k => ({
              name: k.nome.length > 18 ? k.nome.substring(0, 18) + '...' : k.nome,
              nomeCompleto: k.nome,
              media: Math.round(k.media * 100) / 100,
              total: Math.round(k.total * 100) / 100,
              formatado: k.formatado,
            }));

            // Dados para gráfico de pizza: distribuição de registros entre serviços deste tipo
            const dadosServicosTipo = tipoGroup.servicos.map(sv => ({
              name: sv.nome.length > 15 ? sv.nome.substring(0, 15) + '...' : sv.nome,
              nomeCompleto: sv.nome,
              value: sv.totalRegistros,
            })).sort((a, b) => b.value - a.value);

            return (
              <div key={tipoGroup.tipo} className="card card-bordered" style={{
                borderRadius: '10px', overflow: 'hidden',
                border: `1px solid ${tipoGroup.cor}30`,
              }}>
                {/* Header do tipo */}
                <div
                  onClick={() => toggleTipo(tipoGroup.tipo)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.85rem 1rem',
                    background: `linear-gradient(135deg, ${tipoGroup.cor}08, ${tipoGroup.cor}04)`,
                    borderBottom: expandido ? `1px solid ${tipoGroup.cor}20` : 'none',
                    cursor: 'pointer', transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = `linear-gradient(135deg, ${tipoGroup.cor}15, ${tipoGroup.cor}08)`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = `linear-gradient(135deg, ${tipoGroup.cor}08, ${tipoGroup.cor}04)`; }}
                >
                  {/* Ícone */}
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '10px',
                    background: `${tipoGroup.cor}18`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.2rem', flexShrink: 0,
                  }}>
                    {tipoGroup.label.split(' ')[0]}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>
                      {tipoGroup.label}
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.15rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                        <strong style={{ color: tipoGroup.cor }}>{tipoGroup.totalServicos}</strong> serviço(s)
                      </span>
                      <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                        <strong>{tipoGroup.totalRegistros.toLocaleString('pt-BR')}</strong> registro(s)
                      </span>
                      <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                        <strong>{tipoGroup.totalKpis}</strong> KPI(s)
                      </span>
                    </div>
                  </div>

                  {/* Badge de expandir */}
                  <div style={{ color: tipoGroup.cor, fontSize: '0.85rem' }}>
                    {expandido ? <FiChevronUp /> : <FiChevronDown />}
                  </div>
                </div>

                {/* Conteúdo expandido */}
                {expandido && (
                  <div style={{ padding: '1rem' }}>
                    {/* Descrição do tipo */}
                    <div style={{
                      fontSize: '0.78rem', color: '#64748b', marginBottom: '1rem',
                      padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '6px',
                      border: '1px solid #f1f5f9',
                    }}>
                      {(TIPOS_SERVICO_META as any)[tipoGroup.tipo]?.descricao || 'Sem descrição'}
                    </div>

                    {/* Grid de gráficos do tipo */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '1rem' }}>
                      {/* Gráfico de KPIs do tipo (barras) */}
                      <div style={{ background: '#fafafa', borderRadius: '8px', padding: '0.75rem', border: '1px solid #f1f5f9' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>
                          📊 Top KPIs — Média por Serviço
                        </div>
                        {dadosKpisTipo.length > 0 ? (
                          <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={dadosKpisTipo} layout="vertical">
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                              <XAxis type="number" tick={{ fontSize: 10 }} />
                              <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={100} />
                              <Tooltip formatter={(value: number) => value.toLocaleString('pt-BR')} labelFormatter={(label) => `KPI: ${label}`} />
                              <Bar dataKey="media" name="Média" fill={tipoGroup.cor} radius={[0, 4, 4, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: '0.78rem' }}>
                            Nenhum KPI configurado para este tipo
                          </div>
                        )}
                      </div>

                      {/* Gráfico de distribuição entre serviços (pizza) */}
                      <div style={{ background: '#fafafa', borderRadius: '8px', padding: '0.75rem', border: '1px solid #f1f5f9' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>
                          🥧 Registros por Serviço
                        </div>
                        {dadosServicosTipo.length > 0 ? (
                          <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                              <Pie
                                data={dadosServicosTipo}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={70}
                                innerRadius={30}
                                label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                              >
                                {dadosServicosTipo.map((_, i) => (
                                  <Cell key={i} fill={CORES_GRAFICOS[i % CORES_GRAFICOS.length]} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(value: number) => value.toLocaleString('pt-BR')} />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: '0.78rem' }}>
                            Nenhum registro
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Lista de KPIs do tipo */}
                    {kpisDesteTipo.length > 0 && (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#475569', marginBottom: '0.4rem' }}>
                          📋 Todos os Indicadores deste Tipo
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                          {kpisDesteTipo.map((kpi, idx) => (
                            <span key={kpi.nome} style={{
                              fontSize: '0.68rem', padding: '0.2rem 0.5rem',
                              background: `${tipoGroup.cor}08`,
                              border: `1px solid ${tipoGroup.cor}20`,
                              borderRadius: '6px', color: '#334155',
                              display: 'flex', alignItems: 'center', gap: '0.3rem',
                            }}>
                              <span style={{
                                width: '6px', height: '6px', borderRadius: '50%',
                                background: CORES_GRAFICOS[idx % CORES_GRAFICOS.length],
                                display: 'inline-block',
                              }} />
                              <strong>{kpi.nome}</strong>
                              <span style={{ color: '#94a3b8' }}>—</span>
                              <span style={{ fontWeight: 600, color: tipoGroup.cor }}>
                                {kpi.formatado}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Lista de serviços deste tipo */}
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#475569', marginBottom: '0.4rem' }}>
                        🏢 Serviços ({tipoGroup.servicos.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        {tipoGroup.servicos.map(sv => (
                          <div key={sv.id} style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.4rem 0.65rem', background: '#f8fafc',
                            borderRadius: '6px', border: '1px solid #f1f5f9',
                            fontSize: '0.78rem',
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontWeight: 600, color: '#1e293b' }}>{sv.nome}</span>
                              <span style={{ color: '#94a3b8', marginLeft: '0.4rem', fontSize: '0.7rem' }}>
                                {sv.contratoNome}
                              </span>
                            </div>
                            <span style={{ color: '#64748b', fontSize: '0.7rem' }}>
                              {sv.totalRegistros.toLocaleString('pt-BR')} registros
                            </span>
                            <span style={{ color: '#94a3b8', fontSize: '0.65rem' }}>
                              {formatarData(sv.ultimoUpload)}
                            </span>
                            <button
                              onClick={() => navigate(`/contratos/${sv.contratoId}/servicos/${sv.id}/dashboard`)}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: tipoGroup.cor, padding: '0.2rem', display: 'flex',
                              }}
                              title="Ver dashboard do serviço"
                            >
                              <FiExternalLink size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Stat Chip ─── */
function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span style={{
      fontSize: '0.72rem', color: '#64748b', fontWeight: 500,
      display: 'flex', alignItems: 'center', gap: '0.25rem',
    }}>
      <span style={{
        width: '7px', height: '7px', borderRadius: '50%',
        background: color, display: 'inline-block',
      }} />
      <strong style={{ color: '#1e293b', fontWeight: 700 }}>
        {value.toLocaleString('pt-BR')}
      </strong>
      {' '}{label}
    </span>
  );
}
