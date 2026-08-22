/**
 * Onde a hora e o KM improdutivos foram gastos.
 *
 * A planilha marca hora e hodômetro na base e na chegada/saída de cada rota,
 * o que permite dividir o tempo fora da rota em três trechos com dono claro:
 * deslocamento inicial, entre rotas (descarga/aterro) e retorno à base.
 */

export type TrechoImprodutivoId =
  | 'deslocamento_inicial'
  | 'entre_rotas'
  | 'retorno_final'
  | 'nao_detalhado';

export interface FatiaTrechoImprodutivo {
  id: TrechoImprodutivoId;
  label: string;
  /** Explicação curta do que o trecho representa. */
  descricao: string;
  horas: number;
  km: number;
  /** Participação na hora improdutiva total (0–100). */
  pct: number;
  cor: string;
}

interface ResumoTrechos {
  horasTotais?: number;
  horasProdutivas?: number;
  horasImprodutivas?: number;
  horasDeslocamentoInicial?: number;
  horasEntreRotas?: number;
  horasRetornoFinal?: number;
  horasImprodutivasNaoDetalhadas?: number;
  kmProdutivo?: number;
  kmImprodutivo?: number;
  kmDeslocamentoInicial?: number;
  kmEntreRotas?: number;
  kmRetornoFinal?: number;
  registrosComTrecho?: number;
  registros?: number;
}

const DEFINICOES: {
  id: TrechoImprodutivoId;
  label: string;
  descricao: string;
  cor: string;
  horas: keyof ResumoTrechos;
  km: keyof ResumoTrechos | null;
}[] = [
  {
    id: 'deslocamento_inicial',
    label: 'Deslocamento inicial',
    descricao: 'Da base até a primeira rota do dia',
    cor: '#0369a1',
    horas: 'horasDeslocamentoInicial',
    km: 'kmDeslocamentoInicial',
  },
  {
    id: 'entre_rotas',
    label: 'Entre rotas',
    descricao: 'Saída de uma rota até a próxima — inclui descarga no aterro',
    cor: '#c2410c',
    horas: 'horasEntreRotas',
    km: 'kmEntreRotas',
  },
  {
    id: 'retorno_final',
    label: 'Retorno à base',
    descricao: 'Da última rota de volta para a base',
    cor: '#7c3aed',
    horas: 'horasRetornoFinal',
    km: 'kmRetornoFinal',
  },
  {
    id: 'nao_detalhado',
    label: 'Sem horário na planilha',
    descricao: 'Tempo improdutivo que a planilha não permitiu localizar',
    cor: '#94a3b8',
    horas: 'horasImprodutivasNaoDetalhadas',
    km: null,
  },
];

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Fatias da hora improdutiva, já com percentual e cor. Vazio quando não há improdutiva. */
export function montarDistribuicaoImprodutiva(
  resumo: ResumoTrechos | null | undefined,
): FatiaTrechoImprodutivo[] {
  if (!resumo) return [];
  const total = num(resumo.horasImprodutivas);
  if (total <= 0) return [];

  return DEFINICOES
    .map((def) => {
      const horas = num(resumo[def.horas]);
      return {
        id: def.id,
        label: def.label,
        descricao: def.descricao,
        horas,
        km: def.km ? num(resumo[def.km]) : 0,
        pct: Math.round((horas / total) * 1000) / 10,
        cor: def.cor,
      };
    })
    .filter((f) => f.horas > 0);
}

export interface LeituraTrechos {
  /** Frase pronta com o maior ofensor do período. */
  texto: string;
  /** Trecho que mais consumiu tempo (ignorando o não detalhado). */
  maior: FatiaTrechoImprodutivo | null;
  pctProdutivo: number | null;
  /** % do KM total rodado fora das rotas. */
  pctKmImprodutivo: number | null;
  /** Quantos registros têm horário suficiente para detalhar (0–100). */
  coberturaPct: number | null;
}

function fmt(n: number, casas = 1): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** Leitura gerencial da improdutividade: o que puxou o tempo para fora da rota. */
export function montarLeituraTrechos(
  resumo: ResumoTrechos | null | undefined,
): LeituraTrechos {
  const vazio: LeituraTrechos = {
    texto: '',
    maior: null,
    pctProdutivo: null,
    pctKmImprodutivo: null,
    coberturaPct: null,
  };
  if (!resumo) return vazio;

  const horasTotais = num(resumo.horasTotais);
  const horasProdutivas = num(resumo.horasProdutivas);
  const horasImprodutivas = num(resumo.horasImprodutivas);
  const kmProdutivo = num(resumo.kmProdutivo);
  const kmImprodutivo = num(resumo.kmImprodutivo);
  const kmSomado = kmProdutivo + kmImprodutivo;
  const registros = num(resumo.registros);

  const fatias = montarDistribuicaoImprodutiva(resumo)
    .filter((f) => f.id !== 'nao_detalhado');
  const maior = fatias.length
    ? fatias.reduce((a, b) => (b.horas > a.horas ? b : a))
    : null;

  const pctProdutivo = horasTotais > 0
    ? Math.round((horasProdutivas / horasTotais) * 1000) / 10
    : null;
  const pctKmImprodutivo = kmSomado > 0
    ? Math.round((kmImprodutivo / kmSomado) * 1000) / 10
    : null;
  const coberturaPct = registros > 0
    ? Math.round((num(resumo.registrosComTrecho) / registros) * 100)
    : null;

  const partes: string[] = [];
  if (pctProdutivo != null && horasImprodutivas > 0) {
    partes.push(
      `${fmt(pctProdutivo, 0)}% da jornada foi coleta na rota; `
      + `${fmt(horasImprodutivas)} h ficaram fora dela`,
    );
  }
  if (maior) {
    partes.push(
      `o maior consumo fora da rota é "${maior.label.toLowerCase()}", `
      + `com ${fmt(maior.horas)} h (${fmt(maior.pct, 0)}% do improdutivo)`,
    );
  }
  if (pctKmImprodutivo != null && kmImprodutivo > 0) {
    partes.push(`${fmt(pctKmImprodutivo, 0)}% do KM foi rodado fora das rotas`);
  }

  return {
    texto: partes.length ? `${partes.join('. ')}.` : '',
    maior,
    pctProdutivo,
    pctKmImprodutivo,
    coberturaPct,
  };
}
