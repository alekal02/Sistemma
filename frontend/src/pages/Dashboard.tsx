import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBarChart2, FiRefreshCw, FiDownload, FiSettings, FiAlertCircle, FiX, FiPlus, FiSearch, FiExternalLink, FiChevronDown } from 'react-icons/fi';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import GoogleFilterBar from '../components/GoogleFilterBar';
import { useGoogleFilters } from '../hooks/useGoogleFilters';
import '../styles/Dashboard.css';

const CORES = ['#059669', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#3b82f6', '#ec4899'];

interface ContratoItem { id: string; numeroContrato: string }
interface ServicoItem { id: string; nome: string }
interface ServicoDados {
  id: string;
  nome: string;
  carregando: boolean;
  erro: string | null;
  infoServico: any;
  valoresCaminhao: Record<string, number> | null;
  dadosBrutos: any[];
  configKPIs: any[];
  configGraficos: any[];
  colunas: any[];
  colunasNum: any[];
  colunasTexto: any[];
  colunasHoraSet: Set<string>;
  colunasNumSet: Set<string>;
}

// ========== FUNÇÕES AUXILIARES ==========
function normalizarChave(chave: string): string {
  return chave.trim().toUpperCase().replace(/\s+/g, '');
}

function encontrarValor(dado: Record<string, any>, nomeColuna: string): any {
  if (dado[nomeColuna] !== undefined && dado[nomeColuna] !== null) return dado[nomeColuna];
  const chaveNormalizada = normalizarChave(nomeColuna);
  for (const [k, v] of Object.entries(dado)) {
    if (normalizarChave(k) === chaveNormalizada && v !== null && v !== undefined) return v;
  }
  return undefined;
}

function serialParaMinutos(v: any): number {
  if (typeof v === 'number' && v > 0) {
    const dias = Math.floor(v);
    const fracao = v - dias;
    return Math.round(dias * 24 * 60 + fracao * 24 * 60);
  }
  if (typeof v === 'string' && /^\d{1,2}:\d{2}/.test(v)) {
    const [h, m] = v.split(':').map(Number);
    return h * 60 + (m || 0);
  }
  if (typeof v === 'string') {
    const num = parseFloat(v.trim());
    if (!isNaN(num) && num > 0) {
      const dias = Math.floor(num);
      const fracao = num - dias;
      return Math.round(dias * 24 * 60 + fracao * 24 * 60);
    }
  }
  return Number(v) || 0;
}

function formatarMinutosComoHora(totalMin: number): string {
  const abs = Math.abs(totalMin);
  const h = Math.floor(abs / 60);
  const m = Math.round(abs % 60);
  const sinal = totalMin < 0 ? '-' : '';
  return sinal + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function ehColunaHora(nomeColuna: string, colunasHoraSet: Set<string>): boolean {
  if (colunasHoraSet.has(nomeColuna)) return true;
  const nomeUpper = nomeColuna.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const temKM = nomeUpper.includes('KM') || nomeUpper.includes('KILOMETRO') || nomeUpper.includes('QUILOMETRO');
  if (temKM) return false;
  return nomeUpper.includes('HORA') || nomeUpper.includes('HORAR') || nomeUpper.includes('TEMPO') ||
    nomeUpper.includes('DURACAO') || nomeUpper.includes('MINUT');
}

function formatarResultado(valor: number, formato: string): string {
  if (formato === 'moeda') return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (formato === 'porcentagem') return valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function avaliarAritmetica(expr: string): number | null {
  try {
    const tokens: string[] = [];
    let i = 0;
    while (i < expr.length) {
      const char = expr[i];
      if (char === ' ') { i++; continue; }
      if (/[0-9.]/.test(char)) {
        let num = '';
        while (i < expr.length && /[0-9.]/.test(expr[i])) { num += expr[i]; i++; }
        tokens.push(num); continue;
      }
      if ('+-*/()'.includes(char)) { tokens.push(char); i++; continue; }
      i++;
    }
    if (tokens.length === 0) return null;
    const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };
    const out: (string | number)[] = [];
    const ops: string[] = [];
    for (const tok of tokens) {
      if (/^-?\d+(\.\d+)?$/.test(tok)) { out.push(parseFloat(tok)); }
      else if (tok === '(') { ops.push(tok); }
      else if (tok === ')') { while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop()!); ops.pop(); }
      else if ('+-*/'.includes(tok)) { while (ops.length && ops[ops.length - 1] !== '(' && prec[ops[ops.length - 1]] >= prec[tok]) out.push(ops.pop()!); ops.push(tok); }
    }
    while (ops.length) out.push(ops.pop()!);
    const pilha: number[] = [];
    for (const tok of out) {
      if (typeof tok === 'number') { pilha.push(tok); }
      else { const b = pilha.pop() ?? 0; const a = pilha.pop() ?? 0;
        switch (tok) { case '+': pilha.push(a + b); break; case '-': pilha.push(a - b); break; case '*': pilha.push(a * b); break; case '/': pilha.push(b !== 0 ? a / b : 0); break; }
      }
    }
    return pilha.length > 0 ? pilha[0] : null;
  } catch { return null; }
}

// ========== COMPONENTE PRINCIPAL ==========
export default function Dashboard() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { adicionarToast } = useToast();
  const dashboardRef = useRef<HTMLDivElement>(null);

  const [contratos, setContratos] = useState<ContratoItem[]>([]);
  const [contratoId, setContratoId] = useState('');
  const [servicosDisponiveis, setServicosDisponiveis] = useState<ServicoItem[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Serviços selecionados para comparar
  const [servicosSelecionados, setServicosSelecionados] = useState<ServicoDados[]>([]);
  const [painelBuscaAberto, setPainelBuscaAberto] = useState(false);
  const [buscaTexto, setBuscaTexto] = useState('');

  // ═══ Google Filters ═══
  const filtrosGA = useGoogleFilters();

  // Filtros dinâmicos convertidos do GoogleFilterBar para passar aos cards
  const [filtrosDinamicos, setFiltrosDinamicos] = useState<Record<string, string>>({});

  // Sincronizar dimensões do GoogleFilterBar com filtrosDinamicos
  useEffect(() => {
    const novos: Record<string, string> = {};
    for (const dim of filtrosGA.dimensoes) {
      if (dim.selecionados.length > 0) {
        novos[dim.nome] = dim.selecionados.join(',');
      }
    }
    setFiltrosDinamicos(novos);
  }, [filtrosGA.dimensoes]);

  // Registrar dimensões dinâmicas baseadas nos dados dos serviços
  useEffect(() => {
    if (servicosSelecionados.length === 0) return;

    // Coletar amostra de dados para detectar colunas de filtro
    const todosDados: Record<string, any>[] = [];
    for (const s of servicosSelecionados) {
      if (s.dadosBrutos.length > 0) {
        todosDados.push(...s.dadosBrutos.slice(0, 30));
      }
    }

    if (todosDados.length === 0) return;

    // Detectar colunas candidatas (texto com poucos valores únicos)
    const colunasInteresse = ['CAMINHAO', 'TIPO CAMINHAO', 'TIPO_CAMINHAO', 'tipoCaminhao',
      'PLACA', 'REGIONAL', 'REGIAO', 'MOTORISTA', 'TURNO', 'STATUS'];

    const dimensoes = [];
    for (const coluna of colunasInteresse) {
      // Encontrar a chave real nos dados
      const chaveReal = Object.keys(todosDados[0]).find(k =>
        k.toUpperCase().replace(/\s+/g, '') === coluna.toUpperCase().replace(/\s+/g, '')
      );
      if (!chaveReal) continue;

      const valores = new Set<string>();
      for (const d of todosDados) {
        const v = d[chaveReal];
        if (v !== null && v !== undefined && v !== '') {
          valores.add(String(v).trim());
        }
        if (valores.size > 30) break;
      }

      if (valores.size >= 2 && valores.size <= 30) {
        dimensoes.push({
          nome: chaveReal,
          label: chaveReal.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          totalOpcoes: valores.size,
          opcoes: Array.from(valores).sort((a, b) => a.localeCompare(b, 'pt-BR')),
        });
      }
    }

    if (dimensoes.length > 0) {
      filtrosGA.registrarDimensoes(dimensoes);
    }

    // Atualizar contexto de registros
    const totalReg = servicosSelecionados.reduce((s, sv) => s + sv.dadosBrutos.length, 0);
    filtrosGA.setTotalRegistros(totalReg);
    filtrosGA.setTotalFiltrado(totalReg);
  }, [servicosSelecionados]); // eslint-disable-line react-hooks/exhaustive-deps

  const [exportando, setExportando] = useState(false);

  // Carregar contratos
  const carregarContratos = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch('/api/contracts', { headers: { Authorization: 'Bearer ' + token } });
      if (res.ok) { const data = await res.json(); setContratos(data.contratos || []); }
    } catch { adicionarToast('Erro ao carregar contratos', 'error'); }
    finally { setCarregando(false); }
  }, [token, adicionarToast]);

  useEffect(() => { carregarContratos(); }, [carregarContratos]);

  // Carregar serviços do contrato
  useEffect(() => {
    if (!contratoId) { setServicosDisponiveis([]); return; }
    (async () => {
      try {
        const res = await fetch('/api/contracts/' + contratoId + '/servicos', { headers: { Authorization: 'Bearer ' + token } });
        if (res.ok) { const data = await res.json(); setServicosDisponiveis(data.servicos || []); }
      } catch {}
    })();
  }, [contratoId, token]);

  // Adicionar serviço à comparação
  const adicionarServico = useCallback(async (servico: ServicoItem) => {
    if (servicosSelecionados.find(s => s.id === servico.id)) return;

    const novo: ServicoDados = {
      id: servico.id,
      nome: servico.nome,
      carregando: true,
      erro: null as string | null,
      infoServico: null,
      valoresCaminhao: null,
      dadosBrutos: [],
      configKPIs: [],
      configGraficos: [],
      colunas: [],
      colunasNum: [],
      colunasTexto: [],
      colunasHoraSet: new Set(),
      colunasNumSet: new Set(),
    };

    setServicosSelecionados(prev => [...prev, novo]);

    // Carregar dados
    let info: any = null;
    let dados: any[] = [];
    let erro: string | null = null;

    try {
      const [resInfo, resDados] = await Promise.all([
        fetch('/api/contracts/' + contratoId + '/servicos/' + servico.id + '/padrao', { headers: { Authorization: 'Bearer ' + token } }),
        fetch('/api/contracts/' + contratoId + '/servicos/' + servico.id + '/dados-brutos?limite=1000', { headers: { Authorization: 'Bearer ' + token } }),
      ]);

      if (resInfo.ok) {
        const d = await resInfo.json();
        info = d.servico;
        const cols = info?.padraoPlanilha?.colunas || [];
        const config = info?.configDashboard || {};
        const valoresCaminhao = d.valoresCaminhao || null;

        const colunasNum = cols.filter((c: any) => c.tipo === 'numero');
        const colunasTexto = cols.filter((c: any) => c.tipo === 'texto' || c.tipo === 'desconhecido');

        if (resDados.ok) { dados = (await resDados.json()).dados || []; }

        setServicosSelecionados(prev => prev.map(s =>
          s.id === servico.id ? {
            ...s,
            carregando: false,
            erro: null as string | null,
            infoServico: info,
            valoresCaminhao,
            dadosBrutos: dados,
            configKPIs: (config.kpis || []).filter((k: any) => k.ativo),
            configGraficos: (config.graficos || []).filter((g: any) => g.ativo),
            colunas: cols,
            colunasNum,
            colunasTexto,
            colunasHoraSet: new Set(cols.filter((c: any) => c.tipo === 'hora').map((c: any) => c.nome)),
            colunasNumSet: new Set(colunasNum.map((c: any) => c.nome)),
          } : s
        ));
      } else { erro = 'Erro ao carregar dados'; }
    } catch { erro = 'Erro de conexao'; }
  }, [contratoId, token, servicosSelecionados]);

  // Remover serviço
  const removerServico = (id: string) => {
    setServicosSelecionados(prev => prev.filter(s => s.id !== id));
  };

  // Serviços filtrados pela busca
  const servicosFiltrados = servicosDisponiveis.filter(s =>
    !buscaTexto || s.nome.toLowerCase().includes(buscaTexto.toLowerCase())
  );

  // ========== RENDER ==========
  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <FiBarChart2 size={18} />
            Comparativo
          </h2>
          <select value={contratoId} onChange={e => { setContratoId(e.target.value); setServicosSelecionados([]); }}
            className="filtro-input" style={{ minWidth: '180px' }}>
            <option value="">Selecione um Contrato</option>
            {contratos.map(c => <option key={c.id} value={c.id}>{c.numeroContrato}</option>)}
          </select>
        </div>
        <div className="header-actions">
          {contratoId && (
            <button onClick={() => setPainelBuscaAberto(true)}
              className="btn btn-sm btn-primary">
              <FiPlus size={14} /> Adicionar Serviço
            </button>
          )}
          {servicosSelecionados.length > 0 && (
            <button onClick={() => adicionarToast('Função PDF disponível no dashboard completo', 'info')} disabled={exportando}
              className="btn btn-sm btn-secondary">
              <FiDownload size={13} /> {exportando ? 'Exportando...' : 'PDF'}
            </button>
          )}
          <button onClick={carregarContratos} title="Recarregar" className="btn-refresh">
            <FiRefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Painel de busca de serviços */}
      {painelBuscaAberto && (
        <div className="modal-overlay" onClick={() => setPainelBuscaAberto(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '14px', width: '90vw', maxWidth: '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--color-text-primary)' }}>
                Adicionar Serviços
              </h3>
              <button onClick={() => setPainelBuscaAberto(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-light)', padding: '0.25rem' }}>
                <FiX size={20} />
              </button>
            </div>

            {/* Busca */}
            <div style={{ padding: '0.75rem 1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.6rem', border: '1px solid var(--color-border-dark)', borderRadius: '8px', background: 'var(--color-bg-section)' }}>
                <FiSearch size={14} style={{ color: 'var(--color-text-light)', flexShrink: 0 }} />
                <input
                  value={buscaTexto}
                  onChange={e => setBuscaTexto(e.target.value)}
                  placeholder="Buscar serviço pelo nome..."
                  autoFocus
                  style={{ border: 'none', background: 'none', flex: 1, fontSize: '0.85rem', outline: 'none', color: 'var(--color-text-primary)' }}
                />
              </div>
            </div>

            {/* Lista de serviços */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0 1.25rem 1rem' }}>
              {servicosFiltrados.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--color-text-light)', padding: '1.5rem', fontSize: '0.85rem' }}>
                  {buscaTexto ? 'Nenhum serviço encontrado' : 'Nenhum serviço disponível'}
                </p>
              ) : (
                servicosFiltrados.map(s => {
                  const jaAdicionado = servicosSelecionados.some(sel => sel.id === s.id);
                  return (
                    <div key={s.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.5rem 0.6rem', borderRadius: '8px',
                        background: jaAdicionado ? 'var(--color-primary-light)' : 'transparent',
                        border: '1px solid ' + (jaAdicionado ? 'var(--color-primary)' : 'transparent'),
                        marginBottom: '0.3rem',
                        opacity: jaAdicionado ? 0.7 : 1,
                      }}
                    >
                      <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {s.nome}
                        {jaAdicionado && <span style={{ marginLeft: '0.4rem', fontSize: '0.65rem', color: 'var(--color-primary-dark)', background: 'var(--color-primary-light)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>Adicionado</span>}
                      </span>
                      <button
                        onClick={() => {
                          if (!jaAdicionado) adicionarServico(s);
                          setPainelBuscaAberto(false);
                        }}
                        disabled={jaAdicionado}
                        className="btn btn-sm btn-primary"
                        style={{ opacity: jaAdicionado ? 0.5 : 1 }}
                      >
                        {jaAdicionado ? 'Adicionado' : 'Adicionar'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Estado vazio */}
      {servicosSelecionados.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-light)' }}>
          <FiBarChart2 size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
          <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
            {contratoId
              ? 'Clique em "Adicionar Serviço" para começar a comparar dashboards.'
              : 'Selecione um contrato e adicione serviços para comparar.'}
          </p>
        </div>
      )}

      {/* Grid de dashboards comparativos */}
      {servicosSelecionados.length > 0 && (
        <div ref={dashboardRef}>
          {/* Google Filter Bar */}
          <GoogleFilterBar
            periodo={filtrosGA.periodo}
            comparacao={filtrosGA.comparacao}
            dimensoes={filtrosGA.dimensoes}
            totalRegistros={filtrosGA.totalRegistros}
            totalFiltrado={filtrosGA.totalFiltrado}
            variacaoPeriodo={filtrosGA.variacaoPeriodo}
            onSetPeriodo={filtrosGA.setPeriodo}
            onToggleComparacao={filtrosGA.toggleComparacao}
            onAdicionarFiltro={filtrosGA.adicionarFiltro}
            onRemoverFiltro={filtrosGA.removerFiltro}
            onLimparDimensao={filtrosGA.limparDimensao}
            onLimparTodos={filtrosGA.limparTodos}
          />

          {/* Grid de serviços lado a lado */}
          <div className="dashboard-comparativo-grid">
            {servicosSelecionados.map(servico => (
              <ServicoDashboardCard
                key={servico.id}
                servico={servico}
                onRemover={() => removerServico(servico.id)}
                filtrosDinamicos={filtrosDinamicos}
                contratoId={contratoId}
                onNavigate={() => navigate('/contratos/' + contratoId + '/servicos/' + servico.id + '/dashboard')}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ========== COMPONENTE: CARD DE DASHBOARD DE UM SERVIÇO ==========
function ServicoDashboardCard({
  servico,
  onRemover,
  filtrosDinamicos,
  contratoId,
  onNavigate,
}: {
  servico: ServicoDados;
  onRemover: () => void;
  filtrosDinamicos: Record<string, string>;
  contratoId: string;
  onNavigate: () => void;
}) {
  const { token } = useAuth();
  const navigate = useNavigate();

  // Estado para KPIs calculados pelo backend
  const [kpiValoresBackend, setKpiValoresBackend] = useState<Record<string, string>>({});
  const [kpiCarregando, setKpiCarregando] = useState(false);

  // Aplicar filtros dinâmicos nos dados
  const dadosFiltrados = useMemo(() => {
    if (!servico.dadosBrutos.length) return [];
    if (Object.keys(filtrosDinamicos).length === 0) return servico.dadosBrutos;

    const removerAcentos = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    return servico.dadosBrutos.filter(d => {
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
  }, [servico.dadosBrutos, filtrosDinamicos]);

  // ═══ Buscar KPIs do backend (fonte única de verdade) ═══
  useEffect(function() {
    if (!servico.carregando && servico.id && !servico.erro) {
      setKpiCarregando(true);
      var url = '/api/contracts/' + contratoId + '/servicos/' + servico.id + '/kpi-valores';
      // Adicionar filtros dinâmicos como query params
      var params = new URLSearchParams();
      for (var key in filtrosDinamicos) {
        if (filtrosDinamicos[key]) params.set('filtro_' + key, filtrosDinamicos[key]);
      }
      var qs = params.toString();
      if (qs) url += '?' + qs;

      fetch(url, {
        headers: { Authorization: 'Bearer ' + token },
      })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data && data.kpis) {
            var mapa: Record<string, string> = {};
            for (var i = 0; i < data.kpis.length; i++) {
              var k = data.kpis[i];
              mapa[k.nome] = k.formatado || '-';
            }
            setKpiValoresBackend(mapa);
          }
          setKpiCarregando(false);
        })
        .catch(function() {
          setKpiCarregando(false);
        });
    }
  }, [servico.id, servico.carregando, servico.erro, contratoId, filtrosDinamicos, token]);

  // ═══ Métricas executivas (fallback local enquanto não usa backend) ═══
  const execMetrics = useMemo(() => {
    if (!dadosFiltrados || dadosFiltrados.length === 0) return null;
    const removerAcentos = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const nomesColPlaca = ['PLACA', 'CAMINHAO', 'VEICULO', 'COLETOR', 'COLETORA', 'EQUIPAMENTO'];
    const nomesColKm = ['KM TOTAL', 'KM', 'QUILOMETRO', 'KILOMETRO', 'DISTANCIA', 'KMTOTAL'];

    let colPeso = 'PESO TOTAL';
    let colKm = 'KM TOTAL';
    let colPlaca = 'CAMINHAO';

    const keys = Object.keys(dadosFiltrados[0]);
    for (const key of keys) {
      const kUp = removerAcentos(key.toUpperCase().replace(/\s+/g, ''));
      if (nomesColKm.some(function(n) { return removerAcentos(n.toUpperCase().replace(/\s+/g, '')) === kUp; })) colKm = key;
      if (nomesColPlaca.some(function(n) { return removerAcentos(n.toUpperCase().replace(/\s+/g, '')) === kUp; })) colPlaca = key;
      if (kUp.includes('PESO') || kUp === 'PESOTOTAL' || kUp === 'PESO TOTAL') colPeso = key;
    }

    const encontrarValorLoc = (dado: Record<string, any>, nome: string): any => {
      if (dado[nome] !== undefined && dado[nome] !== null) return dado[nome];
      const norm = removerAcentos(nome.toUpperCase().replace(/\s+/g, ''));
      for (const [k, v] of Object.entries(dado)) {
        if (removerAcentos(k.toUpperCase().replace(/\s+/g, '')) === norm) return v;
      }
      return undefined;
    };

    const registros = dadosFiltrados.length;
    const coletores = new Set(dadosFiltrados.map(function(d) { return String(encontrarValorLoc(d, colPlaca) || ''); }).filter(Boolean));
    const qtdColetores = coletores.size;
    const kmTotal = dadosFiltrados.reduce(function(s, d) { return s + (Number(encontrarValorLoc(d, colKm)) || 0); }, 0);
    const pesoTotalKg = dadosFiltrados.reduce(function(s, d) { return s + (Number(encontrarValorLoc(d, colPeso)) || 0); }, 0);
    const pesoTotalTon = pesoTotalKg / 1000;
    const viagens = registros;
    const tonKm = kmTotal > 0 ? pesoTotalTon / kmTotal : 0;
    const prodColetor = qtdColetores > 0 ? pesoTotalTon / qtdColetores : 0;
    const kmMedioViagem = viagens > 0 ? kmTotal / viagens : 0;
    const tonMediaColeta = viagens > 0 ? pesoTotalTon / viagens : 0;

    let faturamento = 0;
    const temValor = servico.valoresCaminhao && Object.keys(servico.valoresCaminhao).length > 0;
    if (temValor && servico.valoresCaminhao) {
      const valorTon = servico.valoresCaminhao['VALOR_TONELADA'] || 0;
      faturamento = pesoTotalTon * valorTon;
    }

    return { viagens, qtdColetores, pesoTotalTon, kmTotal, tonKm, prodColetor, kmMedioViagem, tonMediaColeta, faturamento, temValor: !!temValor };
  }, [dadosFiltrados, servico.valoresCaminhao]);

  // Buscar valor formatado do KPI pelo backend, ou fallback local
  const obterValorKpi = (kpi: any): string => {
    // 1. Tentar valor do backend
    const nome = kpi.label || kpi.nome;
    if (kpiValoresBackend[nome]) return kpiValoresBackend[nome];
    
    // 2. Fallback: cálculo local simples (apenas agregações, sem fórmula)
    if (kpi.expressao && kpi.expressao.trim()) return '-';
    
    if (kpi.agregacao === 'count') {
      const colNome = kpi.coluna2 || kpi.nome;
      const texto = servico.colunasTexto.find(function(c) { return c.nome === colNome; });
      if (texto || !servico.colunasNumSet.has(colNome)) {
        const valores = [...new Set(dadosFiltrados.map(function(d) { return encontrarValor(d, colNome); }).filter(function(v) { return v !== null && v !== undefined && v !== ''; }))];
        return valores.length.toLocaleString('pt-BR');
      }
      const total = dadosFiltrados.filter(function(d) { const v = encontrarValor(d, colNome); return v !== null && v !== undefined && v !== ''; }).length;
      return total.toLocaleString('pt-BR');
    }
    
    const colNome = kpi.coluna2 || kpi.nome;
    const isHora = ehColunaHora(colNome, servico.colunasHoraSet);
    const nums = isHora
      ? dadosFiltrados.map(function(d) { return serialParaMinutos(encontrarValor(d, colNome)); }).filter(function(n) { return !isNaN(n); })
      : dadosFiltrados.map(function(d) { return Number(encontrarValor(d, colNome)); }).filter(function(n) { return !isNaN(n); });
    if (nums.length === 0) return '-';
    let valor = 0;
    switch (kpi.agregacao || 'sum') {
      case 'sum': valor = nums.reduce(function(a, b) { return a + b; }, 0); break;
      case 'avg': valor = nums.reduce(function(a, b) { return a + b; }, 0) / nums.length; break;
      case 'min': valor = Math.min.apply(null, nums); break;
      case 'max': valor = Math.max.apply(null, nums); break;
    }
    if (isHora) return formatarMinutosComoHora(valor);
    return formatarResultado(valor, kpi.formato || 'numero');
  };

  if (servico.carregando) {
    return (
      <div className="dashboard-card-comparativo">
        <div className="dash-card-header">
          <span className="dash-card-nome">{servico.nome}</span>
        </div>
        <div style={{ padding: '1.5rem', textAlign: 'center' }}>
          <div style={{ width: '28px', height: '28px', border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 0.5rem' }} />
          <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>Carregando dados...</span>
        </div>
      </div>
    );
  }

  if (servico.erro) {
    return (
      <div className="dashboard-card-comparativo" style={{ borderColor: 'var(--color-danger)', opacity: 0.8 }}>
        <div className="dash-card-header">
          <span className="dash-card-nome">{servico.nome}</span>
          <button onClick={onRemover} className="dash-card-remover"><FiX size={14} /></button>
        </div>
        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-danger-dark)' }}>
          <FiAlertCircle size={28} style={{ marginBottom: '0.3rem', opacity: 0.6 }} />
          <p style={{ fontSize: '0.78rem' }}>{servico.erro}</p>
        </div>
      </div>
    );
  }

  const kpisVisiveis = servico.configKPIs.slice(0, 4);
  const graficosVisiveis = servico.configGraficos.slice(0, 3);
  const temDados = dadosFiltrados.length > 0 && servico.colunas.length > 0;

  return (
    <div className="dashboard-card-comparativo">
      {/* Header com nome e ações */}
      <div className="dash-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', minWidth: 0 }}>
          <span className="dash-card-nome">{servico.nome}</span>
          <span className="dash-card-badge">{dadosFiltrados.length} registros</span>
        </div>
        <div style={{ display: 'flex', gap: '0.2rem', flexShrink: 0 }}>
          <button onClick={onNavigate} className="dash-card-btn" title="Abrir dashboard completo">
            <FiExternalLink size={13} />
          </button>
          <button onClick={() => navigate('/contratos/' + contratoId + '/servicos/' + servico.id + '/configurar')}
            className="dash-card-btn" title="Configurar indicadores">
            <FiSettings size={13} />
          </button>
          <button onClick={onRemover} className="dash-card-btn dash-card-btn-remove" title="Remover">
            <FiX size={14} />
          </button>
        </div>
      </div>

      {/* Corpo */}
      {temDados ? (
        <div className="dash-card-body">
          {/* Resumo rápido */}
          {execMetrics && (
            <div className="dash-card-resumo">
              {[
                { label: 'Viagens', valor: execMetrics.viagens.toLocaleString('pt-BR'), cor: '#3b82f6' },
                { label: 'Toneladas', valor: execMetrics.pesoTotalTon.toFixed(1) + ' t', cor: '#22c55e' },
                { label: 'KM', valor: execMetrics.kmTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 }), cor: '#06b6d4' },
                { label: 'Faturamento', valor: execMetrics.temValor && execMetrics.faturamento > 0
                    ? execMetrics.faturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                    : (execMetrics.temValor ? 'R$ 0' : 'N/D'), cor: '#f59e0b' },
              ].map((k, i) => (
                <div key={i} className="dash-resumo-item" style={{ borderLeftColor: k.cor }}>
                  <span className="dash-resumo-label">{k.label}</span>
                  <span className="dash-resumo-valor">{k.valor}</span>
                </div>
              ))}
            </div>
          )}

          {/* KPIs */}
          {kpisVisiveis.length > 0 && (
            <div className="dash-card-kpis">
              {kpiCarregando && (
                <div style={{ textAlign: 'center', padding: '0.25rem', fontSize: '0.65rem', color: '#94a3b8', gridColumn: '1 / -1' }}>
                  Calculando...
                </div>
              )}
              {kpisVisiveis.map((kpi: any, i: number) => (
                <div key={i} className="dash-kpi-item" style={{ borderTopColor: CORES[i % CORES.length] }}>
                  <span className="dash-kpi-label">{kpi.label}</span>
                  <span className="dash-kpi-valor">{obterValorKpi(kpi)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Gráfico compacto (apenas o primeiro) */}
          {graficosVisiveis.length > 0 && (
            <div style={{ marginTop: '0.5rem', height: '150px' }}>
              {graficosVisiveis[0].tipo === 'pizza' ? (
                <PizzaGraficoCompacto
                  eixo={graficosVisiveis[0].eixoX}
                  dados={dadosFiltrados}
                  cores={CORES}
                />
              ) : (
                <BarraGraficoCompacto
                  eixoX={graficosVisiveis[0].eixoX}
                  eixoY={graficosVisiveis[0].eixoY}
                  titulo={graficosVisiveis[0].titulo}
                  dados={dadosFiltrados}
                  colunasHoraSet={servico.colunasHoraSet}
                  cor={CORES[0]}
                />
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-light)', fontSize: '0.8rem' }}>
          <p>Sem dados ou sem planilha vinculada.</p>
        </div>
      )}
    </div>
  );
}

// ========== GRÁFICO PIZZA COMPACTO ==========
function PizzaGraficoCompacto({ eixo, dados, cores }: { eixo: string; dados: any[]; cores: string[] }) {
  const agrupado = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of dados) {
      const key = String(encontrarValor(d, eixo) || 'N/A');
      map[key] = (map[key] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name, value }));
  }, [dados, eixo]);

  if (agrupado.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={agrupado} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={50} innerRadius={20}>
          {agrupado.map((_, i) => <Cell key={i} fill={cores[i % cores.length]} />)}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

// ========== GRÁFICO BARRA COMPACTO ==========
function BarraGraficoCompacto({ eixoX, eixoY, titulo, dados, colunasHoraSet, cor }: {
  eixoX: string; eixoY: string; titulo: string; dados: any[]; colunasHoraSet: Set<string>; cor: string;
}) {
  const dadosGrafico = useMemo(() => {
    const isHoraY = ehColunaHora(eixoY, colunasHoraSet);
    const agrupado: Record<string, number> = {};
    for (const d of dados) {
      const key = String(encontrarValor(d, eixoX) || 'N/A');
      const val = isHoraY ? serialParaMinutos(encontrarValor(d, eixoY)) : Number(encontrarValor(d, eixoY)) || 0;
      agrupado[key] = (agrupado[key] || 0) + val;
    }
    return Object.entries(agrupado).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name, value }));
  }, [dados, eixoX, eixoY, colunasHoraSet]);

  if (dadosGrafico.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={dadosGrafico}>
        <XAxis dataKey="name" tick={{ fontSize: 9 }} />
        <YAxis tick={{ fontSize: 9 }} />
        <Bar dataKey="value" fill={cor} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
