/**
 * Métricas operacionais do dia — somente a partir dos registros upados na data selecionada.
 */
import {
  detectarColunasCardViagem,
  extrairMetricasCardViagem,
  obterValorRegistro,
} from './viagemCardDados';
import { contarViagensPorRotaRegistro } from './viagensPorRota';
import { fmtNum } from './relatorioDiario';
import { normalizarPlaca } from './normalizarPlaca';
import { ehPlacaReserva } from './placasReserva';
import {
  LABEL_TIPO_CAMINHAO,
  PCT_IDEAL_MAX,
  PCT_IDEAL_MIN,
  densidadeOptsToInput,
  pctIdealForaDaMargem,
  statusPctVsMargemIdeal,
  PCT_SUBCARGA_CAPACIDADE,
  PCT_SUBCARGA_POR_TIPO,
  limitePesoParaTipo,
  normalizarTipoCaminhaoPeso,
  resolverLimitesPesoKg,
  resolverPesosIdeaisKg,
  type MapaLimiteCaminhao,
  type TipoLimiteCaminhao,
} from './limitesCaminhaoContrato';

export interface LinhaOperacaoGrupo {
  chave: string;
  registros: number;
  viagens: number;
  toneladas: number;
  km: number;
  horas: number;
  tonMediaViagem: number;
  kmMedioViagem: number;
  /** Tipo predominante (Mini/Toco/…) quando tipado na planilha. */
  tipoCaminhao?: string | null;
}

export interface OperacaoDiaResumo {
  registros: number;
  viagens: number;
  toneladas: number;
  km: number;
  horas: number;
  /** Placas únicas no dia (cada placa conta uma vez) */
  caminhoes: number;
  coletores: number;
  motoristas: number;
  coletoresEquipe: number;
  tonMediaColeta: number;
  kmMedioViagem: number;
  tonKm: number;
  prodColetor: number;
}

export interface OperacaoDiaAnalise {
  resumo: OperacaoDiaResumo;
  porPlaca: LinhaOperacaoGrupo[];
  porTurno: LinhaOperacaoGrupo[];
  porRegional: LinhaOperacaoGrupo[];
  porMotorista: LinhaOperacaoGrupo[];
  porTipoCaminhao: LinhaOperacaoGrupo[];
  porDistrito: LinhaOperacaoGrupo[];
  registrosConsiderados: number;
}

/** Converte agregação SQL do backend no formato do painel do dia. */
export function analiseOperacaoDeAgregacaoSql(agg: {
  resumo: {
    registros: number;
    viagens: number;
    pesoTotalTon: number;
    kmTotal: number;
    horasProdutivas: number;
    placas: number;
    motoristas: number;
  };
  porMotorista: Array<{
    label: string; viagens: number; tonelagem: number; kmTotal: number;
    horasProdutivas: number; tonPorViagem: number; kmPorViagem: number;
  }>;
  porPlaca: Array<{
    label: string; viagens: number; tonelagem: number; kmTotal: number;
    horasProdutivas: number; tonPorViagem: number; kmPorViagem: number;
  }>;
  porDistrito: Array<{
    label: string; viagens: number; tonelagem: number; kmTotal: number;
    horasProdutivas: number; tonPorViagem: number; kmPorViagem: number;
  }>;
}): OperacaoDiaAnalise {
  const mapLinha = (l: {
    label: string; viagens: number; tonelagem: number; kmTotal: number;
    horasProdutivas: number; tonPorViagem: number; kmPorViagem: number;
  }): LinhaOperacaoGrupo => ({
    chave: l.label,
    registros: l.viagens,
    viagens: l.viagens,
    toneladas: l.tonelagem,
    km: l.kmTotal,
    horas: l.horasProdutivas,
    tonMediaViagem: l.tonPorViagem,
    kmMedioViagem: l.kmPorViagem,
  });

  const r = agg.resumo;
  const tonMedia = r.viagens > 0 ? r.pesoTotalTon / r.viagens : 0;
  const kmMedio = r.viagens > 0 ? r.kmTotal / r.viagens : 0;
  const tonKm = r.kmTotal > 0 ? r.pesoTotalTon / r.kmTotal : 0;
  const prodColetor = r.placas > 0 ? r.pesoTotalTon / r.placas : 0;

  return {
    resumo: {
      registros: r.registros,
      viagens: r.viagens,
      toneladas: r.pesoTotalTon,
      km: r.kmTotal,
      horas: r.horasProdutivas,
      caminhoes: r.placas,
      coletores: r.placas,
      motoristas: r.motoristas,
      coletoresEquipe: 0,
      tonMediaColeta: Math.round(tonMedia * 100) / 100,
      kmMedioViagem: Math.round(kmMedio * 100) / 100,
      tonKm: Math.round(tonKm * 10000) / 10000,
      prodColetor: Math.round(prodColetor * 100) / 100,
    },
    porPlaca: agg.porPlaca.map(mapLinha),
    porTurno: [],
    porRegional: [],
    porMotorista: agg.porMotorista.map(mapLinha),
    porTipoCaminhao: [],
    porDistrito: agg.porDistrito.map(mapLinha),
    registrosConsiderados: r.registros,
  };
}

