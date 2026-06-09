/* ============================================
   ServicoDashboard — Dashboard puro do serviço
   SEM upload, SEM histórico, SEM config, SEM gerar
   APENAS: KPIs, gráficos, filtros, exportar PDF
   URL: /contratos/:contractId/servicos/:servicoId/dashboard
   ============================================ */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FiFileText, FiDownload, FiFilter,
  FiRefreshCw, FiX, FiArrowLeft, FiBarChart2,
  FiCheckSquare, FiSquare, FiPlus, FiGrid,
  FiCalendar, FiClock,
} from 'react-icons/fi';
// ConfigModal removido — configuração de indicadores agora no fluxo unificado do contrato
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useKpiCalculator } from '../hooks/useKpiCalculator';
import type { KpiFiltros } from '../hooks/useKpiCalculator';
import { useSmartFilters } from '../hooks/useSmartFilters';
import SmartFilters from '../components/SmartFilters';
import KpiCard, { KpiGrid } from '../components/KpiCard';
import ChartGrid from '../components/ChartGrid';
import EmptyState from '../components/EmptyState';
import SkeletonLoader from '../components/SkeletonLoader';
import ExportPdfModal from '../components/ExportPdfModal';
import { TIPOS_SERVICO_LABELS } from '../types';
import '../styles/ContratoDetalhe.css';

