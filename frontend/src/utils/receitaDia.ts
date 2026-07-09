/**
 * Análise de receita diária — derivada das colunas da planilha padrão de coleta.
 * Usa PESO TOTAL, TIPO DE CAMINHÃO, KM TOTAL, CONTADOR DE VIAGENS, TURNO, REGIONAL, PLACA.
 */
import {
  detectarColunasCardViagem,
  extrairMetricasCardViagem,
  obterValorRegistro,
} from './viagemCardDados';

const normalizar = (s: string) =>
  s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');

export interface ValoresFaturamentoDia {
  valorTonelada: number;
  valorMini?: number;
  valorTruck?: number;
  valorToco?: number;
  valorBasculante?: number;
  temValorConfigurado: boolean;
}

export interface LinhaReceitaGrupo {
  chave: string;
  viagens: number;
  toneladas: number;
  km: number;
  horas: number;
  faturamento: number;
  receitaKm: number;
  receitaTon: number;
  receitaViagem: number;
}

export interface ReceitaDiaResumo {
  faturamento: number;
  receitaKm: number;
  receitaHora: number;
  receitaTon: number;
  receitaViagem: number;
  tonKm: number;
  prodColetor: number;
  viagens: number;
  toneladas: number;
  km: number;
  horas: number;
  coletores: number;
  motoristas: number;
  coletoresEquipe: number;
}

export interface ReceitaDiaAnalise {
  resumo: ReceitaDiaResumo;
  porTipoCaminhao: LinhaReceitaGrupo[];
  porTurno: LinhaReceitaGrupo[];
  porRegional: LinhaReceitaGrupo[];
  porPlaca: LinhaReceitaGrupo[];
  tarifas: ValoresFaturamentoDia;
  registrosConsiderados: number;
}

const FALLBACK_TON = 80;

function setIfPositive(target: Record<string, number>, key: string, value: unknown) {
  if (value !== null && value !== undefined && value !== '' && !Number.isNaN(Number(value))) {
    const n = Number(value);
    if (n > 0) target[key] = n;
  }
}

/** Se só VALOR_TONELADA existe, replica para tipos sem valor próprio (igual ao backend). */
function aplicarFallbackPorTipo(valores: Record<string, number>): void {
  const tonelada = valores.geral;
  if (tonelada !== undefined && tonelada > 0) {
    if (!valores.mini) valores.mini = tonelada;
    if (!valores.truck) valores.truck = tonelada;
    if (!valores.toco) valores.toco = tonelada;
    if (!valores.basculante) valores.basculante = tonelada;
  }
}

function detectarColTipo(chaves: string[]): string | undefined {
  return chaves.find((k) => {
    const n = normalizar(k);
    return n.includes('TIPOCAMINHAO') || (n.includes('TIPO') && n.includes('CAMINHAO'));
  });
}

function detectarColNroColetores(chaves: string[]): string | undefined {
  return chaves.find((k) => {
    const n = normalizar(k);
    return n.includes('NROCOLETORES') || n.includes('NDECOLETORES') || n === 'NCOLETORES';
  });
}

function valorUnitarioPorTipo(tipoRaw: string, tarifas: ValoresFaturamentoDia): number {
  const t = normalizar(tipoRaw);
  if (t.includes('MINI') && tarifas.valorMini) return tarifas.valorMini;
  if (t.includes('TRUCK') && tarifas.valorTruck) return tarifas.valorTruck;
  if ((t.includes('BASCULANTE') || t.includes('BASCULANTO')) && tarifas.valorBasculante) {
    return tarifas.valorBasculante;
  }
  if (t.includes('TOCO') && tarifas.valorToco) return tarifas.valorToco;
  return tarifas.valorTonelada;
}

function faturamentoLinha(
  toneladas: number,
  tipoRaw: string,
  tarifas: ValoresFaturamentoDia,
): number {
  if (toneladas <= 0) return 0;
  return toneladas * valorUnitarioPorTipo(tipoRaw, tarifas);
}

