/* ============================================
   DashboardExecutivo — Visão Executiva Financeira e Operacional
   Três camadas hierárquicas: Financeiro > Operacional > Gráficos
   Comparativo automático com período anterior
   Cache de 5 minutos com refresh forçado
   URL: /dashboard/executivo
   ═══ FILTROS MELHORADOS ═══
   - Auto-aplicar ao mudar período predefinido
   - Carregamento dinâmico de serviços ao trocar contrato
   - Badges de filtros ativos com contagem de registros
   - Botão de reset rápido
   - Botão "Aplicar" apenas para período personalizado
   ============================================ */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FiRefreshCw, FiShare2, FiBarChart2,
  FiDollarSign, FiActivity, FiTruck, FiClock,
  FiMapPin, FiTrendingUp, FiChevronDown, FiAlertCircle,
  FiCalendar, FiFilter, FiX, FiDatabase,
} from 'react-icons/fi';
import { useToast } from '../contexts/ToastContext';
import dashboardExecutivoService from '../services/dashboardExecutivoService';
import type {
  DashboardExecutivoResponse, FiltrosExecutivo,
  FinanceiroPainel, OperacionalPainel, GraficosPainel,
  AnaliseFinanceira, AnaliseOperacional,
} from '../services/dashboardExecutivoService';
import RankingMotoristasTable from '../components/RankingMotoristasTable';
import MotoristaBarChart from '../components/MotoristaBarChart';
import GoogleFilterBar from '../components/GoogleFilterBar';
import { useGoogleFilters } from '../hooks/useGoogleFilters';
import '../styles/ExecutivoDashboard.css';

/* ─── Cache ─── */
const CACHE_DURACAO = 5 * 60 * 1000; // 5 minutos
let cacheData: { dados: DashboardExecutivoResponse; timestamp: number } | null = null;
let cacheFiltros: string = '';

/* ─── Helpers ─── */

