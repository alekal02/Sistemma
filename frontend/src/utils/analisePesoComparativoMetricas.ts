import type { AnalisePesoColeta } from '../services/servicoService';

const FAIXA_CORES = ['vermelho', 'amarelo', 'verde', 'amarelo', 'vermelho'] as const;

/** Padrão alinhado ao backend (DENSIDADE_OTIMA_PADRAO). */
export const DENSIDADE_RESIDUO_PADRAO = 0.55;

/** Recalcula peso ideal e resultado do cenário com nova densidade (kg/L). */
export function aplicarDensidadeNaAnalisePeso(
  analise: AnalisePesoColeta,
  densidadeKgL: number,
): AnalisePesoColeta {
  const densidadeOtima = densidadeKgL > 0
    ? Math.round(densidadeKgL * 1000) / 1000
    : DENSIDADE_RESIDUO_PADRAO;
  const mediaIdealKg = Math.round(analise.caixaMediaKg * densidadeOtima * 100) / 100;
  const perdaTon = Math.round(
    (((analise.pesoMedioKg - mediaIdealKg) * analise.numeroViagens) / 1000) * 100,
  ) / 100;
  return {
    ...analise,
    densidadeOtima,
    mediaIdealKg,
    perdaTon,
  };
}

export function parseDensidadeResiduoInput(raw: string): number | null {
  const n = Number(String(raw || '').replace(',', '.').trim());
  if (!Number.isFinite(n) || n <= 0 || n > 5) return null;
  return Math.round(n * 1000) / 1000;
}

export type SecaoPeso = 'operacao' | 'faixa' | 'frota' | 'cenario';

export interface LinhaMetricaPeso {
  secao: SecaoPeso;
  label: string;
  tipo: 'int' | 'num' | 'faixa' | 'texto';
  faixaIdx?: number;
  getValor?: (a: AnalisePesoColeta) => number | undefined;
  getTexto?: (a: AnalisePesoColeta) => string;
  getTitulo?: (a: AnalisePesoColeta) => string | undefined;
  classeCelula?: (a: AnalisePesoColeta) => string;
}

export const SECAO_LABEL_PESO: Record<SecaoPeso, string> = {
  operacao: 'Operação — viagens e peso',
  faixa: 'Distribuição por faixa de peso (kg)',
  frota: 'Frota por tipo de caminhão (placas únicas — coluna TIPO DE CAMINHÃO)',
  cenario: 'Cenário — caixa média (L) × densidade do resíduo (kg/L) = peso ideal',
};

export const CORES_SERVICO_PESO = ['#059669', '#0284c7', '#d97706', '#7c3aed', '#db2777', '#0891b2'];

