import { useEffect, useMemo, useState, useCallback, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiBarChart2, FiRefreshCw, FiAlertCircle, FiExternalLink,
  FiTrendingUp, FiTrendingDown, FiSearch, FiFilter,
  FiChevronLeft, FiChevronRight, FiSettings,
} from 'react-icons/fi';
import servicoService from '../services/servicoService';
import { isRequestAborted } from '../services/abortableRequest';
import api from '../services/api';
import type {
  CompararPorTipoResponse,
  ServicoPorTipoItem,
  CompararInsight,
  FiltrosComparacao,
} from '../services/servicoService';
import AnalisePesoPainel from './AnalisePesoPainel';
import {
  normalizarDiaInicioCiclo,
  calcularCicloMensalContrato,
  periodoPadraoContrato,
  buildPeriodosPorContratoQuery,
  mesInputParaReferencia,
  referenciaParaMesInput,
  inferirMesReferenciaAtual,
  deslocarMesReferencia,
  salvarPeriodosComparar,
  carregarPeriodosComparar,
  aplicarQuinzenaAoPeriodo,
  calcularQuinzenasDoPeriodo,
  aplicarCicloAnteriorAoPeriodo,
  type PeriodoContratoState,
} from '../utils/periodoCicloContrato';

const TIPOS_LABEL: Record<string, string> = {
  coleta_caminhao: 'Coleta com Caminhao',
  rocadeira: 'Rocada',
  poda: 'Poda',
  varricao: 'Varricao',
  pintura_meio_fio: 'Pintura',
  remocao: 'Remocao',
  capina: 'Capina',
  geral: 'Geral',
};

type ModoComparacao = 'global' | 'contrato';

interface ContratoOpcao {
  id: string;
  nome: string;
  diaInicioCiclo?: number;
}

interface ServicoCatalogo {
  id: string;
  nome: string;
  contratoId: string;
  contratoNome: string;
  tipoServico?: string;
}

interface CompararPorTipoProps {
  contratos: ContratoOpcao[];
  servicosCatalogo?: ServicoCatalogo[];
  selecaoInicial?: string[];
  onSelecaoConsumida?: () => void;
}

function labelTipo(tipo: string): string {
  return TIPOS_LABEL[tipo] || tipo.replace(/_/g, ' ');
}

const CORES_SERVICO = ['#059669', '#0284c7', '#d97706', '#7c3aed', '#db2777', '#0891b2'];

type FiltroKpi = 'todos' | 'variacao' | 'iguais';

function fmtPct(v: number | null | undefined, compacto = false): string {
  if (v === null || v === undefined || isNaN(v)) return '-';
  const abs = Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  if (compacto) return (v > 0 ? '+' : v < 0 ? '−' : '') + abs + '%';
  const sinal = v > 0 ? '+' : '';
  return sinal + v.toFixed(1) + '%';
}

function fmtAnaliseValor(v: number | null | undefined, formato: string): string {
  if (v === null || v === undefined || isNaN(v)) return '-';
  if (formato === 'moeda') {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
  }
  if (formato === 'percent' || formato === 'percentual') {
    return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
  }
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function barraRelativa(valor: number | null, max: number | null): number {
  if (valor === null || max === null || max <= 0) return 0;
  return Math.min(100, Math.round((valor / max) * 100));
}

function amplitudeClasse(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || pct <= 0.5) return 'baixa';
  if (pct <= 5) return 'media';
  return 'alta';
}

function atualizarPeriodoMedicao(
  diaInicio: number,
  mes: number,
  ano: number,
): PeriodoContratoState {
  const ciclo = calcularCicloMensalContrato(ano, mes, diaInicio);
  return {
    modo: 'mediacao',
    mes,
    ano,
    dataInicio: ciclo.dataInicio,
    dataFim: ciclo.dataFim,
  };
}

function labelDiaMedicao(dia: number): string {
  const d = normalizarDiaInicioCiclo(dia);
  if (d === 1) return 'Medição no mês civil (dia 1)';
  return `Medição inicia no dia ${d} de cada ciclo`;
}

