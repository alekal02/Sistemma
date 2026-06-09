/* ============================================
   TIPOS COMPARTILHADOS DO EDITOR DE KPI
   ============================================ */

export interface ColunaDetectada {
  nome: string;
  tipo: 'numero' | 'texto' | 'data' | 'hora' | 'desconhecido';
  amostras: (string | number | null)[];
  valoresUnicos: number;
  nulos: number;
}

export interface KpiConfig {
  id?: string;
  nome: string;
  label: string;
  descricao?: string;
  unidade?: string;
  categoria?: string;
  cor?: string;
  meta?: number | null;
  alerta?: 'acima' | 'abaixo' | null;
  agregacao: 'sum' | 'avg' | 'count' | 'min' | 'max';
  formato: 'numero' | 'moeda' | 'porcentagem';
  ativo: boolean;
  operacao?: string;
  valorFixo?: number | null;
  coluna2?: string;
  expressao?: string;
  colunasUsadas?: string[];
  valoresFixos?: Record<string, number>;
  /** Indica se este KPI veio de uma métrica automática do resumo executivo */
  automatico?: boolean;
  /** Se deve ser exibido no DashboardExecutivo */
  visivelNoExecutivo?: boolean;
  /** Chave de referência para a métrica automática (ex: 'viagens', 'faturamento') */
  metricaKey?: string;
  /** ID do KPI Universal de origem (se veio da biblioteca universal) */
  origemUniversal?: string;
  /** Lista de placeholders que não foram resolvidos automaticamente */
  placeholdersNaoResolvidos?: string[];
}

export interface GraficoConfig {
  tipo: 'barra' | 'linha' | 'pizza';
  titulo: string;
  eixoX: string;
  eixoY: string;
  ativo: boolean;
  /** Indica se é um gráfico automático do executivo (não editável) */
  automatico?: boolean;
  /** Descrição do gráfico para exibição na config */
  descricao?: string;
  /** ID do canvas usado no executivo (para identificar o gráfico automático) */
  canvasId?: string;
}

export interface ConstanteGlobal {
  valor: number;
  label: string;
}

export interface PreviewState {
  loading: boolean;
  valor: string | null;
  erro: string | null;
  /** Nomes das colunas que nao foram encontradas nos dados (debug) */
  colunasAusentes?: string[];
  /** Valores fixos disponiveis para uso na formula */
  valoresDisponiveis?: Record<string, number>;
}

export interface KpiEditorProps {
  mode: 'modal' | 'page';
  servicoNome: string;
  contractId: string;
  servicoId: string;
  token: string;
  colunas: ColunaDetectada[];
  colunasNum: ColunaDetectada[];
  colunasTexto: ColunaDetectada[];
  dadosBrutos: any[];
  constantesGlobais: Record<string, ConstanteGlobal>;
  kpis: KpiConfig[];
  onKpisChange: (kpis: KpiConfig[]) => void;
  graficos: GraficoConfig[];
  onGraficosChange: (graficos: GraficoConfig[]) => void;
  tabAtiva: 'kpis' | 'graficos' | 'colunas';
  onTabChange: (tab: 'kpis' | 'graficos' | 'colunas') => void;
  onSave: () => Promise<void>;
  onBack: () => void;
  salvando?: boolean;
  onColunaTipoChange?: (nome: string, tipo: string) => Promise<void>;
}

export const CATEGORIAS = ['Produtividade', 'Custo', 'Qualidade', 'Eficiencia', 'Operacional', 'Financeiro', 'Outro'];
export const UNIDADES = ['', 'kg', 'km', 'R$', '%', 'h', 'un', 'L', 'ton', 'm3'];

export const FMT_OPTS: { value: KpiConfig['formato']; label: string; bg: string; cor: string }[] = [
  { value: 'numero', label: 'No', bg: '#f1f5f9', cor: '#64748b' },
  { value: 'moeda', label: 'R$', bg: '#fef3c7', cor: '#b45309' },
  { value: 'porcentagem', label: '%', bg: '#dcfce7', cor: '#15803d' },
];

export const CORES_DISPONIVEIS = [
  '#059669', '#22c55e', '#f59e0b', '#a855f7', '#ef4444',
  '#14b8a6', '#3b82f6', '#ec4899', '#84cc16', '#06b6d4',
];

/* ─── Indicador Automático do Resumo Executivo ─── */
export interface IndicadorAutomatico {
  key: string;
  label: string;
  tipo: 'primaria' | 'secundaria';
  cor: string;
  formato: 'numero' | 'moeda' | 'porcentagem';
  descricao?: string;
  /** Se este indicador já foi fixado como KPI manual */
  jaFixado?: boolean;
  /** Se está visível no executivo */
  visivel: boolean;
}

/* ═══════════════════════════════════════════
   MODELO EXECUTIVO — Tipos
   ═══════════════════════════════════════════ */

export interface KpiModeloExecutivo {
  nome: string;
  formula: string;
  grupo: 'financeiro' | 'operacional' | 'grafico' | 'analise';
  formato: 'moeda' | 'numero' | 'porcentagem';
  label: string;
  descricao: string;
  unidade: string;
  cor: string;
  colunasUsadas: string[];
}

export interface GrupoModeloExecutivo {
  nome: string;
  cor: string;
  indicadores: KpiModeloExecutivo[];
}

export interface ModeloExecutivoResponse {
  modelo: GrupoModeloExecutivo[];
  valoresContrato: Record<string, number | null>;
  kpisExistentes: KpiConfig[];
  contratoNome: string;
  servicoNome: string;
  temModeloAplicado: boolean;
}

export interface AplicarModeloResponse {
  message: string;
  totalKpis: number;
  novosKpis: number;
  kpis: KpiConfig[];
  valoresFixos: Record<string, number>;
}

/* ─── Gráfico Automático do Executivo ─── */
export interface GraficoAutomaticoExecutivo {
  canvasId: string;
  titulo: string;
  tipo: 'barra' | 'linha' | 'pizza' | 'barra-horizontal';
  descricao: string;
  ativo: boolean;
  /** Eixos são fixos, não editáveis */
  eixoX: string;
  eixoY: string;
}
