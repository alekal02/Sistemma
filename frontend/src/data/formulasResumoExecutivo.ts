/* ============================================
   CATÁLOGO DE FÓRMULAS DO RESUMO EXECUTIVO
   Fonte compartilhada entre:
     - ContratoDetalhe (modal de fórmulas)
     - KpiEditor (templates de KPI)
     - ExportPdfModal (documentação exportável)
   ============================================ */

/**
 * Placeholders de colunas usados nas fórmulas.
 * O KpiEditor substitui pelos nomes reais detectados na planilha.
 */
export const COL_PLACEHOLDERS = {
  PESO: 'PESO TOTAL',
  KM: 'KM TOTAL',
  HORA: 'HORA SAIDA',
  HORA_CHEGADA: 'HORA CHEGADA',
  PLACA: 'PLACA',
  TIPO: 'CAMINHAO',
} as const;

export interface FormulaResumo {
  key: string;
  label: string;
  tipo: 'primaria' | 'secundaria' | 'auxiliar';
  cor: string;
  /** Fórmula com placeholders de colunas */
  formula: string;
  descricao: string;
  /** Nomes dos placeholders usados (para detecção automática) */
  colunasUsadas: string[];
  /** Formato do resultado */
  formato: 'numero' | 'moeda' | 'porcentagem';
  /** Categoria para agrupamento no KpiEditor */
  categoria: string;
  /** Unidade de medida */
  unidade: string;
}

