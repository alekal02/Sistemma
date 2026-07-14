import type {
  DashboardExecutivoResponse,
  ComparacaoAnteriorInfo,
  Variacao,
  KpiCalculadoExecutivo,
} from '../../services/dashboardExecutivoService';

export const CACHE_DURACAO = 24 * 60 * 60 * 1000;
export const STORAGE_EXECUTIVO_CONTRATO = '@sistemma:executivo-contrato';
export const STORAGE_EXECUTIVO_SERVICO = '@sistemma:executivo-servico';
export const STORAGE_EXECUTIVO_DADOS = '@sistemma:executivo-dados-v1';

export type CachePersistido = {
  dados: DashboardExecutivoResponse;
  timestamp: number;
  expirado: boolean;
};

let _cacheData: { dados: DashboardExecutivoResponse; timestamp: number } | null = null;
let _cacheFiltros = '';

export function getCacheData() {
  return _cacheData;
}

export function setCacheData(data: { dados: DashboardExecutivoResponse; timestamp: number } | null) {
  _cacheData = data;
}

export function getCacheFiltros() {
  return _cacheFiltros;
}

export function setCacheFiltros(key: string) {
  _cacheFiltros = key;
}

export function resetCacheExecutivo(): void {
  _cacheData = null;
  _cacheFiltros = '';
}

export function lerEntradaCachePersistido(filtrosKey: string): CachePersistido | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_EXECUTIVO_DADOS);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { filtrosKey: string; timestamp: number; dados: DashboardExecutivoResponse };
    if (parsed.filtrosKey !== filtrosKey) return null;
    return {
      dados: parsed.dados,
      timestamp: parsed.timestamp,
      expirado: Date.now() - parsed.timestamp >= CACHE_DURACAO,
    };
  } catch {
    return null;
  }
}

const LIMITE_BYTES_CACHE = 1_500_000;

export function salvarCachePersistido(filtrosKey: string, dados: DashboardExecutivoResponse): void {
  const payload = JSON.stringify({ filtrosKey, timestamp: Date.now(), dados });
  if (payload.length > LIMITE_BYTES_CACHE) return;
  try {
    sessionStorage.setItem(STORAGE_EXECUTIVO_DADOS, payload);
  } catch { /* quota */ }
  try {
    localStorage.removeItem(STORAGE_EXECUTIVO_DADOS);
  } catch { /* ignore */ }
}

export function formatarDataISO(data: string): string {
  const d = new Date(data);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function formatarHoraISO(data: string): string {
  const d = new Date(data);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function tooltipComparacaoVariacao(
  variacao: Variacao,
  comparacao: ComparacaoAnteriorInfo | undefined,
  fonte: 'planilha' | 'abastecimento',
): string | undefined {
  if (!comparacao) return undefined;
  const intervalo = comparacao.label;

  if (variacao.tipo === 'sem_base') {
    if (fonte === 'planilha' && !comparacao.temBasePlanilha) {
      return `Ciclo anterior (${intervalo}): nenhum registro de planilha importado.`;
    }
    if (fonte === 'abastecimento' && !comparacao.temBaseAbastecimento) {
      return `Ciclo anterior (${intervalo}): nenhum abastecimento registrado.`;
    }
    return `Ciclo anterior (${intervalo}): valor anterior zerado — comparação percentual não aplicável.`;
  }

  const qtd = fonte === 'abastecimento'
    ? comparacao.abastecimentos
    : comparacao.registrosPlanilha;
  const unidade = fonte === 'abastecimento' ? 'abastecimentos' : 'registros';
  return `Comparado com ciclo anterior (${intervalo}) — ${qtd.toLocaleString('pt-BR')} ${unidade}.`;
}

export function formatarMoedaCompacta(val: number): string {
  if (val >= 1_000_000) return `R$ ${(val / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  if (val >= 10_000) return `R$ ${(val / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k`;
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function formatarMoeda(val: number): string {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const DIAS_SEM_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function diaSemanaDeIso(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return DIAS_SEM_CURTO[new Date(y, m - 1, d).getDay()];
}

export interface StatsReceitaDiaria {
  total: number;
  media: number;
  melhor: { label: string; valor: number; data?: string };
  diasComReceita: number;
  diasTotal: number;
}

export function calcularStatsReceitaDiaria(
  serie: { label: string; valor: number; data?: string }[] | undefined,
): StatsReceitaDiaria | null {
  if (!serie?.length) return null;
  const comValor = serie.filter((d) => d.valor > 0);
  if (!comValor.length) return null;
  const total = comValor.reduce((s, d) => s + d.valor, 0);
  const media = total / comValor.length;
  const melhor = comValor.reduce((a, b) => (b.valor > a.valor ? b : a), comValor[0]);
  return {
    total,
    media,
    melhor,
    diasComReceita: comValor.length,
    diasTotal: serie.length,
  };
}

export function corBarraReceita(valor: number, media: number): string {
  if (valor <= 0) return 'rgba(148,163,184,0.35)';
  const ratio = media > 0 ? valor / media : 1;
  if (ratio >= 1.15) return 'rgba(5,150,105,0.88)';
  if (ratio >= 0.85) return 'rgba(34,197,94,0.78)';
  return 'rgba(245,158,11,0.82)';
}

export function isKpiFinanceiro(kpi: KpiCalculadoExecutivo): boolean {
  if (kpi.ehProjecaoCiclo) return true;
  if (kpi.formato === 'moeda') return true;
  const n = kpi.nome.toLowerCase();
  return /faturamento|receita|financeiro|valor|ticket|r\$|custo|margem|proje/.test(n);
}
