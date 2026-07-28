/**
 * Saúde operacional — caminhões com hodômetro quebrado / KM não informado.
 *
 * Critérios (alinhados ao relatório de saúde do upload):
 * 1. Alerta `_alertaKmHodometro` gravado na importação
 * 2. Reanálise das leituras de hodômetro (saída base = chegada base, quebra, salto)
 * 3. Fallback: KM zerado/ausente com peso válido
 */
import { normalizarPlaca } from './normalizarPlaca';
import { contarViagensPorRotaRegistro } from './viagensPorRota';
import { normalizarDataParaIso } from './normalizarDataIso';

const MAX_KM_VIAGEM = 300;
const MIN_HODOMETRO_ABSOLUTO = 1000;

export interface LinhaHodometroQuebrado {
  placa: string;
  motorista: string;
  tipoCaminhao: string;
  viagens: number;
  registros: number;
  pesoTotalKg: number;
  datas: string[];
  alerta: string;
}

/** Uma viagem/linha com correção automática de hodômetro (detalhe para reunião). */
export interface ViagemHodometroCorrigida {
  data: string | null;
  placa: string;
  motorista: string;
  tipoCaminhao: string;
  rota: string;
  viagens: number;
  pesoKg: number;
  kmTotal: number;
  /** Texto no padrão do relatório de saúde: "Corrigido automaticamente: …" */
  motivo: string;
  corrigidaAutomaticamente: boolean;
}

export interface RelatorioHodometroSaude {
  totalRegistrosPeriodo: number;
  totalViagensPeriodo: number;
  viagensComHodometroQuebrado: number;
  registrosComHodometroQuebrado: number;
  caminhoesComHodometroQuebrado: number;
  /** Registros com correção automática (alerta ou hodômetro inconsistente detectado). */
  registrosCorrigidosAutomaticamente: number;
  pctViagensAfetadas: number;
  placas: LinhaHodometroQuebrado[];
  /** Detalhe viagem a viagem — igual ao relatório de saúde. */
  viagensCorrigidas: ViagemHodometroCorrigida[];
}

function registroUnificado(reg: Record<string, unknown>): Record<string, unknown> {
  const raw: Record<string, unknown> = { ...reg };
  const dados = reg.dados;
  if (dados && typeof dados === 'object' && !Array.isArray(dados)) {
    for (const [k, v] of Object.entries(dados as Record<string, unknown>)) {
      if (v !== null && v !== undefined && v !== '') raw[k] = v;
    }
  }
  return raw;
}

function normalizarChave(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
}

function lerCampo(raw: Record<string, unknown>, ...aliases: string[]): unknown {
  for (const alias of aliases) {
    const alvo = normalizarChave(alias);
    for (const [k, v] of Object.entries(raw)) {
      if (v === null || v === undefined || v === '') continue;
      if (normalizarChave(k) === alvo) return v;
    }
  }
  return undefined;
}

