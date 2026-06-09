import { useState, useCallback, useRef } from 'react';
import { FiSave, FiArrowLeft, FiFileText, FiFilter, FiX, FiEye, FiEyeOff, FiLock, FiPlus } from 'react-icons/fi';
import type { KpiConfig, GraficoConfig, ColunaDetectada, ConstanteGlobal, PreviewState, IndicadorAutomatico, GraficoAutomaticoExecutivo } from './KpiEditorTypes';
import KpiCardEditor from './KpiCardEditor';
import { formatarNumero } from '../../services/kpiEngine';
import { FORMULAS_RESUMO_EXECUTIVO, FORMULAS_POR_CATEGORIA, getTodasFormulasEspecializadas } from '../../data/formulasResumoExecutivo';

export interface FiltrosPreview {
  dataInicio?: string;
  dataFim?: string;
  placa?: string;
  regional?: string;
  tipoCaminhao?: string;
}

const ROTA = 'R' + '$';

/* ─── Fórmulas Auxiliares (do catálogo unificado) ─── */
const FORMULAS_AUXILIARES = [
  ...FORMULAS_RESUMO_EXECUTIVO.filter(f => f.tipo === 'auxiliar'),
  ...getTodasFormulasEspecializadas(),
];

/* ─── Gráficos automáticos do executivo (catálogo fixo) ─── */
const GRAFICOS_AUTOMATICOS_EXECUTIVO: GraficoAutomaticoExecutivo[] = [
  { canvasId: 'chart-faturamento-tipo', titulo: 'Faturamento por Tipo de Caminhão', tipo: 'pizza', descricao: 'Distribuição do faturamento entre os tipos de caminhão (Truck, Toco, Mini, etc.)', ativo: true, eixoX: 'Tipo', eixoY: 'Valor' },
  { canvasId: 'chart-tendencia-30d', titulo: 'Tendência de Faturamento (30 dias)', tipo: 'linha', descricao: 'Faturamento diário nos últimos 30 dias para acompanhar sazonalidade', ativo: true, eixoX: 'Data', eixoY: 'Faturamento' },
  { canvasId: 'chart-volume-periodo', titulo: 'Volume por Período (7 dias)', tipo: 'barra', descricao: 'Comparativo de faturamento e custo nos últimos 7 dias', ativo: true, eixoX: 'Dia', eixoY: 'Valor (R$)' },
  { canvasId: 'chart-km-coletor', titulo: 'KM por Coletor (Top 10)', tipo: 'barra-horizontal', descricao: 'Quilometragem rodada por cada coletor/veículo no período', ativo: true, eixoX: 'Coletor', eixoY: 'KM Rodados' },
];

/* ─── Interface principal ─── */
interface KpiEditorProps {
  mode: 'modal' | 'page';
  contractId: string;
  servicoId: string;
  token: string;
  servicoNome: string;
  colunas: ColunaDetectada[];
  colunasNum: ColunaDetectada[];
  colunasTexto: ColunaDetectada[];
  dadosBrutos: any[];
  constantesGlobais: Record<string, ConstanteGlobal>;
  contratoKpis?: any[];
  onSave: (kpis: KpiConfig[], graficos: GraficoConfig[], autoMetricasVisiveis?: Record<string, boolean>, autoGraficosVisiveis?: Record<string, boolean>) => Promise<void>;
  onBack: () => void;
  initialKpis?: KpiConfig[];
  initialGraficos?: GraficoConfig[];
  salvando?: boolean;
  onColunaTipoChange?: (nome: string, tipo: string) => Promise<void>;
  indicadoresAutomaticos?: IndicadorAutomatico[];
  initialAutoMetricasVisiveis?: Record<string, boolean>;
  initialAutoGraficosVisiveis?: Record<string, boolean>;
}

