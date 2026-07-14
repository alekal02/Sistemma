import { memo, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  FiTrash2, FiRefreshCw, FiCopy, FiDatabase, FiBarChart2, FiSave,
  FiZap, FiDownload, FiBook, FiInfo, FiDollarSign,
} from 'react-icons/fi';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { FORMULAS_RESUMO_EXECUTIVO } from '../../data/formulasResumoExecutivo';
import kpiUniversalService from '../../services/kpiUniversalService';
import servicoService from '../../services/servicoService';
import {
  buildValoresFixosFromConfigFaturamento,
  sincronizarKpisComFaturamento,
} from '../../services/kpiEngine';
import { TIPOS_SERVICO_LABELS } from '../../types';
import DataTable from '../DataTable';
import type { KpiConfig, GraficoConfig, ColunaDetectada } from '../KpiEditor/KpiEditorTypes';
import type { ConfigFaturamentoState } from './servicoTypes';
import {
  CANDIDATOS_COLUNA_PESO,
  CANDIDATOS_COLUNA_TIPO_CAMINHAO,
  detectarColuna,
  detectarColunaPlanilha,
  obterValorMetrica,
} from './servicoUtils';

export interface ServicoConfigTabProps {
  contractId: string;
  servicoId: string;
  tipoServico: string;
  colunas: ColunaDetectada[];
  temPlanilha: boolean;
  kpis: KpiConfig[];
  graficos: GraficoConfig[];
  onKpisChange: (kpis: KpiConfig[]) => void;
  onGraficosChange: (graficos: GraficoConfig[]) => void;
  onConfigStatusChange: (done: boolean) => void;
}

