/* ============================================
   BibliotecaKpisUniversais — Tela de administração da biblioteca
   Fluxo: Seleção de Tipo de Serviço → Listagem de KPIs do tipo
   URL: /kpis-universais
   ============================================ */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlus, FiEdit2, FiTrash2, FiCopy, FiArrowLeft, FiSearch, FiInfo, FiChevronDown, FiCheck, FiFolder, FiGrid, FiBarChart2, FiToggleLeft, FiToggleRight, FiStar } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import kpiUniversalService from '../services/kpiUniversalService';
import graficosPadraoService from '../services/graficosPadraoService';
import type { KpiUniversal } from '../services/kpiUniversalService';
import type { GraficoPadraoConfig } from '../services/graficosPadraoService';
import { TIPOS_SERVICO_LABELS, TIPOS_SERVICO_META, type TipoServico } from '../types';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from 'recharts';
import '../styles/ContratoDetalhe.css';

// Helper: label do tipo
function getTipoLabel(tipo: string): string {
  return (TIPOS_SERVICO_LABELS as any)[tipo] || tipo;
}

// Helper: cor associada ao tipo
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

export default function BibliotecaKpisUniversais() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { adicionarToast } = useToast();

  // ──────────────────────────────────────
  // Estado da navegação entre telas
  // ──────────────────────────────────────
  const [tipoSelecionado, setTipoSelecionado] = useState<string | null>(null);

  // ──────────────────────────────────────
  // Estado dos KPIs
  // ──────────────────────────────────────
  const [kpis, setKpis] = useState<KpiUniversal[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  // Aba ativa: 'kpis' | 'graficos_padrao' | 'graficos'
  const [abaAtiva, setAbaAtiva] = useState<'kpis' | 'graficos_padrao' | 'graficos'>('kpis');

  // ──────────────────────────────────────
  // Estado dos GRÁFICOS PADRÃO
  // ──────────────────────────────────────
  const [graficosBiblioteca, setGraficosBiblioteca] = useState<GraficoPadraoConfig[]>([]);
  const [carregandoGraficos, setCarregandoGraficos] = useState(false);
  const [toggleGraficoId, setToggleGraficoId] = useState<string | null>(null);

  // ──────────────────────────────────────
  // Estado dos GRÁFICOS DE INDICADORES
  // ──────────────────────────────────────
  const [servicosIndicadores, setServicosIndicadores] = useState<any[]>([]);
  const [carregandoIndicadores, setCarregandoIndicadores] = useState(false);
  const [kpisAgregadosPorTipo, setKpisAgregadosPorTipo] = useState<Record<string, { nome: string; media: number; total: number; formatado: string; formato: string }[]>>({});
  const [totalRegistrosTipo, setTotalRegistrosTipo] = useState(0);
  const [totalServicosTipo, setTotalServicosTipo] = useState(0);

  // Cores para gráficos
  const CORES_GRAFICOS = ['#6366f1', '#22c55e', '#f59e0b', '#14b8a6', '#8b5cf6', '#ec4899', '#f97316', '#3b82f6', '#ef4444', '#84cc16'];

  // ═══ CARREGAR DADOS CONSOLIDADOS PARA GRÁFICOS ═══
  const carregarDadosGraficos = useCallback(async (tipo?: string) => {
    if (!token) return;
    setCarregandoIndicadores(true);
    try {
      // Buscar todos os contratos
      const resContratos = await fetch('/api/contracts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resContratos.ok) throw new Error('Erro ao carregar contratos');
      const contratosData = await resContratos.json();
      const contratos: { id: string; numeroContrato: string }[] = contratosData.contratos || [];

      // Buscar KPIs consolidados
      const resConsolidado = await fetch('/dashboard/kpis-consolidado', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const consolidadoData = resConsolidado.ok ? await resConsolidado.json() : { servicos: [] };
      const mapaKpis = new Map<string, { kpis: any[]; totalRegistros: number; ultimoUpload: string | null }>();
      for (const sv of consolidadoData.servicos || []) {
        mapaKpis.set(sv.id, {
          kpis: sv.kpis || [],
          totalRegistros: sv.totalRegistros || 0,
          ultimoUpload: sv.ultimoUpload || null,
        });
      }

      // Para cada contrato, buscar serviços com tipo
      const todosServicos: any[] = [];
      for (const contrato of contratos) {
        try {
          const resServicos = await fetch(`/api/contracts/${contrato.id}/servicos`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!resServicos.ok) continue;
          const servicosData = await resServicos.json();
          const lista = servicosData.servicos || [];

          for (const sv of lista) {
            const tipoOk = tipo ? sv.tipo === tipo : true;
            if (!tipoOk) continue;
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
            });
          }
        } catch { /* ignore */ }
      }

      setServicosIndicadores(todosServicos);
      setTotalServicosTipo(todosServicos.length);
      setTotalRegistrosTipo(todosServicos.reduce((a: number, s: any) => a + s.totalRegistros, 0));

      // Agregar KPIs por nome
      const mapa = new Map<string, { soma: number; count: number; formatado: string; formato: string }>();
      for (const sv of todosServicos) {
        for (const kpi of sv.kpis) {
          if (!mapa.has(kpi.nome)) {
            mapa.set(kpi.nome, { soma: 0, count: 0, formatado: kpi.formatado, formato: kpi.formato });
          }
          const info = mapa.get(kpi.nome)!;
          if (kpi.valor !== null) {
            info.soma += kpi.valor;
            info.count += 1;
          }
        }
      }

      const agregados: Record<string, { nome: string; media: number; total: number; formatado: string; formato: string }[]> = {};
      agregados[tipo || '__todos__'] = Array.from(mapa.entries())
        .map(([nome, info]) => ({
          nome,
          media: info.count > 0 ? info.soma / info.count : 0,
          total: info.soma,
          formatado: info.formatado,
          formato: info.formato,
        }))
        .sort((a, b) => b.total - a.total);

      setKpisAgregadosPorTipo(agregados);
    } catch {
      // Silêncio
    } finally {
      setCarregandoIndicadores(false);
    }
  }, [token]);

  // ──────────────────────────────────────
  // Estado dos tipos (tela inicial)
  // ──────────────────────────────────────
  const [tiposComKpis, setTiposComKpis] = useState<{ tipo: string; total: number }[]>([]);
  const [carregandoTipos, setCarregandoTipos] = useState(true);

  // ──────────────────────────────────────
  // Estado do formulário
  // ──────────────────────────────────────
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [confirmarExcluir, setConfirmarExcluir] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome: '',
    label: '',
    formula: '',
    agregacao: 'sum',
    formato: 'numero',
    unidade: '',
    categoria: '',
    cor: '#6366f1',
    descricao: '',
    metaSugerida: '',
    tipoServico: 'coleta_caminhao',
    placeholders: [{ nome: '', label: '', colunasCandidatas: '' }],
  });

  // ──────────────────────────────────────
  // Carregamento dos tipos (tela inicial)
  // ──────────────────────────────────────
  const carregarTipos = useCallback(async () => {
    setCarregandoTipos(true);
    try {
      const data = await kpiUniversalService.listarTiposComKpis();
      setTiposComKpis(data.tipos);
    } catch {
      adicionarToast('Erro ao carregar tipos de serviço', 'error');
    } finally {
      setCarregandoTipos(false);
    }
  }, [adicionarToast]);

  // ──────────────────────────────────────
  // Carregamento dos KPIs (tela de listagem)
  // ──────────────────────────────────────
  const carregarKpis = useCallback(async (tipo?: string) => {
    setCarregando(true);
    try {
      const data = await kpiUniversalService.listar(tipo);
      setKpis(data.kpis);
    } catch {
      adicionarToast('Erro ao carregar KPIs universais', 'error');
    } finally {
      setCarregando(false);
    }
  }, [adicionarToast]);

  // Carrega tipos ao montar
  useEffect(() => {
    carregarTipos();
  }, [carregarTipos]);

  // ═══ CARREGAR GRÁFICOS DA BIBLIOTECA ═══
  const carregarGraficos = useCallback(async (tipo?: string) => {
    setCarregandoGraficos(true);
    try {
      const data = await graficosPadraoService.listarBiblioteca(tipo);
      setGraficosBiblioteca(data.graficos);
    } catch {
      // Silêncio — não mostrar toast para erro de gráficos
    } finally {
      setCarregandoGraficos(false);
    }
  }, []);

  // ═══ TOGGLE ATIVO/INATIVO GRÁFICO ═══
  const handleToggleGrafico = useCallback(async (graficoId: string, ativo: boolean) => {
    setToggleGraficoId(graficoId);
    try {
      await graficosPadraoService.toggleAtivo(graficoId, ativo);
      adicionarToast(ativo ? 'Gráfico ativado na biblioteca' : 'Gráfico desativado', 'success');
      // Atualizar estado local
      setGraficosBiblioteca(prev =>
        prev.map(g => g.id === graficoId ? { ...g, ativo } : g)
      );
    } catch {
      adicionarToast('Erro ao alterar status do gráfico', 'error');
    } finally {
      setToggleGraficoId(null);
    }
  }, [adicionarToast]);

  // ═══ EXCLUIR GRÁFICO PERSONALIZADO ═══
  const [confirmarExcluirGrafico, setConfirmarExcluirGrafico] = useState<string | null>(null);
  const handleExcluirGrafico = useCallback(async (graficoId: string) => {
    try {
      await graficosPadraoService.excluir(graficoId);
      adicionarToast('Gráfico personalizado removido', 'success');
      setConfirmarExcluirGrafico(null);
      carregarGraficos(tipoSelecionado === '__todos__' ? undefined : (tipoSelecionado ?? undefined));
    } catch {
      adicionarToast('Erro ao remover gráfico', 'error');
    }
  }, [adicionarToast, carregarGraficos, tipoSelecionado]);

  // Carrega KPIs quando seleciona um tipo
  useEffect(() => {
    if (tipoSelecionado !== null) {
      carregarKpis(tipoSelecionado);
      carregarGraficos(tipoSelecionado === '__todos__' ? undefined : (tipoSelecionado ?? undefined));
      carregarDadosGraficos(tipoSelecionado === '__todos__' ? undefined : (tipoSelecionado ?? undefined));
    } else {
      setKpis([]);
      setGraficosBiblioteca([]);
      setServicosIndicadores([]);
      setKpisAgregadosPorTipo({});
    }
  }, [tipoSelecionado, carregarKpis, carregarGraficos, carregarDadosGraficos]);

  // ──────────────────────────────────────
  // Ações nos KPIs
  // ──────────────────────────────────────
  const handleDuplicar = async (id: string) => {
    try {
      await kpiUniversalService.duplicar(id);
      adicionarToast('KPI universal duplicado!', 'success');
      carregarKpis(tipoSelecionado ?? undefined);
    } catch {
      adicionarToast('Erro ao duplicar', 'error');
    }
  };

  const handleExcluir = async (id: string) => {
    try {
      await kpiUniversalService.excluir(id);
      adicionarToast('KPI universal excluído!', 'success');
      setConfirmarExcluir(null);
      carregarKpis(tipoSelecionado ?? undefined);
      // Atualiza contagem dos tipos
      carregarTipos();
    } catch {
      adicionarToast('Erro ao excluir', 'error');
    }
  };

  const handleEditar = (kpi: KpiUniversal) => {
    setEditandoId(kpi.id);
    setForm({
      nome: kpi.nome,
      label: kpi.label,
      formula: kpi.formula,
      agregacao: kpi.agregacao,
      formato: kpi.formato,
      unidade: kpi.unidade || '',
      categoria: kpi.categoria,
      cor: kpi.cor,
      descricao: kpi.descricao || '',
      metaSugerida: kpi.metaSugerida ? String(kpi.metaSugerida) : '',
      tipoServico: kpi.tipoServico,
      placeholders: (kpi.placeholders || []).map(p => ({
        nome: p.nome,
        label: p.label,
        colunasCandidatas: p.colunasCandidatas.join(', '),
      })),
    });
    setMostrarForm(true);
  };

  const handleNovo = () => {
    setEditandoId(null);
    setForm({
      nome: '',
      label: '',
      formula: '',
      agregacao: 'sum',
      formato: 'numero',
      unidade: '',
      categoria: '',
      cor: '#6366f1',
      descricao: '',
      metaSugerida: '',
      tipoServico: tipoSelecionado || 'coleta_caminhao',
      placeholders: [{ nome: '', label: '', colunasCandidatas: '' }],
    });
    setMostrarForm(true);
  };

  const handleSalvar = async () => {
    if (!form.nome || !form.label || !form.formula || !form.categoria) {
      adicionarToast('Preencha nome, label, fórmula e categoria', 'warning');
      return;
    }

    const payload: any = {
      nome: form.nome,
      label: form.label,
      formula: form.formula,
      agregacao: form.agregacao,
      formato: form.formato,
      unidade: form.unidade || null,
      categoria: form.categoria,
      cor: form.cor,
      descricao: form.descricao || null,
      metaSugerida: form.metaSugerida ? Number(form.metaSugerida) : null,
      tipoServico: form.tipoServico,
      placeholders: form.placeholders
        .filter(p => p.nome.trim())
        .map(p => ({
          nome: p.nome.trim(),
          label: p.label.trim() || p.nome.trim(),
          colunasCandidatas: p.colunasCandidatas.split(',').map(s => s.trim()).filter(Boolean),
        })),
    };

    try {
      if (editandoId) {
        await kpiUniversalService.atualizar(editandoId, payload);
        adicionarToast('KPI universal atualizado!', 'success');
      } else {
        await kpiUniversalService.criar(payload);
        adicionarToast('KPI universal criado!', 'success');
      }
      setMostrarForm(false);
      setEditandoId(null);
      carregarKpis(tipoSelecionado ?? undefined);
      carregarTipos();
    } catch {
      adicionarToast('Erro ao salvar KPI universal', 'error');
    }
  };

  // ──────────────────────────────────────
  // Placeholders helpers
  // ──────────────────────────────────────
  const handleAddPlaceholder = () => {
    setForm(prev => ({
      ...prev,
      placeholders: [...prev.placeholders, { nome: '', label: '', colunasCandidatas: '' }],
    }));
  };

  const handleRemovePlaceholder = (idx: number) => {
    setForm(prev => ({
      ...prev,
      placeholders: prev.placeholders.filter((_, i) => i !== idx),
    }));
  };

  const handlePlaceholderChange = (idx: number, field: string, value: string) => {
    setForm(prev => {
      const novos = [...prev.placeholders];
      novos[idx] = { ...novos[idx], [field]: value };
      return { ...prev, placeholders: novos };
    });
  };

  // ──────────────────────────────────────
  // Filtro: Operacionais vs Receita
  // ──────────────────────────────────────
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'operacionais' | 'receita'>('todos');

  // Categorias de receita (Financeiro, Faturamento, etc.)
  const CATEGORIAS_RECEITA = new Set([
    'financeiro', 'faturamento', 'receita', 'custo', 'valor',
  ]);

  function getGrupoCategoria(categoria: string): 'receita' | 'operacional' {
    return CATEGORIAS_RECEITA.has(categoria.toLowerCase().trim()) ? 'receita' : 'operacional';
  }

  // KPIs filtrados pela busca
  const kpisFiltrados = useMemo(() => {
    let filtrados = kpis;
    if (busca) {
      const termo = busca.toLowerCase();
      filtrados = kpis.filter(k =>
        k.nome.toLowerCase().includes(termo) ||
        k.label.toLowerCase().includes(termo) ||
        k.descricao?.toLowerCase().includes(termo) ||
        k.categoria?.toLowerCase().includes(termo)
      );
    }
    if (tipoFiltro === 'operacionais') {
      filtrados = filtrados.filter(k => getGrupoCategoria(k.categoria) === 'operacional');
    } else if (tipoFiltro === 'receita') {
      filtrados = filtrados.filter(k => getGrupoCategoria(k.categoria) === 'receita');
    }
    return filtrados;
  }, [kpis, busca, tipoFiltro]);

  const kpisAgrupados = useMemo(() => {
    return kpisFiltrados.reduce<Record<string, KpiUniversal[]>>((acc, kpi) => {
      const cat = kpi.categoria || 'Sem categoria';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(kpi);
      return acc;
    }, {});
  }, [kpisFiltrados]);

  // Ordena categorias — receita sempre no topo
  const categoriasOrdenadas = useMemo(() => {
    const entries = Object.entries(kpisAgrupados);
    const receita = entries.filter(([cat]) => getGrupoCategoria(cat) === 'receita');
    const operacional = entries.filter(([cat]) => getGrupoCategoria(cat) === 'operacional');
    return [...receita.sort(([a], [b]) => a.localeCompare(b)), ...operacional.sort(([a], [b]) => a.localeCompare(b))];
  }, [kpisAgrupados]);

  // Estatísticas do filtro atual
  const statsFiltro = useMemo(() => {
    let operacionais = 0, receita = 0;
    for (const k of kpisFiltrados) {
      if (getGrupoCategoria(k.categoria) === 'receita') receita++;
      else operacionais++;
    }
    return { operacionais, receita, total: kpisFiltrados.length };
  }, [kpisFiltrados]);

  // Ícones por categoria
  function getIconeCategoria(categoria: string): string {
    const map: Record<string, string> = {
      'financeiro': '💰',
      'faturamento': '💵',
      'receita': '📈',
      'custo': '💸',
      'produtividade': '⚡',
      'eficiência': '🎯',
      'frota': '🚛',
      'equipe': '👥',
      'cobertura': '📍',
      'qualidade': '✅',
      'operacional': '🔧',
      'peso e volume': '⚖️',
      'geral': '📋',
    };
    return map[categoria.toLowerCase().trim()] || '📊';
  }

  // Cor de fundo por tipo de grupo
  function getGrupoCor(grupo: 'receita' | 'operacional'): string {
    return grupo === 'receita' ? '#fefce8' : '#f0fdf4';
  }

  function getGrupoBorda(grupo: 'receita' | 'operacional'): string {
    return grupo === 'receita' ? '#f59e0b' : '#22c55e';
  }

  function getGrupoLabel(grupo: 'receita' | 'operacional'): { label: string; icon: string } {
    return grupo === 'receita'
      ? { label: 'Receita', icon: '💰' }
      : { label: 'Operacional', icon: '🔧' };
  }

  // ──────────────────────────────────────
  // Render: TELA DE SELEÇÃO DE TIPO
  // ──────────────────────────────────────
  function renderTelaSelecaoTipo() {
    // Mapeia todos os tipos disponíveis com contagem (0 se não houver KPI)
    const todosTipos = Object.keys(TIPOS_SERVICO_LABELS) as string[];
    const contagemMap = new Map(tiposComKpis.map(t => [t.tipo, t.total]));
    const tiposRender = todosTipos.map(tipo => ({
      tipo,
      label: (TIPOS_SERVICO_LABELS as any)[tipo] || tipo,
      total: contagemMap.get(tipo) || 0,
      descricao: (TIPOS_SERVICO_META as any)[tipo]?.descricao || '',
    }));

    return (
      <div style={{ padding: '1.5rem 2rem', maxWidth: '960px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button className="btn btn-ghost" onClick={() => navigate(-1)}>
              <FiArrowLeft size={14} /> Voltar
            </button>
            <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b' }}>
              Biblioteca de KPIs Universais
            </h2>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#94a3b8', background: '#f1f5f9', padding: '0.3rem 0.6rem', borderRadius: '6px' }}>
            {tiposComKpis.reduce((acc, t) => acc + t.total, 0)} KPI(s) no total
          </div>
        </div>

        {/* Subtítulo */}
        <p style={{ color: '#64748b', fontSize: '0.88rem', marginBottom: '1.25rem' }}>
          Selecione um tipo de serviço para visualizar e gerenciar seus KPIs universais.
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
                borderRadius: '10px',
                padding: '1rem',
                border: '2px dashed #d1d5db',
                cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
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
                    🔍 Todos os tipos
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    {tiposComKpis.reduce((acc, t) => acc + t.total, 0)} KPI(s)
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.3 }}>
                Ver todos os KPIs universais sem filtro de tipo
              </div>
            </div>

            {/* Cards de cada tipo */}
            {tiposRender.map(({ tipo, label, total, descricao }) => (
              <div
                key={tipo}
                onClick={() => setTipoSelecionado(tipo)}
                style={{
                  background: 'white',
                  borderRadius: '10px',
                  padding: '1rem',
                  border: '1px solid #e2e8f0',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                  opacity: total === 0 ? 0.5 : 1,
                }}
                onMouseEnter={e => { if (total > 0) { e.currentTarget.style.borderColor = getTipoCor(tipo); e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; }}
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
                      {total} KPI(s) {total === 0 && '(sem KPIs)'}
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
                {total > 0 && (
                  <div style={{ marginTop: '0.25rem' }}>
                    <span style={{
                      display: 'inline-block',
                      background: getTipoCor(tipo) + '12',
                      color: getTipoCor(tipo),
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      padding: '0.15rem 0.5rem',
                      borderRadius: '4px',
                    }}>
                      {total} KPI{total !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ──────────────────────────────────────
  // Render: TELA DE LISTAGEM DE KPIs + GRÁFICOS
  // ──────────────────────────────────────
  function renderTelaListagemKpis() {
    const isTodos = tipoSelecionado === '__todos__';
    const tipoLabel = isTodos
      ? '🔍 Todos os Tipos'
      : getTipoLabel(tipoSelecionado || '');

    return (
      <div style={{ padding: '1.5rem 2rem', maxWidth: '1100px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button className="btn btn-ghost" onClick={() => setTipoSelecionado(null)}>
              <FiArrowLeft size={14} /> Tipos
            </button>
            <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b' }}>
              {tipoLabel}
            </h2>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {abaAtiva === 'kpis' && (
              <button className="btn btn-primary" onClick={handleNovo} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem' }}>
                <FiPlus size={14} /> Novo KPI Universal
              </button>
            )}
          </div>
        </div>

        {/* ═══ ABAS: KPIs | Gráficos Padrão | Gráficos ═══ */}
        <div style={{
          display: 'flex', gap: 0, marginBottom: '1.25rem',
          borderBottom: '2px solid #e2e8f0',
          flexWrap: 'wrap',
        }}>
          <button
            onClick={() => setAbaAtiva('kpis')}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.55rem 1rem',
              border: 'none', background: 'transparent',
              fontSize: '0.82rem', fontWeight: abaAtiva === 'kpis' ? 700 : 500,
              color: abaAtiva === 'kpis' ? '#6366f1' : '#64748b',
              cursor: 'pointer',
              borderBottom: abaAtiva === 'kpis' ? '2px solid #6366f1' : '2px solid transparent',
              marginBottom: '-2px',
              transition: 'all 0.15s',
            }}
          >
            <FiFolder size={14} /> KPIs {!carregando && <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>({kpis.length})</span>}
          </button>
          <button
            onClick={() => setAbaAtiva('graficos_padrao')}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.55rem 1rem',
              border: 'none', background: 'transparent',
              fontSize: '0.82rem', fontWeight: abaAtiva === 'graficos_padrao' ? 700 : 500,
              color: abaAtiva === 'graficos_padrao' ? '#6366f1' : '#64748b',
              cursor: 'pointer',
              borderBottom: abaAtiva === 'graficos_padrao' ? '2px solid #6366f1' : '2px solid transparent',
              marginBottom: '-2px',
              transition: 'all 0.15s',
            }}
          >
            <FiBarChart2 size={14} /> Gráficos Padrão {!carregandoGraficos && <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>({graficosBiblioteca.length})</span>}
          </button>
          <button
            onClick={() => setAbaAtiva('graficos')}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.55rem 1rem',
              border: 'none', background: 'transparent',
              fontSize: '0.82rem', fontWeight: abaAtiva === 'graficos' ? 700 : 500,
              color: abaAtiva === 'graficos' ? '#6366f1' : '#64748b',
              cursor: 'pointer',
              borderBottom: abaAtiva === 'graficos' ? '2px solid #6366f1' : '2px solid transparent',
              marginBottom: '-2px',
              transition: 'all 0.15s',
            }}
          >
            <FiBarChart2 size={14} /> Gráficos {servicosIndicadores.length > 0 && <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>({servicosIndicadores.length})</span>}
          </button>
        </div>

        {/* ═══ CONTEÚDO: KPIs ═══ */}
        {abaAtiva === 'kpis' && (
        <>
        {/* ─── Barra de filtros: busca + operacional/receita ─── */}
        <div style={{
          display: 'flex', gap: '0.75rem', marginBottom: '1.25rem',
          alignItems: 'center', flexWrap: 'wrap',
        }}>
          {/* Busca */}
          <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '350px' }}>
            <FiSearch size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Buscar por nome, label, descrição..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{
                width: '100%', padding: '0.5rem 0.5rem 0.5rem 2rem',
                border: '1px solid #e2e8f0', borderRadius: '8px',
                fontSize: '0.82rem', outline: 'none',
                background: '#fff',
              }}
            />
          </div>

          {/* ─── Pills: Todos | Operacionais | Receita ─── */}
          <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
            {([
              { value: 'todos', label: '📋 Todos', color: '#6366f1' },
              { value: 'operacionais', label: '🔧 Operacionais', color: '#22c55e' },
              { value: 'receita', label: '💰 Receita', color: '#f59e0b' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => setTipoFiltro(opt.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.25rem',
                  padding: '0.4rem 0.65rem',
                  borderRadius: '20px',
                  border: `1.5px solid ${tipoFiltro === opt.value ? opt.color : '#e2e8f0'}`,
                  background: tipoFiltro === opt.value ? `${opt.color}12` : '#fff',
                  color: tipoFiltro === opt.value ? opt.color : '#64748b',
                  fontWeight: tipoFiltro === opt.value ? 700 : 500,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { if (tipoFiltro !== opt.value) { e.currentTarget.style.borderColor = opt.color; e.currentTarget.style.color = opt.color; }}}
                onMouseLeave={e => { if (tipoFiltro !== opt.value) { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#64748b'; }}}
              >
                {opt.label}
                {tipoFiltro === opt.value && opt.value !== 'todos' && (
                  <span style={{
                    fontSize: '0.6rem',
                    background: opt.color,
                    color: '#fff',
                    borderRadius: '50%',
                    width: '16px', height: '16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700,
                  }}>
                    {opt.value === 'operacionais' ? statsFiltro.operacionais : statsFiltro.receita}
                  </span>
                )}
              </button>
            ))}
          </div>

          <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: 'auto' }}>
            <strong style={{ color: '#475569' }}>{statsFiltro.total}</strong> KPI(s)
            {statsFiltro.receita > 0 && (
              <span style={{ marginLeft: '0.3rem' }}>
                · <span style={{ color: '#f59e0b' }}>{statsFiltro.receita} receita</span>
              </span>
            )}
            {statsFiltro.operacionais > 0 && (
              <span style={{ marginLeft: '0.3rem' }}>
                · <span style={{ color: '#22c55e' }}>{statsFiltro.operacionais} operacionais</span>
              </span>
            )}
          </span>
        </div>

        {/* Lista de KPIs */}
        {carregando ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[1,2,3,4].map(i => (
              <div key={i} className="skeleton" style={{ height: '80px', borderRadius: '8px' }} />
            ))}
          </div>
        ) : kpisFiltrados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
            <FiInfo size={40} style={{ opacity: 0.2, marginBottom: '0.75rem' }} />
            <h3 style={{ fontSize: '1rem', margin: '0 0 0.3rem' }}>
              Nenhum KPI universal encontrado
            </h3>
            <p style={{ fontSize: '0.85rem', margin: 0 }}>
              {busca
                ? 'Nenhum KPI corresponde à sua busca.'
                : `Nenhum KPI cadastrado para este tipo. Crie o primeiro clicando em "Novo KPI Universal".`
              }
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {categoriasOrdenadas.map(([categoria, kpisDaCategoria]) => {
              const grupo = getGrupoCategoria(categoria);
              const grupoInfo = getGrupoLabel(grupo);
              const icone = getIconeCategoria(categoria);
              return (
              <div key={categoria}>
                {/* ─── Header da Categoria ─── */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  marginBottom: '0.5rem', padding: '0.5rem 0.75rem',
                  background: getGrupoCor(grupo),
                  borderRadius: '8px',
                  borderLeft: `3px solid ${getGrupoBorda(grupo)}`,
                }}>
                  <span style={{ fontSize: '1.1rem' }}>{icone}</span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1e293b' }}>
                      {categoria}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginLeft: '0.3rem' }}>
                      ({kpisDaCategoria.length})
                    </span>
                  </div>
                  <span style={{
                    fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                    padding: '0.2rem 0.5rem', borderRadius: '4px',
                    background: grupo === 'receita' ? '#fef3c7' : '#dcfce7',
                    color: grupo === 'receita' ? '#b45309' : '#16a34a',
                    letterSpacing: '0.3px',
                    display: 'flex', alignItems: 'center', gap: '0.2rem',
                  }}>
                    {grupoInfo.icon} {grupoInfo.label}
                  </span>
                </div>

                {/* ─── Lista de KPIs ─── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {kpisDaCategoria.map(kpi => (
                    <div key={kpi.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.65rem',
                      padding: '0.6rem 0.75rem',
                      background: 'white',
                      borderRadius: '8px',
                      border: `1px solid ${grupo === 'receita' ? '#fde68a' : '#e2e8f0'}`,
                      boxShadow: grupo === 'receita'
                        ? '0 1px 4px rgba(245,158,11,0.06)'
                        : '0 1px 3px rgba(0,0,0,0.04)',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = kpi.cor; e.currentTarget.style.boxShadow = `0 2px 8px ${kpi.cor}15`; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = grupo === 'receita' ? '#fde68a' : '#e2e8f0'; e.currentTarget.style.boxShadow = grupo === 'receita' ? '0 1px 4px rgba(245,158,11,0.06)' : '0 1px 3px rgba(0,0,0,0.04)'; }}
                  >
                    {/* Indicador de cor + ícone */}
                    <div style={{
                      width: '34px', height: '34px', borderRadius: '8px',
                      background: `${kpi.cor}15`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <span style={{
                        width: '12px', height: '12px', borderRadius: '4px',
                        background: kpi.cor, display: 'inline-block',
                      }} />
                    </div>

                    {/* Conteúdo principal */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '0.85rem', color: '#1e293b' }}>
                          {kpi.label}
                        </strong>
                        {kpi.unidade && (
                          <span style={{
                            fontSize: '0.62rem', color: '#64748b',
                            background: '#f1f5f9', padding: '0.1rem 0.3rem',
                            borderRadius: '4px', fontWeight: 600,
                          }}>
                            {kpi.unidade}
                          </span>
                        )}
                        {!isTodos && (
                          <span style={{
                            fontSize: '0.6rem', padding: '0.1rem 0.35rem',
                            borderRadius: '4px', background: '#ede9fe',
                            color: '#6d28d9', fontWeight: 600,
                          }}>
                            {getTipoLabel(kpi.tipoServico)
                              .replace(/^[^\s]+\s/, '')
                              .trim()}
                          </span>
                        )}
                        <span style={{
                          fontSize: '0.6rem', padding: '0.1rem 0.3rem',
                          borderRadius: '4px', fontWeight: 600,
                          background: grupo === 'receita' ? '#fef3c7' : '#dcfce7',
                          color: grupo === 'receita' ? '#b45309' : '#16a34a',
                        }}>
                          {grupoInfo.label}
                        </span>
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                        marginTop: '0.15rem',
                      }}>
                        <code style={{
                          background: '#f8fafc', padding: '0.1rem 0.4rem',
                          borderRadius: '4px', fontSize: '0.68rem',
                          color: '#64748b', border: '1px solid #f1f5f9',
                          maxWidth: '280px', overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {kpi.formula}
                        </code>
                        {kpi.descricao && (
                          <span style={{
                            fontSize: '0.68rem', color: '#94a3b8',
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap', maxWidth: '200px',
                          }}>
                            — {kpi.descricao}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Ações */}
                    <div style={{ display: 'flex', gap: '0.2rem', flexShrink: 0 }}>
                      <button
                        onClick={() => handleEditar(kpi)}
                        title="Editar"
                        style={{
                          background: '#f1f5f9', border: 'none', borderRadius: '5px',
                          padding: '0.35rem 0.45rem', cursor: 'pointer', color: '#475569',
                          display: 'flex', alignItems: 'center', transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9'; }}
                      >
                        <FiEdit2 size={12} />
                      </button>
                      <button
                        onClick={() => handleDuplicar(kpi.id)}
                        title="Duplicar"
                        style={{
                          background: '#f1f5f9', border: 'none', borderRadius: '5px',
                          padding: '0.35rem 0.45rem', cursor: 'pointer', color: '#475569',
                          display: 'flex', alignItems: 'center', transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9'; }}
                      >
                        <FiCopy size={12} />
                      </button>
                      {confirmarExcluir === kpi.id ? (
                        <div style={{ display: 'flex', gap: '0.2rem' }}>
                          <button
                            onClick={() => handleExcluir(kpi.id)}
                            style={{
                              background: '#dc2626', color: 'white', border: 'none',
                              borderRadius: '5px', padding: '0.35rem 0.45rem',
                              fontSize: '0.62rem', cursor: 'pointer', fontWeight: 600,
                            }}
                          >
                            Excluir
                          </button>
                          <button
                            onClick={() => setConfirmarExcluir(null)}
                            style={{
                              background: '#e2e8f0', border: 'none', borderRadius: '5px',
                              padding: '0.35rem 0.45rem', fontSize: '0.62rem', cursor: 'pointer',
                            }}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmarExcluir(kpi.id)}
                          title="Excluir"
                          style={{
                            background: '#fef2f2', border: 'none', borderRadius: '5px',
                            padding: '0.35rem 0.45rem', cursor: 'pointer', color: '#dc2626',
                            display: 'flex', alignItems: 'center', transition: 'all 0.15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#fef2f2'; }}
                        >
                          <FiTrash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  ))}
                </div>
              </div>
            );
            })}
          </div>
        )}

        </>

        )}

        {/* ═══ CONTEÚDO: GRÁFICOS PADRÃO ═══ */}
        {abaAtiva === 'graficos_padrao' && (
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              marginBottom: '0.75rem', flexWrap: 'wrap',
            }}>
              <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0, flex: 1 }}>
                Gerencie os gráficos padrão que são gerados automaticamente para novos serviços deste tipo.
                <strong> Desative</strong> os que não desejar ou <strong>ative</strong> novos.
              </p>
            </div>

            {carregandoGraficos ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {[1,2,3,4].map(i => (
                  <div key={i} className="skeleton" style={{ height: '56px', borderRadius: '8px' }} />
                ))}
              </div>
            ) : graficosBiblioteca.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                <FiBarChart2 size={36} style={{ opacity: 0.2, marginBottom: '0.5rem' }} />
                <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.25rem' }}>
                  Nenhum gráfico padrão na biblioteca
                </h3>
                <p style={{ fontSize: '0.82rem', margin: 0 }}>
                  {isTodos
                    ? 'Nenhum tipo de serviço possui gráficos cadastrados.'
                    : `Nenhum gráfico cadastrado para ${tipoLabel}.`}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {graficosBiblioteca.map(grafico => {
                  const estiloNomeGrafico: Record<string, { bg: string; icon: string; label: string }> = {
                    barra: { bg: '#eff6ff', icon: '📊', label: 'Barras' },
                    linha: { bg: '#f0fdf4', icon: '📈', label: 'Linha' },
                    pizza: { bg: '#fefce8', icon: '🥧', label: 'Pizza' },
                    area: { bg: '#f5f3ff', icon: '🗺️', label: 'Área' },
                    donut: { bg: '#fdf2f8', icon: '🍩', label: 'Donut' },
                  };
                  const info = estiloNomeGrafico[grafico.tipo] || { bg: '#f1f5f9', icon: '📊', label: grafico.tipo };

                  return (
                    <div
                      key={grafico.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.65rem',
                        padding: '0.55rem 0.75rem',
                        background: grafico.ativo ? 'white' : '#f8fafc',
                        borderRadius: '8px',
                        border: `1px solid ${grafico.ativo ? '#e2e8f0' : '#f1f5f9'}`,
                        opacity: grafico.ativo ? 1 : 0.65,
                        transition: 'all 0.15s',
                      }}
                    >
                      {/* Ícone do tipo */}
                      <span style={{
                        fontSize: '1.1rem', width: '32px', height: '32px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: info.bg, borderRadius: '6px',
                        flexShrink: 0,
                      }}>
                        {info.icon}
                      </span>

                      {/* Conteúdo */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: '0.85rem', color: '#1e293b' }}>
                            {grafico.titulo}
                          </strong>
                          <span style={{
                            fontSize: '0.65rem', background: info.bg, color: '#475569',
                            padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 600,
                          }}>
                            {info.label}
                          </span>
                          {grafico.isPersonalizado && (
                            <span style={{
                              fontSize: '0.6rem', background: '#fefce8', color: '#b45309',
                              padding: '0.1rem 0.3rem', borderRadius: '4px', fontWeight: 600,
                              border: '1px solid #fde68a',
                            }}>
                              <FiStar size={9} style={{ marginRight: '2px' }} />
                              Personalizado
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.1rem' }}>
                          {grafico.descricao || (
                            <>
                              {grafico.isContagem
                                ? `Agrupa por: ${(grafico.placeholderEixoX || []).join(', ')}`
                                : `Eixo X: ${(grafico.placeholderEixoX || []).join(', ')}${grafico.placeholderEixoY?.length ? ` | Eixo Y: ${grafico.placeholderEixoY.join(', ')}` : ''}`
                              }
                            </>
                          )}
                        </div>
                      </div>

                      {/* Ações */}
                      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexShrink: 0 }}>
                        {/* Toggle ativo/inativo */}
                        <button
                          onClick={() => handleToggleGrafico(grafico.id, !grafico.ativo)}
                          disabled={toggleGraficoId === grafico.id}
                          title={grafico.ativo ? 'Desativar gráfico' : 'Ativar gráfico'}
                          style={{
                            background: grafico.ativo ? '#ecfdf5' : '#f1f5f9',
                            border: `1px solid ${grafico.ativo ? '#86efac' : '#e2e8f0'}`,
                            borderRadius: '6px',
                            padding: '0.3rem 0.5rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            color: grafico.ativo ? '#16a34a' : '#94a3b8',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            transition: 'all 0.15s',
                          }}
                        >
                          {toggleGraficoId === grafico.id ? (
                            <span style={{ fontSize: '0.7rem' }}>...</span>
                          ) : grafico.ativo ? (
                            <><FiToggleRight size={14} /> Ativo</>
                          ) : (
                            <><FiToggleLeft size={14} /> Inativo</>
                          )}
                        </button>

                        {/* Excluir (apenas personalizados) */}
                        {grafico.isPersonalizado && (
                          <>
                            {confirmarExcluirGrafico === grafico.id ? (
                              <div style={{ display: 'flex', gap: '0.25rem' }}>
                                <button
                                  onClick={() => handleExcluirGrafico(grafico.id)}
                                  style={{
                                    background: '#dc2626', color: 'white', border: 'none',
                                    borderRadius: '4px', padding: '0.25rem 0.4rem',
                                    fontSize: '0.65rem', cursor: 'pointer', fontWeight: 600,
                                  }}
                                >
                                  Confirmar
                                </button>
                                <button
                                  onClick={() => setConfirmarExcluirGrafico(null)}
                                  style={{
                                    background: '#e2e8f0', border: 'none', borderRadius: '4px',
                                    padding: '0.25rem 0.4rem', fontSize: '0.65rem', cursor: 'pointer',
                                  }}
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmarExcluirGrafico(grafico.id)}
                                title="Remover da biblioteca"
                                style={{
                                  background: '#fef2f2', border: 'none', borderRadius: '4px',
                                  padding: '0.3rem 0.4rem', cursor: 'pointer', color: '#dc2626',
                                  fontSize: '0.72rem',
                                }}
                              >
                                <FiTrash2 size={13} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ CONTEÚDO: GRÁFICOS (INDICADORES POR TIPO) ═══ */}
        {abaAtiva === 'graficos' && (
          <div>
            {/* Stats rápidos */}
            <div style={{
              display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap',
            }}>
              <div style={{
                background: 'white', borderRadius: '8px', padding: '0.65rem 1rem',
                border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.5rem',
              }}>
                <span style={{ fontSize: '1.2rem' }}>📊</span>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Serviços</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>{totalServicosTipo}</div>
                </div>
              </div>
              <div style={{
                background: 'white', borderRadius: '8px', padding: '0.65rem 1rem',
                border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.5rem',
              }}>
                <span style={{ fontSize: '1.2rem' }}>📋</span>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Registros</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>{totalRegistrosTipo.toLocaleString('pt-BR')}</div>
                </div>
              </div>
              <div style={{
                background: 'white', borderRadius: '8px', padding: '0.65rem 1rem',
                border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.5rem',
              }}>
                <span style={{ fontSize: '1.2rem' }}>🎯</span>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Indicadores</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
                    {(kpisAgregadosPorTipo[tipoSelecionado || '__todos__'] || []).length}
                  </div>
                </div>
              </div>
            </div>

            {carregandoIndicadores ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                {[1,2].map(i => (
                  <div key={i} className="skeleton" style={{ height: '280px', borderRadius: '10px' }} />
                ))}
              </div>
            ) : servicosIndicadores.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                <FiBarChart2 size={36} style={{ opacity: 0.2, marginBottom: '0.5rem' }} />
                <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.25rem' }}>
                  Nenhum dado disponível
                </h3>
                <p style={{ fontSize: '0.82rem', margin: 0 }}>
                  Nenhum serviço deste tipo possui dados processados com indicadores.
                </p>
              </div>
            ) : (
              <>
                {/* Grid de gráficos */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '1rem' }}>
                  {/* Gráfico 1: KPIs agregados (barras) */}
                  <div style={{
                    background: 'white', borderRadius: '10px', padding: '1rem',
                    border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  }}>
                    <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#1e293b' }}>
                      📊 Indicadores — Média por Serviço
                    </h4>
                    {(() => {
                      const kpisArr = kpisAgregadosPorTipo[tipoSelecionado || '__todos__'] || [];
                      const dados = kpisArr.slice(0, 10).map(k => ({
                        name: k.nome.length > 16 ? k.nome.substring(0, 16) + '...' : k.nome,
                        nomeCompleto: k.nome,
                        media: Math.round(k.media * 100) / 100,
                        total: Math.round(k.total * 100) / 100,
                      }));
                      return dados.length > 0 ? (
                        <ResponsiveContainer width="100%" height={260}>
                          <BarChart data={dados} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis type="number" tick={{ fontSize: 10 }} />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={110} />
                            <Tooltip
                              formatter={(value: number) => value.toLocaleString('pt-BR')}
                              labelFormatter={(label) => `KPI: ${label}`}
                            />
                            <Bar dataKey="media" name="Média" fill={getTipoCor(tipoSelecionado || '')} radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '50px 0', color: '#94a3b8', fontSize: '0.8rem' }}>
                          Nenhum indicador com dados
                        </div>
                      );
                    })()}
                  </div>

                  {/* Gráfico 2: Distribuição de registros entre serviços (pizza) */}
                  <div style={{
                    background: 'white', borderRadius: '10px', padding: '1rem',
                    border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  }}>
                    <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#1e293b' }}>
                      🥧 Registros por Serviço
                    </h4>
                    {(() => {
                      const dadosPizza = servicosIndicadores
                        .map(sv => ({
                          name: sv.nome.length > 14 ? sv.nome.substring(0, 14) + '...' : sv.nome,
                          nomeCompleto: sv.nome,
                          value: sv.totalRegistros,
                        }))
                        .sort((a: any, b: any) => b.value - a.value);

                      return dadosPizza.length > 0 ? (
                        <ResponsiveContainer width="100%" height={260}>
                          <PieChart>
                            <Pie
                              data={dadosPizza}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={85}
                              innerRadius={35}
                              label={({ name, percent }: any) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                            >
                              {dadosPizza.map((_: any, i: number) => (
                                <Cell key={i} fill={CORES_GRAFICOS[i % CORES_GRAFICOS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => value.toLocaleString('pt-BR')} />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '50px 0', color: '#94a3b8', fontSize: '0.8rem' }}>
                          Sem dados de registro
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Gráfico 3: Top KPIs (barras horizontais de total) */}
                {(() => {
                  const kpisArr = kpisAgregadosPorTipo[tipoSelecionado || '__todos__'] || [];
                  const dadosTotal = kpisArr.slice(0, 8).map(k => ({
                    name: k.nome.length > 16 ? k.nome.substring(0, 16) + '...' : k.nome,
                    nomeCompleto: k.nome,
                    total: Math.round(k.total * 100) / 100,
                  }));
                  return dadosTotal.length > 0 ? (
                    <div style={{
                      background: 'white', borderRadius: '10px', padding: '1rem',
                      border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      marginBottom: '1rem',
                    }}>
                      <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#1e293b' }}>
                        📈 Top Indicadores — Total Acumulado
                      </h4>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={dadosTotal}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(value: number) => value.toLocaleString('pt-BR')} />
                          <Bar dataKey="total" name="Total" fill={getTipoCor(tipoSelecionado || '')} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : null;
                })()}

                {/* Lista de Indicadores com valores */}
                {(() => {
                  const kpisArr = kpisAgregadosPorTipo[tipoSelecionado || '__todos__'] || [];
                  return kpisArr.length > 0 ? (
                    <div style={{
                      background: 'white', borderRadius: '10px', padding: '1rem',
                      border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      marginBottom: '1rem',
                    }}>
                      <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#1e293b' }}>
                        📋 Todos os Indicadores com Valores
                      </h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {kpisArr.map((kpi, idx) => (
                          <div key={kpi.nome} style={{
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            padding: '0.4rem 0.65rem',
                            background: `${getTipoCor(tipoSelecionado || '')}06`,
                            border: `1px solid ${getTipoCor(tipoSelecionado || '')}20`,
                            borderRadius: '8px', fontSize: '0.78rem',
                          }}>
                            <span style={{
                              width: '8px', height: '8px', borderRadius: '50%',
                              background: CORES_GRAFICOS[idx % CORES_GRAFICOS.length],
                              display: 'inline-block', flexShrink: 0,
                            }} />
                            <div>
                              <strong style={{ color: '#1e293b' }}>{kpi.nome}</strong>
                              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.1rem' }}>
                                <span style={{ color: '#64748b', fontSize: '0.7rem' }}>
                                  Média: <strong style={{ color: getTipoCor(tipoSelecionado || '') }}>
                                    {kpi.formato === 'moeda' ? 'R$ ' : ''}{kpi.media.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                                  </strong>
                                </span>
                                <span style={{ color: '#64748b', fontSize: '0.7rem' }}>
                                  Total: <strong>{kpi.total.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</strong>
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}

                {/* Serviços deste tipo */}
                <div style={{
                  background: 'white', borderRadius: '10px', padding: '1rem',
                  border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}>
                  <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#1e293b' }}>
                    🏢 Serviços ({servicosIndicadores.length})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {servicosIndicadores.map((sv: any) => (
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
                          {sv.kpis.length} KPI(s)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    );
  }

  // ──────────────────────────────────────
  // Render: FORMULÁRIO MODAL
  // ──────────────────────────────────────
  function renderFormModal() {
    return (
      <div className="modal-backdrop" onClick={() => setMostrarForm(false)}>
        <div className="modal" onClick={e => e.stopPropagation()} style={{
          maxWidth: '660px', maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
        }}>
          <div className="modal-header">
            <h3 style={{ margin: 0, fontSize: '1rem' }}>
              {editandoId ? 'Editar KPI Universal' : 'Novo KPI Universal'}
            </h3>
            <button
              className="btn-ghost"
              onClick={() => setMostrarForm(false)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#64748b', padding: '0.3rem', borderRadius: '4px',
              }}
            >
              X
            </button>
          </div>
          <div className="modal-body" style={{ padding: '1rem 1.25rem', overflow: 'auto', flex: 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              {/* Nome */}
              <div>
                <label style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>Nome *</label>
                <input
                  type="text" value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex: Tonelagem Total"
                  style={{
                    width: '100%', padding: '0.4rem 0.5rem',
                    border: '1px solid #e2e8f0', borderRadius: '6px',
                    fontSize: '0.82rem', marginTop: '0.2rem',
                  }}
                />
              </div>
              {/* Label */}
              <div>
                <label style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>Label *</label>
                <input
                  type="text" value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="Ex: Tonelagem Total"
                  style={{
                    width: '100%', padding: '0.4rem 0.5rem',
                    border: '1px solid #e2e8f0', borderRadius: '6px',
                    fontSize: '0.82rem', marginTop: '0.2rem',
                  }}
                />
              </div>
              {/* Fórmula */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>Fórmula *</label>
                <input
                  type="text" value={form.formula}
                  onChange={e => setForm(f => ({ ...f, formula: e.target.value }))}
                  placeholder="Ex: SUM(PESO_PLACEHOLDER) / 1000"
                  style={{
                    width: '100%', padding: '0.4rem 0.5rem',
                    border: '1px solid #e2e8f0', borderRadius: '6px',
                    fontSize: '0.82rem', fontFamily: 'monospace', marginTop: '0.2rem',
                  }}
                />
              </div>
              {/* Categoria */}
              <div>
                <label style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>Categoria *</label>
                <input
                  type="text" value={form.categoria}
                  onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                  placeholder="Ex: Peso e Volume"
                  style={{
                    width: '100%', padding: '0.4rem 0.5rem',
                    border: '1px solid #e2e8f0', borderRadius: '6px',
                    fontSize: '0.82rem', marginTop: '0.2rem',
                  }}
                />
              </div>
              {/* Tipo de Serviço */}
              <div>
                <label style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>Tipo de Serviço *</label>
                <select
                  value={form.tipoServico}
                  onChange={e => setForm(f => ({ ...f, tipoServico: e.target.value }))}
                  style={{
                    width: '100%', padding: '0.4rem 0.5rem',
                    border: '1px solid #e2e8f0', borderRadius: '6px',
                    fontSize: '0.82rem', marginTop: '0.2rem',
                  }}
                >
                  {Object.entries(TIPOS_SERVICO_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              {/* Agregação */}
              <div>
                <label style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>Agregação</label>
                <select
                  value={form.agregacao}
                  onChange={e => setForm(f => ({ ...f, agregacao: e.target.value }))}
                  style={{
                    width: '100%', padding: '0.4rem 0.5rem',
                    border: '1px solid #e2e8f0', borderRadius: '6px',
                    fontSize: '0.82rem', marginTop: '0.2rem',
                  }}
                >
                  <option value="sum">Soma (SUM)</option>
                  <option value="avg">Média (AVG)</option>
                  <option value="count">Contagem (COUNT)</option>
                  <option value="min">Mínimo (MIN)</option>
                  <option value="max">Máximo (MAX)</option>
                </select>
              </div>
              {/* Formato */}
              <div>
                <label style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>Formato</label>
                <select
                  value={form.formato}
                  onChange={e => setForm(f => ({ ...f, formato: e.target.value }))}
                  style={{
                    width: '100%', padding: '0.4rem 0.5rem',
                    border: '1px solid #e2e8f0', borderRadius: '6px',
                    fontSize: '0.82rem', marginTop: '0.2rem',
                  }}
                >
                  <option value="numero">Número</option>
                  <option value="moeda">Moeda (R$)</option>
                  <option value="porcentagem">Porcentagem</option>
                </select>
              </div>
              {/* Unidade */}
              <div>
                <label style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>Unidade</label>
                <input
                  type="text" value={form.unidade}
                  onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))}
                  placeholder="Ex: ton, km, R$"
                  style={{
                    width: '100%', padding: '0.4rem 0.5rem',
                    border: '1px solid #e2e8f0', borderRadius: '6px',
                    fontSize: '0.82rem', marginTop: '0.2rem',
                  }}
                />
              </div>
              {/* Meta Sugerida */}
              <div>
                <label style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>Meta Sugerida</label>
                <input
                  type="number" value={form.metaSugerida}
                  onChange={e => setForm(f => ({ ...f, metaSugerida: e.target.value }))}
                  placeholder="Opcional"
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
                    style={{
                      width: '36px', height: '32px', padding: '2px',
                      border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer',
                    }}
                  />
                  <input
                    type="text" value={form.cor}
                    onChange={e => setForm(f => ({ ...f, cor: e.target.value }))}
                    style={{
                      flex: 1, padding: '0.4rem 0.5rem',
                      border: '1px solid #e2e8f0', borderRadius: '6px',
                      fontSize: '0.82rem',
                    }}
                  />
                </div>
              </div>
              {/* Descrição */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>Descrição</label>
                <textarea
                  value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="Descreva o que este KPI mede..."
                  rows={2}
                  style={{
                    width: '100%', padding: '0.4rem 0.5rem',
                    border: '1px solid #e2e8f0', borderRadius: '6px',
                    fontSize: '0.82rem', marginTop: '0.2rem', resize: 'vertical',
                  }}
                />
              </div>
              {/* Placeholders */}
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <label style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>
                    Placeholders (mapeamento automático de colunas)
                  </label>
                  <button
                    onClick={handleAddPlaceholder}
                    style={{
                      background: 'none', border: 'none', color: '#6366f1',
                      fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600,
                    }}
                  >
                    + Adicionar
                  </button>
                </div>
                {form.placeholders.map((ph, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem', alignItems: 'center' }}>
                    <input
                      type="text" value={ph.nome}
                      onChange={e => handlePlaceholderChange(idx, 'nome', e.target.value)}
                      placeholder="Placeholder (ex: PESO_PLACEHOLDER)"
                      style={{
                        flex: 2, padding: '0.35rem 0.4rem',
                        border: '1px solid #e2e8f0', borderRadius: '4px',
                        fontSize: '0.75rem', fontFamily: 'monospace',
                      }}
                    />
                    <input
                      type="text" value={ph.label}
                      onChange={e => handlePlaceholderChange(idx, 'label', e.target.value)}
                      placeholder="Label"
                      style={{
                        flex: 1, padding: '0.35rem 0.4rem',
                        border: '1px solid #e2e8f0', borderRadius: '4px',
                        fontSize: '0.75rem',
                      }}
                    />
                    <input
                      type="text" value={ph.colunasCandidatas}
                      onChange={e => handlePlaceholderChange(idx, 'colunasCandidatas', e.target.value)}
                      placeholder="Colunas (PESO, PESO TOTAL...)"
                      style={{
                        flex: 3, padding: '0.35rem 0.4rem',
                        border: '1px solid #e2e8f0', borderRadius: '4px',
                        fontSize: '0.75rem',
                      }}
                    />
                    <button
                      onClick={() => handleRemovePlaceholder(idx)}
                      style={{
                        background: '#fef2f2', border: 'none', borderRadius: '4px',
                        padding: '0.3rem 0.4rem', cursor: 'pointer', color: '#dc2626',
                        fontSize: '0.7rem',
                      }}
                    >
                      X
                    </button>
                  </div>
                ))}
                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                  Placeholders são nomes de colunas na fórmula que serão mapeados automaticamente para colunas reais do serviço.
                </div>
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
              style={{ fontSize: '0.82rem' }}
            >
              {editandoId ? 'Atualizar' : 'Criar KPI Universal'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────
  // Render principal
  // ──────────────────────────────────────
  return (
    <>
      {tipoSelecionado === null ? renderTelaSelecaoTipo() : renderTelaListagemKpis()}
      {mostrarForm && renderFormModal()}

      {/* Estilos globais */}
      <style>{`
        .modal-backdrop {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .modal {
          background: white;
          border-radius: 12px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.2);
          width: 90%;
          max-width: 560px;
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.85rem 1.25rem;
          border-bottom: 1px solid #e2e8f0;
        }
        .modal-body { padding: 1rem 1.25rem; }
        .modal-footer {
          padding: 0.75rem 1.25rem;
          border-top: 1px solid #e2e8f0;
          display: flex;
          gap: 0.5rem;
          justify-content: flex-end;
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
        .skeleton {
          background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border-radius: 6px;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </>
  );
}
