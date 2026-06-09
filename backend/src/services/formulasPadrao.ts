/* ============================================
   CATÁLOGO CENTRAL DE FÓRMULAS
   Fonte única para o backend.
   O frontend pode consultar via API em vez de manter cópia local.
   ═════════════════════════════════════════════
   Este arquivo é a FONTE DA VERDADE para as fórmulas.
   O arquivo frontend/src/data/formulasResumoExecutivo.ts
   deve eventualmente ser substituído por chamadas a esta API.
   ============================================ */

export interface FormulaPadrao {
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

export const FORMULAS_PADRAO: FormulaPadrao[] = [
  // ═══ MÉTRICAS PRIMÁRIAS ═══
  {
    key: 'viagens',
    label: 'Viagens',
    tipo: 'primaria',
    cor: '#22c55e',
    formula: 'COUNT(*)',
    descricao: 'Contagem total de registros na planilha — quantidade de viagens/ocorrências',
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
    label: 'Horas Produtivas (Base)',
    tipo: 'primaria',
    cor: '#f59e0b',
    formula: 'HORAS_PRODUTIVAS(HORA SAIDA BASE, HORA CHEGADA BASE)',
    descricao: 'Total de horas entre saída da base e chegada na base — calcula SUM(HORA CHEGADA BASE - HORA SAIDA BASE) por registro, convertendo serial Excel para horas (*24). Corrige automaticamente virada de dia (chegada < saída)',
    colunasUsadas: ['HORA SAIDA BASE', 'HORA CHEGADA BASE'],
    formato: 'numero',
    categoria: 'Produtividade',
    unidade: 'h',
  },
  {
    key: 'horasRotas',
    label: 'Horas nas Rotas (Produtivo)',
    tipo: 'primaria',
    cor: '#f97316',
    formula: 'ROUND(HORAS_PRODUTIVAS(HORA SAÍDA ROTA 01, HORA CHEGADA ROTA 01) + HORAS_PRODUTIVAS(HORA SAÍDA ROTA 02, HORA CHEGADA ROTA 02) + HORAS_PRODUTIVAS(HORA SAÍDA ROTA 03, HORA CHEGA ROTA 03) + HORAS_PRODUTIVAS(HORA SAÍDA ROTA 04, HORA CHEGADA ROTA 04), 1)',
    descricao: 'Soma das horas em cada rota (Rota 01 a 04), calculada com HORAS_PRODUTIVAS que corrige automaticamente virada de dia (ex: saída 22h, chegada 02h do dia seguinte). Cada viagem pode ter até 4 rotas.',
    colunasUsadas: ['HORA CHEGADA ROTA 01', 'HORA SAÍDA ROTA 01', 'HORA CHEGADA ROTA 02', 'HORA SAÍDA ROTA 02', 'HORA CHEGA ROTA 03', 'HORA SAÍDA ROTA 03', 'HORA CHEGADA ROTA 04', 'HORA SAÍDA ROTA 04'],
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
    label: 'Produtividade por Coletor',
    tipo: 'secundaria',
    cor: '#8b5cf6',
    formula: 'ROUND(SUM(PESO TOTAL) / 1000 / SUM(Nº DE COLETORES), 2)',
    descricao: 'Peso total (ton) dividido pela soma total de coletores (Nº DE COLETORES)',
    colunasUsadas: ['PESO TOTAL', 'Nº DE COLETORES'],
    formato: 'numero',
    categoria: 'Produtividade',
    unidade: 't/veiculo',
  },
  {
    key: 'kmMedioViagem',
    label: 'KM Médio por Viagem',
    tipo: 'secundaria',
    cor: '#22c55e',
    formula: 'ROUND(DIVIDE(SUM(KM TOTAL), COUNT(*)), 1)',
    descricao: 'Média de KM rodados por registro/viagem',
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
    formula: 'ROUND(DIVIDE(SUM(PESO TOTAL), COUNT(*)) / 1000, 2)',
    descricao: 'Peso médio em toneladas por viagem/coleta',
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
    formula: 'ROUND(DIVIDE(FATURAMENTO_EST(PESO TOTAL, CAMINHAO), HORAS_PRODUTIVAS(HORA SAIDA BASE, HORA CHEGADA BASE)), 2)',
    descricao: 'Faturamento dividido pelas horas produtivas — usa HORAS_PRODUTIVAS para calcular corretamente (HORA CHEGADA BASE - HORA SAIDA BASE por registro, corrigindo virada de dia)',
    colunasUsadas: ['PESO TOTAL', 'CAMINHAO', 'HORA SAIDA BASE', 'HORA CHEGADA BASE'],
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
    formula: 'DIVIDE(SUM(KM TOTAL), HORAS_PRODUTIVAS(HORA SAIDA BASE, HORA CHEGADA BASE))',
    descricao: 'KM rodados por hora trabalhada — usa HORAS_PRODUTIVAS para calcular (HORA CHEGADA BASE - HORA SAIDA BASE por registro, corrigindo virada de dia)',
    colunasUsadas: ['KM TOTAL', 'HORA SAIDA BASE', 'HORA CHEGADA BASE'],
    formato: 'numero',
    categoria: 'Produtividade',
    unidade: 'km/h',
  },
  {
    key: 'ticketMedioViagem',
    label: 'Ticket Médio por Viagem',
    tipo: 'auxiliar',
    cor: '#a855f7',
    formula: 'DIVIDE(SUM(PESO TOTAL), COUNT(*))',
    descricao: 'Peso médio em Kg por registro/viagem',
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
    formula: 'DIVIDE(SUM(PESO TOTAL), HORAS_PRODUTIVAS(HORA SAIDA BASE, HORA CHEGADA BASE))',
    descricao: 'Peso processado por hora trabalhada (kg/h) — usa HORAS_PRODUTIVAS para cálculo correto',
    colunasUsadas: ['PESO TOTAL', 'HORA SAIDA BASE', 'HORA CHEGADA BASE'],
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

  // ═══ FÓRMULAS NOVAS — Planilha Modelo Coleta ═══
  {
    key: 'contadorViagens',
    label: 'Contador de Viagens (Soma)',
    tipo: 'auxiliar',
    cor: '#14b8a6',
    formula: 'SUM(CONTADOR DE VIAGENS)',
    descricao: 'Soma total do contador de viagens — útil quando uma linha representa múltiplas viagens',
    colunasUsadas: ['CONTADOR DE VIAGENS'],
    formato: 'numero',
    categoria: 'Operacional',
    unidade: 'viagens',
  },
  {
    key: 'mediaViagensPorLinha',
    label: 'Média de Viagens por Linha',
    tipo: 'auxiliar',
    cor: '#3b82f6',
    formula: 'AVG(CONTADOR DE VIAGENS)',
    descricao: 'Média de viagens por registro — indica se há registros com múltiplas viagens',
    colunasUsadas: ['CONTADOR DE VIAGENS'],
    formato: 'numero',
    categoria: 'Operacional',
    unidade: 'viagens/linha',
  },
  {
    key: 'coletoresDistintos',
    label: 'Coletores Distintos (Nomes)',
    tipo: 'secundaria',
    cor: '#8b5cf6',
    formula: 'COUNT DISTINCT(COLETOR 01)',
    descricao: 'Quantidade de coletores únicos a partir dos nomes individuais (COLETOR 01 a COLETOR 04)',
    colunasUsadas: ['COLETOR 01'],
    formato: 'numero',
    categoria: 'Operacional',
    unidade: 'coletores',
  },
  {
    key: 'mediaKmPorHora',
    label: 'KM por Hora Produtiva',
    tipo: 'secundaria',
    cor: '#06b6d4',
    formula: 'ROUND(DIVIDE(SUM(KM TOTAL), HORAS_PRODUTIVAS(HORA SAIDA BASE, HORA CHEGADA BASE)), 1)',
    descricao: 'KM rodados por hora produtiva — eficiência de deslocamento. Usa HORAS_PRODUTIVAS para cálculo correto entre saída e chegada da base',
    colunasUsadas: ['KM TOTAL', 'HORA SAIDA BASE', 'HORA CHEGADA BASE'],
    formato: 'numero',
    categoria: 'Eficiencia',
    unidade: 'km/h',
  },
  {
    key: 'pesoMedioParada',
    label: 'Peso Médio por Parada',
    tipo: 'auxiliar',
    cor: '#22c55e',
    formula: 'DIVIDE(SUM(PESO TOTAL), SUM(CONTADOR DE VIAGENS))',
    descricao: 'Peso médio coletado por viagem — útil quando CONTADOR DE VIAGENS > 1',
    colunasUsadas: ['PESO TOTAL', 'CONTADOR DE VIAGENS'],
    formato: 'numero',
    categoria: 'Operacional',
    unidade: 'kg/viagem',
  },
  {
    key: 'distanciaMediaRota',
    label: 'Distância Média por Rota',
    tipo: 'auxiliar',
    cor: '#3b82f6',
    formula: 'AVG(KM CHEGADA BASE) - AVG(KM SAIDA BASE)',
    descricao: 'Distância média percorrida entre a saída da base e a chegada na base (KM CHEGADA BASE - KM SAIDA BASE)',
    colunasUsadas: ['KM SAIDA BASE', 'KM CHEGADA BASE'],
    formato: 'numero',
    categoria: 'Operacional',
    unidade: 'km',
  },
  {
    key: 'tempoMedioRota01',
    label: 'Tempo Médio na Rota 01',
    tipo: 'auxiliar',
    cor: '#f59e0b',
    formula: 'ROUND(DIVIDE(HORAS_PRODUTIVAS(HORA SAÍDA ROTA 01, HORA CHEGADA ROTA 01), COUNT(*)), 2)',
    descricao: 'Tempo médio de permanência na Rota 01 — usa HORAS_PRODUTIVAS para corrigir virada de dia, depois divide pelo total de registros',
    colunasUsadas: ['HORA CHEGADA ROTA 01', 'HORA SAÍDA ROTA 01'],
    formato: 'numero',
    categoria: 'Produtividade',
    unidade: 'h',
  },
  {
    key: 'faturamentoPorColetor',
    label: 'Faturamento por Coletor',
    tipo: 'auxiliar',
    cor: '#a855f7',
    formula: 'ROUND(DIVIDE(FATURAMENTO_EST(PESO TOTAL, TIPO DE CAMINHÃO), SUM(Nº DE COLETORES)), 2)',
    descricao: 'Faturamento total dividido pela soma total de coletores — receita gerada por coletor',
    colunasUsadas: ['PESO TOTAL', 'TIPO DE CAMINHÃO', 'Nº DE COLETORES'],
    formato: 'moeda',
    categoria: 'Financeiro',
    unidade: 'R$/coletor',
  },
];

/**
 * Retorna as fórmulas filtradas por tipo
 */
export function filtrarPorTipo(tipo: 'primaria' | 'secundaria'): FormulaPadrao[] {
  return FORMULAS_PADRAO.filter(f => f.tipo === tipo);
}

/**
 * Agrupa por categoria
 */
export function agruparPorCategoria(): Record<string, FormulaPadrao[]> {
  return FORMULAS_PADRAO.reduce((acc, f) => {
    if (!acc[f.categoria]) acc[f.categoria] = [];
    acc[f.categoria].push(f);
    return acc;
  }, {} as Record<string, FormulaPadrao[]>);
}