const ServicoConfigTab = memo(function ServicoConfigTab({
  contractId,
  servicoId,
  tipoServico,
  colunas,
  temPlanilha,
  kpis,
  graficos,
  onKpisChange,
  onGraficosChange,
  onConfigStatusChange,
}: ServicoConfigTabProps) {
  const { token } = useAuth();
  const { adicionarToast } = useToast();

  const kpisRef = useRef(kpis);
  kpisRef.current = kpis;
  const graficosRef = useRef(graficos);
  graficosRef.current = graficos;

  const setKpis = useCallback((value: KpiConfig[] | ((prev: KpiConfig[]) => KpiConfig[])) => {
    onKpisChange(typeof value === 'function' ? value(kpisRef.current) : value);
  }, [onKpisChange]);

  const setGraficos = useCallback((value: GraficoConfig[] | ((prev: GraficoConfig[]) => GraficoConfig[])) => {
    onGraficosChange(typeof value === 'function' ? value(graficosRef.current) : value);
  }, [onGraficosChange]);


  const [execMetrics, setExecMetrics] = useState<any>(null);
  const [loadingExec, setLoadingExec] = useState(false);
  const [subTab, setSubTab] = useState<'indicadores' | 'metricas' | 'graficos' | 'faturamento' | 'dados'>('indicadores');
  const [autoSave, setAutoSave] = useState<'idle' | 'saving' | 'saved'>('idle');

  // ─── Configuração de Faturamento ───
  const [configFaturamento, setConfigFaturamento] = useState<ConfigFaturamentoState | null>(null);
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

  useEffect(() => {
    if (!temPlanilha) return;
    let ativo = true;
    setLoadingExec(true);
    servicoService.getKpiExecMetrics(contractId, servicoId)
      .then(metrics => { if (ativo) setExecMetrics(metrics); })
      .catch(() => {})
      .finally(() => { if (ativo) setLoadingExec(false); });
    return () => { ativo = false; };
  }, [contractId, servicoId, token, temPlanilha]);

  const colsNum = colunas.filter(c => c.tipo === 'numero');
  const colsText = colunas.filter(c => c.tipo === 'texto' || c.tipo === 'desconhecido');

  const salvarConfig = useCallback(async (novosKpis: KpiConfig[], novosGraficos: GraficoConfig[]) => {
    setAutoSave('saving');
    try {
      await servicoService.saveConfigDashboard(contractId, servicoId, {
        kpis: novosKpis.filter(k => k.ativo !== false),
        graficos: novosGraficos.filter(g => g.ativo),
      });
      setAutoSave('saved');
      setTimeout(() => setAutoSave('idle'), 2000);
      if (novosKpis.filter(k => k.ativo !== false).length > 0) onConfigStatusChange(true);
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

    if (configFaturamento.tipoCobranca === 'm2') {
      const temM2 = [
        configFaturamento.valorM2,
        configFaturamento.valorM2Manual,
        configFaturamento.valorM2Mecanizada,
      ].some(v => v != null && v > 0);
      if (!temM2) {
        adicionarToast('Informe o valor por m² Manual e/ou Mecanizada', 'warning');
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
﻿  const handleCriarKpi = useCallback((metricaKey: string) => {
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
        valorM2Manual: null,
        valorM2Mecanizada: null,
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
                <div className="valores-form-linha" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div className="valor-input-group" style={{ maxWidth: '200px' }}>
                    <label style={{ color: '#16a34a' }}>Manual (R$/m²)</label>
                    <input type="number" step="0.01" min="0" placeholder="0,00"
                      value={cfg.valorM2Manual ?? cfg.valorM2 ?? ''}
                      onChange={e => {
                        const n = e.target.value ? Number(e.target.value) : null;
                        const mec = cfg.valorM2Mecanizada ?? cfg.valorM2;
                        setCfg({
                          valorM2Manual: n,
                          valorM2: n != null && mec != null && n === mec ? n : (mec ?? n),
                        });
                      }}
                    />
                  </div>
                  <div className="valor-input-group" style={{ maxWidth: '200px' }}>
                    <label style={{ color: '#ea580c' }}>Mecanizada (R$/m²)</label>
                    <input type="number" step="0.01" min="0" placeholder="0,00"
                      value={cfg.valorM2Mecanizada ?? cfg.valorM2 ?? ''}
                      onChange={e => {
                        const n = e.target.value ? Number(e.target.value) : null;
                        const man = cfg.valorM2Manual ?? cfg.valorM2;
                        setCfg({
                          valorM2Mecanizada: n,
                          valorM2: man != null && n != null && man === n ? n : (n ?? man),
                        });
                      }}
                    />
                  </div>
                </div>
                <p style={{ fontSize: '0.68rem', color: '#64748b', margin: '0.4rem 0 0', lineHeight: 1.4 }}>
                  A planilha de roçada distingue Manual e Mecanizada. Os valores podem ser iguais ou diferentes;
                  o faturamento usa a tarifa conforme o tipo/equipamento de cada linha.
                </p>
                <details style={{ marginTop: '0.45rem', fontSize: '0.72rem', color: '#64748b' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Valor único (legado)</summary>
                  <div className="valor-input-group" style={{ maxWidth: '200px', marginTop: '0.35rem' }}>
                    <label>Valor por m² (R$)</label>
                    <input type="number" step="0.01" min="0" placeholder="0,00"
                      value={cfg.valorM2 ?? ''}
                      onChange={e => {
                        const n = e.target.value ? Number(e.target.value) : null;
                        setCfg({
                          valorM2: n,
                          valorM2Manual: cfg.valorM2Manual ?? n,
                          valorM2Mecanizada: cfg.valorM2Mecanizada ?? n,
                        });
                      }}
                    />
                  </div>
                </details>
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
          {temPlanilha && (
            <button className={`config-tab-modern ${subTab === 'dados' ? 'active' : ''}`} onClick={() => setSubTab('dados')}>
              <FiDatabase size={13} /> <span>Dados</span>
            </button>
          )}
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

        {/* ════ DADOS DA PLANILHA (paginação server-side + virtualização) ════ */}
        {subTab === 'dados' && temPlanilha && (
          <div className="kpi-sub-content">
            <DataTable
              servicoId={servicoId}
              contractId={contractId}
              token={token}
              adicionarToast={adicionarToast}
              colunasPadrao={colunas}
            />
          </div>
        )}
      </div>
    );
});

export default ServicoConfigTab;
