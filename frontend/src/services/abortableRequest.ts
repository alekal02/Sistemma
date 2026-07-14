const controllers = new Map<string, AbortController>();

/** Indica cancelamento por AbortController (fetch ou axios). */
export function isRequestAborted(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: string; code?: string; message?: string };
  return (
    e.name === 'AbortError'
    || e.name === 'CanceledError'
    || e.code === 'ERR_CANCELED'
    || e.message === 'canceled'
  );
}

/** Cancela a requisição anterior da mesma chave e retorna o signal da nova. */
export function nextAbortSignal(key: string): AbortSignal {
  controllers.get(key)?.abort();
  const controller = new AbortController();
  controllers.set(key, controller);
  return controller.signal;
}

/** Usa signal externo (ex.: useEffect) ou gerencia cancelamento no serviço. */
export function resolveAbortSignal(key: string, external?: AbortSignal): AbortSignal {
  if (external) return external;
  return nextAbortSignal(key);
}
