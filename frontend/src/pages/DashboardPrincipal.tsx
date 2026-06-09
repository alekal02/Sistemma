/* ============================================
   DashboardPrincipal — Visão consolidada de todos os serviços
   Visual profissional no estilo Google Analytics
   URL: /dashboard
   ═══ TOMADA DE DECISÃO ═══
   - Abas: Geral | 💰 Receita | 📋 Operacional
   - DecisionHeader com scores e prioridades automáticas
   - Cards filtrados por categoria
   ============================================ */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FiSettings, FiRefreshCw, FiBarChart2, FiAlertCircle,
  FiTrendingUp, FiDollarSign, FiActivity, FiTruck,
  FiClock, FiMapPin, FiArrowRight, FiDatabase,
  FiFilter, FiX, FiGrid,
} from 'react-icons/fi';
import { useToast } from '../contexts/ToastContext';
import servicoService from '../services/servicoService';
import type { ServicoConsolidado, KpiConsolidadoItem, FiltrosDashboardPrincipal, FiltrosDisponiveis } from '../services/servicoService';
import SkeletonLoader from '../components/SkeletonLoader';
import DecisionHeader from '../components/DecisionHeader';
import GoogleFilterBar from '../components/GoogleFilterBar';
import { useGoogleFilters } from '../hooks/useGoogleFilters';
import { useDecisionEngine } from '../hooks/useDecisionEngine';
import type { CategoriaKpi } from '../types/decision';
import '../styles/Dashboard.css';

/* ─── Helpers ─── */

function formatarUltimoUpload(data: string | null): string {
  if (!data) return 'Nunca';
  const d = new Date(data);
  const agora = new Date();
  const diffMs = agora.getTime() - d.getTime();
  const diffHoras = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHoras < 1) return 'Agora mesmo';
  if (diffHoras < 24) return `Há ${diffHoras}h`;
  const diffDias = Math.floor(diffHoras / 24);
  if (diffDias < 7) return `Há ${diffDias}d`;
  return d.toLocaleDateString('pt-BR');
}

function estaDesatualizado(data: string | null): boolean {
  if (!data) return false;
  return Date.now() - new Date(data).getTime() > 7 * 24 * 60 * 60 * 1000;
}

/* ─── Paleta de cores para KPIs ─── */
const CORES_KPI: Record<string, { bg: string; text: string; bar: string }> = {
  'numero':    { bg: '#f1f5f9', text: '#1e293b', bar: '#22c55e' },
  'moeda':     { bg: '#fefce8', text: '#b45309', bar: '#f59e0b' },
  'porcentagem': { bg: '#ecfdf5', text: '#047857', bar: '#22c55e' },
};

/* ─── Ícone por nome de KPI ─── */
function iconeKpi(nome: string): React.ReactElement {
  const n = nome.toUpperCase();
  if (n.includes('FATUR') || n.includes('RECEITA') || n.includes('R$')) return <FiDollarSign size={14} />;
  if (n.includes('TON') || n.includes('PESO') || n.includes('CARGA')) return <FiTruck size={14} />;
  if (n.includes('KM') || n.includes('DIST') || n.includes('QUILO')) return <FiMapPin size={14} />;
  if (n.includes('HORA') || n.includes('TEMPO') || n.includes('DURA')) return <FiClock size={14} />;
  if (n.includes('VIA') || n.includes('COLETA') || n.includes('REGISTRO')) return <FiActivity size={14} />;
  if (n.includes('MEDIA') || n.includes('EFIC') || n.includes('PROD')) return <FiTrendingUp size={14} />;
  return <FiBarChart2 size={14} />;
}

/* ══════════════════════════════════════
   Componente: Card de KPI individual
   ══════════════════════════════════════ */
