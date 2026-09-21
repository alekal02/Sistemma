/**
 * Utilitário para Relatório Diário — agrupa dados brutos por data
 * e calcula métricas operacionais + financeiras por dia.
 */

import { detectarColunasCardViagem, extrairMetricasCardViagem } from './viagemCardDados';
import { contarViagensPorRotaRegistro } from './viagensPorRota';
import { normalizarDataParaIso } from './normalizarDataIso';
import { toneladasDoPesoKg } from '@sistemma/shared';

export { toneladasDoPesoKg } from '@sistemma/shared';

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
  /** Capina / extensão linear em metros */
  metroLinear?: number;
  /** Capina/varrição em km */
  kmLinear?: number;
  /** Poda — quantidade de árvores */
  qtdArvore?: number;
  /** Quantitativo bruto da planilha unificada */
  quantitativo?: number;
  /** Métrica principal do tipo (para barra/KPI do ciclo) */
  metricaUnidade?: number;
  metricaSufixo?: string;
  metricaLabel?: string;
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
    entry.viagens += viagensLinha;
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
    metroLinear: 0,
    kmLinear: 0,
    qtdArvore: 0,
    quantitativo: 0,
    metricaUnidade: 0,
    metricaSufixo: '',
    metricaLabel: '',
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
    metroLinear: 0,
    kmLinear: 0,
    qtdArvore: 0,
    quantitativo: 0,
    metricaUnidade: 0,
    metricaSufixo: '',
    metricaLabel: '',
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

function consolidarDiasApi(
  diasApi: Array<{
    data: string;
    rotas: number;
    viagens: number;
    pesoTotalKg: number;
    kmTotal: number;
    areaM2?: number;
    metroLinear?: number;
    kmLinear?: number;
    qtdArvore?: number;
    quantitativo?: number;
  }>,
) {
  const mapa = new Map<string, {
    data: string;
    rotas: number;
    viagens: number;
    pesoTotalKg: number;
    kmTotal: number;
    areaM2: number;
    metroLinear: number;
    kmLinear: number;
    qtdArvore: number;
    quantitativo: number;
  }>();
  for (const d of diasApi) {
    const data = String(d.data || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) continue;
    const prev = mapa.get(data);
    if (!prev) {
      mapa.set(data, {
        data,
        rotas: Number(d.rotas || 0),
        viagens: Number(d.viagens || 0),
        pesoTotalKg: Number(d.pesoTotalKg || 0),
        kmTotal: Number(d.kmTotal || 0),
        areaM2: Number(d.areaM2 || 0),
        metroLinear: Number(d.metroLinear || 0),
        kmLinear: Number(d.kmLinear || 0),
        qtdArvore: Number(d.qtdArvore || 0),
        quantitativo: Number(d.quantitativo || 0),
      });
      continue;
    }
    prev.rotas += Number(d.rotas || 0);
    prev.viagens += Number(d.viagens || 0);
    prev.pesoTotalKg += Number(d.pesoTotalKg || 0);
    prev.kmTotal += Number(d.kmTotal || 0);
    prev.areaM2 += Number(d.areaM2 || 0);
    prev.metroLinear += Number(d.metroLinear || 0);
    prev.kmLinear += Number(d.kmLinear || 0);
    prev.qtdArvore += Number(d.qtdArvore || 0);
    prev.quantitativo += Number(d.quantitativo || 0);
  }
  return mapa;
}

