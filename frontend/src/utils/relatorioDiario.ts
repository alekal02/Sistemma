/**
 * Utilitário para Relatório Diário — agrupa dados brutos por data
 * e calcula métricas operacionais + financeiras por dia.
 */

import { detectarColunasCardViagem, extrairMetricasCardViagem } from './viagemCardDados';
import { contarViagensPorRotaRegistro } from './viagensPorRota';
import { normalizarDataParaIso } from './normalizarDataIso';

export interface DadoDiario {
  /** Data no formato yyyy-MM-dd */
  data: string;
  /** Label amigável (dd/mm) */
  label: string;
  /** Métricas operacionais */
  viagens: number;
  /** Linhas (rotas) no dia */
  rotas: number;
  toneladas: number;
  /** Área roçada (m²) — serviços de roçada */
  areaM2?: number;
  km: number;
  horas: number;
  coletores: number;
  /** Métricas financeiras (estimadas via peso) */
  faturamento: number;
  receitaKm: number;
  receitaHora: number;
}

export interface RelatorioDiarioResult {
  dias: DadoDiario[];
  totais: DadoDiario;
  totalRegistros: number;
}

/**
 * Agrupa dados brutos por data e calcula métricas diárias.
 * @param dadosBrutos Lista de registros brutos (já filtrados por período)
 * @param valorTonelada Valor por tonelada para estimar faturamento (R$)
 * @param valorMini Valor para caminhão Mini (R$/ton)
 * @param valorTruck Valor para caminhão Truck (R$/ton)
 * @param valorToco Valor para caminhão Toco (R$/ton)
 * @param valorBasculante Valor para caminhão Basculante (R$/ton)
 */
export function agruparPorDia(
  dadosBrutos: Record<string, unknown>[],
  valorTonelada = 80,
  valorMini?: number,
  valorTruck?: number,
  valorToco?: number,
  valorBasculante?: number,
): RelatorioDiarioResult {
  if (!dadosBrutos.length) {
    return {
      dias: [],
      totais: criarVazio('Total Geral'),
      totalRegistros: 0,
    };
  }

  const cols = detectarColunasCardViagem(dadosBrutos);

  // Mapa: data → DadoDiario
  const mapa = new Map<string, DadoDiario>();
  const coletoresPorDia = new Map<string, Set<string>>();

  // Detectar coluna de tipo de caminhão para faturamento diferenciado
  const chaves = Object.keys(dadosBrutos[0] || {});
  const normalizar = (s: string) =>
    s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
  const colTipo = chaves.find(k => {
    const n = normalizar(k);
    return n.includes('TIPOCAMINHAO') || n.includes('TIPO') && n.includes('CAMINHAO') || n.includes('TIPODECAMINHAO');
  });

  // ⭐ O peso já vem convertido para toneladas pelo extrairMetricasCardViagem (peso/1000)
  //    Não aplicar heurística de unidade aqui — o entity field pesoTotal sempre está em KG

  for (const dado of dadosBrutos) {
    const m = extrairMetricasCardViagem(dado, cols);
    const dataKey =
      normalizarDataParaIso(dado.dataSaida)
      ?? normalizarDataParaIso(dado['DATA SAIDA'])
      ?? normalizarDataParaIso(dado['DATA SAÍDA'])
      ?? normalizarDataParaIso(dado['DATA'])
      ?? normalizarDataParaIso(m.dataStr !== '—' ? m.dataStr : null);
    if (!dataKey) continue;
    if (!mapa.has(dataKey)) {
      mapa.set(dataKey, {
        data: dataKey,
        label: dataKey.slice(5).split('-').reverse().join('/'),
        viagens: 0,
        rotas: 0,
        toneladas: 0,
        km: 0,
        horas: 0,
        coletores: 0,
        faturamento: 0,
        receitaKm: 0,
        receitaHora: 0,
      });
      coletoresPorDia.set(dataKey, new Set());
    }

    const entry = mapa.get(dataKey)!;
    const viagensLinha = contarViagensPorRotaRegistro(dado);
    entry.rotas += 1;
    entry.viagens += viagensLinha > 0 ? viagensLinha : (m.toneladas > 0 || m.kmFinal > 0 ? 1 : 0);
    entry.toneladas += m.toneladas; // já está em toneladas (peso/1000)
    entry.km += m.kmFinal;
    entry.horas += m.horasTrabalhadas;

    if (m.placa && m.placa !== '—') {
      coletoresPorDia.get(dataKey)!.add(m.placa);
    }

    // Faturamento por tipo de caminhão
    let valorUsado = valorTonelada;
    if (colTipo) {
      const tipoRaw = normalizar(String(dado[colTipo] || ''));
      if (tipoRaw.includes('MINI') && valorMini) valorUsado = valorMini;
      else if (tipoRaw.includes('TRUCK') && valorTruck) valorUsado = valorTruck;
      else if ((tipoRaw.includes('BASCULANTE') || tipoRaw.includes('BASCULANTO')) && valorBasculante) {
        valorUsado = valorBasculante;
      }
      else if (tipoRaw.includes('TOCO') && valorToco) valorUsado = valorToco;
    }

    entry.faturamento += m.toneladas * valorUsado;
  }

  // Preencher coletores e calcular receitas secundárias
  for (const [dataKey, entry] of mapa) {
    entry.coletores = coletoresPorDia.get(dataKey)?.size || 0;
    entry.receitaKm = entry.km > 0 ? entry.faturamento / entry.km : 0;
    entry.receitaHora = entry.horas > 0 ? entry.faturamento / entry.horas : 0;
  }

  // Ordenar do mais recente para o mais antigo
  const dias = Array.from(mapa.values()).sort((a, b) => b.data.localeCompare(a.data));

  // Totais
  const totais = criarVazio('Total Geral');
  for (const d of dias) {
    totais.viagens += d.viagens;
    totais.rotas += d.rotas;
    totais.toneladas += d.toneladas;
    totais.km += d.km;
    totais.horas += d.horas;
    totais.coletores = Math.max(totais.coletores, d.coletores);
    totais.faturamento += d.faturamento;
  }
  totais.receitaKm = totais.km > 0 ? totais.faturamento / totais.km : 0;
  totais.receitaHora = totais.horas > 0 ? totais.faturamento / totais.horas : 0;

  return { dias, totais, totalRegistros: dadosBrutos.length };
}