export const FORMULAS_RESUMO_EXECUTIVO: FormulaResumo[] = [
  // ═══ MÉTRICAS PRIMÁRIAS ═══
  {
    key: 'viagens',
    label: 'Viagens',
    tipo: 'primaria',
    cor: '#22c55e',
    formula: 'VIAGENS_VALIDADAS()',
    descricao: 'Total de viagens validadas no dashboard (linhas com KM, peso e rota completos)',
    colunasUsadas: [],
    formato: 'numero',
    categoria: 'Operacional',
    unidade: 'viagens',
  },
  {
    key: 'qtdColetores',
    label: 'Coletores (Veículos Únicos)',
    tipo: 'primaria',
    cor: '#8b5cf6',
    formula: 'COUNT DISTINCT(PLACA)',
    descricao: 'Quantidade de veículos/coletores únicos identificados pela placa',
    colunasUsadas: ['PLACA'],
    formato: 'numero',
    categoria: 'Operacional',
    unidade: 'veículos',
  },
  {
    key: 'pesoTotalTon',
    label: 'Tonelagem Total',
    tipo: 'primaria',
    cor: '#22c55e',
    formula: 'ROUND(SUM(PESO TOTAL) / 1000, 1)',
    descricao: 'Soma do peso em Kg convertida para toneladas',
    colunasUsadas: ['PESO TOTAL'],
    formato: 'numero',
    categoria: 'Operacional',
    unidade: 'ton',
  },
  {
    key: 'kmTotal',
    label: 'KM Rodados',
    tipo: 'primaria',
    cor: '#06b6d4',
    formula: 'ROUND(SUM(KM TOTAL), 0)',
    descricao: 'Soma total de KM rodados por todas as viagens',
    colunasUsadas: ['KM TOTAL'],
    formato: 'numero',
    categoria: 'Operacional',
    unidade: 'km',
  },
  {
    key: 'horasProdutivas',
    label: 'Horas Produtivas',
    tipo: 'primaria',
    cor: '#f59e0b',
    formula: 'SUM(HORA SAIDA)',
    descricao: 'Soma total de horas trabalhadas (formato decimal: 8.5 = 8h30)',
    colunasUsadas: ['HORA SAIDA'],
    formato: 'numero',
    categoria: 'Produtividade',
    unidade: 'h',
  },
  {
    key: 'faturamento',
    label: 'Faturamento Total',
    tipo: 'primaria',
    cor: '#f59e0b',
    formula: 'FATURAMENTO_EST(PESO TOTAL, CAMINHAO)',
    descricao: 'Calcula receita por tipo de caminhão usando VALOR_TRUCK, VALOR_TOCO, VALOR_MINI do contrato',
    colunasUsadas: ['PESO TOTAL', 'CAMINHAO'],
    formato: 'moeda',
    categoria: 'Financeiro',
    unidade: 'R$',
  },

  // ═══ MÉTRICAS SECUNDÁRIAS ═══
  {
    key: 'tonKm',
    label: 'Tonelada por KM Rodado',
    tipo: 'secundaria',
    cor: '#06b6d4',
    formula: 'ROUND(DIVIDE(SUM(PESO TOTAL), SUM(KM TOTAL)) / 1000, 4)',
    descricao: 'Relação peso total / KM total — eficiência de carga por distância',
    colunasUsadas: ['PESO TOTAL', 'KM TOTAL'],
    formato: 'numero',
    categoria: 'Eficiencia',
    unidade: 't/km',
  },
  {
    key: 'prodColetor',
    label: 'Média Ton/Coletor por Viagem',
    tipo: 'secundaria',
    cor: '#8b5cf6',
    formula: 'MEDIA_TON_POR_COLETOR()',
    descricao: 'Média de toneladas por coletor em cada viagem (PESO TOTAL ÷ Nº DE COLETORES)',
    colunasUsadas: ['PESO TOTAL', 'Nº DE COLETORES', 'COLETOR 01', 'COLETOR 02', 'COLETOR 03', 'COLETOR 04'],
    formato: 'numero',
    categoria: 'Produtividade',
    unidade: 't/coletor/viagem',
  },
  {
    key: 'kmMedioViagem',
    label: 'KM Médio por Viagem',
    tipo: 'secundaria',
    cor: '#22c55e',
    formula: 'ROUND(DIVIDE(SUM(KM TOTAL), VIAGENS_POR_ROTA()), 1)',
    descricao: 'Média de KM rodados por viagem (rotas 01–04)',
    colunasUsadas: ['KM TOTAL'],
    formato: 'numero',
    categoria: 'Operacional',
    unidade: 'km/viagem',
  },
  {
    key: 'tonMediaColeta',
    label: 'Tonelagem Média por Coleta',
    tipo: 'secundaria',
    cor: '#22c55e',
    formula: 'ROUND(DIVIDE(SUM(PESO TOTAL), VIAGENS_POR_ROTA()) / 1000, 2)',
    descricao: 'Peso médio em toneladas por viagem (rotas 01–04)',
    colunasUsadas: ['PESO TOTAL'],
    formato: 'numero',
    categoria: 'Operacional',
    unidade: 't/coleta',
  },
  {
    key: 'receitaKm',
    label: 'Receita por KM Rodado',
    tipo: 'secundaria',
    cor: '#f59e0b',
    formula: 'ROUND(DIVIDE(FATURAMENTO_EST(PESO TOTAL, CAMINHAO), SUM(KM TOTAL)), 2)',
    descricao: 'Faturamento dividido pelos KM rodados — rentabilidade por distância',
    colunasUsadas: ['PESO TOTAL', 'CAMINHAO', 'KM TOTAL'],
    formato: 'moeda',
    categoria: 'Financeiro',
    unidade: 'R$/km',
  },
  {
    key: 'receitaHora',
    label: 'Receita por Hora Produtiva',
    tipo: 'secundaria',
    cor: '#ef4444',
    formula: 'ROUND(DIVIDE(FATURAMENTO_EST(PESO TOTAL, CAMINHAO), HORAS_PRODUTIVAS(HR SAIDA BASE, HR CHEGA BASE)), 2)',
    descricao: 'Faturamento dividido pelas horas produtivas (HR CHEGA BASE - HR SAIDA BASE), usando HORAS_PRODUTIVAS que corrige virada de dia',
    colunasUsadas: ['PESO TOTAL', 'CAMINHAO', 'HR SAIDA BASE', 'HR CHEGA BASE'],
    formato: 'moeda',
    categoria: 'Financeiro',
    unidade: 'R$/h',
  },

  // ═══ FÓRMULAS AUXILIARES (modelos extras do KpiEditor) ═══
  {
    key: 'eficienciaHora',
    label: 'Eficiência por Hora',
    tipo: 'auxiliar',
    cor: '#14b8a6',
    formula: 'DIVIDE(SUM(KM TOTAL), SUM(HORA SAIDA))',
    descricao: 'KM rodados por hora trabalhada',
    colunasUsadas: ['KM TOTAL', 'HORA SAIDA'],
    formato: 'numero',
    categoria: 'Produtividade',
    unidade: 'km/h',
  },
  {
    key: 'ticketMedioViagem',
    label: 'Ticket Médio por Viagem',
    tipo: 'auxiliar',
    cor: '#a855f7',
    formula: 'DIVIDE(SUM(PESO TOTAL), VIAGENS_POR_ROTA())',
    descricao: 'Peso médio em Kg por viagem (rotas 01–04)',
    colunasUsadas: ['PESO TOTAL'],
    formato: 'numero',
    categoria: 'Operacional',
    unidade: 'kg',
  },
  {
    key: 'faturamentoEstimado',
    label: 'Faturamento Estimado (Peso × Valor)',
    tipo: 'auxiliar',
    cor: '#f59e0b',
    formula: 'MULTIPLY(PESO TOTAL, VALOR_TONELADA) / 1000',
    descricao: 'Faturamento baseado no peso × VALOR_TONELADA (ignora tipo de caminhão)',
    colunasUsadas: ['PESO TOTAL'],
    formato: 'moeda',
    categoria: 'Financeiro',
    unidade: 'R$',
  },
  {
    key: 'performancePesoHora',
    label: 'Performance (Peso/Hora)',
    tipo: 'auxiliar',
    cor: '#3b82f6',
    formula: 'DIVIDE(SUM(PESO TOTAL), SUM(HORA SAIDA))',
    descricao: 'Peso processado por hora trabalhada (kg/h)',
    colunasUsadas: ['PESO TOTAL', 'HORA SAIDA'],
    formato: 'numero',
    categoria: 'Produtividade',
    unidade: 'kg/h',
  },
  {
    key: 'indiceVariacao',
    label: 'Índice de Variação de Peso',
    tipo: 'auxiliar',
    cor: '#ec4899',
    formula: 'ROUND(AVG(PESO TOTAL) - MIN(PESO TOTAL), 1)',
    descricao: 'Diferença entre o peso médio e o peso mínimo coletado',
    colunasUsadas: ['PESO TOTAL'],
    formato: 'numero',
    categoria: 'Qualidade',
    unidade: 'kg',
  },
  {
    key: 'medianaPeso',
    label: 'Mediana de Peso',
    tipo: 'auxiliar',
    cor: '#8b5cf6',
    formula: 'MEDIAN(PESO TOTAL)',
    descricao: 'Valor central dos pesos coletados (menos sensível a outliers que a média)',
    colunasUsadas: ['PESO TOTAL'],
    formato: 'numero',
    categoria: 'Qualidade',
    unidade: 'kg',
  },
  {
    key: 'top25Peso',
    label: 'Top 25% Peso (Percentil 75)',
    tipo: 'auxiliar',
    cor: '#f97316',
    formula: 'PERCENTILE(PESO TOTAL, 0.75)',
    descricao: 'Valor de peso acima do qual estão os 25% maiores registros',
    colunasUsadas: ['PESO TOTAL'],
    formato: 'numero',
    categoria: 'Qualidade',
    unidade: 'kg',
  },
  {
    key: 'desempenhoCondicional',
    label: 'Desempenho (IF Condicional)',
    tipo: 'auxiliar',
    cor: '#22c55e',
    formula: 'IF(AVG(PESO TOTAL) > 10000, ROUND(AVG(PESO TOTAL) / 1000, 1), 0)',
    descricao: 'Se média de peso > 10.000kg, retorna toneladas; senão, 0',
    colunasUsadas: ['PESO TOTAL'],
    formato: 'numero',
    categoria: 'Eficiencia',
    unidade: 'ton',
  },
  {
    key: 'kmMedioAvancado',
    label: 'KM Médio por Viagem (Média Simples)',
    tipo: 'auxiliar',
    cor: '#06b6d4',
    formula: 'AVG(KM TOTAL)',
    descricao: 'Média simples de KM por registro (sem ponderação)',
    colunasUsadas: ['KM TOTAL'],
    formato: 'numero',
    categoria: 'Operacional',
    unidade: 'km',
  },
  {
    key: 'mediaPesoSimples',
    label: 'Média de Peso por Registro',
    tipo: 'auxiliar',
    cor: '#22c55e',
    formula: 'AVG(PESO TOTAL)',
    descricao: 'Média simples do peso em KG por registro',
    colunasUsadas: ['PESO TOTAL'],
    formato: 'numero',
    categoria: 'Operacional',
    unidade: 'kg',
  },
];

