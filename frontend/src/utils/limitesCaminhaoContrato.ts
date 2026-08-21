import { normalizarPlaca } from './normalizarPlaca';

/** Limites de peso/volume por tipo — alinhados ao backend pesoMaximoCaminhao.ts */

export const TIPOS_LIMITE_CAMINHAO = ['MINI', 'TOCO', 'BASCULANTE', 'TRUCK'] as const;
export type TipoLimiteCaminhao = typeof TIPOS_LIMITE_CAMINHAO[number];

export type MapaLimiteCaminhao = Partial<Record<TipoLimiteCaminhao, number>>;

export const PESO_MAX_KG_PADRAO: Record<TipoLimiteCaminhao, number> = {
  MINI: 5000,
  TOCO: 12000,
  BASCULANTE: 14000,
  TRUCK: 16000,
};

/** Abaixo disso = subcarga (pouco peso para o tipo). Mini aceita faixa operacional ~3,5–5 t. */
export const PCT_SUBCARGA_CAPACIDADE = 60;
/** Mini: subcarga só abaixo de 50% do limite (ex.: < 2.500 kg em limite 5.000) — 3,5 t fica OK. */
export const PCT_SUBCARGA_POR_TIPO: Partial<Record<TipoLimiteCaminhao, number>> = {
  MINI: 50,
};
/** Acima de 100% = sobrecarga. */

export const VOLUME_L_PADRAO: Record<TipoLimiteCaminhao, number> = {
  MINI: 6000,
  TOCO: 15000,
  BASCULANTE: 17000,
  TRUCK: 19000,
};

export const LABEL_TIPO_CAMINHAO: Record<TipoLimiteCaminhao, string> = {
  MINI: 'Mini',
  TOCO: 'Toco',
  BASCULANTE: 'Basculante',
  TRUCK: 'Truck',
};

export function mapaLimitesParaForm(
  mapa: MapaLimiteCaminhao | null | undefined,
  padrao: Record<TipoLimiteCaminhao, number>,
): Record<TipoLimiteCaminhao, string> {
  const out = {} as Record<TipoLimiteCaminhao, string>;
  for (const t of TIPOS_LIMITE_CAMINHAO) {
    const v = mapa?.[t];
    out[t] = v && v > 0 ? String(v) : String(padrao[t]);
  }
  return out;
}

/** Converte formulário em mapa só com valores > 0 (para gravar no contrato). */
export function formLimitesParaMapa(
  form: Record<TipoLimiteCaminhao, string>,
): MapaLimiteCaminhao {
  const out: MapaLimiteCaminhao = {};
  for (const t of TIPOS_LIMITE_CAMINHAO) {
    const n = Number(String(form[t] || '').replace(',', '.'));
    if (!Number.isNaN(n) && n > 0) out[t] = Math.round(n);
  }
  return out;
}

export function normalizarTipoCaminhaoPeso(raw: string | null | undefined): TipoLimiteCaminhao | null {
  const t = String(raw || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (!t) return null;
  if (t.includes('MINI')) return 'MINI';
  if (t.includes('TRUCK') || t.includes('TRUQUE')) return 'TRUCK';
  if (t.includes('BASCULANTE') || t.includes('BASCULANTO')) return 'BASCULANTE';
  if (t.includes('TOCO')) return 'TOCO';
  return null;
}

export function resolverLimitesPesoKg(
  overrides?: MapaLimiteCaminhao | null,
): Record<TipoLimiteCaminhao, number> {
  return {
    MINI: overrides?.MINI && overrides.MINI > 0 ? overrides.MINI : PESO_MAX_KG_PADRAO.MINI,
    TOCO: overrides?.TOCO && overrides.TOCO > 0 ? overrides.TOCO : PESO_MAX_KG_PADRAO.TOCO,
    BASCULANTE: overrides?.BASCULANTE && overrides.BASCULANTE > 0
      ? overrides.BASCULANTE
      : PESO_MAX_KG_PADRAO.BASCULANTE,
    TRUCK: overrides?.TRUCK && overrides.TRUCK > 0 ? overrides.TRUCK : PESO_MAX_KG_PADRAO.TRUCK,
  };
}

export function resolverLimitesVolumeL(
  overrides?: MapaLimiteCaminhao | null,
): Record<TipoLimiteCaminhao, number> {
  return {
    MINI: overrides?.MINI && overrides.MINI > 0 ? overrides.MINI : VOLUME_L_PADRAO.MINI,
    TOCO: overrides?.TOCO && overrides.TOCO > 0 ? overrides.TOCO : VOLUME_L_PADRAO.TOCO,
    BASCULANTE: overrides?.BASCULANTE && overrides.BASCULANTE > 0
      ? overrides.BASCULANTE
      : VOLUME_L_PADRAO.BASCULANTE,
    TRUCK: overrides?.TRUCK && overrides.TRUCK > 0 ? overrides.TRUCK : VOLUME_L_PADRAO.TRUCK,
  };
}

/** Densidade padrão (kg/L) — alinhada ao backend. */
export const DENSIDADE_RESIDUO_KG_L_PADRAO = 0.55;

export function normalizarDensidadeKgLValor(raw?: number | null): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 5) return null;
  return Math.round(n * 1000) / 1000;
}