const CORES = ['#059669', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#3b82f6', '#ec4899', '#84cc16', '#06b6d4'];

interface ColunaDetectada {
  nome: string;
  tipo: 'numero' | 'texto' | 'data' | 'hora' | 'desconhecido';
}

interface PadraoResponse {
  servico: {
    id: string;
    nome: string;
    padraoPlanilha: any;
  };
  uploads: { total: number; totalImportados: number };
}

export default function ServicoDashboard() {
  const { contractId, servicoId } = useParams<{ contractId: string; servicoId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { adicionarToast } = useToast();

  const [dados, setDados] = useState<PadraoResponse | null>(null);
  const [dadosBrutos, setDadosBrutos] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showFiltros, setShowFiltros] = useState(false);
  const [filtros, setFiltros] = useState<KpiFiltros>({});
  const [filtrosDinamicos, setFiltrosDinamicos] = useState<Record<string, string>>({});
  // KPIs universais da biblioteca (todos os tipos de serviço)
  const [kpisUniversais, setKpisUniversais] = useState<any[]>([]);
  const [kpisUniversaisLoading, setKpisUniversaisLoading] = useState(false);
  // Seleção de KPIs para ativar no dashboard
  const [kpisSelecionados, setKpisSelecionados] = useState<Set<string>>(new Set());
  const [ativandoKpis, setAtivandoKpis] = useState(false);
  const [aplicandoGraficos, setAplicandoGraficos] = useState(false);
  // Aba da seção inferior: KPIs ou Gráficos
  const [secaoAba, setSecaoAba] = useState<'kpis' | 'graficos'>('kpis');
  // Gráficos da biblioteca para listar na aba Gráficos
  const [graficosBiblioteca, setGraficosBiblioteca] = useState<any[]>([]);
  const [graficosBibliotecaLoading, setGraficosBibliotecaLoading] = useState(false);
  // Gráficos sugeridos/verificados para este serviço
  const [graficosSugeridos, setGraficosSugeridos] = useState<any[]>([]);
  const [graficosSugeridosLoading, setGraficosSugeridosLoading] = useState(false);
  const [graficosSugeridosInfo, setGraficosSugeridosInfo] = useState<any>(null);
  // Agrupamento dos sugeridos por tipo de serviço
  const graficosSugeridosPorTipo = useMemo(() => {
    const grupos: Record<string, any[]> = {};
    for (const g of graficosSugeridos) {
      const tipo = g.tipoServico || 'geral';
      if (!grupos[tipo]) grupos[tipo] = [];
      grupos[tipo].push(g);
    }
    return grupos;
  }, [graficosSugeridos]);

  // Detectar colunas de texto com valores categóricos para filtros inteligentes
  const colunasHoraSet = useMemo(() => new Set<string>(
    (dados?.servico?.padraoPlanilha?.colunas || [])
      .filter((c: any) => c.tipo === 'hora')
      .map((c: any) => c.nome)
  ), [dados]);

  const colunasNumSet = useMemo(() => new Set<string>(
    (dados?.servico?.padraoPlanilha?.colunas || [])
      .filter((c: any) => c.tipo === 'numero')
      .map((c: any) => c.nome)
  ), [dados]);

  const { colunasFiltro, temFiltros: temFiltrosInteligentes } = useSmartFilters({
    dadosBrutos,
    colunasHoraSet,
    colunasNumSet,
    maxValoresUnicos: 80,
    colunasForcadas: ['CAMINHAO', 'TIPO CAMINHAO', 'TIPO_CAMINHAO', 'tipoCaminhao', 'PLACA', 'REGIONAL', 'REGIAO'],
  });

  // Aplicar filtros dinâmicos nos dados brutos para os GRÁFICOS (filtragem local)
  const dadosFiltradosGraficos = useMemo(() => {
    if (!dadosBrutos.length) return [];
    if (Object.keys(filtrosDinamicos).length === 0) return dadosBrutos;

    const removerAcentos = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    return dadosBrutos.filter(d => {
      for (const [coluna, valor] of Object.entries(filtrosDinamicos)) {
        if (!valor) continue;
        let valorDado: any = d[coluna];
        if (valorDado === undefined || valorDado === null) {
          const colunaNorm = removerAcentos(coluna.toUpperCase().replace(/\s+/g, ''));
          for (const [k, v] of Object.entries(d)) {
            const kNorm = removerAcentos(k.toUpperCase().replace(/\s+/g, ''));
            if (kNorm === colunaNorm) { valorDado = v; break; }
          }
        }
        if (valorDado === undefined || valorDado === null || valorDado === '') return false;
        const dadoNorm = removerAcentos(String(valorDado).toUpperCase().trim());
        const valorNorm = removerAcentos(valor.toUpperCase().trim());
        if (dadoNorm !== valorNorm) return false;
      }
      return true;
    });
  }, [dadosBrutos, filtrosDinamicos]);

  // Sincronizar filtros dinamicos com o objeto de filtros do hook
  const filtrosCompletos = useMemo<KpiFiltros>(() => ({
    ...filtros,
    filtrosDinamicos: Object.keys(filtrosDinamicos).length > 0 ? filtrosDinamicos : undefined,
  }), [filtros, filtrosDinamicos]);

  const { kpiValores, execMetrics, configResumo, loading: loadingKpis, reload: reloadKpis } = useKpiCalculator({
    contractId: contractId!, servicoId: servicoId!, filtros: filtrosCompletos,
  });

  const hoje = new Date().toISOString().split('T')[0];

  // ─── Períodos predefinidos ───
  const PERIODOS = useMemo(() => [
    { label: 'Hoje', fn: () => ({ dataInicio: hoje, dataFim: hoje }) },
    { label: '7 dias', fn: () => {
      const d = new Date(); d.setDate(d.getDate() - 7);
      return { dataInicio: d.toISOString().split('T')[0], dataFim: hoje };
    }},
    { label: '30 dias', fn: () => {
      const d = new Date(); d.setDate(d.getDate() - 30);
      return { dataInicio: d.toISOString().split('T')[0], dataFim: hoje };
    }},
    { label: 'Este mês', fn: () => {
      const d = new Date(); d.setDate(1);
      return { dataInicio: d.toISOString().split('T')[0], dataFim: hoje };
    }},
    { label: 'Tudo', fn: () => ({}) },
  ], [hoje]);

  // Contagem de registros filtrados vs total
  const totalRegistrosBrutos = dadosBrutos.length;
  const qtdFiltrada = dadosFiltradosGraficos.length;
  const temFiltroAtivo = Object.values(filtros).some(v => v) || Object.values(filtrosDinamicos).some(v => v);
  const todosFiltros = useMemo(() => ({
    ...Object.fromEntries(Object.entries(filtros).filter(([, v]) => v)),
    ...filtrosDinamicos,
  }), [filtros, filtrosDinamicos]);

  const carregarDados = useCallback(async () => {
    if (!contractId || !servicoId) return;
    setCarregando(true);
    try {
      const [resPadrao, resBrutos] = await Promise.all([
        fetch(`/api/contracts/${contractId}/servicos/${servicoId}/padrao`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/contracts/${contractId}/servicos/${servicoId}/dados-brutos?limite=500`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (resPadrao.ok) setDados(await resPadrao.json());
      if (resBrutos.ok) setDadosBrutos((await resBrutos.json()).dados || []);
    } catch { adicionarToast('Erro ao carregar dados', 'error'); }
    finally { setCarregando(false); }
  }, [contractId, servicoId, token, adicionarToast]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  // Carregar KPIs universais da biblioteca (agrupados por tipo de serviço)
  useEffect(() => {
    if (!token) return;
    setKpisUniversaisLoading(true);
    fetch('/api/kpis-universais', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data && data.kpis) setKpisUniversais(data.kpis);
        else setKpisUniversais([]);
      })
      .catch(() => setKpisUniversais([]))
      .finally(() => setKpisUniversaisLoading(false));
  }, [token]);

  // Carregar gráficos da biblioteca para a aba Gráficos
  useEffect(() => {
    if (!token) return;
    setGraficosBibliotecaLoading(true);
    fetch('/api/graficos-padrao/biblioteca', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data && data.graficos) setGraficosBiblioteca(data.graficos);
        else setGraficosBiblioteca([]);
      })
      .catch(() => setGraficosBiblioteca([]))
      .finally(() => setGraficosBibliotecaLoading(false));
  }, [token]);

  // Carregar gráficos sugeridos para este serviço (endpoint de verificação)
  useEffect(() => {
    if (!token || !contractId || !servicoId) return;
    setGraficosSugeridosLoading(true);
    fetch(`/api/graficos-padrao/biblioteca/verificar-servico/${servicoId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data && data.graficos) {
          setGraficosSugeridos(data.graficos);
          setGraficosSugeridosInfo({
            tipoServico: data.tipoServico,
            colunas: data.colunas,
            jaAplicado: data.jaAplicado,
            graficosAtuais: data.graficosAtuais,
          });
        } else {
          setGraficosSugeridos([]);
          setGraficosSugeridosInfo(null);
        }
      })
      .catch(() => {
        setGraficosSugeridos([]);
        setGraficosSugeridosInfo(null);
      })
      .finally(() => setGraficosSugeridosLoading(false));
  }, [token, contractId, servicoId]);

  // Agrupar KPIs universais por tipo de serviço
  const kpisPorTipo = useMemo(() => {
    const grupos: Record<string, any[]> = {};
    for (const kpi of kpisUniversais) {
      const tipo = kpi.tipoServico || 'geral';
      if (!grupos[tipo]) grupos[tipo] = [];
      grupos[tipo].push(kpi);
    }
    return grupos;
  }, [kpisUniversais]);

  const colunas = useMemo<ColunaDetectada[]>(() => dados?.servico?.padraoPlanilha?.colunas || [], [dados]);
  const configServico = (dados?.servico as any)?.configDashboard;
  const graficosAtivos = useMemo(() => (configServico?.graficos || []).filter((g: any) => g.ativo), [configServico]);
  const servicoNome = dados?.servico?.nome || 'Dashboard';
  const temPlanilha = colunas.length > 0;
  const temKpis = kpiValores.length > 0;
  const totalRegistros = (dados?.uploads?.totalImportados ?? 0) || dadosBrutos.length || 0;

  // Alternar seleção de KPI universal
  const toggleSelecionarKpi = useCallback((kpiId: string) => {
    setKpisSelecionados(prev => {
      const novo = new Set(prev);
      if (novo.has(kpiId)) novo.delete(kpiId);
      else novo.add(kpiId);
      return novo;
    });
  }, []);

  // Ativar KPIs selecionados no serviço atual
  const ativarKpisSelecionados = useCallback(async () => {
    if (kpisSelecionados.size === 0 || !servicoId) return;
    setAtivandoKpis(true);
    try {
      const res = await fetch('/api/kpis-universais/ativar-multiplos', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ servicoId, kpiIds: Array.from(kpisSelecionados) }),
      });
      if (res.ok) {
        const data = await res.json();
        adicionarToast(`${data.totalAtivados} KPI(s) ativado(s) no dashboard!`, 'success');
        setKpisSelecionados(new Set());
        // Recarregar KPIs do dashboard
        setTimeout(() => { carregarDados(); reloadKpis(); }, 200);
      } else {
        const err = await res.json().catch(() => ({}));
        adicionarToast(err.error || 'Erro ao ativar KPIs', 'error');
      }
    } catch {
      adicionarToast('Erro de conexão ao ativar KPIs', 'error');
    } finally {
      setAtivandoKpis(false);
    }
  }, [kpisSelecionados, servicoId, token, adicionarToast, carregarDados, reloadKpis]);

  // Aplicar gráficos padrão baseados nas colunas da planilha
  const aplicarGraficosPadrao = useCallback(async () => {
    if (!contractId || !servicoId) return;
    setAplicandoGraficos(true);
    try {
      const res = await fetch(`/api/contracts/${contractId}/servicos/${servicoId}/aplicar-graficos-padrao`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        const totalGraficos = data.graficos?.length || data.total || 0;
        adicionarToast(`${totalGraficos} gráfico(s) gerado(s) com sucesso!`, 'success');
        setTimeout(() => { carregarDados(); }, 200);
      } else {
        const err = await res.json().catch(() => ({}));
        adicionarToast(err.error || 'Erro ao gerar gráficos padrão', 'error');
      }
    } catch {
      adicionarToast('Erro de conexão ao gerar gráficos', 'error');
    } finally {
      setAplicandoGraficos(false);
    }
  }, [contractId, servicoId, token, adicionarToast, carregarDados]);

  if (carregando) {
    return (
      <div style={{ padding: '1.5rem 2rem', maxWidth: '1100px', margin: '0 auto' }}>
        <SkeletonLoader tipo="kpi-grid" quantidade={4} />
        <SkeletonLoader tipo="chart" quantidade={2} />
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: '1100px', margin: '0 auto' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: '#94a3b8', marginBottom: '0.15rem' }}>
            <button className="btn btn-ghost" onClick={() => navigate('/dashboard?foco=' + servicoId)} style={{ fontSize: '0.72rem', padding: '0.1rem 0.3rem' }}>
              <FiArrowLeft size={12} /> Dashboard Principal
            </button>
            <span>/</span>
            <span style={{ color: '#64748b' }}>{servicoNome}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <FiBarChart2 size={18} /> {servicoNome}
            </h2>
            {/* Badge de gráficos padrão */}
            {configServico?.graficosPadraoAplicados && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                fontSize: '0.6rem', fontWeight: 700, color: '#4338ca',
                background: '#eef2ff', border: '1px solid #c7d2fe',
                borderRadius: '8px', padding: '0.15rem 0.45rem',
              }}>
                [GRAF] {configServico.graficosPadraoTotal || graficosAtivos.length} graficos padrao
                {configServico.graficosPadraoAplicadosEm && (
                  <span style={{ color: '#94a3b8', fontWeight: 400 }}>
                    &middot; {new Date(configServico.graficosPadraoAplicadosEm).toLocaleDateString('pt-BR')}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn btn-sm"
            onClick={() => navigate(`/contratos/${contractId}`)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.3rem 0.6rem', fontSize: '0.7rem', fontWeight: 600, color: '#475569', cursor: 'pointer' }}
          >
            <FiFileText size={12} /> Cadastro
          </button>
          <button
            className="btn btn-sm"
            onClick={() => navigate(`/contratos/${contractId}/servicos/${servicoId}/detalhes`)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.3rem 0.6rem', fontSize: '0.7rem', fontWeight: 600, color: '#475569', cursor: 'pointer' }}
          >
            <FiFileText size={12} /> Uploads
          </button>
          <button
            className="btn btn-sm"
            onClick={() => setShowExportModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: '#fefce8', border: '1px solid #f59e0b', borderRadius: '6px', padding: '0.3rem 0.6rem', fontSize: '0.7rem', fontWeight: 600, color: '#b45309', cursor: 'pointer' }}
          >
            <FiDownload size={12} /> PDF
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => { carregarDados(); reloadKpis(); }} title="Recarregar">
            <FiRefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* ═══ FILTROS — TEMA VERDE ═══ */}
      <div style={{
        background: 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)',
        border: `1.5px solid ${temFiltroAtivo ? '#22c55e' : '#bbf7d0'}`,
        borderRadius: '12px', marginBottom: '0.75rem', overflow: 'hidden',
        boxShadow: temFiltroAtivo
          ? '0 2px 12px rgba(34,197,94,0.15)'
          : '0 1px 4px rgba(0,0,0,0.04)',
        transition: 'all 0.25s ease',
      }}>
        {/* ─── HEADER ─── */}
        <button
          onClick={() => setShowFiltros(!showFiltros)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.6rem 1rem', border: 'none', background: 'transparent',
            fontSize: '0.82rem', fontWeight: 700,
            color: temFiltroAtivo ? '#166534' : '#15803d',
            cursor: 'pointer', letterSpacing: '0.3px',
          }}
        >
          <div style={{
            width: '28px', height: '28px', borderRadius: '8px',
            background: temFiltroAtivo ? '#22c55e' : '#dcfce7',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: temFiltroAtivo ? '#fff' : '#16a34a',
          }}>
            <FiFilter size={14} />
          </div>

          <span>Filtros</span>

          {temFiltroAtivo && (
            <span style={{
              fontSize: '0.65rem', fontWeight: 700, color: '#fff',
              background: '#22c55e', padding: '0.08rem 0.55rem',
              borderRadius: '10px', lineHeight: '1.4',
            }}>
              {Object.keys(todosFiltros).length}
            </span>
          )}

          <span style={{ flex: 1 }} />

          {/* Tags no header recolhido */}
          {temFiltroAtivo && !showFiltros && (
            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '180px', overflow: 'hidden' }}>
              {(filtros.dataInicio || filtros.dataFim) && (
                <span style={{
                  fontSize: '0.6rem', fontWeight: 600, color: '#166534',
                  background: '#dcfce7', padding: '0.08rem 0.45rem',
                  borderRadius: '6px', whiteSpace: 'nowrap',
                }}>
                  📅 {filtros.dataInicio?.slice(5) || '?'}-{filtros.dataFim?.slice(5) || '?'}
                </span>
              )}
              {Object.entries(filtrosDinamicos).slice(0, 2).map(([col, val]) => (
                <span key={col} style={{
                  fontSize: '0.6rem', fontWeight: 600, color: '#166534',
                  background: '#dcfce7', padding: '0.08rem 0.45rem',
                  borderRadius: '6px', whiteSpace: 'nowrap',
                }}>
                  {String(val).length > 10 ? String(val).slice(0, 8) + '…' : val}
                </span>
              ))}
              {Object.keys(filtrosDinamicos).length > 2 && (
                <span style={{ fontSize: '0.55rem', color: '#16a34a', fontWeight: 600 }}>
                  +{Object.keys(filtrosDinamicos).length - 2}
                </span>
              )}
            </div>
          )}

          <span style={{
            fontSize: '0.7rem', color: '#86efac',
            transform: showFiltros ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.25s',
          }}>▾</span>
        </button>

        {/* ─── CONTEÚDO ─── */}
        {showFiltros && (
          <div style={{ padding: '0.3rem 1rem 0.8rem', borderTop: '1.5px solid #dcfce7' }}>
            {/* Linha 1: Períodos */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              {PERIODOS.map(p => {
                const periodoAtual = p.fn();
                const isAtivo = JSON.stringify(periodoAtual) === JSON.stringify({ dataInicio: filtros.dataInicio, dataFim: filtros.dataFim });
                return (
                  <button
                    key={p.label}
                    onClick={() => {
                      const novoPeriodo = p.fn();
                      setFiltros(prev => ({ ...prev, ...novoPeriodo }));
                    }}
                    style={{
                      padding: '0.3rem 0.7rem', fontSize: '0.72rem', fontWeight: 700,
                      border: 'none', borderRadius: '8px', cursor: 'pointer',
                      background: isAtivo ? '#16a34a' : '#f0fdf4',
                      color: isAtivo ? '#fff' : '#15803d',
                      boxShadow: isAtivo ? '0 2px 8px rgba(22,163,74,0.25)' : 'none',
                      transition: 'all 0.15s',
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}

              <div style={{ width: '2px', height: '20px', background: '#bbf7d0', borderRadius: '2px', margin: '0 0.2rem' }} />

              <input type="date" value={filtros.dataInicio || ''} max={hoje}
                onChange={e => { setFiltros(prev => ({ ...prev, dataInicio: e.target.value || undefined })); }}
                style={{
                  padding: '0.3rem 0.5rem', border: '1.5px solid #bbf7d0',
                  borderRadius: '8px', fontSize: '0.7rem', width: '120px',
                  background: '#fff', color: '#166534', fontWeight: 600,
                  outline: 'none',
                }}
              />
              <span style={{ fontSize: '0.7rem', color: '#86efac', fontWeight: 700 }}>→</span>
              <input type="date" value={filtros.dataFim || ''} max={hoje}
                onChange={e => { setFiltros(prev => ({ ...prev, dataFim: e.target.value || undefined })); }}
                style={{
                  padding: '0.3rem 0.5rem', border: '1.5px solid #bbf7d0',
                  borderRadius: '8px', fontSize: '0.7rem', width: '120px',
                  background: '#fff', color: '#166534', fontWeight: 600,
                  outline: 'none',
                }}
              />
            </div>

            {/* Linha 2: SmartFilters */}
            {temFiltrosInteligentes && (
              <div style={{ marginBottom: '0.5rem' }}>
                <SmartFilters
                  colunas={colunasFiltro}
                  valores={filtrosDinamicos}
                  onChange={novosValores => {
                    setFiltrosDinamicos(novosValores);
                  }}
                  label=""
                />
              </div>
            )}

            {/* Linha 3: Resumo + Tags */}
            {temFiltroAtivo && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap',
                padding: '0.35rem 0.6rem', background: '#f0fdf4',
                borderRadius: '8px', border: '1px solid #bbf7d0',
              }}>
                <span style={{
                  fontSize: '0.65rem', fontWeight: 700, color: '#166534',
                  background: '#dcfce7', padding: '0.1rem 0.5rem',
                  borderRadius: '6px', whiteSpace: 'nowrap',
                }}>
                  {qtdFiltrada.toLocaleString('pt-BR')} / {totalRegistrosBrutos.toLocaleString('pt-BR')}
                </span>

                {Object.entries(todosFiltros).map(([col, val]) => (
                  <span key={col} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                    fontSize: '0.62rem', fontWeight: 600, color: '#166534',
                    background: '#fff', padding: '0.1rem 0.35rem 0.1rem 0.5rem',
                    borderRadius: '14px', border: '1px solid #86efac',
                  }}>
                    {String(val).length > 14 ? String(val).slice(0, 12) + '…' : val}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        if (col === 'dataInicio' || col === 'dataFim') {
                          setFiltros(prev => { const n = {...prev}; delete n[col]; return n; });
                        } else {
                          setFiltrosDinamicos(prev => { const n = {...prev}; delete n[col]; return n; });
                        }
                      }}
                      style={{
                        width: '14px', height: '14px', borderRadius: '50%',
                        background: '#fef2f2', border: '1px solid #fecaca',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', fontSize: '0.5rem', color: '#ef4444', fontWeight: 700,
                        lineHeight: 1,
                      }}
                    >
                      ✕
                    </div>
                  </span>
                ))}

                <button
                  onClick={() => { setFiltros({}); setFiltrosDinamicos({}); }}
                  style={{
                    marginLeft: 'auto', fontSize: '0.58rem', fontWeight: 700,
                    color: '#ef4444', background: '#fef2f2',
                    border: '1px solid #fecaca', borderRadius: '6px',
                    padding: '0.1rem 0.5rem', cursor: 'pointer',
                  }}
                >
                  ✕ Limpar
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CONTEUDO */}
      {!temPlanilha ? (
        <EmptyState
          icone="upload"
          titulo="Nenhum dado ainda"
          descricao="Faca upload de uma planilha para comecar. Va para a pagina de Detalhes do Servico."
          acoes={[
            {
              label: 'Ir para Detalhes',
              onClick: () => navigate(`/contratos/${contractId}/servicos/${servicoId}/detalhes`),
              variante: 'primary',
            },
          ]}
        />
      ) : (
        <>
          {!temKpis && (
            <div className="card card-bordered" style={{ marginBottom: '1.25rem', textAlign: 'center', padding: '1.5rem' }}>
              <FiBarChart2 size={32} style={{ opacity: 0.15, color: '#22c55e', marginBottom: '0.5rem' }} />
              <h3 style={{ color: '#475569', fontSize: '0.95rem', marginBottom: '0.25rem' }}>Dados importados</h3>
              <p style={{ color: '#94a3b8', fontSize: '0.82rem' }}>
                {totalRegistros > 0 ? `${totalRegistros.toLocaleString('pt-BR')} registros. ` : ''}
                Configure os indicadores na pagina de Detalhes.
              </p>
              <button className="btn btn-primary btn-sm" style={{ marginTop: '0.5rem' }}
                onClick={() => navigate(`/contratos/${contractId}/servicos/${servicoId}/detalhes`)}>
                Ir para Detalhes
              </button>
            </div>
          )}

          {temKpis && (
            <>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.75rem' }}>
                Indicadores ({kpiValores.length})
              </div>

              <KpiGrid>
                {kpiValores.map((kpi, idx) => (
                  <KpiCard
                    key={kpi.id || kpi.nome + idx}
                    label={`${kpi.nome}${kpi.origem === 'contrato' ? ' [C]' : ' [S]'}`}
                    valor={kpi.formatado || '-'}
                    formato={kpi.formato}
                    cor={CORES[idx % CORES.length]}
                    miniChart
                  />
                ))}
              </KpiGrid>

              {graficosAtivos.length > 0 && (
                <ChartGrid
                  graficos={graficosAtivos}
                  dadosBrutos={dadosFiltradosGraficos}
                  colunasHoraSet={new Set()}
                  CORES={CORES}
                  contractId={contractId}
                  servicoId={servicoId}
                  filtrosAtivos={Object.keys(filtrosDinamicos).length > 0 ? {
                    filtrosDinamicos,
                    ...(filtros.dataInicio ? { dataInicio: filtros.dataInicio } : {}),
                    ...(filtros.dataFim ? { dataFim: filtros.dataFim } : {}),
                  } : {
                    ...(filtros.dataInicio ? { dataInicio: filtros.dataInicio } : {}),
                    ...(filtros.dataFim ? { dataFim: filtros.dataFim } : {}),
                  }}
                />
              )}

              {/* SECAO: ABAS — KPIS E GRAFICOS */}
              <div style={{ marginTop: '1.5rem', borderTop: '2px solid #e2e8f0', paddingTop: '0.75rem' }}>
                {/* Abas: KPIs | Gráficos */}
                <div style={{
                  display: 'flex', gap: '0.25rem', marginBottom: '1rem',
                  borderBottom: '2px solid #e2e8f0', paddingBottom: 0,
                }}>
                  {[
                    { id: 'kpis' as const, label: 'KPIs', icon: <FiBarChart2 size={14} />, badge: kpisUniversais.length },
                    { id: 'graficos' as const, label: 'Gráficos', icon: <FiGrid size={14} />, badge: graficosBiblioteca.length },
                  ].map(aba => (
                    <button
                      key={aba.id}
                      onClick={() => setSecaoAba(aba.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.35rem',
                        padding: '0.5rem 0.85rem', fontSize: '0.78rem', fontWeight: 600,
                        border: 'none', background: 'none', cursor: 'pointer',
                        color: secaoAba === aba.id ? '#6366f1' : '#64748b',
                        borderBottom: secaoAba === aba.id ? '2px solid #6366f1' : '2px solid transparent',
                        marginBottom: '-2px', transition: 'all 0.15s',
                        opacity: secaoAba === aba.id ? 1 : 0.7,
                      }}
                    >
                      {aba.icon} {aba.label}
                      <span style={{
                        fontSize: '0.6rem', background: secaoAba === aba.id ? '#eef2ff' : '#f1f5f9',
                        color: secaoAba === aba.id ? '#6366f1' : '#94a3b8',
                        padding: '0.05rem 0.4rem', borderRadius: '8px', fontWeight: 700,
                        marginLeft: '0.1rem',
                      }}>
                        {aba.badge}
                      </span>
                    </button>
                  ))}

                  <div style={{ flex: 1 }} />

                  {/* Botão Gerar Gráficos Padrão — visível na aba Gráficos */}
                  {secaoAba === 'graficos' && temPlanilha && (
                    <button
                      onClick={aplicarGraficosPadrao}
                      disabled={aplicandoGraficos}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                        padding: '0.35rem 0.65rem',
                        background: aplicandoGraficos ? '#94a3b8' : '#6366f1',
                        color: 'white', border: 'none', borderRadius: '6px',
                        fontSize: '0.72rem', fontWeight: 700,
                        cursor: aplicandoGraficos ? 'not-allowed' : 'pointer',
                        marginBottom: '-2px',
                      }}
                    >
                      {aplicandoGraficos ? 'Gerando...' : <><FiBarChart2 size={12} /> Gerar Gráficos Padrão</>}
                    </button>
                  )}
                </div>

                {/* ─── CONTEÚDO DA ABA KPIs ─── */}
                {secaoAba === 'kpis' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: 0 }}>
                        Clique nos KPIs abaixo para selecioná-los e ative no dashboard deste serviço.
                      </p>
                      {/* Botão para ativar selecionados */}
                      {kpisSelecionados.size > 0 && (
                        <button
                          onClick={ativarKpisSelecionados}
                          disabled={ativandoKpis}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.35rem',
                            padding: '0.35rem 0.65rem',
                            background: ativandoKpis ? '#94a3b8' : '#16a34a',
                            color: 'white', border: 'none', borderRadius: '6px',
                            fontSize: '0.72rem', fontWeight: 700, cursor: ativandoKpis ? 'not-allowed' : 'pointer',
                            boxShadow: '0 2px 8px rgba(22,163,74,0.3)',
                          }}
                        >
                          {ativandoKpis ? (
                            <>Aguarde...</>
                          ) : (
                            <><FiPlus size={12} /> Ativar {kpisSelecionados.size} KPI(s) no Dashboard</>
                          )}
                        </button>
                      )}
                    </div>

                    {kpisUniversaisLoading ? (
                      <SkeletonLoader tipo="kpi-grid" quantidade={3} />
                    ) : Object.keys(kpisPorTipo).length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8', fontSize: '0.85rem' }}>
                        Nenhum KPI universal cadastrado.
                      </div>
                    ) : (
                      Object.entries(kpisPorTipo).map(([tipo, kpisDoTipo]) => {
                        const tipoLabel = (TIPOS_SERVICO_LABELS as any)[tipo] || tipo;
                        return (
                          <div key={tipo} style={{ marginBottom: '1.25rem' }}>
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: '0.5rem',
                              padding: '0.4rem 0.65rem', background: '#f8fafc',
                              borderRadius: '6px', marginBottom: '0.5rem',
                              border: '1px solid #e2e8f0',
                            }}>
                              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>
                                {tipoLabel}
                              </span>
                              <span style={{
                                fontSize: '0.65rem', background: '#6366f1', color: 'white',
                                padding: '0.1rem 0.4rem', borderRadius: '8px', fontWeight: 600,
                              }}>
                                {kpisDoTipo.length}
                              </span>
                            </div>
                            <KpiGrid>
                              {kpisDoTipo.map((kpi: any, idx: number) => {
                                const ativo = kpiValores.some(kv => kv.nome === kpi.nome);
                                const selecionado = kpisSelecionados.has(kpi.id);
                                return (
                                  <div
                                    key={kpi.id || kpi.nome + idx}
                                    onClick={() => { if (!ativo) toggleSelecionarKpi(kpi.id); }}
                                    style={{
                                      position: 'relative',
                                      cursor: ativo ? 'default' : 'pointer',
                                      opacity: ativo ? 0.85 : (selecionado ? 1 : 0.9),
                                      transition: 'all 0.15s ease',
                                    }}
                                  >
                                    <div
                                      style={{
                                        position: 'absolute',
                                        top: '0.5rem',
                                        left: '0.5rem',
                                        zIndex: 2,
                                        color: selecionado ? '#16a34a' : (ativo ? '#94a3b8' : '#cbd5e1'),
                                        fontSize: '1rem',
                                        background: selecionado ? 'white' : 'transparent',
                                        borderRadius: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: '20px',
                                        height: '20px',
                                      }}
                                    >
                                      {ativo ? <FiCheckSquare size={16} style={{ color: '#22c55e' }} /> :
                                       selecionado ? <FiCheckSquare size={16} /> : <FiSquare size={16} />}
                                    </div>
                                    <KpiCard
                                      label={`${kpi.label}${ativo ? ' [ATIVO]' : ''}`}
                                      valor={ativo ? (kpiValores.find(kv => kv.nome === kpi.nome)?.formatado || 'Ativo') : (selecionado ? 'Selecionado' : '-')}
                                      formato={kpi.formato || 'numero'}
                                      unidade={kpi.unidade || undefined}
                                      categoria={kpi.categoria}
                                      cor={ativo ? '#22c55e' : (selecionado ? '#16a34a' : (kpi.cor || CORES[idx % CORES.length]))}
                                      miniChart={ativo || selecionado}
                                    />
                                  </div>
                                );
                              })}
                            </KpiGrid>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* ─── CONTEÚDO DA ABA GRÁFICOS ─── */}
                {secaoAba === 'graficos' && (
                  <div>
                    {/* ═══ GRÁFICOS PADRÃO PARA ESTE SERVIÇO ═══ */}
                    <div style={{ marginBottom: '1.5rem' }}>
                      <div style={{
                        fontSize: '0.75rem', fontWeight: 700, color: '#1e293b',
                        display: 'flex', alignItems: 'center', gap: '0.35rem',
                        marginBottom: '0.4rem',
                      }}>
                        <FiBarChart2 size={14} /> Gráficos Padrão para este Serviço
                        {graficosSugeridosInfo && (
                          <span style={{
                            fontSize: '0.6rem', background: '#eef2ff', color: '#4338ca',
                            padding: '0.1rem 0.45rem', borderRadius: '8px', fontWeight: 600,
                          }}>
                            {graficosSugeridosInfo.tipoServico ? (TIPOS_SERVICO_LABELS as any)[graficosSugeridosInfo.tipoServico] || graficosSugeridosInfo.tipoServico : ''}
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: '0.7rem', color: '#94a3b8', margin: '0 0 0.6rem' }}>
                        {graficosSugeridosInfo?.colunas?.length > 0
                          ? `Gerados a partir de ${graficosSugeridosInfo.colunas.length} colunas da planilha: ${graficosSugeridosInfo.colunas.slice(0, 6).join(', ')}${graficosSugeridosInfo.colunas.length > 6 ? '...' : ''}`
                          : 'Os gráficos abaixo são gerados automaticamente com base nas colunas da planilha e no tipo de serviço.'}
                      </p>

                      {graficosSugeridosLoading ? (
                        <SkeletonLoader tipo="chart" quantidade={3} />
                      ) : graficosSugeridos.length === 0 ? (
                        <div style={{
                          textAlign: 'center', padding: '1.5rem', color: '#94a3b8',
                          background: '#f8fafc', borderRadius: '8px', border: '1px dashed #e2e8f0',
                        }}>
                          <FiGrid size={28} style={{ opacity: 0.3, marginBottom: '0.4rem' }} />
                          <p style={{ fontSize: '0.8rem', margin: 0 }}>
                            Nenhum gráfico padrão disponível para este serviço.
                          </p>
                        </div>
                      ) : (
                        <div>
                          {/* Botão de ação no topo */}
                          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.6rem' }}>
                            <button
                              onClick={aplicarGraficosPadrao}
                              disabled={aplicandoGraficos}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '0.3rem',
                                padding: '0.35rem 0.7rem',
                                background: aplicandoGraficos ? '#94a3b8' : '#6366f1',
                                color: 'white', border: 'none', borderRadius: '6px',
                                fontSize: '0.72rem', fontWeight: 700,
                                cursor: aplicandoGraficos ? 'not-allowed' : 'pointer',
                              }}
                            >
                              {aplicandoGraficos ? 'Gerando...' : <><FiBarChart2 size={12} /> Aplicar no Dashboard</>}
                            </button>
                            {graficosSugeridosInfo?.jaAplicado && (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                                fontSize: '0.65rem', color: '#16a34a', background: '#f0fdf4',
                                padding: '0.2rem 0.5rem', borderRadius: '6px', fontWeight: 600,
                                border: '1px solid #bbf7d0',
                              }}>
                                ✓ Já aplicado ({graficosSugeridosInfo.graficosAtuais} ativos)
                              </span>
                            )}
                          </div>

                          {/* Gráficos agrupados por tipo de serviço */}
                          {Object.entries(graficosSugeridosPorTipo).map(([tipo, graficosDoTipo]) => {
                            const tipoLabel = (TIPOS_SERVICO_LABELS as any)[tipo] || tipo;
                            return (
                              <div key={tipo} style={{ marginBottom: '1rem' }}>
                                <div style={{
                                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                                  padding: '0.3rem 0.5rem', background: '#f1f5f9',
                                  borderRadius: '6px', marginBottom: '0.4rem',
                                  border: '1px solid #e2e8f0',
                                }}>
                                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e293b' }}>
                                    {tipoLabel}
                                  </span>
                                  <span style={{
                                    fontSize: '0.6rem', background: '#6366f1', color: 'white',
                                    padding: '0.05rem 0.35rem', borderRadius: '8px', fontWeight: 600,
                                  }}>
                                    {graficosDoTipo.length}
                                  </span>
                                </div>

                                <div style={{
                                  display: 'grid',
                                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                                  gap: '0.5rem',
                                }}>
                                  {graficosDoTipo.map((g: any, idx: number) => {
                                    const estilo: Record<string, { bg: string; icon: string }> = {
                                      barra: { bg: '#eff6ff', icon: '📊' },
                                      linha: { bg: '#f0fdf4', icon: '📈' },
                                      pizza: { bg: '#fefce8', icon: '🥧' },
                                      area: { bg: '#f5f3ff', icon: '🗺️' },
                                      donut: { bg: '#fdf2f8', icon: '🍩' },
                                    };
                                    const info = estilo[g.tipo] || { bg: '#f1f5f9', icon: '📊' };
                                    // Verificar se este gráfico já está ativo no dashboard
                                    const jaAtivo = graficosAtivos.some(
                                      (ga: any) => ga.titulo === g.titulo ||
                                        (ga.eixoX === (g.placeholderEixoX?.[0] || '') && ga.eixoY === (g.placeholderEixoY?.[0] || ''))
                                    );
                                    return (
                                      <div
                                        key={g.key || `graf-${tipo}-${idx}`}
                                        style={{
                                          display: 'flex', flexDirection: 'column', gap: '0.35rem',
                                          padding: '0.6rem 0.7rem',
                                          background: jaAtivo ? '#f0fdf4' : 'white',
                                          borderRadius: '8px',
                                          border: `1px solid ${jaAtivo ? '#bbf7d0' : '#e2e8f0'}`,
                                          borderTop: `3px solid ${g.cor || '#6366f1'}`,
                                          opacity: jaAtivo ? 0.9 : 1,
                                          transition: 'all 0.15s',
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                          <span style={{
                                            fontSize: '0.85rem', width: '24px', height: '24px',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: info.bg, borderRadius: '5px', flexShrink: 0,
                                          }}>
                                            {info.icon}
                                          </span>
                                          <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.78rem', color: '#1e293b' }}>
                                              {g.titulo}
                                            </div>
                                          </div>
                                          {jaAtivo && (
                                            <span style={{
                                              fontSize: '0.55rem', fontWeight: 700,
                                              background: '#16a34a', color: 'white',
                                              padding: '0.1rem 0.35rem', borderRadius: '4px',
                                            }}>
                                              ATIVO
                                            </span>
                                          )}
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', lineHeight: 1.3 }}>
                                          {g.descricao || (
                                            <>
                                              <span>X: {Array.isArray(g.placeholderEixoX) ? g.placeholderEixoX.join(', ') : g.placeholderEixoX || '-'}</span>
                                              {(g.placeholderEixoY?.length > 0 || g.eixoY) && (
                                                <span> · Y: {Array.isArray(g.placeholderEixoY || g.eixoY) ? [...(g.placeholderEixoY || []), ...(g.eixoY ? [g.eixoY] : [])].join(', ') : (g.placeholderEixoY || g.eixoY || '-')}</span>
                                              )}
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* ═══ SEPARADOR + BIBLIOTECA COMPLETA ═══ */}
                    <div style={{
                      borderTop: '1px solid #e2e8f0', paddingTop: '1rem',
                      marginTop: '0.5rem',
                    }}>
                      <div style={{
                        fontSize: '0.72rem', fontWeight: 700, color: '#64748b',
                        textTransform: 'uppercase', letterSpacing: '0.3px',
                        marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem',
                      }}>
                        <FiGrid size={12} /> Biblioteca de Gráficos ({graficosBiblioteca.length})
                      </div>

                      {graficosBibliotecaLoading ? (
                        <SkeletonLoader tipo="chart" quantidade={2} />
                      ) : graficosBiblioteca.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '1rem', color: '#94a3b8', fontSize: '0.78rem' }}>
                          Nenhum gráfico na biblioteca.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          {graficosBiblioteca.map((g: any, idx: number) => {
                            const estilo: Record<string, { bg: string; icon: string }> = {
                              barra: { bg: '#eff6ff', icon: '📊' },
                              linha: { bg: '#f0fdf4', icon: '📈' },
                              pizza: { bg: '#fefce8', icon: '🥧' },
                              area: { bg: '#f5f3ff', icon: '🗺️' },
                              donut: { bg: '#fdf2f8', icon: '🍩' },
                            };
                            const info = estilo[g.tipo] || { bg: '#f1f5f9', icon: '📊' };
                            return (
                              <div
                                key={g.id || `bib-${idx}`}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                                  padding: '0.4rem 0.6rem',
                                  background: g.ativo ? 'white' : '#f8fafc',
                                  borderRadius: '6px',
                                  border: `1px solid ${g.ativo ? '#e2e8f0' : '#f1f5f9'}`,
                                  opacity: g.ativo ? 1 : 0.6,
                                }}
                              >
                                <span style={{
                                  fontSize: '0.85rem', width: '24px', height: '24px',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: info.bg, borderRadius: '5px', flexShrink: 0,
                                }}>
                                  {info.icon}
                                </span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, fontSize: '0.75rem', color: '#1e293b' }}>
                                    {g.titulo}
                                    <span style={{
                                      fontSize: '0.58rem', color: '#94a3b8', fontWeight: 400,
                                      marginLeft: '0.3rem',
                                    }}>
                                      · {(TIPOS_SERVICO_LABELS as any)[g.tipoServico] || g.tipoServico}
                                    </span>
                                  </div>
                                </div>
                                <span style={{
                                  fontSize: '0.55rem', fontWeight: 600,
                                  padding: '0.05rem 0.35rem', borderRadius: '4px',
                                  background: g.ativo ? '#ecfdf5' : '#f1f5f9',
                                  color: g.ativo ? '#16a34a' : '#94a3b8',
                                }}>
                                  {g.ativo ? 'Ativo' : 'Inativo'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {showExportModal && contractId && servicoId && (
        <ExportPdfModal
          contractId={contractId} servicoId={servicoId} servicoNome={servicoNome}
          kpiValores={kpiValores} execMetrics={execMetrics}
          graficosAtivos={graficosAtivos}
          colunas={colunas}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}