export default function CompararPorTipo({
  contratos,
  servicosCatalogo = [],
  selecaoInicial,
  onSelecaoConsumida,
}: CompararPorTipoProps) {
  const navigate = useNavigate();
  const [modo, setModo] = useState<ModoComparacao>('global');
  const [contratoId, setContratoId] = useState('');
  const [tipoServico, setTipoServico] = useState('');
  const [tiposDisponiveis, setTiposDisponiveis] = useState<Array<{ tipo: string; label: string }>>([]);
  const [servicosTipo, setServicosTipo] = useState<ServicoPorTipoItem[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [dados, setDados] = useState<CompararPorTipoResponse | null>(null);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [autoComparar, setAutoComparar] = useState(false);
  const [inicializado, setInicializado] = useState(false);
  const [buscaKpi, setBuscaKpi] = useState('');
  const [filtroKpi, setFiltroKpi] = useState<FiltroKpi>('todos');
  const [metaContratos, setMetaContratos] = useState<Record<string, { diaInicioCiclo: number }>>({});
  const [periodosPorContrato, setPeriodosPorContrato] = useState<Record<string, PeriodoContratoState>>({});
  const [periodoContratoUnico, setPeriodoContratoUnico] = useState<PeriodoContratoState | null>(null);
  const [medicaoGlobalRef, setMedicaoGlobalRef] = useState(() => {
    const { mes, ano } = inferirMesReferenciaAtual(1);
    return referenciaParaMesInput(ano, mes);
  });
  const [contratosPersonalizados, setContratosPersonalizados] = useState<Set<string>>(new Set());

  const diaInicioContrato = useCallback((contratoIdRef: string): number => {
    const fromProp = contratos.find(c => c.id === contratoIdRef)?.diaInicioCiclo;
    if (fromProp != null) return normalizarDiaInicioCiclo(fromProp);
    return normalizarDiaInicioCiclo(metaContratos[contratoIdRef]?.diaInicioCiclo);
  }, [contratos, metaContratos]);

  const contratosIdsVisiveis = useMemo(
    () => [...new Set(servicosTipo.map(s => s.contratoId))],
    [servicosTipo],
  );

  const contratosIdsSelecionados = useMemo(() => {
    const ids = new Set<string>();
    for (const s of servicosTipo) {
      if (selecionados.has(s.id)) ids.add(s.contratoId);
    }
    return ids;
  }, [servicosTipo, selecionados]);

  const aplicarMedicaoReferencia = useCallback((
    mesInput: string,
    contratoIds: string[] = contratosIdsVisiveis,
  ) => {
    const ref = mesInputParaReferencia(mesInput);
    if (!ref) return;
    setMedicaoGlobalRef(mesInput);
    setPeriodosPorContrato(prev => {
      const next = { ...prev };
      for (const cid of contratoIds) {
        if (contratosPersonalizados.has(cid)) continue;
        next[cid] = atualizarPeriodoMedicao(diaInicioContrato(cid), ref.mes, ref.ano);
      }
      return next;
    });
  }, [contratosIdsVisiveis, contratosPersonalizados, diaInicioContrato]);

  const filtrosComparacao = useCallback((): FiltrosComparacao => {
    if (modo === 'global') {
      const periodosFiltrados: Record<string, PeriodoContratoState> = {};
      for (const [cid, p] of Object.entries(periodosPorContrato)) {
        if (contratosIdsSelecionados.has(cid)) {
          periodosFiltrados[cid] = p;
        }
      }
      const periodosQuery = buildPeriodosPorContratoQuery(periodosFiltrados);
      if (Object.keys(periodosQuery).length > 0) {
        return { periodosPorContrato: periodosQuery };
      }
      return {};
    }
    if (!contratoId || !periodoContratoUnico) return {};
    const periodosQuery = buildPeriodosPorContratoQuery({ [contratoId]: periodoContratoUnico });
    return { periodosPorContrato: periodosQuery };
  }, [modo, periodosPorContrato, contratoId, periodoContratoUnico, contratosIdsSelecionados]);

  useEffect(() => {
    let cancelado = false;
    api.get<{ contratos: Array<{ id: string; diaInicioCiclo?: number }> }>('/contracts/saude')
      .then(({ data }) => {
        if (cancelado) return;
        const map: Record<string, { diaInicioCiclo: number }> = {};
        for (const c of data.contratos || []) {
          map[c.id] = { diaInicioCiclo: normalizarDiaInicioCiclo(c.diaInicioCiclo) };
        }
        setMetaContratos(map);
      })
      .catch(() => { /* usa fallback dia 1 */ });
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    if (modo !== 'global' || servicosTipo.length === 0 || !tipoServico) return;
    const salvos = carregarPeriodosComparar(tipoServico);
    setPeriodosPorContrato(prev => {
      const next = { ...prev };
      let mudou = false;
      for (const cid of contratosIdsVisiveis) {
        if (!next[cid]) {
          if (salvos?.[cid]) {
            next[cid] = salvos[cid];
          } else {
            next[cid] = periodoPadraoContrato(diaInicioContrato(cid));
          }
          mudou = true;
        }
      }
      if (mudou) {
        const ref = next[contratosIdsVisiveis[0]];
        if (ref?.modo === 'mediacao') {
          setMedicaoGlobalRef(referenciaParaMesInput(ref.ano, ref.mes));
        }
      }
      return mudou ? next : prev;
    });
  }, [modo, servicosTipo, tipoServico, contratosIdsVisiveis, diaInicioContrato]);

  useEffect(() => {
    if (modo !== 'global' || !tipoServico || Object.keys(periodosPorContrato).length === 0) return;
    salvarPeriodosComparar(tipoServico, periodosPorContrato);
  }, [modo, tipoServico, periodosPorContrato]);

  useEffect(() => {
    if (modo !== 'contrato' || !contratoId) {
      setPeriodoContratoUnico(null);
      return;
    }
    setPeriodoContratoUnico(periodoPadraoContrato(diaInicioContrato(contratoId)));
  }, [modo, contratoId, diaInicioContrato]);

  const tiposFromCatalogo = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of servicosCatalogo) {
      const t = s.tipoServico || 'geral';
      map.set(t, (map.get(t) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([tipo, qtd]) => ({ tipo, label: labelTipo(tipo), qtd }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [servicosCatalogo]);

  const carregarComparacao = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      let res: CompararPorTipoResponse;
      if (modo === 'global') {
        const ids = [...selecionados];
        if (ids.length < 2) {
          setErro('Selecione pelo menos 2 servicos para comparar');
          setCarregando(false);
          return;
        }
        res = await servicoService.compararGlobal(tipoServico, ids, filtrosComparacao());
      } else {
        if (!contratoId || !tipoServico) return;
        res = await servicoService.compararPorTipo(contratoId, tipoServico, filtrosComparacao());
      }
      setDados(res);
    } catch (err) {
      if (isRequestAborted(err)) return;
      setErro('Erro ao carregar comparacao analitica');
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, [modo, contratoId, tipoServico, selecionados, filtrosComparacao]);

  /** Busca comparação recortada em quinzena (para PDF de reunião, sem alterar a tela). */
  const buscarComparacaoQuinzena = useCallback(async (quinzena: 1 | 2) => {
    const periodosBase: Record<string, PeriodoContratoState> = {};
    if (modo === 'global') {
      for (const [cid, p] of Object.entries(periodosPorContrato)) {
        if (contratosIdsSelecionados.has(cid)) periodosBase[cid] = p;
      }
    } else if (contratoId && periodoContratoUnico) {
      periodosBase[contratoId] = periodoContratoUnico;
    }

    const periodosQuinzena: Record<string, PeriodoContratoState> = {};
    let periodoLabel = '';
    for (const [cid, p] of Object.entries(periodosBase)) {
      const recorte = aplicarQuinzenaAoPeriodo(p, quinzena);
      if (!recorte) return null;
      periodosQuinzena[cid] = recorte;
      if (!periodoLabel) {
        const q = calcularQuinzenasDoPeriodo(p.dataInicio, p.dataFim);
        periodoLabel = (quinzena === 1 ? q.primeira : q.segunda)?.label || '';
      }
    }

    if (Object.keys(periodosQuinzena).length === 0 || !periodoLabel) return null;

    const filtros: FiltrosComparacao = {
      periodosPorContrato: buildPeriodosPorContratoQuery(periodosQuinzena),
    };

    let res: CompararPorTipoResponse;
    if (modo === 'global') {
      const ids = [...selecionados];
      if (ids.length < 2) return null;
      res = await servicoService.compararGlobal(tipoServico, ids, filtros);
    } else {
      if (!contratoId || !tipoServico) return null;
      res = await servicoService.compararPorTipo(contratoId, tipoServico, filtros);
    }

    return { servicos: res.servicos || [], periodoLabel };
  }, [
    modo,
    periodosPorContrato,
    contratosIdsSelecionados,
    contratoId,
    periodoContratoUnico,
    selecionados,
    tipoServico,
  ]);

  /** Busca ciclo imediatamente anterior (mês de medição − 1) para PDF de melhoria. */
  const buscarComparacaoCicloAnterior = useCallback(async () => {
    const periodosBase: Record<string, PeriodoContratoState> = {};
    if (modo === 'global') {
      for (const [cid, p] of Object.entries(periodosPorContrato)) {
        if (contratosIdsSelecionados.has(cid)) periodosBase[cid] = p;
      }
    } else if (contratoId && periodoContratoUnico) {
      periodosBase[contratoId] = periodoContratoUnico;
    }

    const periodosAnterior: Record<string, PeriodoContratoState> = {};
    let periodoLabel = '';
    for (const [cid, p] of Object.entries(periodosBase)) {
      const ant = aplicarCicloAnteriorAoPeriodo(p, diaInicioContrato(cid));
      periodosAnterior[cid] = ant;
      if (!periodoLabel) {
        const ciclo = calcularCicloMensalContrato(ant.ano, ant.mes, diaInicioContrato(cid));
        periodoLabel = `Ciclo anterior — ${ciclo.label}`;
      }
    }

    if (Object.keys(periodosAnterior).length === 0) return null;

    const filtros: FiltrosComparacao = {
      periodosPorContrato: buildPeriodosPorContratoQuery(periodosAnterior),
    };

    let res: CompararPorTipoResponse;
    if (modo === 'global') {
      const ids = [...selecionados];
      if (ids.length < 1) return null;
      res = await servicoService.compararGlobal(tipoServico, ids, filtros);
    } else {
      if (!contratoId || !tipoServico) return null;
      res = await servicoService.compararPorTipo(contratoId, tipoServico, filtros);
    }

    return { servicos: res.servicos || [], periodoLabel };
  }, [
    modo,
    periodosPorContrato,
    contratosIdsSelecionados,
    contratoId,
    periodoContratoUnico,
    selecionados,
    tipoServico,
    diaInicioContrato,
  ]);

  useEffect(() => {
    if (modo !== 'global') return;
    if (tiposFromCatalogo.length > 0 && !tipoServico) {
      const coleta = tiposFromCatalogo.find(t => t.tipo === 'coleta_caminhao');
      setTipoServico(coleta?.tipo || tiposFromCatalogo[0].tipo);
    }
  }, [modo, tiposFromCatalogo, tipoServico]);

  useEffect(() => {
    if (selecaoInicial && selecaoInicial.length >= 2) {
      setModo('global');
      setSelecionados(new Set(selecaoInicial));
      const primeiro = servicosCatalogo.find(s => s.id === selecaoInicial[0]);
      if (primeiro?.tipoServico) setTipoServico(primeiro.tipoServico);
      setAutoComparar(true);
      setInicializado(true);
      onSelecaoConsumida?.();
    }
  }, [selecaoInicial]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (autoComparar && modo === 'global' && selecionados.size >= 2 && tipoServico) {
      setAutoComparar(false);
      carregarComparacao();
    }
  }, [autoComparar, modo, selecionados.size, tipoServico, carregarComparacao]);

  useEffect(() => {
    if (modo === 'global' && tipoServico) {
      let cancelado = false;
      setCarregandoLista(true);
      servicoService.listarServicosPorTipo(tipoServico)
        .then(res => {
          if (cancelado) return;
          setServicosTipo(res.servicos || []);
          if (res.tiposDisponiveis?.length) setTiposDisponiveis(res.tiposDisponiveis);
          setSelecionados(prev => {
            const validos = new Set(res.servicos.map(s => s.id));
            const mantidos = new Set([...prev].filter(id => validos.has(id)));
            if (mantidos.size >= 2) return mantidos;
            if (prev.size >= 2) return prev;
            return mantidos;
          });
        })
        .catch(() => {
          if (!cancelado) setServicosTipo([]);
        })
        .finally(() => {
          if (!cancelado) setCarregandoLista(false);
        });
      return () => { cancelado = true; };
    }
    return undefined;
  }, [modo, tipoServico]);

  useEffect(() => {
    if (modo !== 'contrato' || !contratoId) {
      if (modo === 'contrato') {
        setTiposDisponiveis([]);
        setTipoServico('');
      }
      return;
    }
    let cancelado = false;
    setCarregandoLista(true);
    servicoService.listarServicosContrato(contratoId)
      .then(servicos => {
        if (cancelado) return;
        const contagem = new Map<string, number>();
        for (const s of servicos) {
          const t = s.tipo || 'geral';
          contagem.set(t, (contagem.get(t) || 0) + 1);
        }
        const tipos = Array.from(contagem.entries())
          .filter(([, qtd]) => qtd >= 2)
          .map(([tipo]) => ({ tipo, label: labelTipo(tipo) }));
        setTiposDisponiveis(tipos);
        setTipoServico(prev => (tipos.some(t => t.tipo === prev) ? prev : (tipos[0]?.tipo || '')));
      })
      .finally(() => { if (!cancelado) setCarregandoLista(false); });
    return () => { cancelado = true; };
  }, [modo, contratoId]);

  /** Ao abrir a aba: auto-seleciona todos os servicos do tipo e compara (ex: BH vs SP) */
  useEffect(() => {
    if (inicializado || selecaoInicial?.length) return;
    if (modo !== 'global' || carregandoLista || !tipoServico) return;
    if (servicosTipo.length < 2 || selecionados.size >= 2) return;

    setSelecionados(new Set(servicosTipo.map(s => s.id)));
    setAutoComparar(true);
    setInicializado(true);
  }, [
    inicializado,
    selecaoInicial,
    modo,
    carregandoLista,
    tipoServico,
    servicosTipo,
    selecionados.size,
  ]);

  useEffect(() => {
    if (modo === 'contrato' && contratoId && tipoServico && periodoContratoUnico) {
      carregarComparacao();
    }
  }, [modo, contratoId, tipoServico, periodoContratoUnico, carregarComparacao]);

  const periodosKey = useMemo(() => JSON.stringify(periodosPorContrato), [periodosPorContrato]);

  useEffect(() => {
    if (!dados || carregando || modo !== 'global' || selecionados.size < 2) return;
    const timer = setTimeout(() => carregarComparacao(), 600);
    return () => clearTimeout(timer);
  }, [periodosKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleServico = (id: string) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const servicosPorContrato = useMemo(() => {
    const grupos = new Map<string, { contratoNome: string; servicos: ServicoPorTipoItem[] }>();
    for (const s of servicosTipo) {
      if (!grupos.has(s.contratoId)) {
        grupos.set(s.contratoId, { contratoNome: s.contratoNome, servicos: [] });
      }
      grupos.get(s.contratoId)!.servicos.push(s);
    }
    return grupos;
  }, [servicosTipo]);

  const podeCompararGlobal = selecionados.size >= 2 && tipoServico;

  const linhasFiltradas = useMemo(() => {
    if (!dados) return [];
    let linhas = dados.kpiLinhas;
    const q = buscaKpi.trim().toLowerCase();
    if (q) linhas = linhas.filter(l => l.nome.toLowerCase().includes(q));
    if (filtroKpi === 'variacao') {
      linhas = linhas.filter(l => (l.analise?.amplitudePct ?? 0) > 0.5);
    } else if (filtroKpi === 'iguais') {
      linhas = linhas.filter(l => (l.analise?.amplitudePct ?? 0) <= 0.5);
    }
    return linhas;
  }, [dados, buscaKpi, filtroKpi]);

  const kpisComVariacao = useMemo(
    () => dados?.kpiLinhas.filter(l => (l.analise?.amplitudePct ?? 0) > 0.5).length ?? 0,
    [dados],
  );

  // Coleta: o comparativo oficial é a análise de peso (como no PDF). Demais tipos usam matriz de KPIs.
  const mostrarComparativoKpis = dados?.tipoServico !== 'coleta_caminhao';
  const mostrarAnalisePeso = dados?.tipoServico === 'coleta_caminhao';

  const renderPainelPeriodo = (
    contratoIdPainel: string,
    contratoNome: string,
    periodo: PeriodoContratoState,
    onChange: (next: PeriodoContratoState) => void,
    compacto = false,
  ) => {
    const dia = diaInicioContrato(contratoIdPainel);
    const cicloAtual = calcularCicloMensalContrato(periodo.ano, periodo.mes, dia);
    const usarDatas = periodo.modo === 'datas';

    if (compacto && !usarDatas) {
      return (
        <div className="vg-comparar-periodo-compacto" key={`compact-${contratoIdPainel}`}>
          <span className="vg-comparar-periodo-compacto-text">
            {cicloAtual.label}
          </span>
          <button
            type="button"
            className="vg-comparar-link"
            onClick={() => setContratosPersonalizados(prev => new Set(prev).add(contratoIdPainel))}
          >
            Personalizar
          </button>
        </div>
      );
    }

    return (
      <div className="vg-comparar-periodo" key={contratoIdPainel}>
        <div className="vg-comparar-periodo-header">
          <span className="vg-comparar-periodo-titulo">{contratoNome}</span>
          <span className="vg-comparar-periodo-hint">{labelDiaMedicao(dia)}</span>
          <button
            type="button"
            className="vg-comparar-link vg-comparar-periodo-config"
            onClick={() => navigate(`/contratos/${contratoIdPainel}`)}
            title="Configurar contrato"
          >
            <FiSettings size={12} /> Ciclo
          </button>
        </div>
        <div className="vg-comparar-periodo-row">
          <label className="vg-comparar-periodo-label">
            Medição de referência
            <input
              type="month"
              className="filtro-input vg-comparar-periodo-mes"
              value={referenciaParaMesInput(periodo.ano, periodo.mes)}
              disabled={usarDatas}
              onChange={(e) => {
                const ref = mesInputParaReferencia(e.target.value);
                if (!ref) return;
                setContratosPersonalizados(prev => new Set(prev).add(contratoIdPainel));
                onChange(atualizarPeriodoMedicao(dia, ref.mes, ref.ano));
              }}
            />
          </label>
          <label className="vg-comparar-periodo-check">
            <input
              type="checkbox"
              checked={usarDatas}
              onChange={(e) => {
                setContratosPersonalizados(prev => new Set(prev).add(contratoIdPainel));
                if (e.target.checked) {
                  onChange({ ...periodo, modo: 'datas' });
                } else {
                  onChange(atualizarPeriodoMedicao(dia, periodo.mes, periodo.ano));
                }
              }}
            />
            Datas personalizadas
          </label>
          {contratosPersonalizados.has(contratoIdPainel) && (
            <button
              type="button"
              className="vg-comparar-link"
              onClick={() => {
                setContratosPersonalizados(prev => {
                  const n = new Set(prev);
                  n.delete(contratoIdPainel);
                  return n;
                });
                aplicarMedicaoReferencia(medicaoGlobalRef, [contratoIdPainel]);
              }}
            >
              Usar referência global
            </button>
          )}
        </div>
        {usarDatas ? (
          <div className="vg-comparar-periodo-row vg-comparar-periodo-datas">
            <label className="vg-comparar-periodo-label">
              Início
              <input
                type="date"
                className="filtro-input"
                value={periodo.dataInicio}
                onChange={(e) => onChange({ ...periodo, modo: 'datas', dataInicio: e.target.value })}
              />
            </label>
            <label className="vg-comparar-periodo-label">
              Fim
              <input
                type="date"
                className="filtro-input"
                value={periodo.dataFim}
                onChange={(e) => onChange({ ...periodo, modo: 'datas', dataFim: e.target.value })}
              />
            </label>
          </div>
        ) : (
          <div className="vg-comparar-periodo-intervalo">
            Período: <strong>{cicloAtual.label}</strong>
          </div>
        )}
      </div>
    );
  };

  const deslocarMedicaoGlobal = (delta: number) => {
    const ref = mesInputParaReferencia(medicaoGlobalRef);
    if (!ref) return;
    const novo = deslocarMesReferencia(ref.mes, ref.ano, delta);
    aplicarMedicaoReferencia(referenciaParaMesInput(novo.ano, novo.mes));
  };

  const medicaoGlobalLabel = useMemo(() => {
    const ref = mesInputParaReferencia(medicaoGlobalRef);
    if (!ref) return '';
    const d = new Date(ref.ano, ref.mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return d.charAt(0).toUpperCase() + d.slice(1);
  }, [medicaoGlobalRef]);

  return (
    <div className="vg-comparar">
      <div className="vg-comparar-modo">
        <button
          type="button"
          className={'vg-comparar-modo-btn' + (modo === 'global' ? ' ativo' : '')}
          onClick={() => { setModo('global'); setDados(null); }}
        >
          Entre contratos
        </button>
        <button
          type="button"
          className={'vg-comparar-modo-btn' + (modo === 'contrato' ? ' ativo' : '')}
          onClick={() => { setModo('contrato'); setDados(null); }}
        >
          No mesmo contrato
        </button>
      </div>

      <div className="vg-comparar-filtros">
        {modo === 'contrato' && (
          <div className="vg-comparar-filtro">
            <label>Contrato</label>
            <select value={contratoId} onChange={e => setContratoId(e.target.value)} className="filtro-input">
              <option value="">Selecione um contrato</option>
              {contratos.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
        )}
        <div className="vg-comparar-filtro">
          <label>Tipo de servico</label>
          <select
            value={tipoServico}
            onChange={e => { setTipoServico(e.target.value); setSelecionados(new Set()); setDados(null); }}
            className="filtro-input"
            disabled={carregandoLista || (modo === 'contrato' && !contratoId)}
          >
            {modo === 'global' && tiposFromCatalogo.map(t => (
              <option key={t.tipo} value={t.tipo}>{t.label} ({t.qtd})</option>
            ))}
            {modo === 'contrato' && tiposDisponiveis.map(t => (
              <option key={t.tipo} value={t.tipo}>{t.label}</option>
            ))}
            {modo === 'contrato' && !carregandoLista && tiposDisponiveis.length === 0 && contratoId && (
              <option value="">Nenhum tipo com 2+ servicos</option>
            )}
          </select>
        </div>
        {modo === 'global' && (
          <button
            className="btn btn-sm btn-primary"
            onClick={carregarComparacao}
            disabled={!podeCompararGlobal || carregando}
          >
            <FiBarChart2 size={14} /> Comparar {selecionados.size} servico(s)
          </button>
        )}
        <button
          className="btn btn-sm btn-secondary"
          onClick={carregarComparacao}
          disabled={carregando || (modo === 'global' ? !podeCompararGlobal : !contratoId || !tipoServico)}
          title="Atualizar"
        >
          <FiRefreshCw size={14} className={carregando ? 'spin' : ''} />
        </button>
      </div>

      {modo === 'contrato' && contratoId && periodoContratoUnico && (
        <div className="vg-comparar-periodos-wrap">
          {renderPainelPeriodo(
            contratoId,
            contratos.find(c => c.id === contratoId)?.nome || 'Contrato',
            periodoContratoUnico,
            setPeriodoContratoUnico,
          )}
        </div>
      )}

      {modo === 'global' && tipoServico && !carregandoLista && (
        <div className="vg-comparar-selecao">
          <div className="vg-comparar-medicao-global">
            <div className="vg-comparar-medicao-global-titulo">
              Medição de referência
              <span className="vg-comparar-medicao-global-sub">
                Aplica o mesmo mês de medição a todos os contratos (cada um no seu ciclo)
              </span>
            </div>
            <div className="vg-comparar-medicao-global-controles">
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => deslocarMedicaoGlobal(-1)}
                title="Medição anterior"
              >
                <FiChevronLeft size={14} />
              </button>
              <input
                type="month"
                className="filtro-input vg-comparar-periodo-mes"
                value={medicaoGlobalRef}
                onChange={(e) => aplicarMedicaoReferencia(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => deslocarMedicaoGlobal(1)}
                title="Próxima medição"
              >
                <FiChevronRight size={14} />
              </button>
              <button
                type="button"
                className="vg-comparar-link"
                onClick={() => {
                  const { mes, ano } = inferirMesReferenciaAtual(1);
                  aplicarMedicaoReferencia(referenciaParaMesInput(ano, mes));
                }}
              >
                Medição atual
              </button>
            </div>
            <div className="vg-comparar-medicao-global-info">
              Referência: <strong>{medicaoGlobalLabel}</strong>
              {' · '}
              {contratosIdsVisiveis.length} contrato(s)
              {contratosPersonalizados.size > 0 && (
                <span> · {contratosPersonalizados.size} com período personalizado</span>
              )}
            </div>
          </div>

          <div className="vg-comparar-selecao-header">
            <span>Selecione os servicos para comparar ({selecionados.size} selecionado(s))</span>
            <button
              type="button"
              className="vg-comparar-link"
              onClick={() => setSelecionados(new Set(servicosTipo.map(s => s.id)))}
            >
              Selecionar todos
            </button>
          </div>
          {Array.from(servicosPorContrato.entries()).map(([cid, grupo]) => {
            const temSelecionado = grupo.servicos.some(s => selecionados.has(s.id));
            const personalizado = contratosPersonalizados.has(cid);
            return (
            <div
              key={cid}
              className={'vg-comparar-grupo-contrato' + (temSelecionado ? ' tem-selecao' : '')}
            >
              <div className="vg-comparar-grupo-titulo">
                {grupo.contratoNome}
                <span className="vg-comparar-grupo-dia">
                  {labelDiaMedicao(diaInicioContrato(cid))}
                </span>
              </div>
              {periodosPorContrato[cid] && temSelecionado && renderPainelPeriodo(
                cid,
                grupo.contratoNome,
                periodosPorContrato[cid],
                (next) => setPeriodosPorContrato(prev => ({ ...prev, [cid]: next })),
                !personalizado && periodosPorContrato[cid].modo === 'mediacao',
              )}
              <div className="vg-comparar-chips">
                {grupo.servicos.map(s => {
                  const ativo = selecionados.has(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={'vg-comparar-chip' + (ativo ? ' ativo' : '')}
                      onClick={() => toggleServico(s.id)}
                    >
                      <span className="vg-comparar-chip-check">{ativo ? '✓' : ''}</span>
                      {s.nome}
                      <span className="vg-comparar-chip-meta">{s.totalRegistros} reg.</span>
                    </button>
                  );
                })}
              </div>
            </div>
            );
          })}
          {servicosTipo.length === 0 && (
            <p className="vg-comparar-hint">Nenhum servico deste tipo com dados importados.</p>
          )}
        </div>
      )}

      {erro && (
        <div className="vg-comparar-empty">
          <FiAlertCircle size={36} style={{ color: '#ef4444', opacity: 0.7 }} />
          <p>{erro}</p>
        </div>
      )}

      {carregando && (
        <div className="vg-comparar-loading">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="skeleton" style={{ height: '36px', borderRadius: '6px', marginBottom: '0.35rem' }} />
          ))}
        </div>
      )}

      {!carregando && dados && dados.servicos.length >= 2 && (
        <>
          {(dados.periodo || dados.periodosDistintos) && (
            <div className="vg-comparar-periodo-resumo">
              {dados.periodosDistintos ? (
                <span>Comparando medições distintas por contrato (veja o período em cada coluna)</span>
              ) : dados.periodo ? (
                <span>Período da medição: <strong>{dados.periodo.label}</strong></span>
              ) : null}
            </div>
          )}
          <div className="vg-comparar-kpis-resumo">
            <div className="vg-comparar-kpi-card">
              <span className="vg-comparar-kpi-num">{dados.resumo?.totalServicos ?? dados.servicos.length}</span>
              <span className="vg-comparar-kpi-lbl">Servicos</span>
            </div>
            <div className="vg-comparar-kpi-card">
              <span className="vg-comparar-kpi-num">{dados.resumo?.totalContratos ?? 1}</span>
              <span className="vg-comparar-kpi-lbl">Contratos</span>
            </div>
            {mostrarComparativoKpis && (
              <>
                <div className="vg-comparar-kpi-card">
                  <span className="vg-comparar-kpi-num">{dados.resumo?.totalKpis ?? dados.kpiLinhas.length}</span>
                  <span className="vg-comparar-kpi-lbl">KPIs</span>
                </div>
                <div className="vg-comparar-kpi-card destaque">
                  <span className="vg-comparar-kpi-num">{dados.resumo?.kpisComVariacao ?? dados.insights?.length ?? 0}</span>
                  <span className="vg-comparar-kpi-lbl">Com variacao</span>
                </div>
              </>
            )}
          </div>

          {mostrarAnalisePeso && (
            <AnalisePesoPainel
              servicos={dados.servicos}
              tipoServicoLabel={dados.tipoServicoLabel}
              onBuscarQuinzena={buscarComparacaoQuinzena}
              onBuscarCicloAnterior={buscarComparacaoCicloAnterior}
              onAbrirServico={(s) =>
                navigate(`/contratos/${s.contratoId || dados.contratoId}/servicos/${s.id}`)
              }
            />
          )}

          {mostrarComparativoKpis && dados.insights && dados.insights.length > 0 && (
            <div className="vg-comparar-insights">
              <h4>Maiores diferencas (por valor numerico)</h4>
              <div className="vg-comparar-insights-grid">
                {dados.insights.map((ins: CompararInsight, idx: number) => (
                  <div key={idx} className="vg-comparar-insight-card">
                    <div className="vg-comparar-insight-kpi">{ins.kpi}</div>
                    <div className="vg-comparar-insight-var">
                      <FiTrendingUp size={12} /> {ins.amplitudePct?.toFixed(1)}% de amplitude
                    </div>
                    <div className="vg-comparar-insight-linhas">
                      <span className="melhor">
                        <FiTrendingUp size={11} /> {ins.melhorServico} ({ins.melhorContrato}): <strong>{ins.melhorValor}</strong>
                      </span>
                      <span className="pior">
                        <FiTrendingDown size={11} /> {ins.piorServico} ({ins.piorContrato}): <strong>{ins.piorValor}</strong>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mostrarComparativoKpis && (
          <div className="vg-comparar-tabela-section">
            <div className="vg-comparar-tabela-toolbar">
              <div className="vg-comparar-tabela-toolbar-left">
                <h4 className="vg-comparar-tabela-titulo">
                  Comparativo de KPIs
                  <span className="vg-comparar-tabela-sub">
                    {labelTipo(dados.tipoServico)}
                  </span>
                </h4>
                <span className="vg-comparar-tabela-contagem">
                  {linhasFiltradas.length} de {dados.kpiLinhas.length} KPIs
                  {kpisComVariacao > 0 && ` · ${kpisComVariacao} com diferença`}
                </span>
              </div>
              <div className="vg-comparar-tabela-toolbar-right">
                <div className="vg-comparar-busca">
                  <FiSearch size={14} aria-hidden />
                  <input
                    type="search"
                    placeholder="Buscar KPI..."
                    value={buscaKpi}
                    onChange={e => setBuscaKpi(e.target.value)}
                    aria-label="Buscar KPI"
                  />
                </div>
                <div className="vg-comparar-filtro-chips" role="group" aria-label="Filtrar KPIs">
                  {([
                    ['todos', 'Todos'],
                    ['variacao', 'Com diferença'],
                    ['iguais', 'Sem diferença'],
                  ] as const).map(([id, lbl]) => (
                    <button
                      key={id}
                      type="button"
                      className={'vg-comparar-filtro-chip' + (filtroKpi === id ? ' ativo' : '')}
                      onClick={() => setFiltroKpi(id)}
                    >
                      {id !== 'todos' && <FiFilter size={11} />}
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {linhasFiltradas.length === 0 ? (
              <div className="vg-comparar-tabela-vazio">
                <FiSearch size={28} style={{ opacity: 0.35 }} />
                <p>Nenhum KPI encontrado com os filtros atuais.</p>
                <button type="button" className="vg-comparar-link" onClick={() => { setBuscaKpi(''); setFiltroKpi('todos'); }}>
                  Limpar filtros
                </button>
              </div>
            ) : (
              <div className="vg-comparar-tabela-wrap">
                <table className="vg-comparar-tabela vg-comparar-tabela-analitica">
                  <thead>
                    <tr>
                      <th className="vg-comparar-th-kpi sticky-col">Indicador</th>
                      {dados.servicos.map((s, idx) => (
                        <th
                          key={s.id}
                          className="vg-comparar-th-servico"
                          style={{ '--col-accent': CORES_SERVICO[idx % CORES_SERVICO.length] } as CSSProperties}
                        >
                          <div className="vg-comparar-col-header">
                            <span className="vg-comparar-col-accent" aria-hidden />
                            <span className="vg-comparar-col-contrato">{s.contratoNome || dados.contratoNome}</span>
                            <button
                              type="button"
                              className="vg-comparar-link-servico"
                              onClick={() => navigate(`/contratos/${s.contratoId || dados.contratoId}/servicos/${s.id}`)}
                              title={`Abrir ${s.nome}`}
                            >
                              {s.nome}
                              <FiExternalLink size={11} />
                            </button>
                            <span className="vg-comparar-col-registros">
                              {s.totalRegistros.toLocaleString('pt-BR')} registros
                            </span>
                            {s.periodo && (
                              <span className="vg-comparar-col-periodo" title="Período da medição">
                                {s.periodo.label}
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                      <th className="vg-comparar-th-ref">Referência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasFiltradas.map(linha => {
                      const max = linha.analise?.max ?? null;
                      const ampPct = linha.analise?.amplitudePct ?? null;
                      const comparavel = ampPct !== null && ampPct > 0.5;
                      return (
                        <tr
                          key={linha.chave}
                          className={'vg-comparar-row' + (comparavel ? ' tem-variacao' : '')}
                          data-amplitude={amplitudeClasse(ampPct)}
                        >
                          <td className="vg-comparar-td-kpi sticky-col">
                            <span className="vg-comparar-kpi-nome">{linha.nome}</span>
                            {comparavel && (
                              <span className={'vg-comparar-kpi-amp ' + amplitudeClasse(ampPct)}>
                                Δ {fmtPct(ampPct, true)}
                              </span>
                            )}
                          </td>
                          {dados.servicos.map((s, idx) => {
                            const cel = linha.valores[s.id];
                            const destaque = linha.analise?.melhorId === s.id;
                            const pior = linha.analise?.piorId === s.id;
                            const pctMedia = linha.analise?.variacoes?.[s.id]?.pctVsMedia;
                            const temValor = cel?.valor !== null && cel?.valor !== undefined && !isNaN(cel.valor);
                            const barW = barraRelativa(cel?.valor ?? null, max);
                            const mostraDelta = temValor && pctMedia != null && Math.abs(pctMedia) >= 0.5;
                            return (
                              <td
                                key={s.id}
                                className={
                                  'vg-comparar-td-valor' +
                                  (destaque && temValor && comparavel ? ' melhor' : '') +
                                  (pior && temValor && comparavel && dados.servicos.length > 2 ? ' pior' : '')
                                }
                                data-formato={cel?.formato || linha.formato}
                                style={{ '--col-accent': CORES_SERVICO[idx % CORES_SERVICO.length] } as CSSProperties}
                              >
                                <div className="vg-comparar-celula">
                                  {destaque && temValor && comparavel && (
                                    <span className="vg-comparar-rank" title="Melhor valor">1º</span>
                                  )}
                                  <span className="vg-comparar-celula-valor">{cel?.formatado ?? '—'}</span>
                                  {mostraDelta && (
                                    <span
                                      className={'vg-comparar-delta' + (pctMedia < 0 ? ' neg' : ' pos')}
                                      title={`${fmtPct(pctMedia)} em relação à média (${fmtAnaliseValor(linha.analise?.media, linha.formato)})`}
                                    >
                                      {pctMedia < 0 ? <FiTrendingDown size={10} /> : <FiTrendingUp size={10} />}
                                      {fmtPct(pctMedia, true)}
                                    </span>
                                  )}
                                  {temValor && max !== null && (
                                    <div className="vg-comparar-barra-track" aria-hidden>
                                      <div className="vg-comparar-barra-fill" style={{ width: barW + '%' }} />
                                    </div>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                          <td className="vg-comparar-td-ref">
                            <div className="vg-comparar-ref">
                              <span className="vg-comparar-ref-label">Média</span>
                              <span className="vg-comparar-ref-media">
                                {fmtAnaliseValor(linha.analise?.media ?? null, linha.formato)}
                              </span>
                              {ampPct !== null && ampPct !== undefined ? (
                                <span className={'vg-comparar-ref-amp ' + amplitudeClasse(ampPct)}>
                                  dispersão {ampPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                                </span>
                              ) : (
                                <span className="vg-comparar-ref-amp neutro">—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )}
        </>
      )}

      {!carregando && dados && dados.servicos.length < 2 && dados.mensagem && (
        <div className="vg-comparar-empty">
          <FiAlertCircle size={32} style={{ opacity: 0.4 }} />
          <p>{dados.mensagem}</p>
        </div>
      )}
    </div>
  );
}
