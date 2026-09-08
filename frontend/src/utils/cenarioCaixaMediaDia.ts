/**
 * Cenário do dia: caixa média (L) × densidade (kg/L) = peso ideal (kg).
 * Compara a coleta do dia (peso médio/viagem) com esse parâmetro do contrato.
 */
import { obterTipoCaminhaoRegistro } from './capacidadeViagemDia';
import {
  LABEL_TIPO_CAMINHAO,
  TIPOS_LIMITE_CAMINHAO,
  calcularPesoIdealKg,
  densidadeOptsToInput,
  normalizarTipoCaminhaoPeso,
  resolverDensidadeParaViagem,
  resolverDensidadesKgL,
  resolverLimitesVolumeL,
  type DensidadeResiduoInput,
  type MapaLimiteCaminhao,
  type TipoLimiteCaminhao,
} from './limitesCaminhaoContrato';
import { normalizarPlaca } from './normalizarPlaca';
import type { OperacaoDiaAnalise } from './operacaoDia';
import { fmtNum } from './relatorioDiario';
import { obterValorRegistro } from './viagemCardDados';

export interface FrotaTipoDia {
  tipo: TipoLimiteCaminhao;
  label: string;
  placas: number;
  volumeL: number;
  pesoIdealKg: number;
}

export interface CenarioTipoIdealDia {
  tipo: TipoLimiteCaminhao;
  label: string;
  volumeL: number;
  pesoIdealKg: number;
  pesoMedioKg: number;
  viagens: number;
  ocupacaoVsIdealPct: number | null;
  resultadoTon: number;
  cenario: 'PERDA' | 'SUPERÁVIT' | 'NEUTRO';
}

export interface CenarioCaixaMediaDia {
  caixaMediaL: number;
  densidadeKgL: number;
  pesoIdealKg: number;
  pesoMedioDiaKg: number;
  viagens: number;
  /** (peso médio / peso ideal) × 100 */
  ocupacaoVsIdealPct: number | null;
  /** Toneladas: positivo = acima do ideal; negativo = abaixo */
  resultadoTon: number;
  cenario: 'PERDA' | 'SUPERÁVIT' | 'NEUTRO';
  frota: FrotaTipoDia[];
  /** Cruzamento por tipo: peso médio do dia vs peso ideal (vol × dens) do tipo */
  porTipo: CenarioTipoIdealDia[];
  volumesAplicados: Record<TipoLimiteCaminhao, number>;
  pesosIdeaisKg: Record<TipoLimiteCaminhao, number>;
}

function calcularCaixaMediaPorFrota(
  frota: Record<TipoLimiteCaminhao, number>,
  volumes: Record<TipoLimiteCaminhao, number>,
): number {
  let soma = 0;
  let total = 0;
  for (const t of TIPOS_LIMITE_CAMINHAO) {
    const n = frota[t] || 0;
    if (n <= 0) continue;
    soma += n * volumes[t];
    total += n;
  }
  if (total <= 0) return 0;
  return soma / total;
}

/** Placas únicas por tipo tipado na planilha do dia. */
export function mapearPlacasPorTipoDia(
  registros: Record<string, unknown>[],
): Record<TipoLimiteCaminhao, string[]> {
  const placasPorTipo: Record<TipoLimiteCaminhao, Set<string>> = {
    MINI: new Set(),
    TOCO: new Set(),
    BASCULANTE: new Set(),
    TRUCK: new Set(),
  };

  const validos = registros.filter((r) => r._validoDashboard !== false);
  const fonte = validos.length > 0 ? validos : registros;

  for (const reg of fonte) {
    const tipo = normalizarTipoCaminhaoPeso(obterTipoCaminhaoRegistro(reg));
    if (!tipo) continue;
    const placa = normalizarPlaca(
      String(obterValorRegistro(reg, undefined, 'placa') ?? ''),
    );
    if (!placa) continue;
    placasPorTipo[tipo].add(placa);
  }

  return {
    MINI: [...placasPorTipo.MINI],
    TOCO: [...placasPorTipo.TOCO],
    BASCULANTE: [...placasPorTipo.BASCULANTE],
    TRUCK: [...placasPorTipo.TRUCK],
  };
}

/** Conta placas únicas por tipo tipado na planilha do dia. */
export function contarFrotaPorTipoDia(
  registros: Record<string, unknown>[],
): Record<TipoLimiteCaminhao, number> {
  const placas = mapearPlacasPorTipoDia(registros);
  return {
    MINI: placas.MINI.length,
    TOCO: placas.TOCO.length,
    BASCULANTE: placas.BASCULANTE.length,
    TRUCK: placas.TRUCK.length,
  };
}

