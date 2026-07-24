/**
 * Cache em memória de endpoints pesados (comparação, KPIs, gráficos).
 * Módulo separado para ContractController invalidar sem import circular.
 */

const cacheBackend = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 120_000; // 2 minutos

export function getEndpointCache<T>(key: string): T | null {
  const item = cacheBackend.get(key);
  if (item && Date.now() - item.timestamp < CACHE_TTL_MS) {
    return item.data as T;
  }
  cacheBackend.delete(key);
  return null;
}

export function setEndpointCache(key: string, data: any): void {
  cacheBackend.set(key, { data, timestamp: Date.now() });
  if (cacheBackend.size > 50) {
    const agora = Date.now();
    for (const [k, v] of cacheBackend) {
      if (agora - v.timestamp > CACHE_TTL_MS) cacheBackend.delete(k);
    }
  }
}

export function invalidateEndpointCachePrefix(prefix: string): void {
  for (const key of cacheBackend.keys()) {
    if (key.startsWith(prefix)) cacheBackend.delete(key);
  }
}

/** Limpa caches de KPIs/gráficos de um serviço. */
export function invalidarCacheDashboardServico(servicoId: string): void {
  for (const key of cacheBackend.keys()) {
    if (!key.includes(servicoId)) continue;
    if (
      key.startsWith('kpi-valores')
      || key.startsWith('rocada-agregacao')
      || key.startsWith('coleta-agregacao')
      || key.startsWith(`grafico:${servicoId}`)
      || key.startsWith(`graficos-batch:${servicoId}`)
    ) {
      cacheBackend.delete(key);
    }
  }
}

/**
 * Limpa cache da comparação após alterar limites do contrato
 * (volume L, peso máx.) — a CAIXA MÉDIA depende desses valores.
 */
export function invalidarCacheComparacaoContrato(contractId: string): void {
  for (const key of [...cacheBackend.keys()]) {
    if (key.startsWith(`comparar-tipo:${contractId}:`) || key.startsWith('comparar-global:')) {
      cacheBackend.delete(key);
    }
  }
}

/** Fingerprint dos limites do contrato para invalidar cache sem depender só de TTL. */
export function fingerprintLimitesContrato(configOperacional?: {
  pesoMaximoKg?: Record<string, number> | null;
  volumeL?: Record<string, number> | null;
  densidadeResiduoKgL?: number | null;
} | null): string {
  const peso = configOperacional?.pesoMaximoKg || {};
  const vol = configOperacional?.volumeL || {};
  const dens = configOperacional?.densidadeResiduoKgL ?? null;
  return JSON.stringify({ p: peso, v: vol, d: dens });
}
