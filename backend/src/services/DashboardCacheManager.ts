/* ============================================
   DashboardCacheManager — Cache Inteligente do Dashboard Executivo
   ═════════════════════════════════════════════
   Substitui o cache global (variável de módulo) por um
   sistema de Map com expiração por combinação de filtros.
   
   Características:
   - Cache por chave única: {periodo, contractId, servicoId, dataInicio, dataFim}
   - Expiração automática após DURACAO (padrão: 5 min)
   - Limpeza automática de entradas expiradas a cada INTERVALO_LIMPEZA (1 min)
   - Suporte a invalidação seletiva ou total
   ============================================ */

const CACHE_DURACAO = 5 * 60 * 1000; // 5 minutos
const INTERVALO_LIMPEZA = 60 * 1000; // Limpeza a cada 1 minuto

interface CacheEntry {
  dados: any;
  timestamp: number;
}

class DashboardCacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private timerId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.iniciarLimpezaPeriodica();
  }

  /**
   * Gera chave única a partir dos filtros
   */
  private gerarChave(params: {
    periodo: string;
    dataInicio?: string;
    dataFim?: string;
    contractId?: string;
    servicoId?: string;
  }): string {
    return JSON.stringify({
      periodo: params.periodo,
      dataInicio: params.dataInicio || null,
      dataFim: params.dataFim || null,
      contractId: params.contractId || null,
      servicoId: params.servicoId || null,
    });
  }

  /**
   * Obtém dados do cache, se disponível e não expirado
   */
  obter(params: {
    periodo: string;
    dataInicio?: string;
    dataFim?: string;
    contractId?: string;
    servicoId?: string;
  }): any | null {
    const chave = this.gerarChave(params);
    const entry = this.cache.get(chave);

    if (!entry) return null;

    const idade = Date.now() - entry.timestamp;
    if (idade >= CACHE_DURACAO) {
      this.cache.delete(chave);
      return null;
    }

    return entry.dados;
  }

  /**
   * Armazena dados no cache
   */
  armazenar(
    params: {
      periodo: string;
      dataInicio?: string;
      dataFim?: string;
      contractId?: string;
      servicoId?: string;
    },
    dados: any
  ): void {
    const chave = this.gerarChave(params);
    this.cache.set(chave, {
      dados,
      timestamp: Date.now(),
    });
  }

  /**
   * Invalida entradas do cache — seletiva ou total
   */
  invalidar(chave?: string): void {
    if (chave) {
      // Invalida por prefixo (ex: invalidar tudo de um contrato)
      for (const k of this.cache.keys()) {
        if (k.includes(chave)) this.cache.delete(k);
      }
    } else {
      this.cache.clear();
    }
  }

  /**
   * Retorna idade do cache em segundos para uma combinação de filtros
   */
  idade(params: {
    periodo: string;
    dataInicio?: string;
    dataFim?: string;
    contractId?: string;
    servicoId?: string;
  }): number | null {
    const chave = this.gerarChave(params);
    const entry = this.cache.get(chave);
    if (!entry) return null;
    return Math.floor((Date.now() - entry.timestamp) / 1000);
  }

  /**
   * Remove entradas expiradas periodicamente
   */
  private iniciarLimpezaPeriodica(): void {
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = setInterval(() => {
      const agora = Date.now();
      for (const [chave, entry] of this.cache.entries()) {
        if (agora - entry.timestamp >= CACHE_DURACAO) {
          this.cache.delete(chave);
        }
      }
    }, INTERVALO_LIMPEZA);
  }

  /**
   * Para o timer de limpeza (para evitar vazamento em testes)
   */
  destruir(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.cache.clear();
  }
}

// Singleton — instância única para toda a aplicação
export const dashboardCache = new DashboardCacheManager();