/**
 * Densidade média do tipo considerando a densidade própria de cada placa.
 * Sem placas conhecidas (ou sem densidade especial), cai na densidade do tipo.
 */
function densidadesEfetivasPorTipo(
  placasPorTipo: Record<TipoLimiteCaminhao, string[]> | null,
  densPorTipo: Record<TipoLimiteCaminhao, number>,
  densInput: DensidadeResiduoInput,
  porPlaca?: Record<string, number> | null,
): Record<TipoLimiteCaminhao, number> {
  if (!placasPorTipo || !porPlaca || Object.keys(porPlaca).length === 0) {
    return densPorTipo;
  }
  const out = { ...densPorTipo };
  for (const tipo of TIPOS_LIMITE_CAMINHAO) {
    const placas = placasPorTipo[tipo];
    if (!placas?.length) continue;
    const soma = placas.reduce(
      (s, placa) => s + resolverDensidadeParaViagem({ placa, tipo, densidade: densInput, porPlaca }),
      0,
    );
    out[tipo] = soma / placas.length;
  }
  return out;
}

/**
 * Fallback quando não há linhas: usa viagens por tipo da agregação do dia.
 */
function frotaDeOperacaoPorTipo(
  operacao: OperacaoDiaAnalise,
): Record<TipoLimiteCaminhao, number> | null {
  const contagem: Record<TipoLimiteCaminhao, number> = {
    MINI: 0, TOCO: 0, BASCULANTE: 0, TRUCK: 0,
  };
  let algum = false;
  for (const g of operacao.porTipoCaminhao) {
    const tipo = normalizarTipoCaminhaoPeso(g.chave);
    if (!tipo || g.viagens <= 0) continue;
    // Usa viagens como peso relativo da frota tipada no dia
    contagem[tipo] += g.viagens;
    algum = true;
  }
  return algum ? contagem : null;
}

