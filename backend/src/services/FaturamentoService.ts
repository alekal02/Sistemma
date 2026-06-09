/* ============================================
   FaturamentoService — Motor Único de Cálculo de Faturamento
   
   ═══ PROPÓSITO ═══
   Centralizar TODA a lógica de cálculo de faturamento estimado
   que antes estava duplicada em:
     - FormulaEngine.ts (calcularFaturamentoEstimado)
     - DashboardExecutivoController.ts (obterValorUnitario + inline em vários métodos)
   
   ═══ ESTRATÉGIA DE MIGRAÇÃO ═══
   Este serviço é NOVO e não modifica nenhum arquivo existente.
   A migração deve seguir o padrão Strangler Fig:
   1. ✅ Criar este serviço (agora)
   2. Adicionar chamadas a este serviço NOS NOVOS fluxos
   3. Gradualmente substituir chamadas antigas nos controllers
   4. Quando tudo estiver migrado, remover código duplicado
   
   ═══ CONSTANTES ═══
   - R$ 80/ton é o valor FIXO de fallback (NUNCA muda)
   - Valores do contrato (VALOR_TRUCK, VALOR_TOCO, VALOR_MINI) 
     sobrescrevem o fallback quando configurados
   ============================================ */

// ─── Constantes ───

/** Valor estimado por tonelada quando não há valores configurados no contrato (R$/ton) */
export const VALOR_ESTIMADO_TON = 80;

/** Chaves que indicam que o contrato TEM valores de faturamento configurados */
export const CHAVES_FATURAMENTO = ['VALOR_TONELADA', 'VALOR_MINI', 'VALOR_TRUCK', 'VALOR_TOCO'];

/** Mapeamento de tipos de caminhão para chaves de valores no contrato */
export const MAP_TIPO_VALOR: Record<string, string> = {
  'TRUCK': 'VALOR_TRUCK',
  'TOCO': 'VALOR_TOCO',
  'MINI': 'VALOR_MINI',
};

// ─── Tipos ───

export interface ResultadoFaturamento {
  /** Faturamento total calculado */
  valor: number;
  /** Se usou valores reais do contrato ou estimativa de R$ 80/ton */
  usandoEstimativa: boolean;
  /** Valor unitário efetivamente usado (média ponderada) */
  valorUnitarioMedio: number;
  /** Detalhamento por tipo de caminhão */
  porTipo: FaturamentoPorTipo[];
}

export interface FaturamentoPorTipo {
  tipo: string;
  pesoKg: number;
  toneladas: number;
  valorUnitario: number;
  faturamento: number;
}

export interface FaturamentoDiario {
  data: string;
  label: string;
  faturamento: number;
  km: number;
  horas: number;
}

// ─── Funções Públicas ───

/**
 * Verifica se o contrato tem valores de faturamento configurados
 */
export function temValorFaturamentoConfigurado(valoresFixos: Record<string, number>): boolean {
  return CHAVES_FATURAMENTO.some(k => (valoresFixos[k] || 0) > 0);
}

/**
 * Obtém o valor unitário (R$/ton) para um tipo de caminhão
 * 
 * Regras:
 * 1. Se contrato tem VALOR_TRUCK/VALOR_TOCO/VALOR_MINI → usa específico
 * 2. Se contrato tem VALOR_TONELADA → usa genérico
 * 3. Se nada configurado → R$ 80/ton (fallback fixo)
 * 
 * @param tipoRaw Tipo do caminhão (ex: "TRUCK", "TOCO", "MINI")
 * @param valoresFixos Valores configurados no contrato
 * @param temValorFaturamento Flag cacheada (opcional — se omitida, calcula automaticamente)
 */
export function obterValorUnitario(
  tipoRaw: string,
  valoresFixos: Record<string, number>,
  temValorFaturamento?: boolean
): number {
  const temValor = temValorFaturamento ?? temValorFaturamentoConfigurado(valoresFixos);
  
  // Se não tem valores de faturamento configurados, usar estimativa fixa
  if (!temValor) return VALOR_ESTIMADO_TON;

  // Tentar encontrar tipo específico
  const tipoKey = Object.keys(MAP_TIPO_VALOR).find(k =>
    tipoRaw.includes(k) || k.includes(tipoRaw)
  );

  const valorTonelada = valoresFixos['VALOR_TONELADA'] || 0;

  // Se tem tipo específico configurado, usar seu valor
  if (tipoKey) {
    const valorEspecifico = valoresFixos[MAP_TIPO_VALOR[tipoKey]] || 0;
    if (valorEspecifico > 0) return valorEspecifico;
  }

  // Fallback para valorTonelada se estiver configurado
  if (valorTonelada > 0) return valorTonelada;

  // Último fallback: R$ 80/ton
  return VALOR_ESTIMADO_TON;
}

/**
 * Calcula o faturamento total a partir de um array de registros
 * 
 * @param dados Registros (podem ser objetos planos ou entidades)
 * @param colPeso Nome da coluna de peso (em KG)
 * @param colTipo Nome da coluna de tipo de caminhão
 * @param valoresFixos Valores configurados no contrato
 * @param extrairValorFn Função opcional para extrair valor de uma coluna (para flexibilidade)
 */