export function resolverDensidadeResiduoKgL(raw?: number | null): number {
  return normalizarDensidadeKgLValor(raw) ?? DENSIDADE_RESIDUO_KG_L_PADRAO;
}

/** Entrada de densidade: número global, mapa por tipo, ou ambos. */
export type DensidadeResiduoInput =
  | number
  | null
  | undefined
  | MapaLimiteCaminhao
  | {
      global?: number | null;
      porTipo?: MapaLimiteCaminhao | null;
    };

/** Monta input de densidade a partir de configOperacional do contrato. */
export function densidadeInputDoConfig(cfg?: {
  densidadeResiduoKgL?: number | null;
  densidadeKgL?: MapaLimiteCaminhao | null;
} | null): DensidadeResiduoInput {
  return {
    global: cfg?.densidadeResiduoKgL ?? null,
    porTipo: cfg?.densidadeKgL ?? null,
  };
}

/** Alias para opts de painéis/PDF (mesmos campos do contrato). */
export function densidadeOptsToInput(opts?: {
  densidadeResiduoKgL?: number | null;
  densidadeKgL?: MapaLimiteCaminhao | null;
} | null): DensidadeResiduoInput {
  return densidadeInputDoConfig(opts);
}

/**
 * Densidade efetiva da viagem/placa:
 * densidadeKgLPorPlaca[placa] → densidade do tipo → global → 0,55.
 */
export function resolverDensidadeParaViagem(opts: {
  placa?: string | null;
  tipo?: TipoLimiteCaminhao | null;
  densidade?: DensidadeResiduoInput;
  porPlaca?: Record<string, number> | null;
}): number {
  const placa = normalizarPlaca(opts.placa);
  if (placa && opts.porPlaca) {
    const densPlaca =
      normalizarDensidadeKgLValor(opts.porPlaca[placa])
      ?? normalizarDensidadeKgLValor(
        Object.entries(opts.porPlaca).find(([k]) => normalizarPlaca(k) === placa)?.[1] as number,
      );
    if (densPlaca != null) return densPlaca;
  }
  if (opts.tipo) return resolverDensidadePorTipo(opts.tipo, opts.densidade);
  const { global } = extrairDensidadeInput(opts.densidade);
  return normalizarDensidadeKgLValor(global) ?? DENSIDADE_RESIDUO_KG_L_PADRAO;
}

/** Peso ideal (kg): volume do tipo × densidade efetiva (placa/tipo/global). */
export function calcularPesoIdealViagem(opts: {
  placa?: string | null;
  tipo?: TipoLimiteCaminhao | null;
  volumeOverrides?: MapaLimiteCaminhao | null;
  densidade?: DensidadeResiduoInput;
  porPlaca?: Record<string, number> | null;
}): number {
  if (!opts.tipo) return 0;
  const volumes = resolverLimitesVolumeL(opts.volumeOverrides);
  const dens = resolverDensidadeParaViagem(opts);
  return calcularPesoIdealKg(volumes[opts.tipo], dens);
}

/** Normaliza mapa de densidades por placa a partir do formulário. */
export function normalizarMapaDensidadesPorPlacaForm(
  form: Record<string, string>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(form)) {
    const placa = normalizarPlaca(k);
    const raw = String(v || '').trim();
    if (!placa || !raw) continue;
    const n = normalizarDensidadeKgLValor(Number(raw.replace(',', '.')));
    if (n != null) out[placa] = n;
  }
  return out;
}

function extrairDensidadeInput(raw?: DensidadeResiduoInput): {
  global: number | null;
  porTipo: MapaLimiteCaminhao | null;
} {
  if (raw == null) return { global: null, porTipo: null };
  if (typeof raw === 'number') return { global: raw, porTipo: null };
  if (typeof raw === 'object' && ('global' in raw || 'porTipo' in raw)) {
    return {
      global: (raw as { global?: number | null }).global ?? null,
      porTipo: (raw as { porTipo?: MapaLimiteCaminhao | null }).porTipo ?? null,
    };
  }
  return { global: null, porTipo: raw as MapaLimiteCaminhao };
}

