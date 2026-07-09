import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FiSettings, FiDatabase, FiBarChart2,
  FiArrowLeft, FiRefreshCw, FiTrash2,
  FiZap, FiPlus,
} from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useBreadcrumbs } from '../contexts/BreadcrumbContext';
import SkeletonLoader from '../components/SkeletonLoader';
import type { KpiConfig, GraficoConfig, ColunaDetectada } from '../components/KpiEditor/KpiEditorTypes';
import servicoService from '../services/servicoService';
import { isAxiosError } from 'axios';
import '../styles/ContratoDetalhe.css';

const CORES = ['#059669', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#3b82f6', '#ec4899', '#84cc16', '#06b6d4'];

export default function ConfiguracaoServico() {
  const { contractId, servicoId } = useParams<{ contractId: string; servicoId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { adicionarToast } = useToast();
  const { setBreadcrumbs } = useBreadcrumbs();

  const [carregando, setCarregando] = useState(true);
  const [servicoNome, setServicoNome] = useState('Servico');
  const [colunas, setColunas] = useState<ColunaDetectada[]>([]);

  const [kpis, setKpis] = useState<KpiConfig[]>([]);
  const [graficos, setGraficos] = useState<GraficoConfig[]>([]);
  const [autoSave, setAutoSave] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    setBreadcrumbs([
      { label: 'Visao Geral', href: '/visao-geral' },
      { label: 'Contratos', href: '/contratos' },
      { label: 'Configuracao do Servico' },
    ]);
  }, [servicoNome, setBreadcrumbs]);

  const carregarDados = useCallback(async () => {
    if (!contractId || !servicoId) return;
    setCarregando(true);
    try {
      const data = await servicoService.getPadrao(contractId, servicoId);
      setServicoNome(data.servico?.nome || 'Servico');
      const cols: ColunaDetectada[] = data.servico?.padraoPlanilha?.colunas || [];
      setColunas(cols);
      const cfg = data.servico?.configDashboard;
      if (cfg?.kpis?.length) setKpis(JSON.parse(JSON.stringify(cfg.kpis)));
      if (cfg?.graficos?.length) setGraficos(JSON.parse(JSON.stringify(cfg.graficos)));
    } catch {
      adicionarToast('Erro ao carregar dados', 'error');
    } finally {
      setCarregando(false);
    }
  }, [contractId, servicoId, token, adicionarToast]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  const salvarConfig = useCallback(async (novosKpis: KpiConfig[], novosGraficos: GraficoConfig[]) => {
    setAutoSave('saving');
    try {
      await servicoService.saveConfigDashboard(contractId, servicoId, {
        kpis: novosKpis.filter(k => k.ativo),
        graficos: novosGraficos.filter(g => g.ativo),
      });
      setAutoSave('saved');
      setTimeout(() => setAutoSave('idle'), 2000);
    } catch {
      setAutoSave('idle');
    }
  }, [contractId, servicoId, token]);

  const aplicarModeloExecutivo = async (substituir: boolean) => {
    try {
      await servicoService.aplicarModeloExecutivo(contractId, servicoId, substituir);
      adicionarToast('Modelo Executivo aplicado!', 'success');
      carregarDados();
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error || 'Erro ao aplicar modelo'
        : 'Erro ao aplicar modelo';
      adicionarToast('Erro: ' + msg, 'error');
    }
  };

  const colsNum = colunas.filter(c => c.tipo === 'numero');
  const colsText = colunas.filter(c => c.tipo === 'texto' || c.tipo === 'desconhecido');
  const temPlanilha = colunas.length > 0;

  const renderKpiItem = (kpi: KpiConfig, i: number) => {
    const ehAutomatico = (kpi as any).automatico;
    return (
      <div key={i} style={{
        background: '#fff', border: '1px solid ' + (ehAutomatico ? '#bbf7d0' : '#e2e8f0'),
        borderRadius: '8px', padding: '0.5rem 0.65rem', marginBottom: '0.35rem',
        borderLeft: ehAutomatico ? '3px solid #22c55e' : '3px solid transparent',
        position: 'relative',
      }}>
        {ehAutomatico && (
          <span style={{
            position: 'absolute', top: '-1px', right: '6px',
            fontSize: '0.5rem', fontWeight: 700, textTransform: 'uppercase',
            background: '#22c55e', color: '#fff',
            padding: '0.05rem 0.35rem', borderRadius: '0 8px 0 4px',
            display: 'flex', alignItems: 'center', gap: '0.15rem',
          }}>
            <FiZap size={8} /> Auto
          </span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
          <input type="checkbox" checked={kpi.ativo}
            onChange={() => {
              const nk = kpis.map((k, j) => j === i ? { ...k, ativo: !k.ativo } : k);
              setKpis(nk);
              salvarConfig(nk, graficos);
            }}
            style={{ width: 14, height: 14 }}
          />
          <input value={kpi.label}
            onChange={e => {
              const nk = kpis.map((k, j) => j === i ? { ...k, label: e.target.value } : k);
              setKpis(nk);
              salvarConfig(nk, graficos);
            }}
            style={{
              flex: 1, minWidth: 80, fontSize: '0.78rem', padding: '0.2rem 0.35rem',
              border: '1px solid #d1d5db', borderRadius: '4px', fontWeight: 600,
            }}
            placeholder="Nome do indicador"
          />
          <select value={kpi.formato} onChange={e => {
            const nk = kpis.map((k, j) => j === i ? { ...k, formato: e.target.value as KpiConfig['formato'] } : k);
            setKpis(nk);
            salvarConfig(nk, graficos);
          }} style={{ fontSize: '0.65rem', padding: '0.2rem 0.3rem', border: '1px solid #d1d5db', borderRadius: '4px' }}>
            <option value="numero">No</option>
            <option value="moeda">R$</option>
            <option value="porcentagem">%</option>
          </select>
          <button className="btn-icon btn-icon-danger" onClick={() => {
            const nk = kpis.filter((_, j) => j !== i);
            setKpis(nk);
            salvarConfig(nk, graficos);
          }} title="Remover">
            <FiTrash2 size={12} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.3rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={kpi.expressao || ''}
            onChange={e => {
              const nk = kpis.map((k, j) => j === i ? { ...k, expressao: e.target.value } : k);
              setKpis(nk);
              salvarConfig(nk, graficos);
            }}
            placeholder="Expressao: SUM(PESO TOTAL) / 1000"
            style={{
              flex: 1, minWidth: 120, fontSize: '0.72rem', padding: '0.2rem 0.35rem',
              border: '1px solid #d1d5db', borderRadius: '4px', fontFamily: 'monospace',
            }}
          />
        </div>
        <div style={{ marginTop: '0.2rem' }}>
          <input value={kpi.descricao || ''}
            onChange={e => {
              const nk = kpis.map((k, j) => j === i ? { ...k, descricao: e.target.value } : k);
              setKpis(nk);
              salvarConfig(nk, graficos);
            }}
            placeholder="Descricao: Ex: Media de peso transportado por viagem"
            style={{
              width: '100%', fontSize: '0.72rem', padding: '0.2rem 0.35rem',
              border: '1px solid #d1d5db', borderRadius: '4px',
            }}
          />
        </div>
      </div>
    );
  };

  const renderGraficoItem = (g: GraficoConfig, i: number) => (
    <div key={i} style={{
      display: 'flex', alignItems: 'center', gap: '0.3rem',
      padding: '0.35rem 0.5rem', marginBottom: '0.3rem',
      background: g.ativo ? '#f8fafc' : '#fff',
      borderRadius: '8px', border: '1px solid #e2e8f0',
      opacity: g.ativo ? 1 : 0.5, flexWrap: 'wrap',
    }}>
      <input type="checkbox" checked={g.ativo} onChange={() => {
        const ng = graficos.map((gr, j) => j === i ? { ...gr, ativo: !gr.ativo } : gr);
        setGraficos(ng);
        salvarConfig(kpis, ng);
      }} style={{ width: 14, height: 14 }} />
      <select value={g.tipo} onChange={e => {
        const ng = graficos.map((gr, j) => j === i ? { ...gr, tipo: e.target.value as GraficoConfig['tipo'] } : gr);
        setGraficos(ng);
        salvarConfig(kpis, ng);
      }} style={{ fontSize: '0.68rem', padding: '0.15rem 0.3rem', border: '1px solid #d1d5db', borderRadius: '4px' }}>
        <option value="barra">Barras</option>
        <option value="linha">Linha</option>
        <option value="pizza">Pizza</option>
      </select>
      <input value={g.titulo} onChange={e => {
        const ng = graficos.map((gr, j) => j === i ? { ...gr, titulo: e.target.value } : gr);
        setGraficos(ng);
        salvarConfig(kpis, ng);
      }} placeholder="Titulo" style={{
        flex: 1, minWidth: 80, fontSize: '0.75rem',
        padding: '0.2rem 0.35rem', border: '1px solid #d1d5db', borderRadius: '4px',
      }} />
      <select value={g.eixoX} onChange={e => {
        const ng = graficos.map((gr, j) => j === i ? { ...gr, eixoX: e.target.value } : gr);
        setGraficos(ng);
        salvarConfig(kpis, ng);
      }} style={{ fontSize: '0.68rem', padding: '0.15rem 0.3rem', border: '1px solid #d1d5db', borderRadius: '4px' }}>
        <option value="">X</option>
        {colsText.map(c => <option key={c.nome} value={c.nome}>{c.nome}</option>)}
      </select>
      <select value={g.eixoY} onChange={e => {
        const ng = graficos.map((gr, j) => j === i ? { ...gr, eixoY: e.target.value } : gr);
        setGraficos(ng);
        salvarConfig(kpis, ng);
      }} style={{ fontSize: '0.68rem', padding: '0.15rem 0.3rem', border: '1px solid #d1d5db', borderRadius: '4px' }}>
        <option value="">Y</option>
        {colsNum.map(c => <option key={c.nome} value={c.nome}>{c.nome}</option>)}
      </select>
      <button className="btn-icon btn-icon-danger" onClick={() => {
        const ng = graficos.filter((_, j) => j !== i);
        setGraficos(ng);
        salvarConfig(kpis, ng);
      }} title="Remover">
        <FiTrash2 size={11} />
      </button>
    </div>
  );

  if (carregando) {
    return (
      <div style={{ padding: '1.5rem 2rem', maxWidth: '1100px', margin: '0 auto' }}>
        <SkeletonLoader tipo="kpi-grid" quantidade={3} />
        <SkeletonLoader tipo="chart" quantidade={2} />
      </div>
    );
  }

  return (
    <div style={{ padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Topo */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.35rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button className="btn btn-ghost" onClick={() => navigate('/contratos/' + contractId + '/servicos/' + servicoId)}
            style={{ fontSize: '0.72rem', padding: '0.1rem 0.3rem', color: '#6366f1' }}>
            <FiArrowLeft size={12} /> Servico
          </button>
          <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#0f172a' }}>
            <FiSettings size={14} /> Configuracao: {servicoNome}
          </h3>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.65rem', color: autoSave === 'saving' ? '#b45309' : autoSave === 'saved' ? '#15803d' : '#94a3b8' }}>
            {autoSave === 'saving' ? 'Salvando...' : autoSave === 'saved' ? 'Salvo' : 'Auto-save'}
          </span>
          <button className="btn btn-sm btn-ghost" onClick={carregarDados} title="Recarregar">
            <FiRefreshCw size={11} />
          </button>
        </div>
      </div>

      {!temPlanilha ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
          <FiDatabase size={48} style={{ opacity: 0.2, marginBottom: '0.75rem' }} />
          <h3>Nenhuma planilha encontrada</h3>
          <p style={{ fontSize: '0.85rem' }}>Faca upload de uma planilha na pagina do Servico primeiro.</p>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/contratos/' + contractId + '/servicos/' + servicoId)}>
            Ir para o Servico
          </button>
        </div>
      ) : (
        <div style={{ maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
          {/* Acoes */}
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <button className="btn btn-primary btn-sm" onClick={() => {
              const novo: KpiConfig = {
                nome: colsNum[0]?.nome || '',
                label: 'Novo KPI',
                agregacao: 'sum',
                formato: 'numero',
                ativo: true,
                expressao: '',
                colunasUsadas: [],
                valoresFixos: {},
                descricao: '',
                unidade: '',
                categoria: '',
                cor: '',
                meta: null, alerta: null,
              };
              const nk = [...kpis, novo];
              setKpis(nk);
              salvarConfig(nk, graficos);
            }}>
              <FiPlus size={13} /> + Novo Indicador
            </button>
            <button className="btn btn-sm" onClick={() => aplicarModeloExecutivo(false)} style={{
              display: 'flex', alignItems: 'center', gap: '0.25rem',
              background: '#f0fdf4', border: '1px solid #bbf7d0',
              borderRadius: '6px', padding: '0.3rem 0.6rem',
              fontSize: '0.7rem', fontWeight: 600, color: '#15803d', cursor: 'pointer',
            }}>
              <FiZap size={12} /> Aplicar Modelo Executivo
            </button>
          </div>

          {/* Secao Indicadores */}
          <div style={{ marginBottom: '0.5rem' }}>
            <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', margin: '0 0 0.5rem' }}>
              Indicadores ({kpis.filter(k => k.ativo).length})
            </h4>
            {kpis.filter(k => k.ativo).length === 0 && (
              <div style={{ textAlign: 'center', padding: '1rem', color: '#94a3b8', fontSize: '0.82rem' }}>
                Nenhum indicador ativo. Crie um novo indicador.
              </div>
            )}
            {kpis.map((kpi, i) => renderKpiItem(kpi, i))}
          </div>

          {/* Secao Graficos */}
          <div style={{ marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', margin: 0 }}>
                Graficos ({graficos.filter(g => g.ativo).length})
              </h4>
              <button className="btn btn-primary btn-sm" onClick={() => {
                const ng = [...graficos, {
                  tipo: 'barra' as const,
                  titulo: 'Novo Grafico',
                  eixoX: colsText[0]?.nome || '',
                  eixoY: colsNum[0]?.nome || '',
                  ativo: true,
                }];
                setGraficos(ng);
                salvarConfig(kpis, ng);
              }}>
                <FiPlus size={12} /> + Grafico
              </button>
            </div>
            {graficos.map((g, i) => renderGraficoItem(g, i))}
          </div>

          {/* Colunas disponiveis */}
          <div style={{ marginTop: '1.5rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', margin: '0 0 0.35rem' }}>
              Colunas disponiveis ({colunas.length})
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
              {colunas.map(col => (
                <span key={col.nome} style={{
                  fontSize: '0.65rem', padding: '0.15rem 0.4rem',
                  background: col.tipo === 'numero' ? '#fefce8' : '#eef2ff',
                  color: col.tipo === 'numero' ? '#b45309' : '#4338ca',
                  borderRadius: '4px', fontWeight: 600,
                  border: '1px solid ' + (col.tipo === 'numero' ? '#fde68a' : '#c7d2fe'),
                }}>
                  {col.nome} <span style={{ fontWeight: 400, opacity: 0.7 }}>({col.tipo})</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
