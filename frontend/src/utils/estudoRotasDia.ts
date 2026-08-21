/**
 * Estudo de rotas do dia — métricas e gargalos por rota e por tipo de caminhão.
 * Cada linha = 1 rota; CONTADOR DE VIAGENS / PESO 1–4 = viagens dentro da rota.
 *
 * Pesos de viagem usam só PESO 1–4 seguros (nunca PESO TOTAL da rota como 1 viagem).
 * Médias de rendimento (t/viagem, peso) são por tipo: Mini vs Mini, Truck vs Truck.
 */
import {
  detectarColunasCardViagem,
  extrairMetricasCardViagem,
} from './viagemCardDados';
import { contarViagensPorRotaRegistro, extrairPesosViagemKgSeguros } from './viagensPorRota';
import { fmtNum } from './relatorioDiario';
import { normalizarPlaca } from './normalizarPlaca';
import {
  LABEL_TIPO_CAMINHAO,
  PCT_IDEAL_ATENCAO,
  PCT_IDEAL_MAX,
  PCT_IDEAL_MIN,
  PCT_IDEAL_OK,
  pctIdealForaDaMargem,
  statusPctVsMargemIdeal,
  normalizarTipoCaminhaoPeso,
  type TipoLimiteCaminhao,
} from './limitesCaminhaoContrato';
import {
  analisarCapacidadeViagensDia,
  obterTipoCaminhaoRegistro,
  type OptsCapacidadeDia,
  type ResumoCapacidadeDia,
} from './capacidadeViagemDia';

export type SeveridadeGargaloRota = 'critico' | 'atencao' | 'info';

export interface GargaloRota {
  severidade: SeveridadeGargaloRota;
  rota: string;
  titulo: string;
  texto: string;
}

export interface LinhaEstudoRota {
  rota: string;
  registros: number;
  viagens: number;
  toneladas: number;
  km: number;
  horas: number;
  tonMediaViagem: number;
  kmMedioViagem: number;
  tonHora: number;
  pesoMinKg: number | null;
  pesoMaxKg: number | null;
  placas: string[];
  motoristas: string[];
  turnos: string[];
  tipos: string[];
  /** Tipo predominante (mais viagens tipadas na rota). */
  tipoPredominante: TipoLimiteCaminhao | null;
  tipoPredominanteLabel: string;
  /** Média t/viagem do tipo predominante no dia (não a média geral). */
  mediaTipoTonViagem: number | null;
  /** Peso ideal do tipo predominante (kg) — volume × densidade. */
  pesoIdealKg: number | null;
  /** % do peso médio da rota vs ideal do tipo. */
  pctIdeal: number | null;
  pctTonDia: number;
  pctMediaTonViag: number;
  status: 'bom' | 'medio' | 'ruim';
}

export interface MediaTipoDia {
  tipo: TipoLimiteCaminhao;
  label: string;
  viagens: number;
  toneladas: number;
  tonMediaViagem: number;
  kmMedioViagem: number;
  mediaPesoKg: number | null;
  limiteKg: number | null;
  pesoIdealKg: number | null;
  /** % média do tipo vs ideal. */
  pctIdeal: number | null;
}

export interface EstudoRotasDia {
  colunaRota: string;
  mediaDia: {
    tonMediaViagem: number;
    kmMedioViagem: number;
    tonHora: number;
    viagensPorRota: number;
    toneladas: number;
    viagens: number;
    rotasAtivas: number;
  };
  mediaPorTipo: MediaTipoDia[];
  rotas: LinhaEstudoRota[];
  gargalos: GargaloRota[];
  capacidade: ResumoCapacidadeDia | null;
  destaques: {
    maiorVolume: LinhaEstudoRota | null;
    menorRendimento: LinhaEstudoRota | null;
    maiorKm: LinhaEstudoRota | null;
    menorPesoViagem: { rota: string; pesoKg: number } | null;
    maiorPesoViagem: { rota: string; pesoKg: number } | null;
  };
}

const CANDIDATOS_ROTA = [
  'DISTRITO', 'BAIRRO', 'SETOR', 'ROTA', 'REGIAO', 'REGIONAL',
  'DESTINO', 'LOCAL', 'LOCALIDADE',
] as const;

const IGNORADOS = new Set(['', '-', '--', 'N/D', 'ND', 'N/A', 'NA', '0', 'NULL', 'NONE', '—']);