export function analisarCenarioCaixaMediaDia(
  operacao: OperacaoDiaAnalise,
  opts?: {
    registros?: Record<string, unknown>[];
    volumeL?: MapaLimiteCaminhao | null;
    densidadeResiduoKgL?: number | null;
    densidadeKgL?: MapaLimiteCaminhao | null;
    densidadeKgLPorPlaca?: Record<string, number> | null;
  },
): CenarioCaixaMediaDia | null {
  const viagens = operacao.resumo.viagens;
  if (!(viagens > 0)) return null;

  const densInput = densidadeOptsToInput(opts);
  const volumes = resolverLimitesVolumeL(opts?.volumeL);

  const placasPorTipo = opts?.registros?.length
    ? mapearPlacasPorTipoDia(opts.registros)
    : null;

  let frotaContagem: Record<TipoLimiteCaminhao, number> | null = placasPorTipo
    ? {
      MINI: placasPorTipo.MINI.length,
      TOCO: placasPorTipo.TOCO.length,
      BASCULANTE: placasPorTipo.BASCULANTE.length,
      TRUCK: placasPorTipo.TRUCK.length,
    }
    : null;
  if (!frotaContagem || TIPOS_LIMITE_CAMINHAO.every((t) => (frotaContagem![t] || 0) <= 0)) {
    frotaContagem = frotaDeOperacaoPorTipo(operacao);
  }
  if (!frotaContagem || TIPOS_LIMITE_CAMINHAO.every((t) => (frotaContagem![t] || 0) <= 0)) {
    return null;
  }

  const caixaMediaL = Math.round(calcularCaixaMediaPorFrota(frotaContagem, volumes) * 100) / 100;
  if (!(caixaMediaL > 0)) return null;

  // Densidade por tipo já ponderada pelas placas com densidade própria do contrato.
  const densPorTipo = densidadesEfetivasPorTipo(
    placasPorTipo,
    resolverDensidadesKgL(densInput),
    densInput,
    opts?.densidadeKgLPorPlaca,
  );
  const pesosIdeaisKg = {
    MINI: calcularPesoIdealKg(volumes.MINI, densPorTipo.MINI),
    TOCO: calcularPesoIdealKg(volumes.TOCO, densPorTipo.TOCO),
    BASCULANTE: calcularPesoIdealKg(volumes.BASCULANTE, densPorTipo.BASCULANTE),
    TRUCK: calcularPesoIdealKg(volumes.TRUCK, densPorTipo.TRUCK),
  };

  // Peso ideal da frota = média ponderada de (vol × dens) por tipo
  let somaIdealPonderado = 0;
  let somaDensPonderada = 0;
  let totalFrota = 0;
  for (const t of TIPOS_LIMITE_CAMINHAO) {
    const n = frotaContagem[t] || 0;
    if (n <= 0) continue;
    somaIdealPonderado += n * pesosIdeaisKg[t];
    somaDensPonderada += n * densPorTipo[t];
    totalFrota += n;
  }
  const pesoIdealKg = totalFrota > 0
    ? Math.round((somaIdealPonderado / totalFrota) * 100) / 100
    : 0;
  const densidadeKgL = totalFrota > 0
    ? Math.round((somaDensPonderada / totalFrota) * 1000) / 1000
    : densPorTipo.TOCO;

  const pesoMedioDiaKg = Math.round(operacao.resumo.tonMediaColeta * 1000 * 100) / 100;
  const ocupacaoVsIdealPct = pesoIdealKg > 0
    ? Math.round((pesoMedioDiaKg / pesoIdealKg) * 1000) / 10
    : null;
  const resultadoTon = Math.round(
    (((pesoMedioDiaKg - pesoIdealKg) * viagens) / 1000) * 100,
  ) / 100;

  let cenario: CenarioCaixaMediaDia['cenario'] = 'NEUTRO';
  if (resultadoTon < -0.01) cenario = 'PERDA';
  else if (resultadoTon > 0.01) cenario = 'SUPERÁVIT';

  const frota: FrotaTipoDia[] = TIPOS_LIMITE_CAMINHAO
    .filter((t) => (frotaContagem![t] || 0) > 0)
    .map((tipo) => ({
      tipo,
      label: LABEL_TIPO_CAMINHAO[tipo],
      placas: frotaContagem![tipo],
      volumeL: volumes[tipo],
      pesoIdealKg: pesosIdeaisKg[tipo],
    }));

  const porTipo: CenarioTipoIdealDia[] = TIPOS_LIMITE_CAMINHAO
    .map((tipo) => {
      const g = operacao.porTipoCaminhao.find(
        (x) => normalizarTipoCaminhaoPeso(x.chave) === tipo,
      );
      if (!g || g.viagens <= 0) return null;
      const ideal = pesosIdeaisKg[tipo];
      if (!(ideal > 0)) return null;
      const pesoMedioKg = Math.round(g.tonMediaViagem * 1000 * 100) / 100;
      const ocup = Math.round((pesoMedioKg / ideal) * 1000) / 10;
      const resTon = Math.round((((pesoMedioKg - ideal) * g.viagens) / 1000) * 100) / 100;
      let cen: CenarioTipoIdealDia['cenario'] = 'NEUTRO';
      if (resTon < -0.01) cen = 'PERDA';
      else if (resTon > 0.01) cen = 'SUPERÁVIT';
      return {
        tipo,
        label: LABEL_TIPO_CAMINHAO[tipo],
        volumeL: volumes[tipo],
        pesoIdealKg: ideal,
        pesoMedioKg,
        viagens: g.viagens,
        ocupacaoVsIdealPct: ocup,
        resultadoTon: resTon,
        cenario: cen,
      };
    })
    .filter(Boolean) as CenarioTipoIdealDia[];

  return {
    caixaMediaL,
    densidadeKgL,
    pesoIdealKg,
    pesoMedioDiaKg,
    viagens,
    ocupacaoVsIdealPct,
    resultadoTon,
    cenario,
    frota,
    porTipo,
    volumesAplicados: volumes,
    pesosIdeaisKg,
  };
}

export function textoInsightCenario(c: CenarioCaixaMediaDia): {
  severidade: 'critico' | 'atencao' | 'info';
  titulo: string;
  texto: string;
} {
  const pct = c.ocupacaoVsIdealPct;
  const base =
    `Peso médio ${fmtNum(c.pesoMedioDiaKg, 0)} kg vs ideal ${fmtNum(c.pesoIdealKg, 0)} kg`
    + ` (caixa ${fmtNum(c.caixaMediaL, 0)} L × dens. ${fmtNum(c.densidadeKgL, 2)} kg/L)`;

  if (c.cenario === 'PERDA') {
    return {
      severidade: pct != null && pct < 75 ? 'critico' : 'atencao',
      titulo: 'Coleta abaixo do peso ideal da caixa média',
      texto: `${base} — resultado ${fmtNum(c.resultadoTon, 2)} t em ${fmtNum(c.viagens, 0)} viagem(ns).`,
    };
  }
  if (c.cenario === 'SUPERÁVIT') {
    return {
      severidade: 'info',
      titulo: 'Coleta acima do peso ideal da caixa média',
      texto: `${base} — resultado +${fmtNum(c.resultadoTon, 2)} t em ${fmtNum(c.viagens, 0)} viagem(ns).`,
    };
  }
  return {
    severidade: 'info',
    titulo: 'Coleta alinhada ao peso ideal',
    texto: `${base} — neutro no dia.`,
  };
}
