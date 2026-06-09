/* ============================================
   useDecisionEngine — Motor de Tomada de Decisão
   
   Transforma KPIs brutos em informações acionáveis:
   - Categoriza (💰 receita / 📋 operacional)
   - Classifica (🟢 ok / 🟡 atencao / 🔴 critico)
   - Gera alertas com ações sugeridas
   - Calcula score geral por categoria
   ============================================ */

import { useMemo } from 'react'
import type { KpiConsolidadoItem } from '../services/servicoService'
import type {
  CategoriaKpi,
  StatusDecisao,
  VariacaoClassificada,
  KpiDecisao,
  AlertaDecisao,
  ScoreCategoria,
  ResultadoDecisao,
} from '../types/decision'

/* ─── CATEGORIZAÇÃO POR PALAVRAS-CHAVE ─── */

const PALAVRAS_RECEITA = [
  'FATURAMENTO', 'RECEITA', 'R$', 'MARGEM', 'TICKET', 'CUSTO',
  'LUCRO', 'BRUTA', 'LIQUIDA', 'DOLAR', 'REAL', 'PRECO',
  'VALOR TOTAL', 'VALOR MEDIO', 'CUSTO TOTAL',
]

const PALAVRAS_OPERACIONAL = [
  'TONELADA', 'TON', 'KG', 'KM', 'QUILOMETRO', 'KILOMETRO',
  'VIAGEM', 'COLETA', 'EFICIENCIA', 'PRODUTIVIDADE',
  'HORA', 'COLETOR', 'COLETORA', 'MOTORISTA', 'PLACA',
  'VELOCIDADE', 'DISTANCIA', 'PESO', 'REGISTRO',
  'EQUIPAMENTO', 'CAMINHAO', 'VEICULO', 'ROTA',
  'MEDIA', 'TOTAL', 'ATIVO',
]

function inferirCategoria(nome: string): CategoriaKpi {
  const upper = nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  
  for (const palavra of PALAVRAS_RECEITA) {
    if (upper.includes(palavra)) return 'receita'
  }
  
  for (const palavra of PALAVRAS_OPERACIONAL) {
    if (upper.includes(palavra)) return 'operacional'
  }
  
  return 'indefinido'
}

/* ─── CLASSIFICAÇÃO DE STATUS ─── */

function calcularStatus(valor: number | null, variacao?: VariacaoClassificada): StatusDecisao {
  // Se não tem valor, é atenção
  if (valor === null || valor === undefined) return 'atencao'
  if (valor === 0) return 'atencao'
  
  // Se tem variação negativa grande
  if (variacao) {
    if (variacao.tipo === 'negativa' && Math.abs(variacao.valor) >= 20) return 'critico'
    if (variacao.tipo === 'negativa' && Math.abs(variacao.valor) >= 10) return 'atencao'
  }
  
  return 'ok'
}

/* ─── GERAÇÃO DE AÇÕES SUGERIDAS ─── */

function gerarAcao(nome: string, status: StatusDecisao, categoria: CategoriaKpi): { acao: string; motivo: string; impacto: string } | null {
  if (status === 'ok') return null
  
  const upper = nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  
  // Ações por palavra-chave
  if (upper.includes('FATURAMENTO') || upper.includes('RECEITA')) {
    return {
      acao: 'Revisar contratos e volume de coletas das regiões com menor desempenho',
      motivo: 'Faturamento abaixo do esperado',
      impacto: 'Receita total pode ficar abaixo da projeção mensal',
    }
  }
  if (upper.includes('MARGEM')) {
    return {
      acao: 'Analisar custos operacionais por tipo de caminhão e regional',
      motivo: 'Margem reduzida',
      impacto: 'Lucratividade do contrato comprometida',
    }
  }
  if (upper.includes('CUSTO')) {
    return {
      acao: 'Identificar rotas com maior custo operacional e reavaliar alocação',
      motivo: 'Custo operacional elevado',
      impacto: 'Margem líquida reduzida',
    }
  }
  if (upper.includes('TON') || upper.includes('PESO')) {
    return {
      acao: 'Verificar se há coletores com baixa produtividade e readequar rotas',
      motivo: 'Volume de coleta abaixo do esperado',
      impacto: 'Subutilização da frota',
    }
  }
  if (upper.includes('KM') || upper.includes('DISTANCIA') || upper.includes('QUILO')) {
    return {
      acao: 'Revisar planejamento de rotas para reduzir deslocamentos improdutivos',
      motivo: 'KM rodados acima do planejado',
      impacto: 'Custo de combustível e manutenção elevados',
    }
  }
  if (upper.includes('HORA') || upper.includes('TEMPO')) {
    return {
      acao: 'Analisar horas improdutivas por coletor e ajustar escala de trabalho',
      motivo: 'Horas produtivas abaixo da meta',
      impacto: 'Produtividade da frota reduzida',
    }
  }
  if (upper.includes('VIAGEM') || upper.includes('COLETA')) {
    return {
      acao: 'Verificar frequência de coletas por regional e otimizar roteirização',
      motivo: 'Número de viagens abaixo do planejado',
      impacto: 'Capacidade de coleta não atingida',
    }
  }
  if (upper.includes('EFICIENCIA') || upper.includes('PRODUTIVIDADE')) {
    return {
      acao: 'Comparar eficiência entre coletores e regionais para identificar gargalos',
      motivo: 'Eficiência operacional abaixo da meta',
      impacto: 'Custo por tonelada acima do planejado',
    }
  }
  if (upper.includes('TICKET')) {
    return {
      acao: 'Avaliar mix de tipos de caminhão e ajustar valores de contrato',
      motivo: 'Ticket médio abaixo do esperado',
      impacto: 'Receita por viagem reduzida',
    }
  }
  
  // Ação genérica
  return {
    acao: 'Acessar o dashboard completo para análise detalhada do indicador',
    motivo: 'Indicador com desempenho abaixo do esperado',
    impacto: 'Performance do contrato pode ser afetada',
  }
}