const normalizar = (s: string) =>
  s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');

function encontrarValor(dado: Record<string, unknown>, nomeColuna: string): unknown {
  if (dado[nomeColuna] !== undefined && dado[nomeColuna] !== null && dado[nomeColuna] !== '') {
    return dado[nomeColuna];
  }
  const alvo = normalizar(nomeColuna);
  for (const [k, v] of Object.entries(dado)) {
    if (v !== null && v !== undefined && v !== '' && normalizar(k) === alvo) return v;
  }
  const nested = dado.dados;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return encontrarValor(nested as Record<string, unknown>, nomeColuna);
  }
  return undefined;
}

function isColunaInterna(chaveNorm: string): boolean {
  if (['DISTRITO', 'REGIONAL', 'REGIAO', 'ROTA', 'BAIRRO', 'SETOR'].includes(chaveNorm)) return false;
  if (/^(ID|UUID|SERVICO|CONTRACT|PLANILHA|UPLOAD|CREATED|UPDATED|VALIDO|DADOS)/.test(chaveNorm)) return true;
  if (/^(KM|HORA|PESO|COLETOR|DATA|VIAGENS|NUMERO)/.test(chaveNorm)) return true;
  return false;
}

/** Detecta a melhor coluna de rota/distrito na planilha do dia. */
export function detectarColunaRotaPlanilha(dados: Record<string, unknown>[]): string {
  if (!dados.length) return '';
  const chaves = Object.keys(dados[0]).filter((k) => !k.startsWith('__EMPTY') && !k.startsWith('_'));
  let melhor = '';
  let melhorScore = 0;

  for (const chave of chaves) {
    const chaveNorm = normalizar(chave);
    if (isColunaInterna(chaveNorm) && !CANDIDATOS_ROTA.some((c) => chaveNorm.includes(normalizar(c)))) {
      continue;
    }
    const idx = CANDIDATOS_ROTA.findIndex((c) => {
      const cand = normalizar(c);
      if (chaveNorm === cand) return true;
      if (cand === 'ROTA' && /ROTA0?[1-4]|KM|HORA|CHEGADA|SAIDA/.test(chaveNorm)) return false;
      return chaveNorm.includes(cand);
    });
    if (idx < 0) continue;

    const unicos = new Set<string>();
    let preenchidos = 0;
    for (const reg of dados) {
      const v = String(encontrarValor(reg, chave) || '').trim();
      if (!v || IGNORADOS.has(v.toUpperCase()) || /^\d{5,}$/.test(v)) continue;
      preenchidos++;
      unicos.add(v.toUpperCase());
    }
    if (unicos.size === 0) continue;
    const score = unicos.size * 100 + preenchidos + (CANDIDATOS_ROTA.length - idx) * 50_000;
    if (score > melhorScore) {
      melhorScore = score;
      melhor = chave;
    }
  }

  if (!melhor) {
    const cols = detectarColunasCardViagem(dados);
    if (cols.colDistrito) return cols.colDistrito;
    if (cols.colRegional) return cols.colRegional;
  }
  return melhor;
}

function statusVsMedia(pct: number): 'bom' | 'medio' | 'ruim' {
  // Fallback sem ideal: usa mesmos limiares legados de proximidade da média
  if (pct >= PCT_IDEAL_OK) return 'bom';
  if (pct >= PCT_IDEAL_ATENCAO) return 'medio';
  return 'ruim';
}

function statusVsIdeal(pctIdeal: number | null, pctMediaFallback: number): 'bom' | 'medio' | 'ruim' {
  if (pctIdeal != null) return statusPctVsMargemIdeal(pctIdeal);
  return statusVsMedia(pctMediaFallback);
}

function nomeRotaRegistro(reg: Record<string, unknown>, colRota: string): string {
  if (!colRota) return '';
  const v = String(encontrarValor(reg, colRota) || '').trim();
  if (!v || IGNORADOS.has(v.toUpperCase()) || /^\d{5,}$/.test(v)) return '';
  return v;
}

