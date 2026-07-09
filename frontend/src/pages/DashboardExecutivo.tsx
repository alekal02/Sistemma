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

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  FiRefreshCw, FiShare2, FiBarChart2,
  FiDollarSign, FiActivity, FiTruck, FiClock,
  FiMapPin, FiTrendingUp, FiChevronDown, FiAlertCircle,
  FiCalendar, FiFilter, FiX, FiDatabase, FiLayout,
} from 'react-icons/fi';
import { useToast } from '../contexts/ToastContext';
import dashboardExecutivoService from '../services/dashboardExecutivoService';
import contractService from '../services/contractService';
import servicoService from '../services/servicoService';
import type {
  DashboardExecutivoResponse, FiltrosExecutivo,
  FinanceiroPainel, OperacionalPainel, GraficosPainel,
  AnaliseFinanceira, AnaliseOperacional,
  KpiCalculadoExecutivo, ResumoCicloExecutivo,
  ComparacaoAnteriorInfo, Variacao,
} from '../services/dashboardExecutivoService';
import RankingMotoristasTable from '../components/RankingMotoristasTable';
import MotoristaBarChart from '../components/MotoristaBarChart';
import GoogleFilterBar from '../components/GoogleFilterBar';
import ExecutivoCicloSelector from '../components/ExecutivoCicloSelector';
import { useGoogleFilters } from '../hooks/useGoogleFilters';
import {
  calcularCicloMensalContrato,
  inferirMesReferenciaAtual,
} from '../utils/periodoCicloContrato';
import { gerarHtmlExecutivoCompartilhavel, baixarHtmlExecutivo, abrirHtmlExecutivoNovaAba } from '../utils/gerarHtmlExecutivo';
import ExecutivoLayoutModal from '../components/ExecutivoLayoutModal';
import {
  carregarLayoutExecutivo,
  salvarLayoutExecutivo,
  temGrupoAtivo,
} from '../config/executivoLayout';
import '../styles/ExecutivoDashboard.css';

/* ─── Cache (24h — alinhado ao cache diário do servidor) ─── */
const CACHE_DURACAO = 24 * 60 * 60 * 1000;
const STORAGE_EXECUTIVO_CONTRATO = '@sistemma:executivo-contrato';
const STORAGE_EXECUTIVO_SERVICO = '@sistemma:executivo-servico';
const STORAGE_EXECUTIVO_DADOS = '@sistemma:executivo-dados-v1';

type CachePersistido = {
  dados: DashboardExecutivoResponse;
  timestamp: number;
  expirado: boolean;
};

function lerEntradaCachePersistido(filtrosKey: string): CachePersistido | null {
  const storages: Storage[] = [];
  try { storages.push(sessionStorage); } catch { /* ignore */ }
  try { storages.push(localStorage); } catch { /* ignore */ }

  let melhor: { filtrosKey: string; timestamp: number; dados: DashboardExecutivoResponse } | null = null;
  for (const store of storages) {
    try {
      const raw = store.getItem(STORAGE_EXECUTIVO_DADOS);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { filtrosKey: string; timestamp: number; dados: DashboardExecutivoResponse };
      if (parsed.filtrosKey !== filtrosKey) continue;
      if (!melhor || parsed.timestamp > melhor.timestamp) melhor = parsed;
    } catch { /* ignore */ }
  }
  if (!melhor) return null;
  return {
    dados: melhor.dados,
    timestamp: melhor.timestamp,
    expirado: Date.now() - melhor.timestamp >= CACHE_DURACAO,
  };
}

function salvarCachePersistido(filtrosKey: string, dados: DashboardExecutivoResponse): void {
  const payload = JSON.stringify({ filtrosKey, timestamp: Date.now(), dados });
  for (const store of [sessionStorage, localStorage] as Storage[]) {
    try {
      store.setItem(STORAGE_EXECUTIVO_DADOS, payload);
    } catch { /* quota */ }
  }
}

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

function tooltipComparacaoVariacao(
  variacao: Variacao,
  comparacao: ComparacaoAnteriorInfo | undefined,
  fonte: 'planilha' | 'abastecimento',
): string | undefined {
  if (!comparacao) return undefined;
  const intervalo = comparacao.label;

  if (variacao.tipo === 'sem_base') {
    if (fonte === 'planilha' && !comparacao.temBasePlanilha) {
      return `Ciclo anterior (${intervalo}): nenhum registro de planilha importado.`;
    }
    if (fonte === 'abastecimento' && !comparacao.temBaseAbastecimento) {
      return `Ciclo anterior (${intervalo}): nenhum abastecimento registrado.`;
    }
    return `Ciclo anterior (${intervalo}): valor anterior zerado — comparação percentual não aplicável.`;
  }

  const qtd = fonte === 'abastecimento'
    ? comparacao.abastecimentos
    : comparacao.registrosPlanilha;
  const unidade = fonte === 'abastecimento' ? 'abastecimentos' : 'registros';
  return `Comparado com ciclo anterior (${intervalo}) — ${qtd.toLocaleString('pt-BR')} ${unidade}.`;
}

/* ─── Componente: Badge de Variação ─── */
function VariacaoBadge({
  variacao,
  tooltip,
}: {
  variacao: Variacao;
  tooltip?: string;
}) {
  if (variacao.tipo === 'sem_base') {
    return (
      <span
        className="variacao-badge sem-base"
        title={tooltip || 'Sem dados no ciclo anterior para comparar'}
      >
        Sem base comparativa
      </span>
    );
  }
  if (variacao.tipo === 'estavel' || Math.abs(variacao.valor) < 0.5) {
    return (
      <span className="variacao-badge estavel" title={tooltip}>
        → 0%
      </span>
    );
  }
  const isUp = variacao.tipo === 'aumento';
  return (
    <span className={`variacao-badge ${isUp ? 'aumento' : 'reducao'}`} title={tooltip}>
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
  label, card, destaque = false, icone, origem, comparacaoTooltip,
}: {
  label: string;
  card: { valor: number; formatado: string; variacao: Variacao; minitendenciaSvg?: string };
  destaque?: boolean;
  icone: React.ReactNode;
  origem?: 'real' | 'estimado';
  comparacaoTooltip?: string;
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
      <VariacaoBadge variacao={card.variacao} tooltip={comparacaoTooltip} />
      <MiniTendencia svg={card.minitendenciaSvg} />
    </div>
  );
}

