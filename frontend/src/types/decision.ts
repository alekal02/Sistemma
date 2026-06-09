/* ============================================
   TIPOS PARA TOMADA DE DECISÃO
   Status, categoria e prioridades dos KPIs
   ============================================ */

/** Categoria do KPI */
export type CategoriaKpi = 'receita' | 'operacional' | 'indefinido'

/** Status do semáforo de decisão */
export type StatusDecisao = 'critico' | 'atencao' | 'ok'

/** Variação com classificação */
export interface VariacaoClassificada {
  valor: number        // percentual
  tipo: 'positiva' | 'negativa' | 'estavel'
  label: string        // ex: "▲ 12%"
}

/** KPI estendido com informações de decisão */
export interface KpiDecisao {
  id: string
  nome: string
  valor: number | null
  formatado: string
  formato: 'numero' | 'moeda' | 'porcentagem'
  
  // Categorização
  categoria: CategoriaKpi
  
  // Decisão
  status: StatusDecisao
  variacao: VariacaoClassificada
  
  // Meta (quando disponível)
  meta?: number | null
  progressoMeta?: number  // 0-100 percentual
  alertaDir?: 'acima' | 'abaixo'
  
  // Ações sugeridas
  acaoSugerida?: string
  motivo?: string  // por que está nesse status
}

/** Alerta/Prioridade gerado automaticamente */
export interface AlertaDecisao {
  id: string
  kpiNome: string
  categoria: CategoriaKpi
  status: StatusDecisao
  mensagem: string       // descrição do problema
  impacto: string        // impacto no negócio
  acaoSugerida: string   // o que fazer
  valorAtual: string
  variacao: string
}

/** Score geral de uma categoria */
export interface ScoreCategoria {
  categoria: CategoriaKpi
  status: StatusDecisao
  totalKpis: number
  kpisOk: number
  kpisAtencao: number
  kpisCriticos: number
  label: string
  icone: string
}

/** Resultado completo do motor de decisão */
export interface ResultadoDecisao {
  scores: ScoreCategoria[]
  prioridades: AlertaDecisao[]
  kpisPorCategoria: Record<CategoriaKpi, KpiDecisao[]>
  totalKpis: number
  temPrioridades: boolean
}
