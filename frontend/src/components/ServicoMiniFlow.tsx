/* ============================================
   ServicoMiniFlow — Mini Fluxo Interno
   Upload → Indicadores Auto → Revisão → Config (inline)
   ═══════════════════════════════════════════
   v2 — KPIs e Gráficos com layout melhorado
   ============================================ */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  FiUpload, FiFileText, FiTrash2, FiCheck,
  FiRefreshCw, FiCopy, FiDatabase, FiBarChart2, FiSave,
  FiZap, FiAlertCircle, FiDownload, FiBook, FiInfo,
  FiDollarSign, FiSearch, FiShield, FiCheckCircle,
} from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { FORMULAS_RESUMO_EXECUTIVO } from '../data/formulasResumoExecutivo';
import RevisaoIndicadoresAuto from './RevisaoIndicadoresAuto';
import KpiUniversalActivator from './KpiUniversalActivator';
import kpiUniversalService from '../services/kpiUniversalService';
import servicoService from '../services/servicoService';
import contractService from '../services/contractService';
import coletaService from '../services/coletaService';
import qualidadeColetaService from '../services/qualidadeColetaService';
import pdfService from '../services/pdfService';
import { isAxiosError } from 'axios';
import RelatorioQualidade from './RelatorioQualidade';
import QualidadePlanilhaPreview from './QualidadePlanilhaPreview';
import { TIPOS_SERVICO_LABELS } from '../types';
import { gerarNomePdfArquivo, labelTipoServicoArquivo, formatarDataArquivoPdf } from '../utils/gerarNomePdf';
import {
  buildValoresFixosFromConfigFaturamento,
  sincronizarKpisComFaturamento,
} from '../services/kpiEngine';
import type { KpiConfig, GraficoConfig, ColunaDetectada, ConstanteGlobal } from './KpiEditor/KpiEditorTypes';

const CANDIDATOS_COLUNA_PESO = ['PESO TOTAL', 'PESO', 'PESOTOTAL', 'PESO BRUTO'];
const CANDIDATOS_COLUNA_TIPO_CAMINHAO = [
  'TIPO DE CAMINHAO', 'TIPO DE CAMINHÃO', 'TIPO CAMINHAO', 'TIPO_CAMINHAO', 'CAMINHAO', 'CAMINHÃO',
];

function normalizarNomeColuna(s: string): string {
  return s.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
}

function isColunaPlanilhaInvalida(nome: string): boolean {
  const n = (nome || '').trim();
  return !n || n.startsWith('__EMPTY');
}

function filtrarColunasValidas(cols: ColunaDetectada[]): ColunaDetectada[] {
  return cols.filter(c => !isColunaPlanilhaInvalida(c.nome));
}

function detectarColunaPlanilha(nomes: string[], candidatos: string[]): string {
  const colsNorm = nomes.map(n => ({ original: n, norm: normalizarNomeColuna(n) }));
  for (const cand of candidatos) {
    const cn = normalizarNomeColuna(cand);
    const exato = colsNorm.find(c => c.norm === cn);
    if (exato) return exato.original;
  }
  for (const cand of candidatos) {
    const cn = normalizarNomeColuna(cand);
    const parcial = colsNorm.find(c => c.norm.includes(cn) || cn.includes(c.norm));
    if (parcial) return parcial.original;
  }
  return '';
}

export interface EtapasStatus {
  upload: 'pending' | 'done';
  indicadoresAuto: 'pending' | 'done' | 'skipped';
  revisao: 'pending' | 'done';
  config: 'pending' | 'done';
}

interface PlanilhaItem {
  id: number;
  nomeArquivo: string;
  totalLinhas: number;
  linhasImportadas: number;
  criadoEm: string;
}

interface Props {
  contractId: string;
  servicoId: string;
  servicoNome: string;
  /** Se informado, evita esperar o /padrao para saber o tipo (ex.: roçada) */
  tipoServico?: string;
  onStatusChange?: (status: EtapasStatus) => void;
  onPlanilhasChange?: (info: {
    totalRegistros: number;
    planilhas: PlanilhaItem[];
    temUpload: boolean;
  }) => void;
}

function normalizarPlanilhasUploads(raw: unknown[] | undefined): PlanilhaItem[] {
  return (raw || [])
    .map((item) => {
      const u = item as Record<string, unknown>;
      const id = Number(u.id);
      return {
        id,
        nomeArquivo: String(u.nomeArquivo ?? u.nome ?? ''),
        totalLinhas: Number(u.totalLinhas ?? u.linhas ?? 0),
        linhasImportadas: Number(u.linhasImportadas ?? u.importados ?? 0),
        criadoEm: String(u.criadoEm ?? ''),
      };
    })
    .filter(u => Number.isFinite(u.id) && u.id > 0);
}

function detectarColuna(colunas: ColunaDetectada[], termos: string[]): string {
  for (const t of termos) {
    const tn = t.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
    for (const c of colunas) {
      const cn = c.nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
      if (cn === tn) return c.nome;
    }
  }
  return termos[0] || '';
}

