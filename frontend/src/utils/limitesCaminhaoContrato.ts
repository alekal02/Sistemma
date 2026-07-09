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