/** Monta relatório do ciclo a partir da agregação SQL do backend (sem limite de registros). */
export function agruparCicloPorDiaFromApi(
  diasApi: Array<{
    data: string;
    rotas: number;
    viagens: number;
    pesoTotalKg: number;
    pesoTotalTon?: number;
    kmTotal: number;
    areaM2?: number;
    metroLinear?: number;
    kmLinear?: number;
    qtdArvore?: number;
    quantitativo?: number;
  }>,
  dataInicio: string,
  dataFim: string,
  valorTonelada = 80,
  valorMini?: number,
  valorTruck?: number,
  valorToco?: number,
  valorBasculante?: number,
  opts?: {
    modo?: 'coleta' | 'rocada' | 'km_linear' | 'metro_linear' | 'arvores';
    valorM2?: number | null;
    tipoServico?: string | null;
  },
): RelatorioDiarioResult & { diasComDados: number; diasSemDados: number } {
  const tarifa = valorTonelada;
  const modo = opts?.modo || 'coleta';
  const modoRocada = modo === 'rocada';
  const modoUnidade = modo === 'rocada' || modo === 'km_linear' || modo === 'metro_linear' || modo === 'arvores';
  const valorM2 = Number(opts?.valorM2) > 0 ? Number(opts?.valorM2) : 0;
  void valorMini;
  void valorTruck;
  void valorToco;
  void valorBasculante;

  const mapa = consolidarDiasApi(Array.isArray(diasApi) ? diasApi : []);
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

  const resolverMetrica = (raw: {
    areaM2?: number;
    metroLinear?: number;
    kmLinear?: number;
    qtdArvore?: number;
    quantitativo?: number;
    rotas: number;
  }) => {
    const areaM2 = Number(raw.areaM2 || 0);
    const metroLinear = Number(raw.metroLinear || 0);
    const kmLinear = Number(raw.kmLinear || 0);
    const qtdArvore = Number(raw.qtdArvore || 0);
    const quantitativo = Number(raw.quantitativo || 0);

    if (modo === 'rocada') {
      return { areaM2, metroLinear, kmLinear, qtdArvore, quantitativo, metricaUnidade: areaM2, metricaSufixo: 'm²', metricaLabel: 'Área' };
    }
    if (modo === 'arvores') {
      const v = qtdArvore || quantitativo;
      return { areaM2, metroLinear, kmLinear, qtdArvore: v, quantitativo, metricaUnidade: v, metricaSufixo: 'arv', metricaLabel: 'Árvores' };
    }
    if (modo === 'km_linear') {
      if (kmLinear > 0) {
        return { areaM2, metroLinear, kmLinear, qtdArvore, quantitativo, metricaUnidade: kmLinear, metricaSufixo: 'km', metricaLabel: 'Extensão' };
      }
      if (metroLinear > 0) {
        return { areaM2, metroLinear, kmLinear, qtdArvore, quantitativo, metricaUnidade: metroLinear, metricaSufixo: 'm', metricaLabel: 'Metro linear' };
      }
      return { areaM2, metroLinear, kmLinear, qtdArvore, quantitativo, metricaUnidade: quantitativo, metricaSufixo: 'km', metricaLabel: 'Extensão' };
    }
    if (modo === 'metro_linear') {
      const v = metroLinear || (kmLinear > 0 ? kmLinear * 1000 : quantitativo);
      return { areaM2, metroLinear: v, kmLinear, qtdArvore, quantitativo, metricaUnidade: v, metricaSufixo: 'm', metricaLabel: 'Metro linear' };
    }
    return { areaM2, metroLinear, kmLinear, qtdArvore, quantitativo, metricaUnidade: 0, metricaSufixo: '', metricaLabel: '' };
  };

  const dias = todasDatas.map((data) => {
    const raw = mapa.get(data);
    if (!raw) return criarDiaVazio(data);

    if (modoUnidade) {
      const m = resolverMetrica(raw);
      const temDados = raw.rotas > 0 || m.metricaUnidade > 0;
      if (!temDados) return criarDiaVazio(data);
      const faturamento = modoRocada ? m.areaM2 * valorM2 : 0;
      return {
        data,
        label: `${data.slice(8, 10)}/${data.slice(5, 7)}`,
        viagens: raw.rotas,
        rotas: raw.rotas,
        toneladas: 0,
        areaM2: m.areaM2,
        metroLinear: m.metroLinear,
        kmLinear: m.kmLinear,
        qtdArvore: m.qtdArvore,
        quantitativo: m.quantitativo,
        metricaUnidade: m.metricaUnidade,
        metricaSufixo: m.metricaSufixo,
        metricaLabel: m.metricaLabel,
        km: m.kmLinear || raw.kmTotal || 0,
        horas: 0,
        coletores: 0,
        faturamento,
        receitaKm: 0,
        receitaHora: 0,
      };
    }

    if (!(raw.viagens > 0) && !(raw.pesoTotalKg > 0) && !(raw.rotas > 0)) {
      return criarDiaVazio(data);
    }

    // Total do dia: kg da API ÷ 1000. Se ainda parecer kg (ex. 25.673 t), divide de novo.
    const toneladas = toneladasDoPesoKg(raw.pesoTotalKg);
    const faturamento = toneladas * tarifa;
    return {
      data,
      label: `${data.slice(8, 10)}/${data.slice(5, 7)}`,
      viagens: raw.viagens,
      rotas: raw.rotas,
      toneladas,
      areaM2: 0,
      metroLinear: 0,
      kmLinear: 0,
      qtdArvore: 0,
      quantitativo: 0,
      metricaUnidade: raw.viagens,
      metricaSufixo: '',
      metricaLabel: 'Viagens',
      km: raw.kmTotal,
      horas: 0,
      coletores: 0,
      faturamento,
      receitaKm: raw.kmTotal > 0 ? faturamento / raw.kmTotal : 0,
      receitaHora: 0,
    };
  });

  const diaAtivo = (d: DadoDiario) => (
    modoUnidade
      ? (d.rotas > 0 || (d.metricaUnidade || 0) > 0 || (d.areaM2 || 0) > 0)
      : d.viagens > 0 || d.toneladas > 0 || d.rotas > 0
  );

  const diasComDados = dias.filter(diaAtivo).length;
  const totaisCiclo = criarVazio('Total do Ciclo');
  for (const d of dias) {
    if (!diaAtivo(d)) continue;
    totaisCiclo.viagens += d.viagens;
    totaisCiclo.rotas += d.rotas;
    totaisCiclo.toneladas += d.toneladas;
    totaisCiclo.areaM2 = (totaisCiclo.areaM2 || 0) + (d.areaM2 || 0);
    totaisCiclo.metroLinear = (totaisCiclo.metroLinear || 0) + (d.metroLinear || 0);
    totaisCiclo.kmLinear = (totaisCiclo.kmLinear || 0) + (d.kmLinear || 0);
    totaisCiclo.qtdArvore = (totaisCiclo.qtdArvore || 0) + (d.qtdArvore || 0);
    totaisCiclo.quantitativo = (totaisCiclo.quantitativo || 0) + (d.quantitativo || 0);
    totaisCiclo.metricaUnidade = (totaisCiclo.metricaUnidade || 0) + (d.metricaUnidade || 0);
    totaisCiclo.km += d.km;
    totaisCiclo.faturamento += d.faturamento;
  }
  // Sufixo/label do total = do primeiro dia com dados
  const amostra = dias.find(diaAtivo);
  if (amostra) {
    totaisCiclo.metricaSufixo = amostra.metricaSufixo;
    totaisCiclo.metricaLabel = amostra.metricaLabel;
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


