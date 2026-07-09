export type GrupoExecutivo = 'financeiro' | 'operacional' | 'graficos' | 'analises';

export interface WidgetExecutivo {
  id: string;
  label: string;
  grupo: GrupoExecutivo;
  descricao?: string;
}

export const GRUPOS_EXECUTIVO: Record<GrupoExecutivo, { titulo: string; cor: string }> = {
  financeiro: { titulo: 'Painel Financeiro', cor: '#22c55e' },
  operacional: { titulo: 'Painel Operacional', cor: '#3b82f6' },
  graficos: { titulo: 'Gráficos', cor: '#a855f7' },
  analises: { titulo: 'Análises detalhadas', cor: '#f59e0b' },
};

export const WIDGETS_EXECUTIVO: WidgetExecutivo[] = [
  { id: 'fin_faturamento', label: 'Faturamento Total', grupo: 'financeiro' },
  { id: 'fin_custo', label: 'Custo Operacional', grupo: 'financeiro' },
  { id: 'fin_margem', label: 'Margem Bruta', grupo: 'financeiro' },
  { id: 'fin_receita_hora', label: 'Receita por Hora', grupo: 'financeiro' },
  { id: 'fin_ticket', label: 'Ticket Médio', grupo: 'financeiro' },

  { id: 'op_tonelagem', label: 'Tonelagem', grupo: 'operacional' },
  { id: 'op_km', label: 'KM Rodados', grupo: 'operacional' },
  { id: 'op_viagens', label: 'Viagens', grupo: 'operacional' },
  { id: 'op_coletores', label: 'Coletores Ativos', grupo: 'operacional' },
  { id: 'op_horas', label: 'Horas Produtivas', grupo: 'operacional' },
  { id: 'op_eficiencia', label: 'Eficiência (t/km)', grupo: 'operacional' },

  { id: 'chart_receita_km', label: 'Receita por Km (7 dias)', grupo: 'graficos' },
  { id: 'chart_receita_hora', label: 'Receita por Hora (7 dias)', grupo: 'graficos' },
  { id: 'chart_receita_diaria', label: 'Evolução Diária de Receita', grupo: 'graficos' },
  { id: 'chart_ranking_motoristas', label: 'Top Motoristas por Receita', grupo: 'graficos' },
  { id: 'chart_receita_regional', label: 'Receita por Regional', grupo: 'graficos' },
  { id: 'chart_receita_diasemana', label: 'Receita por Dia da Semana', grupo: 'graficos' },
  { id: 'chart_receita_turno', label: 'Receita por Turno', grupo: 'graficos' },

  { id: 'sec_analise_financeira', label: 'Análise Financeira Detalhada', grupo: 'analises', descricao: 'Projeções, rankings e margens' },
  { id: 'sec_analise_operacional', label: 'Análise Operacional Detalhada', grupo: 'analises', descricao: 'KM/viagem, horas e coletores' },
  { id: 'sec_motoristas_rota', label: 'Análise por Motorista e Rota', grupo: 'analises', descricao: 'Ranking e comparativo de motoristas' },
];

export const LAYOUT_PADRAO_IDS = WIDGETS_EXECUTIVO.map(w => w.id);

const STORAGE_KEY = '@sistemma:executivo-layout';

export function carregarLayoutExecutivo(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set(LAYOUT_PADRAO_IDS);
    const ids = JSON.parse(raw) as string[];
    const validos = ids.filter(id => LAYOUT_PADRAO_IDS.includes(id));
    return validos.length > 0 ? new Set(validos) : new Set(LAYOUT_PADRAO_IDS);
  } catch {
    return new Set(LAYOUT_PADRAO_IDS);
  }
}

export function salvarLayoutExecutivo(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch { /* storage indisponível */ }
}

export function widgetsPorGrupo(grupo: GrupoExecutivo): WidgetExecutivo[] {
  return WIDGETS_EXECUTIVO.filter(w => w.grupo === grupo);
}

export function temGrupoAtivo(ativo: Set<string>, grupo: GrupoExecutivo): boolean {
  return WIDGETS_EXECUTIVO.some(w => w.grupo === grupo && ativo.has(w.id));
}

export function contarAtivos(ativo: Set<string>): number {
  return WIDGETS_EXECUTIVO.filter(w => ativo.has(w.id)).length;
}