/**
 * Agrupa as fórmulas por categoria para exibição no dropdown do KpiEditor
 */
export const FORMULAS_POR_CATEGORIA = FORMULAS_RESUMO_EXECUTIVO.reduce((acc, f) => {
  if (!acc[f.categoria]) acc[f.categoria] = [];
  acc[f.categoria].push(f);
  return acc;
}, {} as Record<string, FormulaResumo[]>);

/**
 * Retorna as fórmulas filtradas por tipo (primaria/secundaria)
 */
export function filtrarPorTipo(tipo: 'primaria' | 'secundaria'): FormulaResumo[] {
  return FORMULAS_RESUMO_EXECUTIVO.filter(f => f.tipo === tipo);
}

// ═══════════════════════════════════════════════════════════════
// CATEGORIAS ESPECIALIZADAS — Fórmulas por Tipo de Atividade
// ═══════════════════════════════════════════════════════════════

/**
 * Catálogo de fórmulas por categoria de serviço.
 * Usado pelo AutoIndicatorService e pelo KpiEditor para gerar KPIs direcionados.
 */
export interface FormulaPorCategoria {
  categoria: string;
  label: string;
  descricao: string;
  cor: string;
  indicadores: {
    nome: string;
    label: string;
    expressao: string;
    colunasUsadas: string[];
    formato: 'numero' | 'moeda' | 'porcentagem';
    unidade: string;
    descricao: string;
  }[];
}