function criarVazio(label: string): DadoDiario {
  return {
    data: '',
    label,
    viagens: 0,
    rotas: 0,
    toneladas: 0,
    areaM2: 0,
    km: 0,
    horas: 0,
    coletores: 0,
    faturamento: 0,
    receitaKm: 0,
    receitaHora: 0,
  };
}

import { listarDatasIntervalo } from './periodoCicloContrato';

function criarDiaVazio(data: string): DadoDiario {
  const [, mes, dia] = data.split('-');
  return {
    data,
    label: `${dia}/${mes}`,
    viagens: 0,
    rotas: 0,
    toneladas: 0,
    areaM2: 0,
    km: 0,
    horas: 0,
    coletores: 0,
    faturamento: 0,
    receitaKm: 0,
    receitaHora: 0,
  };
}

/** Agrupa dados do ciclo: todos os dias do intervalo, com ou sem registros */
export function agruparCicloPorDia(
  dadosBrutos: Record<string, unknown>[],
  dataInicio: string,
  dataFim: string,
  valorTonelada = 80,
  valorMini?: number,
  valorTruck?: number,
  valorToco?: number,
  valorBasculante?: number,
): RelatorioDiarioResult & { diasComDados: number; diasSemDados: number } {
  const todasDatas = listarDatasIntervalo(dataInicio, dataFim);
  if (!todasDatas.length) {
    return {
      dias: [],
      totais: criarVazio('Total do Ciclo'),
      totalRegistros: 0,
      diasComDados: 0,
      diasSemDados: 0,
    };
  }

  const { dias: diasComRegistro, totalRegistros } = agruparPorDia(
    dadosBrutos,
    valorTonelada,
    valorMini,
    valorTruck,
    valorToco,
    valorBasculante,
  );
  const mapa = new Map(diasComRegistro.map((d) => [d.data, d]));

  const dias = todasDatas.map((data) => mapa.get(data) ?? criarDiaVazio(data));

  const diasComDados = dias.filter((d) => d.viagens > 0).length;

  const totaisCiclo = criarVazio('Total do Ciclo');
  for (const d of dias) {
    if (d.viagens <= 0) continue;
    totaisCiclo.viagens += d.viagens;
    totaisCiclo.rotas += d.rotas;
    totaisCiclo.toneladas += d.toneladas;
    totaisCiclo.km += d.km;
    totaisCiclo.horas += d.horas;
    totaisCiclo.coletores = Math.max(totaisCiclo.coletores, d.coletores);
    totaisCiclo.faturamento += d.faturamento;
  }
  totaisCiclo.receitaKm = totaisCiclo.km > 0 ? totaisCiclo.faturamento / totaisCiclo.km : 0;
  totaisCiclo.receitaHora = totaisCiclo.horas > 0 ? totaisCiclo.faturamento / totaisCiclo.horas : 0;

  return {
    dias,
    totais: totaisCiclo,
    totalRegistros,
    diasComDados,
    diasSemDados: dias.length - diasComDados,
  };
}

