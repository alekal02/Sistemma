import PlanilhaService from './PlanilhaService';
import {
  DADOS_CACHE_MAX_ENTRADAS,
  DADOS_CACHE_TTL_MS,
  LIMITE_DADOS_MAX,
} from '../config/limitesRecursos';

/** Cache em memória — uma entrada por serviço (evita duplicar 50k + 999999) */
const cacheDados = new Map<string, { dados: Record<string, any>[]; timestamp: number }>();

export { DADOS_CACHE_TTL_MS, LIMITE_DADOS_MAX as LIMITE_PADRAO_GRAFICOS };

export function invalidarCacheDadosServico(servicoId: string): void {
  cacheDados.delete(chaveCache(servicoId));
}

function chaveCache(servicoId: string): string {
  return `dados:${servicoId}`;
}

function evictarCacheSeNecessario(): void {
  const agora = Date.now();
  for (const [k, v] of cacheDados) {
    if (agora - v.timestamp > DADOS_CACHE_TTL_MS) cacheDados.delete(k);
  }
  if (cacheDados.size <= DADOS_CACHE_MAX_ENTRADAS) return;

  const ordenado = [...cacheDados.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
  const remover = ordenado.length - DADOS_CACHE_MAX_ENTRADAS;
  for (let i = 0; i < remover; i++) {
    cacheDados.delete(ordenado[i][0]);
  }
}

/**
 * Carrega dados do serviço com cache compartilhado (limite único por serviço).
 * O parâmetro `limite` só reduz o slice retornado; o cache guarda até LIMITE_DADOS_MAX.
 */
export async function obterDadosServicoComCache(
  servicoId: string,
  limite: number = LIMITE_DADOS_MAX,
): Promise<Record<string, any>[]> {
  const key = chaveCache(servicoId);
  const cap = Math.min(Math.max(limite, 1), LIMITE_DADOS_MAX);

  const cached = cacheDados.get(key);
  if (cached && Date.now() - cached.timestamp < DADOS_CACHE_TTL_MS) {
    return cached.dados.slice(0, cap);
  }

  const dados = await PlanilhaService.getDadosBrutosPorServico(servicoId, LIMITE_DADOS_MAX);
  cacheDados.set(key, { dados, timestamp: Date.now() });
  evictarCacheSeNecessario();

  return dados.slice(0, cap);
}