/** Densidade do tipo: mapa[tipo] → global → 0,55. */
export function resolverDensidadePorTipo(
  tipo: TipoLimiteCaminhao,
  densidade?: DensidadeResiduoInput,
): number {
  const { global, porTipo } = extrairDensidadeInput(densidade);
  return (
    normalizarDensidadeKgLValor(porTipo?.[tipo])
    ?? normalizarDensidadeKgLValor(global)
    ?? DENSIDADE_RESIDUO_KG_L_PADRAO
  );
}

export function resolverDensidadesKgL(
  densidade?: DensidadeResiduoInput,
): Record<TipoLimiteCaminhao, number> {
  return {
    MINI: resolverDensidadePorTipo('MINI', densidade),
    TOCO: resolverDensidadePorTipo('TOCO', densidade),
    BASCULANTE: resolverDensidadePorTipo('BASCULANTE', densidade),
    TRUCK: resolverDensidadePorTipo('TRUCK', densidade),
  };
}

/** Formulário de densidades (permite 3 casas decimais). */
export function formDensidadesParaMapa(
  form: Record<TipoLimiteCaminhao, string>,
): MapaLimiteCaminhao {
  const out: MapaLimiteCaminhao = {};
  for (const t of TIPOS_LIMITE_CAMINHAO) {
    const n = normalizarDensidadeKgLValor(Number(String(form[t] || '').replace(',', '.')));
    if (n != null) out[t] = n;
  }
  return out;
}

export function mapaDensidadesParaForm(
  mapa: MapaLimiteCaminhao | null | undefined,
  fallbackGlobal?: number | null,
): Record<TipoLimiteCaminhao, string> {
  const padrao = resolverDensidadeResiduoKgL(fallbackGlobal);
  const out = {} as Record<TipoLimiteCaminhao, string>;
  for (const t of TIPOS_LIMITE_CAMINHAO) {
    const v = normalizarDensidadeKgLValor(mapa?.[t]);
    out[t] = v != null ? String(v).replace('.', ',') : String(padrao).replace('.', ',');
  }
  return out;
}

/** Peso ideal operacional: volume da caixa (L) × densidade (kg/L). */
export function calcularPesoIdealKg(volumeL: number, densidadeKgL: number): number {
  if (!(volumeL > 0) || !(densidadeKgL > 0)) return 0;
  return Math.round(volumeL * densidadeKgL);
}

/** Peso ideal por tipo: volume × densidade do tipo (fallback global / 0,55). */
export function resolverPesosIdeaisKg(
  volumeOverrides?: MapaLimiteCaminhao | null,
  densidade?: DensidadeResiduoInput,
): Record<TipoLimiteCaminhao, number> {
  const volumes = resolverLimitesVolumeL(volumeOverrides);
  const dens = resolverDensidadesKgL(densidade);
  return {
    MINI: calcularPesoIdealKg(volumes.MINI, dens.MINI),
    TOCO: calcularPesoIdealKg(volumes.TOCO, dens.TOCO),
    BASCULANTE: calcularPesoIdealKg(volumes.BASCULANTE, dens.BASCULANTE),
    TRUCK: calcularPesoIdealKg(volumes.TRUCK, dens.TRUCK),
  };
}

/**
 * Escala operacional vs peso ideal (todos os tipos: Mini, Toco, Basculante, Truck).
 *
 *   < 50%            → Péssimo (coleta muito aquém)
 *   50% – < 90%      → Ruim
 *   90% – 110%       → Ótimo (faixa alvo ±10%)
 *   > 110% – 120%    → Ruim (excesso → manutenção)
 *   > 120%           → Péssimo (risco à frota)
 */
export const PCT_PESSIMO_BAIXO = 50;
export const PCT_IDEAL_MIN = 90;
export const PCT_IDEAL_MAX = 110;
export const PCT_PESSIMO_ALTO = 120;
/** Metade da faixa ótima em torno de 100% (90–110). */
export const PCT_MARGEM_IDEAL = 10;

/** @deprecated use PCT_IDEAL_MIN */
export const PCT_IDEAL_ATENCAO = PCT_IDEAL_MIN;
/** @deprecated use PCT_IDEAL_MAX */
export const PCT_IDEAL_OK = PCT_IDEAL_MAX;

export type FaixaIdealViagem =
  | 'pessimo_baixo'
  | 'ruim_baixo'
  | 'otimo'
  | 'ruim_alto'
  | 'pessimo_alto';

export type NotaIdealViagem = 'pessimo' | 'ruim' | 'otimo';

export const LABEL_FAIXA_IDEAL: Record<FaixaIdealViagem, string> = {
  pessimo_baixo: 'Péssimo (muito baixo)',
  ruim_baixo: 'Ruim (baixo)',
  otimo: 'Ótimo',
  ruim_alto: 'Ruim (excesso)',
  pessimo_alto: 'Péssimo (excesso crítico)',
};

export const LABEL_NOTA_IDEAL: Record<NotaIdealViagem, string> = {
  pessimo: 'Péssimo',
  ruim: 'Ruim',
  otimo: 'Ótimo',
};