export default function KpiEditor(props: KpiEditorProps) {
  const {
    mode, contractId, servicoId, token, servicoNome,
    colunas, colunasNum, colunasTexto, dadosBrutos,
    constantesGlobais, contratoKpis = [],
    onSave, onBack, initialKpis, initialGraficos,
    salvando = false, onColunaTipoChange,
    indicadoresAutomaticos = [],
    initialAutoMetricasVisiveis,
    initialAutoGraficosVisiveis,
  } = props;

  const [tabAtiva, setTabAtiva] = useState<'kpis' | 'graficos' | 'filtros' | 'colunas'>('kpis');
  const [modoExibicao, setModoExibicao] = useState<'simples' | 'completo'>('completo');
  const primeiraColunaNum = colunasNum[0]?.nome || colunas[0]?.nome || '';

  const [kpis, setKpis] = useState<KpiConfig[]>(() => {
    if (initialKpis?.length) return JSON.parse(JSON.stringify(initialKpis));
    return [{ nome: primeiraColunaNum, label: 'Novo KPI', agregacao: 'sum', formato: 'numero', ativo: true, expressao: '', colunasUsadas: [], valoresFixos: {}, descricao: '', unidade: '', categoria: '', cor: '', meta: null, alerta: null }];
  });
  const [graficos, setGraficos] = useState<GraficoConfig[]>(() => {
    if (initialGraficos?.length) return JSON.parse(JSON.stringify(initialGraficos));
    return [];
  });

  const [autoMetricasVisiveis, setAutoMetricasVisiveis] = useState<Record<string, boolean>>(() => {
    if (initialAutoMetricasVisiveis) return { ...initialAutoMetricasVisiveis };
    const defaults: Record<string, boolean> = {};
    indicadoresAutomaticos.forEach(m => { defaults[m.key] = true; });
    return defaults;
  });

  const [autoGraficosVisiveis, setAutoGraficosVisiveis] = useState<Record<string, boolean>>(() => {
    if (initialAutoGraficosVisiveis) return { ...initialAutoGraficosVisiveis };
    const defaults: Record<string, boolean> = {};
    GRAFICOS_AUTOMATICOS_EXECUTIVO.forEach(g => { defaults[g.canvasId] = true; });
    return defaults;
  });

  const [previewStates, setPreviewStates] = useState<Record<number, PreviewState>>({});
  const previewTimeoutRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const [mostrarFiltroFormulas, setMostrarFiltroFormulas] = useState(false);
  const [mostrarFormulasResumo, setMostrarFormulasResumo] = useState(false);

  const [filtrosPreview, setFiltrosPreview] = useState<FiltrosPreview>({});
  const [filtrosAtivos, setFiltrosAtivos] = useState(false);

  const metricasFixadas = new Set(
    kpis.filter(k => k.metricaKey).map(k => k.metricaKey)
  );

  const toggleAutoMetricaVisivel = useCallback((key: string) => {
    setAutoMetricasVisiveis(prev => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }, []);

  const toggleAutoGraficoVisivel = useCallback((canvasId: string) => {
    setAutoGraficosVisiveis(prev => ({ ...prev, [canvasId]: !(prev[canvasId] ?? true) }));
  }, []);

  /** ⭐ Detecta a melhor coluna correspondente a partir de termos de busca */
  const detectarColuna = useCallback((termos: string[]): string => {
    const todos = [...colunasNum, ...colunas];
    // 1. Match exato (normalizado)
    for (const t of termos) {
      const tNorm = t.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s_\-]+/g, '');
      for (const c of todos) {
        const cNorm = c.nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s_\-]+/g, '');
        if (cNorm === tNorm) return c.nome;
      }
    }
    // 2. Match parcial (um termo contém o outro)
    for (const t of termos) {
      const tNorm = t.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s_\-]+/g, '');
      for (const c of todos) {
        const cNorm = c.nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s_\-]+/g, '');
        if (cNorm.includes(tNorm) || tNorm.includes(cNorm)) return c.nome;
      }
    }
    return colunasNum[0]?.nome || colunas[0]?.nome || '';
  }, [colunas, colunasNum]);

  /** ⭐ Extrai TODOS os nomes de colunas de uma fórmula (incluindo especializadas) */
  const extrairColunasDaFormula = useCallback((formula: string): string[] => {
    const colunasEncontradas: string[] = [];
    // Regex pra capturar nomes após funções agregadas: SUM(NOME), AVG(NOME), etc.
    const funcRegex = /(?:SUM|AVG|MIN|MAX|COUNT(?:\s+DISTINCT)?)\s*\(\s*([^,)]+)\s*(?:\)|,)/gi;
    let match;
    while ((match = funcRegex.exec(formula)) !== null) {
      const col = match[1].trim();
      if (col !== '*' && !colunasEncontradas.includes(col)) colunasEncontradas.push(col);
    }
    // Capturar nomes após DIVIDE( e MULTIPLY(
    const divMulRegex = /(?:DIVIDE|MULTIPLY)\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/gi;
    while ((match = divMulRegex.exec(formula)) !== null) {
      for (let p = 1; p <= 2; p++) {
        const val = match[p].trim();
        // Se não é número e não é função aninhada, é nome de coluna
        if (!/^\d+(\.\d+)?$/.test(val) && !/^[A-Z_]+\s*\(/.test(val) && !colunasEncontradas.includes(val)) {
          colunasEncontradas.push(val);
        }
      }
    }
    // Capturar após FATURAMENTO_EST(
    const fatRegex = /FATURAMENTO_EST\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/gi;
    while ((match = fatRegex.exec(formula)) !== null) {
      for (let p = 1; p <= 2; p++) {
        const val = match[p].trim();
        if (!colunasEncontradas.includes(val)) colunasEncontradas.push(val);
      }
    }
    // Capturar tokens que parecem nomes de colunas (palavras em maiúsculo, > 2 chars)
    const tokenRegex = /\b([A-ZÀ-Ú][A-ZÀ-Ú0-9\s_]+[A-ZÀ-Ú0-9])\b/g;
    while ((match = tokenRegex.exec(formula)) !== null) {
      const val = match[1].trim();
      const funcoes = ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'ROUND', 'IF', 'ABS', 'MEDIAN', 'PERCENTILE', 'MULTIPLY', 'DIVIDE', 'FATURAMENTO_EST', 'DISTINCT', 'SE'];
      if (val.length > 2 && !funcoes.includes(val) && !/^\d+(\.\d+)?$/.test(val) && !colunasEncontradas.includes(val)) {
        colunasEncontradas.push(val);
      }
    }
    return [...new Set(colunasEncontradas)];
  }, []);

  /** ⭐ Substitui TODAS as colunas de uma fórmula pelos nomes reais detectados na planilha */
  const substituirTodasColunasNaFormula = useCallback((formula: string): string => {
    const colunasFormula = extrairColunasDaFormula(formula);
    let resultado = formula;
    for (const col of colunasFormula) {
      const colReal = detectarColuna([col]);
      if (colReal && colReal !== col) {
        const reEscape = col.replace(/[.*+?^${}()|[\]\\]/g, char => "\\" + char);
        resultado = resultado.replace(new RegExp("\\b" + reEscape + "\\b", "g"), colReal);
      }
    }
    return resultado;
  }, [detectarColuna, extrairColunasDaFormula]);

  const fixarMetricaComoKpi = useCallback((metrica: IndicadorAutomatico) => {
    const formula = FORMULAS_RESUMO_EXECUTIVO.find(f => f.key === metrica.key);
    if (!formula) return;

    // ⭐ Usa a função genérica que substitui TODAS as colunas da fórmula
    const expressao = substituirTodasColunasNaFormula(formula.formula);
    const colunasUsadas = extrairColunasDaFormula(expressao);

    setKpis(prev => [...prev, {
      nome: colunasUsadas[0] || primeiraColunaNum,
      label: metrica.label,
      agregacao: 'sum' as const,
      formato: formula.formato,
      ativo: true,
      expressao,
      colunasUsadas: colunasUsadas.filter(Boolean),
      valoresFixos: {},
      descricao: formula.descricao,
      unidade: formula.unidade,
      categoria: formula.categoria,
      cor: formula.cor,
      meta: null,
      alerta: null,
      automatico: true,
      visivelNoExecutivo: autoMetricasVisiveis[metrica.key] ?? true,
      metricaKey: metrica.key,
    }]);
  }, [substituirTodasColunasNaFormula, extrairColunasDaFormula, primeiraColunaNum, autoMetricasVisiveis]);

  const atualizarKpi = useCallback((idx: number, campo: string, valor: any) => {
    setKpis(prev => prev.map((k, i) => i === idx ? { ...k, [campo]: valor } : k));
  }, []);

  /* ═══ Validação local de sintaxe (antes do HTTP) ═══ */
  const validarFormulaLocal = useCallback((expressao: string): string | null => {
    if (!expressao?.trim()) return 'Expressão vazia';

    // 1. Parênteses balanceados
    let profundidade = 0;
    for (let i = 0; i < expressao.length; i++) {
      if (expressao[i] === '(') profundidade++;
      else if (expressao[i] === ')') profundidade--;
      if (profundidade < 0) return 'Parêntese de fechamento sem abertura correspondente';
    }
    if (profundidade > 0) return `Faltam ${profundidade} parêntese(s) de fechamento`;

    // 2. Funções conhecidas
    const FUNCOES = new Set([
      'SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'ROUND', 'IF', 'ABS',
      'MEDIAN', 'PERCENTILE', 'MULTIPLY', 'DIVIDE', 'FATURAMENTO_EST',
      'COUNT DISTINCT', 'POWER', 'SQRT', 'LOG', 'CEIL', 'FLOOR',
    ]);
    const regex = /\b([A-Z_]+)\s*\(/g;
    let match;
    while ((match = regex.exec(expressao)) !== null) {
      const fn = match[1];
      if (!FUNCOES.has(fn) && !fn.startsWith('VALOR_') && fn !== 'IF') {
        return `Função não reconhecida: "${fn}"`;
      }
    }

    return null; // válida
  }, []);

  const fazerPreview = useCallback(async (idx: number) => {
    const kpi = kpis[idx];
    if (!kpi.expressao?.trim()) {
      setPreviewStates(prev => ({ ...prev, [idx]: { loading: false, valor: null, erro: 'Sem expressão' } }));
      return;
    }

    // ═══ Validação local ANTES de chamar o backend ═══
    const erroLocal = validarFormulaLocal(kpi.expressao);
    if (erroLocal) {
      setPreviewStates(prev => ({ ...prev, [idx]: { loading: false, valor: null, erro: erroLocal } }));
      return;
    }

    setPreviewStates(prev => ({ ...prev, [idx]: { loading: true, valor: null, erro: null } }));
    try {
      const body: any = { expressao: kpi.expressao, valoresFixos: kpi.valoresFixos || {} };
      if (filtrosAtivos) body.filtros = filtrosPreview;
      const res = await fetch('/api/contracts/' + contractId + '/servicos/' + servicoId + '/kpi-preview', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.valido) {
        const formatted = data.valor !== null ? formatarNumero(data.valor, kpi.formato) : '-';
        const totalInfo = data.totalRegistrosSemFiltro ? ` (${data.totalRegistros} de ${data.totalRegistrosSemFiltro} registros)` : '';
        setPreviewStates(prev => ({ ...prev, [idx]: { loading: false, valor: formatted + totalInfo, erro: null, colunasAusentes: data.colunasAusentes?.length > 0 ? data.colunasAusentes : undefined, valoresDisponiveis: data.valoresDisponiveis } }));
      } else {
        setPreviewStates(prev => ({ ...prev, [idx]: { loading: false, valor: null, erro: data.error || 'Erro no calculo' } }));
      }
    } catch {
      setPreviewStates(prev => ({ ...prev, [idx]: { loading: false, valor: null, erro: 'Erro de conexao' } }));
    }
  }, [kpis, contractId, servicoId, token, filtrosAtivos, filtrosPreview]);

  const aplicarFiltrosPreview = useCallback(() => {
    setFiltrosAtivos(Object.values(filtrosPreview).some(v => !!v));
    kpis.forEach((_, idx) => {
      if (previewTimeoutRef.current[idx]) clearTimeout(previewTimeoutRef.current[idx]);
      previewTimeoutRef.current[idx] = setTimeout(() => fazerPreview(idx), 300);
    });
  }, [filtrosPreview, kpis, fazerPreview]);

  const limparFiltrosPreview = useCallback(() => {
    setFiltrosPreview({});
    setFiltrosAtivos(false);
    kpis.forEach((_, idx) => {
      if (previewTimeoutRef.current[idx]) clearTimeout(previewTimeoutRef.current[idx]);
      previewTimeoutRef.current[idx] = setTimeout(() => fazerPreview(idx), 300);
    });
  }, [kpis, fazerPreview]);

  const agendarPreview = useCallback((idx: number) => {
    if (previewTimeoutRef.current[idx]) clearTimeout(previewTimeoutRef.current[idx]);
    previewTimeoutRef.current[idx] = setTimeout(() => fazerPreview(idx), 800);
  }, [fazerPreview]);

  const handleMoveUp = useCallback((idx: number) => {
    if (idx === 0) return;
    setKpis(prev => { const n = [...prev]; [n[idx-1], n[idx]] = [n[idx], n[idx-1]]; return n; });
  }, []);

  const handleMoveDown = useCallback((idx: number) => {
    if (idx === kpis.length - 1) return;
    setKpis(prev => { const n = [...prev]; [n[idx], n[idx+1]] = [n[idx+1], n[idx]]; return n; });
  }, [kpis.length]);

  const handleDuplicate = useCallback((idx: number) => {
    setKpis(prev => { const n = [...prev]; n.splice(idx + 1, 0, { ...prev[idx] }); return n; });
  }, []);

  const handleRemove = useCallback((idx: number) => {
    setKpis(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const aplicarFormulaPronta = useCallback((tpl: typeof FORMULAS_AUXILIARES[0]) => {
    // ⭐ Usa a função genérica que substitui TODAS as colunas da fórmula
    const formula = substituirTodasColunasNaFormula(tpl.formula);
    // Extrair colunas usadas da fórmula já substituída
    const colunasUsadas = extrairColunasDaFormula(formula);
    setKpis(prev => [...prev, {
      nome: colunasUsadas[0] || primeiraColunaNum, label: tpl.label, agregacao: 'sum' as const, formato: tpl.formato, ativo: true,
      expressao: formula, colunasUsadas: colunasUsadas.filter(Boolean), valoresFixos: {},
      descricao: tpl.descricao, unidade: tpl.unidade, categoria: tpl.categoria, cor: tpl.cor, meta: null, alerta: null,
      automatico: true, visivelNoExecutivo: true,
    }]);
  }, [substituirTodasColunasNaFormula, extrairColunasDaFormula, primeiraColunaNum]);

  const aplicarFormulaResumoExecutivo = useCallback((formula: typeof FORMULAS_RESUMO_EXECUTIVO[0]) => {
    // ⭐ Usa a função genérica que substitui TODAS as colunas da fórmula
    const expressao = substituirTodasColunasNaFormula(formula.formula);
    const colunasUsadas = extrairColunasDaFormula(expressao);

    setKpis(prev => [...prev, {
      nome: colunasUsadas[0] || primeiraColunaNum,
      label: formula.label,
      agregacao: 'sum' as const,
      formato: formula.formato,
      ativo: true,
      expressao,
      colunasUsadas: colunasUsadas.filter(Boolean),
      valoresFixos: {},
      descricao: formula.descricao,
      unidade: formula.unidade,
      categoria: formula.categoria,
      cor: formula.cor,
      meta: null,
      alerta: null,
      automatico: true,
      visivelNoExecutivo: true,
      metricaKey: formula.key,
    }]);
  }, [substituirTodasColunasNaFormula, extrairColunasDaFormula, primeiraColunaNum]);

  const adicionarFaturamento = useCallback(() => {
    const colTipo = colunasTexto.find(c => {
      const nome = c.nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return nome.includes('CAMINHAO') || nome.includes('TIPO');
    });
    const colPeso = colunasNum.find(c => {
      const nome = c.nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return nome.includes('PESO');
    });
    const tipoNome = colTipo?.nome || 'CAMINHAO';
    const pesoTipo = colPeso?.nome || 'PESO TOTAL';
    setKpis(prev => [...prev, {
      nome: pesoTipo, label: 'Faturamento Estimado', agregacao: 'sum', formato: 'moeda', ativo: true,
      expressao: 'FATURAMENTO_EST(' + pesoTipo + ', ' + tipoNome + ')',
      colunasUsadas: [pesoTipo, tipoNome], valoresFixos: {},
      descricao: 'Faturamento estimado considerando o tipo de caminhao de cada coleta.', unidade: ROTA,
    }]);
  }, [colunasTexto, colunasNum]);

  const adicionarNovoKpi = useCallback(() => {
    setKpis(prev => [...prev, {
      nome: primeiraColunaNum, label: 'Novo KPI', agregacao: 'sum', formato: 'numero', ativo: true,
      expressao: '', colunasUsadas: [], valoresFixos: {},
      descricao: '', unidade: '', categoria: '', cor: '', meta: null, alerta: null,
    }]);
  }, [primeiraColunaNum]);

  const handleSave = useCallback(async () => {
    await onSave(kpis, graficos, autoMetricasVisiveis, autoGraficosVisiveis);
  }, [kpis, graficos, onSave, autoMetricasVisiveis, autoGraficosVisiveis]);

  const containerStyle: React.CSSProperties = mode === 'modal'
    ? { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }
    : {};

  const contentStyle: React.CSSProperties = mode === 'modal'
    ? { flex: 1, overflow: 'auto', padding: '0.75rem 1rem' }
    : { padding: '1.5rem 2rem', maxWidth: '900px', margin: '0 auto' };

  return (
    <div style={containerStyle}>
      {mode === 'page' && (
        <div style={{ marginBottom: '1rem' }}>
          <button className="btn btn-ghost" onClick={onBack}>
            <FiArrowLeft size={14} /> Voltar ao Dashboard Principal
          </button>
          <h2 style={{ margin: '0.25rem 0 0.1rem', fontSize: '1.2rem' }}>
            Configurar Indicadores
          </h2>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
            {servicoNome} — Defina KPIs, gráficos e configure as colunas da planilha
          </p>
        </div>
      )}

      <div className="tabs">
        {[
          { id: 'kpis', label: '📊 Indicadores (KPIs)' },
          { id: 'graficos', label: '📈 Gráficos' },
          { id: 'filtros', label: `🔍 Filtros${filtrosAtivos ? ' ✅' : ''}` },
          { id: 'colunas', label: '📋 Colunas' },
        ].map(tab => (
          <button key={tab.id} className={`tab ${tabAtiva === tab.id ? 'active' : ''}`} onClick={() => setTabAtiva(tab.id as any)}>
            {tab.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '-2px' }}>
          <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--color-border-dark)' }}>
            <button onClick={() => setModoExibicao('simples')}
              style={{ padding: '0.25rem 0.5rem', border: 'none', background: modoExibicao === 'simples' ? 'var(--color-primary-light)' : '#fff', fontSize: '0.68rem', fontWeight: 600, color: modoExibicao === 'simples' ? 'var(--color-primary-dark)' : 'var(--color-text-muted)', cursor: 'pointer' }}>Simples</button>
            <button onClick={() => setModoExibicao('completo')}
              style={{ padding: '0.25rem 0.5rem', border: 'none', background: modoExibicao === 'completo' ? 'var(--color-primary-light)' : '#fff', fontSize: '0.68rem', fontWeight: 600, color: modoExibicao === 'completo' ? 'var(--color-primary-dark)' : 'var(--color-text-muted)', cursor: 'pointer' }}>Completo</button>
          </div>
        </div>
      </div>

      <div style={contentStyle}>
        {tabAtiva === 'kpis' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" onClick={adicionarNovoKpi}>
                + Novo Indicador
              </button>

              <div style={{ position: 'relative' }}>
                <button type="button" onClick={() => setMostrarFiltroFormulas(!mostrarFiltroFormulas)}
                  style={{ padding: '0.3rem 0.6rem', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '6px', fontSize: '0.78rem', color: '#b45309', fontWeight: 600, cursor: 'pointer' }}>
                  + Fórmulas Prontas
                </button>
                {mostrarFiltroFormulas && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 100, minWidth: '320px', maxHeight: '350px', overflow: 'auto' }}>
                    <div style={{ padding: '0.4rem 0.6rem', borderBottom: '1px solid #f1f5f9', fontSize: '0.68rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                      Fórmulas Pré-Definidas
                    </div>
                    {FORMULAS_AUXILIARES.map((tpl, idx) => (
                      <button key={idx} type="button"
                        onClick={() => { aplicarFormulaPronta(tpl); setMostrarFiltroFormulas(false); }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.4rem 0.65rem', border: 'none', borderBottom: '1px solid #f8fafc', background: '#fff', cursor: 'pointer', fontSize: '0.78rem', color: '#1e293b' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#fefce8'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: tpl.cor, flexShrink: 0 }} />
                          <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '0.05rem 0.3rem', borderRadius: '3px', background: '#fef3c7', color: '#b45309' }}>{tpl.categoria}</span>
                          <span style={{ fontWeight: 600 }}>{tpl.label}</span>
                          <span style={{ marginLeft: 'auto', fontSize: '0.6rem', padding: '0.05rem 0.3rem', borderRadius: '3px', background: '#f1f5f9', color: '#64748b' }}>
                            {tpl.formato === 'moeda' ? ROTA : tpl.formato === 'porcentagem' ? '%' : 'No'}
                          </span>
                        </div>
                        <code style={{ fontSize: '0.65rem', color: '#7c3aed', fontFamily: 'monospace', display: 'block', marginTop: '0.1rem', paddingLeft: '0.3rem' }}>{tpl.formula}</code>
                        <div style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '0.05rem', paddingLeft: '0.3rem' }}>{tpl.descricao}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ position: 'relative' }}>
                <button type="button" onClick={() => setMostrarFormulasResumo(!mostrarFormulasResumo)}
                  style={{ padding: '0.3rem 0.6rem', background: '#f0fdf4', border: '1px solid #22c55e', borderRadius: '6px', fontSize: '0.78rem', color: '#15803d', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <FiFileText size={12} /> Do Resumo Executivo
                </button>
                {mostrarFormulasResumo && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '4px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 100, minWidth: '380px', maxHeight: '400px', overflow: 'auto' }}>
                    <div style={{ padding: '0.4rem 0.6rem', borderBottom: '1px solid #f1f5f9', fontSize: '0.68rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase', background: '#f0fdf4' }}>
                      📊 Métricas Primárias
                    </div>
                    {FORMULAS_RESUMO_EXECUTIVO.filter(f => f.tipo === 'primaria').map((f) => (
                      <button key={f.key} type="button"
                        onClick={() => { aplicarFormulaResumoExecutivo(f); setMostrarFormulasResumo(false); }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.4rem 0.65rem', border: 'none', borderBottom: '1px solid #f8fafc', background: '#fff', cursor: 'pointer', fontSize: '0.78rem', color: '#1e293b' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f0fdf4'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: f.cor, flexShrink: 0 }} />
                          <span style={{ fontWeight: 600 }}>{f.label}</span>
                          <span style={{ marginLeft: 'auto', fontSize: '0.6rem', padding: '0.05rem 0.3rem', borderRadius: '3px', background: '#f1f5f9', color: '#64748b' }}>{f.formato === 'moeda' ? ROTA : f.formato === 'porcentagem' ? '%' : 'No'}</span>
                        </div>
                        <code style={{ fontSize: '0.65rem', color: '#7c3aed', fontFamily: 'monospace', display: 'block', marginTop: '0.1rem', paddingLeft: '0.3rem' }}>{f.formula}</code>
                        <div style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '0.05rem', paddingLeft: '0.3rem' }}>{f.descricao}</div>
                      </button>
                    ))}
                    <div style={{ padding: '0.4rem 0.6rem', borderBottom: '1px solid #f1f5f9', fontSize: '0.68rem', fontWeight: 700, color: '#0891b2', textTransform: 'uppercase', background: '#ecfeff', marginTop: '0.25rem' }}>
                      📈 Métricas Secundárias
                    </div>
                    {FORMULAS_RESUMO_EXECUTIVO.filter(f => f.tipo === 'secundaria').map((f) => (
                      <button key={f.key} type="button"
                        onClick={() => { aplicarFormulaResumoExecutivo(f); setMostrarFormulasResumo(false); }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.4rem 0.65rem', border: 'none', borderBottom: '1px solid #f8fafc', background: '#fff', cursor: 'pointer', fontSize: '0.78rem', color: '#1e293b' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#ecfeff'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: f.cor, flexShrink: 0 }} />
                          <span style={{ fontWeight: 600 }}>{f.label}</span>
                          <span style={{ marginLeft: 'auto', fontSize: '0.6rem', padding: '0.05rem 0.3rem', borderRadius: '3px', background: '#f1f5f9', color: '#64748b' }}>{f.formato === 'moeda' ? ROTA : f.formato === 'porcentagem' ? '%' : 'No'}</span>
                        </div>
                        <code style={{ fontSize: '0.65rem', color: '#7c3aed', fontFamily: 'monospace', display: 'block', marginTop: '0.1rem', paddingLeft: '0.3rem' }}>{f.formula}</code>
                        <div style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '0.05rem', paddingLeft: '0.3rem' }}>{f.descricao}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button onClick={adicionarFaturamento}
                style={{ padding: '0.3rem 0.6rem', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '6px', fontSize: '0.78rem', color: '#b45309', fontWeight: 600, cursor: 'pointer' }}>
                + Faturamento
              </button>
            </div>

            {indicadoresAutomaticos.length > 0 && (
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem', paddingBottom: '0.4rem', borderBottom: '2px solid #e2e8f0' }}>
                  <div style={{ width: '6px', height: '20px', borderRadius: '3px', background: 'linear-gradient(180deg, #22c55e, #4ade80)', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                    Indicadores do Resumo Executivo
                  </span>
                  <span style={{ fontSize: '0.62rem', fontWeight: 600, color: '#64748b', background: '#f1f5f9', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                    {indicadoresAutomaticos.length} disponíveis
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: '#94a3b8', fontStyle: 'italic' }}>
                    Visíveis no Dashboard Executivo
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.5rem' }}>
                  {indicadoresAutomaticos.map(metrica => {
                    const jaFixada = metricasFixadas.has(metrica.key);
                    const visivel = autoMetricasVisiveis[metrica.key] ?? true;
                    return (
                      <div key={metrica.key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.6rem', background: jaFixada ? '#f0fdf4' : visivel ? '#f8fafc' : '#f1f5f9', borderRadius: '8px', border: '1px solid ' + (jaFixada ? '#bbf7d0' : visivel ? '#e2e8f0' : '#e2e8f0'), opacity: visivel ? 1 : 0.55 }}>
                        <div style={{ width: '4px', height: '28px', borderRadius: '2px', background: metrica.cor, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.78rem', color: '#1e293b' }}>{metrica.label}</span>
                            <span style={{ fontSize: '0.55rem', fontWeight: 700, padding: '0.05rem 0.35rem', borderRadius: '3px', background: '#e0f2fe', color: '#0369a1', textTransform: 'uppercase' }}>Auto</span>
                            {jaFixada && (<span style={{ fontSize: '0.55rem', fontWeight: 700, padding: '0.05rem 0.35rem', borderRadius: '3px', background: '#fef3c7', color: '#b45309', textTransform: 'uppercase' }}>KPI</span>)}
                            <span style={{ fontSize: '0.5rem', fontWeight: 600, padding: '0.05rem 0.3rem', borderRadius: '2px', background: metrica.tipo === 'primaria' ? '#f0fdf4' : '#ecfeff', color: metrica.tipo === 'primaria' ? '#15803d' : '#0891b2' }}>
                              {metrica.tipo === 'primaria' ? 'Primária' : 'Secundária'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.62rem', color: '#64748b', marginTop: '0.1rem' }}>
                            {metrica.formato === 'moeda' ? 'R$' : metrica.formato === 'porcentagem' ? '%' : 'Número'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', flexShrink: 0 }}>
                          <button onClick={() => fixarMetricaComoKpi(metrica)} disabled={jaFixada}
                            title={jaFixada ? 'Já fixado como KPI' : `Fixar "${metrica.label}" como KPI`}
                            style={{ background: jaFixada ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)', border: jaFixada ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(34,197,94,0.3)', borderRadius: '5px', padding: '0.2rem 0.35rem', cursor: jaFixada ? 'not-allowed' : 'pointer', color: jaFixada ? '#fbbf24' : '#22c55e', fontSize: '0.6rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.15rem', opacity: jaFixada ? 0.7 : 1 }}>
                            <FiPlus size={10} /> {jaFixada ? 'Fixado' : 'Fixar KPI'}
                          </button>
                          <button onClick={() => toggleAutoMetricaVisivel(metrica.key)}
                            title={visivel ? 'Ocultar do Dashboard Executivo' : 'Mostrar no Dashboard Executivo'}
                            style={{ background: visivel ? 'rgba(59,130,246,0.1)' : 'rgba(100,116,139,0.1)', border: visivel ? '1px solid rgba(59,130,246,0.25)' : '1px solid rgba(100,116,139,0.2)', borderRadius: '5px', padding: '0.2rem 0.35rem', cursor: 'pointer', color: visivel ? '#3b82f6' : '#64748b', fontSize: '0.6rem', display: 'flex', alignItems: 'center' }}>
                            {visivel ? <FiEye size={11} /> : <FiEyeOff size={11} />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {kpis.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem', paddingBottom: '0.4rem', borderBottom: '2px solid #e2e8f0', marginTop: '0.5rem' }}>
                  <div style={{ width: '6px', height: '20px', borderRadius: '3px', background: 'linear-gradient(180deg, #a855f7, #c084fc)', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                    Indicadores Fixados ({kpis.length})
                  </span>
                </div>
                {kpis.map((kpi, i) => (
                  <KpiCardEditor key={i} kpi={kpi} idx={i} total={kpis.length}
                    colunas={colunas} colunasNum={colunasNum} colunasTexto={colunasTexto}
                    constantesGlobais={constantesGlobais} previewStates={previewStates}
                    modoExibicao={modoExibicao} onChange={atualizarKpi}
                    onMoveUp={handleMoveUp} onMoveDown={handleMoveDown}
                    onDuplicate={handleDuplicate} onRemove={handleRemove}
                    fazerPreview={fazerPreview} agendarPreview={agendarPreview} />
                ))}
              </div>
            )}

            {kpis.length === 0 && indicadoresAutomaticos.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--color-text-light)', fontSize: '0.85rem' }}>
                Nenhum indicador configurado. Clique em "+ Novo Indicador" para começar.
              </div>
            )}
          </div>
        )}

        {tabAtiva === 'graficos' && (
          <div>
            {GRAFICOS_AUTOMATICOS_EXECUTIVO.length > 0 && (
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem', paddingBottom: '0.4rem', borderBottom: '2px solid #e2e8f0' }}>
                  <div style={{ width: '6px', height: '20px', borderRadius: '3px', background: 'linear-gradient(180deg, #f59e0b, #fbbf24)', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                    Gráficos do Dashboard Executivo
                  </span>
                  <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontStyle: 'italic' }}>Pré-definidos — não editáveis</span>
                </div>
                {GRAFICOS_AUTOMATICOS_EXECUTIVO.map(grafico => {
                  const visivel = autoGraficosVisiveis[grafico.canvasId] ?? true;
                  return (
                    <div key={grafico.canvasId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.6rem', marginBottom: '0.4rem', background: visivel ? '#fffbeb' : '#f1f5f9', borderRadius: '8px', border: '1px solid ' + (visivel ? '#fde68a' : '#e2e8f0'), opacity: visivel ? 1 : 0.5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', background: '#fef3c7', borderRadius: '6px', color: '#b45309', flexShrink: 0 }}>
                        <FiLock size={13} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.78rem', color: '#1e293b' }}>{grafico.titulo}</span>
                          <span style={{ fontSize: '0.55rem', fontWeight: 700, padding: '0.05rem 0.35rem', borderRadius: '3px', background: '#fef3c7', color: '#92400e', textTransform: 'uppercase' }}>
                            {grafico.tipo === 'barra' ? 'Barras' : grafico.tipo === 'linha' ? 'Linha' : grafico.tipo === 'pizza' ? 'Pizza' : 'Barras Horiz'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '0.1rem' }}>{grafico.descricao}</div>
                      </div>
                      <button onClick={() => toggleAutoGraficoVisivel(grafico.canvasId)}
                        title={visivel ? 'Ocultar do Dashboard Executivo' : 'Mostrar no Dashboard Executivo'}
                        style={{ background: visivel ? 'rgba(59,130,246,0.1)' : 'rgba(100,116,139,0.1)', border: visivel ? '1px solid rgba(59,130,246,0.25)' : '1px solid rgba(100,116,139,0.2)', borderRadius: '5px', padding: '0.25rem 0.4rem', cursor: 'pointer', color: visivel ? '#3b82f6' : '#64748b', fontSize: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.2rem', flexShrink: 0 }}>
                        {visivel ? <FiEye size={12} /> : <FiEyeOff size={12} />}
                        <span style={{ fontWeight: 600 }}>{visivel ? 'Visível' : 'Oculto'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: '2px solid #e2e8f0' }}>
              <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.3px', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '6px', height: '20px', borderRadius: '3px', background: 'linear-gradient(180deg, #3b82f6, #60a5fa)', flexShrink: 0 }} />
                Gráficos Personalizados ({graficos.length})
              </h4>
              <button className="btn btn-sm btn-primary"
                onClick={() => setGraficos(prev => [...prev, { tipo: 'barra', titulo: 'Novo Gráfico', eixoX: colunasTexto[0]?.nome || colunas[0]?.nome || '', eixoY: colunasNum[0]?.nome || '', ativo: true }])}>
                + Adicionar Gráfico
              </button>
            </div>
            {graficos.map((g, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.6rem', marginBottom: '0.4rem', background: g.ativo ? 'var(--color-bg-section)' : 'var(--color-bg)', borderRadius: '8px', border: '1px solid var(--color-border)', opacity: g.ativo ? 1 : 0.5, flexWrap: 'wrap' }}>
                <input type="checkbox" checked={g.ativo} onChange={() => setGraficos(prev => prev.map((gr, j) => j === i ? { ...gr, ativo: !gr.ativo } : gr))} style={{ width: '16px', height: '16px' }} />
                <select value={g.tipo} onChange={e => setGraficos(prev => prev.map((gr, j) => j === i ? { ...gr, tipo: e.target.value as any } : gr))} className="form-select" style={{ fontSize: '0.78rem', padding: '0.3rem 0.4rem' }}>
                  <option value="barra">Barras</option><option value="linha">Linha</option><option value="pizza">Pizza</option>
                </select>
                <input value={g.titulo} onChange={e => setGraficos(prev => prev.map((gr, j) => j === i ? { ...gr, titulo: e.target.value } : gr))} placeholder="Título" className="form-input" style={{ flex: 1, minWidth: '120px', fontSize: '0.8rem' }} />
                <select value={g.eixoX} onChange={e => setGraficos(prev => prev.map((gr, j) => j === i ? { ...gr, eixoX: e.target.value } : gr))} className="form-select" style={{ fontSize: '0.78rem', padding: '0.3rem 0.4rem' }}>
                  <option value="">Eixo X</option>{colunasTexto.map(c => <option key={c.nome} value={c.nome}>{c.nome}</option>)}
                </select>
                <select value={g.eixoY} onChange={e => setGraficos(prev => prev.map((gr, j) => j === i ? { ...gr, eixoY: e.target.value } : gr))} className="form-select" style={{ fontSize: '0.78rem', padding: '0.3rem 0.4rem' }}>
                  <option value="">Eixo Y</option>{colunasNum.map(c => <option key={c.nome} value={c.nome}>{c.nome}</option>)}
                </select>
                <button onClick={() => setGraficos(prev => prev.filter((_, idx) => idx !== i))} className="btn btn-sm btn-danger">Remover</button>
              </div>
            ))}
            {graficos.length === 0 && (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-light)', fontSize: '0.85rem' }}>
                Nenhum gráfico personalizado.
              </div>
            )}
          </div>
        )}

        {tabAtiva === 'filtros' && (
          <div>
            <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '0.75rem' }}>
              Configure filtros para testar os KPIs com um subconjunto dos dados. Os filtros afetam apenas o <strong>preview</strong> dos indicadores.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
              <div className="filtro-group">
                <label>Tipo de Caminhão</label>
                <select className="filtro-select" value={filtrosPreview.tipoCaminhao || ''}
                  onChange={e => setFiltrosPreview(prev => ({ ...prev, tipoCaminhao: e.target.value || undefined }))} style={{ minWidth: '140px' }}>
                  <option value="">Todos</option>
                  {colunasTexto.filter(c => {
                    const n = c.nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    return n.includes('CAMINHAO') || n.includes('TIPO');
                  }).map(c => (<option key={c.nome} value={c.nome}>{c.nome}</option>))}
                </select>
              </div>
              <div className="filtro-group">
                <label>Placa</label>
                <input className="filtro-input" type="text" placeholder="Ex: ABC1D23"
                  value={filtrosPreview.placa || ''}
                  onChange={e => setFiltrosPreview(prev => ({ ...prev, placa: e.target.value || undefined }))} style={{ minWidth: '130px' }} />
              </div>
              <div className="filtro-group">
                <label>Regional</label>
                <input className="filtro-input" type="text" placeholder="Ex: NORTE"
                  value={filtrosPreview.regional || ''}
                  onChange={e => setFiltrosPreview(prev => ({ ...prev, regional: e.target.value || undefined }))} style={{ minWidth: '130px' }} />
              </div>
              <div className="date-range-group">
                <label>Período</label>
                <div className="date-range-inputs">
                  <input className="filtro-input range-start" type="date"
                    value={filtrosPreview.dataInicio || ''}
                    onChange={e => setFiltrosPreview(prev => ({ ...prev, dataInicio: e.target.value || undefined }))} />
                  <span className="range-sep">até</span>
                  <input className="filtro-input range-end" type="date"
                    value={filtrosPreview.dataFim || ''}
                    onChange={e => setFiltrosPreview(prev => ({ ...prev, dataFim: e.target.value || undefined }))} />
                </div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={aplicarFiltrosPreview} style={{ height: '32px', fontSize: '0.72rem' }}>
                <FiFilter size={12} /> Aplicar ao Preview
              </button>
              {filtrosAtivos && (
                <button className="btn btn-sm" onClick={limparFiltrosPreview}
                  style={{ height: '32px', fontSize: '0.72rem', color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '5px', padding: '0.3rem 0.5rem', cursor: 'pointer', fontWeight: 600 }}>
                  <FiX size={12} /> Limpar Filtros
                </button>
              )}
            </div>
            {filtrosAtivos && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.6rem 0.75rem', fontSize: '0.78rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <FiFilter size={13} />
                <strong>Filtros ativos no preview.</strong>
              </div>
            )}
          </div>
        )}

        {tabAtiva === 'colunas' && (
          <div>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
              Altere o tipo de cada coluna para que os valores sejam interpretados corretamente nos cálculos e gráficos.
            </p>
            <div className="table-container">
              <table className="table">
                <thead><tr><th>Coluna</th><th>Tipo</th><th style={{ textAlign: 'center' }}>Únicos</th><th>Amostras</th></tr></thead>
                <tbody>
                  {colunas.map((col, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{col.nome}</td>
                      <td>
                        <select value={col.tipo} onChange={async (e) => { if (onColunaTipoChange) await onColunaTipoChange(col.nome, e.target.value); }}
                          className="form-select" style={{ fontSize: '0.78rem', padding: '0.25rem 0.4rem', fontWeight: 600, color: col.tipo === 'numero' ? '#0369a1' : col.tipo === 'data' ? '#b45309' : col.tipo === 'hora' ? '#7c3aed' : col.tipo === 'texto' ? '#6d28d9' : 'var(--color-text-muted)' }}>
                          <option value="numero">Número</option><option value="texto">Texto</option><option value="data">Data</option><option value="hora">Hora</option><option value="desconhecido">Desconhecido</option>
                        </select>
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>{col.valoresUnicos}</td>
                      <td style={{ color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>{col.amostras.slice(0, 3).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem', paddingBottom: mode === 'modal' ? '0.5rem' : 0 }}>
        {mode === 'modal' && <button className="btn btn-secondary" onClick={onBack}>Cancelar</button>}
        <button className="btn btn-primary" onClick={handleSave} disabled={salvando} style={{ minWidth: '140px' }}>
          <FiSave size={15} /> {salvando ? 'Salvando...' : 'Salvar Configuração'}
        </button>
      </div>
    </div>
  );
}