export const FORMULAS_POR_CATEGORIA_SERVICO: FormulaPorCategoria[] = [
  // ─── ROÇADA ───
  {
    categoria: 'rocada',
    label: 'Roçada',
    descricao: 'Indicadores de roçada — m2 roçados por bairro, equipamento, operador, hora trabalhada, dia e equipe',
    cor: '#22c55e',
    indicadores: [
      {
        nome: 'm2_por_bairro',
        label: 'M² por Bairro',
        expressao: 'ROUND(DIVIDE(SUM(M2), COUNT DISTINCT(BAIRRO)), 1)',
        colunasUsadas: ['M2', 'BAIRRO'],
        formato: 'numero',
        unidade: 'm²/bairro',
        descricao: 'Média de metros quadrados roçados por bairro — indica a distribuição geográfica do serviço de roçada',
      },
      {
        nome: 'm2_por_equipamento',
        label: 'M² por Equipamento',
        expressao: 'ROUND(DIVIDE(SUM(M2), COUNT DISTINCT(EQUIPAMENTO)), 1)',
        colunasUsadas: ['M2', 'EQUIPAMENTO'],
        formato: 'numero',
        unidade: 'm²/equip',
        descricao: 'Média de metros quadrados roçados por equipamento utilizado — produtividade dos equipamentos de roçada',
      },
      {
        nome: 'm2_por_operador',
        label: 'M² por Operador',
        expressao: 'ROUND(DIVIDE(SUM(M2), COUNT DISTINCT(OPERADOR)), 1)',
        colunasUsadas: ['M2', 'OPERADOR'],
        formato: 'numero',
        unidade: 'm²/operador',
        descricao: 'Média de metros quadrados roçados por operador — produtividade individual dos operadores de roçada',
      },
      {
        nome: 'receita_m2_hora',
        label: 'Receita M² por Hora',
        expressao: 'ROUND(DIVIDE(SUM(M2) * VALOR_M2, SUM(HORAS)), 2)',
        colunasUsadas: ['M2', 'HORAS'],
        formato: 'moeda',
        unidade: 'R$/h',
        descricao: 'Receita estimada por hora de roçada com base no VALOR_M2 do contrato — rentabilidade por hora trabalhada',
      },
      {
        nome: 'm2_por_dia',
        label: 'M² por Dia',
        expressao: 'ROUND(DIVIDE(SUM(M2), COUNT DISTINCT(DATA)), 1)',
        colunasUsadas: ['M2', 'DATA'],
        formato: 'numero',
        unidade: 'm²/dia',
        descricao: 'Média de metros quadrados roçados por dia útil — produtividade diária da operação de roçada',
      },
      {
        nome: 'm2_por_equipe',
        label: 'M² por Equipe',
        expressao: 'ROUND(DIVIDE(SUM(M2), COUNT DISTINCT(EQUIPE)), 1)',
        colunasUsadas: ['M2', 'EQUIPE'],
        formato: 'numero',
        unidade: 'm²/equipe',
        descricao: 'Média de metros quadrados roçados por equipe alocada — produtividade das equipes de roçada',
      },
    ],
  },

  // ─── VARRIÇÃO ───
  {
    categoria: 'varricao',
    label: 'Varrição',
    descricao: 'Indicadores de varrição — varredores por dia e km varrido por dia',
    cor: '#06b6d4',
    indicadores: [
      {
        nome: 'varredores_por_dia',
        label: 'Varredores por Dia',
        expressao: 'ROUND(DIVIDE(SUM(VARREDORES), COUNT DISTINCT(DATA)), 1)',
        colunasUsadas: ['VARREDORES', 'DATA'],
        formato: 'numero',
        unidade: 'varredores/dia',
        descricao: 'Média de varredores alocados por dia — dimensionamento da equipe de varrição',
      },
      {
        nome: 'km_varrido_por_dia',
        label: 'KM Varrido por Dia',
        expressao: 'ROUND(DIVIDE(SUM(KM VARRIDO), COUNT DISTINCT(DATA)), 1)',
        colunasUsadas: ['KM VARRIDO', 'DATA'],
        formato: 'numero',
        unidade: 'km/dia',
        descricao: 'Média de quilômetros varridos por dia — produtividade diária da varrição',
      },
    ],
  },

  // ─── PODA ───
  {
    categoria: 'poda',
    label: 'Poda',
    descricao: 'Indicadores de poda de árvores — quantidade de árvores por dia, podadas e extirpadas',
    cor: '#8b5cf6',
    indicadores: [
      {
        nome: 'arvores_por_dia',
        label: 'Árvores por Dia',
        expressao: 'ROUND(DIVIDE(COUNT(*), COUNT DISTINCT(DATA)), 1)',
        colunasUsadas: ['DATA'],
        formato: 'numero',
        unidade: 'árvores/dia',
        descricao: 'Média de árvores podadas por dia útil — produtividade diária da operação de poda',
      },
      {
        nome: 'arvores_podadas',
        label: 'Árvores Podadas',
        expressao: 'COUNT(*)',
        colunasUsadas: [],
        formato: 'numero',
        unidade: 'árvores',
        descricao: 'Quantidade total de árvores podadas no período — volume total do serviço de poda',
      },
      {
        nome: 'arvores_extirpadas',
        label: 'Árvores Extirpadas',
        expressao: 'COUNT(*)',
        colunasUsadas: [],
        formato: 'numero',
        unidade: 'árvores',
        descricao: 'Quantidade total de árvores extirpadas/removidas no período — total de remoções de árvores',
      },
    ],
  },

  // ─── REMOÇÃO ───
  {
    categoria: 'remocao',
    label: 'Remoção',
    descricao: 'Indicadores de remoção de entulho/materiais — equipes, toneladas por dia, equipe e equipamento',
    cor: '#f59e0b',
    indicadores: [
      {
        nome: 'equipes_por_dia',
        label: 'Equipes por Dia',
        expressao: 'ROUND(DIVIDE(COUNT DISTINCT(EQUIPE), COUNT DISTINCT(DATA)), 1)',
        colunasUsadas: ['EQUIPE', 'DATA'],
        formato: 'numero',
        unidade: 'equipes/dia',
        descricao: 'Média de equipes de remoção alocadas por dia — dimensionamento da força de trabalho',
      },
      {
        nome: 'toneladas_por_dia',
        label: 'Toneladas por Dia',
        expressao: 'ROUND(DIVIDE(SUM(PESO) / 1000, COUNT DISTINCT(DATA)), 2)',
        colunasUsadas: ['PESO', 'DATA'],
        formato: 'numero',
        unidade: 't/dia',
        descricao: 'Média de toneladas removidas por dia — produtividade diária da operação de remoção',
      },
      {
        nome: 'tonelada_por_equipe',
        label: 'Tonelada por Equipe',
        expressao: 'ROUND(DIVIDE(SUM(PESO) / 1000, COUNT DISTINCT(EQUIPE)), 2)',
        colunasUsadas: ['PESO', 'EQUIPE'],
        formato: 'numero',
        unidade: 't/equipe',
        descricao: 'Tonelagem média removida por equipe — produtividade das equipes de remoção',
      },
      {
        nome: 'tonelada_por_equipamento',
        label: 'Tonelada por Equipamento',
        expressao: 'ROUND(DIVIDE(SUM(PESO) / 1000, COUNT DISTINCT(EQUIPAMENTO)), 2)',
        colunasUsadas: ['PESO', 'EQUIPAMENTO'],
        formato: 'numero',
        unidade: 't/equip',
        descricao: 'Tonelagem média removida por equipamento utilizado — produtividade dos equipamentos',
      },
    ],
  },

  // ─── LIMPEZA DE FEIRAS ───
  {
    categoria: 'limpeza_feiras',
    label: 'Limpeza de Feiras',
    descricao: 'Indicadores de limpeza de feiras livres — m² e varredores por dia',
    cor: '#14b8a6',
    indicadores: [
      {
        nome: 'm2_dia_feiras',
        label: 'M² por Dia (Feiras)',
        expressao: 'ROUND(DIVIDE(SUM(M2_FEIRAS), COUNT DISTINCT(DATA)), 1)',
        colunasUsadas: ['M2_FEIRAS', 'DATA'],
        formato: 'numero',
        unidade: 'm²/dia',
        descricao: 'Média de metros quadrados limpos por dia nas feiras livres — produtividade diária da limpeza',
      },
      {
        nome: 'varredores_dia_feiras',
        label: 'Varredores por Dia (Feiras)',
        expressao: 'ROUND(DIVIDE(SUM(VARREDORES_FEIRAS), COUNT DISTINCT(DATA)), 1)',
        colunasUsadas: ['VARREDORES_FEIRAS', 'DATA'],
        formato: 'numero',
        unidade: 'varredores/dia',
        descricao: 'Média de varredores alocados por dia nas feiras livres — dimensionamento da equipe',
      },
    ],
  },

  // ─── MELHORIAS OPERACIONAIS ───
  {
    categoria: 'melhorias_operacionais',
    label: 'Melhorias Operacionais',
    descricao: 'Rankings e indicadores de desempenho operacional — melhores motoristas, coletores e rotas',
    cor: '#3b82f6',
    indicadores: [
      {
        nome: 'melhores_motoristas',
        label: 'Melhores Motoristas (Ranking)',
        expressao: 'ROUND(SUM(PESO) / 1000, 1)',
        colunasUsadas: ['PESO'],
        formato: 'numero',
        unidade: 't',
        descricao: 'Ranking de motoristas por tonelagem transportada — identifica os motoristas mais produtivos (agrupar por MOTORISTA)',
      },
      {
        nome: 'melhores_coletores',
        label: 'Melhores Coletores (Ranking)',
        expressao: 'ROUND(SUM(PESO) / 1000 / COUNT DISTINCT(DATA), 2)',
        colunasUsadas: ['PESO', 'DATA'],
        formato: 'numero',
        unidade: 't/dia',
        descricao: 'Ranking de coletores por produtividade diária (ton/dia) — identifica os coletores mais eficientes (agrupar por COLETOR)',
      },
      {
        nome: 'melhores_rotas',
        label: 'Melhores Rotas (Ranking)',
        expressao: 'ROUND(SUM(PESO) / 1000, 1)',
        colunasUsadas: ['PESO'],
        formato: 'numero',
        unidade: 't',
        descricao: 'Ranking de rotas por tonelagem total transportada — identifica as rotas de maior volume (agrupar por ROTA)',
      },
    ],
  },
];

/**
 * Retorna as fórmulas de uma categoria específica
 */
export function getFormulasPorCategoria(categoria: string): FormulaPorCategoria | undefined {
  return FORMULAS_POR_CATEGORIA_SERVICO.find(f => f.categoria === categoria);
}

/**
 * Retorna todas as fórmulas de categorias especializadas como fórmulas auxiliares
 * para uso no KpiEditor (dropdown "Fórmulas Prontas")
 */
export function getTodasFormulasEspecializadas(): FormulaResumo[] {
  const resultado: FormulaResumo[] = [];
  for (const cat of FORMULAS_POR_CATEGORIA_SERVICO) {
    for (const ind of cat.indicadores) {
      resultado.push({
        key: `${cat.categoria}_${ind.nome}`,
        label: `${ind.label} — ${cat.label}`,
        tipo: 'auxiliar',
        cor: cat.cor,
        formula: ind.expressao,
        descricao: ind.descricao,
        colunasUsadas: ind.colunasUsadas,
        formato: ind.formato,
        categoria: cat.label,
        unidade: ind.unidade,
      });
    }
  }
  return resultado;
}