function formatarDataISO(data: string): string {
  const d = new Date(data);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatarHoraISO(data: string): string {
  const d = new Date(data);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/* ─── Componente: Badge de Variação ─── */
function VariacaoBadge({ variacao }: { variacao: { valor: number; tipo: string } }) {
  if (variacao.tipo === 'estavel' || Math.abs(variacao.valor) < 0.5) {
    return <span className="variacao-badge estavel">→ 0%</span>;
  }
  const isUp = variacao.tipo === 'aumento';
  return (
    <span className={`variacao-badge ${isUp ? 'aumento' : 'reducao'}`}>
      {isUp ? '↑' : '↓'} {Math.abs(variacao.valor).toFixed(1)}%
    </span>
  );
}

/* ─── Componente: Mini Tendência SVG ─── */
function MiniTendencia({ svg }: { svg?: string }) {
  if (!svg) return null;
  return (
    <div className="minitendencia" dangerouslySetInnerHTML={{ __html: svg }} />
  );
}

/* ─── Componente: Card Financeiro ─── */
function CardFinanceiro({
  label, card, destaque = false, icone, origem,
}: {
  label: string;
  card: { valor: number; formatado: string; variacao: { valor: number; tipo: string }; minitendenciaSvg?: string };
  destaque?: boolean;
  icone: React.ReactNode;
  origem?: 'real' | 'estimado';
}) {
  return (
    <div className={`financeiro-card ${destaque ? 'destaque' : ''}`}>
      <div className="label" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
        <span style={{ opacity: 0.5 }}>{icone}</span>
        {label}
        {origem && (
          <span className={`origem-badge ${origem}`}>
            {origem === 'estimado' ? '⚡ Estimado' : '✅ Real'}
          </span>
        )}
      </div>
      <div className="valor">{card.formatado}</div>
      <VariacaoBadge variacao={card.variacao} />
      <MiniTendencia svg={card.minitendenciaSvg} />
    </div>
  );
}

/* ─── Componente: Card Operacional ─── */
function CardOperacional({
  label, card, icone,
}: {
  label: string;
  card: { valor: number; formatado: string; variacao: { valor: number; tipo: string } };
  icone: React.ReactNode;
}) {
  return (
    <div className="operacional-card">
      <div className="label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <span style={{ opacity: 0.5 }}>{icone}</span>
        {label}
      </div>
      <div className="valor">{card.formatado}</div>
      <VariacaoBadge variacao={card.variacao} />
    </div>
  );
}

/* ─── Componente: Seção Expansível ─── */
function SecaoExpansivel({
  titulo, cor, children, defaultOpen = false,
}: {
  titulo: string; cor: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [aberto, setAberto] = useState(defaultOpen);
  return (
    <div className="expansivel-section">
      <button
        className={`expansivel-header ${aberto ? 'expanded' : ''}`}
        onClick={() => setAberto(!aberto)}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ width: '3px', height: '16px', borderRadius: '2px', background: cor, display: 'inline-block' }} />
          {titulo}
        </span>
        <FiChevronDown size={16} />
      </button>
      {aberto && <div className="expansivel-body">{children}</div>}
    </div>
  );
}

/* ══════════════════════════════════════
   Componente Principal
   ══════════════════════════════════════ */
export default function DashboardExecutivo() {
  const { adicionarToast } = useToast();

  const [dados, setDados] = useState<DashboardExecutivoResponse | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  // ═══ Google Filters ═══
  const filtrosGA = useGoogleFilters();

  const [cacheIdade, setCacheIdade] = useState<number>(0);
  const cacheIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ═══ Estado para Aba de Motoristas ═══
  const [abaMotorista, setAbaMotorista] = useState<'ranking' | 'comparativo'>('ranking');

  // Referência para o canvas dos gráficos
  const chartRefs = useRef<{ tipo?: any; tendencia?: any; volume?: any }>({});





  const handleRefresh = useCallback(() => {
    carregarDados(true);
  }, [carregarDados]);

  /* ═══ Handlers de filtros com auto-aplicar ═══ */

  // Quando filtros do GA mudarem, recarregar dados
  const handleFiltrosChange = useCallback(() => {
    carregarDados(true);
  }, [carregarDados]);

  const handleCompartilhar = useCallback(() => {
    if (!dados) return;
    const url = `${window.location.origin}/dashboard/executivo`;
    navigator.clipboard.writeText(url).then(() => {
      adicionarToast('Link copiado!', 'success');
    }).catch(() => {
      adicionarToast('Erro ao copiar link', 'error');
    });
  }, [dados, adicionarToast]);

  // ═══ RENDER: Gráficos com Chart.js ═══
  useEffect(() => {
    if (!dados) return;

    const carregarChartJS = async () => {
      if ((window as any).Chart) {
        renderizarGraficos();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js';
      script.onload = () => {
        setTimeout(renderizarGraficos, 100);
      };
      document.head.appendChild(script);
    };

    function renderizarGraficos() {
      const Chart = (window as any).Chart;
      if (!Chart) return;

      Chart.defaults.animation = false;
      const g = dados!.graficos;
      const formatMoeda = (val: number | undefined) => 'R$ ' + (val ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

      // Destruir gráficos existentes antes de recriar
      ['chart-receita-km', 'chart-receita-hora', 'chart-receita-diaria',
       'chart-ranking-motoristas', 'chart-receita-regional',
       'chart-receita-diasemana', 'chart-receita-turno'].forEach(id => {
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        if (canvas) {
          const existing = (Chart as any).getChart(canvas);
          if (existing) existing.destroy();
        }
      });

      // 1. Receita por Km Rodado (barras)
      const ctx1 = document.getElementById('chart-receita-km') as HTMLCanvasElement;
      if (ctx1 && g.receitaKmDiario.length > 0) {
        new Chart(ctx1, {
          type: 'bar',
          data: {
            labels: g.receitaKmDiario.map((r: any) => r.label),
            datasets: [{
              label: 'Receita/Km',
              data: g.receitaKmDiario.map((r: any) => r.valor),
              backgroundColor: '#3b82f6',
              borderRadius: 4,
            }]
          },
          options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx: any) => {
                    const item = g.receitaKmDiario[ctx.dataIndex];
                    return [
                      'Receita/Km: ' + formatMoeda(ctx.parsed.y),
                      'KM: ' + Number(item.km).toLocaleString('pt-BR'),
                      'Faturamento: ' + formatMoeda(item.faturamento),
                    ];
                  },
                },
              },
            },
            scales: {
              x: { ticks: { font: { size: 9 } } },
              y: {
                ticks: {
                  font: { size: 9 },
                  callback: (val: any) => 'R$ ' + Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                },
              },
            },
          },
        });
      }

      // 2. Receita por Hora Produtiva (barras)
      const ctx2 = document.getElementById('chart-receita-hora') as HTMLCanvasElement;
      if (ctx2 && g.receitaHoraDiario.length > 0) {
        new Chart(ctx2, {
          type: 'bar',
          data: {
            labels: g.receitaHoraDiario.map((r: any) => r.label),
            datasets: [{
              label: 'Receita/Hora',
              data: g.receitaHoraDiario.map((r: any) => r.valor),
              backgroundColor: '#f59e0b',
              borderRadius: 4,
            }]
          },
          options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx: any) => {
                    const item = g.receitaHoraDiario[ctx.dataIndex];
                    return [
                      'Receita/Hora: ' + formatMoeda(ctx.parsed.y),
                      'Horas: ' + Number(item.horas).toFixed(1) + 'h',
                      'Faturamento: ' + formatMoeda(item.faturamento),
                    ];
                  },
                },
              },
            },
            scales: {
              x: { ticks: { font: { size: 9 } } },
              y: {
                ticks: {
                  font: { size: 9 },
                  callback: (val: any) => 'R$ ' + Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                },
              },
            },
          },
        });
      }

      // ═══ NOVOS GRÁFICOS DE RECEITA ═══

      // 3. Evolução Diária de Receita (linha)
      const ctx3 = document.getElementById('chart-receita-diaria') as HTMLCanvasElement;
      if (ctx3 && g.receitaDiaria && g.receitaDiaria.length > 0) {
        new Chart(ctx3, {
          type: 'line',
          data: {
            labels: g.receitaDiaria.map((r: any) => r.label),
            datasets: [{
              label: 'Receita',
              data: g.receitaDiaria.map((r: any) => r.valor),
              borderColor: '#22c55e',
              backgroundColor: 'rgba(34,197,94,0.08)',
              fill: true, tension: 0.3, pointRadius: 3,
              pointBackgroundColor: '#22c55e', borderWidth: 2,
            }]
          },
          options: {
            animation: false, responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { font: { size: 8 } } },
              y: { ticks: { font: { size: 8 }, callback: (v: any) => (v/1000).toFixed(0)+'k' } }
            },
          },
        });
      }

      // 4. Ranking Motoristas (barras horizontais)
      const ctx4 = document.getElementById('chart-ranking-motoristas') as HTMLCanvasElement;
      if (ctx4 && g.rankingMotoristas && g.rankingMotoristas.length > 0) {
        const lbl4 = [...g.rankingMotoristas].reverse().map((r: any) =>
          r.motorista.length > 16 ? r.motorista.slice(0,14)+'…' : r.motorista
        );
        const dat4 = [...g.rankingMotoristas].reverse().map((r: any) => r.faturamento);
        const col4 = dat4.map((_: any, i: number) =>
          i === dat4.length-1 ? '#fbbf24' : i === dat4.length-2 ? '#94a3b8' : i === dat4.length-3 ? '#d97706' : '#22c55e'
        );
        new Chart(ctx4, {
          type: 'bar',
          data: { labels: lbl4, datasets: [{ data: dat4, backgroundColor: col4, borderRadius: 3 }] },
          options: {
            indexAxis: 'y', animation: false, responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { font: { size: 8 }, callback: (v: any) => (v/1000).toFixed(0)+'k' } },
              y: { ticks: { font: { size: 8 } } }
            },
          },
        });
      }

      // 5. Receita por Regional (barras)
      const ctx5 = document.getElementById('chart-receita-regional') as HTMLCanvasElement;
      if (ctx5 && g.receitaPorRegional?.length > 0) {
        const maxF = Math.max(...g.receitaPorRegional?.map((r: any) => r.faturamento));
        const cores5 = g.receitaPorRegional?.map((r: any) => {
          const pct = r.faturamento / maxF;
          return pct > 0.75 ? '#059669' : pct > 0.50 ? '#10b981' : pct > 0.25 ? '#34d399' : '#a7f3d0';
        });
        new Chart(ctx5, {
          type: 'bar',
          data: {
            labels: g.receitaPorRegional?.map((r: any) => r.regional),
            datasets: [{ data: g.receitaPorRegional?.map((r: any) => r.faturamento), backgroundColor: cores5, borderRadius: 4 }]
          },
          options: {
            animation: false, responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { font: { size: 9 } } },
              y: { ticks: { font: { size: 8 }, callback: (v: any) => (v/1000).toFixed(0)+'k' } }
            },
          },
        });
      }

      // 6. Receita por Dia da Semana
      const ctx6 = document.getElementById('chart-receita-diasemana') as HTMLCanvasElement;
      if (ctx6 && g.receitaPorDiaSemana && g.receitaPorDiaSemana.length > 0) {
        const diasLabel = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
        const lbl6 = g.receitaPorDiaSemana.map((d: any) => diasLabel[d.diaSemana-1] || d.diaNome);
        new Chart(ctx6, {
          type: 'bar',
          data: {
            labels: lbl6,
            datasets: [{
              data: g.receitaPorDiaSemana.map((d: any) => d.faturamento),
              backgroundColor: ['#ef4444','#3b82f6','#22c55e','#f59e0b','#8b5cf6','#ec4899','#06b6d4'],
              borderRadius: 4,
            }]
          },
          options: {
            animation: false, responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { font: { size: 9 } } },
              y: { ticks: { font: { size: 8 }, callback: (v: any) => (v/1000).toFixed(0)+'k' } }
            },
          },
        });
      }

      // 7. Receita por Turno (donut)
      const ctx7 = document.getElementById('chart-receita-turno') as HTMLCanvasElement;
      if (ctx7 && g.receitaPorTurno?.length > 0) {
        new Chart(ctx7, {
          type: 'doughnut',
          data: {
            labels: g.receitaPorTurno?.map((t: any) => t.turno),
            datasets: [{
              data: g.receitaPorTurno?.map((t: any) => t.faturamento),
              backgroundColor: ['#fbbf24','#1e293b','#6366f1','#ec4899'],
              borderWidth: 2, borderColor: 'white',
            }]
          },
          options: {
            animation: false, responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 10 } },
            },
          },
        });
      }
    }

    carregarChartJS();
  }, [dados]);

  // ═══ RENDER (Carregando) — skeleton com formato de gráficos ═══
  if (carregando) {
    return (
      <div className="executivo-container">
        <div className="exec-header">
          <div>
            <div className="exec-skeleton" style={{ height: '28px', width: '300px', marginBottom: '0.5rem' }} />
            <div className="exec-skeleton" style={{ height: '14px', width: '200px' }} />
          </div>
        </div>
        <div className="exec-skeleton" style={{ height: '48px', width: '100%', marginBottom: '1rem' }} />
        <div className="financeiro-grid">
          {[1,2,3,4].map(i => <div key={i} className="exec-skeleton" style={{ height: '120px' }} />)}
        </div>
        <div className="operacional-grid">
          {[1,2,3,4,5,6].map(i => <div key={i} className="exec-skeleton" style={{ height: '80px' }} />)}
        </div>
        {/* Skeleton dos gráficos com formato de barras simuladas */}
        <div className="graficos-row-2">
          <div className="grafico-card">
            <div className="exec-skeleton" style={{ height: '16px', width: '180px', marginBottom: '0.75rem' }} />
            <div className="chart-skeleton">
              <div className="chart-skeleton-bars">
                {[1,2,3,4,5,6,7].map(i => (
                  <div key={i} className="chart-skeleton-bar" style={{
                    height: `${20 + Math.random() * 60}%`,
                    animationDelay: `${i * 0.1}s`,
                  }} />
                ))}
              </div>
            </div>
          </div>
          <div className="grafico-card">
            <div className="exec-skeleton" style={{ height: '16px', width: '200px', marginBottom: '0.75rem' }} />
            <div className="chart-skeleton">
              <div className="chart-skeleton-bars">
                {[1,2,3,4,5,6,7,8,9,10].map(i => (
                  <div key={i} className="chart-skeleton-bar" style={{
                    height: `${15 + Math.random() * 50}%`,
                    width: '8%',
                    animationDelay: `${i * 0.08}s`,
                    background: 'linear-gradient(180deg, #6366f1 0%, #818cf8 100%)',
                  }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="executivo-container" style={{ textAlign: 'center', paddingTop: '3rem' }}>
        <FiAlertCircle size={48} style={{ color: '#ef4444', opacity: 0.5, marginBottom: '1rem' }} />
        <h3 style={{ color: '#dc2626', marginBottom: '0.5rem' }}>Erro ao carregar</h3>
        <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>{erro}</p>
        <button className="btn btn-primary" onClick={handleRefresh}>
          <FiRefreshCw size={14} /> Tentar Novamente
        </button>
      </div>
    );
  }

  if (!dados) {
    return (
      <div className="executivo-container" style={{ textAlign: 'center', paddingTop: '3rem' }}>
        <FiBarChart2 size={48} style={{ color: '#22c55e', opacity: 0.3, marginBottom: '1rem' }} />
        <h3 style={{ color: '#475569', marginBottom: '0.5rem' }}>Dashboard Executivo</h3>
        <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
          Selecione um período e clique em &quot;Aplicar&quot; para visualizar os indicadores.
        </p>
        <button className="btn btn-primary" onClick={() => carregarDados(true)}>
          <FiBarChart2 size={14} /> Carregar Dados
        </button>
      </div>
    );
  }

  const { financeiro: f, operacional: o, graficos: g, periodo: p, analiseFinanceira: af, analiseOperacional: ao } = dados;

  return (
    <div className="executivo-container">
      {/* ═══ HEADER ═══ */}
      <div className="exec-header">
        <div>
          <h1>
            <FiBarChart2 size={22} />
            Dashboard Executivo
          </h1>
          <div className="data-geracao">
            <FiClock size={12} />
            {p.label} • Atualizado {formatarDataISO(dados.metadados.dataGeracao)} às {formatarHoraISO(dados.metadados.dataGeracao)}
            {cacheIdade > 0 && (
              <span className={`cache-badge ${cacheIdade > 60 ? 'aged' : ''}`}>
                Dados de {cacheIdade >= 60
                  ? Math.floor(cacheIdade / 60) + 'min'
                  : cacheIdade + 's'} atrás
              </span>
            )}
          </div>
        </div>
        <div className="exec-actions">
          <button className="btn-compartilhar" onClick={handleCompartilhar}>
            <FiShare2 size={13} /> Compartilhar
          </button>
          <button
            className={`btn-refresh-moderno compact ${cacheIdade > 60 ? 'stale pulse' : ''}`}
            onClick={handleRefresh}
            title={cacheIdade > 60 ? `Dados de ${Math.floor(cacheIdade / 60)}min atrás — clique para atualizar` : 'Atualizar dados'}>
            <FiRefreshCw size={12} />
            <span className="refresh-text">Atualizar</span>
          </button>
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
          carregarDados(true);
        }}
        onRefresh={() => carregarDados(true)}
      />

      {/* ═══ CAMADA 1: PAINEL FINANCEIRO ═══ */}
      <div className="exec-section-title">
        <div className="bar green" />
        <span>Painel Financeiro</span>
      </div>

      <div className="financeiro-grid">
        <CardFinanceiro
          label="Faturamento Total"
          card={f.faturamento}
          destaque
          icone={<FiDollarSign size={14} />}
          origem={g.usandoEstimativa ? 'estimado' : 'real'}
        />
        <CardFinanceiro
          label="Custo Operacional"
          card={f.custoOperacional}
          icone={<FiActivity size={14} />}
        />
        <CardFinanceiro
          label="Margem Bruta"
          card={f.margemBruta}
          icone={<FiTrendingUp size={14} />}
        />
        <CardFinanceiro
          label="Receita por Hora"
          card={f.receitaHora}
          icone={<FiClock size={14} />}
        />
        <CardFinanceiro
          label="Ticket Médio"
          card={f.ticketMedio}
          icone={<FiBarChart2 size={14} />}
        />
      </div>

      {/* ═══ CAMADA 2: PAINEL OPERACIONAL ═══ */}
      <div className="exec-section-title">
        <div className="bar blue" />
        <span>Painel Operacional</span>
      </div>

      <div className="operacional-grid">
        <CardOperacional label="Tonelagem" card={o.tonelagem} icone={<FiTruck size={12} />} />
        <CardOperacional label="KM Rodados" card={o.kmRodados} icone={<FiMapPin size={12} />} />
        <CardOperacional label="Viagens" card={o.viagens} icone={<FiActivity size={12} />} />
        <CardOperacional label="Coletores Ativos" card={o.coletoresAtivos} icone={<FiTruck size={12} />} />
        <CardOperacional label="Horas Produtivas" card={o.horasProdutivas} icone={<FiClock size={12} />} />
        <CardOperacional label="Eficiência (t/km)" card={o.eficiencia} icone={<FiTrendingUp size={12} />} />
      </div>

      {/* ═══ CAMADA 3: GRÁFICOS FINANCEIROS PUROS ═══ */}
      <div className="exec-section-title">
        <div className="bar purple" />
        <span>Gráficos Financeiros</span>
      </div>

      <div className="graficos-row-2">
        <div className="grafico-card">
          <h3>📊 Receita por Km Rodado (7 dias)</h3>
          {g.usandoEstimativa && (
            <div className="estimativa-badge">
              <FiAlertCircle size={12} />
              Estimativa de R$ 80/ton — Configure valores no contrato
            </div>
          )}
          <div className="chart-wrapper">
            <canvas id="chart-receita-km"></canvas>
          </div>
          <div className="grafico-media" style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
            Média: {(g.receitaKmMedio ?? 0) > 0 ? 'R$ ' + (g.receitaKmMedio ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '/km' : '—'}
          </div>
        </div>

        <div className="grafico-card">
          <h3>📊 Receita por Hora Produtiva (7 dias)</h3>
          {g.usandoEstimativa && (
            <div className="estimativa-badge">
              <FiAlertCircle size={12} />
              Estimativa de R$ 80/ton — Configure valores no contrato
            </div>
          )}
          <div className="chart-wrapper">
            <canvas id="chart-receita-hora"></canvas>
          </div>
          <div className="grafico-media" style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
            Média: {(g.receitaHoraMedia ?? 0) > 0 ? 'R$ ' + (g.receitaHoraMedia ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '/h' : '—'}
          </div>
        </div>
      </div>

      {/* ═══ NOVOS GRÁFICOS DE RECEITA ═══ */}
      <div className="graficos-row-2">
        {/* 📊 Gráfico: Evolução Diária de Receita */}
        <div className="grafico-card">
          <h3>📈 Evolução Diária de Receita</h3>
          <div className="chart-wrapper">
            <canvas id="chart-receita-diaria"></canvas>
          </div>
        </div>

        {/* 📊 Gráfico: Ranking Motoristas */}
        <div className="grafico-card">
          <h3>🏆 Top Motoristas por Receita</h3>
          <div className="chart-wrapper">
            <canvas id="chart-ranking-motoristas"></canvas>
          </div>
        </div>
      </div>

      {g.receitaPorRegional?.length > 0 && (
        <div className="graficos-row-2">
          {/* 📊 Gráfico: Receita por Regional */}
          <div className="grafico-card">
            <h3>🌎 Receita por Regional</h3>
            <div className="chart-wrapper">
              <canvas id="chart-receita-regional"></canvas>
            </div>
          </div>

          {/* 📊 Gráfico: Receita por Dia da Semana */}
          <div className="grafico-card">
            <h3>📅 Receita por Dia da Semana</h3>
            <div className="chart-wrapper">
              <canvas id="chart-receita-diasemana"></canvas>
            </div>
          </div>
        </div>
      )}

      {g.receitaPorTurno?.length > 1 && (
        <div className="graficos-row-2">
          {/* 📊 Gráfico: Receita por Turno */}
          <div className="grafico-card" style={{ maxWidth: '50%' }}>
            <h3>☀️ Receita por Turno</h3>
            <div className="chart-wrapper">
              <canvas id="chart-receita-turno"></canvas>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ANÁLISE FINANCEIRA EXPANSÍVEL (RECEITA) ═══ */}
      <SecaoExpansivel titulo="Análise Financeira Detalhada — Receita" cor="#f59e0b">
        <div className="analise-grid" style={{ marginBottom: '1rem' }}>
          <div className="analise-card">
            <div className="label">Projeção Mensal</div>
            <div className="value">
              {af.projecaoMensal.projecao > 0
                ? `R$ ${af.projecaoMensal.projecao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                : <span className="nao-disponivel">Sem dados</span>
              }
            </div>
            <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.15rem' }}>
              Média diária: R$ {af.projecaoMensal.mediaDiaria.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} • {af.projecaoMensal.diasRestantes} dias restantes
            </div>
          </div>

          <div className="analise-card">
            <div className="label">🎯 Projeção — Cenário Realista</div>
            <div className="value" style={{ color: '#059669' }}>
              {af.projecaoCenarios?.cenarios?.[1]?.valor > 0
                ? `R$ ${af.projecaoCenarios?.cenarios?.[1]?.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                : <span className="nao-disponivel">Sem dados</span>
              }
            </div>
            <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '0.15rem' }}>
              {af.projecaoCenarios?.diasRestantes > 0
                ? `${af.projecaoCenarios?.diasRestantes} dias restantes`
                : 'Fim do período'}
            </div>
          </div>

          <div className="analise-card" style={{ borderTopColor: '#f59e0b' }}>
            <div className="label">⚡ Cenário Otimista</div>
            <div className="value" style={{ color: '#059669' }}>
              {af.projecaoCenarios?.cenarios?.[0]?.valor > 0
                ? `R$ ${af.projecaoCenarios?.cenarios?.[0]?.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                : <span className="nao-disponivel">—</span>
              }
            </div>
            <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '0.1rem' }}>
              {af.projecaoCenarios?.cenarios?.[0]?.diferenca
                ? `+${af.projecaoCenarios?.cenarios?.[0]?.diferenca.toFixed(1)}% sobre o atual`
                : ''}
            </div>
          </div>

          <div className="analise-card" style={{ borderTopColor: '#94a3b8' }}>
            <div className="label">📉 Cenário Pessimista</div>
            <div className="value" style={{ color: '#dc2626' }}>
              {af.projecaoCenarios?.cenarios?.[2]?.valor > 0
                ? `R$ ${af.projecaoCenarios?.cenarios?.[2]?.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                : <span className="nao-disponivel">—</span>
              }
            </div>
            <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '0.1rem' }}>
              {af.projecaoCenarios?.cenarios?.[2]?.diferenca
                ? `${af.projecaoCenarios?.cenarios?.[2]?.diferenca.toFixed(1)}% sobre o atual`
                : ''}
            </div>
          </div>
        </div>

        {/* ═══ NOVOS INDICADORES DE RECEITA ═══ */}
        {(af.faturamentoPorRegional?.length > 0 ||
          af.faturamentoPorTurno?.length > 0 ||
          af.faturamentoPorDiaSemana?.length > 0) && (
          <>
            <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', margin: '0.5rem 0' }}>
              📍 Receita por Segmentação
            </h4>
            <div className="analise-grid" style={{ marginBottom: '0.75rem' }}>
              {/* Regional */}
              {af.faturamentoPorRegional?.length > 0 && (
                <div className="analise-card">
                  <div className="label">🌎 Receita por Regional</div>
                  <table className="analise-tabela" style={{ fontSize: '0.68rem', marginTop: '0.3rem' }}>
                    <thead>
                      <tr><th>Regional</th><th>Receita</th><th>Viagens</th></tr>
                    </thead>
                    <tbody>
                      {af.faturamentoPorRegional?.slice(0, 6).map((r, i) => (
                        <tr key={i}>
                          <td><strong>{r.regional}</strong></td>
                          <td>{r.faturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                          <td>{r.viagens}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Turno */}
              {af.faturamentoPorTurno?.length > 0 && (
                <div className="analise-card">
                  <div className="label">☀️ Receita por Turno</div>
                  <table className="analise-tabela" style={{ fontSize: '0.68rem', marginTop: '0.3rem' }}>
                    <thead>
                      <tr><th>Turno</th><th>Receita</th><th>Média/Viagem</th></tr>
                    </thead>
                    <tbody>
                      {af.faturamentoPorTurno?.map((t, i) => (
                        <tr key={i}>
                          <td><strong>{t.turno}</strong></td>
                          <td>{t.faturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                          <td>{t.mediaPorViagem.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Dia da Semana */}
              {af.faturamentoPorDiaSemana?.length > 0 && (
                <div className="analise-card">
                  <div className="label">📅 Receita por Dia da Semana</div>
                  <table className="analise-tabela" style={{ fontSize: '0.68rem', marginTop: '0.3rem' }}>
                    <thead>
                      <tr><th>Dia</th><th>Receita</th><th>Viagens</th></tr>
                    </thead>
                    <tbody>
                      {af.faturamentoPorDiaSemana?.map((d, i) => (
                        <tr key={i}>
                          <td><strong>{d.diaNome}</strong></td>
                          <td>{d.faturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                          <td>{d.viagens}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ═══ RANKING DE MOTORISTAS POR RECEITA ═══ */}
        {af.faturamentoPorMotorista?.length > 0 && (
          <>
            <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', margin: '0.5rem 0' }}>
              🏆 Ranking de Motoristas por Receita
            </h4>
            <table className="analise-tabela">
              <thead>
                <tr><th>#</th><th>Motorista</th><th>Placa</th><th>Faturamento</th><th>Viagens</th><th>Ticket Médio</th></tr>
              </thead>
              <tbody>
                {af.faturamentoPorMotorista?.slice(0, 15).map((m, i) => {
                  const ticket = af.ticketMedioPorMotorista?.find(t => t.motorista === m.motorista);
                  return (
                    <tr key={i}>
                      <td style={{ color: '#94a3b8' }}>{i + 1}</td>
                      <td><strong>{m.motorista}</strong></td>
                      <td style={{ fontSize: '0.68rem', color: '#64748b' }}>{m.placa || '—'}</td>
                      <td>{m.faturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                      <td>{m.viagens}</td>
                      <td style={{ fontWeight: 600 }}>
                        {ticket?.ticketMedio
                          ? ticket.ticketMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {af.margemPorTipo.length > 0 && (
          <>
            <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.5rem' }}>
              Margem por Tipo de Caminhão
            </h4>
            <table className="analise-tabela">
              <thead>
                <tr><th>Tipo</th><th>Receita</th><th>Custo</th><th>Margem</th></tr>
              </thead>
              <tbody>
                {af.margemPorTipo.map((m, i) => (
                  <tr key={i}>
                    <td><strong>{m.tipo}</strong></td>
                    <td>{m.receita.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td>{m.custo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td>
                      <span style={{ color: m.margem >= 0 ? '#059669' : '#dc2626', fontWeight: 700 }}>
                        {m.margem.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {af.faturamentoPorColetor.length > 0 && (
          <>
            <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', margin: '0.75rem 0 0.5rem' }}>
              Faturamento por Coletor
            </h4>
            <table className="analise-tabela">
              <thead>
                <tr><th>#</th><th>Coletor</th><th>Faturamento</th></tr>
              </thead>
              <tbody>
                {af.faturamentoPorColetor.slice(0, 10).map((c, i) => (
                  <tr key={i}>
                    <td style={{ color: '#94a3b8' }}>{i + 1}</td>
                    <td><strong>{c.coletor}</strong></td>
                    <td>{c.faturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </SecaoExpansivel>

      {/* ═══ ANÁLISE OPERACIONAL EXPANSÍVEL ═══ */}
      <SecaoExpansivel titulo="Análise Operacional Detalhada" cor="#6366f1">
        <div className="analise-grid" style={{ marginBottom: '1rem' }}>
          <div className="analise-card">
            <div className="label">KM Médio por Viagem</div>
            <div className="value">{ao.kmMedioViagem.atual.toFixed(1)} km</div>
            <VariacaoBadge variacao={ao.kmMedioViagem.variacao} />
          </div>

          <div className="analise-card">
            <div className="label">Horas Produtivas Médias</div>
            <div className="value">{ao.horasMedias.atual.toFixed(1)}h</div>
            <VariacaoBadge variacao={ao.horasMedias.variacao} />
          </div>


        </div>

        {ao.produtividadePorColetor.length > 0 && (
          <>
            <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.5rem' }}>
              Produtividade por Coletor
            </h4>
            <table className="analise-tabela">
              <thead>
                <tr><th>#</th><th>Coletor</th><th>Tonelagem</th><th>Viagens</th><th>KM</th><th>t/dia</th></tr>
              </thead>
              <tbody>
                {ao.produtividadePorColetor.slice(0, 10).map((c, i) => (
                  <tr key={i}>
                    <td style={{ color: '#94a3b8' }}>{i + 1}</td>
                    <td><strong>{c.coletor}</strong></td>
                    <td>{c.tonelagem.toFixed(1)} t</td>
                    <td>{c.viagens}</td>
                    <td>{c.km.toFixed(0)} km</td>
                    <td style={{ fontWeight: 700 }}>{c.tonPorDia.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </SecaoExpansivel>

      {/* ═══ ANÁLISE POR MOTORISTA E ROTA ═══ */}
      <SecaoExpansivel
        titulo={`🚛 Análise por Motorista e Rota (${ao.motoristas?.length || 0} motoristas)`}
        cor="#22c55e"
      >
        {ao.motoristas && ao.motoristas.length > 0 ? (
          <>
            {/* Abas */}
            <div style={{
              display: 'flex', gap: '0.25rem', marginBottom: '0.85rem',
              borderBottom: '2px solid #e2e8f0', paddingBottom: '0.35rem',
            }}>
              {[
                { key: 'ranking', label: '📋 Ranking de Motoristas' },
                { key: 'comparativo', label: '📊 Comparativo' },
              ].map(aba => (
                <button
                  key={aba.key}
                  onClick={() => setAbaMotorista(aba.key as any)}
                  style={{
                    padding: '0.35rem 0.75rem', fontSize: '0.72rem', fontWeight: 700,
                    border: 'none', borderRadius: '6px 6px 0 0',
                    background: abaMotorista === aba.key ? '#22c55e' : '#f1f5f9',
                    color: abaMotorista === aba.key ? 'white' : '#64748b',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {aba.label}
                </button>
              ))}
            </div>

            {abaMotorista === 'ranking' && (
              <div>
                <RankingMotoristasTable motoristas={ao.motoristas} />
                {ao.motoristas.length > 0 && (
                  <div style={{ marginTop: '1rem' }}>
                    <MotoristaBarChart
                      motoristas={ao.motoristas}
                      campo="tonPorViagem"
                      titulo="Tonelagem por Viagem (Top 10)"
                    />
                  </div>
                )}
              </div>
            )}

            {abaMotorista === 'comparativo' && ao.motoristas.length > 0 && (
              <div>
                <div className="graficos-row-2">
                  <div className="grafico-card" style={{ padding: '0.75rem' }}>
                    <MotoristaBarChart
                      motoristas={ao.motoristas}
                      campo="tonelagem"
                      titulo="Tonelagem Total"
                      topN={8}
                    />
                  </div>
                  <div className="grafico-card" style={{ padding: '0.75rem' }}>
                    <MotoristaBarChart
                      motoristas={ao.motoristas}
                      campo="kmPorViagem"
                      titulo="KM por Viagem"
                      topN={8}
                    />
                  </div>
                </div>
                <div className="graficos-row-2">
                  <div className="grafico-card" style={{ padding: '0.75rem' }}>
                    <MotoristaBarChart
                      motoristas={ao.motoristas}
                      campo="tonPorHora"
                      titulo="Produtividade (t/hora)"
                      topN={8}
                    />
                  </div>
                  <div className="grafico-card" style={{ padding: '0.75rem' }}>
                    <MotoristaBarChart
                      motoristas={ao.motoristas}
                      campo="tonPorKm"
                      titulo="Eficiência (t/km)"
                      topN={8}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Stats rápidos */}
            <div style={{
              display: 'flex', gap: '0.75rem', marginTop: '0.75rem',
              fontSize: '0.68rem', color: '#94a3b8', flexWrap: 'wrap',
              borderTop: '1px solid #f1f5f9', paddingTop: '0.65rem',
            }}>
              <span>{ao.motoristas.reduce((s, m) => s + m.viagens, 0)} viagens</span>
              <span>{ao.motoristas.length} motoristas</span>
              <span style={{ marginLeft: 'auto', color: '#64748b' }}>
                Média: {(ao.motoristas.reduce((s, m) => s + m.tonPorViagem, 0) / (ao.motoristas.length || 1)).toFixed(2)} t/viagem
              </span>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8', fontSize: '0.82rem' }}>
            <FiAlertCircle size={24} style={{ marginBottom: '0.5rem', opacity: 0.3 }} />
            <p>Nenhum dado de motorista disponível.</p>
            <p style={{ fontSize: '0.72rem' }}>Faça upload de uma planilha com coluna <strong>"MOTORISTA"</strong> ou <strong>"PLACA"</strong>.</p>
          </div>
        )}
      </SecaoExpansivel>

      {/* ═══ METADADOS ═══ */}
      <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', flexWrap: 'wrap', fontSize: '0.68rem', color: '#94a3b8' }}>
        <span>{dados.metadados.totalRegistrosAtual.toLocaleString('pt-BR')} registros no período</span>
        <span>{dados.metadados.totalRegistrosAnterior.toLocaleString('pt-BR')} registros no período anterior</span>
        <span>{dados.metadados.totalAbastecimentosAtual} abastecimentos</span>
      </div>
    </div>
  );
}

