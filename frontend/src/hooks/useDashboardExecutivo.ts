import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useToast } from '../contexts/ToastContext';
import dashboardExecutivoService from '../services/dashboardExecutivoService';
import type { DashboardExecutivoResponse, FiltrosExecutivo } from '../services/dashboardExecutivoService';
import { useGoogleFilters } from '../hooks/useGoogleFilters';
import { calcularCicloMensalContrato, inferirMesReferenciaAtual } from '../utils/periodoCicloContrato';
import {
  carregarLayoutExecutivo,
  salvarLayoutExecutivo,
} from '../config/executivoLayout';
import type { DashboardFiltrosState } from '../components/dashboard/dashboardTypes';
import {
  getCacheData,
  setCacheData,
  getCacheFiltros,
  setCacheFiltros,
  lerEntradaCachePersistido,
  resetCacheExecutivo,
  salvarCachePersistido,
  STORAGE_EXECUTIVO_DADOS,
  CACHE_DURACAO,
} from '../components/dashboard/dashboardUtils';

const refInicial = inferirMesReferenciaAtual(1);

export function useDashboardExecutivo() {
  const { adicionarToast } = useToast();
  const filtrosGA = useGoogleFilters();

  const [dados, setDados] = useState<DashboardExecutivoResponse | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [cacheIdade, setCacheIdade] = useState(0);
  const [atualizandoFundo, setAtualizandoFundo] = useState(false);
  const [filtros, setFiltros] = useState<DashboardFiltrosState>({
    contratoId: '',
    servicoId: '',
    mesRef: refInicial.mes,
    anoRef: refInicial.ano,
    diaInicioCiclo: 1,
  });
  const [filtrosProntos, setFiltrosProntos] = useState(false);
  const [exportandoHtml, setExportandoHtml] = useState(false);
  const [widgetsAtivos, setWidgetsAtivos] = useState(() => carregarLayoutExecutivo());
  const [modalLayoutAberto, setModalLayoutAberto] = useState(false);

  const cacheIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const filtrosRef = useRef(filtros);
  filtrosRef.current = filtros;

  const cicloAtual = useMemo(
    () => calcularCicloMensalContrato(filtros.anoRef, filtros.mesRef, filtros.diaInicioCiclo),
    [filtros.anoRef, filtros.mesRef, filtros.diaInicioCiclo],
  );

  const periodoExibicao = useMemo(() => ({
    preset: 'personalizado' as const,
    dataInicio: cicloAtual.dataInicio,
    dataFim: cicloAtual.dataFim,
    label: cicloAtual.label,
  }), [cicloAtual]);

  const carregarDados = useCallback(async (forcarRefresh = false) => {
    const f = filtrosRef.current;
    const filtrosApi: FiltrosExecutivo = {
      periodo: 'ciclo',
      mesReferencia: f.mesRef,
      anoReferencia: f.anoRef,
      ...(f.contratoId ? { contractId: f.contratoId } : {}),
      ...(f.servicoId ? { servicoId: f.servicoId } : {}),
    };
    const filtrosKey = JSON.stringify(filtrosApi);

    if (forcarRefresh) {
      try {
        sessionStorage.removeItem(STORAGE_EXECUTIVO_DADOS);
        localStorage.removeItem(STORAGE_EXECUTIVO_DADOS);
      } catch { /* ignore */ }
      resetCacheExecutivo();
    }

    if (
      !forcarRefresh &&
      getCacheData() &&
      getCacheFiltros() === filtrosKey &&
      Date.now() - getCacheData()!.timestamp < CACHE_DURACAO
    ) {
      const cached = getCacheData()!;
      setDados(cached.dados);
      setCacheIdade(Math.floor((Date.now() - cached.timestamp) / 1000));
      setCarregando(false);
      setAtualizandoFundo(false);
      setErro('');
      return;
    }

    const cacheLocal = !forcarRefresh ? lerEntradaCachePersistido(filtrosKey) : null;
    if (cacheLocal && !cacheLocal.expirado) {
      setCacheData({ dados: cacheLocal.dados, timestamp: cacheLocal.timestamp });
      setCacheFiltros(filtrosKey);
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
      setCacheData({ dados: cacheLocal.dados, timestamp: cacheLocal.timestamp });
      setCacheFiltros(filtrosKey);
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
      setCacheData({ dados: resultado, timestamp: Date.now() });
      setCacheFiltros(filtrosKey);
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
        msg = f.contratoId
          ? 'O dashboard demorou mais que o esperado. Selecione um serviço específico ou clique em Atualizar.'
          : 'Selecione um contrato antes de carregar — a visão de todos os contratos pode demorar vários minutos.';
      }
      setErro(msg);
      adicionarToast(msg, 'error');
    } finally {
      setCarregando(false);
      setAtualizandoFundo(false);
    }
  }, [filtrosGA.setTotalRegistros, filtrosGA.setTotalFiltrado, adicionarToast]);

  useEffect(() => {
    if (!filtrosProntos) return;
    carregarDados(false);
  }, [carregarDados, filtros, filtrosProntos]);

  useEffect(() => {
    if (!dados || !getCacheData()) return;
    if (cacheIntervalRef.current) clearInterval(cacheIntervalRef.current);
    cacheIntervalRef.current = setInterval(() => {
      const cached = getCacheData();
      if (cached) {
        setCacheIdade(Math.floor((Date.now() - cached.timestamp) / 1000));
      }
    }, 1000);
    return () => {
      if (cacheIntervalRef.current) clearInterval(cacheIntervalRef.current);
    };
  }, [dados]);

  const handleRefresh = useCallback(() => {
    carregarDados(true);
  }, [carregarDados]);

  const handleFiltrosChange = useCallback((novos: DashboardFiltrosState) => {
    setFiltros(novos);
  }, []);

  const widgetAtivo = useCallback((id: string) => widgetsAtivos.has(id), [widgetsAtivos]);

  const aplicarLayout = useCallback((ids: Set<string>) => {
    setWidgetsAtivos(ids);
    salvarLayoutExecutivo([...ids]);
    setModalLayoutAberto(false);
    adicionarToast('Layout do dashboard atualizado', 'success');
  }, [adicionarToast]);

  return {
    dados,
    carregando,
    erro,
    cacheIdade,
    atualizandoFundo,
    filtrosGA,
    periodoExibicao,
    filtros,
    handleFiltrosChange,
    setFiltrosProntos,
    handleRefresh,
    exportandoHtml,
    setExportandoHtml,
    widgetsAtivos,
    modalLayoutAberto,
    setModalLayoutAberto,
    widgetAtivo,
    aplicarLayout,
  };
}