function criarGrupo(chave: string): LinhaReceitaGrupo {
  return {
    chave,
    viagens: 0,
    toneladas: 0,
    km: 0,
    horas: 0,
    faturamento: 0,
    receitaKm: 0,
    receitaTon: 0,
    receitaViagem: 0,
  };
}

function finalizarGrupo(g: LinhaReceitaGrupo): LinhaReceitaGrupo {
  return {
    ...g,
    receitaKm: g.km > 0 ? g.faturamento / g.km : 0,
    receitaTon: g.toneladas > 0 ? g.faturamento / g.toneladas : 0,
    receitaViagem: g.viagens > 0 ? g.faturamento / g.viagens : 0,
  };
}

function ordenarPorFaturamento(lista: LinhaReceitaGrupo[]): LinhaReceitaGrupo[] {
  return [...lista].sort((a, b) => b.faturamento - a.faturamento);
}

export function extrairValoresFaturamento(
  configFaturamento?: {
    ativo?: boolean;
    valorTonelada?: number | null;
    valorMini?: number | null;
    valorTruck?: number | null;
    valorToco?: number | null;
    valorBasculante?: number | null;
  } | null,
  contrato?: {
    valorTonelada?: number | null;
    valorMini?: number | null;
    valorTruck?: number | null;
    valorToco?: number | null;
    valorBasculante?: number | null;
  } | null,
): ValoresFaturamentoDia {
  const raw: Record<string, number> = {};
  const cfgAtivo = configFaturamento?.ativo === true;

  if (cfgAtivo && configFaturamento) {
    setIfPositive(raw, 'geral', configFaturamento.valorTonelada);
    setIfPositive(raw, 'mini', configFaturamento.valorMini);
    setIfPositive(raw, 'truck', configFaturamento.valorTruck);
    setIfPositive(raw, 'toco', configFaturamento.valorToco);
    setIfPositive(raw, 'basculante', configFaturamento.valorBasculante);
  } else if (contrato) {
    setIfPositive(raw, 'geral', contrato.valorTonelada);
    setIfPositive(raw, 'mini', contrato.valorMini);
    setIfPositive(raw, 'truck', contrato.valorTruck);
    setIfPositive(raw, 'toco', contrato.valorToco);
    setIfPositive(raw, 'basculante', contrato.valorBasculante);
  }

  aplicarFallbackPorTipo(raw);

  const temValorConfigurado = Object.keys(raw).length > 0;
  const referencia = raw.geral ?? raw.mini ?? raw.truck ?? raw.toco ?? raw.basculante;
  const valorTonelada = raw.geral ?? referencia ?? FALLBACK_TON;

  return {
    valorTonelada,
    valorMini: raw.mini ?? valorTonelada,
    valorTruck: raw.truck ?? valorTonelada,
    valorToco: raw.toco ?? valorTonelada,
    valorBasculante: raw.basculante ?? valorTonelada,
    temValorConfigurado,
  };
}