export type SeveridadeInsight = 'critico' | 'atencao' | 'info';

export interface InsightOperacao {
  severidade: SeveridadeInsight;
  titulo: string;
  texto: string;
}

export interface LinhaEficienciaPlaca extends LinhaOperacaoGrupo {
  tonHora: number;
  pctMediaTonViag: number;
  status: 'bom' | 'medio' | 'ruim';
  ehReserva?: boolean;
  /** Média usada na comparação (do tipo, se tipado; senão média do dia). */
  mediaRefTonViag: number;
  /** Rótulo da referência (ex.: "Mini" ou "dia"). */
  mediaRefLabel: string;
  /** Limite do contrato (kg) para o tipo, se houver. */
  limiteContratoKg: number | null;
  /** Ocupação vs limite do contrato (%). */
  pctContrato: number | null;
  /** Peso ideal do tipo (volume × densidade) em kg. */
  pesoIdealKg: number | null;
  /** Ocupação vs peso ideal (%). */
  pctIdeal: number | null;
}

const normalizar = (s: string) =>
  s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');

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

type GrupoAcc = LinhaOperacaoGrupo & { _votosTipo?: Map<string, number> };

function criarGrupo(chave: string): GrupoAcc {
  return {
    chave,
    registros: 0,
    viagens: 0,
    toneladas: 0,
    km: 0,
    horas: 0,
    tonMediaViagem: 0,
    kmMedioViagem: 0,
    tipoCaminhao: null,
    _votosTipo: new Map(),
  };
}

function finalizarGrupo(g: GrupoAcc): LinhaOperacaoGrupo {
  let tipoPred: string | null = null;
  let maxVotos = 0;
  for (const [tipo, n] of g._votosTipo || []) {
    if (n > maxVotos) {
      maxVotos = n;
      tipoPred = tipo;
    }
  }
  return {
    chave: g.chave,
    registros: g.registros,
    viagens: g.viagens,
    toneladas: g.toneladas,
    km: g.km,
    horas: g.horas,
    tonMediaViagem: g.viagens > 0 ? g.toneladas / g.viagens : 0,
    kmMedioViagem: g.viagens > 0 ? g.km / g.viagens : 0,
    tipoCaminhao: tipoPred,
  };
}

function ordenar(lista: LinhaOperacaoGrupo[]): LinhaOperacaoGrupo[] {
  return [...lista].sort((a, b) => b.viagens - a.viagens || b.toneladas - a.toneladas);
}

function addGrupo(
  map: Map<string, GrupoAcc>,
  chave: string,
  reg: Record<string, unknown>,
  m: ReturnType<typeof extrairMetricasCardViagem>,
  tipoRaw?: string,
) {
  const k = chave || '—';
  if (!map.has(k)) map.set(k, criarGrupo(k));
  const g = map.get(k)!;
  const vg = contarViagensPorRotaRegistro(reg) || Math.max(m.viagens, 1);
  g.registros += 1;
  g.viagens += vg;
  g.toneladas += m.toneladas;
  g.km += m.kmFinal;
  g.horas += m.horasTrabalhadas;
  const tipoNorm = normalizarTipoCaminhaoPeso(tipoRaw);
  if (tipoNorm && g._votosTipo) {
    g._votosTipo.set(tipoNorm, (g._votosTipo.get(tipoNorm) || 0) + vg);
  }
}

/** Média t/viagem por tipo tipado (MINI/TOCO/…) a partir de porTipoCaminhao. */
export function mediasTonViagemPorTipo(
  analise: OperacaoDiaAnalise,
): Map<TipoLimiteCaminhao, number> {
  const map = new Map<TipoLimiteCaminhao, number>();
  for (const g of analise.porTipoCaminhao) {
    const tipo = normalizarTipoCaminhaoPeso(g.chave);
    if (!tipo || !(g.viagens > 0)) continue;
    map.set(tipo, g.tonMediaViagem);
  }
  return map;
}

