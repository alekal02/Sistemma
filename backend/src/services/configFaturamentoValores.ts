import type { Contract } from '../entities/Contract';

type ConfigFaturamento = {
  ativo?: boolean;
  valorTonelada?: number | null;
  valorMini?: number | null;
  valorTruck?: number | null;
  valorToco?: number | null;
  valorKmLinear?: number | null;
  valorM2?: number | null;
  valorPorArvore?: number | null;
  valorPorEquipe?: number | null;
  valorPorUnidade?: number | null;
} | null | undefined;

function setIfPositive(target: Record<string, number>, key: string, value: unknown) {
  if (value !== null && value !== undefined && value !== '' && !Number.isNaN(Number(value))) {
    const n = Number(value);
    if (n > 0) target[key] = n;
  }
}

/** Monta constantes VALOR_* usadas nas fórmulas de receita dos KPIs universais. */
export function buildValoresFixosFaturamento(
  contract?: Contract | null,
  configFaturamento?: ConfigFaturamento
): Record<string, number> {
  const valores: Record<string, number> = {};
  const cfgAtivo = configFaturamento?.ativo === true;

  if (cfgAtivo && configFaturamento) {
    setIfPositive(valores, 'VALOR_TONELADA', configFaturamento.valorTonelada);
    setIfPositive(valores, 'VALOR_MINI', configFaturamento.valorMini);
    setIfPositive(valores, 'VALOR_TRUCK', configFaturamento.valorTruck);
    setIfPositive(valores, 'VALOR_TOCO', configFaturamento.valorToco);
    setIfPositive(valores, 'VALOR_KM_LINEAR', configFaturamento.valorKmLinear);
    setIfPositive(valores, 'VALOR_M2', configFaturamento.valorM2);
    setIfPositive(valores, 'VALOR_POR_ARVORE', configFaturamento.valorPorArvore);
    setIfPositive(valores, 'VALOR_POR_EQUIPE', configFaturamento.valorPorEquipe);
    setIfPositive(valores, 'VALOR_POR_UNIDADE', configFaturamento.valorPorUnidade);
    return valores;
  }

  if (contract) {
    setIfPositive(valores, 'VALOR_TONELADA', contract.valorTonelada);
    setIfPositive(valores, 'VALOR_MINI', contract.valorMini);
    setIfPositive(valores, 'VALOR_TRUCK', contract.valorTruck);
    setIfPositive(valores, 'VALOR_TOCO', contract.valorToco);
  }

  return valores;
}
