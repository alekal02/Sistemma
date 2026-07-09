/** Indica se o dashboard deve exibir rankings melhores/piores */
export function rankingsOperacionaisHabilitados(
  configDashboard: Record<string, unknown> | null | undefined,
  tipoServico?: string,
): boolean {
  const flag = configDashboard?.rankingsOperacionais as { ativo?: boolean } | undefined;
  if (flag?.ativo === false) return false;
  if (flag?.ativo === true) return true;
  return tipoServico === 'coleta_caminhao';
}
