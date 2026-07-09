/**
 * Filtragem e validação de registros por dia — mesma lógica do relatório diário.
 */
import {
  detectarColunasCardViagem,
  extrairMetricasCardViagem,
  obterValorRegistro,
  serialParaMin,
  fmtMin,
  type ColunasCardViagem,
  type MetricasCardViagem,
} from './viagemCardDados';
import { agruparPorDia, type DadoDiario } from './relatorioDiario';
import { normalizarDataParaIso as normalizarDataIso } from './normalizarDataIso';

export { normalizarDataIso };

export function extrairDataIsoRegistro(
  dado: Record<string, unknown>,
  cols: ColunasCardViagem,
): string | null {
  const direto = normalizarDataIso(dado.dataSaida);
  if (direto) return direto;

  const data = obterValorRegistro(dado, cols.colData, 'dataSaida');
  const iso = normalizarDataIso(data);
  if (iso) return iso;

  const m = extrairMetricasCardViagem(dado, cols);
  if (m.dataStr && m.dataStr !== '—') {
    return normalizarDataIso(m.dataStr);
  }
  return null;
}

export function filtrarRegistrosPorDia(
  dadosBrutos: Record<string, unknown>[],
  dataIso: string,
  cols?: ColunasCardViagem,
): Record<string, unknown>[] {
  if (!dadosBrutos.length || !dataIso) return [];
  const colunas = cols ?? detectarColunasCardViagem(dadosBrutos);
  return dadosBrutos.filter((d) => extrairDataIsoRegistro(d, colunas) === dataIso);
}

/** Filtra registros cujo dataSaida está no intervalo [dataInicio, dataFim] (inclusive) */
export function filtrarRegistrosPorPeriodo(
  dadosBrutos: Record<string, unknown>[],
  dataInicio: string,
  dataFim: string,
  cols?: ColunasCardViagem,
): Record<string, unknown>[] {
  if (!dadosBrutos.length || !dataInicio || !dataFim) return [];
  const colunas = cols ?? detectarColunasCardViagem(dadosBrutos);
  return dadosBrutos.filter((d) => {
    const iso = extrairDataIsoRegistro(d, colunas);
    return iso != null && iso >= dataInicio && iso <= dataFim;
  });
}

export interface ResumoManualDia {
  viagens: number;
  toneladas: number;
  km: number;
  horas: number;
  coletores: number;
}

export function resumirRegistrosManual(
  registros: Record<string, unknown>[],
  cols?: ColunasCardViagem,
): ResumoManualDia {
  const colunas = cols ?? detectarColunasCardViagem(registros);
  const placas = new Set<string>();
  let viagens = 0;
  let toneladas = 0;
  let km = 0;
  let horas = 0;

  for (const r of registros) {
    const m = extrairMetricasCardViagem(r, colunas);
    viagens += Math.max(m.viagens, 1);
    toneladas += m.toneladas;
    km += m.kmFinal;
    horas += m.horasTrabalhadas;
    if (m.placa && m.placa !== '—') placas.add(m.placa);
  }

  return { viagens, toneladas, km, horas, coletores: placas.size };
}

export interface ValidacaoDiaResult {
  ok: boolean;
  registrosEncontrados: number;
  manual: ResumoManualDia;
  agregado: DadoDiario | null;
  resumoCiclo?: DadoDiario | null;
  mensagens: string[];
}

function quaseIgual(a: number, b: number, tol = 0.05): boolean {
  return Math.abs(a - b) <= tol;
}

export function validarDadosDia(
  registros: Record<string, unknown>[],
  dataIso: string,
  resumoCiclo?: DadoDiario | null,
): ValidacaoDiaResult {
  const cols = detectarColunasCardViagem(registros);
  const manual = resumirRegistrosManual(registros, cols);
  const { dias } = agruparPorDia(registros);
  const agregado = dias.find((d) => d.data === dataIso) ?? dias[0] ?? null;

  const mensagens: string[] = [];
  let ok = true;

  if (registros.length === 0) {
    return {
      ok: false,
      registrosEncontrados: 0,
      manual,
      agregado,
      resumoCiclo,
      mensagens: ['Nenhum registro encontrado para esta data nos dados carregados.'],
    };
  }

  if (agregado) {
    if (!quaseIgual(manual.viagens, agregado.viagens)) {
      ok = false;
      mensagens.push(
        `Viagens divergentes: soma linha a linha (${manual.viagens}) vs agregação (${agregado.viagens}).`,
      );
    }
    if (!quaseIgual(manual.toneladas, agregado.toneladas)) {
      ok = false;
      mensagens.push(
        `Toneladas divergentes: ${manual.toneladas.toFixed(2)} t vs ${agregado.toneladas.toFixed(2)} t.`,
      );
    }
    if (!quaseIgual(manual.km, agregado.km)) {
      ok = false;
      mensagens.push(`KM divergente: ${manual.km.toFixed(0)} vs ${agregado.km.toFixed(0)}.`);
    }
    if (!quaseIgual(manual.horas, agregado.horas)) {
      ok = false;
      mensagens.push(`Horas divergentes: ${manual.horas.toFixed(1)} vs ${agregado.horas.toFixed(1)}.`);
    }
  }

  if (resumoCiclo && resumoCiclo.viagens > 0) {
    if (!quaseIgual(manual.viagens, resumoCiclo.viagens)) {
      ok = false;
      mensagens.push(
        `Viagens do ciclo (${resumoCiclo.viagens}) não batem com registros filtrados (${manual.viagens}).`,
      );
    }
    if (!quaseIgual(manual.toneladas, resumoCiclo.toneladas)) {
      ok = false;
      mensagens.push(
        `Toneladas do ciclo (${resumoCiclo.toneladas.toFixed(2)} t) diferem dos registros (${manual.toneladas.toFixed(2)} t).`,
      );
    }
  }

  if (ok) {
    mensagens.unshift(
      `${registros.length} registro(s) validado(s): totais conferem com a agregação do sistema.`,
    );
  }

  return {
    ok,
    registrosEncontrados: registros.length,
    manual,
    agregado,
    resumoCiclo,
    mensagens,
  };
}

export interface RegistroDiaLinha extends MetricasCardViagem {
  id: string | number;
  horaSaidaFmt: string;
  horaChegadaFmt: string;
}

export function listarLinhasDia(
  registros: Record<string, unknown>[],
  cols?: ColunasCardViagem,
): RegistroDiaLinha[] {
  const colunas = cols ?? detectarColunasCardViagem(registros);
  return registros.map((r, idx) => {
    const m = extrairMetricasCardViagem(r, colunas);
    const hs = obterValorRegistro(r, colunas.colHoraSaida, 'horaSaida');
    const hc = obterValorRegistro(r, colunas.colHoraChegada, 'horaChegada');
    return {
      id: (r.id as string | number) ?? idx,
      ...m,
      horaSaidaFmt: hs ? fmtMin(serialParaMin(hs)) : '—',
      horaChegadaFmt: hc ? fmtMin(serialParaMin(hc)) : '—',
    };
  });
}

export function isDataIsoValida(data: string | undefined): boolean {
  return !!data && /^\d{4}-\d{2}-\d{2}$/.test(data);
}