/** Referência de comparação: média do tipo da placa/grupo, senão média do dia. */
export function referenciaTonViagemGrupo(
  grupo: LinhaOperacaoGrupo,
  analise: OperacaoDiaAnalise,
  mediasTipo?: Map<TipoLimiteCaminhao, number>,
): { media: number; label: string; tipo: TipoLimiteCaminhao | null } {
  const medias = mediasTipo || mediasTonViagemPorTipo(analise);
  const tipo = normalizarTipoCaminhaoPeso(grupo.tipoCaminhao || grupo.chave);
  if (tipo && medias.has(tipo) && (medias.get(tipo) || 0) > 0) {
    return {
      media: medias.get(tipo)!,
      label: LABEL_TIPO_CAMINHAO[tipo],
      tipo,
    };
  }
  return {
    media: analise.resumo.tonMediaColeta,
    label: 'dia',
    tipo: null,
  };
}

const resumoVazio: OperacaoDiaResumo = {
  registros: 0,
  viagens: 0,
  toneladas: 0,
  km: 0,
  horas: 0,
  caminhoes: 0,
  coletores: 0,
  motoristas: 0,
  coletoresEquipe: 0,
  tonMediaColeta: 0,
  kmMedioViagem: 0,
  tonKm: 0,
  prodColetor: 0,
};

/** KPIs que já aparecem no hero/cards base — omitir na grade para evitar duplicação. */
export function isKpiMetricaBaseOperacao(nome: string): boolean {
  const n = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const padroes = [
    'viagem', 'tonelada', 'quilometro', ' km', 'hora produtiva', 'horas prod',
    'veiculo', 'coletor', 'motorista', 'caminhao', 'placa unica', 'placas unicas',
    'ton/viag', 'km/viag', 'ton por viagem',
    'km por viagem', 'prod/coletor', 'produtividade coletor', 'ton/hora', 'km/h',
    'peso total', 'distancia', 'registro',
  ];
  return padroes.some((p) => n.includes(p));
}

function statusVsMedia(pct: number): 'bom' | 'medio' | 'ruim' {
  if (pct >= 90) return 'bom';
  if (pct >= 75) return 'medio';
  return 'ruim';
}

function statusVsContratoETipo(opts: {
  tonMediaViagem: number;
  pctMediaTipo: number;
  tipo: TipoLimiteCaminhao | null;
  limiteKg: number | null;
  pesoIdealKg?: number | null;
}): {
  status: 'bom' | 'medio' | 'ruim';
  pctContrato: number | null;
  pctIdeal: number | null;
} {
  const { tonMediaViagem, pctMediaTipo, tipo, limiteKg, pesoIdealKg } = opts;
  const pesoKg = tonMediaViagem * 1000;
  const pctContrato = limiteKg && limiteKg > 0
    ? Math.round((pesoKg / limiteKg) * 1000) / 10
    : null;
  const pctIdeal = pesoIdealKg && pesoIdealKg > 0
    ? Math.round((pesoKg / pesoIdealKg) * 1000) / 10
    : null;

  // Preferência: peso ideal ± margem — gargalo se abaixo OU acima da faixa
  if (pctIdeal != null) {
    if (pctContrato != null && pctContrato > 100) {
      return { status: 'ruim', pctContrato, pctIdeal }; // acima do peso máx.
    }
    const st = statusPctVsMargemIdeal(pctIdeal);
    return { status: st, pctContrato, pctIdeal };
  }

  // Fallback: faixa do peso máximo do tipo
  if (pctContrato != null) {
    const pctSub = (tipo && PCT_SUBCARGA_POR_TIPO[tipo]) || PCT_SUBCARGA_CAPACIDADE;
    if (pctContrato >= pctSub && pctContrato <= PCT_IDEAL_MAX) {
      if (pctMediaTipo >= PCT_IDEAL_MIN) return { status: 'bom', pctContrato, pctIdeal };
      return { status: 'medio', pctContrato, pctIdeal };
    }
    if (pctContrato > PCT_IDEAL_MAX) return { status: 'medio', pctContrato, pctIdeal };
    return { status: 'ruim', pctContrato, pctIdeal };
  }

  return { status: statusVsMedia(pctMediaTipo), pctContrato, pctIdeal };
}

