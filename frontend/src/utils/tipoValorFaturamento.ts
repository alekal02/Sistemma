/**
 * Unidades de cobrança usadas no hub do contrato e no modal de criação de serviço.
 */
export type TipoValor =
  | 'caminhao'
  | 'km_linear'
  | 'm2'
  | 'por_arvore'
  | 'por_unidade'
  | 'por_equipe';

export const TIPO_VALOR_LABELS: Record<TipoValor, string> = {
  caminhao: 'Por Tipo de Caminhão (R$/t)',
  km_linear: 'KM Linear (R$/km)',
  m2: 'Metro Quadrado (R$/m²)',
  por_arvore: 'Por Árvore (R$/árvore)',
  por_unidade: 'Por Unidade (R$/un)',
  por_equipe: 'Por Equipe (R$/equipe)',
};

export const TIPO_VALOR_PADRAO: Record<string, TipoValor> = {
  coleta_caminhao: 'caminhao',
  remocao: 'por_equipe',
  varricao: 'km_linear',
  rocadeira: 'm2',
  poda: 'por_arvore',
  pintura_meio_fio: 'km_linear',
  capina: 'km_linear',
  geral: 'caminhao',
};

/** Opções disponíveis no seletor do hub (todos os serviços padrão). */
export const TIPOS_VALOR_HUB: TipoValor[] = [
  'caminhao',
  'km_linear',
  'm2',
  'por_arvore',
  'por_unidade',
  'por_equipe',
];

export function tipoValorPadrao(tipoServico: string): TipoValor {
  return TIPO_VALOR_PADRAO[tipoServico] || 'caminhao';
}

export function tipoValorFromConfig(cfg: { tipoCobranca?: string } | null | undefined, tipoServico: string): TipoValor {
  const tc = String(cfg?.tipoCobranca || '');
  if (tc === 'tonelada_tipo_caminhao' || tc === 'tonelada') return 'caminhao';
  if (tc === 'km_linear') return 'km_linear';
  if (tc === 'm2') return 'm2';
  if (tc === 'por_arvore') return 'por_arvore';
  if (tc === 'por_unidade') return 'por_unidade';
  if (tc === 'por_equipe') return 'por_equipe';
  return tipoValorPadrao(tipoServico);
}

export type CamposValorForm = {
  valorMini: string;
  valorTruck: string;
  valorToco: string;
  valorBasculante: string;
  valorKmLinear: string;
  valorM2: string;
  valorM2Manual: string;
  valorM2Mecanizada: string;
  valorPorArvore: string;
  valorPorUnidade: string;
  valorPorEquipe: string;
};

export function camposValorVazios(): CamposValorForm {
  return {
    valorMini: '',
    valorTruck: '',
    valorToco: '',
    valorBasculante: '',
    valorKmLinear: '',
    valorM2: '',
    valorM2Manual: '',
    valorM2Mecanizada: '',
    valorPorArvore: '',
    valorPorUnidade: '',
    valorPorEquipe: '',
  };
}

export function parseValorMonetario(v: string): number | null {
  const s = String(v ?? '').trim().replace(/R\$\s?/gi, '').replace(/\s/g, '');
  if (!s) return null;
  let n: number;
  if (s.includes(',') && s.includes('.')) {
    n = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? Number(s.replace(/\./g, '').replace(',', '.'))
      : Number(s.replace(/,/g, ''));
  } else if (s.includes(',')) {
    n = Number(s.replace(',', '.'));
  } else {
    n = Number(s);
  }
  return !Number.isNaN(n) && n >= 0 ? n : null;
}

export function buildConfigFaturamentoFromForm(
  tipoValor: TipoValor,
  valores: CamposValorForm,
  opts?: { dualM2?: boolean },
): Record<string, unknown> {
  const parse = parseValorMonetario;
  const base = { ativo: true };

  if (tipoValor === 'caminhao') {
    return {
      ...base,
      tipoCobranca: 'tonelada_tipo_caminhao',
      valorMini: parse(valores.valorMini),
      valorTruck: parse(valores.valorTruck),
      valorToco: parse(valores.valorToco),
      valorBasculante: parse(valores.valorBasculante),
    };
  }
  if (tipoValor === 'km_linear') {
    return { ...base, tipoCobranca: 'km_linear', valorKmLinear: parse(valores.valorKmLinear) };
  }
  if (tipoValor === 'm2') {
    if (opts?.dualM2) {
      const valorM2Manual = parse(valores.valorM2Manual);
      const valorM2Mecanizada = parse(valores.valorM2Mecanizada);
      const valorM2 =
        valorM2Manual != null && valorM2Mecanizada != null && valorM2Manual === valorM2Mecanizada
          ? valorM2Manual
          : valorM2Mecanizada ?? valorM2Manual;
      return {
        ...base,
        tipoCobranca: 'm2',
        valorM2,
        valorM2Manual,
        valorM2Mecanizada,
      };
    }
    return { ...base, tipoCobranca: 'm2', valorM2: parse(valores.valorM2 || valores.valorM2Manual) };
  }
  if (tipoValor === 'por_equipe') {
    return { ...base, tipoCobranca: 'por_equipe', valorPorEquipe: parse(valores.valorPorEquipe) };
  }
  if (tipoValor === 'por_unidade') {
    return { ...base, tipoCobranca: 'por_unidade', valorPorUnidade: parse(valores.valorPorUnidade) };
  }
  return { ...base, tipoCobranca: 'por_arvore', valorPorArvore: parse(valores.valorPorArvore) };
}