export function fmtNumPeso(v: number, dec = 2): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function fmtIntPeso(v: number): string {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

export function fmtPctPeso(v: number): string {
  return `${Math.round(v).toLocaleString('pt-BR')}%`;
}

function fmtCenario(a: AnalisePesoColeta): string {
  if (a.perdaTon < 0) return 'PERDA';
  if (a.perdaTon > 0) return 'SUPERÁVIT';
  return 'NEUTRO';
}

function fmtResultado(a: AnalisePesoColeta): string {
  const abs = fmtNumPeso(Math.abs(a.perdaTon), 2);
  if (a.perdaTon < 0) return `- ${abs} TON`;
  if (a.perdaTon > 0) return `+ ${abs} TON`;
  return `${abs} TON`;
}

function calcularMediaIdealExibicao(a: AnalisePesoColeta): number {
  return Math.round(a.caixaMediaKg * a.densidadeOtima * 100) / 100;
}

export const METRICAS_PESO: LinhaMetricaPeso[] = [
  { secao: 'operacao', label: 'NÚMERO DE VIAGENS', tipo: 'int', getValor: (a) => a.numeroViagens },
  { secao: 'operacao', label: 'PESO MÉDIO', tipo: 'num', getValor: (a) => a.pesoMedioKg },
  {
    secao: 'operacao',
    label: 'MÍNIMO',
    tipo: 'num',
    getValor: (a) => a.rotaMinima?.pesoMedioKg,
    getTitulo: (a) => (a.rotaMinima ? `Menor viagem — Rota: ${a.rotaMinima.nome}` : undefined),
  },
  {
    secao: 'operacao',
    label: 'MÁXIMO',
    tipo: 'num',
    getValor: (a) => a.rotaMaxima?.pesoMedioKg,
    getTitulo: (a) => (a.rotaMaxima ? `Maior viagem — Rota: ${a.rotaMaxima.nome}` : undefined),
  },
  { secao: 'faixa', label: '< 3.000', tipo: 'faixa', faixaIdx: 0 },
  { secao: 'faixa', label: '>=3.000 E <7.000', tipo: 'faixa', faixaIdx: 1 },
  { secao: 'faixa', label: '>=7.000 E <9.000', tipo: 'faixa', faixaIdx: 2 },
  { secao: 'faixa', label: '>=9.000 E <11.000', tipo: 'faixa', faixaIdx: 3 },
  { secao: 'faixa', label: '>=11.000', tipo: 'faixa', faixaIdx: 4 },
  { secao: 'frota', label: 'MINI', tipo: 'int', getValor: (a) => a.tiposCaminhao.MINI },
  { secao: 'frota', label: 'TOCO', tipo: 'int', getValor: (a) => a.tiposCaminhao.TOCO },
  { secao: 'frota', label: 'TRUCK', tipo: 'int', getValor: (a) => a.tiposCaminhao.TRUCK },
  { secao: 'frota', label: 'SOMA', tipo: 'int', getValor: (a) => a.tiposCaminhao.soma },
  { secao: 'frota', label: 'Caminhões (placas únicas)', tipo: 'int', getValor: (a) => a.caminhoesUnicos },
  { secao: 'cenario', label: 'CAIXA MÉDIA (L)', tipo: 'num', getValor: (a) => a.caixaMediaKg },
  { secao: 'cenario', label: 'DENSIDADE DO RESÍDUO (KG/L)', tipo: 'num', getValor: (a) => a.densidadeOtima },
  {
    secao: 'cenario',
    label: 'PESO IDEAL (KG)',
    tipo: 'num',
    getValor: calcularMediaIdealExibicao,
    classeCelula: () => 'celula-ideal',
  },
  {
    secao: 'cenario',
    label: 'CENÁRIO',
    tipo: 'texto',
    getTexto: fmtCenario,
    classeCelula: (a) => (a.perdaTon < 0 ? 'celula-cenario-perda' : a.perdaTon > 0 ? 'celula-cenario-ganho' : ''),
  },
  {
    secao: 'cenario',
    label: 'RESULTADO',
    tipo: 'texto',
    getTexto: fmtResultado,
    classeCelula: (a) => (a.perdaTon < 0 ? 'celula-resultado-perda' : a.perdaTon > 0 ? 'celula-resultado-ganho' : ''),
  },
];

export interface CelulaMetricaPeso {
  texto: string;
  titulo?: string;
  pct?: string;
  pctCor?: (typeof FAIXA_CORES)[number];
  classe?: string;
}

export function formatarCelulaMetricaPeso(linha: LinhaMetricaPeso, analise: AnalisePesoColeta): CelulaMetricaPeso {
  const classe = linha.classeCelula?.(analise) || '';
  const titulo = linha.getTitulo?.(analise);

  if (linha.tipo === 'faixa' && linha.faixaIdx !== undefined) {
    const faixa = analise.faixas[linha.faixaIdx];
    return {
      texto: fmtIntPeso(faixa.quantidade),
      pct: fmtPctPeso(faixa.pct),
      pctCor: FAIXA_CORES[linha.faixaIdx],
      classe: `celula-faixa ${classe}`.trim(),
      titulo,
    };
  }

  if (linha.tipo === 'texto' && linha.getTexto) {
    return { texto: linha.getTexto(analise), classe, titulo };
  }

  const raw = linha.getValor?.(analise);
  if (raw === undefined || raw === null || Number.isNaN(raw)) {
    return { texto: '—', classe, titulo };
  }

  if (linha.tipo === 'int') return { texto: fmtIntPeso(raw), classe, titulo };
  return { texto: fmtNumPeso(raw, 2), classe, titulo };
}
