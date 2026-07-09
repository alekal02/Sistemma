/**
 * Estudo de rotas do dia — métricas e gargalos a partir das colunas da planilha.
 * Cada linha = 1 rota; CONTADOR DE VIAGENS / PESO 1–4 = viagens dentro da rota.
 */
import {
  detectarColunasCardViagem,
  extrairMetricasCardViagem,
  obterValorRegistro,
  paraNumero,
} from './viagemCardDados';
import { contarViagensPorRotaRegistro } from './viagensPorRota';
import { fmtNum } from './relatorioDiario';
import { normalizarPlaca } from './normalizarPlaca';

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
  pctTonDia: number;
  pctMediaTonViag: number;
  status: 'bom' | 'medio' | 'ruim';
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
  rotas: LinhaEstudoRota[];
  gargalos: GargaloRota[];
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

function extrairPesosViagemKg(reg: Record<string, unknown>): number[] {
  const pesos: number[] = [];
  for (let i = 1; i <= 4; i++) {
    const n = paraNumero(encontrarValor(reg, `PESO ${i}`) ?? reg[`peso${i}`]);
    if (n > 0) pesos.push(n);
  }
  if (pesos.length > 0) return pesos;

  const total = paraNumero(
    obterValorRegistro(reg, undefined, 'pesoTotal') ?? encontrarValor(reg, 'PESO TOTAL'),
  );
  const vg = contarViagensPorRotaRegistro(reg);
  if (total > 0 && vg > 0) {
    return Array(vg).fill(total / vg);
  }
  if (total > 0) return [total];
  return [];
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

  // Fallback: colunas já detectadas no card de viagem
  if (!melhor) {
    const cols = detectarColunasCardViagem(dados);
    if (cols.colDistrito) return cols.colDistrito;
    if (cols.colRegional) return cols.colRegional;
  }
  return melhor;
}

function statusVsMedia(pct: number): 'bom' | 'medio' | 'ruim' {
  if (pct >= 90) return 'bom';
  if (pct >= 75) return 'medio';
  return 'ruim';
}

function nomeRotaRegistro(reg: Record<string, unknown>, colRota: string): string {
  if (!colRota) return '';
  const v = String(encontrarValor(reg, colRota) || '').trim();
  if (!v || IGNORADOS.has(v.toUpperCase()) || /^\d{5,}$/.test(v)) return '';
  return v;
}

export function analisarEstudoRotasDia(registros: Record<string, unknown>[]): EstudoRotasDia | null {
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
  };

  const map = new Map<string, Acc>();
  let totalTon = 0;
  let totalVg = 0;
  let totalKm = 0;
  let totalHoras = 0;

  for (const reg of fonte) {
    const rota = nomeRotaRegistro(reg, colunaRota);
    if (!rota) continue;

    const m = extrairMetricasCardViagem(reg, cols);
    const vg = contarViagensPorRotaRegistro(reg) || Math.max(m.viagens, 1);
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
      });
    }
    const g = map.get(rota)!;
    g.registros += 1;
    g.viagens += vg;
    g.toneladas += m.toneladas;
    g.km += m.kmFinal;
    g.horas += m.horasTrabalhadas;
    g.pesos.push(...extrairPesosViagemKg(reg));

    const placa = normalizarPlaca(m.placa);
    if (placa) g.placas.add(placa);
    if (m.motorista && m.motorista !== '—') g.motoristas.add(m.motorista);
    if (m.turno && m.turno !== '—') g.turnos.add(m.turno);

    totalTon += m.toneladas;
    totalVg += vg;
    totalKm += m.kmFinal;
    totalHoras += m.horasTrabalhadas;
  }

  if (map.size === 0) return null;

  const tonMediaDia = totalVg > 0 ? totalTon / totalVg : 0;
  const kmMediaDia = totalVg > 0 ? totalKm / totalVg : 0;
  const tonHoraDia = totalHoras > 0 ? totalTon / totalHoras : 0;

  const rotas: LinhaEstudoRota[] = [...map.entries()]
    .map(([rota, g]) => {
      const tonMediaViagem = g.viagens > 0 ? g.toneladas / g.viagens : 0;
      const kmMedioViagem = g.viagens > 0 ? g.km / g.viagens : 0;
      const tonHora = g.horas > 0 ? g.toneladas / g.horas : 0;
      const pct = tonMediaDia > 0 ? (tonMediaViagem / tonMediaDia) * 100 : 100;
      const pesosOk = g.pesos.filter((p) => p > 0);
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
        pctTonDia: totalTon > 0 ? (g.toneladas / totalTon) * 100 : 0,
        pctMediaTonViag: pct,
        status: statusVsMedia(pct),
      };
    })
    .sort((a, b) => b.toneladas - a.toneladas || b.viagens - a.viagens);

  const gargalos: GargaloRota[] = [];

  for (const r of rotas) {
    if (r.viagens >= 1 && tonMediaDia > 0 && r.tonMediaViagem < tonMediaDia * 0.75) {
      gargalos.push({
        severidade: r.tonMediaViagem < tonMediaDia * 0.6 ? 'critico' : 'atencao',
        rota: r.rota,
        titulo: 'Rendimento abaixo da média do dia',
        texto: `${fmtNum(r.tonMediaViagem, 2)} t/viagem vs média ${fmtNum(tonMediaDia, 2)} t (${fmtNum(r.pctMediaTonViag, 0)}% da média) em ${fmtNum(r.viagens, 0)} viagem(ns).`,
      });
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

  if (gargalos.length === 0 && rotas.length > 0) {
    gargalos.push({
      severidade: 'info',
      rota: '—',
      titulo: 'Rotas dentro dos parâmetros',
      texto: `Nenhum gargalo crítico. Média do dia: ${fmtNum(tonMediaDia, 2)} t/viagem · ${fmtNum(kmMediaDia, 1)} km/viagem em ${rotas.length} rota(s).`,
    });
  }

  // Prioriza críticos, depois atenção; no máximo 10
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
    rotas,
    gargalos: gargalos.slice(0, 10),
    destaques: {
      maiorVolume: comViagem[0] || null,
      menorRendimento: comViagem.length
        ? [...comViagem].sort((a, b) => a.tonMediaViagem - b.tonMediaViagem)[0]
        : null,
      maiorKm: comViagem.length
        ? [...comViagem].sort((a, b) => b.kmMedioViagem - a.kmMedioViagem)[0]
        : null,
      menorPesoViagem: menorPeso,
      maiorPesoViagem: maiorPeso,
    },
  };
}
