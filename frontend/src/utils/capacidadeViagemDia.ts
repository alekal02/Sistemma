/**
 * Analisa peso das viagens vs peso ideal do tipo (volume × densidade) e teto (peso máx.).
 * Usa só PESO 1–4 seguros — nunca PESO TOTAL da rota como se fosse 1 viagem.
 */
import {
  LABEL_FAIXA_IDEAL,
  LABEL_TIPO_CAMINHAO,
  classificarPesoVsIdeal,
  densidadeOptsToInput,
  faixaIdealKg,
  limitePesoParaTipo,
  normalizarTipoCaminhaoPeso,
  resolverLimitesPesoKg,
  resolverPesosIdeaisKg,
  type FaixaIdealViagem,
  type MapaLimiteCaminhao,
  type NotaIdealViagem,
  type TipoLimiteCaminhao,
} from './limitesCaminhaoContrato';
import { obterValorRegistro } from './viagemCardDados';
import { extrairPesosViagemKgSeguros } from './viagensPorRota';
import { normalizarPlaca } from './normalizarPlaca';
import { fmtNum } from './relatorioDiario';

export type SeveridadeGargaloViagem = 'critico' | 'atencao' | 'info';

export interface ViagemCapacidadeItem {
  placa: string;
  rota: string;
  tipo: TipoLimiteCaminhao | null;
  tipoLabel: string;
  pesoKg: number;
  /** Teto do contrato (peso máx.). */
  limiteKg: number | null;
  /** Peso ideal do tipo (volume × densidade). */
  pesoIdealKg: number | null;
  mediaTipoKg: number | null;
  /** % vs peso ideal (preferencial) ou vs máx. se sem ideal. */
  ocupacaoPct: number | null;
  pctMediaTipo: number | null;
  /** Faixa detalhada da escala (5 bandas). */
  faixaIdeal: FaixaIdealViagem | null;
  /** Nota agregada: péssimo / ruim / ótimo. */
  notaIdeal: NotaIdealViagem | null;
  /** Nota da escala; sobrecarga = também acima do peso máx. do contrato. */
  classificacao: 'pessimo' | 'ruim' | 'otimo' | 'sobrecarga' | 'sem_limite';
  /** true se peso > peso máx. do tipo no contrato. */
  acimaPesoMax: boolean;
}

export interface GargaloViagem {
  severidade: SeveridadeGargaloViagem;
  placa: string;
  rota: string;
  tipoLabel: string;
  titulo: string;
  texto: string;
}

export interface ResumoTipoCapacidade {
  tipo: TipoLimiteCaminhao;
  label: string;
  limiteKg: number;
  pesoIdealKg: number;
  viagens: number;
  pesoTotalKg: number;
  mediaPesoKg: number;
  sobrecarga: number;
  /** @deprecated use ruimBaixo + pessimoBaixo */
  subcarga: number;
  /** @deprecated use ruimAlto + pessimoAlto */
  acimaIdeal: number;
  otimo: number;
  ruim: number;
  pessimo: number;
  ruimBaixo: number;
  ruimAlto: number;
  pessimoBaixo: number;
  pessimoAlto: number;
  /** alias de otimo */
  ok: number;
  abaixoMediaTipo: number;
  ocupacaoMediaPct: number | null;
}

export interface ResumoCapacidadeDia {
  limitesAplicados: Record<TipoLimiteCaminhao, number>;
  pesosIdeaisAplicados: Record<TipoLimiteCaminhao, number>;
  viagensComPeso: number;
  viagensClassificadas: number;
  sobrecarga: number;
  /** @deprecated */
  subcarga: number;
  /** @deprecated */
  acimaIdeal: number;
  otimo: number;
  ruim: number;
  pessimo: number;
  /** alias de otimo */
  ok: number;
  semLimite: number;
  abaixoMediaTipo: number;
  ocupacaoMediaPct: number | null;
  porTipo: ResumoTipoCapacidade[];
  /** Cada viagem (PESO 1–4) tipada — para detalhe no relatório (não média). */
  viagens: ViagemCapacidadeItem[];
  gargalosViagem: GargaloViagem[];
  pioresSobrecarga: ViagemCapacidadeItem[];
  pioresSubcarga: ViagemCapacidadeItem[];
  pioresAbaixoMedia: ViagemCapacidadeItem[];
}