export default function ServicoMiniFlow({
  contractId,
  servicoId,
  servicoNome,
  tipoServico: tipoServicoProp,
  onStatusChange,
  onPlanilhasChange,
}: Props) {
  const { token } = useAuth();
  const { adicionarToast } = useToast();

  const [etapa, setEtapa] = useState<'upload' | 'indicadoresAuto' | 'revisao' | 'config'>('upload');
  const [status, setStatus] = useState<EtapasStatus>({
    upload: 'pending', indicadoresAuto: 'pending', revisao: 'pending', config: 'pending',
  });
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [planilhas, setPlanilhas] = useState<PlanilhaItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [primeiroUpload, setPrimeiroUpload] = useState(true);
  const [colunas, setColunas] = useState<ColunaDetectada[]>([]);
  const [dados, setDados] = useState<any[]>([]);
  const [loadingDados, setLoadingDados] = useState(false);
  const [totalLinhas, setTotalLinhas] = useState(0);
  const [totalImportados, setTotalImportados] = useState(0);
  const [kpis, setKpis] = useState<KpiConfig[]>([]);
  const [graficos, setGraficos] = useState<GraficoConfig[]>([]);
  const [execMetrics, setExecMetrics] = useState<any>(null);
  const [loadingExec, setLoadingExec] = useState(false);
  const [constantes, setConstantes] = useState<Record<string, ConstanteGlobal>>({});
  const [subTab, setSubTab] = useState<'indicadores' | 'metricas' | 'graficos' | 'faturamento'>('indicadores');
  const [autoSave, setAutoSave] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [recargaKey, setRecargaKey] = useState(0);
  const [excluindoPlanilhaId, setExcluindoPlanilhaId] = useState<number | null>(null);
  const [tipoServico, setTipoServico] = useState<string>(tipoServicoProp || '');
  const [contratoNome, setContratoNome] = useState('Contrato');

  useEffect(() => {
    if (tipoServicoProp) setTipoServico(tipoServicoProp);
  }, [tipoServicoProp]);

  // ─── Configuração de Faturamento ───
  const [configFaturamento, setConfigFaturamento] = useState<{
    tipoCobranca: string;
    valorTonelada: number | null;
    valorMini: number | null;
    valorTruck: number | null;
    valorToco: number | null;
    valorBasculante: number | null;
    valorKmLinear: number | null;
    valorM2: number | null;
    valorPorArvore: number | null;
    valorPorUnidade: number | null;
    colunaQuantidade: string;
    colunaTipoCaminhao: string;
    ativo: boolean;
  } | null>(null);
  const [faturamentoSaving, setFaturamentoSaving] = useState(false);
  const [faturamentoSalvo, setFaturamentoSalvo] = useState(false);

  // ─── Configuração de Faturamento (já declarada acima) ───

  useEffect(() => {
    (async () => {
      try {
        const data = await servicoService.getConfigFaturamento(contractId, servicoId);
        setConfigFaturamento(data.configFaturamento);
      } catch {}
    })();
  }, [contractId, servicoId, token]);

  // Auto-detectar colunas de peso e tipo de caminhão na planilha padrão
  useEffect(() => {
    if (!configFaturamento || configFaturamento.tipoCobranca !== 'tonelada_tipo_caminhao') return;
    if (colunas.length === 0) return;

    const nomes = colunas.map(c => c.nome);
    const updates: Partial<NonNullable<typeof configFaturamento>> = {};

    if (!configFaturamento.colunaQuantidade) {
      const peso = detectarColunaPlanilha(nomes, CANDIDATOS_COLUNA_PESO);
      if (peso) updates.colunaQuantidade = peso;
    }
    if (!configFaturamento.colunaTipoCaminhao) {
      const tipo = detectarColunaPlanilha(nomes, CANDIDATOS_COLUNA_TIPO_CAMINHAO);
      if (tipo) updates.colunaTipoCaminhao = tipo;
    }

    if (Object.keys(updates).length > 0) {
      setConfigFaturamento(prev => (prev ? { ...prev, ...updates } : prev));
    }
  }, [colunas, configFaturamento?.tipoCobranca, configFaturamento?.colunaQuantidade, configFaturamento?.colunaTipoCaminhao]);

  const kpisUniversalIds = useMemo(() => {
    return kpis.filter(k => (k as any).origemUniversal).map(k => (k as any).origemUniversal as string).filter(Boolean);
  }, [kpis]);

  const [kpisUniversaisInline, setKpisUniversaisInline] = useState<any[]>([]);
  const [kpisUniversaisInlineIds, setKpisUniversaisInlineIds] = useState<Set<string>>(new Set());
  const [carregandoKpisInline, setCarregandoKpisInline] = useState(false);

  const [bibliotecaAberta, setBibliotecaAberta] = useState(false);
  const [qualidadeAberta, setQualidadeAberta] = useState(false);
  const [qualidadeUploadId, setQualidadeUploadId] = useState<number | null>(null);

  // ─── Validação antes do upload ───
  const [modoValidacao, setModoValidacao] = useState(false);
  const [validando, setValidando] = useState(false);
  const [validacaoData, setValidacaoData] = useState<any>(null);
  const [arquivoValidacao, setArquivoValidacao] = useState<File | null>(null);

  // ─── Análise viagem por viagem ───
  const [analisandoViagens, setAnalisandoViagens] = useState(false);
  const [dadosViagens, setDadosViagens] = useState<any>(null);
  const [gerandoPdfViagens, setGerandoPdfViagens] = useState(false);
  const [importacaoConcluida, setImportacaoConcluida] = useState(false);
  const [conferindoDiaria, setConferindoDiaria] = useState(false);
  const [conferenciaDiaria, setConferenciaDiaria] = useState<{
    diasNovos: number;
    diasIguais: number;
    diasDivergentes: number;
    diasBloqueados: number;
    diasSomenteSistema: number;
    temDivergencia: boolean;
    ultimaDataPlanilha: string | null;
    ultimaDataSistema: string | null;
    recomendacao: string;
    dias: Array<{
      data: string;
      dataBr: string;
      status: 'novo' | 'igual' | 'divergente' | 'bloqueado' | 'somente_sistema';
      planilha: { rotas: number; viagens: number; pesoKg: number; km: number } | null;
      sistema: { rotas: number; viagens: number; pesoKg: number; km: number } | null;
      diferencas: string[];
    }>;
  } | null>(null);
  const [resumoImportacao, setResumoImportacao] = useState<{
    importados: number;
    validasDashboard: number;
    inconsistentes: number;
    uploadsRemovidos?: number;
    registrosPreservados?: number;
  } | null>(null);

  // ── Refs para evitar stale closure nos callbacks de toggle ──
  const kpisRef = useRef(kpis);
  kpisRef.current = kpis;
  const graficosRef = useRef(graficos);
  graficosRef.current = graficos;
  const validacaoInputRef = useRef<HTMLInputElement>(null);

  // ── Toggle de KPI universal com functional updater (nunca perde seleção) ──
  const toggleKpiUniversal = useCallback((kpiU: any, ativo: boolean) => {
    // Atualiza o Set de IDs selecionados
    setKpisUniversaisInlineIds(prev => {
      const n = new Set(prev);
      if (ativo) n.delete(kpiU.id);
      else n.add(kpiU.id);
      return n;
    });

    // Atualiza kpis com functional updater → sempre estado mais recente
    setKpis(prev => {
      if (ativo) {
        // Remove o KPI universal da lista
        return prev.filter(k => (k as any).origemUniversal !== kpiU.id);
      } else {
        // Adiciona novo KPI universal
        const valoresFat = buildValoresFixosFromConfigFaturamento(
          configFaturamento?.ativo ? configFaturamento : null
        );
        const novoKpi: KpiConfig = {
          nome: kpiU.nome, label: kpiU.label, expressao: kpiU.formula || kpiU.expressao,
          agregacao: (kpiU.agregacao || 'sum') as KpiConfig['agregacao'],
          formato: (kpiU.formato || 'numero') as KpiConfig['formato'],
          unidade: kpiU.unidade, categoria: kpiU.categoria, cor: kpiU.cor,
          descricao: kpiU.descricao, meta: kpiU.metaSugerida || kpiU.meta,
          ativo: true, valoresFixos: valoresFat, colunasUsadas: [] as string[],
          origemUniversal: kpiU.id,
          placeholdersNaoResolvidos: kpiU.placeholders?.filter((p: any) => !p.resolvido)?.map((p: any) => p.nome),
        };
        const [kpiSync] = sincronizarKpisComFaturamento([novoKpi], configFaturamento?.ativo ? configFaturamento : null);
        return [...prev, kpiSync];
      }
    });
  }, [configFaturamento]);

  const carregarKpisBiblioteca = useCallback(async () => {
    setCarregandoKpisInline(true);
    try {
      const r = await kpiUniversalService.listar(tipoServico || undefined);
      setKpisUniversaisInline(r.kpis);
      setKpisUniversaisInlineIds(new Set(
        kpisRef.current
          .filter(k => (k as any).origemUniversal)
          .map(k => (k as any).origemUniversal as string)
          .filter(Boolean)
      ));
    } catch {
      setKpisUniversaisInline([]);
    } finally {
      setCarregandoKpisInline(false);
    }
  }, [tipoServico]);

  const handleToggleBiblioteca = useCallback(() => {
    const abrir = !bibliotecaAberta;
    setBibliotecaAberta(abrir);
    if (abrir) carregarKpisBiblioteca();
  }, [bibliotecaAberta, carregarKpisBiblioteca]);

  const selecionarTodosBiblioteca = useCallback(() => {
    setKpisUniversaisInlineIds(prev => {
      const n = new Set(prev);
      kpisUniversaisInline.forEach(k => n.add(k.id));
      return n;
    });
    setKpis(prev => {
      const idsExistentes = new Set(
        prev.filter(k => (k as any).origemUniversal).map(k => (k as any).origemUniversal as string)
      );
      const paraAdicionar = kpisUniversaisInline.filter(k => !idsExistentes.has(k.id));
      if (paraAdicionar.length === 0) return prev;
      const valoresFat = buildValoresFixosFromConfigFaturamento(
        configFaturamento?.ativo ? configFaturamento : null
      );
      const novos = paraAdicionar.map(kpiU => {
        const novoKpi: KpiConfig = {
          nome: kpiU.nome, label: kpiU.label, expressao: kpiU.formula || kpiU.expressao,
          agregacao: (kpiU.agregacao || 'sum') as KpiConfig['agregacao'],
          formato: (kpiU.formato || 'numero') as KpiConfig['formato'],
          unidade: kpiU.unidade, categoria: kpiU.categoria, cor: kpiU.cor,
          descricao: kpiU.descricao, meta: kpiU.metaSugerida || kpiU.meta,
          ativo: true, valoresFixos: valoresFat, colunasUsadas: [] as string[],
          origemUniversal: kpiU.id,
          placeholdersNaoResolvidos: kpiU.placeholders?.filter((p: any) => !p.resolvido)?.map((p: any) => p.nome),
        };
        const [kpiSync] = sincronizarKpisComFaturamento([novoKpi], configFaturamento?.ativo ? configFaturamento : null);
        return kpiSync;
      });
      return [...prev, ...novos];
    });
  }, [kpisUniversaisInline, configFaturamento]);

  const limparSelecaoBiblioteca = useCallback(() => {
    const idsAtivos = new Set(kpisUniversaisInlineIds);
    setKpisUniversaisInlineIds(new Set());
    setKpis(prev => prev.filter(k => !idsAtivos.has((k as any).origemUniversal)));
  }, [kpisUniversaisInlineIds]);

  // ── Auto-save com debounce via effect (usa refs para evitar stale) ──
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const kpisAtuais = kpisRef.current;
      const graficosAtuais = graficosRef.current;
      if (kpisAtuais.length === 0 && graficosAtuais.length === 0) return;
      salvarConfig(kpisAtuais, graficosAtuais);
    }, 1200);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [kpis, graficos]); // eslint-disable-line react-hooks/exhaustive-deps

  const colsNum = colunas.filter(c => c.tipo === 'numero');
  const colsText = colunas.filter(c => c.tipo === 'texto' || c.tipo === 'desconhecido');
  const temPlanilha = colunas.length > 0;

  const kpisAutomaticos = kpis.filter(k => (k as any).automatico);
  const kpisManuais = kpis.filter(k => !(k as any).automatico);

  const statusRef = useRef(status);
  useEffect(() => {
    if (statusRef.current === status &&
        statusRef.current.upload === status.upload &&
        statusRef.current.indicadoresAuto === status.indicadoresAuto &&
        statusRef.current.revisao === status.revisao &&
        statusRef.current.config === status.config) return;
    statusRef.current = status;
    onStatusChange?.(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const carregadoRef = useRef(false);

  const aplicarDadosPadrao = useCallback((data: Awaited<ReturnType<typeof servicoService.getPadrao>>) => {
    const cfg = data.servico?.configDashboard;
    const cols: ColunaDetectada[] = filtrarColunasValidas(
      data.servico?.padraoPlanilha?.colunas || [],
    );
    const ups = normalizarPlanilhasUploads(data.uploads?.ultimos);
    const registros = data.uploads?.registrosValidos ?? data.uploads?.totalImportados ?? 0;

    setColunas(cols);
    setPlanilhas(ups);
    setTotalLinhas(data.uploads?.totalLinhas || 0);
    setTotalImportados(registros);
    setTipoServico(data.servico?.tipo || '');

    const temKpisAuto = cfg?.indicadoresAutomaticosConfirmados;
    const temKpis = (cfg?.kpis?.length || 0) > 0;
    const temUpload = cols.length > 0 || ups.length > 0;
    const novoStatus: EtapasStatus = {
      upload: temUpload ? 'done' : 'pending',
      indicadoresAuto: temKpisAuto ? 'done' : 'pending',
      revisao: temUpload ? 'done' : 'pending',
      config: temKpis ? 'done' : 'pending',
    };
    if (temKpisAuto && temUpload) novoStatus.config = 'done';
    setStatus(novoStatus);

    onPlanilhasChange?.({
      totalRegistros: registros,
      planilhas: ups,
      temUpload,
    });

    return { cols, ups, registros, temUpload, cfg };
  }, [onPlanilhasChange]);

  useEffect(() => {
    if (carregadoRef.current && recargaKey === 0) return;
    carregadoRef.current = true;
    (async () => {
      try {
        const [data, contrato] = await Promise.all([
          servicoService.getPadrao(contractId, servicoId),
          contractService.buscar(contractId),
        ]);
        setContratoNome(contrato.numeroContrato || 'Contrato');
        const { cfg, temUpload } = aplicarDadosPadrao(data);
        if (cfg?.kpis?.length) setKpis(JSON.parse(JSON.stringify(cfg.kpis)));
        if (cfg?.graficos?.length) setGraficos(JSON.parse(JSON.stringify(cfg.graficos)));
        if (data.valoresCaminhao) {
          const g: Record<string, ConstanteGlobal> = {};
          for (const [k, v] of Object.entries(data.valoresCaminhao)) {
            if (v != null) g[k] = { valor: Number(v), label: k };
          }
          setConstantes(g);
        }
        if (cfg?.indicadoresAutomaticosConfirmados && temUpload) setEtapa('revisao');
      } catch { /* silent */ }
    })();
  }, [contractId, servicoId, token, recargaKey, aplicarDadosPadrao]);

  useEffect(() => {
    if (!temPlanilha) return;
    let ativo = true;
    setLoadingDados(true);
    setLoadingExec(true);
    Promise.all([
      servicoService.getDadosBrutos(contractId, servicoId, 100),
      servicoService.getKpiExecMetrics(contractId, servicoId),
    ]).then(async ([brutos, metrics]) => {
      if (!ativo) return;
      setDados(brutos.dados || []);
      setExecMetrics(metrics);
    }).catch(() => {}).finally(() => {
      if (ativo) { setLoadingDados(false); setLoadingExec(false); }
    });
    return () => { ativo = false; };
  }, [contractId, servicoId, token, temPlanilha]);

  const salvarConfig = useCallback(async (novosKpis: KpiConfig[], novosGraficos: GraficoConfig[]) => {
    setAutoSave('saving');
    try {
      await servicoService.saveConfigDashboard(contractId, servicoId, {
        kpis: novosKpis.filter(k => k.ativo !== false),
        graficos: novosGraficos.filter(g => g.ativo),
      });
      setAutoSave('saved');
      setTimeout(() => setAutoSave('idle'), 2000);
      if (novosKpis.filter(k => k.ativo !== false).length > 0) setStatus(prev => ({ ...prev, config: 'done' }));
    } catch { setAutoSave('idle'); }
  }, [contractId, servicoId, token]);

  const salvarConfigFaturamento = useCallback(async () => {
    if (!configFaturamento) return;

    if (configFaturamento.tipoCobranca === 'tonelada_tipo_caminhao') {
      const temValorTipo = [
        configFaturamento.valorMini,
        configFaturamento.valorTruck,
        configFaturamento.valorToco,
        configFaturamento.valorBasculante,
      ]
        .some(v => v != null && v > 0);
      if (!temValorTipo) {
        adicionarToast('Informe pelo menos um valor para Mini, Truck ou Toco', 'warning');
        return;
      }
      if (colunas.length > 0 && !configFaturamento.colunaTipoCaminhao) {
        adicionarToast('Selecione a coluna do tipo de caminhão na planilha', 'warning');
        return;
      }
    }

    const cfgParaSalvar = { ...configFaturamento, ativo: true };

    setFaturamentoSaving(true);
    try {
      await servicoService.saveConfigFaturamento(contractId, servicoId, cfgParaSalvar);
      setConfigFaturamento(cfgParaSalvar);

      const kpisSincronizados = sincronizarKpisComFaturamento(kpis, cfgParaSalvar);
      const mudouKpis = JSON.stringify(kpisSincronizados) !== JSON.stringify(kpis);
      if (mudouKpis) {
        setKpis(kpisSincronizados);
        await salvarConfig(kpisSincronizados, graficos);
      }

      setFaturamentoSalvo(true);
      setTimeout(() => setFaturamentoSalvo(false), 2000);
      adicionarToast('Config de faturamento salva!', 'success');
    } catch {
      adicionarToast('Erro ao salvar config', 'error');
    } finally {
      setFaturamentoSaving(false);
    }
  }, [contractId, servicoId, configFaturamento, colunas.length, token, adicionarToast, kpis, graficos, salvarConfig]);

  const ehRocada = tipoServico === 'rocadeira';

  const importarPlanilhaValidada = async (file: File, relatorio?: any): Promise<boolean> => {
    setUploading(true);
    setUploadPct(0);
    const iv = setInterval(() => setUploadPct(p => Math.min(p + 15, 85)), 200);
    try {
      const estrategia = temPlanilha ? 'atualizar_data' as const : undefined;
      const data = await coletaService.uploadPlanilha(file, servicoId, estrategia);
      clearInterval(iv);
      setUploadPct(100);
      {
        const inconsistentes = data.viagensInconsistentes
          ?? data.resumo?.viagensInconsistentes
          ?? relatorio?.viagensInconsistentesTotal
          ?? relatorio?.viagensIncompletas
          ?? 0;
        const corrigidas = data.viagensCorrigidas
          ?? data.resumo?.viagensCorrigidas
          ?? 0;
        const validasDashboard = data.viagensValidasDashboard
          ?? data.resumo?.viagensValidasDashboard
          ?? relatorio?.viagensValidasDashboard
          ?? relatorio?.viagensCompletas
          ?? (data.importados - inconsistentes);
        const importados = data.importados ?? data.importadas ?? 0;
        const uploadsRemovidos = data.consolidacao?.uploadsRemovidos ?? 0;
        const registrosPreservados = data.consolidacao?.registrosPreservados ?? 0;

        setResumoImportacao({
          importados,
          validasDashboard,
          inconsistentes,
          uploadsRemovidos,
          registrosPreservados,
        });
        setImportacaoConcluida(true);
        setStatus(prev => ({ ...prev, upload: 'done', revisao: 'done' }));
        setEtapa('revisao');
        setPrimeiroUpload(false);
        carregadoRef.current = false;
        setRecargaKey(k => k + 1);

        const extras: string[] = [];
        if (uploadsRemovidos > 0) extras.push(`${uploadsRemovidos} planilha(s) antiga(s) removida(s)`);
        if (registrosPreservados > 0) extras.push(`${registrosPreservados} registro(s) de dias só no sistema preservados`);
        const sufixo = extras.length ? ` ${extras.join('; ')}.` : '';

        if (inconsistentes > 0) {
          adicionarToast(
            `${validasDashboard} viagem(ns) na planilha ativa. ${inconsistentes} linha(s) rejeitada(s).${sufixo}`,
            'warning'
          );
        } else if (corrigidas > 0) {
          adicionarToast(
            `${validasDashboard} viagem(ns) importada(s). ${corrigidas} linha(s) corrigida(s) automaticamente.${sufixo}`,
            'success'
          );
        } else {
          adicionarToast(
            data.mensagem || `${validasDashboard} viagem(ns) importada(s) com sucesso.${sufixo}`,
            'success'
          );
        }
      }
      return true;
    } catch (err) {
      const data = isAxiosError(err) ? (err.response?.data as { error?: string; detalhe?: string }) : null;
      const msg = data?.error || (isAxiosError(err) ? 'Erro no upload' : 'Erro no upload');
      const detalhe = data?.detalhe && data.detalhe !== msg ? ` (${data.detalhe})` : '';
      adicionarToast(`${msg}${detalhe}`, 'error');
      return false;
    } finally {
      clearInterval(iv);
      setUploading(false);
      setUploadPct(0);
    }
  };

  // ─── Análise viagem por viagem (relatório de linhas incorretas) ───
  const analisarViagensArquivo = async (file: File): Promise<any | null> => {
    setAnalisandoViagens(true);
    setDadosViagens(null);
    try {
      const data = await qualidadeColetaService.analisarViagens(file, contractId);
      setDadosViagens(data);
      return data;
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error || 'Erro ao analisar viagens'
        : 'Erro ao analisar viagens';
      adicionarToast(msg, 'error');
      return null;
    } finally {
      setAnalisandoViagens(false);
    }
  };

  // ─── Roçada: preview multi-modelo → importação (sem validação de viagem) ───
  const handleValidarRocada = async (file: File) => {
    setArquivoValidacao(file);
    setValidando(true);
    setValidacaoData(null);
    setDadosViagens(null);
    setConferenciaDiaria(null);
    setImportacaoConcluida(false);
    setResumoImportacao(null);
    setModoValidacao(true);
    try {
      const preview = await coletaService.previewRocada(file);
      const podeImportar = preview.podeImportar !== false
        && preview.sucesso
        && (preview.resumo?.registros ?? 0) > 0
        && (preview.resumo?.areaTotalM2 ?? 0) > 0;

      setValidacaoData({
        sucesso: podeImportar,
        mensagem: preview.mensagem,
        arquivo: preview.arquivo,
        resumoRocada: preview.resumo,
        avisos: preview.avisos,
        abasUsadas: preview.abasUsadas,
        modelo: preview.modelo,
        linhasSemArea: preview.linhasSemArea ?? preview.resumo?.linhasSemArea ?? 0,
        semColunaArea: preview.semColunaArea ?? preview.resumo?.semColunaArea ?? false,
        amostraSemArea: preview.amostraSemArea || [],
        podeImportar,
      } as any);

      if (!podeImportar) {
        const msg = preview.semColunaArea || preview.resumo?.semColunaArea
          ? 'Planilha sem coluna de metragem (m²/área). Inclua a coluna e envie novamente.'
          : preview.mensagem || 'Nenhuma linha com m²/área válida nesta planilha.';
        adicionarToast(msg, 'error');
        return;
      }

      const semArea = preview.linhasSemArea ?? preview.resumo?.linhasSemArea ?? 0;
      adicionarToast(
        `Modelo ${preview.resumo.modelo}: ${preview.resumo.registros} registro(s), `
        + `${preview.resumo.areaTotalM2.toLocaleString('pt-BR')} m², ${preview.resumo.dias} dia(s).`
        + (semArea > 0 ? ` ${semArea} linha(s) sem m² ignorada(s).` : ''),
        semArea > 0 ? 'warning' : 'success',
      );

      const importou = await importarPlanilhaValidada(file, {
        viagensValidasDashboard: preview.resumo.registros,
        viagensCompletas: preview.resumo.registros,
      });
      if (importou) {
        adicionarToast('Planilha de roçada importada. Dashboard atualizado com área (m²) por dia/bairro.', 'info');
      }
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error || 'Erro ao validar planilha de roçada'
        : 'Erro ao conectar com o servidor';
      adicionarToast(msg, 'error');
      setModoValidacao(false);
    } finally {
      setValidando(false);
    }
  };

  // ─── Validação → PDF de saúde → importação automática ───
  const handleValidarDados = async (file: File) => {
    if (ehRocada) {
      await handleValidarRocada(file);
      return;
    }

    setArquivoValidacao(file);
    setValidando(true);
    setValidacaoData(null);
    setDadosViagens(null);
    setConferenciaDiaria(null);
    setImportacaoConcluida(false);
    setResumoImportacao(null);
    setModoValidacao(true);
    try {
      const data = await qualidadeColetaService.preview(file, { servico_id: servicoId });
      setValidacaoData(data);
      if (!data.sucesso) {
        adicionarToast(data.mensagem || data.erro || 'Planilha com problemas de estrutura. Corrija e tente novamente.', 'error');
        setModoValidacao(false);
        return;
      }

      const relatorio = await analisarViagensArquivo(file);
      if (!relatorio) {
        adicionarToast('Análise de viagens indisponível.', 'warning');
        return;
      }

      const pdfOk = await gerarPdfViagensDeRelatorio(relatorio, { silencioso: true });
      if (!pdfOk) {
        adicionarToast('Não foi possível gerar o PDF de saúde dos dados.', 'warning');
      }

      let conf: typeof conferenciaDiaria = null;
      if (temPlanilha) {
        setConferindoDiaria(true);
        try {
          conf = await coletaService.conferenciaDiaria(file, servicoId);
          setConferenciaDiaria(conf);
          if (conf.diasDivergentes > 0) {
            adicionarToast(
              `${conf.diasDivergentes} dia(s) diferem do sistema — a importação atualizará conforme a planilha.`,
              'warning',
            );
          } else if (conf.diasNovos > 0) {
            adicionarToast(`${conf.diasNovos} dia(s) novo(s) serão importados.`, 'info');
          }
        } catch (err) {
          const msg = isAxiosError(err)
            ? (err.response?.data as { error?: string })?.error || 'Erro na conferência diária'
            : 'Erro na conferência diária';
          adicionarToast(msg, 'warning');
        } finally {
          setConferindoDiaria(false);
        }
      }

      if ((conf?.diasBloqueados ?? 0) > 0) {
        adicionarToast('Importação bloqueada: há dias em ciclo fechado. Revise o relatório.', 'error');
        if (pdfOk) adicionarToast('PDF de saúde dos dados baixado — corrija os bloqueios e envie novamente.', 'info');
        return;
      }

      const validas = relatorio.viagensValidasDashboard ?? relatorio.viagensCompletas ?? 0;
      if (validas <= 0) {
        adicionarToast('Nenhuma viagem válida para importar. Veja o PDF de saúde baixado.', 'warning');
        return;
      }

      const importou = await importarPlanilhaValidada(file, relatorio);
      if (importou && pdfOk) {
        adicionarToast('PDF de saúde dos dados baixado automaticamente.', 'info');
      }
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error || 'Erro ao validar planilha'
        : 'Erro ao conectar com o servidor para validação';
      adicionarToast(msg, 'error');
      setModoValidacao(false);
    } finally {
      setValidando(false);
    }
  };

  const handleSelecionarPlanilha = (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|xlsm)$/i)) {
      adicionarToast('Selecione um arquivo .xlsx, .xls ou .xlsm', 'error');
      return;
    }
    handleValidarDados(file);
  };

  const handleAnalisarViagens = async () => {
    if (!arquivoValidacao) return;
    await analisarViagensArquivo(arquivoValidacao);
  };

  const limparValidacao = () => {
    setModoValidacao(false);
    setValidacaoData(null);
    setDadosViagens(null);
    setConferenciaDiaria(null);
    setArquivoValidacao(null);
    setImportacaoConcluida(false);
    setResumoImportacao(null);
  };

  const obterNomePdfSaudeDados = () => gerarNomePdfArquivo({
    contratoNome,
    tipoServico: labelTipoServicoArquivo(tipoServico, TIPOS_SERVICO_LABELS as Record<string, string>),
    sufixo: 'Saude_Dados',
  });

  const montarHtmlPdfViagens = (relatorio: any) => {
    const viagens = relatorio.viagens || [];
    const inconsistentes = (relatorio.viagensInconsistentesTotal ?? relatorio.viagensIncompletas) || 0;
    const validas = relatorio.viagensValidasDashboard ?? relatorio.viagensCompletas ?? 0;
    const descartadas = relatorio.linhasDescartadasSemDados ?? 0;
    const dataRelatorio = formatarDataArquivoPdf();
    const tipoLabel = labelTipoServicoArquivo(tipoServico, TIPOS_SERVICO_LABELS as Record<string, string>);

    const filtrarProblemasDashboard = (problemas: string[] | undefined) =>
      (problemas || []).filter((p) => {
        const pl = p.toLowerCase();
        return !pl.includes('placa será unificada') && !pl.startsWith('corrigido automaticamente');
      });

    const linhasTabela = viagens.map((v: any) => {
      const probs = filtrarProblemasDashboard(v.problemas);
      return `
      <tr>
        <td>${v.linha}</td>
        <td>${v.data || '—'}</td>
        <td>${v.placa || '—'}</td>
        <td>${v.motorista || '—'}</td>
        <td>${v.rota || '—'}</td>
        <td>${v.kmTotal != null ? v.kmTotal.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : (v.kmTotalCalculado != null ? v.kmTotalCalculado.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '*' : '—')}</td>
        <td>${v.pesoTotal != null ? Number(v.pesoTotal).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—'}</td>
        <td style="color:#b45309; font-size:9px">${probs.join('; ') || '—'}</td>
      </tr>
    `;
    }).join('');

    const ap = relatorio.resumoPlacas;
    const resumoPlacasHtml = ap?.alerta ? `
  <div class="aviso" style="background:#fef2f2;border-color:#fecaca;color:#991b1b">
    <strong>Placas:</strong> ${ap.alerta}
  </div>` : '';

    const problemasLista = relatorio.problemasDashboard || relatorio.problemasAgrupados || [];
    const problemasHtml = problemasLista.map((p: any) => `
      <div style="display:flex; justify-content:space-between; padding:6px 10px; background:#fef2f2; border-radius:6px; margin-bottom:4px; font-size:13px;">
        <span>${p.tipo}</span>
        <span style="font-weight:700; color:#dc2626">${p.quantidade} viagem(ns)</span>
      </div>
    `).join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; overflow: visible; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 20px; background: #f1f5f9; }
    .header { text-align: center; padding: 20px 0 10px; }
    .header h1 { margin: 0; font-size: 20px; color: #1e293b; }
    .header p { margin: 4px 0 0; font-size: 12px; color: #64748b; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 14px 0; }
    .card { background: #fff; border-radius: 8px; padding: 12px; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
    .card .num { font-size: 22px; font-weight: 700; color: #1e293b; }
    .card .label { font-size: 10px; color: #64748b; margin-top: 2px; }
    .card.completas .num { color: #16a34a; }
    .card.incompletas .num { color: #dc2626; }
    .section-title { font-size: 14px; font-weight: 700; color: #334155; margin: 16px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #6366f1; }
    .problemas-box { background: #fff; border-radius: 8px; padding: 10px; margin-bottom: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
    .aviso { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px; margin-bottom: 12px; font-size: 12px; color: #1e40af; }
    table { width: 100%; border-collapse: collapse; font-size: 9px; }
    th { background: #1e293b; color: #fff; padding: 6px 8px; text-align: left; font-weight: 600; }
    td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
    tr:nth-child(even) { background: #f8fafc; }
    tr { break-inside: avoid; }
    .footer { text-align: center; font-size: 10px; color: #94a3b8; margin-top: 20px; padding-top: 10px; border-top: 1px solid #e2e8f0; }
    .obs { font-size: 10px; color: #64748b; font-style: italic; margin-top: 4px; }
    @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Relatório de Saúde dos Dados</h1>
    <p style="font-size:13px; font-weight:600; color:#334155; margin:6px 0 2px">
      Contrato: ${contratoNome} • Tipo: ${tipoLabel} • Data: ${dataRelatorio}
    </p>
    <p>Serviço: ${servicoNome} • Arquivo: ${relatorio.nomeArquivo || '—'} • Aba: ${relatorio.aba || '—'}</p>
  </div>

  <div class="summary">
    <div class="card"><div class="num">${relatorio.totalViagens || 0}</div><div class="label">Total de Viagens</div></div>
    <div class="card completas"><div class="num">${validas}</div><div class="label">Válidas (dashboard)</div></div>
    <div class="card incompletas"><div class="num">${inconsistentes}</div><div class="label">Inconsistentes</div></div>
    ${descartadas > 0 ? `<div class="card"><div class="num">${descartadas}</div><div class="label">Ignoradas (sem dados)</div></div>` : ''}
    <div class="card"><div class="num">${relatorio.percentualCompleto || 0}%</div><div class="label">% Válidas</div></div>
  </div>

  <div class="aviso">
    As ${validas} viagem(ns) válidas entram no dashboard. As ${inconsistentes} inconsistente(s) ficam fora dos KPIs.
    ${descartadas > 0 ? `${descartadas} linha(s) sem placa, KM Total e Peso Total foram ignoradas e não entram no sistema. ` : ''}
    Regras: KM máx. 300, peso &gt; 0, sem negativos, horas com ":" (não ";").
  </div>

  ${(relatorio.regrasSaude || []).length > 0 ? `
  <div class="section-title">O que precisa para entrar no dashboard</div>
  <ul style="font-size:11px; color:#475569; margin:0 0 12px 18px; padding:0;">
    ${(relatorio.regrasSaude || []).map((r: string) => `<li>${r}</li>`).join('')}
  </ul>
  ` : ''}

  <div class="section-title">Problemas que excluem viagens do dashboard</div>
  <div class="problemas-box">
    ${problemasHtml || '<p style="color:#16a34a; font-weight:600">Nenhum bloqueio — todas as viagens identificadas entram no dashboard.</p>'}
  </div>

  ${resumoPlacasHtml}

  ${viagens.length > 0 ? `
  <div class="section-title">Amostra — viagens fora do dashboard (${viagens.length}${viagens.length >= 500 ? '+' : ''})</div>
  <table>
    <thead>
      <tr>
        <th>Linha</th><th>Data</th><th>Placa</th><th>Motorista</th><th>Rota</th>
        <th>KM Total</th><th>Peso (t)</th><th>Problemas</th>
      </tr>
    </thead>
    <tbody>
      ${linhasTabela}
    </tbody>
  </table>
  <div class="obs">* KM Total calculado a partir de KM Saída e KM Chegada quando ausente na planilha</div>
  ` : ''}

  <div class="footer">
    Relatório gerado automaticamente • Sistemma • ${new Date().toLocaleString('pt-BR')}
  </div>
</body>
</html>`;
  };

  const gerarPdfViagensDeRelatorio = async (relatorio: any, opts?: { silencioso?: boolean }): Promise<boolean> => {
    setGerandoPdfViagens(true);
    try {
      const html = montarHtmlPdfViagens(relatorio);
      const filename = obterNomePdfSaudeDados();
      await pdfService.gerarEBaixar(html, filename, 'default');
      if (!opts?.silencioso) {
        adicionarToast('PDF com dados inconsistentes gerado!', 'success');
      }
      return true;
    } catch (err) {
      if (!opts?.silencioso) {
        const msg = isAxiosError(err)
          ? (err.response?.data as { error?: string })?.error || 'Erro ao gerar PDF'
          : 'Erro ao gerar PDF';
        adicionarToast(msg, 'error');
      }
      return false;
    } finally {
      setGerandoPdfViagens(false);
    }
  };

  const handleGerarPdfViagens = async () => {
    if (!dadosViagens) return;
    await gerarPdfViagensDeRelatorio(dadosViagens);
  };

  const mensagemProcessamentoUpload = () => {
    if (validando) return 'Validando estrutura da planilha...';
    if (analisandoViagens) return 'Analisando viagens (KM, peso, rota)...';
    if (conferindoDiaria) return 'Conferindo planilha vs sistema (dia a dia)...';
    if (gerandoPdfViagens) return 'Gerando PDF de saúde dos dados...';
    if (uploading) return 'Importando viagens válidas para o dashboard...';
    return '';
  };

  const handleAutoConfirm = useCallback((indicadores: KpiConfig[], graficosCfg: GraficoConfig[]) => {
    const novosKpis = [...kpis, ...indicadores]; const novosGraficos = [...graficos, ...graficosCfg];
    setKpis(novosKpis); setGraficos(novosGraficos);
    setStatus(prev => ({ ...prev, indicadoresAuto: 'done', config: novosKpis.filter(k => k.ativo !== false).length > 0 ? 'done' : 'pending' }));
    setEtapa('revisao'); salvarConfig(novosKpis, novosGraficos);
    adicionarToast(`\u2705 ${indicadores.length} indicador(es) autom\u00e1tico(s) criados!`, 'success');
  }, [kpis, graficos, salvarConfig, adicionarToast]);

  const handleAutoSkip = useCallback(() => {
    setStatus(prev => ({ ...prev, indicadoresAuto: 'skipped' }));
    setEtapa('revisao'); adicionarToast('\u23ed Indicadores autom\u00e1ticos pulados. Configure manualmente depois.', 'info');
  }, [adicionarToast]);

  const excluirPlanilha = async (uploadId: number) => {
    const id = Number(uploadId);
    if (!Number.isFinite(id) || id <= 0) return;
    if (excluindoPlanilhaId === id) return;

    setExcluindoPlanilhaId(id);
    try {
      await coletaService.excluirUpload(id);
      const data = await servicoService.getPadrao(contractId, servicoId);
      const { ups, temUpload } = aplicarDadosPadrao(data);

      if (!temUpload) {
        setDados([]);
        setExecMetrics(null);
        setEtapa('upload');
      } else {
        const [brutos, metrics] = await Promise.all([
          servicoService.getDadosBrutos(contractId, servicoId, 100),
          servicoService.getKpiExecMetrics(contractId, servicoId),
        ]);
        setDados(brutos.dados || []);
        setExecMetrics(metrics);
      }

      if (qualidadeUploadId === id) {
        setQualidadeAberta(false);
        setQualidadeUploadId(null);
      }

      adicionarToast('Planilha excluída!', 'success');
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error || 'Erro ao excluir planilha'
        : 'Erro ao excluir planilha';
      adicionarToast(msg, 'error');
    } finally {
      setExcluindoPlanilhaId(null);
    }
  };

  const alterarTipo = async (nome: string, tipo: string) => {
    try {
      await servicoService.updateColunasTipo(contractId, servicoId, { nome, tipo });
      adicionarToast(`Coluna "${nome}" \u2192 ${tipo}`, 'success');
      carregadoRef.current = false; setRecargaKey(k => k + 1);
    } catch { adicionarToast('Erro ao alterar tipo', 'error'); }
  };

  const handleCriarKpi = useCallback((metricaKey: string) => {
    const formula = FORMULAS_RESUMO_EXECUTIVO.find(f => f.key === metricaKey);
    if (!formula) return;
    if (kpis.some(k => k.label === formula.label)) { adicionarToast(`KPI "${formula.label}" j\u00e1 existe`, 'warning'); return; }
    let expr = formula.formula;
    const cPeso = detectarColuna(colunas, ['PESO TOTAL','PESO','TONELADA','PESOTOTAL']);
    const cKm = detectarColuna(colunas, ['KM TOTAL','KM','QUILOMETRO','KMTOTAL']);
    const cHora = detectarColuna(colunas, ['HORA SAIDA','HORA','HORASAIDA','TEMPO']);
    const cPlaca = detectarColuna(colunas, ['PLACA','CAMINHAO','VEICULO','COLETOR']);
    const cTipo = detectarColuna(colunas, ['CAMINHAO','TIPO CAMINHAO','TIPO_CAMINHAO','CAMINH\u00c3O']);
    expr = expr.replace(/PESO TOTAL/g, cPeso).replace(/KM TOTAL/g, cKm).replace(/HORA SAIDA/g, cHora).replace(/PLACA/g, cPlaca).replace(/CAMINHAO/g, cTipo);
    const usadas: string[] = [];
    if (formula.colunasUsadas.includes('PESO TOTAL')) usadas.push(cPeso);
    if (formula.colunasUsadas.includes('KM TOTAL')) usadas.push(cKm);
    if (formula.colunasUsadas.includes('HORA SAIDA')) usadas.push(cHora);
    if (formula.colunasUsadas.includes('PLACA')) usadas.push(cPlaca);
    if (formula.colunasUsadas.includes('CAMINHAO')) usadas.push(cTipo);
    const novo: KpiConfig = {
      nome: cPeso || colsNum[0]?.nome || '', label: formula.label,
      agregacao: 'sum' as KpiConfig['agregacao'], formato: formula.formato as KpiConfig['formato'],
      ativo: true, expressao: expr, colunasUsadas: usadas.filter(Boolean) as string[],
      valoresFixos: {} as Record<string, number>, descricao: formula.descricao,
      unidade: formula.unidade, categoria: formula.categoria, cor: formula.cor,
      meta: null, alerta: null,
    };
    const novos = [...kpis, novo]; setKpis(novos);
    adicionarToast(`\u2705 "${formula.label}" adicionado!`, 'success');
  }, [kpis, graficos, colunas, colsNum, adicionarToast]);

  const irPara = (e: 'upload' | 'indicadoresAuto' | 'revisao' | 'config') => {
    if (e === 'indicadoresAuto' && status.upload !== 'done') { adicionarToast('Fa\u00e7a upload primeiro', 'warning'); return; }
    if (e === 'revisao' && !temPlanilha) { adicionarToast('Fa\u00e7a upload primeiro', 'warning'); return; }
    if (e === 'config' && !temPlanilha) { adicionarToast('Fa\u00e7a upload primeiro', 'warning'); return; }
    setEtapa(e);
  };

  /* ═══ Render Upload ═══ */
  const renderUpload = () => {
    // ─── Modo validação: mostra preview da qualidade antes de importar ───
    if (modoValidacao) {
      return (
        <div>
          {/* Informação do arquivo selecionado */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.5rem 0.75rem', background: '#f8fafc',
            borderRadius: '8px', border: '1px solid #e2e8f0',
            marginBottom: '0.75rem',
          }}>
            <FiFileText size={18} style={{ color: '#6366f1' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1e293b' }}>
                {arquivoValidacao?.name || 'Arquivo selecionado'}
              </div>
              <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                {arquivoValidacao ? (arquivoValidacao.size / 1024).toFixed(1) + ' KB' : ''}
              </div>
            </div>
            {(validando || analisandoViagens || conferindoDiaria || gerandoPdfViagens || uploading) && (
              <div style={{
                width: '18px', height: '18px',
                border: '2px solid #e2e8f0', borderTopColor: '#6366f1',
                borderRadius: '50%', animation: 'spin 0.7s linear infinite',
              }} />
            )}
          </div>

          {(validando || analisandoViagens || conferindoDiaria || gerandoPdfViagens || uploading) && mensagemProcessamentoUpload() && (
            <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '0 0 0.5rem' }}>
              {mensagemProcessamentoUpload()}
            </p>
          )}

          {/* Preview de qualidade (coleta) ou resumo multi-modelo (roçada) */}
          {ehRocada && (validacaoData?.resumoRocada || validacaoData?.semColunaArea || (validacaoData?.linhasSemArea ?? 0) > 0) ? (
            <div style={{
              background: validacaoData?.podeImportar === false || validacaoData?.sucesso === false ? '#fff7ed' : '#f0fdf4',
              border: `1px solid ${validacaoData?.podeImportar === false || validacaoData?.sucesso === false ? '#fdba74' : '#86efac'}`,
              borderRadius: '10px',
              padding: '0.75rem 1rem', marginBottom: '0.5rem', fontSize: '0.78rem',
              color: validacaoData?.podeImportar === false || validacaoData?.sucesso === false ? '#9a3412' : '#166534',
            }}>
              <strong>
                {validacaoData?.podeImportar === false || validacaoData?.sucesso === false
                  ? 'Roçada — metragem obrigatória'
                  : `Modelo ${validacaoData.modelo || validacaoData.resumoRocada?.modelo}`}
              </strong>
              {validacaoData?.resumoRocada && (
                <div style={{ marginTop: '0.35rem', color: validacaoData?.sucesso === false ? '#c2410c' : '#15803d' }}>
                  {validacaoData.resumoRocada.registros} registro(s) com m² ·{' '}
                  {Number(validacaoData.resumoRocada.areaTotalM2 || 0).toLocaleString('pt-BR')} m² ·{' '}
                  {validacaoData.resumoRocada.dias} dia(s)
                  {Array.isArray(validacaoData.abasUsadas) && validacaoData.abasUsadas.length > 0 && (
                    <> · abas: {validacaoData.abasUsadas.join(', ')}</>
                  )}
                </div>
              )}
              {(validacaoData?.semColunaArea || (validacaoData?.linhasSemArea ?? 0) > 0) && (
                <div style={{
                  marginTop: '0.45rem', padding: '0.45rem 0.55rem', borderRadius: '8px',
                  background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', fontSize: '0.72rem',
                }}>
                  {validacaoData.semColunaArea
                    ? 'Não foi encontrada coluna de metragem/área (m²). Inclua METRAGEM, TOTAL (M²), Área ou EXECUTADO.'
                    : `${validacaoData.linhasSemArea} linha(s) sem m²/área — essas linhas não entram no dashboard.`}
                </div>
              )}
              {Array.isArray(validacaoData?.amostraSemArea) && validacaoData.amostraSemArea.length > 0 && (
                <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', color: '#b45309', fontSize: '0.7rem' }}>
                  {validacaoData.amostraSemArea.slice(0, 5).map((a: any, i: number) => (
                    <li key={i}>
                      Aba {a.aba}, linha {a.linha}
                      {a.bairro ? ` (${a.bairro})` : ''}
                      {a.data ? ` · ${a.data}` : ''}: {a.motivo}
                    </li>
                  ))}
                </ul>
              )}
              {Array.isArray(validacaoData.avisos) && validacaoData.avisos.length > 0 && (
                <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', color: '#b45309', fontSize: '0.72rem' }}>
                  {validacaoData.avisos.slice(0, 4).map((a: string, i: number) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <QualidadePlanilhaPreview
              dados={validacaoData}
              carregando={validando || analisandoViagens || conferindoDiaria || gerandoPdfViagens || uploading}
            />
          )}

          {uploading && (
            <div className="upload-progress" style={{ marginTop: '0.5rem' }}>
              <div className="upload-bar"><div className="upload-fill" style={{ width: `${uploadPct}%` }} /></div>
              <div className="upload-pct">
                {ehRocada ? `Importando registros de roçada... ${uploadPct}%` : `Importando viagens válidas... ${uploadPct}%`}
              </div>
            </div>
          )}

          {importacaoConcluida && resumoImportacao && (
            <div style={{
              background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px',
              padding: '0.6rem 0.75rem', marginTop: '0.5rem', fontSize: '0.75rem', color: '#166534',
            }}>
              <strong>Importação concluída.</strong>{' '}
              <span style={{ color: '#15803d' }}>
                {resumoImportacao.validasDashboard} viagem(ns) alimentam o dashboard.
              </span>
              {resumoImportacao.inconsistentes > 0 && (
                <span style={{ color: '#b45309', display: 'block', marginTop: '0.2rem' }}>
                  {resumoImportacao.inconsistentes} viagem(ns) inconsistente(s) ficaram fora dos cálculos. O PDF de saúde foi baixado automaticamente.
                </span>
              )}
              {resumoImportacao.inconsistentes === 0 && (
                <span style={{ color: '#15803d', display: 'block', marginTop: '0.2rem' }}>
                  PDF de saúde baixado automaticamente.
                </span>
              )}
            </div>
          )}

          {/* ─── Análise Viagem por Viagem (automática após seleção) ─── */}
          {!validando && validacaoData && validacaoData.sucesso && (
            <div style={{
              marginTop: '0.75rem',
              background: '#fff',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              padding: '0.75rem',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '0.5rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 700, color: '#1e293b' }}>
                  <FiSearch size={14} style={{ color: '#6366f1' }} />
                  <span>Relatório de Inconsistências {analisandoViagens ? '(analisando...)' : gerandoPdfViagens ? '(gerando PDF...)' : uploading ? '(importando...)' : ''}</span>
                </div>
                {!analisandoViagens && dadosViagens && (
                  <button
                    type="button"
                    onClick={handleAnalisarViagens}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                      padding: '0.35rem 0.7rem', fontSize: '0.68rem', fontWeight: 600,
                      background: '#f1f5f9', color: '#475569',
                      border: '1px solid #e2e8f0', borderRadius: '5px', cursor: 'pointer',
                    }}
                  >
                    <FiRefreshCw size={11} /> Reanalisar
                  </button>
                )}
              </div>

              {analisandoViagens && !dadosViagens && (
                <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '0.25rem 0 0.5rem' }}>
                  Verificando cada linha: KM (máx. 300), peso, horas, rota, placas e negativos...
                </p>
              )}

              {dadosViagens?.avisoDashboard && (
                <div style={{
                  background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px',
                  padding: '0.5rem 0.65rem', marginBottom: '0.5rem', fontSize: '0.72rem', color: '#92400e',
                }}>
                  {dadosViagens.avisoDashboard}
                </div>
              )}

              {dadosViagens && (dadosViagens.viagensIncompletas > 0 || (dadosViagens.viagensComValorNegativo ?? 0) > 0) && (
                <div style={{
                  background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px',
                  padding: '0.5rem 0.65rem', marginBottom: '0.5rem', fontSize: '0.72rem', color: '#1e40af',
                }}>
                  Regras do dashboard: <strong>KM ≤ 300</strong>, <strong>peso &gt; 0</strong>,{' '}
                  <strong>sem valores negativos</strong>, horas com <strong>:</strong> (não <strong>;</strong>).
                  Linhas fora dessas regras ficam importadas só para consulta, não nos KPIs.
                </div>
              )}

              {/* Resultados da análise */}
              {dadosViagens && (
                <div>
                  {/* Cards resumo — linhas vs soma contador vs viagens KPI */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '0.35rem',
                    marginBottom: '0.5rem',
                  }}>
                    <div style={{ background: '#f8fafc', borderRadius: '6px', padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>{dadosViagens.totalViagens || 0}</div>
                      <div style={{ fontSize: '0.58rem', color: '#64748b' }}>Linhas (rotas)</div>
                    </div>
                    <div style={{ background: '#eff6ff', borderRadius: '6px', padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#2563eb' }}>{dadosViagens.somaContadorViagens ?? '—'}</div>
                      <div style={{ fontSize: '0.58rem', color: '#1e40af' }}>Soma contador</div>
                    </div>
                    <div style={{ background: '#f0fdf4', borderRadius: '6px', padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#16a34a' }}>{dadosViagens.viagensCalculadasDashboard ?? dadosViagens.viagensCompletas ?? 0}</div>
                      <div style={{ fontSize: '0.58rem', color: '#166534' }}>Viagens KPI</div>
                    </div>
                    <div style={{ background: '#fef2f2', borderRadius: '6px', padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#dc2626' }}>{(dadosViagens.viagensInconsistentesTotal ?? dadosViagens.viagensIncompletas) || 0}</div>
                      <div style={{ fontSize: '0.58rem', color: '#991b1b' }}>Fora do dashboard</div>
                    </div>
                    {(dadosViagens.linhasSemContador ?? 0) > 0 && (
                      <div style={{ background: '#fffbeb', borderRadius: '6px', padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#d97706' }}>{dadosViagens.linhasSemContador}</div>
                        <div style={{ fontSize: '0.58rem', color: '#92400e' }}>Sem contador</div>
                      </div>
                    )}
                    <div style={{ background: '#f0f9ff', borderRadius: '6px', padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#2563eb' }}>{dadosViagens.percentualCompleto || 0}%</div>
                      <div style={{ fontSize: '0.58rem', color: '#1e40af' }}>% Válidas</div>
                    </div>
                  </div>

                  {dadosViagens.somaContadorViagens != null
                    && dadosViagens.viagensCalculadasDashboard != null
                    && dadosViagens.somaContadorViagens !== dadosViagens.viagensCalculadasDashboard && (
                    <div style={{
                      background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px',
                      padding: '0.45rem 0.65rem', marginBottom: '0.5rem', fontSize: '0.68rem', color: '#92400e',
                    }}>
                      Soma do CONTADOR DE VIAGENS ({dadosViagens.somaContadorViagens}) ≠ viagens calculadas ({dadosViagens.viagensCalculadasDashboard}) — linhas sem contador usam PESO 1–4 ou 1 viagem operacional.
                    </div>
                  )}

                  {(dadosViagens.linhasDescartadasSemDados ?? 0) > 0 && (
                    <div style={{
                      background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px',
                      padding: '0.45rem 0.65rem', marginBottom: '0.5rem', fontSize: '0.68rem', color: '#475569',
                    }}>
                      <strong>{dadosViagens.linhasDescartadasSemDados}</strong> linha(s) ignorada(s) — sem placa, KM Total e Peso Total (não entram no sistema).
                    </div>
                  )}

                  {(dadosViagens.resumoPlacas?.alerta) && (
                    <div style={{
                      background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px',
                      padding: '0.45rem 0.65rem', marginBottom: '0.5rem', fontSize: '0.68rem', color: '#991b1b',
                    }}>
                      <strong>Placas:</strong> {dadosViagens.resumoPlacas.alerta}
                    </div>
                  )}

                  {dadosViagens.conferenciaCadastro?.ativa && (
                    <div style={{
                      background: dadosViagens.conferenciaCadastro.temDivergencia ? '#fffbeb' : '#f0fdf4',
                      border: `1px solid ${dadosViagens.conferenciaCadastro.temDivergencia ? '#fde68a' : '#bbf7d0'}`,
                      borderRadius: '6px', padding: '0.45rem 0.65rem', marginBottom: '0.5rem',
                      fontSize: '0.68rem',
                      color: dadosViagens.conferenciaCadastro.temDivergencia ? '#92400e' : '#166534',
                    }}>
                      <strong>Cadastro × planilha:</strong> {dadosViagens.conferenciaCadastro.resumo}
                      {(['placas', 'motoristas', 'coletores'] as const).map((tipo) => {
                        const ent = dadosViagens.conferenciaCadastro[tipo];
                        if (!ent || ent.cadastroVazio) return null;
                        const label = tipo === 'placas' ? 'Placas' : tipo === 'motoristas' ? 'Motoristas' : 'Coletores';
                        const extras: string[] = [];
                        if (ent.soPlanilha.length) extras.push(`fora do cadastro: ${ent.soPlanilha.slice(0, 8).join(', ')}${ent.soPlanilha.length > 8 ? '…' : ''}`);
                        if (ent.soCadastro.length) extras.push(`cadastrado(s) ausente(s): ${ent.soCadastro.slice(0, 8).join(', ')}${ent.soCadastro.length > 8 ? '…' : ''}`);
                        if (!extras.length) return null;
                        return (
                          <div key={tipo} style={{ marginTop: '0.25rem' }}>
                            <strong>{label}:</strong> {extras.join(' · ')}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {dadosViagens && !dadosViagens.conferenciaCadastro?.ativa && (
                    <div style={{
                      background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px',
                      padding: '0.4rem 0.6rem', marginBottom: '0.5rem', fontSize: '0.65rem', color: '#64748b',
                    }}>
                      Cadastre placas, motoristas e coletores no contrato para conferir automaticamente com a planilha.
                    </div>
                  )}

                  {(dadosViagens.regrasSaude || []).length > 0 && (
                    <div style={{
                      background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px',
                      padding: '0.45rem 0.6rem', marginBottom: '0.5rem', fontSize: '0.62rem', color: '#475569',
                    }}>
                      <strong>Requisitos do dashboard:</strong>
                      <span style={{ marginLeft: '0.35rem' }}>
                        {(dadosViagens.regrasSaude as string[]).join(' · ')}
                      </span>
                    </div>
                  )}

                  {((dadosViagens.problemasDashboard || dadosViagens.problemasAgrupados || []).length > 0) && (
                    <div style={{ marginBottom: '0.5rem' }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#dc2626', marginBottom: '0.2rem' }}>
                        Fora do dashboard:
                      </div>
                      {(dadosViagens.problemasDashboard || dadosViagens.problemasAgrupados).map((p: any, i: number) => (
                        <div key={i} style={{
                          display: 'flex', justifyContent: 'space-between',
                          padding: '0.25rem 0.5rem', background: '#fef2f2',
                          borderRadius: '4px', marginBottom: '0.15rem',
                          fontSize: '0.65rem',
                        }}>
                          <span style={{ color: '#7f1d1d' }}>{p.tipo}</span>
                          <span style={{ fontWeight: 700, color: '#dc2626' }}>{p.quantidade} viagem(ns)</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Botão gerar PDF */}
                  <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                    <button
                      onClick={handleGerarPdfViagens}
                      disabled={gerandoPdfViagens}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                        padding: '0.35rem 0.7rem', fontSize: '0.68rem', fontWeight: 600,
                        background: gerandoPdfViagens ? '#e2e8f0' : '#dc2626',
                        color: gerandoPdfViagens ? '#94a3b8' : '#fff',
                        border: 'none', borderRadius: '5px', cursor: gerandoPdfViagens ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {gerandoPdfViagens ? (
                        <><div className="spin" style={{width:12,height:12,border:'2px solid #fca5a5',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.7s linear infinite'}} /> Gerando PDF...</>
                      ) : (
                        <><FiDownload size={11} /> Baixar PDF novamente</>
                      )}
                    </button>
                  </div>

                  {/* Preview das primeiras viagens incompletas */}
                  {dadosViagens.viagens && dadosViagens.viagens.length > 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                        Amostra — viagens fora do dashboard (até 10):
                      </div>
                      <div style={{ maxHeight: '180px', overflowY: 'auto', fontSize: '0.6rem' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#1e293b', color: '#fff' }}>
                              <th style={{ padding: '3px 5px', textAlign: 'left' }}>Linha</th>
                              <th style={{ padding: '3px 5px', textAlign: 'left' }}>Data</th>
                              <th style={{ padding: '3px 5px', textAlign: 'left' }}>Placa</th>
                              <th style={{ padding: '3px 5px', textAlign: 'left' }}>Motorista</th>
                              <th style={{ padding: '3px 5px', textAlign: 'left' }}>KM</th>
                              <th style={{ padding: '3px 5px', textAlign: 'left' }}>Peso</th>
                              <th style={{ padding: '3px 5px', textAlign: 'left' }}>Problemas</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(dadosViagens.viagens || []).filter((v: any) => !v.completa).slice(0, 10).map((v: any, i: number) => (
                              <tr key={i} style={{ borderBottom: '1px solid #e2e8f0', background: v.temValorNegativo ? '#fef2f2' : undefined }}>
                                <td style={{ padding: '3px 5px' }}>{v.linha}</td>
                                <td style={{ padding: '3px 5px' }}>{v.data || '—'}</td>
                                <td style={{ padding: '3px 5px' }}>{v.placa || '—'}</td>
                                <td style={{ padding: '3px 5px' }}>{v.motorista || '—'}</td>
                                <td style={{ padding: '3px 5px', color: !v.kmTotal && !v.kmTotalCalculado ? '#dc2626' : '#16a34a' }}>
                                  {v.kmTotal != null ? v.kmTotal : (v.kmTotalCalculado != null ? v.kmTotalCalculado + '*' : '—')}
                                </td>
                                <td style={{ padding: '3px 5px', color: v.pesoTotal == null || Number(v.pesoTotal) <= 0 ? '#dc2626' : '#16a34a' }}>
                                  {v.pesoTotal != null ? Number(v.pesoTotal).toFixed(1) : '—'}
                                </td>
                                <td style={{ padding: '3px 5px', color: '#b45309', fontSize: '0.55rem' }}>
                                  {(v.problemas || [])
                                    .filter((p: string) => !p.toLowerCase().includes('placa será unificada') && !p.toLowerCase().startsWith('corrigido automaticamente'))
                                    .join('; ') || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {dadosViagens.viagens.length > 10 && (
                        <div style={{ fontSize: '0.6rem', color: '#94a3b8', textAlign: 'center', marginTop: '0.15rem' }}>
                          + {dadosViagens.viagens.length - 10} viagens — veja o PDF completo
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── Conferência diária: planilha vs sistema ─── */}
          {!validando && !conferindoDiaria && conferenciaDiaria && (
            <div style={{
              marginTop: '0.75rem',
              background: conferenciaDiaria.temDivergencia ? '#fffbeb' : '#f0fdf4',
              borderRadius: '10px',
              border: `1px solid ${conferenciaDiaria.temDivergencia ? '#fde68a' : '#bbf7d0'}`,
              padding: '0.75rem',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.35rem',
                fontSize: '0.78rem', fontWeight: 700,
                color: conferenciaDiaria.temDivergencia ? '#92400e' : '#166534',
                marginBottom: '0.45rem',
              }}>
                <FiCheckCircle size={14} />
                Conferência diária — planilha vs sistema
              </div>
              <p style={{ fontSize: '0.68rem', color: '#475569', margin: '0 0 0.5rem' }}>
                {conferenciaDiaria.recomendacao}
                {conferenciaDiaria.ultimaDataSistema && (
                  <span style={{ display: 'block', marginTop: '0.2rem', color: '#64748b' }}>
                    Último dia no sistema: {conferenciaDiaria.ultimaDataSistema.split('-').reverse().join('/')}
                    {conferenciaDiaria.ultimaDataPlanilha && (
                      <> · Planilha até: {conferenciaDiaria.ultimaDataPlanilha.split('-').reverse().join('/')}</>
                    )}
                  </span>
                )}
              </p>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
                gap: '0.35rem', marginBottom: '0.55rem',
              }}>
                <div style={{ background: '#fff', borderRadius: '6px', padding: '0.35rem', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#16a34a' }}>{conferenciaDiaria.diasNovos}</div>
                  <div style={{ fontSize: '0.58rem', color: '#64748b' }}>Novos</div>
                </div>
                <div style={{ background: '#fff', borderRadius: '6px', padding: '0.35rem', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#2563eb' }}>{conferenciaDiaria.diasIguais}</div>
                  <div style={{ fontSize: '0.58rem', color: '#64748b' }}>Conferem</div>
                </div>
                <div style={{ background: '#fff', borderRadius: '6px', padding: '0.35rem', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#d97706' }}>{conferenciaDiaria.diasDivergentes}</div>
                  <div style={{ fontSize: '0.58rem', color: '#64748b' }}>Diferem</div>
                </div>
                {(conferenciaDiaria.diasSomenteSistema ?? 0) > 0 && (
                  <div style={{ background: '#fff', borderRadius: '6px', padding: '0.35rem', textAlign: 'center', border: '1px solid #c7d2fe' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#4f46e5' }}>{conferenciaDiaria.diasSomenteSistema}</div>
                    <div style={{ fontSize: '0.58rem', color: '#64748b' }}>Só no sistema</div>
                  </div>
                )}
                {conferenciaDiaria.diasBloqueados > 0 && (
                  <div style={{ background: '#fff', borderRadius: '6px', padding: '0.35rem', textAlign: 'center', border: '1px solid #fecaca' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#dc2626' }}>{conferenciaDiaria.diasBloqueados}</div>
                    <div style={{ fontSize: '0.58rem', color: '#64748b' }}>Bloqueados</div>
                  </div>
                )}
              </div>
              {(conferenciaDiaria.diasDivergentes > 0 || conferenciaDiaria.diasNovos > 0 || (conferenciaDiaria.diasSomenteSistema ?? 0) > 0) && (
                <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.62rem' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', position: 'sticky', top: 0 }}>
                        <th style={{ padding: '4px 6px', textAlign: 'left' }}>Data</th>
                        <th style={{ padding: '4px 6px', textAlign: 'center' }}>Status</th>
                        <th style={{ padding: '4px 6px', textAlign: 'left' }}>Planilha / Sistema</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conferenciaDiaria.dias
                        .filter(d => d.status !== 'igual')
                        .slice(0, 25)
                        .map((d) => {
                          const cor = d.status === 'novo' ? '#16a34a'
                            : d.status === 'divergente' ? '#d97706'
                            : d.status === 'somente_sistema' ? '#4f46e5'
                            : '#dc2626';
                          const lbl = d.status === 'novo' ? 'Novo'
                            : d.status === 'divergente' ? 'Diverge'
                            : d.status === 'somente_sistema' ? 'Preservar'
                            : 'Bloqueado';
                          return (
                            <tr key={d.data} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '3px 6px', fontWeight: 600 }}>{d.dataBr}</td>
                              <td style={{ padding: '3px 6px', textAlign: 'center', color: cor, fontWeight: 700 }}>{lbl}</td>
                              <td style={{ padding: '3px 6px', color: '#475569' }}>
                                {d.status === 'novo' && d.planilha ? (
                                  `${d.planilha.rotas} rotas · ${d.planilha.viagens} viagens`
                                ) : d.status === 'somente_sistema' && d.sistema ? (
                                  `${d.sistema.rotas} rotas · ${d.sistema.viagens} viagens (mantidos)`
                                ) : d.sistema && d.planilha ? (
                                  <>
                                    {d.diferencas.join(' · ') || `${d.planilha.viagens} vs ${d.sistema.viagens} viagens`}
                                  </>
                                ) : '—'}
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

          {/* Ações após validação + importação */}
          {!validando && !analisandoViagens && !conferindoDiaria && !uploading && validacaoData && validacaoData.sucesso && dadosViagens && (
            <div style={{
              display: 'flex', gap: '0.5rem', marginTop: '0.5rem',
              justifyContent: 'flex-end', flexWrap: 'wrap',
            }}>
              {!importacaoConcluida && arquivoValidacao && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => importarPlanilhaValidada(arquivoValidacao, dadosViagens)}
                  disabled={(conferenciaDiaria?.diasBloqueados ?? 0) > 0}
                  title={
                    (conferenciaDiaria?.diasBloqueados ?? 0) > 0
                      ? 'Há dias em ciclo fechado — não é possível importar'
                      : temPlanilha
                        ? 'Atualiza os dias da planilha, preserva dias só no sistema e remove a planilha antiga'
                        : 'Importar viagens válidas'
                  }
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    background: (conferenciaDiaria?.diasBloqueados ?? 0) > 0 ? '#94a3b8' : '#16a34a',
                    border: 'none', color: '#fff',
                    padding: '0.4rem 0.85rem', borderRadius: '6px',
                    fontSize: '0.75rem', fontWeight: 600,
                    cursor: (conferenciaDiaria?.diasBloqueados ?? 0) > 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <FiUpload size={12} />
                  Tentar importar novamente
                </button>
              )}
              <button
                className="btn btn-secondary btn-sm"
                onClick={limparValidacao}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                  padding: '0.4rem 0.85rem', borderRadius: '6px',
                  fontSize: '0.75rem', cursor: 'pointer',
                }}
              >
                {importacaoConcluida ? 'Fechar relatório' : 'Cancelar'}
              </button>
            </div>
          )}

          {/* Se houve erro na validação ou dados inválidos */}
          {!validando && validacaoData && !validacaoData.sucesso && (
            <div style={{
              display: 'flex', gap: '0.5rem', marginTop: '0.5rem',
              justifyContent: 'flex-end',
            }}>
              <button className="btn btn-secondary btn-sm" onClick={limparValidacao}>
                Voltar
              </button>
            </div>
          )}

          {/* Input oculto para re-selecionar (caso queira trocar) */}
          <input
            type="file" accept=".xlsx,.xls,.xlsm"
            ref={validacaoInputRef}
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleSelecionarPlanilha(f);
              if (e.target) e.target.value = '';
            }}
            style={{ display: 'none' }}
          />
        </div>
      );
    }

    // ─── Seleção de planilha → validação + relatório de viagens automático ───
    return (
      <div>
        <div className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleSelecionarPlanilha(f); }}
          onClick={() => { const el = document.createElement('input'); el.type = 'file'; el.accept = '.xlsx,.xls,.xlsm'; el.onchange = (ev: any) => { const f = ev?.target?.files?.[0]; if (f) handleSelecionarPlanilha(f); }; el.click(); }}
        >
          <div className="upload-zone-icon">{(validando || analisandoViagens || gerandoPdfViagens || uploading) ? <FiRefreshCw className="spin" /> : <FiShield />}</div>
          <p>{mensagemProcessamentoUpload() || 'Arraste ou clique para enviar a planilha'}</p>
          <small>
            {ehRocada
              ? '.xlsx, .xls, .xlsm — modelos Londrina, Pinda, QGIS, Betim e padrão (área m²)'
              : '.xlsx, .xls, .xlsm — valida, baixa PDF de saúde e importa viagens válidas'}
          </small>
        </div>
        <p style={{
          fontSize: '0.62rem', color: '#94a3b8', margin: '0.35rem 0 0',
          textAlign: 'center',
        }}>
          {ehRocada
            ? 'Roçada: detecta o modelo automaticamente, importa área (m²) por dia/bairro e atualiza o dashboard.'
            : 'Fluxo automático: validação → PDF de saúde → importação (KM≤300, peso > 0; só viagens válidas entram no dashboard).'}
        </p>
        {uploading && (
          <div className="upload-progress">
            <div className="upload-bar"><div className="upload-fill" style={{ width: `${uploadPct}%` }} /></div>
            <div className="upload-pct">{uploadPct}%</div>
          </div>
        )}
        {planilhas.length > 0 && (
          <div className="planilhas-lista">
            <p className="planilhas-titulo">Planilhas ({planilhas.length})</p>
            {planilhas.map(p => (
              <div key={p.id} className="planilha-item">
                <FiFileText size={14} className="planilha-icon" />
                <div className="planilha-info">
                  <div className="planilha-nome">{p.nomeArquivo}</div>
                  <div className="planilha-data">{new Date(p.criadoEm).toLocaleDateString('pt-BR')} &bull; {p.linhasImportadas}/{p.totalLinhas} linhas</div>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                  <button
                    className="planilha-qualidade"
                    onClick={() => { setQualidadeUploadId(p.id); setQualidadeAberta(true); }}
                    title="Ver relatório de qualidade"
                    style={{
                      background: 'none', border: '1px solid #cbd5e1', borderRadius: '4px',
                      padding: '0.2rem 0.35rem', cursor: 'pointer', color: '#64748b',
                      fontSize: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.15rem',
                      fontWeight: 600,
                    }}
                  >
                    <FiSearch size={9} /> Qualidade
                  </button>
                  <button
                    type="button"
                    className="planilha-excluir"
                    onClick={() => excluirPlanilha(p.id)}
                    disabled={excluindoPlanilhaId === p.id}
                    title="Excluir planilha e registros importados"
                  >
                    {excluindoPlanilhaId === p.id ? <FiRefreshCw size={12} className="spin" /> : <FiTrash2 size={12} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <RelatorioQualidade
          uploadId={qualidadeUploadId}
          aberto={qualidadeAberta}
          onFechar={() => { setQualidadeAberta(false); setQualidadeUploadId(null); }}
        />
      </div>
    );
  };

  /* ═══ Render Indicadores Automáticos ═══ */
  const renderIndicadoresAuto = () => {
    if (!tipoServico) {
      return (
        <div>
          <div style={{ background: '#fefce8', borderRadius: '8px', border: '1px solid #fde68a', padding: '0.5rem 0.75rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: '#92400e' }}>
            <FiAlertCircle size={16} />
            <span><strong>Tipo de servico nao definido.</strong> Defina o tipo nas configuracoes do servico para acessar os KPIs da Biblioteca Universal.</span>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', marginTop: '0.5rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={handleAutoSkip}>Pular esta etapa</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEtapa('upload')}>Voltar</button>
          </div>
        </div>
      );
    }
    return (
      <div>
        <div style={{ background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', padding: '0.5rem 0.75rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: '#15803d' }}>
          <FiZap size={16} />
          <span><strong>Planilha processada!</strong> {totalImportados.toLocaleString('pt-BR')} linhas importadas. Selecione os KPIs da Biblioteca Universal que deseja ativar para este servico.</span>
        </div>
        <KpiUniversalActivator
          tipoServico={tipoServico} servicoId={servicoId} servicoNome={servicoNome}
          token={token} kpisJaAtivos={kpisUniversalIds}
          onClose={() => setEtapa('upload')}
          onConfirm={(kpisAtivados) => {
            if (kpisAtivados.length > 0) {
              const novosKpisUniversal: KpiConfig[] = kpisAtivados.map((k: any) => ({
                nome: k.nome, label: k.label, expressao: k.expressao,
                agregacao: (k.agregacao || 'sum') as KpiConfig['agregacao'],
                formato: (k.formato || 'numero') as KpiConfig['formato'],
                unidade: k.unidade, categoria: k.categoria, cor: k.cor,
                descricao: k.descricao, meta: k.meta, ativo: true,
                valoresFixos: {} as Record<string, number>, colunasUsadas: [] as string[],
                origemUniversal: k.origemUniversal, placeholdersNaoResolvidos: k.placeholdersNaoResolvidos,
              }));
              const novosKpis = [...kpis, ...novosKpisUniversal]; setKpis(novosKpis);
              setStatus(prev => ({ ...prev, indicadoresAuto: 'done', config: novosKpis.filter(k => k.ativo !== false).length > 0 ? 'done' : 'pending' }));
              setEtapa('revisao'); salvarConfig(novosKpis, graficos);
              adicionarToast(`${kpisAtivados.length} KPI(s) da biblioteca ativado(s)!`, 'success');
            } else handleAutoSkip();
          }}
        />
      </div>
    );
  };

  /* ═══ Render Revisão ═══ */
  const renderRevisao = () => {
    if (loadingDados) return <div className="skeleton-flow"><div className="skeleton" style={{ height: 60 }} /><div className="skeleton" style={{ height: 60, marginTop: 8 }} /></div>;
    if (!temPlanilha) return <div className="empty-state"><p>Nenhuma planilha.</p></div>;
    return (
      <div>
        <div className="estat-grid">
          <div className="estat-card"><div className="estat-valor">{totalLinhas.toLocaleString('pt-BR')}</div><div className="estat-label">Total</div></div>
          <div className="estat-card"><div className="estat-valor">{totalImportados.toLocaleString('pt-BR')}</div><div className="estat-label">Importados</div></div>
          <div className="estat-card"><div className="estat-valor">{colunas.length}</div><div className="estat-label">Colunas</div></div>
        </div>
        {kpisAutomaticos.length > 0 && (
          <div style={{ background: '#f0fdf4', borderRadius: '6px', border: '1px solid #bbf7d0', padding: '0.35rem 0.6rem', marginBottom: '0.5rem', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#15803d' }}>
            <FiZap size={13} />
            <span>{kpisAutomaticos.length} indicador(es) autom\u00e1tico(s) criados e {graficos.filter(g => g.automatico).length} gr\u00e1fico(s)</span>
          </div>
        )}
        <table className="colunas-table">
          <thead><tr><th>Coluna</th><th>Tipo</th><th>\u00danicos</th><th>Amostras</th></tr></thead>
          <tbody>{colunas.map((c, i) => (
            <tr key={i}>
              <td style={{ fontWeight: 600 }}>{c.nome}</td>
              <td>
                <select className="tipo-select" value={c.tipo} onChange={e => alterarTipo(c.nome, e.target.value)}
                  style={{ color: c.tipo === 'numero' ? '#0369a1' : c.tipo === 'data' ? '#b45309' : c.tipo === 'hora' ? '#7c3aed' : '#64748b' }}>
                  <option value="numero">N\u00famero</option><option value="texto">Texto</option><option value="data">Data</option><option value="hora">Hora</option><option value="desconhecido">?</option>
                </select>
              </td>
              <td style={{ color: '#94a3b8' }}>{c.valoresUnicos}</td>
              <td style={{ color: '#94a3b8', fontSize: '0.68rem' }}>{(c.amostras || []).slice(0, 3).join(', ') || '\u2014'}</td>
            </tr>
          ))}</tbody>
        </table>
        {dados.length > 0 && (
          <div className="previa-area">
            <h5>Primeiras {Math.min(dados.length, 5)} linhas</h5>
            <div className="previa-wrapper">
              <table className="previa-table">
                <thead><tr>{Object.keys(dados[0]).slice(0, 6).map(k => <th key={k}>{k}</th>)}</tr></thead>
                <tbody>{dados.slice(0, 5).map((r, i) => (
                  <tr key={i}>{Object.keys(dados[0]).slice(0, 6).map(k => <td key={k} title={String(r[k] ?? '')}>{r[k] != null ? String(r[k]).substring(0, 18) : '\u2014'}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ═══════════════════════════════════════════════════
     RENDER CONFIG — NOVO LAYOUT
     KPIs e Gráficos com design melhorado
     ═══════════════════════════════════════════════════ */
  const renderConfig = () => {
    if (!temPlanilha) return <div className="empty-state"><p>Fa\u00e7a upload primeiro.</p></div>;

    const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
      <span onClick={(e) => { e.stopPropagation(); onChange(); }}
        style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', width: 34, height: 19, borderRadius: 10, background: checked ? '#6366f1' : '#cbd5e1', padding: 2, transition: 'background 0.15s', flexShrink: 0, position: 'relative' }}>
        <span style={{ width: 15, height: 15, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'transform 0.15s', transform: checked ? 'translateX(15px)' : 'translateX(0)' }} />
      </span>
    );

    const kpisUniversais = kpis.filter(k => (k as any).origemUniversal);
    const kpisAutomaticos = kpis.filter(k => (k as any).automatico && !(k as any).origemUniversal);
    const kpisManuais = kpis.filter(k => !(k as any).automatico && !(k as any).origemUniversal);
    const kpisAtivos = kpis.filter(k => k.ativo !== false);

    // ─── Render Faturamento ───
    const renderFaturamento = () => {
      const cfg = configFaturamento || {
        tipoCobranca: '',
        valorTonelada: null,
        valorMini: null,
        valorTruck: null,
        valorToco: null,
        valorBasculante: null,
        valorKmLinear: null,
        valorM2: null,
        valorPorArvore: null,
        valorPorUnidade: null,
        colunaQuantidade: '',
        colunaTipoCaminhao: '',
        ativo: false,
      };

      const setCfg = (updates: Partial<typeof cfg>) => {
        setConfigFaturamento(prev => ({ ...(prev || cfg), ...updates }));
      };

      const TIPOS_COBRANCA = [
        { value: 'tonelada_tipo_caminhao', label: 'Por Tonelada + Tipo de Caminhão', desc: 'Calcula receita com base no peso e tipo de caminhão (Mini, Truck, Toco, Basculante)' },
        { value: 'km_linear', label: 'KM Linear', desc: 'Calcula receita com base na quilometragem rodada' },
        { value: 'm2', label: 'Metro Quadrado (m²)', desc: 'Calcula receita com base na área em m²' },
        { value: 'por_arvore', label: 'Por Árvore', desc: 'Calcula receita por quantidade de árvores podadas' },
        { value: 'por_unidade', label: 'Por Unidade', desc: 'Calcula receita por unidade genérica' },
      ];

      const colunasNum = colsNum.map(c => c.nome);
      const colunasTexto = colsText.map(c => c.nome);

      return (
        <div className="kpi-sub-content">
          {/* Header com descrição */}
          <div className="metricas-header" style={{ gap: '0.5rem' }}>
            <FiDollarSign size={16} style={{ color: '#f59e0b' }} />
            <span>
              Configure como o <strong>faturamento</strong> deste serviço é calculado.
              {cfg.ativo ? (
                <span style={{ color: '#16a34a', fontWeight: 600, marginLeft: '0.4rem' }}>✓ Ativo</span>
              ) : (
                <span style={{ color: '#94a3b8', marginLeft: '0.4rem' }}>— Inativo (usará valores do contrato)</span>
              )}
            </span>
          </div>

          {/* Card principal de configuração */}
          <div style={{
            background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0',
            padding: '0.85rem', marginBottom: '0.75rem',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          }}>
            {/* Ativar/Desativar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: '0.75rem', paddingBottom: '0.6rem',
              borderBottom: '1px solid #f1f5f9',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <strong style={{ fontSize: '0.82rem', color: '#1e293b' }}>
                  Configuração de Faturamento
                </strong>
                <span style={{ fontSize: '0.62rem', color: '#64748b' }}>
                  (substitui os valores do contrato para este serviço)
                </span>
              </div>
              <Toggle
                checked={cfg.ativo}
                onChange={() => setCfg({ ativo: !cfg.ativo })}
              />
            </div>

            {/* Tipo de Cobrança */}
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: '0.3rem' }}>
                Tipo de Cobrança
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
                {TIPOS_COBRANCA.map(tc => (
                  <div
                    key={tc.value}
                    onClick={() => setCfg({ tipoCobranca: tc.value, ativo: true })}
                    style={{
                      padding: '0.5rem 0.6rem', borderRadius: '7px', cursor: 'pointer',
                      border: cfg.tipoCobranca === tc.value ? '2px solid #6366f1' : '1px solid #e2e8f0',
                      background: cfg.tipoCobranca === tc.value ? '#eef2ff' : '#fff',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: cfg.tipoCobranca === tc.value ? '#4338ca' : '#1e293b' }}>
                      {tc.label}
                    </div>
                    <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: '0.15rem', lineHeight: '1.3' }}>
                      {tc.desc}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Campos específicos por tipo de cobrança */}
            {cfg.tipoCobranca === 'tonelada_tipo_caminhao' && (
              <div>
                <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: '0.3rem' }}>
                  Valores por Tipo de Caminhão (R$/tonelada)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                  <div className="valor-input-group">
                    <label>Mini</label>
                    <input type="number" step="0.01" min="0" placeholder="0,00"
                      value={cfg.valorMini ?? ''}
                      onChange={e => setCfg({ valorMini: e.target.value ? Number(e.target.value) : null })}
                    />
                  </div>
                  <div className="valor-input-group">
                    <label>Truck</label>
                    <input type="number" step="0.01" min="0" placeholder="0,00"
                      value={cfg.valorTruck ?? ''}
                      onChange={e => setCfg({ valorTruck: e.target.value ? Number(e.target.value) : null })}
                    />
                  </div>
                  <div className="valor-input-group">
                    <label>Toco</label>
                    <input type="number" step="0.01" min="0" placeholder="0,00"
                      value={cfg.valorToco ?? ''}
                      onChange={e => setCfg({ valorToco: e.target.value ? Number(e.target.value) : null })}
                    />
                  </div>
                  <div className="valor-input-group">
                    <label>Basculante</label>
                    <input type="number" step="0.01" min="0" placeholder="0,00"
                      value={cfg.valorBasculante ?? ''}
                      onChange={e => setCfg({ valorBasculante: e.target.value ? Number(e.target.value) : null })}
                    />
                  </div>
                </div>
                <div style={{
                  marginTop: '0.55rem', padding: '0.5rem 0.65rem',
                  background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px',
                  fontSize: '0.72rem', color: '#166534', lineHeight: 1.45,
                }}>
                  <FiInfo size={12} style={{ marginRight: '0.25rem', verticalAlign: '-2px' }} />
                  Cada viagem usa o valor de <strong>Mini</strong>, <strong>Truck</strong>, <strong>Toco</strong> ou <strong>Basculante</strong>
                  conforme o tipo de caminhão na planilha
                  {cfg.colunaTipoCaminhao ? (
                    <> (coluna: <strong>{cfg.colunaTipoCaminhao}</strong>)</>
                  ) : (
                    <> — selecione a coluna do tipo abaixo</>
                  )}.
                </div>
                <details style={{ marginTop: '0.45rem', fontSize: '0.72rem', color: '#64748b' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Valor padrão (opcional)</summary>
                  <p style={{ margin: '0.35rem 0 0.3rem', lineHeight: 1.4 }}>
                    Só é usado quando o tipo da viagem não for identificado como Mini, Truck, Toco ou Basculante.
                  </p>
                  <div className="valor-input-group" style={{ maxWidth: 220 }}>
                    <label>Fallback R$/tonelada</label>
                    <input type="number" step="0.01" min="0" placeholder="0,00"
                      value={cfg.valorTonelada ?? ''}
                      onChange={e => setCfg({ valorTonelada: e.target.value ? Number(e.target.value) : null })}
                    />
                  </div>
                </details>
              </div>
            )}

            {cfg.tipoCobranca === 'km_linear' && (
              <div>
                <div className="valor-input-group" style={{ maxWidth: '200px' }}>
                  <label>Valor por KM (R$)</label>
                  <input type="number" step="0.01" min="0" placeholder="0,00"
                    value={cfg.valorKmLinear ?? ''}
                    onChange={e => setCfg({ valorKmLinear: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
              </div>
            )}

            {cfg.tipoCobranca === 'm2' && (
              <div>
                <div className="valor-input-group" style={{ maxWidth: '200px' }}>
                  <label>Valor por m² (R$)</label>
                  <input type="number" step="0.01" min="0" placeholder="0,00"
                    value={cfg.valorM2 ?? ''}
                    onChange={e => setCfg({ valorM2: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
              </div>
            )}

            {cfg.tipoCobranca === 'por_arvore' && (
              <div>
                <div className="valor-input-group" style={{ maxWidth: '200px' }}>
                  <label>Valor por Árvore (R$)</label>
                  <input type="number" step="0.01" min="0" placeholder="0,00"
                    value={cfg.valorPorArvore ?? ''}
                    onChange={e => setCfg({ valorPorArvore: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
              </div>
            )}

            {cfg.tipoCobranca === 'por_unidade' && (
              <div>
                <div className="valor-input-group" style={{ maxWidth: '200px' }}>
                  <label>Valor por Unidade (R$)</label>
                  <input type="number" step="0.01" min="0" placeholder="0,00"
                    value={cfg.valorPorUnidade ?? ''}
                    onChange={e => setCfg({ valorPorUnidade: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
              </div>
            )}

            {/* Coluna da planilha */}
            <div style={{ marginTop: '0.75rem', paddingTop: '0.6rem', borderTop: '1px solid #f1f5f9' }}>
              <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: '0.3rem' }}>
                Coluna da Planilha (Quantidade)
              </label>
              <select
                value={cfg.colunaQuantidade}
                onChange={e => setCfg({ colunaQuantidade: e.target.value })}
                style={{
                  width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px',
                  border: '1px solid #d1d5db', fontSize: '0.8rem', background: '#fff',
                }}
              >
                <option value="">— Selecione a coluna com a quantidade —</option>
                {colunasNum.map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
              {temPlanilha && !cfg.colunaQuantidade && (
                <p style={{ fontSize: '0.62rem', color: '#f59e0b', marginTop: '0.2rem' }}>
                  Selecione qual coluna numérica representa a quantidade (peso, km, área, etc.)
                </p>
              )}
              {!temPlanilha && (
                <p style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                  Faça upload de uma planilha primeiro para ver as colunas disponíveis.
                </p>
              )}

              {/* Coluna de tipo de caminhão (quando aplicável) */}
              {cfg.tipoCobranca === 'tonelada_tipo_caminhao' && (
                <div style={{ marginTop: '0.5rem' }}>
                  <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: '0.3rem' }}>
                    Coluna do Tipo de Caminhão
                  </label>
                  <select
                    value={cfg.colunaTipoCaminhao}
                    onChange={e => setCfg({ colunaTipoCaminhao: e.target.value })}
                    style={{
                      width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px',
                      border: '1px solid #d1d5db', fontSize: '0.8rem', background: '#fff',
                    }}
                  >
                    <option value="">— Selecione a coluna com o tipo —</option>
                    {colunasTexto.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                  <p style={{ fontSize: '0.62rem', color: '#64748b', marginTop: '0.2rem' }}>
                    Coluna que identifica o tipo de caminhão (Mini, Truck, Toco, etc.)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Ações */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            gap: '0.5rem',
          }}>
            <button
              onClick={() => setConfigFaturamento(null)}
              style={{
                padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.72rem',
                fontWeight: 600, border: '1px solid #e2e8f0', background: '#fff',
                color: '#64748b', cursor: 'pointer',
              }}
            >
              Limpar
            </button>
            <button
              onClick={salvarConfigFaturamento}
              disabled={faturamentoSaving}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.4rem 0.9rem', borderRadius: '6px', fontSize: '0.75rem',
                fontWeight: 700, border: 'none', cursor: faturamentoSaving ? 'wait' : 'pointer',
                background: faturamentoSalvo ? '#22c55e' : '#6366f1',
                color: '#fff',
                opacity: faturamentoSaving ? 0.6 : 1,
              }}
            >
              <FiSave size={13} />
              {faturamentoSalvo ? '✓ Salvo' : faturamentoSaving ? 'Salvando...' : 'Salvar Configuração'}
            </button>
          </div>
        </div>
      );
    };

    function renderKpiCard(kpi: KpiConfig, index: number) {
      const ehUniversal = !!(kpi as any).origemUniversal;
      const ehAuto = !!(kpi as any).automatico && !ehUniversal;

      return (
        <div key={index} className={`kpi-card-item ${ehUniversal ? 'universal' : ''} ${ehAuto ? 'auto' : ''} ${kpi.ativo ? '' : 'inativo'}`}>
          <div className="kpi-card-row1">
            <Toggle checked={kpi.ativo}
              onChange={() => { const nk = kpis.map((k, j) => j === index ? { ...k, ativo: !k.ativo } : k); setKpis(nk); }}
            />
            <input value={kpi.label}
              onChange={e => { const nk = kpis.map((k, j) => j === index ? { ...k, label: e.target.value } : k); setKpis(nk); }}
              className="kpi-card-nome-input" placeholder="Nome do indicador"
            />
            <span className="kpi-card-badge">
              {ehUniversal ? 'Biblioteca' : ehAuto ? 'Auto' : 'Manual'}
            </span>
            <select value={kpi.formato}
              onChange={e => { const nk = kpis.map((k, j) => j === index ? { ...k, formato: e.target.value as any } : k); setKpis(nk); }}
              className="kpi-card-formato-select"
            >
              <option value="numero">No</option>
              <option value="moeda">R$</option>
              <option value="porcentagem">%</option>
            </select>
            <button className="btn-icon btn-icon-danger" onClick={() => { const nk = kpis.filter((_, j) => j !== index); setKpis(nk); }} title="Remover">
              <FiTrash2 size={11} />
            </button>
          </div>
          <div className="kpi-card-row2">
            <div className="kpi-card-expressao-wrapper">
              <input value={kpi.expressao || ''}
                onChange={e => { const nk = kpis.map((k, j) => j === index ? { ...k, expressao: e.target.value } : k); setKpis(nk); }}
                placeholder="Expressao: SUM(PESO TOTAL) / 1000" className="kpi-card-expressao-input"
              />
              {kpi.expressao && (
                <button className="btn-testar-kpi" onClick={async () => {
                  try {
                    const valoresFixos = buildValoresFixosFromConfigFaturamento(
                      configFaturamento?.ativo ? configFaturamento : null
                    );
                    const d = await servicoService.getKpiPreview(contractId, servicoId, {
                      expressao: kpi.expressao,
                      valoresFixos: { ...valoresFixos, ...(kpi.valoresFixos || {}) },
                    });
                    adicionarToast(d.valor != null ? `Preview: ${d.valor}` : 'Sem dados', d.valor != null ? 'success' : 'warning');
                  } catch {}
                }} title="Testar expressao"><FiRefreshCw size={10} /> Testar</button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="kpi-config-container">
        {/* Auto-save */}
        <div className="auto-save-status" style={{ fontSize: '0.65rem', color: autoSave === 'saving' ? '#b45309' : autoSave === 'saved' ? '#15803d' : '#94a3b8', marginBottom: '0.5rem', textAlign: 'right' }}>
          {autoSave === 'saving' && <>Salvando...</>}
          {autoSave === 'saved' && <>Salvo</>}
          {autoSave === 'idle' && kpisAtivos.length > 0 && <>Auto-save ativo</>}
        </div>

        {/* SUB-ABAS */}
        <div className="config-tabs-modern">
          <button className={`config-tab-modern ${subTab === 'indicadores' ? 'active' : ''}`} onClick={() => setSubTab('indicadores')}>
            <FiBarChart2 size={13} /> <span>Indicadores</span> <span className="tab-badge">{kpisAtivos.length}</span>
          </button>
          <button className={`config-tab-modern ${subTab === 'metricas' ? 'active' : ''}`} onClick={() => setSubTab('metricas')}>
            <FiDatabase size={13} /> <span>Metricas Rapidas</span>
          </button>
          <button className={`config-tab-modern ${subTab === 'graficos' ? 'active' : ''}`} onClick={() => setSubTab('graficos')}>
            <FiBarChart2 size={13} /> <span>Graficos</span> <span className="tab-badge">{graficos.filter(g => g.ativo).length}</span>
          </button>
          <button className={`config-tab-modern ${subTab === 'faturamento' ? 'active' : ''}`} onClick={() => setSubTab('faturamento')}>
            <FiDollarSign size={13} /> <span>Faturamento</span> <span className={`tab-badge ${configFaturamento?.ativo ? '' : 'inativo'}`}>{configFaturamento?.ativo ? 'Ativo' : 'Config'}</span>
          </button>
        </div>

        {/* ════ INDICADORES ════ */}
        {subTab === 'indicadores' && (
          <div className="kpi-sub-content">
            {/* Barra de acoes */}
            <div className="kpi-actions-bar">
              <button className="btn btn-primary btn-sm" onClick={() => {
                const novo: KpiConfig = {
                  nome: colsNum[0]?.nome || '', label: 'Novo KPI',
                  agregacao: 'sum' as KpiConfig['agregacao'], formato: 'numero' as KpiConfig['formato'],
                  ativo: true, expressao: '', colunasUsadas: [] as string[],
                  valoresFixos: {} as Record<string, number>, descricao: '', unidade: '', categoria: '', cor: '#6366f1',
                  meta: null, alerta: null,
                };
                const nk = [...kpis, novo]; setKpis(nk);
              }}>
                <FiBarChart2 size={13} /> Novo KPI Manual
              </button>
              <button className="btn-biblioteca-toggle" onClick={handleToggleBiblioteca}>
                <FiBook size={12} />
                <span>{bibliotecaAberta ? 'Fechar Biblioteca' : 'Biblioteca Universal'}</span>
                <span className="bib-toggle-count">{kpisUniversalIds.length}</span>
              </button>
              {kpisAtivos.length > 0 && <span className="kpi-total-badge">{kpisAtivos.length} ativo(s)</span>}
            </div>

            {/* BIBLIOTECA UNIVERSAL — painel visível */}
            {bibliotecaAberta && (
              <div className="kpi-biblioteca-panel">
                <div className="bib-header">
                  <FiBook size={13} />
                  <span>Biblioteca Universal de KPIs</span>
                  {tipoServico && (
                    <span className="bib-tipo">
                      {(TIPOS_SERVICO_LABELS as any)[tipoServico] || tipoServico.replace(/_/g, ' ')}
                    </span>
                  )}
                  <span className="bib-count">{kpisUniversaisInline.length} disponíveis</span>
                  <span className="bib-ativos">{kpisUniversaisInlineIds.size} selecionados</span>
                </div>
                <div className="bib-toolbar">
                  <button type="button" className="bib-toolbar-btn" onClick={selecionarTodosBiblioteca}>
                    Selecionar todos
                  </button>
                  <button type="button" className="bib-toolbar-btn bib-toolbar-btn-muted" onClick={limparSelecaoBiblioteca}>
                    Limpar
                  </button>
                  <span className="bib-toolbar-info">
                    {kpisUniversaisInlineIds.size} de {kpisUniversaisInline.length} marcados
                  </span>
                </div>
                {carregandoKpisInline ? (
                  <div style={{ padding: '0.75rem' }}>
                    <div className="skeleton" style={{ height: 36, marginBottom: 6 }} />
                    <div className="skeleton" style={{ height: 36, marginBottom: 6 }} />
                    <div className="skeleton" style={{ height: 36 }} />
                  </div>
                ) : kpisUniversaisInline.length === 0 ? (
                  <div className="bib-empty">
                    {tipoServico
                      ? 'Nenhum KPI universal para este tipo de serviço.'
                      : 'Nenhum KPI universal cadastrado. Defina o tipo do serviço para filtrar.'}
                  </div>
                ) : (
                  <div className="bib-lista bib-lista-checkboxes">
                    {kpisUniversaisInline.map(kpiU => {
                      const selecionado = kpisUniversaisInlineIds.has(kpiU.id);
                      return (
                        <label
                          key={kpiU.id}
                          className={`bib-checkbox-item ${selecionado ? 'selecionado' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={selecionado}
                            onChange={() => toggleKpiUniversal(kpiU, selecionado)}
                            style={{ marginTop: '0.15rem', accentColor: kpiU.cor || '#6366f1', flexShrink: 0 }}
                          />
                          <div className="bib-checkbox-body">
                            <div className="bib-item-nome">
                              <span className="bib-item-cor" style={{ background: kpiU.cor || '#6366f1' }} />
                              <strong>{kpiU.label}</strong>
                              {kpiU.unidade && (
                                <span className="bib-item-unidade">{kpiU.unidade}</span>
                              )}
                              <span className="bib-item-categoria">{kpiU.categoria}</span>
                            </div>
                            <code className="bib-item-formula">{kpiU.formula || kpiU.expressao}</code>
                            {kpiU.descricao && (
                              <div className="bib-item-desc">{kpiU.descricao}</div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Estado vazio */}
            {kpisAtivos.length === 0 && !bibliotecaAberta && (
              <div className="kpi-empty-state">
                <div className="kpi-empty-icon"><FiBarChart2 size={28} /></div>
                <h4>Nenhum indicador configurado</h4>
                <p>Abra a <strong>Biblioteca Universal</strong> acima ou clique em <strong>Novo KPI Manual</strong>.</p>
              </div>
            )}

            {/* KPIs Universais */}
            {kpisUniversais.length > 0 && (
              <div className="kpi-secao">
                <div className="kpi-secao-titulo">
                  <FiBook size={12} style={{ color: '#6366f1' }} />
                  <span>KPIs da Biblioteca Universal</span>
                  <span className="kpi-secao-count">{kpisUniversais.length}</span>
                </div>
                {kpisUniversais.map((kpi, _) => renderKpiCard(kpi, kpis.indexOf(kpi)))}
              </div>
            )}

            {/* KPIs Automaticos */}
            {kpisAutomaticos.length > 0 && (
              <div className="kpi-secao">
                <div className="kpi-secao-titulo" style={{ borderLeftColor: '#22c55e' }}>
                  <FiZap size={12} style={{ color: '#22c55e' }} />
                  <span>Indicadores Automaticos</span>
                  <span className="kpi-secao-count">{kpisAutomaticos.length}</span>
                </div>
                {kpisAutomaticos.map((kpi, _) => renderKpiCard(kpi, kpis.indexOf(kpi)))}
              </div>
            )}

            {/* KPIs Customizados */}
            {kpisManuais.length > 0 && (
              <div className="kpi-secao">
                <div className="kpi-secao-titulo" style={{ borderLeftColor: '#f59e0b' }}>
                  <FiBarChart2 size={12} style={{ color: '#f59e0b' }} />
                  <span>KPIs Customizados</span>
                  <span className="kpi-secao-count">{kpisManuais.length}</span>
                </div>
                {kpisManuais.map((kpi, _) => renderKpiCard(kpi, kpis.indexOf(kpi)))}
              </div>
            )}
          </div>
        )}

        {/* ════ METRICAS RAPIDAS ════ */}
        {subTab === 'metricas' && (
          <div className="kpi-sub-content">
            <div className="metricas-header">
              <FiDatabase size={14} />
              <span>Metricas calculadas automaticamente a partir dos dados importados</span>
            </div>
            {loadingExec ? (
              <div className="skeleton-flow" style={{ padding: 0 }}>
                <div className="skeleton" style={{ height: 50 }} />
                <div className="skeleton" style={{ height: 50, marginTop: 6 }} />
              </div>
            ) : execMetrics ? (
              <div className="metricas-grid-modern">
                {FORMULAS_RESUMO_EXECUTIVO.filter(f => f.tipo === 'primaria' || f.tipo === 'secundaria').map(f => {
                  const valor = obterValorMetrica(f.key, execMetrics);
                  const existe = kpis.some(k => k.label === f.label);
                  return (
                    <div key={f.key} className={`metrica-card-modern ${existe ? 'criado' : ''}`}>
                      <div className="metrica-card-left">
                        <span className="metrica-dot" style={{ background: f.cor }} />
                        <div>
                          <div className="metrica-label-modern">{f.label}</div>
                          <div className="metrica-valor-modern">{valor}</div>
                        </div>
                      </div>
                      <button className={`btn-metrica-kpi ${existe ? 'criado' : ''}`}
                        onClick={() => handleCriarKpi(f.key)} disabled={existe}
                        title={existe ? 'Ja criado como KPI' : 'Criar KPI a partir desta metrica'}
                      >
                        {existe ? <><FiCheck size={11} /> KPI Criado</> : <><FiCopy size={11} /> Criar KPI</>}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state"><p>Metricas indisponiveis. Faca upload de uma planilha primeiro.</p></div>
            )}
          </div>
        )}

        {/* ════ GRAFICOS ════ */}
        {subTab === 'graficos' && (
          <div className="kpi-sub-content">
            <div className="kpi-actions-bar">
              <button className="btn btn-primary btn-sm" onClick={() => {
                const ng = [...graficos, {
                  tipo: 'barra' as const, titulo: 'Novo Grafico',
                  eixoX: colsText[0]?.nome || '', eixoY: colsNum[0]?.nome || '', ativo: true,
                }];
                setGraficos(ng);
              }}>
                <FiBarChart2 size={13} /> Novo Grafico
              </button>
              {graficos.filter(g => g.ativo).length > 0 && (
                <span className="kpi-total-badge">{graficos.filter(g => g.ativo).length} grafico(s)</span>
              )}
            </div>

            {graficos.filter(g => g.ativo).length === 0 ? (
              <div className="kpi-empty-state">
                <div className="kpi-empty-icon"><FiBarChart2 size={28} /></div>
                <h4>Nenhum grafico configurado</h4>
                <p>Clique em <strong>Novo Grafico</strong> para criar uma visualizacao.</p>
              </div>
            ) : (
              <div className="graficos-lista">
                {graficos.filter(g => g.ativo).map((g, idx) => {
                  const i = graficos.indexOf(g);
                  const ehAuto = !!(g as any).automatico;
                  return (
                    <div key={i} className={`grafico-card ${ehAuto ? 'auto' : ''}`}>
                      {ehAuto && <span className="grafico-badge-auto">Automatico</span>}

                      {/* Preview visual */}
                      <div className="grafico-preview">
                        {g.tipo === 'barra' && (
                          <svg viewBox="0 0 80 40" width="36" height="18">
                            <rect x="5" y="20" width="12" height="18" rx="2" fill="#6366f1" opacity="0.8" />
                            <rect x="22" y="8" width="12" height="30" rx="2" fill="#818cf8" opacity="0.8" />
                            <rect x="39" y="14" width="12" height="24" rx="2" fill="#a5b4fc" opacity="0.8" />
                            <rect x="56" y="5" width="12" height="33" rx="2" fill="#6366f1" opacity="0.6" />
                          </svg>
                        )}
                        {g.tipo === 'linha' && (
                          <svg viewBox="0 0 80 40" width="36" height="18">
                            <polyline points="5,28 22,18 39,24 56,8 73,14" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" />
                            <circle cx="5" cy="28" r="2" fill="#6366f1" /><circle cx="22" cy="18" r="2" fill="#6366f1" />
                            <circle cx="39" cy="24" r="2" fill="#6366f1" /><circle cx="56" cy="8" r="2" fill="#6366f1" /><circle cx="73" cy="14" r="2" fill="#6366f1" />
                          </svg>
                        )}
                        {g.tipo === 'pizza' && (
                          <svg viewBox="0 0 40 40" width="20" height="20">
                            <circle cx="20" cy="20" r="16" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                            <circle cx="20" cy="20" r="16" fill="none" stroke="#6366f1" strokeWidth="8" strokeDasharray={`${0.6 * Math.PI * 32} ${Math.PI * 32}`} transform="rotate(-90 20 20)" />
                            <circle cx="20" cy="20" r="16" fill="none" stroke="#818cf8" strokeWidth="8" strokeDasharray={`${0.3 * Math.PI * 32} ${Math.PI * 32}`} strokeDashoffset={`${-0.6 * Math.PI * 32}`} transform="rotate(-90 20 20)" />
                          </svg>
                        )}
                      </div>

                      <div className="grafico-inputs">
                        <input value={g.titulo}
                          onChange={e => { const ng = graficos.map((gr, j) => j === i ? { ...gr, titulo: e.target.value } : gr); setGraficos(ng); }}
                          placeholder="Titulo do grafico" className="grafico-input-titulo"
                        />
                        <div className="grafico-selects-row">
                          <select value={g.tipo}
                            onChange={e => { const ng = graficos.map((gr, j) => j === i ? { ...gr, tipo: e.target.value as any } : gr); setGraficos(ng); }}
                            className="grafico-select"
                          >
                            <option value="barra">Barras</option>
                            <option value="linha">Linha</option>
                            <option value="pizza">Pizza</option>
                          </select>
                          <select value={g.eixoX}
                            onChange={e => { const ng = graficos.map((gr, j) => j === i ? { ...gr, eixoX: e.target.value } : gr); setGraficos(ng); }}
                            className="grafico-select"
                          >
                            <option value="">Eixo X</option>
                            {colsText.map(c => <option key={c.nome} value={c.nome}>{c.nome}</option>)}
                          </select>
                          <select value={g.eixoY}
                            onChange={e => { const ng = graficos.map((gr, j) => j === i ? { ...gr, eixoY: e.target.value } : gr); setGraficos(ng); }}
                            className="grafico-select"
                          >
                            <option value="">Eixo Y</option>
                            {colsNum.map(c => <option key={c.nome} value={c.nome}>{c.nome}</option>)}
                          </select>
                        </div>
                      </div>

                      <div className="grafico-acoes">
                        <Toggle checked={g.ativo}
                          onChange={() => { const ng = graficos.map((gr, j) => j === i ? { ...gr, ativo: !gr.ativo } : gr); setGraficos(ng); }}
                        />
                        <button className="btn-icon btn-icon-danger" onClick={() => { const ng = graficos.filter((_, j) => j !== i); setGraficos(ng); }} title="Remover grafico">
                          <FiTrash2 size={11} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ════ FATURAMENTO ════ */}
        {subTab === 'faturamento' && renderFaturamento()}
      </div>
    );

  };

  /* ═══ Render Principal ═══ */
  return (
    <div className="mini-flow">
      <div className="etapas-nav">
        <button className={`etapa-btn ${etapa === 'upload' ? 'active' : ''} ${status.upload === 'done' ? 'done' : ''}`} onClick={() => irPara('upload')}>
          <span className="etapa-num">{status.upload === 'done' ? <FiCheck size={9} /> : '1'}</span> Upload
        </button>
        <div className={`etapa-linha ${status.upload === 'done' ? 'done' : ''}`} />
        <button className={`etapa-btn ${etapa === 'revisao' ? 'active' : ''} ${status.revisao === 'done' ? 'done' : ''}`} onClick={() => irPara('revisao')}>
          <span className="etapa-num">{status.revisao === 'done' ? <FiCheck size={9} /> : '2'}</span> Dados
        </button>
        <div className={`etapa-linha ${status.revisao === 'done' ? 'done' : ''}`} />
        <button className={`etapa-btn ${etapa === 'config' ? 'active' : ''} ${status.config === 'done' ? 'done' : ''}`} onClick={() => irPara('config')}>
          <span className="etapa-num">{status.config === 'done' ? <FiCheck size={9} /> : '3'}</span> KPIs
        </button>
      </div>
      <div className="etapa-conteudo">
        {etapa === 'upload' && renderUpload()}
        {etapa === 'indicadoresAuto' && renderIndicadoresAuto()}
        {etapa === 'revisao' && renderRevisao()}
        {etapa === 'config' && renderConfig()}
      </div>
    </div>
  );
}

function obterValorMetrica(key: string, m: any): string {
  if (!m) return '\u2014';
  const map: Record<string, string> = {
    viagens: 'viagens', coletores: 'qtdColetores', peso_total: 'pesoTotalTon',
    km_total: 'kmTotal', horas_produtivas: 'horasProdutivas', faturamento_est: 'faturamento',
    ton_km: 'tonKm', prod_coletor: 'prodColetor', km_medio_viagem: 'kmMedioViagem',
    ton_media_coleta: 'tonMediaColeta', receita_km: 'receitaKm', receita_hora: 'receitaHora',
  };
  const v = m[map[key]];
  if (v == null) return '\u2014';
  if (key === 'faturamento_est') return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (key === 'peso_total' || key === 'prod_coletor' || key === 'ton_media_coleta') return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' t';
  if (key === 'km_total' || key === 'km_medio_viagem') return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' km';
  if (key === 'horas_produtivas') return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' h';
  if (key === 'receita_km') return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '/km';
  if (key === 'receita_hora') return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '/h';
  return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}
