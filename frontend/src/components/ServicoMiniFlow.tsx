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
import RelatorioQualidade from './RelatorioQualidade';
import QualidadePlanilhaPreview from './QualidadePlanilhaPreview';
import { TIPOS_SERVICO_LABELS } from '../types';
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
  onStatusChange?: (status: EtapasStatus) => void;
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

export default function ServicoMiniFlow({ contractId, servicoId, servicoNome, onStatusChange }: Props) {
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
  const [tipoServico, setTipoServico] = useState<string>('');

  // ─── Configuração de Faturamento ───
  const [configFaturamento, setConfigFaturamento] = useState<{
    tipoCobranca: string;
    valorTonelada: number | null;
    valorMini: number | null;
    valorTruck: number | null;
    valorToco: number | null;
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
        const res = await fetch(`/api/contracts/${contractId}/servicos/${servicoId}/config-faturamento`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setConfigFaturamento(data.configFaturamento);
        }
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
  const kpisInlineCarregadoRef = useRef(false);
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
  const [resumoImportacao, setResumoImportacao] = useState<{
    importados: number;
    validasDashboard: number;
    inconsistentes: number;
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

  useEffect(() => {
    if (carregadoRef.current && recargaKey === 0) return;
    carregadoRef.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/contracts/${contractId}/servicos/${servicoId}/padrao`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const cols: ColunaDetectada[] = filtrarColunasValidas(
          data.servico?.padraoPlanilha?.colunas || []
        );
        const ups: PlanilhaItem[] = data.uploads?.ultimos || [];
        const cfg = data.servico?.configDashboard;
        setColunas(cols);
        setPlanilhas(ups);
        setTotalLinhas(data.uploads?.totalLinhas || 0);
        setTotalImportados(data.uploads?.totalImportados || 0);
        setTipoServico(data.servico?.tipo || '');
        if (cfg?.kpis?.length) setKpis(JSON.parse(JSON.stringify(cfg.kpis)));
        if (cfg?.graficos?.length) setGraficos(JSON.parse(JSON.stringify(cfg.graficos)));
        if (data.valoresCaminhao) {
          const g: Record<string, ConstanteGlobal> = {};
          for (const [k, v] of Object.entries(data.valoresCaminhao)) {
            if (v != null) g[k] = { valor: Number(v), label: k };
          }
          setConstantes(g);
        }
        const temKpisAuto = cfg?.indicadoresAutomaticosConfirmados;
        const temKpis = (cfg?.kpis?.length || 0) > 0;
        const novoStatus: EtapasStatus = {
          upload: cols.length > 0 ? 'done' : 'pending',
          indicadoresAuto: temKpisAuto ? 'done' : 'pending',
          revisao: cols.length > 0 ? 'done' : 'pending',
          config: temKpis ? 'done' : 'pending',
        };
        if (temKpisAuto && temKpis) novoStatus.config = 'done';
        setStatus(novoStatus);
        if (temKpisAuto && cols.length > 0) setEtapa('revisao');
      } catch { /* silent */ }
    })();
  }, [contractId, servicoId, token, recargaKey]);

  useEffect(() => {
    if (!temPlanilha) return;
    let ativo = true;
    setLoadingDados(true);
    setLoadingExec(true);
    Promise.all([
      fetch(`/api/contracts/${contractId}/servicos/${servicoId}/dados-brutos?limite=100`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/contracts/${contractId}/servicos/${servicoId}/kpi-exec-metrics`, { headers: { Authorization: `Bearer ${token}` } }),
    ]).then(async ([r1, r2]) => {
      if (!ativo) return;
      if (r1.ok) setDados((await r1.json()).dados || []);
      if (r2.ok) setExecMetrics(await r2.json());
    }).catch(() => {}).finally(() => {
      if (ativo) { setLoadingDados(false); setLoadingExec(false); }
    });
    return () => { ativo = false; };
  }, [contractId, servicoId, token, temPlanilha]);

  useEffect(() => {
    if (kpisInlineCarregadoRef.current) return;
    kpisInlineCarregadoRef.current = true;
    setCarregandoKpisInline(true);
    kpiUniversalService.listar()
      .then(r => {
        setKpisUniversaisInline(r.kpis);
        setKpisUniversaisInlineIds(new Set(kpis.filter(k => (k as any).origemUniversal).map(k => (k as any).origemUniversal as string).filter(Boolean)));
      })
      .catch(() => setKpisUniversaisInline([]))
      .finally(() => setCarregandoKpisInline(false));
  }, [kpis]);

  const salvarConfig = useCallback(async (novosKpis: KpiConfig[], novosGraficos: GraficoConfig[]) => {
    setAutoSave('saving');
    try {
      await fetch(`/api/contracts/${contractId}/servicos/${servicoId}/config-dashboard`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ configDashboard: { kpis: novosKpis.filter(k => k.ativo), graficos: novosGraficos.filter(g => g.ativo) } }),
      });
      setAutoSave('saved');
      setTimeout(() => setAutoSave('idle'), 2000);
      if (novosKpis.filter(k => k.ativo).length > 0) setStatus(prev => ({ ...prev, config: 'done' }));
    } catch { setAutoSave('idle'); }
  }, [contractId, servicoId, token]);

  const salvarConfigFaturamento = useCallback(async () => {
    if (!configFaturamento) return;

    if (configFaturamento.tipoCobranca === 'tonelada_tipo_caminhao') {
      const temValorTipo = [configFaturamento.valorMini, configFaturamento.valorTruck, configFaturamento.valorToco]
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
      await fetch(`/api/contracts/${contractId}/servicos/${servicoId}/config-faturamento`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ configFaturamento: cfgParaSalvar }),
      });
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

  const importarPlanilhaValidada = async (file: File, relatorio?: any) => {
    setUploading(true);
    setUploadPct(0);
    const iv = setInterval(() => setUploadPct(p => Math.min(p + 15, 85)), 200);
    try {
      const fd = new FormData();
      fd.append('planilha', file);
      fd.append('servico_id', servicoId);
      const res = await fetch('/api/coleta/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      clearInterval(iv);
      setUploadPct(100);
      if (res.ok) {
        const data = await res.json();
        const inconsistentes = data.viagensInconsistentes
          ?? data.resumo?.viagensInconsistentes
          ?? relatorio?.viagensInconsistentesTotal
          ?? relatorio?.viagensIncompletas
          ?? 0;
        const validasDashboard = data.viagensValidasDashboard
          ?? data.resumo?.viagensValidasDashboard
          ?? relatorio?.viagensValidasDashboard
          ?? relatorio?.viagensCompletas
          ?? (data.importados - inconsistentes);
        const importados = data.importados ?? data.importadas ?? 0;

        setResumoImportacao({ importados, validasDashboard, inconsistentes });
        setImportacaoConcluida(true);
        setStatus(prev => ({ ...prev, upload: 'done', revisao: 'done' }));
        setEtapa('revisao');
        setPrimeiroUpload(false);
        carregadoRef.current = false;
        setRecargaKey(k => k + 1);

        if (inconsistentes > 0) {
          adicionarToast(
            `PDF baixado. ${validasDashboard} viagem(ns) no dashboard. ${inconsistentes} inconsistente(s) fora dos cálculos.`,
            'warning'
          );
        } else {
          adicionarToast(`${validasDashboard} viagem(ns) importada(s) para o dashboard.`, 'success');
        }
      } else {
        const errData = await res.json();
        adicionarToast(errData.error || 'Erro no upload', 'error');
      }
    } catch {
      adicionarToast('Erro no upload', 'error');
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
      const fd = new FormData();
      fd.append('planilha', file);
      const res = await fetch('/api/qualidade-coleta/analisar-viagens', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) {
        const data = await res.json();
        setDadosViagens(data);
        return data;
      }
      const errData = await res.json().catch(() => ({ error: 'Erro ao analisar viagens' }));
      adicionarToast(errData.error || 'Erro ao analisar viagens', 'error');
      return null;
    } catch {
      adicionarToast('Erro ao conectar com o servidor', 'error');
      return null;
    } finally {
      setAnalisandoViagens(false);
    }
  };

  // ─── Validação + relatório + importação das viagens válidas ───
  const handleValidarDados = async (file: File) => {
    setArquivoValidacao(file);
    setValidando(true);
    setValidacaoData(null);
    setDadosViagens(null);
    setImportacaoConcluida(false);
    setResumoImportacao(null);
    setModoValidacao(true);
    try {
      const fd = new FormData();
      fd.append('planilha', file);
      fd.append('servico_id', servicoId);
      const res = await fetch('/api/qualidade-coleta/preview', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) {
        const data = await res.json();
        setValidacaoData(data);
        if (data.sucesso) {
          const relatorio = await analisarViagensArquivo(file);
          if (relatorio) {
            const inconsistentes = (relatorio.viagensInconsistentesTotal ?? relatorio.viagensIncompletas) || 0;
            if (inconsistentes > 0) {
              const pdfOk = await gerarPdfViagensDeRelatorio(relatorio);
              if (!pdfOk) {
                adicionarToast('Não foi possível gerar o PDF — importação das viagens válidas continuará.', 'warning');
              }
            }
            await importarPlanilhaValidada(file, relatorio);
          }
        }
      } else {
        const errData = await res.json().catch(() => ({ error: 'Erro ao validar planilha' }));
        adicionarToast(errData.error || 'Erro ao validar planilha', 'error');
        setModoValidacao(false);
      }
    } catch {
      adicionarToast('Erro ao conectar com o servidor para validação', 'error');
      setModoValidacao(false);
    } finally {
      setValidando(false);
    }
  };

  const handleSelecionarPlanilha = (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      adicionarToast('Selecione um arquivo .xlsx ou .xls', 'error');
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
    setArquivoValidacao(null);
    setImportacaoConcluida(false);
    setResumoImportacao(null);
  };

  const montarHtmlPdfViagens = (relatorio: any) => {
    const viagens = relatorio.viagens || [];
    const inconsistentes = (relatorio.viagensInconsistentesTotal ?? relatorio.viagensIncompletas) || 0;
    const validas = relatorio.viagensValidasDashboard ?? relatorio.viagensCompletas ?? 0;

    const linhasTabela = viagens.map((v: any) => `
      <tr>
        <td>${v.linha}</td>
        <td>${v.data || '—'}</td>
        <td>${v.placa || '—'}</td>
        <td>${v.motorista || '—'}</td>
        <td>${v.rota || '—'}</td>
        <td>${v.kmTotal != null ? v.kmTotal.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : (v.kmTotalCalculado != null ? v.kmTotalCalculado.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '*' : '—')}</td>
        <td>${v.pesoTotal != null ? Number(v.pesoTotal).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—'}</td>
        <td style="color:#b45309; font-size:9px">${(v.problemas || []).join('; ') || '—'}</td>
      </tr>
    `).join('');

    const problemasHtml = (relatorio.problemasAgrupados || []).map((p: any) => `
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
    <h1>Relatório de Dados Inconsistentes</h1>
    <p>Arquivo: ${relatorio.nomeArquivo || '—'} • Aba: ${relatorio.aba || '—'}</p>
  </div>

  <div class="summary">
    <div class="card"><div class="num">${relatorio.totalViagens || 0}</div><div class="label">Total de Viagens</div></div>
    <div class="card completas"><div class="num">${validas}</div><div class="label">Válidas (dashboard)</div></div>
    <div class="card incompletas"><div class="num">${inconsistentes}</div><div class="label">Inconsistentes</div></div>
    <div class="card"><div class="num">${relatorio.percentualCompleto || 0}%</div><div class="label">% Válidas</div></div>
  </div>

  <div class="aviso">
    As ${validas} viagem(ns) válidas serão importadas para o dashboard. As ${inconsistentes} inconsistente(s) abaixo ficam fora dos cálculos.
  </div>

  <div class="section-title">Problemas Encontrados</div>
  <div class="problemas-box">
    ${problemasHtml || '<p style="color:#16a34a; font-weight:600">Nenhum problema encontrado.</p>'}
  </div>

  ${viagens.length > 0 ? `
  <div class="section-title">Detalhamento — Viagens Inconsistentes (${viagens.length} registro(s))</div>
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
      const res = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ html, filename: 'relatorio_dados_inconsistentes' }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'relatorio_dados_inconsistentes.pdf';
        a.click();
        URL.revokeObjectURL(url);
        if (!opts?.silencioso) {
          adicionarToast('PDF com dados inconsistentes gerado!', 'success');
        }
        return true;
      }
      const err = await res.json().catch(() => ({ error: 'Erro ao gerar PDF' }));
      if (!opts?.silencioso) {
        adicionarToast(err.error || 'Erro ao gerar PDF', 'error');
      }
      return false;
    } catch {
      if (!opts?.silencioso) {
        adicionarToast('Erro ao gerar PDF', 'error');
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
    if (gerandoPdfViagens) return 'Gerando PDF com dados inconsistentes...';
    if (uploading) return 'Importando viagens válidas para o dashboard...';
    return '';
  };

  const handleAutoConfirm = useCallback((indicadores: KpiConfig[], graficosCfg: GraficoConfig[]) => {
    const novosKpis = [...kpis, ...indicadores]; const novosGraficos = [...graficos, ...graficosCfg];
    setKpis(novosKpis); setGraficos(novosGraficos);
    setStatus(prev => ({ ...prev, indicadoresAuto: 'done', config: novosKpis.filter(k => k.ativo).length > 0 ? 'done' : 'pending' }));
    setEtapa('revisao'); salvarConfig(novosKpis, novosGraficos);
    adicionarToast(`\u2705 ${indicadores.length} indicador(es) autom\u00e1tico(s) criados!`, 'success');
  }, [kpis, graficos, salvarConfig, adicionarToast]);

  const handleAutoSkip = useCallback(() => {
    setStatus(prev => ({ ...prev, indicadoresAuto: 'skipped' }));
    setEtapa('revisao'); adicionarToast('\u23ed Indicadores autom\u00e1ticos pulados. Configure manualmente depois.', 'info');
  }, [adicionarToast]);

  const excluirPlanilha = async (id: number) => {
    try {
      const res = await fetch(`/api/coleta/uploads/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        adicionarToast('Planilha exclu\u00edda!', 'success');
        setPlanilhas(p => p.filter(x => x.id !== id));
        if (planilhas.length <= 1) { setColunas([]); setDados([]); setKpis([]); setGraficos([]);
          setStatus({ upload: 'pending', indicadoresAuto: 'pending', revisao: 'pending', config: 'pending' }); }
      } else adicionarToast('Erro ao excluir', 'error');
    } catch { adicionarToast('Erro ao excluir', 'error'); }
  };

  const alterarTipo = async (nome: string, tipo: string) => {
    try {
      await fetch(`/api/contracts/${contractId}/servicos/${servicoId}/colunas/tipo`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, tipo }),
      });
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
            {(validando || analisandoViagens || gerandoPdfViagens || uploading) && (
              <div style={{
                width: '18px', height: '18px',
                border: '2px solid #e2e8f0', borderTopColor: '#6366f1',
                borderRadius: '50%', animation: 'spin 0.7s linear infinite',
              }} />
            )}
          </div>

          {(validando || analisandoViagens || gerandoPdfViagens || uploading) && mensagemProcessamentoUpload() && (
            <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '0 0 0.5rem' }}>
              {mensagemProcessamentoUpload()}
            </p>
          )}

          {/* Preview de qualidade */}
          <QualidadePlanilhaPreview
            dados={validacaoData}
            carregando={validando || analisandoViagens || gerandoPdfViagens || uploading}
          />

          {uploading && (
            <div className="upload-progress" style={{ marginTop: '0.5rem' }}>
              <div className="upload-bar"><div className="upload-fill" style={{ width: `${uploadPct}%` }} /></div>
              <div className="upload-pct">Importando viagens válidas... {uploadPct}%</div>
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
                  {resumoImportacao.inconsistentes} viagem(ns) inconsistente(s) ficaram fora dos cálculos. O PDF foi baixado automaticamente.
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
                  Verificando cada linha: KM, peso, rota e valores negativos...
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
                  Apenas viagens <strong>completas e sem valores negativos</strong> entram no dashboard.
                  As demais ficam registradas na planilha importada para consulta.
                </div>
              )}

              {/* Resultados da análise */}
              {dadosViagens && (
                <div>
                  {/* Cards resumo */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.35rem',
                    marginBottom: '0.5rem',
                  }}>
                    <div style={{ background: '#f8fafc', borderRadius: '6px', padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>{dadosViagens.totalViagens || 0}</div>
                      <div style={{ fontSize: '0.58rem', color: '#64748b' }}>Total</div>
                    </div>
                    <div style={{ background: '#f0fdf4', borderRadius: '6px', padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#16a34a' }}>{dadosViagens.viagensCompletas || 0}</div>
                      <div style={{ fontSize: '0.58rem', color: '#166534' }}>No dashboard</div>
                    </div>
                    <div style={{ background: '#fef2f2', borderRadius: '6px', padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#dc2626' }}>{(dadosViagens.viagensInconsistentesTotal ?? dadosViagens.viagensIncompletas) || 0}</div>
                      <div style={{ fontSize: '0.58rem', color: '#991b1b' }}>Fora do dashboard</div>
                    </div>
                    <div style={{ background: '#f0f9ff', borderRadius: '6px', padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#2563eb' }}>{dadosViagens.percentualCompleto || 0}%</div>
                      <div style={{ fontSize: '0.58rem', color: '#1e40af' }}>% Válidas</div>
                    </div>
                  </div>

                  {/* Problemas agrupados */}
                  {(dadosViagens.problemasAgrupados || []).length > 0 && (
                    <div style={{ marginBottom: '0.5rem' }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#dc2626', marginBottom: '0.2rem' }}>
                        Problemas encontrados:
                      </div>
                      {dadosViagens.problemasAgrupados.map((p: any, i: number) => (
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
                        Primeiras {Math.min(dadosViagens.viagens.length, 10)} viagens incompletas:
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
                            {dadosViagens.viagens.slice(0, 10).map((v: any, i: number) => (
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
                                  {(v.problemas || []).join('; ') || '—'}
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

          {/* Ações após validação + importação */}
          {!validando && !analisandoViagens && !uploading && validacaoData && validacaoData.sucesso && dadosViagens && (
            <div style={{
              display: 'flex', gap: '0.5rem', marginTop: '0.5rem',
              justifyContent: 'flex-end', flexWrap: 'wrap',
            }}>
              {!importacaoConcluida && arquivoValidacao && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => importarPlanilhaValidada(arquivoValidacao, dadosViagens)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    background: '#16a34a', border: 'none', color: '#fff',
                    padding: '0.4rem 0.85rem', borderRadius: '6px',
                    fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <FiUpload size={12} /> Importar viagens válidas
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
            type="file" accept=".xlsx,.xls"
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
          onClick={() => { const el = document.createElement('input'); el.type = 'file'; el.accept = '.xlsx,.xls'; el.onchange = (ev: any) => { const f = ev?.target?.files?.[0]; if (f) handleSelecionarPlanilha(f); }; el.click(); }}
        >
          <div className="upload-zone-icon">{(validando || analisandoViagens || gerandoPdfViagens || uploading) ? <FiRefreshCw className="spin" /> : <FiShield />}</div>
          <p>{mensagemProcessamentoUpload() || 'Arraste ou clique para enviar a planilha'}</p>
          <small>.xlsx, .xls — PDF das inconsistências, depois viagens válidas no dashboard</small>
        </div>
        <p style={{
          fontSize: '0.62rem', color: '#94a3b8', margin: '0.35rem 0 0',
          textAlign: 'center',
        }}>
          Fluxo: validação → PDF com erros (download automático) → importação das viagens corretas.
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
                  <button className="planilha-excluir" onClick={() => excluirPlanilha(p.id)} title="Excluir"><FiTrash2 size={12} /></button>
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
              setStatus(prev => ({ ...prev, indicadoresAuto: 'done', config: novosKpis.filter(k => k.ativo).length > 0 ? 'done' : 'pending' }));
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
    const kpisAtivos = kpis.filter(k => k.ativo);

    // ─── Render Faturamento ───
    const renderFaturamento = () => {
      const cfg = configFaturamento || {
        tipoCobranca: '',
        valorTonelada: null,
        valorMini: null,
        valorTruck: null,
        valorToco: null,
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
        { value: 'tonelada_tipo_caminhao', label: 'Por Tonelada + Tipo de Caminhão', desc: 'Calcula receita com base no peso e tipo de caminhão (Mini, Truck, Toco)' },
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
                </div>
                <div style={{
                  marginTop: '0.55rem', padding: '0.5rem 0.65rem',
                  background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px',
                  fontSize: '0.72rem', color: '#166534', lineHeight: 1.45,
                }}>
                  <FiInfo size={12} style={{ marginRight: '0.25rem', verticalAlign: '-2px' }} />
                  Cada viagem usa o valor de <strong>Mini</strong>, <strong>Truck</strong> ou <strong>Toco</strong>
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
                    Só é usado quando o tipo da viagem não for identificado como Mini, Truck ou Toco.
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
                    const res = await fetch(`/api/contracts/${contractId}/servicos/${servicoId}/kpi-preview`, {
                      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        expressao: kpi.expressao,
                        valoresFixos: { ...valoresFixos, ...(kpi.valoresFixos || {}) },
                      }),
                    });
                    if (res.ok) { const d = await res.json(); adicionarToast(d.valor != null ? `Preview: ${d.valor}` : 'Sem dados', d.valor != null ? 'success' : 'warning'); }
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
              <button className="btn-biblioteca-toggle" onClick={() => setBibliotecaAberta(!bibliotecaAberta)}>
                <FiBook size={12} />
                <span>{bibliotecaAberta ? 'Fechar Biblioteca' : 'Biblioteca Universal'}</span>
                <span className="bib-toggle-count">{kpisUniversaisInline.length}</span>
              </button>
              {kpisAtivos.length > 0 && <span className="kpi-total-badge">{kpisAtivos.length} ativo(s)</span>}
            </div>

            {/* BIBLIOTECA UNIVERSAL — painel visível */}
            {bibliotecaAberta && (
              <div className="kpi-biblioteca-panel">
                <div className="bib-header">
                  <FiBook size={13} />
                  <span>Biblioteca Universal de KPIs</span>
                  <span className="bib-count">{kpisUniversaisInline.length} disponiveis</span>
                  <span className="bib-ativos">{kpisUniversaisInlineIds.size} ativos</span>
                </div>
                {carregandoKpisInline ? (
                  <div style={{ padding: '0.75rem' }}>
                    <div className="skeleton" style={{ height: 36, marginBottom: 6 }} />
                    <div className="skeleton" style={{ height: 36, marginBottom: 6 }} />
                    <div className="skeleton" style={{ height: 36 }} />
                  </div>
                ) : kpisUniversaisInline.length === 0 ? (
                  <div className="bib-empty">Nenhum KPI universal cadastrado.</div>
                ) : (
                  <div className="bib-lista">
                    {(() => {
                      const grupos = new Map<string, any[]>();
                      for (const k of kpisUniversaisInline) {
                        const tipo = k.tipoServico || 'geral';
                        if (!grupos.has(tipo)) grupos.set(tipo, []);
                        grupos.get(tipo)!.push(k);
                      }
                      return Array.from(grupos.entries()).map(([tipo, lista]) => (
                        <div key={tipo} className="bib-grupo">
                          <div className="bib-grupo-titulo">
                            <span>{(TIPOS_SERVICO_LABELS as any)[tipo] || tipo.replace(/_/g, ' ')}</span>
                            <span className="bib-grupo-count">{lista.length}</span>
                          </div>
                          {lista.map(kpiU => {
                            const ativo = kpisUniversaisInlineIds.has(kpiU.id);
                            return (
                              <div key={kpiU.id} className={`bib-item ${ativo ? 'ativo' : ''}`}
                                onClick={() => toggleKpiUniversal(kpiU, ativo)}
                              >
                                <div className="bib-item-indicador" style={{ background: ativo ? '#6366f1' : '#cbd5e1' }}>
                                  {ativo && <FiCheck size={9} color="#fff" />}
                                </div>
                                <div className="bib-item-info">
                                  <div className="bib-item-nome">
                                    <span className="bib-item-cor" style={{ background: kpiU.cor || '#6366f1' }} />
                                    <strong>{kpiU.label}</strong>
                                    <span className="bib-item-categoria">{kpiU.categoria}</span>
                                  </div>
                                  <code className="bib-item-formula">{kpiU.formula || kpiU.expressao}</code>
                                </div>
                                <div className={`bib-item-status ${ativo ? 'ativo' : ''}`}>{ativo ? 'Ativo' : 'Inativo'}</div>
                              </div>
                            );
                          })}
                        </div>
                      ));
                    })()}
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