/* ─── GERAÇÃO DE VARIAÇÃO (quando não vem do backend) ─── */

function gerarVariacao(kpi: KpiConsolidadoItem): VariacaoClassificada {
  // Se não temos dado de variação, assumimos estável
  return {
    valor: 0,
    tipo: 'estavel',
    label: '—',
  }
}

/* ─── HOOK PRINCIPAL ─── */

export function useDecisionEngine(kpis: KpiConsolidadoItem[]): ResultadoDecisao {
  return useMemo(() => {
    if (!kpis || kpis.length === 0) {
      return {
        scores: [
          { categoria: 'receita', status: 'ok', totalKpis: 0, kpisOk: 0, kpisAtencao: 0, kpisCriticos: 0, label: 'Receita', icone: '💰' },
          { categoria: 'operacional', status: 'ok', totalKpis: 0, kpisOk: 0, kpisAtencao: 0, kpisCriticos: 0, label: 'Operacional', icone: '📋' },
        ],
        prioridades: [],
        kpisPorCategoria: { receita: [], operacional: [], indefinido: [] },
        totalKpis: 0,
        temPrioridades: false,
      }
    }

    // 1. Processar cada KPI
    const kpisProcessados: KpiDecisao[] = kpis.map(kpi => {
      const categoria = inferirCategoria(kpi.nome)
      const variacao = gerarVariacao(kpi)
      const status = calcularStatus(kpi.valor, variacao)
      const acaoInfo = gerarAcao(kpi.nome, status, categoria)

      return {
        id: kpi.id,
        nome: kpi.nome,
        valor: kpi.valor,
        formatado: kpi.formatado,
        formato: kpi.formato,
        categoria,
        status,
        variacao,
        acaoSugerida: acaoInfo?.acao,
        motivo: acaoInfo?.motivo,
        impacto: acaoInfo?.impacto,
      }
    })

    // 2. Agrupar por categoria
    const kpisPorCategoria: Record<CategoriaKpi, KpiDecisao[]> = {
      receita: [],
      operacional: [],
      indefinido: [],
    }
    
    for (const kpi of kpisProcessados) {
      kpisPorCategoria[kpi.categoria].push(kpi)
    }

    // 3. Gerar alertas/prioridades (ordenados por criticidade)
    const prioridades: AlertaDecisao[] = kpisProcessados
      .filter(k => k.status !== 'ok')
      .sort((a, b) => {
        const peso: Record<StatusDecisao, number> = { critico: 0, atencao: 1, ok: 2 }
        return peso[a.status] - peso[b.status]
      })
      .map(k => ({
        id: k.id,
        kpiNome: k.nome,
        categoria: k.categoria,
        status: k.status,
        mensagem: k.motivo || `${k.nome} precisa de atenção`,
        impacto: k.impacto || 'Impacto nos resultados do contrato',
        acaoSugerida: k.acaoSugerida || 'Analisar no dashboard completo',
        valorAtual: k.formatado,
        variacao: k.variacao.label,
      }))

    // 4. Calcular scores por categoria
    const categorias: CategoriaKpi[] = ['receita', 'operacional', 'indefinido']
    const scores: ScoreCategoria[] = categorias.map(cat => {
      const kpisDaCat = kpisPorCategoria[cat]
      const qtdCriticos = kpisDaCat.filter(k => k.status === 'critico').length
      const qtdAtencao = kpisDaCat.filter(k => k.status === 'atencao').length
      const qtdOk = kpisDaCat.filter(k => k.status === 'ok').length

      let statusGeral: StatusDecisao = 'ok'
      if (qtdCriticos > 0) statusGeral = 'critico'
      else if (qtdAtencao > 0) statusGeral = 'atencao'

      const labels: Record<CategoriaKpi, { label: string; icone: string }> = {
        receita: { label: '💰 Receita', icone: '💰' },
        operacional: { label: '📋 Operacional', icone: '📋' },
        indefinido: { label: '📊 Outros', icone: '📊' },
      }

      return {
        categoria: cat,
        status: statusGeral,
        totalKpis: kpisDaCat.length,
        kpisOk: qtdOk,
        kpisAtencao: qtdAtencao,
        kpisCriticos: qtdCriticos,
        ...labels[cat],
      }
    }).filter(s => s.totalKpis > 0 || s.categoria !== 'indefinido')

    return {
      scores,
      prioridades,
      kpisPorCategoria,
      totalKpis: kpisProcessados.length,
      temPrioridades: prioridades.length > 0,
    }
  }, [kpis])
}

export default useDecisionEngine