function paraNumero(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v).trim().replace(/\s/g, '');
  if (!s) return 0;
  if (/^-?\d+([.,]\d+)?$/.test(s) && !s.includes(',') && (s.match(/\./g) || []).length <= 1) {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  // pt-BR: 8.000,50
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Lê KM absoluto de hodômetro (ignora 0 / vazio). */
function lerKmAbsoluto(raw: Record<string, unknown>, ...aliases: string[]): number {
  const v = lerCampo(raw, ...aliases);
  const n = paraNumero(v);
  return n > 0 ? n : NaN;
}

export function obterAlertaHodometro(reg: Record<string, unknown>): string | null {
  const direto = reg._alertaKmHodometro;
  if (direto != null && String(direto).trim()) return String(direto).trim();
  const dados = reg.dados;
  if (dados && typeof dados === 'object' && !Array.isArray(dados)) {
    const nested = (dados as Record<string, unknown>)._alertaKmHodometro;
    if (nested != null && String(nested).trim()) return String(nested).trim();
  }
  return null;
}

/**
 * Reanalisa hodômetro nas colunas brutas (mesmo critério do backend):
 * saída base = chegada base, chegada < saída, salto absurdo.
 */
export function detectarProblemaHodometroLocal(reg: Record<string, unknown>): string | null {
  const raw = registroUnificado(reg);

  const kmSaidaBase = lerKmAbsoluto(
    raw,
    'KM SAIDA BASE',
    'KM SAÍDA BASE',
    'KM SAIDA',
    'KM SAÍDA',
  );
  const kmChegadaBase = lerKmAbsoluto(raw, 'KM CHEGADA BASE', 'KM CHEGADA');

  type Ponto = { label: string; km: number };
  const pontos: Ponto[] = [];
  if (!isNaN(kmSaidaBase)) pontos.push({ label: 'Saída base', km: kmSaidaBase });

  for (let i = 1; i <= 4; i++) {
    const chegada = lerKmAbsoluto(raw, `KM CHEGADA ROTA 0${i}`, `KM CHEGADA ROTA ${i}`);
    const saida = lerKmAbsoluto(
      raw,
      `KM SAIDA ROTA 0${i}`,
      `KM SAÍDA ROTA 0${i}`,
      `KM SAIDA ROTA ${i}`,
      `KM SAÍDA ROTA ${i}`,
    );
    if (!isNaN(chegada)) pontos.push({ label: `Chegada Rota 0${i}`, km: chegada });
    if (!isNaN(saida)) pontos.push({ label: `Saída Rota 0${i}`, km: saida });
  }

  if (!isNaN(kmChegadaBase)) pontos.push({ label: 'Chegada base', km: kmChegadaBase });

  for (let i = 1; i < pontos.length; i++) {
    const a = pontos[i - 1];
    const b = pontos[i];
    if (b.km < a.km) {
      return `Hodômetro quebrado/reiniciado em ${a.label} → ${b.label}: chegada (${b.km}) < saída (${a.km})`;
    }
    const diff = b.km - a.km;
    if (diff > MAX_KM_VIAGEM && a.km >= MIN_HODOMETRO_ABSOLUTO) {
      return `Salto de hodômetro absurdo em ${a.label} → ${b.label}: ${Math.round(diff)} km (máx. ${MAX_KM_VIAGEM} km)`;
    }
  }

  if (
    !isNaN(kmSaidaBase)
    && !isNaN(kmChegadaBase)
    && kmSaidaBase >= MIN_HODOMETRO_ABSOLUTO
    && kmChegadaBase >= MIN_HODOMETRO_ABSOLUTO
    && kmSaidaBase === kmChegadaBase
  ) {
    return `Hodômetro parado/igual na viagem: saída base = chegada base (${kmSaidaBase})`;
  }

  return null;
}

/**
 * Mesmo padrão do relatório de saúde no upload:
 * "Corrigido automaticamente: KM zerado por hodômetro inconsistente (…)."
 */
export function formatarMotivoCorrecaoHodometro(alerta: string | null): string {
  const fallback = 'KM zerado — peso/viagens mantidos.';
  const base = (alerta && alerta.trim()) || fallback;
  if (/^corrigido automaticamente\s*:/i.test(base)) return base;
  if (/^km zerado por hodômetro/i.test(base) || /^hodômetro /i.test(base)) {
    return `Corrigido automaticamente: ${base.startsWith('KM zerado') ? base : `KM zerado por hodômetro inconsistente (${base}). Peso/viagens mantidos.`}`;
  }
  return `Corrigido automaticamente: ${base}`;
}

/** Preferir kmTotal tipado (inclui 0 tratado); só cai na coluna se o campo tipado não existir. */
function obterKmRegistro(reg: Record<string, unknown>, raw: Record<string, unknown>): number {
  if (Object.prototype.hasOwnProperty.call(reg, 'kmTotal')
    && reg.kmTotal !== null
    && reg.kmTotal !== undefined
    && reg.kmTotal !== '') {
    return paraNumero(reg.kmTotal);
  }
  return paraNumero(lerCampo(raw, 'KM TOTAL', 'KMTOTAL'));
}

function obterPesoRegistro(reg: Record<string, unknown>, raw: Record<string, unknown>): number {
  if (Object.prototype.hasOwnProperty.call(reg, 'pesoTotal')
    && reg.pesoTotal !== null
    && reg.pesoTotal !== undefined
    && reg.pesoTotal !== '') {
    return paraNumero(reg.pesoTotal);
  }
  return paraNumero(lerCampo(raw, 'PESO TOTAL', 'PESOTOTAL'));
}

/** Motivo efetivo da correção (alerta gravado ou reanálise local). */
export function obterMotivoHodometro(reg: Record<string, unknown>): string | null {
  const alerta = obterAlertaHodometro(reg);
  if (alerta) return alerta;
  const local = detectarProblemaHodometroLocal(reg);
  if (local) {
    return `KM zerado por hodômetro inconsistente (${local}). Peso/viagens mantidos.`;
  }
  return null;
}

/** Viagem tratada na saúde: alerta, hodômetro inconsistente nas colunas, ou KM zerado com peso. */
export function registroComHodometroQuebrado(reg: Record<string, unknown>): boolean {
  if (obterMotivoHodometro(reg)) return true;
  const raw = registroUnificado(reg);
  const km = obterKmRegistro(reg, raw);
  const peso = obterPesoRegistro(reg, raw);
  return km <= 0 && peso > 0;
}

function obterPlaca(reg: Record<string, unknown>): string {
  const raw = registroUnificado(reg);
  const p = reg.placa ?? lerCampo(raw, 'PLACA');
  return normalizarPlaca(String(p ?? '')) || 'SEM PLACA';
}

function obterMotorista(reg: Record<string, unknown>): string {
  const raw = registroUnificado(reg);
  const m = reg.motorista ?? lerCampo(raw, 'MOTORISTA', 'OPERADOR');
  const s = String(m ?? '').trim();
  return s || '—';
}

function obterTipo(reg: Record<string, unknown>): string {
  const raw = registroUnificado(reg);
  const t = reg.tipoCaminhao ?? lerCampo(raw, 'TIPO DE CAMINHÃO', 'TIPO DE CAMINHAO', 'TIPO CAMINHAO');
  const s = String(t ?? '').trim().toUpperCase();
  return s || '—';
}

function obterDataIso(reg: Record<string, unknown>): string | null {
  const raw = registroUnificado(reg);
  const d = reg.dataSaida ?? lerCampo(raw, 'DATA SAIDA', 'DATA SAÍDA', 'DATA');
  return normalizarDataParaIso(d);
}

function obterRota(reg: Record<string, unknown>): string {
  const raw = registroUnificado(reg);
  const r = reg.rota ?? lerCampo(raw, 'ROTA', 'ROTA 01', 'DESCRICAO ROTA');
  const s = String(r ?? '').trim();
  return s || '—';
}

/**
 * Agrega caminhões (placas) com hodômetro quebrado / KM não informado no período
 * e lista cada viagem com o motivo da correção automática.
 */
export function analisarHodometroSaude(
  dados: Record<string, unknown>[],
): RelatorioHodometroSaude {
  let totalViagensPeriodo = 0;
  let viagensComHodometroQuebrado = 0;
  let registrosComHodometroQuebrado = 0;
  let registrosCorrigidosAutomaticamente = 0;

  const porPlaca = new Map<string, {
    motorista: string;
    tipoCaminhao: string;
    viagens: number;
    registros: number;
    pesoTotalKg: number;
    datas: Set<string>;
    alerta: string;
  }>();

  const viagensCorrigidas: ViagemHodometroCorrigida[] = [];

  for (const reg of dados) {
    const vg = contarViagensPorRotaRegistro(reg) || 1;
    totalViagensPeriodo += vg;

    if (!registroComHodometroQuebrado(reg)) continue;

    registrosComHodometroQuebrado++;
    viagensComHodometroQuebrado += vg;

    const placa = obterPlaca(reg);
    const raw = registroUnificado(reg);
    const peso = obterPesoRegistro(reg, raw);
    const km = obterKmRegistro(reg, raw);
    const dataIso = obterDataIso(reg);
    const motivoRaw = obterMotivoHodometro(reg)
      || 'KM não informado / hodômetro inconsistente (saúde dos dados). Peso/viagens mantidos.';
    const corrigidaAutomaticamente = Boolean(obterAlertaHodometro(reg) || detectarProblemaHodometroLocal(reg));
    if (corrigidaAutomaticamente) registrosCorrigidosAutomaticamente++;

    const motivo = formatarMotivoCorrecaoHodometro(motivoRaw);

    viagensCorrigidas.push({
      data: dataIso,
      placa,
      motorista: obterMotorista(reg),
      tipoCaminhao: obterTipo(reg),
      rota: obterRota(reg),
      viagens: vg,
      pesoKg: Math.round(peso * 100) / 100,
      kmTotal: km,
      motivo,
      corrigidaAutomaticamente,
    });

    const atual = porPlaca.get(placa);
    if (!atual) {
      porPlaca.set(placa, {
        motorista: obterMotorista(reg),
        tipoCaminhao: obterTipo(reg),
        viagens: vg,
        registros: 1,
        pesoTotalKg: peso,
        datas: new Set(dataIso ? [dataIso] : []),
        alerta: motivo,
      });
    } else {
      atual.viagens += vg;
      atual.registros += 1;
      atual.pesoTotalKg += peso;
      if (dataIso) atual.datas.add(dataIso);
      if (atual.motorista === '—') atual.motorista = obterMotorista(reg);
      if (atual.tipoCaminhao === '—') atual.tipoCaminhao = obterTipo(reg);
      if (corrigidaAutomaticamente && !/hodômetro inconsistente/i.test(atual.alerta)) {
        atual.alerta = motivo;
      }
    }
  }

  viagensCorrigidas.sort((a, b) => {
    const da = a.data || '';
    const db = b.data || '';
    if (da !== db) return da.localeCompare(db);
    return a.placa.localeCompare(b.placa);
  });

  const placas: LinhaHodometroQuebrado[] = [...porPlaca.entries()]
    .map(([placa, v]) => ({
      placa,
      motorista: v.motorista,
      tipoCaminhao: v.tipoCaminhao,
      viagens: v.viagens,
      registros: v.registros,
      pesoTotalKg: Math.round(v.pesoTotalKg * 100) / 100,
      datas: [...v.datas].sort(),
      alerta: v.alerta,
    }))
    .sort((a, b) => b.viagens - a.viagens || a.placa.localeCompare(b.placa));

  return {
    totalRegistrosPeriodo: dados.length,
    totalViagensPeriodo,
    viagensComHodometroQuebrado,
    registrosComHodometroQuebrado,
    caminhoesComHodometroQuebrado: placas.length,
    registrosCorrigidosAutomaticamente,
    pctViagensAfetadas: totalViagensPeriodo > 0
      ? Math.round((viagensComHodometroQuebrado / totalViagensPeriodo) * 1000) / 10
      : 0,
    placas,
    viagensCorrigidas,
  };
}
