/**
 * Cálculo de períodos semanal e quinzenal para relatório operacional.
 */
import { listarDatasIntervalo } from './periodoCicloContrato';
import { formatarIsoParaBr } from './periodoDados';
import { detectarColunasCardViagem, extrairMetricasCardViagem } from './viagemCardDados';
import { normalizarDataParaIso } from './normalizarDataIso';

export type TipoPeriodoOperacional = 'semanal' | 'quinzenal' | 'ciclo';

export interface PeriodoOperacional {
  tipo: TipoPeriodoOperacional;
  label: string;
  dataInicio: string;
  dataFim: string;
  diasNoPeriodo: number;
}

export function hojeISO(): string {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
}

/** Converte data da planilha/banco para yyyy-MM-dd (comparação segura). */
export { normalizarDataParaIso } from './normalizarDataIso';

/** Último dia com viagens no ciclo, limitado a hoje e ao fim do ciclo. */
export function inferirReferenciaPeriodoOperacional(
  ciclo: { dataInicio: string; dataFim: string },
  dias: { data: string; viagens: number }[],
): string {
  const limiteSuperior = clampIso(hojeISO(), ciclo.dataInicio, ciclo.dataFim);
  const ultimoComDados = dias
    .filter((d) => d.viagens > 0 && d.data >= ciclo.dataInicio && d.data <= ciclo.dataFim)
    .sort((a, b) => b.data.localeCompare(a.data))[0]?.data;

  if (!ultimoComDados) return limiteSuperior;
  return ultimoComDados <= limiteSuperior ? ultimoComDados : limiteSuperior;
}

function addDaysIso(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function clampIso(iso: string, min: string, max: string): string {
  if (iso < min) return min;
  if (iso > max) return max;
  return iso;
}

/**
 * Semana = 7 dias terminando na referência (hoje ou fim do ciclo, o que couber).
 * Quinzena = 15 dias com a mesma lógica, limitados ao ciclo.
 */
export function calcularPeriodoOperacional(
  tipo: TipoPeriodoOperacional,
  ciclo: { dataInicio: string; dataFim: string; label?: string },
  referenciaIso?: string,
): PeriodoOperacional {
  if (tipo === 'ciclo') {
    const diasNoPeriodo = listarDatasIntervalo(ciclo.dataInicio, ciclo.dataFim).length;
    const label = ciclo.label
      || `Ciclo ${formatarIsoParaBr(ciclo.dataInicio)} a ${formatarIsoParaBr(ciclo.dataFim)}`;
    return {
      tipo: 'ciclo',
      label,
      dataInicio: ciclo.dataInicio,
      dataFim: ciclo.dataFim,
      diasNoPeriodo,
    };
  }

  const ref = referenciaIso ?? hojeISO();
  const fim = clampIso(ref, ciclo.dataInicio, ciclo.dataFim);
  const qtdDias = tipo === 'semanal' ? 7 : 15;
  const inicio = clampIso(addDaysIso(fim, -(qtdDias - 1)), ciclo.dataInicio, ciclo.dataFim);
  const diasNoPeriodo = listarDatasIntervalo(inicio, fim).length;

  const titulo = tipo === 'semanal' ? 'Semana' : 'Quinzena';
  const label = `${titulo} ${formatarIsoParaBr(inicio)} a ${formatarIsoParaBr(fim)}`;

  return { tipo, label, dataInicio: inicio, dataFim: fim, diasNoPeriodo };
}

function extrairDataIsoRegistro(
  dado: Record<string, unknown>,
  cols: ReturnType<typeof detectarColunasCardViagem>,
): string | null {
  const m = extrairMetricasCardViagem(dado, cols);
  const viaMetricas = normalizarDataParaIso(m.dataStr);
  if (viaMetricas) return viaMetricas;

  const bruto = dado.dataSaida ?? dado['DATA SAIDA'] ?? dado['DATA SAÍDA'] ?? dado['DATA'];
  return normalizarDataParaIso(bruto);
}

/** Filtra registros brutos cujo campo de data está dentro do intervalo (inclusive). */
export function filtrarDadosPorIntervalo(
  dadosBrutos: Record<string, unknown>[],
  dataInicio: string,
  dataFim: string,
): Record<string, unknown>[] {
  if (!dadosBrutos.length || !dataInicio || !dataFim) return [];
  const cols = detectarColunasCardViagem(dadosBrutos);
  return dadosBrutos.filter((d) => {
    const dataKey = extrairDataIsoRegistro(d, cols);
    if (!dataKey) return false;
    return dataKey >= dataInicio && dataKey <= dataFim;
  });
}
