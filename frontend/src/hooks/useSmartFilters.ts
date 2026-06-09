/* ============================================
   useSmartFilters — Hook de Filtros Inteligentes
   
   Detecta automaticamente colunas de texto com
   valores categóricos nos dados brutos e fornece
   as opções para selects dinâmicos.
   
   Como funciona:
   1. Analisa dadosBrutos → extrai colunas de texto
   2. Para cada coluna, coleta valores únicos (máx 100)
   3. Ignora colunas com muitos valores únicos (ex: placas)
   4. Fornece filteredOptions para renderizar selects
   ============================================ */

import { useMemo } from 'react';

// ─── Tipos ───

export interface FiltroColuna {
  /** Nome real da coluna nos dados */
  nome: string;
  /** Label amigável (capitalizada) */
  label: string;
  /** Valores únicos disponíveis */
  opcoes: string[];
  /** Quantidade de valores únicos */
  totalOpcoes: number;
}

interface UseSmartFiltersOptions {
  /** Dados brutos do serviço */
  dadosBrutos: Record<string, any>[];
  /** Nomes de colunas que são do tipo 'hora' (ignorar) */
  colunasHoraSet?: Set<string>;
  /** Nomes de colunas que são do tipo 'numero' (ignorar) */
  colunasNumSet?: Set<string>;
  /** Máximo de valores únicos para considerar como filtro (default: 80) */
  maxValoresUnicos?: number;
  /** Mínimo de valores únicos para considerar como filtro (default: 2) */
  minValoresUnicos?: number;
  /** Forçar inclusão de colunas específicas (ex: placa, tipo caminhão) */
  colunasForcadas?: string[];
}

interface UseSmartFiltersResult {
  /** Colunas disponíveis para filtro */
  colunasFiltro: FiltroColuna[];
  /** true se há colunas disponíveis */
  temFiltros: boolean;
}

// ─── Função auxiliar: capitalizar e limpar nome ───

function formatarLabel(nome: string): string {
  return nome
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

// ─── Função auxiliar: normalizar para remover acentos ───

function normalizarTexto(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

// ─── Colunas que SEMPRE devem ser ignoradas ───

const COLUNAS_IGNORADAS = new Set([
  'ID', 'CODIGO', 'CÓDIGO', 'COD', 'NUMERO', 'NÚMERO',
  'ROW', 'LINHA', 'INDEX', 'SEQUENCIA', 'SEQ',
]);

// ─── Nomes de colunas comuns para filtros importantes ───

const COLUNAS_PRIORITARIAS = [
  'CAMINHAO', 'TIPO CAMINHAO', 'TIPO_CAMINHAO', 'tipoCaminhao', 'CAMINHÃO',
  'PLACA', 'VEICULO', 'COLETOR', 'COLETORA', 'EQUIPAMENTO',
  'REGIONAL', 'REGIAO', 'REGIÃO', 'FILIAL',
  'TURNO', 'PERIODO',
  'STATUS', 'SITUACAO', 'SITUAÇÃO',
  'MOTORISTA', 'OPERADOR',
  'PRODUTO', 'MATERIAL', 'RESIDUO', 'RESÍDUO',
  'MUNICIPIO', 'MUNICÍPIO', 'CIDADE',
  'CLIENTE', 'TOMADOR',
  'FRETE', 'TIPO FRETE', 'TIPO_FRETE',
];

// ─── Hook principal ───

export function useSmartFilters(options: UseSmartFiltersOptions): UseSmartFiltersResult {
  const {
    dadosBrutos,
    colunasHoraSet = new Set(),
    colunasNumSet = new Set(),
    maxValoresUnicos = 80,
    minValoresUnicos = 2,
    colunasForcadas = [],
  } = options;

  return useMemo(() => {
    if (!dadosBrutos || dadosBrutos.length === 0) {
      return { colunasFiltro: [], temFiltros: false };
    }

    const todasChaves = Object.keys(dadosBrutos[0]);

    // Determinar quais colunas são candidatas a filtro
    const colunasCandidatas = todasChaves.filter(chave => {
      // Ignorar colunas de hora
      if (colunasHoraSet.has(chave)) return false;

      // Ignorar colunas numéricas (exceto as forçadas)
      if (colunasNumSet.has(chave) && !colunasForcadas.includes(chave)) return false;

      // Verificar se a chave parece numérica (maioria dos valores são números)
      const chaveNorm = normalizarTexto(chave);
      if (COLUNAS_IGNORADAS.has(chaveNorm)) return false;

      return true;
    });

    const colunasFiltro: FiltroColuna[] = [];

    for (const coluna of colunasCandidatas) {
      // Coletar valores únicos não vazios
      const valoresUnicos = new Set<string>();

      for (const dado of dadosBrutos) {
        const valor = dado[coluna];
        if (valor !== null && valor !== undefined && valor !== '') {
          const strValor = String(valor).trim();
          if (strValor.length > 0 && strValor.length < 100) {
            valoresUnicos.add(strValor);
          }
        }
        // Limitar para performance
        if (valoresUnicos.size > maxValoresUnicos) break;
      }

      const total = valoresUnicos.size;

      // Pular colunas com muitos ou poucos valores únicos
      // (exceto as forçadas)
      const isForcada = colunasForcadas.includes(coluna);
      if (!isForcada) {
        if (total < minValoresUnicos || total > maxValoresUnicos) continue;
      }

      // Ignorar colunas onde os valores parecem ser IDs numéricos
      if (!isForcada) {
        const sampleNumerico = Array.from(valoresUnicos).every(v => /^\d+$/.test(v));
        if (sampleNumerico && total > 20) continue;
      }

      // Se tem valores numéricos demais e não é forçada, pula
      if (!isForcada && total > maxValoresUnicos) continue;

      colunasFiltro.push({
        nome: coluna,
        label: formatarLabel(coluna),
        opcoes: Array.from(valoresUnicos).sort((a, b) => a.localeCompare(b, 'pt-BR')),
        totalOpcoes: total,
      });
    }

    // Ordenar: prioritárias primeiro, depois pelo número de opções
    colunasFiltro.sort((a, b) => {
      const aPriority = COLUNAS_PRIORITARIAS.some(p => normalizarTexto(p) === normalizarTexto(a.nome)) ? 0 : 1;
      const bPriority = COLUNAS_PRIORITARIAS.some(p => normalizarTexto(p) === normalizarTexto(b.nome)) ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.totalOpcoes - b.totalOpcoes;
    });

    return {
      colunasFiltro,
      temFiltros: colunasFiltro.length > 0,
    };
  }, [dadosBrutos, colunasHoraSet, colunasNumSet, maxValoresUnicos, minValoresUnicos, colunasForcadas]);
}