export function analisarReceitaDia(
  registros: Record<string, unknown>[],
  tarifas: ValoresFaturamentoDia,
): ReceitaDiaAnalise {
  const validos = registros.filter((r) => r._validoDashboard !== false);
  const fonte = validos.length > 0 ? validos : registros;

  if (!fonte.length) {
    const resumoVazio: ReceitaDiaResumo = {
      faturamento: 0,
      receitaKm: 0,
      receitaHora: 0,
      receitaTon: 0,
      receitaViagem: 0,
      tonKm: 0,
      prodColetor: 0,
      viagens: 0,
      toneladas: 0,
      km: 0,
      horas: 0,
      coletores: 0,
      motoristas: 0,
      coletoresEquipe: 0,
    };
    return {
      resumo: resumoVazio,
      porTipoCaminhao: [],
      porTurno: [],
      porRegional: [],
      porPlaca: [],
      tarifas,
      registrosConsiderados: 0,
    };
  }

  const cols = detectarColunasCardViagem(fonte);
  const chaves = Object.keys(fonte[0] || {});
  const colTipo = detectarColTipo(chaves);
  const colNroColetores = detectarColNroColetores(chaves);

  const mapTipo = new Map<string, LinhaReceitaGrupo>();
  const mapTurno = new Map<string, LinhaReceitaGrupo>();
  const mapRegional = new Map<string, LinhaReceitaGrupo>();
  const mapPlaca = new Map<string, LinhaReceitaGrupo>();

  const placas = new Set<string>();
  const motoristas = new Set<string>();
  let coletoresEquipe = 0;
  let viagens = 0;
  let toneladas = 0;
  let km = 0;
  let horas = 0;
  let faturamentoCalc = 0;

  const addGrupo = (map: Map<string, LinhaReceitaGrupo>, chave: string, m: ReturnType<typeof extrairMetricasCardViagem>, fat: number) => {
    const k = chave || '—';
    if (!map.has(k)) map.set(k, criarGrupo(k));
    const g = map.get(k)!;
    g.viagens += Math.max(m.viagens, 1);
    g.toneladas += m.toneladas;
    g.km += m.kmFinal;
    g.horas += m.horasTrabalhadas;
    g.faturamento += fat;
  };

  for (const reg of fonte) {
    const m = extrairMetricasCardViagem(reg, cols);
    const tipoRaw = colTipo ? String(obterValorRegistro(reg, colTipo) || '') : '';
    const fat = faturamentoLinha(m.toneladas, tipoRaw, tarifas);

    viagens += Math.max(m.viagens, 1);
    toneladas += m.toneladas;
    km += m.kmFinal;
    horas += m.horasTrabalhadas;
    faturamentoCalc += fat;

    if (m.placa && m.placa !== '—') placas.add(m.placa);
    if (m.motorista && m.motorista !== '—') motoristas.add(m.motorista);

    if (colNroColetores) {
      const n = Number(obterValorRegistro(reg, colNroColetores)) || 0;
      if (n > 0) coletoresEquipe += n;
    }

    const tipoLabel = tipoRaw.trim() || 'Não informado';
    addGrupo(mapTipo, tipoLabel, m, fat);
    addGrupo(mapTurno, m.turno, m, fat);
    addGrupo(mapRegional, m.regional, m, fat);
    addGrupo(mapPlaca, m.placa, m, fat);
  }

  const faturamento = Math.round(faturamentoCalc * 100) / 100;

  const resumo: ReceitaDiaResumo = {
    faturamento,
    receitaKm: km > 0 ? faturamento / km : 0,
    receitaHora: horas > 0 ? faturamento / horas : 0,
    receitaTon: toneladas > 0 ? faturamento / toneladas : 0,
    receitaViagem: viagens > 0 ? faturamento / viagens : 0,
    tonKm: km > 0 ? toneladas / km : 0,
    prodColetor: placas.size > 0 ? toneladas / placas.size : 0,
    viagens,
    toneladas: Math.round(toneladas * 1000) / 1000,
    km: Math.round(km * 100) / 100,
    horas: Math.round(horas * 100) / 100,
    coletores: placas.size,
    motoristas: motoristas.size,
    coletoresEquipe,
  };

  const porTipoCaminhao = ordenarPorFaturamento([...mapTipo.values()].map(finalizarGrupo));

  return {
    resumo,
    porTipoCaminhao,
    porTurno: ordenarPorFaturamento([...mapTurno.values()].map(finalizarGrupo)),
    porRegional: ordenarPorFaturamento([...mapRegional.values()].map(finalizarGrupo)),
    porPlaca: ordenarPorFaturamento([...mapPlaca.values()].map(finalizarGrupo)),
    tarifas,
    registrosConsiderados: fonte.length,
  };
}