/** Monta relatório do ciclo a partir da agregação SQL do backend (sem limite de registros). */
export function agruparCicloPorDiaFromApi(
  diasApi: Array<{ data: string; rotas: number; viagens: number; pesoTotalKg: number; kmTotal: number; areaM2?: number }>,
  dataInicio: string,
  dataFim: string,
  valorTonelada = 80,
  valorMini?: number,
  valorTruck?: number,
  valorToco?: number,
  valorBasculante?: number,
  opts?: { modo?: 'coleta' | 'rocada'; valorM2?: number | null },
): RelatorioDiarioResult & { diasComDados: number; diasSemDados: number } {
  const tarifa = valorTonelada;
  const modoRocada = opts?.modo === 'rocada';
  const valorM2 = Number(opts?.valorM2) > 0 ? Number(opts?.valorM2) : 0;
  void valorMini;
  void valorTruck;
  void valorToco;
  void valorBasculante;

  const mapa = new Map(diasApi.map((d) => [d.data, d]));
  const todasDatas = listarDatasIntervalo(dataInicio, dataFim);
  if (!todasDatas.length) {
    return {
      dias: [],
      totais: criarVazio('Total do Ciclo'),
      totalRegistros: 0,
      diasComDados: 0,
      diasSemDados: 0,
    };
  }

  const dias = todasDatas.map((data) => {
    const raw = mapa.get(data);
    const areaM2 = Number(raw?.areaM2 || 0);
    const temDados = modoRocada
      ? !!raw && (raw.rotas > 0 || areaM2 > 0)
      : !!raw && raw.viagens > 0;
    if (!raw || !temDados) return criarDiaVazio(data);

    if (modoRocada) {
      const faturamento = areaM2 * valorM2;
      return {
        data,
        label: `${data.slice(8, 10)}/${data.slice(5, 7)}`,
        viagens: raw.rotas, // registros no dia
        rotas: raw.rotas,
        toneladas: 0,
        areaM2,
        km: 0,
        horas: 0,
        coletores: 0,
        faturamento,
        receitaKm: 0,
        receitaHora: 0,
      };
    }

    const toneladas = raw.pesoTotalKg / 1000;
    const faturamento = toneladas * tarifa;
    return {
      data,
      label: `${data.slice(8, 10)}/${data.slice(5, 7)}`,
      viagens: raw.viagens,
      rotas: raw.rotas,
      toneladas,
      areaM2: 0,
      km: raw.kmTotal,
      horas: 0,
      coletores: 0,
      faturamento,
      receitaKm: raw.kmTotal > 0 ? faturamento / raw.kmTotal : 0,
      receitaHora: 0,
    };
  });

  const diasComDados = dias.filter((d) => (
    modoRocada ? (d.rotas > 0 || (d.areaM2 || 0) > 0) : d.viagens > 0
  )).length;
  const totaisCiclo = criarVazio('Total do Ciclo');
  for (const d of dias) {
    const ativo = modoRocada ? (d.rotas > 0 || (d.areaM2 || 0) > 0) : d.viagens > 0;
    if (!ativo) continue;
    totaisCiclo.viagens += d.viagens;
    totaisCiclo.rotas += d.rotas;
    totaisCiclo.toneladas += d.toneladas;
    totaisCiclo.areaM2 = (totaisCiclo.areaM2 || 0) + (d.areaM2 || 0);
    totaisCiclo.km += d.km;
    totaisCiclo.faturamento += d.faturamento;
  }
  totaisCiclo.receitaKm = totaisCiclo.km > 0 ? totaisCiclo.faturamento / totaisCiclo.km : 0;

  const totalRegistros = diasApi.reduce((s, d) => s + d.rotas, 0);

  return {
    dias,
    totais: totaisCiclo,
    totalRegistros,
    diasComDados,
    diasSemDados: dias.length - diasComDados,
  };
}

/**
 * Formata valor monetário em R$
 */
export function fmtMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Formata número com decimais
 */
export function fmtNum(valor: number, dec = 2): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}