function KpiMiniCard({ kpi, idx }: { kpi: KpiConsolidadoItem; idx: number }) {
  const cor = CORES_KPI[kpi.formato] || CORES_KPI['numero'];
  return (
    <div style={{
      background: cor.bg,
      borderRadius: '8px',
      padding: '0.55rem 0.65rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.05rem',
      borderLeft: `3px solid ${cor.bar}`,
      transition: 'transform 0.15s',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.25rem',
        color: '#64748b', fontSize: '0.6rem', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.02em',
      }}>
        <span style={{ opacity: 0.6 }}>{iconeKpi(kpi.nome)}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kpi.nome}</span>
      </div>
      <div style={{
        fontSize: '1.15rem',
        fontWeight: 700,
        color: cor.text,
        lineHeight: 1.2,
        marginTop: '0.05rem',
        overflowWrap: 'break-word',
        wordBreak: 'break-word',
      }}>
        {kpi.formatado || '-'}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   Componente: Card de Serviço
   ══════════════════════════════════════ */
function ServicoCard({ servico, onNavigate, filtroCategoria }: {
  servico: ServicoConsolidado;
  onNavigate: (path: string) => void;
  filtroCategoria?: CategoriaKpi | 'todas';
}) {
  const desatualizado = estaDesatualizado(servico.ultimoUpload);

  // Filtrar KPIs por categoria quando aplicável
  const kpisFiltrados = useMemo(() => {
    if (!filtroCategoria || filtroCategoria === 'todas') return servico.kpis;
    
    const PALAVRAS_RECEITA = ['FATURAMENTO', 'RECEITA', 'R$', 'MARGEM', 'TICKET', 'CUSTO', 'LUCRO', 'BRUTA', 'VALOR TOTAL', 'VALOR MEDIO', 'CUSTO TOTAL']
    const PALAVRAS_OPERACIONAL = ['TONELADA', 'TON', 'KG', 'KM', 'QUILOMETRO', 'KILOMETRO', 'VIAGEM', 'COLETA', 'EFICIENCIA', 'PRODUTIVIDADE', 'HORA', 'COLETOR', 'COLETORA', 'MOTORISTA', 'PLACA', 'DISTANCIA', 'PESO', 'REGISTRO', 'EQUIPAMENTO', 'CAMINHAO', 'VEICULO', 'ROTA', 'MEDIA', 'TOTAL', 'ATIVO']
    
    return servico.kpis.filter(kpi => {
      const upper = kpi.nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      if (filtroCategoria === 'receita') {
        return PALAVRAS_RECEITA.some(p => upper.includes(p))
      }
      if (filtroCategoria === 'operacional') {
        return PALAVRAS_OPERACIONAL.some(p => upper.includes(p))
      }
      return true
    })
  }, [servico.kpis, filtroCategoria])

  const kpisVisiveis = kpisFiltrados.slice(0, 6);
  const kpisExcedentes = kpisFiltrados.length - 6;
  const semKpis = kpisFiltrados.length === 0;

  return (
    <div
      id={`servico-card-${servico.id}`}
      style={{
        background: '#fff',
        borderRadius: '12px',
        border: `1px solid ${desatualizado ? '#fde68a' : '#e2e8f0'}`,
        boxShadow: desatualizado ? '0 1px 4px rgba(245,158,11,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
        overflow: 'hidden',
        minWidth: 0,
        transition: 'box-shadow 0.2s, transform 0.15s',
        cursor: 'default',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = desatualizado ? '0 1px 4px rgba(245,158,11,0.08)' : '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = ''; }}
    >
      {/* ─── Header ─── */}
      <div style={{
        padding: '0.85rem 1rem',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '0.5rem',
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: '0.6rem',
            color: '#94a3b8',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
          }}>
            <FiDatabase size={11} />
            {servico.contratoNome}
          </div>
          <div style={{
            fontSize: '1.05rem',
            fontWeight: 700,
            color: '#fff',
            marginTop: '0.15rem',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {servico.servicoNome}
          </div>
        </div>

        {/* Badges de status */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'flex-end', flexShrink: 0 }}>
          {desatualizado && (
            <span style={{
              fontSize: '0.58rem', padding: '0.12rem 0.45rem', borderRadius: '4px',
              background: 'rgba(245,158,11,0.2)', color: '#fbbf24', fontWeight: 700,
              letterSpacing: '0.02em',
            }}>
              Desatualizado
            </span>
          )}
          {!servico.temConfigDashboard && (
            <span style={{
              fontSize: '0.58rem', padding: '0.12rem 0.45rem', borderRadius: '4px',
              background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', fontWeight: 700,
              letterSpacing: '0.02em',
            }}>
              Sem KPIs
            </span>
          )}
          <span style={{
            fontSize: '0.58rem', padding: '0.12rem 0.45rem', borderRadius: '4px',
            background: 'rgba(255,255,255,0.08)', color: '#cbd5e1', fontWeight: 600,
          }}>
            {servico.totalRegistros.toLocaleString('pt-BR')} registros
          </span>
        </div>
      </div>

      {/* ─── Corpo: KPIs ─── */}
      <div style={{ padding: '0.75rem 1rem 0.6rem', minWidth: 0 }}>
        {semKpis ? (
          <div style={{
            textAlign: 'center',
            padding: '0.75rem',
            color: '#94a3b8',
            fontSize: '0.72rem',
            background: '#f8fafc',
            borderRadius: '8px',
            border: '1px dashed #e2e8f0',
          }}>
            {filtroCategoria && filtroCategoria !== 'todas'
              ? `Nenhum KPI de ${filtroCategoria === 'receita' ? 'receita' : 'operação'} neste serviço`
              : 'Nenhum KPI configurado'}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '0.4rem',
          }}>
            {kpisVisiveis.map((kpi, idx) => (
              <KpiMiniCard key={kpi.id || `${kpi.nome}-${idx}`} kpi={kpi} idx={idx} />
            ))}
            {kpisExcedentes > 0 && (
              <div style={{
                background: '#f8fafc',
                borderRadius: '8px',
                padding: '0.55rem 0.65rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94a3b8',
                fontSize: '0.72rem',
                fontWeight: 600,
                border: '1px dashed #e2e8f0',
              }}>
                +{kpisExcedentes} mais
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Footer: ações ─── */}
      <div style={{
        padding: '0.55rem 1rem',
        borderTop: '1px solid #f1f5f9',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '0.5rem',
        overflowWrap: 'break-word',
        wordBreak: 'break-word',
      }}>
        <span style={{
          fontSize: '0.68rem',
          color: desatualizado ? '#f59e0b' : '#94a3b8',
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
        }}>
          <FiClock size={11} />
          {formatarUltimoUpload(servico.ultimoUpload)}
        </span>

        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <button
            className="btn btn-sm"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.25rem',
              fontSize: '0.7rem', fontWeight: 600,
              padding: '0.3rem 0.6rem',
              background: '#f1f5f9', color: '#475569',
              border: '1px solid #e2e8f0', borderRadius: '6px',
              cursor: 'pointer',
            }}
            onClick={() => onNavigate(`/contratos/${servico.contratoId}/servicos/${servico.id}/dashboard`)}
          >
            <FiBarChart2 size={12} /> Ver Completo
          </button>
          <button
            className="btn btn-sm btn-primary"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.25rem',
              fontSize: '0.7rem', fontWeight: 600,
              padding: '0.3rem 0.6rem',
            }}
            onClick={() => onNavigate(`/contratos/${servico.contratoId}/servicos/${servico.id}/configurar`)}
          >
            <FiSettings size={12} /> Configurar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   Componente: Abas de Categoria
   ══════════════════════════════════════ */
function AbasCategoria({
  abaAtiva,
  onChange,
  decisao,
}: {
  abaAtiva: CategoriaKpi | 'todas';
  onChange: (aba: CategoriaKpi | 'todas') => void;
  decisao: { scores: Array<{ categoria: CategoriaKpi; status: string; totalKpis: number; label: string; icone: string }> };
}) {
  const abas = [
    { id: 'todas' as const, label: '📍 Geral', icone: <FiGrid size={13} />, score: null },
    ...decisao.scores
      .filter(s => s.totalKpis > 0 && s.categoria !== 'indefinido')
      .map(s => ({
        id: s.categoria as CategoriaKpi,
        label: s.label,
        icone: <span>{s.icone}</span>,
        score: s.status,
      })),
  ]

  return (
    <div style={{
      display: 'flex',
      gap: '0.25rem',
      marginBottom: '0.85rem',
      borderBottom: '2px solid #e2e8f0',
      paddingBottom: '0.2rem',
      overflowX: 'auto',
    }}>
      {abas.map(aba => {
        const ativa = abaAtiva === aba.id
        const corStatus = aba.score === 'critico' ? '#ef4444' : aba.score === 'atencao' ? '#f59e0b' : '#22c55e'
        
        return (
          <button
            key={aba.id}
            onClick={() => onChange(aba.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              padding: '0.4rem 0.85rem',
              fontSize: '0.72rem',
              fontWeight: 700,
              border: 'none',
              borderRadius: '8px 8px 0 0',
              background: ativa ? '#fff' : 'transparent',
              color: ativa ? '#0f172a' : '#64748b',
              cursor: 'pointer',
              borderBottom: ativa ? '2px solid #22c55e' : '2px solid transparent',
              marginBottom: '-2px',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {aba.icone}
            {aba.label}
            {aba.score && (
              <span style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: corStatus,
                display: 'inline-block',
                flexShrink: 0,
              }} />
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ══════════════════════════════════════
   Componente Principal
   ══════════════════════════════════════ */
export default function DashboardPrincipal() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { adicionarToast } = useToast();

  const [servicos, setServicos] = useState<ServicoConsolidado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  // ═══ Google Filters ═══
  const filtrosGA = useGoogleFilters();

  // ═══ Abas e Decisão ═══
  const [abaAtiva, setAbaAtiva] = useState<CategoriaKpi | 'todas'>('todas');
  const [filtrosDisponiveis, setFiltrosDisponiveis] = useState<FiltrosDisponiveis>({ tiposCaminhao: [] });

  // Extrair todos os KPIs de todos os serviços para o motor de decisão
  const todosKpis = useMemo(() => {
    return servicos.flatMap(s => s.kpis)
  }, [servicos])

  const decisao = useDecisionEngine(todosKpis)

  const carregarDados = useCallback(async (params?: Record<string, string | undefined>) => {
    setCarregando(true);
    setErro('');
    try {
      const filtrosApi: FiltrosDashboardPrincipal = {};
      if (params?.dataInicio) filtrosApi.dataInicio = params.dataInicio;
      if (params?.dataFim) filtrosApi.dataFim = params.dataFim;
      if (params?.['filtro_TIPO CAMINHAO'] || params?.['filtro_TIPO_CAMINHAO'] || params?.['filtro_tipoCaminhao']) {
        filtrosApi.tipoCaminhao = params['filtro_TIPO CAMINHAO'] || params['filtro_TIPO_CAMINHAO'] || params['filtro_tipoCaminhao'];
      }
      if (params?.['filtro_PLACA']) filtrosApi.placa = params['filtro_PLACA'];
      if (params?.['filtro_REGIONAL'] || params?.['filtro_REGIAO']) {
        filtrosApi.regional = params['filtro_REGIONAL'] || params['filtro_REGIAO'];
      }

      const data = await servicoService.getKpisConsolidado(filtrosApi);
      setServicos(data.servicos || []);

      // Atualizar métricas de contexto
      const totalReg = data.servicos.reduce((s, sv) => s + sv.totalRegistros, 0);
      filtrosGA.setTotalRegistros(totalReg);
      filtrosGA.setTotalFiltrado(totalReg);

      if (data.filtrosDisponiveis) {
        setFiltrosDisponiveis(data.filtrosDisponiveis);

        // Registrar dimensões disponíveis no GoogleFilterBar
        const dimensoes = [];
        if (data.filtrosDisponiveis.tiposCaminhao?.length > 0) {
          dimensoes.push({
            nome: 'TIPO CAMINHAO',
            label: 'Tipo de Caminhão',
            totalOpcoes: data.filtrosDisponiveis.tiposCaminhao.length,
            opcoes: data.filtrosDisponiveis.tiposCaminhao,
          });
        }
        // Adicionar dimensões manuais fixas
        dimensoes.push({
          nome: 'REGIONAL',
          label: 'Regional',
          totalOpcoes: 10,
          opcoes: [],
        });
        dimensoes.push({
          nome: 'PLACA',
          label: 'Placa',
          totalOpcoes: 50,
          opcoes: [],
        });
        filtrosGA.registrarDimensoes(dimensoes);
      }
    } catch (err: any) {
      console.error('[DashboardPrincipal] Erro:', err);
      setErro('Erro ao carregar dados dos serviços');
      adicionarToast('Erro ao carregar dashboard', 'error');
    } finally {
      setCarregando(false);
    }
  }, [adicionarToast, filtrosGA]);

  useEffect(() => {
    carregarDados(filtrosGA.toApiParams());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll para serviço focalizado via ?foco=servicoId
  useEffect(() => {
    const focoId = searchParams.get('foco');
    if (focoId && !carregando && servicos.length > 0) {
      setTimeout(() => {
        const el = document.getElementById(`servico-card-${focoId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.style.boxShadow = '0 0 0 3px #22c55e, 0 8px 24px rgba(99,102,241,0.25)';
          setTimeout(() => { el.style.boxShadow = ''; }, 3000);
        }
      }, 300);
    }
  }, [searchParams, carregando, servicos]);

  const totalRegistros = servicos.reduce((s, sv) => s + sv.totalRegistros, 0);
  const totalKpis = servicos.reduce((s, sv) => s + sv.kpis.length, 0);
  const servicosComDados = servicos.filter(s => s.totalRegistros > 0).length;

  // ─── Navegação ───
  const handleNavigate = useCallback((path: string) => {
    navigate(path);
  }, [navigate]);

  // ─── Loading ───
  if (carregando) {
    return (
      <div style={{ padding: '1.5rem 2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <div className="skeleton" style={{ height: '28px', width: '300px', marginBottom: '0.5rem', borderRadius: '6px' }} />
        <div className="skeleton" style={{ height: '14px', width: '200px', marginBottom: '1.5rem', borderRadius: '6px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
          {[1,2,3].map(i => (
            <div key={i} className="skeleton" style={{ height: '240px', borderRadius: '12px' }} />
          ))}
        </div>
      </div>
    );
  }

  // ─── Erro ───
  if (erro) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem', maxWidth: '500px', margin: '0 auto' }}>
        <FiAlertCircle size={48} style={{ marginBottom: '1rem', color: '#ef4444', opacity: 0.5 }} />
        <h3 style={{ color: '#dc2626', marginBottom: '0.5rem' }}>Erro ao carregar</h3>
        <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>{erro}</p>
        <button className="btn btn-primary" onClick={() => carregarDados(filtrosAplicados)}>
          <FiRefreshCw size={14} /> Tentar Novamente
        </button>
      </div>
    );
  }

  // ─── Empty State ───
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
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
          Crie um contrato, adicione um serviço e faça upload de uma planilha<br />
          para começar a visualizar os indicadores.
        </p>
        <button className="btn btn-primary" onClick={() => navigate('/contratos')} style={{ padding: '0.5rem 1.25rem' }}>
          Ir para Contratos <FiArrowRight size={14} style={{ marginLeft: '0.25rem' }} />
        </button>
      </div>
    );
  }

  // ─── Agrupar por contrato ───
  const grupos = new Map<string, { contratoNome: string; contratoId: string; servicos: ServicoConsolidado[] }>();
  for (const s of servicos) {
    if (!grupos.has(s.contratoId)) {
      grupos.set(s.contratoId, { contratoNome: s.contratoNome, contratoId: s.contratoId, servicos: [] });
    }
    grupos.get(s.contratoId)!.servicos.push(s);
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.25rem 2rem' }}>
      {/* ═══ TOPO: Resumo + Ações ═══ */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '0.5rem',
        flexWrap: 'wrap',
        gap: '0.75rem',
      }}>
        <div>
          <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.35rem', fontWeight: 700 }}>
            Dashboard Principal
          </h2>
          <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
            <StatChip label="Serviços" value={servicos.length} color="#22c55e" />
            <StatChip label="Registros" value={totalRegistros} color="#22c55e" />
            <StatChip label="KPIs" value={totalKpis} color="#f59e0b" />
            <StatChip label="Com dados" value={servicosComDados} color="#14b8a6" />
          </div>
        </div>
      </div>

      {/* ═══ GOOGLE FILTER BAR ═══ */}
      <GoogleFilterBar
        periodo={filtrosGA.periodo}
        comparacao={filtrosGA.comparacao}
        dimensoes={filtrosGA.dimensoes}
        totalRegistros={filtrosGA.totalRegistros}
        totalFiltrado={filtrosGA.totalFiltrado}
        variacaoPeriodo={filtrosGA.variacaoPeriodo}
        carregando={carregando}
        onSetPeriodo={filtrosGA.setPeriodo}
        onToggleComparacao={filtrosGA.toggleComparacao}
        onAdicionarFiltro={filtrosGA.adicionarFiltro}
        onRemoverFiltro={filtrosGA.removerFiltro}
        onLimparDimensao={filtrosGA.limparDimensao}
        onLimparTodos={() => {
          filtrosGA.limparTodos();
          carregarDados();
        }}
        onRefresh={() => carregarDados(filtrosGA.toApiParams())}
      />

      {/* ═══ DECISION HEADER: Scores + Prioridades ═══ */}
      {!carregando && servicos.length > 0 && (
        <DecisionHeader
          scores={decisao.scores}
          prioridades={decisao.prioridades}
          temPrioridades={decisao.temPrioridades}
          onVerCompleto={() => navigate('/dashboard/executivo')}
        />
      )}

      {/* ═══ ABAS: Geral | 💰 Receita | 📋 Operacional ═══ */}
      <AbasCategoria
        abaAtiva={abaAtiva}
        onChange={setAbaAtiva}
        decisao={decisao}
      />

      {/* ═══ CARDS POR CONTRATO ═══ */}
      {Array.from(grupos.entries()).map(([contratoId, grupo]) => (
        <div key={contratoId} style={{ marginBottom: '2rem' }}>
          {/* Título do grupo */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.85rem',
          }}>
            <div style={{
              width: '4px', height: '20px', borderRadius: '2px',
              background: 'linear-gradient(180deg, #22c55e, #4ade80)',
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: '0.8rem',
              fontWeight: 700,
              color: '#334155',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
            }}>
              {grupo.contratoNome}
            </span>
            <span style={{
              fontSize: '0.7rem',
              color: '#94a3b8',
              fontWeight: 600,
              background: '#f1f5f9',
              padding: '0.1rem 0.45rem',
              borderRadius: '4px',
            }}>
              {grupo.servicos.length} serviço{grupo.servicos.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Grid de cards — 3 por linha fixo */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.85rem',
            width: '100%',
          }}>
            {grupo.servicos.map(servico => (
              <ServicoCard
                key={servico.id}
                servico={servico}
                onNavigate={handleNavigate}
                filtroCategoria={abaAtiva}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Stat Chip auxiliar ─── */
function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span style={{
      fontSize: '0.72rem',
      color: '#64748b',
      fontWeight: 500,
      display: 'flex',
      alignItems: 'center',
      gap: '0.25rem',
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