export type OptsAnaliseContratoDia = {
  limitesPesoKg?: MapaLimiteCaminhao | null;
  volumeL?: MapaLimiteCaminhao | null;
  densidadeResiduoKgL?: number | null;
  densidadeKgL?: MapaLimiteCaminhao | null;
};

/** Insights gerenciais — poucos, priorizando limite/média do tipo (não média geral do dia). */
export function gerarInsightsOperacao(
  analise: OperacaoDiaAnalise,
  placasReserva?: string[],
  opts?: OptsAnaliseContratoDia,
): InsightOperacao[] {
  const { resumo } = analise;
  const insights: InsightOperacao[] = [];
  if (!resumo.viagens) return insights;

  const avgTonViag = resumo.tonMediaColeta;
  const avgKmViag = resumo.kmMedioViagem;
  const limites = resolverLimitesPesoKg(opts?.limitesPesoKg);
  const ideais = resolverPesosIdeaisKg(opts?.volumeL, densidadeOptsToInput(opts));
  const eficiencia = montarEficienciaPlacas(analise, placasReserva, opts);

  const reservaOperando = analise.porPlaca.filter(
    (p) => p.viagens > 0 && ehPlacaReserva(p.chave, placasReserva),
  );
  if (reservaOperando.length > 0) {
    insights.push({
      severidade: 'info',
      titulo: 'Veículo reserva em operação',
      texto: `${reservaOperando.map((p) => p.chave).join(', ')} operou no dia (${reservaOperando.reduce((s, p) => s + p.viagens, 0)} viagem(ns) no total).`,
    });
  }

  const placasFracas = eficiencia
    .filter((p) => p.status !== 'bom' && !p.ehReserva)
    .slice(0, 5);

  if (placasFracas.length > 0) {
    const exemplos = placasFracas.slice(0, 3).map((p) => {
      const ref = p.pesoIdealKg != null
        ? ` / ideal ${fmtNum(p.pesoIdealKg, 0)} kg (${p.pctIdeal != null ? `${fmtNum(p.pctIdeal, 0)}%` : '—'})`
        : p.limiteContratoKg != null ? ` / lim. ${fmtNum(p.limiteContratoKg, 0)} kg` : '';
      return `${p.chave} (${p.mediaRefLabel}: ${fmtNum(p.tonMediaViagem, 2)} t${ref})`;
    });
    insights.push({
      severidade: placasFracas.length >= 2 ? 'critico' : 'atencao',
      titulo: `Veículos fora da faixa ótima do ideal (${PCT_IDEAL_MIN}–${PCT_IDEAL_MAX}%)`,
      texto: `${placasFracas.length} placa(s) fora do ótimo (vol × dens): ${exemplos.join('; ')}.`,
    });
  }

  const tiposForaMargem = analise.porTipoCaminhao
    .map((t) => {
      const tipo = normalizarTipoCaminhaoPeso(t.chave);
      if (!tipo || t.viagens <= 0) return null;
      const ideal = ideais[tipo];
      if (!(ideal > 0)) return null;
      const pesoMedio = t.tonMediaViagem * 1000;
      const pct = (pesoMedio / ideal) * 100;
      if (!pctIdealForaDaMargem(pct)) return null;
      return { tipo, label: LABEL_TIPO_CAMINHAO[tipo], pesoMedio, ideal, pct, viagens: t.viagens };
    })
    .filter(Boolean) as Array<{
      tipo: TipoLimiteCaminhao;
      label: string;
      pesoMedio: number;
      ideal: number;
      pct: number;
      viagens: number;
    }>;

  if (tiposForaMargem.length > 0) {
    insights.push({
      severidade: tiposForaMargem.some((t) => Math.abs(t.pct - 100) > 25) ? 'critico' : 'atencao',
      titulo: `Tipos fora da faixa ótima do ideal (${PCT_IDEAL_MIN}–${PCT_IDEAL_MAX}%)`,
      texto: tiposForaMargem
        .map((t) => `${t.label}: ${fmtNum(t.pesoMedio, 0)} kg vs ideal ${fmtNum(t.ideal, 0)} kg (${fmtNum(t.pct, 0)}%)`)
        .join(' · '),
    });
  }

  const placasKmAlto = analise.porPlaca.filter(
    (p) =>
      p.viagens >= 1
      && !ehPlacaReserva(p.chave, placasReserva)
      && avgKmViag > 0
      && p.kmMedioViagem > avgKmViag * 1.5,
  );
  if (placasKmAlto.length > 0) {
    insights.push({
      severidade: 'atencao',
      titulo: 'Deslocamento muito elevado',
      texto: `${placasKmAlto.slice(0, 3).map((p) => p.chave).join(', ')} com KM/viagem > 150% da média (${fmtNum(avgKmViag, 1)} km).`,
    });
  }

  // Resumo por tipo tipado (visão gerencial)
  const tiposTxt = analise.porTipoCaminhao
    .filter((t) => t.viagens > 0 && normalizarTipoCaminhaoPeso(t.chave))
    .map((t) => {
      const tipo = normalizarTipoCaminhaoPeso(t.chave)!;
      const ideal = ideais[tipo];
      const lim = limites[tipo];
      return `${LABEL_TIPO_CAMINHAO[tipo]} ${fmtNum(t.tonMediaViagem, 2)} t/v (ideal ${fmtNum(ideal, 0)} · máx. ${fmtNum(lim, 0)} kg)`;
    });
  if (tiposTxt.length > 0) {
    insights.push({
      severidade: 'info',
      titulo: 'Referência por tipo (ideal e máx. do contrato)',
      texto: tiposTxt.join(' · '),
    });
  }

  if (insights.length === 0) {
    insights.push({
      severidade: 'info',
      titulo: 'Operação dentro dos parâmetros',
      texto: `Nenhum desvio vs peso ideal do tipo. Média do dia: ${fmtNum(avgTonViag, 2)} t/viagem.`,
    });
  }

  return insights.slice(0, 5);
}