export function analisarEstudoRotasDia(
  registros: Record<string, unknown>[],
  opts?: OptsCapacidadeDia,
): EstudoRotasDia | null {
  const validos = registros.filter((r) => r._validoDashboard !== false);
  const fonte = validos.length > 0 ? validos : registros;
  if (!fonte.length) return null;

  const colunaRota = detectarColunaRotaPlanilha(fonte);
  if (!colunaRota) return null;

  const cols = detectarColunasCardViagem(fonte);
  type Acc = {
    registros: number;
    viagens: number;
    toneladas: number;
    km: number;
    horas: number;
    pesos: number[];
    placas: Set<string>;
    motoristas: Set<string>;
    turnos: Set<string>;
    tiposCount: Map<TipoLimiteCaminhao, number>;
    tiposRaw: Set<string>;
  };

  type AccTipo = {
    viagens: number;
    toneladas: number;
    km: number;
    pesos: number[];
  };

  const map = new Map<string, Acc>();
  const mapTipo = new Map<TipoLimiteCaminhao, AccTipo>();
  let totalTon = 0;
  let totalVg = 0;
  let totalKm = 0;
  let totalHoras = 0;

  for (const reg of fonte) {
    const rota = nomeRotaRegistro(reg, colunaRota);
    if (!rota) continue;

    const m = extrairMetricasCardViagem(reg, cols);
    const vg = contarViagensPorRotaRegistro(reg);
    if (vg <= 0 && m.toneladas <= 0 && m.kmFinal <= 0) continue;

    if (!map.has(rota)) {
      map.set(rota, {
        registros: 0,
        viagens: 0,
        toneladas: 0,
        km: 0,
        horas: 0,
        pesos: [],
        placas: new Set(),
        motoristas: new Set(),
        turnos: new Set(),
        tiposCount: new Map(),
        tiposRaw: new Set(),
      });
    }
    const g = map.get(rota)!;
    g.registros += 1;
    g.viagens += vg;
    g.toneladas += m.toneladas;
    g.km += m.kmFinal;
    g.horas += m.horasTrabalhadas;
    g.pesos.push(...extrairPesosViagemKgSeguros(reg));

    const placa = normalizarPlaca(m.placa);
    if (placa) g.placas.add(placa);
    if (m.motorista && m.motorista !== '—') g.motoristas.add(m.motorista);
    if (m.turno && m.turno !== '—') g.turnos.add(m.turno);

    const tipoRaw = obterTipoCaminhaoRegistro(reg);
    const tipo = normalizarTipoCaminhaoPeso(tipoRaw);
    if (tipoRaw) g.tiposRaw.add(tipoRaw);
    if (tipo) {
      g.tiposCount.set(tipo, (g.tiposCount.get(tipo) || 0) + vg);
      const at = mapTipo.get(tipo) || { viagens: 0, toneladas: 0, km: 0, pesos: [] };
      at.viagens += vg;
      at.toneladas += m.toneladas;
      at.km += m.kmFinal;
      at.pesos.push(...extrairPesosViagemKgSeguros(reg));
      mapTipo.set(tipo, at);
    }

    totalTon += m.toneladas;
    totalVg += vg;
    totalKm += m.kmFinal;
    totalHoras += m.horasTrabalhadas;
  }

  if (map.size === 0) return null;

  const capOpts: OptsCapacidadeDia = {
    limitesPesoKg: opts?.limitesPesoKg,
    volumeL: opts?.volumeL,
    densidadeResiduoKgL: opts?.densidadeResiduoKgL,
    densidadeKgL: opts?.densidadeKgL,
    densidadeKgLPorPlaca: opts?.densidadeKgLPorPlaca,
    colunaRota,
  };
  const capacidade = analisarCapacidadeViagensDia(fonte, capOpts);
  const limitePorTipo = capacidade.limitesAplicados;
  const idealPorTipo = capacidade.pesosIdeaisAplicados;
  const mediaPesoPorTipo = new Map(
    capacidade.porTipo.map((t) => [t.tipo, t.mediaPesoKg] as const),
  );

  const mediaPorTipo: MediaTipoDia[] = (['MINI', 'TOCO', 'BASCULANTE', 'TRUCK'] as TipoLimiteCaminhao[])
    .filter((t) => mapTipo.has(t))
    .map((tipo) => {
      const a = mapTipo.get(tipo)!;
      const pesosOk = a.pesos.filter((p) => p > 0);
      const mediaPesoKg = mediaPesoPorTipo.get(tipo)
        ?? (pesosOk.length
          ? Math.round((pesosOk.reduce((s, p) => s + p, 0) / pesosOk.length) * 100) / 100
          : null);
      const pesoIdealKg = idealPorTipo[tipo] > 0 ? idealPorTipo[tipo] : null;
      const pctIdeal = mediaPesoKg != null && pesoIdealKg != null && pesoIdealKg > 0
        ? Math.round((mediaPesoKg / pesoIdealKg) * 1000) / 10
        : null;
      return {
        tipo,
        label: LABEL_TIPO_CAMINHAO[tipo],
        viagens: a.viagens,
        toneladas: Math.round(a.toneladas * 1000) / 1000,
        tonMediaViagem: a.viagens > 0 ? Math.round((a.toneladas / a.viagens) * 1000) / 1000 : 0,
        kmMedioViagem: a.viagens > 0 ? Math.round((a.km / a.viagens) * 100) / 100 : 0,
        mediaPesoKg,
        limiteKg: limitePorTipo[tipo] ?? null,
        pesoIdealKg,
        pctIdeal,
      };
    });

  const mediaTipoTon = new Map(mediaPorTipo.map((t) => [t.tipo, t.tonMediaViagem] as const));
  const idealKgTipo = new Map(mediaPorTipo.map((t) => [t.tipo, t.pesoIdealKg] as const));

  const tonMediaDia = totalVg > 0 ? totalTon / totalVg : 0;
  const kmMediaDia = totalVg > 0 ? totalKm / totalVg : 0;
  const tonHoraDia = totalHoras > 0 ? totalTon / totalHoras : 0;

  const rotas: LinhaEstudoRota[] = [...map.entries()]
    .map(([rota, g]) => {
      const tonMediaViagem = g.viagens > 0 ? g.toneladas / g.viagens : 0;
      const kmMedioViagem = g.viagens > 0 ? g.km / g.viagens : 0;
      const tonHora = g.horas > 0 ? g.toneladas / g.horas : 0;
      const pesosOk = g.pesos.filter((p) => p > 0);

      let tipoPredominante: TipoLimiteCaminhao | null = null;
      let maxVgTipo = 0;
      for (const [t, n] of g.tiposCount) {
        if (n > maxVgTipo) {
          maxVgTipo = n;
          tipoPredominante = t;
        }
      }

      const mediaTipoTonViagem = tipoPredominante
        ? (mediaTipoTon.get(tipoPredominante) ?? null)
        : null;
      const pesoIdealKg = tipoPredominante
        ? (idealKgTipo.get(tipoPredominante) ?? null)
        : null;
      const pesoMedioRotaKg = tonMediaViagem * 1000;
      const pctIdeal = pesoIdealKg != null && pesoIdealKg > 0
        ? Math.round((pesoMedioRotaKg / pesoIdealKg) * 1000) / 10
        : null;
      // Preferência: vs peso ideal do tipo; fallback média do tipo / dia
      const refMedia = mediaTipoTonViagem != null && mediaTipoTonViagem > 0
        ? mediaTipoTonViagem
        : tonMediaDia;
      const pct = refMedia > 0 ? (tonMediaViagem / refMedia) * 100 : 100;

      return {
        rota,
        registros: g.registros,
        viagens: g.viagens,
        toneladas: Math.round(g.toneladas * 1000) / 1000,
        km: Math.round(g.km * 100) / 100,
        horas: Math.round(g.horas * 100) / 100,
        tonMediaViagem: Math.round(tonMediaViagem * 1000) / 1000,
        kmMedioViagem: Math.round(kmMedioViagem * 100) / 100,
        tonHora: Math.round(tonHora * 1000) / 1000,
        pesoMinKg: pesosOk.length ? Math.round(Math.min(...pesosOk) * 100) / 100 : null,
        pesoMaxKg: pesosOk.length ? Math.round(Math.max(...pesosOk) * 100) / 100 : null,
        placas: [...g.placas].sort(),
        motoristas: [...g.motoristas].sort(),
        turnos: [...g.turnos].sort(),
        tipos: [...g.tiposRaw].sort(),
        tipoPredominante,
        tipoPredominanteLabel: tipoPredominante
          ? LABEL_TIPO_CAMINHAO[tipoPredominante]
          : ([...g.tiposRaw][0] || '—'),
        mediaTipoTonViagem,
        pesoIdealKg,
        pctIdeal,
        pctTonDia: totalTon > 0 ? (g.toneladas / totalTon) * 100 : 0,
        pctMediaTonViag: pct,
        status: statusVsIdeal(pctIdeal, pct),
      };
    })
    .sort((a, b) => b.toneladas - a.toneladas || b.viagens - a.viagens);

  const gargalos: GargaloRota[] = [];

  for (const r of rotas) {
    // Gargalo principal: rota fora da margem ±% do ideal do tipo predominante
    if (
      r.viagens >= 1
      && r.pesoIdealKg != null
      && r.pesoIdealKg > 0
      && r.pctIdeal != null
      && pctIdealForaDaMargem(r.pctIdeal)
    ) {
      const abaixo = r.pctIdeal < 100;
      const nota = statusPctVsMargemIdeal(r.pctIdeal);
      gargalos.push({
        severidade: nota === 'ruim' ? 'critico' : 'atencao',
        rota: r.rota,
        titulo: abaixo
          ? `Abaixo da faixa ótima (${r.tipoPredominanteLabel})`
          : `Acima da faixa ótima — risco à frota (${r.tipoPredominanteLabel})`,
        texto: `${fmtNum(r.tonMediaViagem * 1000, 0)} kg/viagem vs ideal ${fmtNum(r.pesoIdealKg, 0)} kg`
          + ` (${fmtNum(r.pctIdeal, 0)}%) · ${r.tipoPredominanteLabel}`
          + ` · ${fmtNum(r.viagens, 0)} viagem(ns).`,
      });
    } else if (
      r.viagens >= 1
      && (r.pesoIdealKg == null || !(r.pesoIdealKg > 0))
    ) {
      const refTon = r.mediaTipoTonViagem != null && r.mediaTipoTonViagem > 0
        ? r.mediaTipoTonViagem
        : tonMediaDia;
      const refLabel = r.tipoPredominante
        ? `média do ${r.tipoPredominanteLabel}`
        : 'média do dia';
      if (refTon > 0 && r.tonMediaViagem < refTon * (PCT_IDEAL_ATENCAO / 100)) {
        gargalos.push({
          severidade: r.tonMediaViagem < refTon * 0.6 ? 'critico' : 'atencao',
          rota: r.rota,
          titulo: r.tipoPredominante
            ? `Rendimento abaixo da média do ${r.tipoPredominanteLabel}`
            : 'Rendimento abaixo da média do dia',
          texto: `${fmtNum(r.tonMediaViagem, 2)} t/viagem vs ${refLabel} ${fmtNum(refTon, 2)} t`
            + ` (${fmtNum(r.pctMediaTonViag, 0)}%) em ${fmtNum(r.viagens, 0)} viagem(ns).`,
        });
      }
    }
    if (r.viagens >= 1 && kmMediaDia > 0 && r.kmMedioViagem > kmMediaDia * 1.35) {
      gargalos.push({
        severidade: 'atencao',
        rota: r.rota,
        titulo: 'KM por viagem elevado',
        texto: `${fmtNum(r.kmMedioViagem, 1)} km/viagem vs média ${fmtNum(kmMediaDia, 1)} km — possível deslocamento ou roteiro longo.`,
      });
    }
    if (r.horas > 0 && tonHoraDia > 0 && r.tonHora < tonHoraDia * 0.7) {
      gargalos.push({
        severidade: 'critico',
        rota: r.rota,
        titulo: 'Baixa produtividade por hora',
        texto: `${fmtNum(r.tonHora, 2)} t/h vs média ${fmtNum(tonHoraDia, 2)} t/h.`,
      });
    }
    if (r.pctTonDia >= 40 && rotas.length >= 3) {
      gargalos.push({
        severidade: r.pctTonDia >= 55 ? 'atencao' : 'info',
        rota: r.rota,
        titulo: 'Concentração de volume',
        texto: `Concentrou ${fmtNum(r.pctTonDia, 0)}% das toneladas do dia — verifique balanceamento entre rotas.`,
      });
    }
  }

  if (capacidade.viagensComPeso > 0 && capacidade.sobrecarga > 0) {
    const tipTxt = capacidade.porTipo
      .filter((t) => t.sobrecarga > 0)
      .map((t) => `${t.label}: ${t.sobrecarga}`)
      .join(' · ');
    gargalos.push({
      severidade: 'critico',
      rota: '—',
      titulo: 'Sobrecarga vs peso máx. do tipo',
      texto: `${fmtNum(capacidade.sobrecarga, 0)} viagem(ns) acima do peso máximo do tipo`
        + (tipTxt ? ` (${tipTxt})` : '')
        + '.',
    });
  }

  // Tipos com média do dia fora da margem ±% do ideal
  const tiposAbaixoIdeal = mediaPorTipo.filter(
    (t) => t.pctIdeal != null && pctIdealForaDaMargem(t.pctIdeal),
  );
  if (tiposAbaixoIdeal.length > 0) {
    gargalos.push({
      severidade: tiposAbaixoIdeal.some((t) => Math.abs((t.pctIdeal ?? 100) - 100) > 25) ? 'critico' : 'atencao',
      rota: '—',
      titulo: `Tipos fora da faixa ótima do ideal (${PCT_IDEAL_MIN}–${PCT_IDEAL_MAX}%)`,
      texto: tiposAbaixoIdeal
        .map((t) => `${t.label}: ${fmtNum(t.mediaPesoKg ?? 0, 0)} kg vs ideal ${fmtNum(t.pesoIdealKg ?? 0, 0)} kg (${fmtNum(t.pctIdeal ?? 0, 0)}%)`)
        .join(' · '),
    });
  }

  if (gargalos.length === 0 && rotas.length > 0) {
    const tiposTxt = mediaPorTipo.length
      ? mediaPorTipo.map((t) => {
        const idealTxt = t.pesoIdealKg != null
          ? ` / ideal ${fmtNum(t.pesoIdealKg, 0)} kg (${t.pctIdeal != null ? `${fmtNum(t.pctIdeal, 0)}%` : '—'})`
          : '';
        return `${t.label} ${fmtNum(t.tonMediaViagem, 2)} t/v${idealTxt}`;
      }).join(' · ')
      : `${fmtNum(tonMediaDia, 2)} t/viagem`;
    gargalos.push({
      severidade: 'info',
      rota: '—',
      titulo: 'Rotas dentro do peso ideal por tipo',
      texto: `Nenhum gargalo vs ideal do contrato. ${tiposTxt} · ${rotas.length} rota(s).`,
    });
  }

  const ordemSev = { critico: 0, atencao: 1, info: 2 };
  gargalos.sort((a, b) => ordemSev[a.severidade] - ordemSev[b.severidade]);

  let menorPeso: EstudoRotasDia['destaques']['menorPesoViagem'] = null;
  let maiorPeso: EstudoRotasDia['destaques']['maiorPesoViagem'] = null;
  for (const r of rotas) {
    if (r.pesoMinKg != null && (!menorPeso || r.pesoMinKg < menorPeso.pesoKg)) {
      menorPeso = { rota: r.rota, pesoKg: r.pesoMinKg };
    }
    if (r.pesoMaxKg != null && (!maiorPeso || r.pesoMaxKg > maiorPeso.pesoKg)) {
      maiorPeso = { rota: r.rota, pesoKg: r.pesoMaxKg };
    }
  }

  const comViagem = rotas.filter((r) => r.viagens > 0);

  return {
    colunaRota,
    mediaDia: {
      tonMediaViagem: Math.round(tonMediaDia * 1000) / 1000,
      kmMedioViagem: Math.round(kmMediaDia * 100) / 100,
      tonHora: Math.round(tonHoraDia * 1000) / 1000,
      viagensPorRota: rotas.length > 0 ? Math.round((totalVg / rotas.length) * 100) / 100 : 0,
      toneladas: Math.round(totalTon * 1000) / 1000,
      viagens: totalVg,
      rotasAtivas: rotas.length,
    },
    mediaPorTipo,
    rotas,
    gargalos: gargalos.slice(0, 12),
    capacidade: capacidade.viagensComPeso > 0 ? capacidade : null,
    destaques: {
      maiorVolume: comViagem[0] || null,
      menorRendimento: comViagem.length
        ? [...comViagem].sort((a, b) => {
          const pa = a.pctIdeal ?? a.pctMediaTonViag;
          const pb = b.pctIdeal ?? b.pctMediaTonViag;
          return pa - pb;
        })[0]
        : null,
      maiorKm: comViagem.length
        ? [...comViagem].sort((a, b) => b.kmMedioViagem - a.kmMedioViagem)[0]
        : null,
      menorPesoViagem: menorPeso,
      maiorPesoViagem: maiorPeso,
    },
  };
}