/* ─── Componente: Card Operacional ─── */
function CardOperacional({
  label, card, icone, comparacaoTooltip,
}: {
  label: string;
  card: { valor: number; formatado: string; variacao: Variacao };
  icone: React.ReactNode;
  comparacaoTooltip?: string;
}) {
  return (
    <div className="operacional-card">
      <div className="label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <span style={{ opacity: 0.5 }}>{icone}</span>
        {label}
      </div>
      <div className="valor">{card.formatado}</div>
      <VariacaoBadge variacao={card.variacao} tooltip={comparacaoTooltip} />
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

function formatarMoedaCompacta(val: number): string {
  if (val >= 1_000_000) return `R$ ${(val / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  if (val >= 10_000) return `R$ ${(val / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k`;
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function formatarMoeda(val: number): string {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const DIAS_SEM_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function diaSemanaDeIso(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return DIAS_SEM_CURTO[new Date(y, m - 1, d).getDay()];
}

interface StatsReceitaDiaria {
  total: number;
  media: number;
  melhor: { label: string; valor: number; data?: string };
  diasComReceita: number;
  diasTotal: number;
}

function calcularStatsReceitaDiaria(
  serie: { label: string; valor: number; data?: string }[] | undefined,
): StatsReceitaDiaria | null {
  if (!serie?.length) return null;
  const comValor = serie.filter((d) => d.valor > 0);
  if (!comValor.length) return null;
  const total = comValor.reduce((s, d) => s + d.valor, 0);
  const media = total / comValor.length;
  const melhor = comValor.reduce((a, b) => (b.valor > a.valor ? b : a), comValor[0]);
  return {
    total,
    media,
    melhor,
    diasComReceita: comValor.length,
    diasTotal: serie.length,
  };
}

function corBarraReceita(valor: number, media: number): string {
  if (valor <= 0) return 'rgba(148,163,184,0.35)';
  const ratio = media > 0 ? valor / media : 1;
  if (ratio >= 1.15) return 'rgba(5,150,105,0.88)';
  if (ratio >= 0.85) return 'rgba(34,197,94,0.78)';
  return 'rgba(245,158,11,0.82)';
}

function isKpiFinanceiro(kpi: KpiCalculadoExecutivo): boolean {
  if (kpi.ehProjecaoCiclo) return true;
  if (kpi.formato === 'moeda') return true;
  const n = kpi.nome.toLowerCase();
  return /faturamento|receita|financeiro|valor|ticket|r\$|custo|margem|proje/.test(n);
}

function ResumoExecutivoCiclo({
  resumo,
  metadados,
  usandoEstimativa,
}: {
  resumo: ResumoCicloExecutivo;
  metadados: DashboardExecutivoResponse['metadados'];
  usandoEstimativa?: boolean;
}) {
  const fmtMoeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtNum = (v: number, dec = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

  return (
    <div className="exec-resumo-ciclo">
      <div className="exec-resumo-header">
        <div>
          <div className="exec-resumo-titulo">Resumo do ciclo</div>
          <div className="exec-resumo-sub">
            Dados da planilha importada — rotas = linhas; viagens = soma do CONTADOR DE VIAGENS
            {metadados.fonteDados === 'planilha' && ' · fonte: planilha'}
          </div>
        </div>
        {usandoEstimativa && (
          <span className="exec-resumo-estimativa">
            <FiAlertCircle size={12} /> Faturamento estimado — configure valores no contrato
          </span>
        )}
      </div>
      <div className="exec-resumo-grid">
        <div className="exec-resumo-bloco financeiro">
          <div className="exec-resumo-bloco-titulo"><FiDollarSign size={12} /> Financeiro</div>
          <div className="exec-resumo-itens">
            <div className="exec-resumo-item destaque">
              <span className="lbl">Faturamento</span>
              <span className="val">{fmtMoeda(resumo.faturamento)}</span>
            </div>
            <div className="exec-resumo-item">
              <span className="lbl">Receita / ton</span>
              <span className="val">{fmtMoeda(resumo.receitaTon)}</span>
            </div>
            <div className="exec-resumo-item">
              <span className="lbl">Receita / km</span>
              <span className="val">{fmtMoeda(resumo.receitaKm)}</span>
            </div>
            <div className="exec-resumo-item">
              <span className="lbl">Ticket / viagem</span>
              <span className="val">{fmtMoeda(resumo.ticketMedio)}</span>
            </div>
          </div>
        </div>
        <div className="exec-resumo-bloco operacional">
          <div className="exec-resumo-bloco-titulo"><FiTruck size={12} /> Operacional</div>
          <div className="exec-resumo-itens">
            <div className="exec-resumo-item">
              <span className="lbl">Rotas (linhas)</span>
              <span className="val">{fmtNum(resumo.rotas)}</span>
            </div>
            <div className="exec-resumo-item destaque">
              <span className="lbl">Viagens</span>
              <span className="val">{fmtNum(resumo.viagens)}</span>
            </div>
            <div className="exec-resumo-item">
              <span className="lbl">Toneladas</span>
              <span className="val">{fmtNum(resumo.toneladas, 1)} t</span>
            </div>
            <div className="exec-resumo-item">
              <span className="lbl">KM rodados</span>
              <span className="val">{fmtNum(resumo.km)} km</span>
            </div>
            <div className="exec-resumo-item">
              <span className="lbl">Ton / viagem</span>
              <span className="val">{fmtNum(resumo.tonPorViagem, 2)} t</span>
            </div>
            <div className="exec-resumo-item">
              <span className="lbl">Horas produtivas</span>
              <span className="val">{fmtNum(resumo.horasProdutivas, 1)} h</span>
            </div>
            <div className="exec-resumo-item">
              <span className="lbl">Caminhões ativos</span>
              <span className="val">{fmtNum(resumo.coletoresAtivos)}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="exec-resumo-meta">
        {metadados.totalRegistrosAtual.toLocaleString('pt-BR')} registro(s) no período
        {metadados.totalRotasAtual != null && (
          <> · {metadados.totalRotasAtual.toLocaleString('pt-BR')} rota(s) válida(s)</>
        )}
        {metadados.totalViagensAtual != null && (
          <> · {metadados.totalViagensAtual.toLocaleString('pt-BR')} viagem(ns) contabilizada(s)</>
        )}
      </div>
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
  const [atualizandoFundo, setAtualizandoFundo] = useState(false);
  const cacheIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [contratos, setContratos] = useState<Array<{ id: string; numeroContrato: string }>>([]);
  const [servicos, setServicos] = useState<Array<{ id: string; nome: string; tipo: string }>>([]);
  const [contratoId, setContratoId] = useState('');
  const [servicoId, setServicoId] = useState('');
  const [carregandoContratos, setCarregandoContratos] = useState(true);
  const refCicloInicial = useMemo(() => inferirMesReferenciaAtual(1), []);
  const [diaInicioCiclo, setDiaInicioCiclo] = useState(1);
  const [mesRef, setMesRef] = useState(refCicloInicial.mes);
  const [anoRef, setAnoRef] = useState(refCicloInicial.ano);

  // ═══ Estado para Aba de Motoristas ═══
  const [abaMotorista, setAbaMotorista] = useState<'ranking' | 'comparativo'>('ranking');

  // Referência para o canvas dos gráficos
  const chartRefs = useRef<{ tipo?: any; tendencia?: any; volume?: any }>({});

  const carregarDados = useCallback(async (forcarRefresh = false) => {
    const filtrosApi: FiltrosExecutivo = {
      periodo: 'ciclo',
      mesReferencia: mesRef,
      anoReferencia: anoRef,
      ...(contratoId ? { contractId: contratoId } : {}),
      ...(servicoId ? { servicoId } : {}),
    };
    const filtrosKey = JSON.stringify(filtrosApi);

    if (forcarRefresh) {
      try {
        sessionStorage.removeItem(STORAGE_EXECUTIVO_DADOS);
        localStorage.removeItem(STORAGE_EXECUTIVO_DADOS);
      } catch { /* ignore */ }
      cacheData = null;
      cacheFiltros = '';
    }

    if (
      !forcarRefresh &&
      cacheData &&
      cacheFiltros === filtrosKey &&
      Date.now() - cacheData.timestamp < CACHE_DURACAO
    ) {
      setDados(cacheData.dados);
      setCacheIdade(Math.floor((Date.now() - cacheData.timestamp) / 1000));
      setCarregando(false);
      setAtualizandoFundo(false);
      setErro('');
      return;
    }

    const cacheLocal = !forcarRefresh ? lerEntradaCachePersistido(filtrosKey) : null;
    if (cacheLocal && !cacheLocal.expirado) {
      cacheData = { dados: cacheLocal.dados, timestamp: cacheLocal.timestamp };
      cacheFiltros = filtrosKey;
      setDados(cacheLocal.dados);
      setCacheIdade(Math.floor((Date.now() - cacheLocal.timestamp) / 1000));
      setCarregando(false);
      setAtualizandoFundo(false);
      setErro('');
      filtrosGA.setTotalRegistros(cacheLocal.dados.metadados.totalRegistrosAtual);
      filtrosGA.setTotalFiltrado(cacheLocal.dados.metadados.totalRegistrosAtual);
      return;
    }

    const usarCacheExpirado = cacheLocal?.expirado === true;
    if (usarCacheExpirado && cacheLocal) {
      cacheData = { dados: cacheLocal.dados, timestamp: cacheLocal.timestamp };
      cacheFiltros = filtrosKey;
      setDados(cacheLocal.dados);
      setCacheIdade(Math.floor((Date.now() - cacheLocal.timestamp) / 1000));
      setCarregando(false);
      setAtualizandoFundo(true);
      setErro('');
      filtrosGA.setTotalRegistros(cacheLocal.dados.metadados.totalRegistrosAtual);
      filtrosGA.setTotalFiltrado(cacheLocal.dados.metadados.totalRegistrosAtual);
    } else {
      setCarregando(true);
      setAtualizandoFundo(false);
    }

    setErro('');
    try {
      const resultado = await dashboardExecutivoService.carregar({
        ...filtrosApi,
        refresh: forcarRefresh,
      });
      cacheData = { dados: resultado, timestamp: Date.now() };
      cacheFiltros = filtrosKey;
      salvarCachePersistido(filtrosKey, resultado);
      setDados(resultado);
      setCacheIdade(resultado.metadados.cacheHit ? Math.floor((resultado.metadados.cacheIdadeSegundos ?? 0)) : 0);
      filtrosGA.setTotalRegistros(resultado.metadados.totalRegistrosAtual);
      filtrosGA.setTotalFiltrado(resultado.metadados.totalRegistrosAtual);
    } catch (err: unknown) {
      const axiosErr = err as { code?: string; message?: string; response?: { data?: { error?: string } } };
      let msg = axiosErr?.response?.data?.error
        || axiosErr?.message
        || 'Erro ao carregar dashboard executivo';
      if (axiosErr?.code === 'ECONNABORTED' || /timeout/i.test(msg)) {
        msg = contratoId
          ? 'O dashboard demorou mais que o esperado. Selecione um serviço específico ou clique em Atualizar.'
          : 'Selecione um contrato antes de carregar — a visão de todos os contratos pode demorar vários minutos.';
      }
      setErro(msg);
      adicionarToast(msg, 'error');
    } finally {
      setCarregando(false);
      setAtualizandoFundo(false);
    }
  }, [
    mesRef,
    anoRef,
    filtrosGA.setTotalRegistros,
    filtrosGA.setTotalFiltrado,
    contratoId,
    servicoId,
    adicionarToast,
  ]);

  useEffect(() => {
    (async () => {
      try {
        const lista = await contractService.listar();
        setContratos(lista);
        const salvo = localStorage.getItem(STORAGE_EXECUTIVO_CONTRATO) || '';
        if (salvo && lista.some(c => c.id === salvo)) {
          setContratoId(salvo);
        }
      } catch {
        adicionarToast('Erro ao carregar lista de contratos', 'error');
      } finally {
        setCarregandoContratos(false);
      }
    })();
  }, [adicionarToast]);

  useEffect(() => {
    if (!contratoId) {
      setServicos([]);
      setServicoId('');
      return;
    }
    (async () => {
      try {
        const lista = await servicoService.listarServicosContrato(contratoId);
        setServicos(lista);
        const salvo = localStorage.getItem(STORAGE_EXECUTIVO_SERVICO) || '';
        if (salvo && lista.some(s => s.id === salvo)) {
          setServicoId(salvo);
        } else {
          setServicoId('');
        }
      } catch {
        setServicos([]);
        setServicoId('');
      }
    })();
  }, [contratoId]);

  const handleContratoChange = useCallback((id: string) => {
    setContratoId(id);
    setServicoId('');
    try {
      if (id) localStorage.setItem(STORAGE_EXECUTIVO_CONTRATO, id);
      else localStorage.removeItem(STORAGE_EXECUTIVO_CONTRATO);
      localStorage.removeItem(STORAGE_EXECUTIVO_SERVICO);
    } catch { /* storage indisponível */ }
  }, []);

  const handleServicoChange = useCallback((id: string) => {
    setServicoId(id);
    try {
      if (id) localStorage.setItem(STORAGE_EXECUTIVO_SERVICO, id);
      else localStorage.removeItem(STORAGE_EXECUTIVO_SERVICO);
    } catch { /* storage indisponível */ }
  }, []);

  useEffect(() => {
    if (carregandoContratos || contratoId || contratos.length === 0) return;
    handleContratoChange(contratos[0].id);
  }, [carregandoContratos, contratoId, contratos, handleContratoChange]);

  useEffect(() => {
    if (!contratoId) {
      setDiaInicioCiclo(1);
      const ref = inferirMesReferenciaAtual(1);
      setMesRef(ref.mes);
      setAnoRef(ref.ano);
      return;
    }
    contractService.buscar(contratoId)
      .then((c) => {
        const dia = c.diaInicioCiclo ?? 1;
        setDiaInicioCiclo(dia);
        const ref = inferirMesReferenciaAtual(dia);
        setMesRef(ref.mes);
        setAnoRef(ref.ano);
      })
      .catch(() => {
        setDiaInicioCiclo(1);
      });
  }, [contratoId]);

  const cicloAtual = useMemo(
    () => calcularCicloMensalContrato(anoRef, mesRef, diaInicioCiclo),
    [anoRef, mesRef, diaInicioCiclo],
  );

  const periodoExibicao = useMemo(() => ({
    preset: 'personalizado' as const,
    dataInicio: cicloAtual.dataInicio,
    dataFim: cicloAtual.dataFim,
    label: cicloAtual.label,
  }), [cicloAtual]);

  const handleCicloChange = useCallback((mes: number, ano: number) => {
    setMesRef(mes);
    setAnoRef(ano);
  }, []);

  const contratoSelecionado = useMemo(
    () => contratos.find(c => c.id === contratoId),
    [contratos, contratoId],
  );

  const servicoSelecionado = useMemo(
    () => servicos.find(s => s.id === servicoId),
    [servicos, servicoId],
  );

  const renderBarraContexto = () => (
    <div className="exec-filtros-bar exec-contexto-bar">
      <div className="exec-filtro-group exec-filtro-contrato">
        <label><FiDatabase size={10} style={{ marginRight: 4 }} />Contrato</label>
        <select
          value={contratoId}
          disabled={carregandoContratos}
          onChange={e => handleContratoChange(e.target.value)}
        >
          <option value="">Todos os contratos</option>
          {contratos.map(c => (
            <option key={c.id} value={c.id}>{c.numeroContrato}</option>
          ))}
        </select>
      </div>

      <div className="exec-filtro-group exec-filtro-servico">
        <label><FiActivity size={10} style={{ marginRight: 4 }} />Serviço</label>
        <select
          value={servicoId}
          disabled={!contratoId || servicos.length === 0}
          onChange={e => handleServicoChange(e.target.value)}
        >
          <option value="">
            {!contratoId
              ? 'Selecione um contrato'
              : servicos.length === 0
                ? 'Nenhum serviço'
                : 'Todos os serviços do contrato'}
          </option>
          {servicos.map(s => (
            <option key={s.id} value={s.id}>{s.nome}</option>
          ))}
        </select>
      </div>

      <div className="exec-contexto-resumo">
        <span className="exec-contexto-badge">
          {servicoSelecionado
            ? `${contratoSelecionado?.numeroContrato || 'Contrato'} → ${servicoSelecionado.nome}`
            : contratoSelecionado
              ? `Contrato: ${contratoSelecionado.numeroContrato}`
              : 'Visão consolidada (todos os contratos)'}
        </span>
        {(contratoId || servicoId) && (
          <button
            type="button"
            className="exec-contexto-limpar"
            onClick={() => {
              handleContratoChange('');
            }}
          >
            <FiX size={12} /> Limpar
          </button>
        )}
      </div>
    </div>
  );

  useEffect(() => {
    if (carregandoContratos) return;
    // Evita carga consolidada (todos os contratos) antes da auto-seleção — muito pesada em produção
    if (contratos.length > 0 && !contratoId) return;
    carregarDados(false);
  }, [carregarDados, carregandoContratos, contratoId, contratos.length]);

  useEffect(() => {
    if (!dados || !cacheData) return;
    if (cacheIntervalRef.current) clearInterval(cacheIntervalRef.current);
    cacheIntervalRef.current = setInterval(() => {
      if (cacheData) {
        setCacheIdade(Math.floor((Date.now() - cacheData.timestamp) / 1000));
      }
    }, 1000);
    return () => {
      if (cacheIntervalRef.current) clearInterval(cacheIntervalRef.current);
    };
  }, [dados]);

  const handleRefresh = useCallback(() => {
    carregarDados(true);
  }, [carregarDados]);

  const [exportandoHtml, setExportandoHtml] = useState(false);
  const [widgetsAtivos, setWidgetsAtivos] = useState(() => carregarLayoutExecutivo());
  const [modalLayoutAberto, setModalLayoutAberto] = useState(false);

  const widgetAtivo = useCallback((id: string) => widgetsAtivos.has(id), [widgetsAtivos]);

  const aplicarLayout = useCallback((ids: Set<string>) => {
    setWidgetsAtivos(ids);
    salvarLayoutExecutivo([...ids]);
    setModalLayoutAberto(false);
    adicionarToast('Layout do dashboard atualizado', 'success');
  }, [adicionarToast]);

  const handleCompartilhar = useCallback(() => {
    if (!dados) {
      adicionarToast('Carregue os dados antes de compartilhar', 'warning');
      return;
    }
    setExportandoHtml(true);
    try {
      const escopo = servicoSelecionado
        ? `${contratoSelecionado?.numeroContrato || 'Contrato'}_${servicoSelecionado.nome}`
        : contratoSelecionado?.numeroContrato || 'Consolidado';
      const dataStr = new Date().toISOString().slice(0, 10);
      const filename = `Dashboard_Executivo_${escopo.replace(/[^a-zA-Z0-9._-]/g, '_')}_${dataStr}`;

      const html = gerarHtmlExecutivoCompartilhavel(dados, {
        contratoNome: contratoSelecionado?.numeroContrato || 'Todos os contratos',
        servicoNome: servicoSelecionado?.nome,
      });

      baixarHtmlExecutivo(html, filename);
      abrirHtmlExecutivoNovaAba(html);
      adicionarToast('Relatório HTML gerado! O arquivo foi baixado e aberto em nova aba.', 'success');
    } catch (err) {
      console.error('[Compartilhar]', err);
      adicionarToast('Erro ao gerar relatório HTML', 'error');
    } finally {
      setExportandoHtml(false);
    }
  }, [dados, contratoSelecionado, servicoSelecionado, adicionarToast]);

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
      if (ctx1 && widgetsAtivos.has('chart_receita_km') && g.receitaKmDiario.length > 0) {
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
      if (ctx2 && widgetsAtivos.has('chart_receita_hora') && g.receitaHoraDiario.length > 0) {
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

      // 3. Evolução Diária de Receita (barras + linha de média)
      const ctx3 = document.getElementById('chart-receita-diaria') as HTMLCanvasElement;
      if (ctx3 && widgetsAtivos.has('chart_receita_diaria') && g.receitaDiaria && g.receitaDiaria.length > 0) {
        const serie = g.receitaDiaria;
        const stats = calcularStatsReceitaDiaria(serie);
        const media = stats?.media ?? 0;
        const valores = serie.map((r: { valor: number }) => r.valor);
        const maxY = Math.max(...valores, media, 1) * 1.12;

        new Chart(ctx3, {
          type: 'bar',
          data: {
            labels: serie.map((r: { label: string; data?: string }) => {
              const ds = r.data ? diaSemanaDeIso(r.data) : '';
              return ds ? `${r.label} · ${ds}` : r.label;
            }),
            datasets: [
              {
                type: 'bar' as const,
                label: 'Faturamento',
                data: valores,
                backgroundColor: valores.map((v: number) => corBarraReceita(v, media)),
                hoverBackgroundColor: valores.map((v: number) => corBarraReceita(v, media).replace('0.88', '1').replace('0.78', '0.95').replace('0.82', '0.95')),
                borderRadius: 6,
                borderSkipped: false,
                maxBarThickness: 42,
                order: 2,
              },
              {
                type: 'line' as const,
                label: 'Média do período',
                data: valores.map(() => Math.round(media * 100) / 100),
                borderColor: '#6366f1',
                backgroundColor: 'transparent',
                borderWidth: 2,
                borderDash: [7, 5],
                pointRadius: 0,
                pointHoverRadius: 0,
                tension: 0,
                order: 1,
              },
            ],
          },
          options: {
            animation: { duration: 400, easing: 'easeOutQuart' },
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: {
                display: true,
                position: 'bottom',
                labels: {
                  boxWidth: 10,
                  boxHeight: 10,
                  font: { size: 10, weight: 600 },
                  color: '#64748b',
                  usePointStyle: true,
                  padding: 14,
                },
              },
              tooltip: {
                backgroundColor: '#0f172a',
                titleFont: { size: 12, weight: 'bold' },
                bodyFont: { size: 11 },
                padding: 12,
                cornerRadius: 8,
                callbacks: {
                  title: (items: { dataIndex: number }[]) => {
                    const idx = items[0]?.dataIndex ?? 0;
                    const item = serie[idx];
                    const ds = item?.data ? diaSemanaDeIso(item.data) : '';
                    return ds ? `${item?.label} (${ds})` : (item?.label || '');
                  },
                  label: (ctx: { datasetIndex: number; parsed: { y: number } }) => {
                    if (ctx.datasetIndex === 1) {
                      return ` Média: ${formatMoeda(ctx.parsed.y)}`;
                    }
                    return ` Faturamento: ${formatMoeda(ctx.parsed.y)}`;
                  },
                  afterBody: (items: { dataIndex: number }[]) => {
                    const idx = items[0]?.dataIndex ?? 0;
                    const item = serie[idx] as { km?: number; horas?: number; valor: number };
                    const linhas: string[] = [];
                    if (media > 0 && item.valor > 0) {
                      const pct = ((item.valor - media) / media) * 100;
                      const sinal = pct >= 0 ? '+' : '';
                      linhas.push(`${sinal}${pct.toFixed(1)}% vs média`);
                    }
                    if (item.km && item.km > 0) linhas.push(`KM: ${item.km.toLocaleString('pt-BR')}`);
                    if (item.horas && item.horas > 0) linhas.push(`Horas: ${item.horas.toFixed(1)} h`);
                    return linhas;
                  },
                },
              },
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: {
                  font: { size: 9, weight: 500 },
                  color: '#64748b',
                  maxRotation: 45,
                  minRotation: 0,
                  autoSkip: true,
                  maxTicksLimit: serie.length > 14 ? 12 : undefined,
                },
              },
              y: {
                beginAtZero: true,
                suggestedMax: maxY,
                grid: { color: 'rgba(226,232,240,0.8)' },
                ticks: {
                  font: { size: 9 },
                  color: '#94a3b8',
                  callback: (v: number | string) => formatarMoedaCompacta(Number(v)),
                },
              },
            },
          },
        });
      }

      // 4. Ranking Motoristas (barras horizontais)
      const ctx4 = document.getElementById('chart-ranking-motoristas') as HTMLCanvasElement;
      if (ctx4 && widgetsAtivos.has('chart_ranking_motoristas') && g.rankingMotoristas && g.rankingMotoristas.length > 0) {
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
      if (ctx5 && widgetsAtivos.has('chart_receita_regional') && g.receitaPorRegional?.length > 0) {
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
      if (ctx6 && widgetsAtivos.has('chart_receita_diasemana') && g.receitaPorDiaSemana && g.receitaPorDiaSemana.length > 0) {
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
      if (ctx7 && widgetsAtivos.has('chart_receita_turno') && g.receitaPorTurno?.length > 0) {
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
  }, [dados, widgetsAtivos]);

  const kpisFinanceiros = useMemo(
    () => (dados?.kpisCalculados || []).filter(isKpiFinanceiro),
    [dados?.kpisCalculados],
  );
  const kpisOperacionais = useMemo(
    () => (dados?.kpisCalculados || []).filter((k) => !isKpiFinanceiro(k)),
    [dados?.kpisCalculados],
  );

  const semDadosCiclo = dados
    ? (dados.metadados.totalRegistrosAtual ?? 0) === 0 && dados.operacional.viagens.valor <= 0
    : false;

  const statsReceitaDiaria = useMemo(
    () => calcularStatsReceitaDiaria(dados?.graficos.receitaDiaria),
    [dados?.graficos.receitaDiaria],
  );

  // ═══ RENDER (Carregando) — skeleton com formato de gráficos ═══
  if (carregando) {
    return (
      <div className="executivo-container">
        {renderBarraContexto()}
        <ExecutivoCicloSelector
          diaInicioCiclo={diaInicioCiclo}
          mes={mesRef}
          ano={anoRef}
          onChange={handleCicloChange}
          disabled={carregando}
        />
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
        {renderBarraContexto()}
        <ExecutivoCicloSelector
          diaInicioCiclo={diaInicioCiclo}
          mes={mesRef}
          ano={anoRef}
          onChange={handleCicloChange}
        />
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
        {renderBarraContexto()}
        <ExecutivoCicloSelector
          diaInicioCiclo={diaInicioCiclo}
          mes={mesRef}
          ano={anoRef}
          onChange={handleCicloChange}
        />
        <FiBarChart2 size={48} style={{ color: '#22c55e', opacity: 0.3, marginBottom: '1rem' }} />
        <h3 style={{ color: '#475569', marginBottom: '0.5rem' }}>Dashboard Executivo</h3>
        <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
          Navegue pelo ciclo do contrato ou clique em &quot;Atualizar&quot; para carregar os indicadores.
        </p>
        <button className="btn btn-primary" onClick={handleRefresh}>
          <FiBarChart2 size={14} /> Carregar Dados
        </button>
      </div>
    );
  }

  const { financeiro: f, operacional: o, graficos: g, periodo: p, analiseFinanceira: af, analiseOperacional: ao, resumoCiclo, metadados } = dados;
  const comparacaoAnterior = p.comparacaoAnterior;

  return (
    <div className="executivo-container">
      {renderBarraContexto()}

      {/* ═══ HEADER ═══ */}
      <div className="exec-header">
        <div>
          <h1>
            <FiBarChart2 size={22} />
            Dashboard Executivo
          </h1>
          <div className="data-geracao">
            <FiClock size={12} />
            {p.label}
            {(contratoSelecionado || servicoSelecionado) && (
              <> • {servicoSelecionado
                ? `${contratoSelecionado?.numeroContrato} / ${servicoSelecionado.nome}`
                : contratoSelecionado?.numeroContrato}</>
            )}
            {' • '}Atualizado {formatarDataISO(dados.metadados.dataGeracao)} às {formatarHoraISO(dados.metadados.dataGeracao)}
            {cacheIdade > 0 && (
              <span className={`cache-badge ${cacheIdade > 3600 ? 'aged' : ''}`}>
                {atualizandoFundo
                  ? 'Atualizando em segundo plano…'
                  : dados.metadados.cacheHit
                    ? `Cache do servidor · ${cacheIdade >= 3600
                      ? Math.floor(cacheIdade / 3600) + 'h'
                      : cacheIdade >= 60
                        ? Math.floor(cacheIdade / 60) + 'min'
                        : cacheIdade + 's'} atrás`
                    : `Dados de ${cacheIdade >= 3600
                      ? Math.floor(cacheIdade / 3600) + 'h'
                      : cacheIdade >= 60
                        ? Math.floor(cacheIdade / 60) + 'min'
                        : cacheIdade + 's'} atrás`}
              </span>
            )}
          </div>
        </div>
        <div className="exec-actions">
          <button
            className="btn-personalizar"
            onClick={() => setModalLayoutAberto(true)}
            title="Escolher quais indicadores e gráficos exibir"
          >
            <FiLayout size={13} /> Personalizar
          </button>
          <button
            className="btn-compartilhar"
            onClick={handleCompartilhar}
            disabled={exportandoHtml || !dados}
            title="Baixar relatório HTML para abrir em qualquer computador"
          >
            <FiShare2 size={13} /> {exportandoHtml ? 'Gerando...' : 'Compartilhar'}
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

      <ExecutivoCicloSelector
        diaInicioCiclo={diaInicioCiclo}
        mes={mesRef}
        ano={anoRef}
        onChange={handleCicloChange}
        disabled={carregando}
      />

      {/* ═══ GOOGLE FILTER BAR (dimensões) ═══ */}
      <GoogleFilterBar
        periodo={periodoExibicao}
        comparacao={filtrosGA.comparacao}
        dimensoes={filtrosGA.dimensoes}
        totalRegistros={filtrosGA.totalRegistros}
        totalFiltrado={filtrosGA.totalFiltrado}
        variacaoPeriodo={filtrosGA.variacaoPeriodo}
        carregando={carregando}
        omitirSeletorPeriodo
        onSetPeriodo={filtrosGA.setPeriodo}
        onToggleComparacao={filtrosGA.toggleComparacao}
        onAdicionarFiltro={filtrosGA.adicionarFiltro}
        onRemoverFiltro={filtrosGA.removerFiltro}
        onLimparDimensao={filtrosGA.limparDimensao}
        onLimparTodos={() => {
          filtrosGA.limparTodos();
          handleRefresh();
        }}
        onRefresh={handleRefresh}
      />

      {semDadosCiclo && (
        <div className="exec-sem-dados-banner">
          <FiAlertCircle size={16} />
          <div>
            <strong>Nenhum dado da planilha neste ciclo.</strong>
            {' '}Selecione o contrato/serviço correto, navegue para o ciclo com upload ou importe planilhas no serviço.
          </div>
        </div>
      )}

      {resumoCiclo && !semDadosCiclo && (
        <ResumoExecutivoCiclo
          resumo={resumoCiclo}
          metadados={metadados}
          usandoEstimativa={g.usandoEstimativa}
        />
      )}

      {/* ═══ CAMADA 1: PAINEL FINANCEIRO ═══ */}
      {temGrupoAtivo(widgetsAtivos, 'financeiro') && (
        <>
          <div className="exec-section-title">
            <div className="bar green" />
            <span>Painel Financeiro</span>
          </div>

          <div className="financeiro-grid">
            {widgetAtivo('fin_faturamento') && (
              <CardFinanceiro
                label="Faturamento Total"
                card={f.faturamento}
                destaque
                icone={<FiDollarSign size={14} />}
                origem={g.usandoEstimativa ? 'estimado' : 'real'}
                comparacaoTooltip={tooltipComparacaoVariacao(f.faturamento.variacao, comparacaoAnterior, 'planilha')}
              />
            )}
            {widgetAtivo('fin_custo') && (
              <CardFinanceiro
                label="Custo Operacional"
                card={f.custoOperacional}
                icone={<FiActivity size={14} />}
                comparacaoTooltip={tooltipComparacaoVariacao(f.custoOperacional.variacao, comparacaoAnterior, 'abastecimento')}
              />
            )}
            {widgetAtivo('fin_margem') && (
              <CardFinanceiro
                label="Margem Bruta"
                card={f.margemBruta}
                icone={<FiTrendingUp size={14} />}
                comparacaoTooltip={tooltipComparacaoVariacao(f.margemBruta.variacao, comparacaoAnterior, 'planilha')}
              />
            )}
            {widgetAtivo('fin_receita_hora') && (
              <CardFinanceiro
                label="Receita por Hora"
                card={f.receitaHora}
                icone={<FiClock size={14} />}
                comparacaoTooltip={tooltipComparacaoVariacao(f.receitaHora.variacao, comparacaoAnterior, 'planilha')}
              />
            )}
            {widgetAtivo('fin_ticket') && (
              <CardFinanceiro
                label="Ticket Médio"
                card={f.ticketMedio}
                icone={<FiBarChart2 size={14} />}
                comparacaoTooltip={tooltipComparacaoVariacao(f.ticketMedio.variacao, comparacaoAnterior, 'planilha')}
              />
            )}
          </div>

          {kpisFinanceiros.length > 0 && (
            <div className="financeiro-grid exec-kpis-extra">
              {kpisFinanceiros.map((kpi) => (
                <div key={kpi.id} className={`financeiro-card${kpi.ehProjecaoCiclo ? ' kpi-projecao' : ''}`}>
                  <div className="card-label">{kpi.nome}</div>
                  <div className="card-valor">{kpi.formatado}</div>
                  {kpi.detalhe && (
                    <div className="card-detalhe" title={kpi.detalhe}>{kpi.detalhe}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══ CAMADA 2: PAINEL OPERACIONAL ═══ */}
      {temGrupoAtivo(widgetsAtivos, 'operacional') && (
        <>
          <div className="exec-section-title">
            <div className="bar blue" />
            <span>Painel Operacional</span>
          </div>

          <div className="operacional-grid">
            {widgetAtivo('op_tonelagem') && (
              <CardOperacional
                label="Tonelagem"
                card={o.tonelagem}
                icone={<FiTruck size={12} />}
                comparacaoTooltip={tooltipComparacaoVariacao(o.tonelagem.variacao, comparacaoAnterior, 'planilha')}
              />
            )}
            {widgetAtivo('op_km') && (
              <CardOperacional
                label="KM Rodados"
                card={o.kmRodados}
                icone={<FiMapPin size={12} />}
                comparacaoTooltip={tooltipComparacaoVariacao(o.kmRodados.variacao, comparacaoAnterior, 'planilha')}
              />
            )}
            {widgetAtivo('op_viagens') && (
              <CardOperacional
                label="Viagens"
                card={o.viagens}
                icone={<FiActivity size={12} />}
                comparacaoTooltip={tooltipComparacaoVariacao(o.viagens.variacao, comparacaoAnterior, 'planilha')}
              />
            )}
            {widgetAtivo('op_coletores') && (
              <CardOperacional
                label="Coletores Ativos"
                card={o.coletoresAtivos}
                icone={<FiTruck size={12} />}
                comparacaoTooltip={tooltipComparacaoVariacao(o.coletoresAtivos.variacao, comparacaoAnterior, 'planilha')}
              />
            )}
            {widgetAtivo('op_horas') && (
              <CardOperacional
                label="Horas Produtivas"
                card={o.horasProdutivas}
                icone={<FiClock size={12} />}
                comparacaoTooltip={tooltipComparacaoVariacao(o.horasProdutivas.variacao, comparacaoAnterior, 'planilha')}
              />
            )}
            {widgetAtivo('op_eficiencia') && (
              <CardOperacional
                label="Eficiência (t/km)"
                card={o.eficiencia}
                icone={<FiTrendingUp size={12} />}
                comparacaoTooltip={tooltipComparacaoVariacao(o.eficiencia.variacao, comparacaoAnterior, 'planilha')}
              />
            )}
          </div>

          {kpisOperacionais.length > 0 && (
            <div className="operacional-grid exec-kpis-extra">
              {kpisOperacionais.map((kpi) => (
                <div key={kpi.id} className="operacional-card">
                  <div className="label">{kpi.nome}</div>
                  <div className="valor">{kpi.formatado}</div>
                  {kpi.detalhe && (
                    <div className="card-detalhe" title={kpi.detalhe}>{kpi.detalhe}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* KPIs universais removidos da seção única — distribuídos acima por tipo */}
      {temGrupoAtivo(widgetsAtivos, 'graficos') && (
        <>
          <div className="exec-section-title">
            <div className="bar purple" />
            <span>Gráficos Financeiros</span>
          </div>

          {(widgetAtivo('chart_receita_km') || widgetAtivo('chart_receita_hora')) && (
            <div className="graficos-row-2">
              {widgetAtivo('chart_receita_km') && (
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
              )}

              {widgetAtivo('chart_receita_hora') && (
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
              )}
            </div>
          )}

          {(widgetAtivo('chart_receita_diaria') || widgetAtivo('chart_ranking_motoristas')) && (
            <div className="graficos-row-2">
              {widgetAtivo('chart_receita_diaria') && (
                <div className="grafico-card grafico-receita-diaria">
                  <div className="grafico-card-topo">
                    <div>
                      <h3>Evolução Diária de Receita</h3>
                      <p className="grafico-subtitulo">
                        Faturamento por dia com operação
                        {statsReceitaDiaria && (
                          <> · {statsReceitaDiaria.diasComReceita} dia(s) no período</>
                        )}
                      </p>
                    </div>
                    {g.usandoEstimativa && (
                      <span className="grafico-badge-estimativa">Estimado</span>
                    )}
                  </div>
                  {statsReceitaDiaria && (
                    <div className="grafico-receita-stats">
                      <div className="grafico-stat">
                        <span className="lbl">Total</span>
                        <span className="val">{formatarMoeda(statsReceitaDiaria.total)}</span>
                      </div>
                      <div className="grafico-stat">
                        <span className="lbl">Média / dia</span>
                        <span className="val">{formatarMoeda(statsReceitaDiaria.media)}</span>
                      </div>
                      <div className="grafico-stat destaque">
                        <span className="lbl">Melhor dia</span>
                        <span className="val">
                          {statsReceitaDiaria.melhor.label}
                          {' · '}
                          {formatarMoeda(statsReceitaDiaria.melhor.valor)}
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="chart-wrapper chart-receita-diaria">
                    <canvas id="chart-receita-diaria"></canvas>
                  </div>
                  <div className="grafico-legenda-cores">
                    <span><i className="cor acima" /> Acima da média</span>
                    <span><i className="cor na-media" /> Na média</span>
                    <span><i className="cor abaixo" /> Abaixo da média</span>
                  </div>
                </div>
              )}

              {widgetAtivo('chart_ranking_motoristas') && (
                <div className="grafico-card">
                  <h3>🏆 Top Motoristas por Receita</h3>
                  <div className="chart-wrapper">
                    <canvas id="chart-ranking-motoristas"></canvas>
                  </div>
                </div>
              )}
            </div>
          )}

          {(widgetAtivo('chart_receita_regional') || widgetAtivo('chart_receita_diasemana')) && (
            <div className="graficos-row-2">
              {widgetAtivo('chart_receita_regional') && g.receitaPorRegional?.length > 0 && (
                <div className="grafico-card">
                  <h3>🌎 Receita por Regional</h3>
                  <div className="chart-wrapper">
                    <canvas id="chart-receita-regional"></canvas>
                  </div>
                </div>
              )}

              {widgetAtivo('chart_receita_diasemana') && (
                <div className="grafico-card">
                  <h3>📅 Receita por Dia da Semana</h3>
                  <div className="chart-wrapper">
                    <canvas id="chart-receita-diasemana"></canvas>
                  </div>
                </div>
              )}
            </div>
          )}

          {widgetAtivo('chart_receita_turno') && g.receitaPorTurno?.length > 1 && (
            <div className="graficos-row-2">
              <div className="grafico-card" style={{ maxWidth: '50%' }}>
                <h3>☀️ Receita por Turno</h3>
                <div className="chart-wrapper">
                  <canvas id="chart-receita-turno"></canvas>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ ANÁLISE FINANCEIRA EXPANSÍVEL (RECEITA) ═══ */}
      {widgetAtivo('sec_analise_financeira') && (
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
      )}

      {/* ═══ ANÁLISE OPERACIONAL EXPANSÍVEL ═══ */}
      {widgetAtivo('sec_analise_operacional') && (
      <SecaoExpansivel titulo="Análise Operacional Detalhada" cor="#6366f1">
        <div className="analise-grid" style={{ marginBottom: '1rem' }}>
          <div className="analise-card">
            <div className="label">KM Médio por Viagem</div>
            <div className="value">{ao.kmMedioViagem.atual.toFixed(1)} km</div>
            <VariacaoBadge
              variacao={ao.kmMedioViagem.variacao}
              tooltip={tooltipComparacaoVariacao(ao.kmMedioViagem.variacao, comparacaoAnterior, 'planilha')}
            />
          </div>

          <div className="analise-card">
            <div className="label">Horas Produtivas Médias</div>
            <div className="value">{ao.horasMedias.atual.toFixed(1)}h</div>
            <VariacaoBadge
              variacao={ao.horasMedias.variacao}
              tooltip={tooltipComparacaoVariacao(ao.horasMedias.variacao, comparacaoAnterior, 'planilha')}
            />
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
      )}

      {/* ═══ ANÁLISE POR MOTORISTA E ROTA ═══ */}
      {widgetAtivo('sec_motoristas_rota') && (
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
      )}

      {modalLayoutAberto && (
        <ExecutivoLayoutModal
          ativo={widgetsAtivos}
          onSalvar={aplicarLayout}
          onFechar={() => setModalLayoutAberto(false)}
        />
      )}

      {/* ═══ METADADOS ═══ */}
      <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', flexWrap: 'wrap', fontSize: '0.68rem', color: '#94a3b8' }}>
        <span>{dados.metadados.totalRegistrosAtual.toLocaleString('pt-BR')} registros no período</span>
        <span>{dados.metadados.totalRegistrosAnterior.toLocaleString('pt-BR')} registros no período anterior</span>
        <span>{dados.metadados.totalAbastecimentosAtual} abastecimentos</span>
      </div>
    </div>
  );
}