/**
 * Eficiência por placa vs peso ideal do tipo (vol × dens) e teto do contrato.
 * Mini ~3,5 t com ideal ~3,3 t = OK — não compara com média geral do dia.
 */
export function montarEficienciaPlacas(
  analise: OperacaoDiaAnalise,
  placasReserva?: string[],
  opts?: OptsAnaliseContratoDia,
): LinhaEficienciaPlaca[] {
  const mediasTipo = mediasTonViagemPorTipo(analise);
  const limites = resolverLimitesPesoKg(opts?.limitesPesoKg);
  const ideais = resolverPesosIdeaisKg(opts?.volumeL, densidadeOptsToInput(opts));
  return analise.porPlaca
    .filter((p) => p.chave !== '—')
    .map((p) => {
      const ref = referenciaTonViagemGrupo(p, analise, mediasTipo);
      const pct = ref.media > 0 ? (p.tonMediaViagem / ref.media) * 100 : 100;
      const tipo = ref.tipo || normalizarTipoCaminhaoPeso(p.tipoCaminhao);
      const limiteKg = limitePesoParaTipo(tipo, limites);
      const pesoIdealKg = tipo && ideais[tipo] > 0 ? ideais[tipo] : null;
      const { status, pctContrato, pctIdeal } = statusVsContratoETipo({
        tonMediaViagem: p.tonMediaViagem,
        pctMediaTipo: pct,
        tipo,
        limiteKg,
        pesoIdealKg,
      });
      return {
        ...p,
        tonHora: p.horas > 0 ? p.toneladas / p.horas : 0,
        pctMediaTonViag: pct,
        status,
        ehReserva: ehPlacaReserva(p.chave, placasReserva),
        mediaRefTonViag: ref.media,
        mediaRefLabel: ref.label,
        limiteContratoKg: limiteKg,
        pctContrato,
        pesoIdealKg,
        pctIdeal,
      };
    })
    .sort((a, b) => {
      const ordem = { ruim: 0, medio: 1, bom: 2 };
      return ordem[a.status] - ordem[b.status] || a.pctMediaTonViag - b.pctMediaTonViag;
    });
}

export function contarCaminhoesUnicos(registros: Record<string, unknown>[]): number {
  const validos = registros.filter((r) => r._validoDashboard !== false);
  const fonte = validos.length > 0 ? validos : registros;
  if (!fonte.length) return 0;

  const cols = detectarColunasCardViagem(fonte);
  const placas = new Set<string>();

  for (const reg of fonte) {
    const m = extrairMetricasCardViagem(reg, cols);
    const placa = normalizarPlaca(m.placa);
    if (placa) placas.add(placa);
  }

  return placas.size;
}