export type OptsCapacidadeDia = {
  limitesPesoKg?: MapaLimiteCaminhao | null;
  volumeL?: MapaLimiteCaminhao | null;
  densidadeResiduoKgL?: number | null;
  densidadeKgL?: MapaLimiteCaminhao | null;
  colunaRota?: string;
};

function normalizarChave(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
}

function encontrarValor(dado: Record<string, unknown>, nomeColuna: string): unknown {
  if (dado[nomeColuna] !== undefined && dado[nomeColuna] !== null && dado[nomeColuna] !== '') {
    return dado[nomeColuna];
  }
  const alvo = normalizarChave(nomeColuna);
  for (const [k, v] of Object.entries(dado)) {
    if (v !== null && v !== undefined && v !== '' && normalizarChave(k) === alvo) return v;
  }
  const nested = dado.dados;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return encontrarValor(nested as Record<string, unknown>, nomeColuna);
  }
  return undefined;
}

const CANDIDATOS_ROTA = [
  'DISTRITO', 'BAIRRO', 'SETOR', 'ROTA', 'REGIAO', 'REGIONAL',
  'DESTINO', 'LOCAL', 'LOCALIDADE',
] as const;

export function obterTipoCaminhaoRegistro(reg: Record<string, unknown>): string | null {
  const direto = reg.tipoCaminhao;
  if (direto != null && String(direto).trim()) return String(direto).trim();
  for (const cand of ['TIPO DE CAMINHÃO', 'TIPO DE CAMINHAO', 'TIPO CAMINHAO', 'TIPO_CAMINHAO', 'CAMINHAO']) {
    const v = encontrarValor(reg, cand);
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return null;
}

export function obterRotaRegistro(reg: Record<string, unknown>, colunaRota?: string): string {
  if (colunaRota) {
    const v = String(encontrarValor(reg, colunaRota) || '').trim();
    if (v) return v;
  }
  for (const cand of CANDIDATOS_ROTA) {
    const v = String(encontrarValor(reg, cand) || '').trim();
    if (v && !/^\d{5,}$/.test(v)) return v;
  }
  return '—';
}

/** @deprecated use extrairPesosViagemKgSeguros */
export function extrairPesosViagemKgRegistro(reg: Record<string, unknown>): number[] {
  return extrairPesosViagemKgSeguros(reg);
}

function classificarVsIdealEMax(opts: {
  pesoKg: number;
  pesoIdealKg: number | null;
  limiteKg: number | null;
}): {
  classificacao: ViagemCapacidadeItem['classificacao'];
  ocupacaoPct: number | null;
  faixaIdeal: FaixaIdealViagem | null;
  notaIdeal: NotaIdealViagem | null;
  acimaPesoMax: boolean;
} {
  const { pesoKg, pesoIdealKg, limiteKg } = opts;
  if (!(pesoKg > 0)) {
    return {
      classificacao: 'sem_limite',
      ocupacaoPct: null,
      faixaIdeal: null,
      notaIdeal: null,
      acimaPesoMax: false,
    };
  }

  const acimaPesoMax = limiteKg != null && limiteKg > 0 && pesoKg > limiteKg;
  const refKg = pesoIdealKg != null && pesoIdealKg > 0 ? pesoIdealKg : (limiteKg != null && limiteKg > 0 ? limiteKg : null);
  if (refKg == null) {
    return {
      classificacao: 'sem_limite',
      ocupacaoPct: null,
      faixaIdeal: null,
      notaIdeal: null,
      acimaPesoMax,
    };
  }

  const { pctIdeal, faixa, nota } = classificarPesoVsIdeal(pesoKg, refKg);
  // Acima do máx. do contrato: nunca “ótimo”; no mínimo ruim (manutenção / frota)
  let notaFinal = nota;
  let faixaFinal = faixa;
  let classificacao: ViagemCapacidadeItem['classificacao'] =
    nota === 'otimo' ? 'otimo' : nota === 'ruim' ? 'ruim' : 'pessimo';

  if (acimaPesoMax) {
    if (notaFinal === 'otimo') {
      notaFinal = 'ruim';
      faixaFinal = 'ruim_alto';
    }
    classificacao = 'sobrecarga';
  }

  return {
    classificacao,
    ocupacaoPct: pctIdeal,
    faixaIdeal: faixaFinal,
    notaIdeal: notaFinal,
    acimaPesoMax,
  };
}

export function analisarCapacidadeViagensDia(
  registros: Record<string, unknown>[],
  limitesOrOpts?: MapaLimiteCaminhao | null | OptsCapacidadeDia,
  optsLegacy?: { colunaRota?: string },
): ResumoCapacidadeDia {
  // Compat: (regs, limitesPesoKg, { colunaRota }) ou (regs, opts)
  const opts: OptsCapacidadeDia = (
    limitesOrOpts
    && typeof limitesOrOpts === 'object'
    && ('volumeL' in limitesOrOpts
      || 'densidadeResiduoKgL' in limitesOrOpts
      || 'densidadeKgL' in limitesOrOpts
      || 'limitesPesoKg' in limitesOrOpts
      || 'colunaRota' in limitesOrOpts)
  )
    ? (limitesOrOpts as OptsCapacidadeDia)
    : {
      limitesPesoKg: (limitesOrOpts as MapaLimiteCaminhao | null | undefined) ?? null,
      colunaRota: optsLegacy?.colunaRota,
    };

  const limites = resolverLimitesPesoKg(opts.limitesPesoKg);
  const ideais = resolverPesosIdeaisKg(opts.volumeL, densidadeOptsToInput(opts));
  const itensBrutos: Array<Omit<ViagemCapacidadeItem, 'mediaTipoKg' | 'pctMediaTipo'>> = [];

  const validos = registros.filter((r) => r._validoDashboard !== false);
  const fonte = validos.length > 0 ? validos : registros;

  for (const reg of fonte) {
    const tipoRaw = obterTipoCaminhaoRegistro(reg);
    const tipo = normalizarTipoCaminhaoPeso(tipoRaw);
    const limiteKg = limitePesoParaTipo(tipo, limites);
    const pesoIdealKg = tipo && ideais[tipo] > 0 ? ideais[tipo] : null;
    const placa = normalizarPlaca(
      String(obterValorRegistro(reg, undefined, 'placa') ?? encontrarValor(reg, 'PLACA') ?? ''),
    ) || '—';
    const rota = obterRotaRegistro(reg, opts.colunaRota);
    const pesos = extrairPesosViagemKgSeguros(reg);

    for (const pesoKg of pesos) {
      // Descarta peso absurdo vs teto do tipo (ex.: PESO TOTAL da rota lido como viagem)
      const tetoFiltro = limiteKg ?? (pesoIdealKg != null ? pesoIdealKg * 2 : null);
      if (tetoFiltro != null && pesoKg > tetoFiltro * 1.5) continue;

      const classif = classificarVsIdealEMax({
        pesoKg,
        pesoIdealKg,
        limiteKg,
      });
      itensBrutos.push({
        placa,
        rota,
        tipo,
        tipoLabel: tipo ? LABEL_TIPO_CAMINHAO[tipo] : (tipoRaw || 'Não informado'),
        pesoKg: Math.round(pesoKg * 100) / 100,
        limiteKg,
        pesoIdealKg,
        ocupacaoPct: classif.ocupacaoPct,
        faixaIdeal: classif.faixaIdeal,
        notaIdeal: classif.notaIdeal,
        classificacao: classif.classificacao,
        acimaPesoMax: classif.acimaPesoMax,
      });
    }
  }

  const somaPorTipo = new Map<TipoLimiteCaminhao, { soma: number; n: number }>();
  for (const item of itensBrutos) {
    if (!item.tipo || !(item.pesoKg > 0)) continue;
    const acc = somaPorTipo.get(item.tipo) || { soma: 0, n: 0 };
    acc.soma += item.pesoKg;
    acc.n += 1;
    somaPorTipo.set(item.tipo, acc);
  }
  const mediaPorTipo = new Map<TipoLimiteCaminhao, number>();
  for (const [tipo, acc] of somaPorTipo) {
    if (acc.n > 0) mediaPorTipo.set(tipo, acc.soma / acc.n);
  }

  const itens: ViagemCapacidadeItem[] = itensBrutos.map((item) => {
    const mediaTipoKg = item.tipo ? (mediaPorTipo.get(item.tipo) ?? null) : null;
    const pctMediaTipo = mediaTipoKg && mediaTipoKg > 0
      ? Math.round((item.pesoKg / mediaTipoKg) * 1000) / 10
      : null;
    return { ...item, mediaTipoKg, pctMediaTipo };
  });

  const classificados = itens.filter((i) => i.classificacao !== 'sem_limite');
  const ocupacoes = classificados
    .map((i) => i.ocupacaoPct)
    .filter((n): n is number => n != null);
  const ocupacaoMediaPct = ocupacoes.length
    ? Math.round((ocupacoes.reduce((s, n) => s + n, 0) / ocupacoes.length) * 10) / 10
    : null;

  const abaixoMediaTipo = 0;

  const contarFaixas = (lista: ViagemCapacidadeItem[]) => {
    const otimo = lista.filter((i) => i.notaIdeal === 'otimo').length;
    const ruim = lista.filter((i) => i.notaIdeal === 'ruim').length;
    const pessimo = lista.filter((i) => i.notaIdeal === 'pessimo').length;
    const ruimBaixo = lista.filter((i) => i.faixaIdeal === 'ruim_baixo').length;
    const ruimAlto = lista.filter((i) => i.faixaIdeal === 'ruim_alto').length;
    const pessimoBaixo = lista.filter((i) => i.faixaIdeal === 'pessimo_baixo').length;
    const pessimoAlto = lista.filter((i) => i.faixaIdeal === 'pessimo_alto').length;
    return {
      otimo,
      ruim,
      pessimo,
      ruimBaixo,
      ruimAlto,
      pessimoBaixo,
      pessimoAlto,
      ok: otimo,
      subcarga: ruimBaixo + pessimoBaixo,
      acimaIdeal: ruimAlto + pessimoAlto,
      sobrecarga: lista.filter((i) => i.acimaPesoMax || i.classificacao === 'sobrecarga').length,
    };
  };

  const porTipo = (['MINI', 'TOCO', 'BASCULANTE', 'TRUCK'] as TipoLimiteCaminhao[])
    .map((tipo) => {
      const doTipo = itens.filter((i) => i.tipo === tipo);
      const oc = doTipo
        .map((i) => i.ocupacaoPct)
        .filter((n): n is number => n != null);
      const pesoTotalKg = doTipo.reduce((s, i) => s + i.pesoKg, 0);
      const media = mediaPorTipo.get(tipo) ?? 0;
      const c = contarFaixas(doTipo);
      return {
        tipo,
        label: LABEL_TIPO_CAMINHAO[tipo],
        limiteKg: limites[tipo],
        pesoIdealKg: ideais[tipo],
        viagens: doTipo.length,
        pesoTotalKg: Math.round(pesoTotalKg * 100) / 100,
        mediaPesoKg: Math.round(media * 100) / 100,
        ...c,
        abaixoMediaTipo: 0,
        ocupacaoMediaPct: oc.length
          ? Math.round((oc.reduce((s, n) => s + n, 0) / oc.length) * 10) / 10
          : null,
      };
    })
    .filter((t) => t.viagens > 0);

  const gargalosViagem: GargaloViagem[] = [];

  for (const i of itens) {
    if (!i.notaIdeal || i.notaIdeal === 'otimo' || i.pesoIdealKg == null) {
      if (i.acimaPesoMax && i.limiteKg != null) {
        gargalosViagem.push({
          severidade: 'critico',
          placa: i.placa,
          rota: i.rota,
          tipoLabel: i.tipoLabel,
          titulo: 'Sobrecarga vs peso máx. do tipo',
          texto: `${i.placa} (${i.tipoLabel}): ${fmtNum(i.pesoKg, 0)} kg / máx. ${fmtNum(i.limiteKg, 0)} kg`
            + (i.ocupacaoPct != null ? ` (${fmtNum(i.ocupacaoPct, 0)}% do ideal)` : '')
            + (i.rota && i.rota !== '—' ? ` · rota ${i.rota}` : ''),
        });
      }
      continue;
    }

    const faixaLbl = i.faixaIdeal ? LABEL_FAIXA_IDEAL[i.faixaIdeal] : i.notaIdeal;
    const otimo = faixaIdealKg(i.pesoIdealKg);
    gargalosViagem.push({
      severidade: i.notaIdeal === 'pessimo' ? 'critico' : 'atencao',
      placa: i.placa,
      rota: i.rota,
      tipoLabel: i.tipoLabel,
      titulo: faixaLbl,
      texto: `${i.placa} (${i.tipoLabel}): ${fmtNum(i.pesoKg, 0)} kg vs ideal ${fmtNum(i.pesoIdealKg, 0)} kg`
        + (i.ocupacaoPct != null ? ` (${fmtNum(i.ocupacaoPct, 0)}%)` : '')
        + ` · ótimo ${fmtNum(otimo.minKg, 0)}–${fmtNum(otimo.maxKg, 0)} kg`
        + (i.rota && i.rota !== '—' ? ` · rota ${i.rota}` : ''),
    });
  }

  const ordemSev = { critico: 0, atencao: 1, info: 2 };
  gargalosViagem.sort((a, b) => ordemSev[a.severidade] - ordemSev[b.severidade]);

  const vistos = new Set<string>();
  const gargalosUnicos = gargalosViagem.filter((g) => {
    const k = `${g.titulo}|${g.placa}|${g.texto}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });

  const ordemNota: Record<string, number> = { pessimo: 0, ruim: 1, otimo: 2 };
  const ordemTipo = { MINI: 0, TOCO: 1, BASCULANTE: 2, TRUCK: 3 } as const;
  const viagensOrdenadas = [...itens].sort((a, b) => {
    const ta = a.tipo ? ordemTipo[a.tipo] : 99;
    const tb = b.tipo ? ordemTipo[b.tipo] : 99;
    if (ta !== tb) return ta - tb;
    const na = ordemNota[a.notaIdeal || 'otimo'] ?? 9;
    const nb = ordemNota[b.notaIdeal || 'otimo'] ?? 9;
    if (na !== nb) return na - nb;
    return Math.abs((b.ocupacaoPct ?? 100) - 100) - Math.abs((a.ocupacaoPct ?? 100) - 100);
  });

  const totais = contarFaixas(itens);

  return {
    limitesAplicados: limites,
    pesosIdeaisAplicados: ideais,
    viagensComPeso: itens.length,
    viagensClassificadas: classificados.length,
    sobrecarga: totais.sobrecarga,
    subcarga: totais.subcarga,
    acimaIdeal: totais.acimaIdeal,
    otimo: totais.otimo,
    ruim: totais.ruim,
    pessimo: totais.pessimo,
    ok: totais.otimo,
    semLimite: itens.filter((i) => i.classificacao === 'sem_limite').length,
    abaixoMediaTipo,
    ocupacaoMediaPct,
    porTipo,
    viagens: viagensOrdenadas,
    gargalosViagem: gargalosUnicos.slice(0, 20),
    pioresSobrecarga: [...itens]
      .filter((i) => i.acimaPesoMax || i.classificacao === 'sobrecarga')
      .sort((a, b) => (b.ocupacaoPct || 0) - (a.ocupacaoPct || 0))
      .slice(0, 5),
    pioresSubcarga: [...itens]
      .filter((i) => i.faixaIdeal === 'ruim_baixo' || i.faixaIdeal === 'pessimo_baixo')
      .sort((a, b) => (a.ocupacaoPct || 0) - (b.ocupacaoPct || 0))
      .slice(0, 5),
    pioresAbaixoMedia: [...itens]
      .filter((i) => i.notaIdeal === 'pessimo' || i.notaIdeal === 'ruim')
      .sort((a, b) => Math.abs((b.ocupacaoPct || 100) - 100) - Math.abs((a.ocupacaoPct || 100) - 100))
      .slice(0, 5),
  };
}