export function calcularFaturamento(
  dados: Record<string, any>[],
  colPeso: string,
  colTipo: string,
  valoresFixos: Record<string, number>,
  extrairValorFn?: (dado: Record<string, any>, coluna: string) => any
): ResultadoFaturamento {
  if (!dados || dados.length === 0) {
    return { valor: 0, usandoEstimativa: true, valorUnitarioMedio: 0, porTipo: [] };
  }

  const getValor = extrairValorFn || ((d, c) => d[c]);
  const temValor = temValorFaturamentoConfigurado(valoresFixos);
  const porTipoMap = new Map<string, { pesoKg: number; count: number }>();
  let totalFaturamento = 0;
  let pesoTotalKg = 0;

  for (const d of dados) {
    const tipoRaw = String(getValor(d, colTipo) || 'OUTROS').toUpperCase().trim();
    // Pular se for número puro (ex: "123" não é tipo)
    if (/^\d+$/.test(tipoRaw)) continue;
    
    const peso = Number(getValor(d, colPeso)) || 0;
    if (peso <= 0) continue;

    const toneladas = peso / 1000;
    const valorUnitario = obterValorUnitario(tipoRaw, valoresFixos, temValor);
    const receita = toneladas * valorUnitario;

    totalFaturamento += receita;
    pesoTotalKg += peso;

    // Acumular por tipo
    if (!porTipoMap.has(tipoRaw)) {
      porTipoMap.set(tipoRaw, { pesoKg: 0, count: 0 });
    }
    const entry = porTipoMap.get(tipoRaw)!;
    entry.pesoKg += peso;
    entry.count += 1;
  }

  // Se não conseguiu calcular por tipo (ex: nenhum registro com tipo), 
  // tenta calcular usando apenas peso total e valor genérico
  if (totalFaturamento === 0 && pesoTotalKg > 0) {
    const valorUnitario = temValor ? (valoresFixos['VALOR_TONELADA'] || VALOR_ESTIMADO_TON) : VALOR_ESTIMADO_TON;
    totalFaturamento = (pesoTotalKg / 1000) * valorUnitario;
  }

  const porTipo: FaturamentoPorTipo[] = Array.from(porTipoMap.entries())
    .map(([tipo, data]) => ({
      tipo,
      pesoKg: data.pesoKg,
      toneladas: Math.round((data.pesoKg / 1000) * 100) / 100,
      valorUnitario: obterValorUnitario(tipo, valoresFixos, temValor),
      faturamento: Math.round(((data.pesoKg / 1000) * obterValorUnitario(tipo, valoresFixos, temValor)) * 100) / 100,
    }))
    .sort((a, b) => b.faturamento - a.faturamento);

  return {
    valor: Math.round(totalFaturamento * 100) / 100,
    usandoEstimativa: !temValor,
    valorUnitarioMedio: pesoTotalKg > 0 ? Math.round((totalFaturamento / (pesoTotalKg / 1000)) * 100) / 100 : 0,
    porTipo,
  };
}

/**
 * Calcula faturamento agrupado por dia a partir de um array de registros
 * 
 * @param dados Registros com data
 * @param colPeso Nome da coluna de peso
 * @param colTipo Nome da coluna de tipo de caminhão
 * @param colData Nome da coluna de data
 * @param colKm Nome da coluna de KM (opcional)
 * @param colHoras Nome da coluna de horas (opcional)
 * @param valoresFixos Valores configurados no contrato
 * @param formatadorData Função para extrair a data de um registro (retorna string yyyy-MM-dd)
 */
export function calcularFaturamentoPorDia(
  dados: Record<string, any>[],
  colPeso: string,
  colTipo: string,
  colData: string,
  valoresFixos: Record<string, number>,
  colKm?: string,
  colHoras?: string,
  formatadorData?: (dado: Record<string, any>) => string | null
): FaturamentoDiario[] {
  if (!dados || dados.length === 0) return [];

  const temValor = temValorFaturamentoConfigurado(valoresFixos);
  const getData = formatadorData || ((d: any) => {
    const val = d[colData];
    if (!val) return null;
    const date = val instanceof Date ? val : new Date(val);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  });

  // Agrupar por data
  const porDia = new Map<string, { faturamento: number; km: number; horas: number }>();

  for (const d of dados) {
    const data = getData(d);
    if (!data) continue;

    if (!porDia.has(data)) {
      porDia.set(data, { faturamento: 0, km: 0, horas: 0 });
    }

    const entry = porDia.get(data)!;
    
    // Faturamento
    const tipoRaw = String(d[colTipo] || 'OUTROS').toUpperCase().trim();
    if (!/^\d+$/.test(tipoRaw)) {
      const peso = Number(d[colPeso]) || 0;
      if (peso > 0) {
        const toneladas = peso / 1000;
        const valorUnitario = obterValorUnitario(tipoRaw, valoresFixos, temValor);
        entry.faturamento += toneladas * valorUnitario;
      }
    }

    // KM (opcional)
    if (colKm) {
      entry.km += Number(d[colKm]) || 0;
    }

    // Horas (opcional)
    if (colHoras) {
      entry.horas += Number(d[colHoras]) || 0;
    }
  }

  // Converter para array ordenado
  return Array.from(porDia.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, values]) => ({
      data,
      label: data.slice(5), // "MM-DD"
      faturamento: Math.round(values.faturamento * 100) / 100,
      km: Math.round(values.km * 100) / 100,
      horas: Math.round(values.horas * 100) / 100,
    }));
}

/**
 * Formata um valor como moeda BRL
 */
export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/**
 * Versão segura para arrays vazios — retorna objeto com zeros
 */
export function resultadoVazio(): ResultadoFaturamento {
  return { valor: 0, usandoEstimativa: true, valorUnitarioMedio: 0, porTipo: [] };
}

export default {
  VALOR_ESTIMADO_TON,
  CHAVES_FATURAMENTO,
  MAP_TIPO_VALOR,
  temValorFaturamentoConfigurado,
  obterValorUnitario,
  calcularFaturamento,
  calcularFaturamentoPorDia,
  formatarMoeda,
  resultadoVazio,
};