export function analisarOperacaoDia(registros: Record<string, unknown>[]): OperacaoDiaAnalise {
  const validos = registros.filter((r) => r._validoDashboard !== false);
  const fonte = validos.length > 0 ? validos : registros;

  if (!fonte.length) {
    return {
      resumo: { ...resumoVazio },
      porPlaca: [],
      porTurno: [],
      porRegional: [],
      porMotorista: [],
      porTipoCaminhao: [],
      porDistrito: [],
      registrosConsiderados: 0,
    };
  }

  const cols = detectarColunasCardViagem(fonte);
  const chaves = Object.keys(fonte[0] || {});
  const colTipo = detectarColTipo(chaves);
  const colNroColetores = detectarColNroColetores(chaves);

  const mapPlaca = new Map<string, GrupoAcc>();
  const mapTurno = new Map<string, GrupoAcc>();
  const mapRegional = new Map<string, GrupoAcc>();
  const mapMotorista = new Map<string, GrupoAcc>();
  const mapTipo = new Map<string, GrupoAcc>();
  const mapDistrito = new Map<string, GrupoAcc>();

  const placas = new Set<string>();
  const motoristas = new Set<string>();
  let coletoresEquipe = 0;
  let viagens = 0;
  let toneladas = 0;
  let km = 0;
  let horas = 0;

  for (const reg of fonte) {
    const m = extrairMetricasCardViagem(reg, cols);
    const vg = contarViagensPorRotaRegistro(reg as Record<string, unknown>) || Math.max(m.viagens, 1);

    viagens += vg;
    toneladas += m.toneladas;
    km += m.kmFinal;
    horas += m.horasTrabalhadas;

    if (m.placa && m.placa !== '—') {
      const placaNorm = normalizarPlaca(m.placa);
      if (placaNorm) placas.add(placaNorm);
    }
    if (m.motorista && m.motorista !== '—') motoristas.add(m.motorista);

    if (colNroColetores) {
      const n = Number(obterValorRegistro(reg, colNroColetores)) || 0;
      if (n > 0) coletoresEquipe += n;
    }

    const tipoRaw = colTipo ? String(obterValorRegistro(reg, colTipo) || '').trim() : '';
    addGrupo(mapPlaca, m.placa, reg as Record<string, unknown>, m, tipoRaw);
    addGrupo(mapTurno, m.turno, reg as Record<string, unknown>, m, tipoRaw);
    addGrupo(mapRegional, m.regional, reg as Record<string, unknown>, m, tipoRaw);
    addGrupo(mapMotorista, m.motorista, reg as Record<string, unknown>, m, tipoRaw);
    addGrupo(mapTipo, tipoRaw || 'Não informado', reg as Record<string, unknown>, m, tipoRaw);
    addGrupo(mapDistrito, m.distrito, reg as Record<string, unknown>, m, tipoRaw);
  }

  const resumo: OperacaoDiaResumo = {
    registros: fonte.length,
    viagens,
    toneladas: Math.round(toneladas * 1000) / 1000,
    km: Math.round(km * 100) / 100,
    horas: Math.round(horas * 100) / 100,
    caminhoes: placas.size,
    coletores: placas.size,
    motoristas: motoristas.size,
    coletoresEquipe,
    tonMediaColeta: viagens > 0 ? Math.round((toneladas / viagens) * 1000) / 1000 : 0,
    kmMedioViagem: viagens > 0 ? Math.round((km / viagens) * 100) / 100 : 0,
    tonKm: km > 0 ? Math.round((toneladas / km) * 10000) / 10000 : 0,
    prodColetor: placas.size > 0 ? Math.round((toneladas / placas.size) * 1000) / 1000 : 0,
  };

  return {
    resumo,
    porPlaca: ordenar([...mapPlaca.values()].map(finalizarGrupo).filter((g) => g.chave !== '—')),
    porTurno: ordenar([...mapTurno.values()].map(finalizarGrupo).filter((g) => g.chave !== '—')),
    porRegional: ordenar([...mapRegional.values()].map(finalizarGrupo).filter((g) => g.chave !== '—')),
    porMotorista: ordenar([...mapMotorista.values()].map(finalizarGrupo).filter((g) => g.chave !== '—')),
    porTipoCaminhao: ordenar([...mapTipo.values()].map(finalizarGrupo)),
    porDistrito: ordenar([...mapDistrito.values()].map(finalizarGrupo).filter((g) => g.chave !== '—')),
    registrosConsiderados: fonte.length,
  };
}