export const COR_NOTA_IDEAL: Record<NotaIdealViagem, string> = {
  pessimo: '#b91c1c',
  ruim: '#ea580c',
  otimo: '#16a34a',
};

/** Classifica % do ideal nas 5 faixas. */
export function classificarPctIdeal(pctIdeal: number): FaixaIdealViagem {
  if (pctIdeal < PCT_PESSIMO_BAIXO) return 'pessimo_baixo';
  if (pctIdeal < PCT_IDEAL_MIN) return 'ruim_baixo';
  if (pctIdeal <= PCT_IDEAL_MAX) return 'otimo';
  if (pctIdeal <= PCT_PESSIMO_ALTO) return 'ruim_alto';
  return 'pessimo_alto';
}

export function notaDaFaixaIdeal(faixa: FaixaIdealViagem): NotaIdealViagem {
  if (faixa === 'otimo') return 'otimo';
  if (faixa === 'pessimo_baixo' || faixa === 'pessimo_alto') return 'pessimo';
  return 'ruim';
}

export function classificarPesoVsIdeal(
  pesoKg: number,
  pesoIdealKg: number,
): { pctIdeal: number; faixa: FaixaIdealViagem; nota: NotaIdealViagem } {
  const pctIdeal = Math.round((pesoKg / pesoIdealKg) * 1000) / 10;
  const faixa = classificarPctIdeal(pctIdeal);
  return { pctIdeal, faixa, nota: notaDaFaixaIdeal(faixa) };
}

/** Faixa ótima em kg (90%–110% do ideal). */
export function faixaIdealKg(pesoIdealKg: number): { minKg: number; maxKg: number } {
  return {
    minKg: pesoIdealKg * (PCT_IDEAL_MIN / 100),
    maxKg: pesoIdealKg * (PCT_IDEAL_MAX / 100),
  };
}

export function dentroMargemIdeal(pesoKg: number, pesoIdealKg: number): boolean {
  if (!(pesoKg > 0) || !(pesoIdealKg > 0)) return false;
  return classificarPesoVsIdeal(pesoKg, pesoIdealKg).nota === 'otimo';
}

/** true se não está na faixa ótima (90–110%). */
export function pctIdealForaDaMargem(pctIdeal: number | null | undefined): boolean {
  if (pctIdeal == null || !Number.isFinite(pctIdeal)) return false;
  return classificarPctIdeal(pctIdeal) !== 'otimo';
}

/**
 * Status legado (bom/medio/ruim) para placas/rotas:
 * Ótimo→bom, Ruim→medio, Péssimo→ruim.
 */
export function statusPctVsMargemIdeal(pctIdeal: number): 'bom' | 'medio' | 'ruim' {
  const nota = notaDaFaixaIdeal(classificarPctIdeal(pctIdeal));
  if (nota === 'otimo') return 'bom';
  if (nota === 'ruim') return 'medio';
  return 'ruim';
}

export function textoEscalaIdealCurto(): string {
  return `<${PCT_PESSIMO_BAIXO}% péssimo · ${PCT_PESSIMO_BAIXO}–${PCT_IDEAL_MIN}% ruim · `
    + `${PCT_IDEAL_MIN}–${PCT_IDEAL_MAX}% ótimo · ${PCT_IDEAL_MAX}–${PCT_PESSIMO_ALTO}% ruim · `
    + `>${PCT_PESSIMO_ALTO}% péssimo`;
}

export function limitePesoParaTipo(
  tipo: TipoLimiteCaminhao | null,
  limites: Record<TipoLimiteCaminhao, number>,
): number | null {
  if (!tipo) return null;
  return limites[tipo] > 0 ? limites[tipo] : null;
}

export type ClassificacaoOcupacaoPeso = 'sobrecarga' | 'subcarga' | 'ok' | 'sem_limite';

export function classificarOcupacaoPeso(
  pesoKg: number,
  limiteKg: number | null | undefined,
  tipo?: TipoLimiteCaminhao | null,
): { classificacao: ClassificacaoOcupacaoPeso; ocupacaoPct: number | null } {
  if (!(pesoKg > 0) || !(limiteKg && limiteKg > 0)) {
    return { classificacao: 'sem_limite', ocupacaoPct: null };
  }
  const ocupacaoPct = Math.round((pesoKg / limiteKg) * 1000) / 10;
  if (pesoKg > limiteKg) return { classificacao: 'sobrecarga', ocupacaoPct };
  const pctSub = (tipo && PCT_SUBCARGA_POR_TIPO[tipo]) || PCT_SUBCARGA_CAPACIDADE;
  if (ocupacaoPct < pctSub) return { classificacao: 'subcarga', ocupacaoPct };
  return { classificacao: 'ok', ocupacaoPct };
}
