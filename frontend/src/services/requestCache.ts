/**
 * Cache em memória com deduplicação de requisições em voo.
 * Evita cascata de chamadas idênticas (ex.: /padrao + /contracts/:id por componente).
 */

const TTL_PADRAO_MS = 5 * 60 * 1000;

interface CacheEntry<T> {
  dados: T;
  timestamp: number;
}

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export function getCacheEntry<T>(chave: string, ttlMs = TTL_PADRAO_MS): T | null {
  const entry = store.get(chave);
  if (!entry) return null;
  if (Date.now() - entry.timestamp >= ttlMs) {
    store.delete(chave);
    return null;
  }
  return entry.dados as T;
}

export function setCacheEntry<T>(chave: string, dados: T): void {
  store.set(chave, { dados, timestamp: Date.now() });
}

export function invalidateCachePrefix(prefixo: string): void {
  for (const k of [...store.keys()]) {
    if (k.startsWith(prefixo)) store.delete(k);
  }
  for (const k of [...inflight.keys()]) {
    if (k.startsWith(prefixo)) inflight.delete(k);
  }
}

export function invalidateCacheExact(chave: string): void {
  store.delete(chave);
  inflight.delete(chave);
}

/**
 * Retorna do cache, aguarda requisição em voo ou executa fetch uma vez.
 */
export async function cachedFetch<T>(
  chave: string,
  fetcher: () => Promise<T>,
  opts?: { ttlMs?: number; force?: boolean },
): Promise<T> {
  const ttlMs = opts?.ttlMs ?? TTL_PADRAO_MS;

  if (!opts?.force) {
    const hit = getCacheEntry<T>(chave, ttlMs);
    if (hit != null) return hit;

    const pendente = inflight.get(chave);
    if (pendente) return pendente as Promise<T>;
  } else {
    invalidateCacheExact(chave);
  }

  const promessa = fetcher()
    .then((dados) => {
      setCacheEntry(chave, dados);
      return dados;
    })
    .finally(() => {
      inflight.delete(chave);
    });

  inflight.set(chave, promessa);
  return promessa;
}

export function chavePadraoServico(contractId: string, servicoId: string): string {
  return `padrao:${contractId}:${servicoId}`;
}

export function chaveContrato(contractId: string): string {
  return `contrato:${contractId}`;
}

export function chaveServicosContrato(contractId: string): string {
  return `servicos:${contractId}`;
}

export function chaveSaudeContratos(): string {
  return 'contratos-saude';
}
