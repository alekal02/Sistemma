/**
 * Viagem = PESO 1–4 preenchido (mesma granularidade do ranking Mini).
 * Hora produtiva da viagem: trecho da rota quando a quantidade bate;
 * senão, rateio da jornada produtiva da linha.
 */
import {
  calcularHorasPorTrechoRota,
  calcularHorasProdutivaImprodutivaRegistro,
} from './horasProdutivasService';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Rateia o total para n partes (último recebe o resto, para a soma fechar). */
export function ratearHoras(total: number, n: number): number[] {
  if (!(n > 0) || !(total > 0)) return Array.from({ length: Math.max(0, n) }, () => 0);
  const base = round2(total / n);
  const parts = Array.from({ length: n }, () => base);
  const somaExcetoUltimo = round2(base * (n - 1));
  parts[n - 1] = round2(total - somaExcetoUltimo);
  return parts;
}

export type OrigemHoraViagem = 'trecho' | 'rateio';

export interface ViagemPesoRotaItem {
  data: string | null;
  rota: string;
  placa: string;
  motorista: string;
  tipo: string | null;
  nViagem: number;
  pesoKg: number;
  pesoIdealKg: number | null;
  pctIdeal: number | null;
  encheu: boolean;
  horasProdutivasViagem: number;
  horasProdutivasRota: number;
  origemHora: OrigemHoraViagem;
  /** Só quando ainda não encheu: h da viagem × (ideal / peso). */
  tempoEqEncher: number | null;
  estimado: boolean;
}

export interface GrupoViagemPesoRota {
  chave: string;
  data: string | null;
  rota: string;
  placa: string;
  motorista: string;
  tipo: string | null;
  horasProdutivasRota: number;
  origemHora: OrigemHoraViagem;
  viagens: ViagemPesoRotaItem[];
}

export function montarViagensPesoDoRegistro(opts: {
  data?: string | null;
  rota: string;
  placa: string;
  motorista: string;
  tipo: string | null;
  pesos: Array<number | null | undefined>;
  objHoras: Record<string, any>;
  pesoIdealKg: number | null;
}): ViagemPesoRotaItem[] {
  const pesos = (opts.pesos || [])
    .map((kg, i) => ({ nViagem: i + 1, pesoKg: Number(kg) }))
    .filter((p) => Number.isFinite(p.pesoKg) && p.pesoKg > 0);
  if (!pesos.length) return [];

  const horasRota = calcularHorasProdutivaImprodutivaRegistro(opts.objHoras).horasProdutivas;
  const trechosPos = calcularHorasPorTrechoRota(opts.objHoras).filter((h) => h > 0);

  let horasList: number[];
  let origem: OrigemHoraViagem;
  if (trechosPos.length === pesos.length) {
    horasList = trechosPos.map((h) => round2(h));
    origem = 'trecho';
  } else if (horasRota > 0) {
    horasList = ratearHoras(horasRota, pesos.length);
    origem = 'rateio';
  } else {
    horasList = pesos.map(() => 0);
    origem = 'rateio';
  }

  const ideal = opts.pesoIdealKg != null && opts.pesoIdealKg > 0 ? round2(opts.pesoIdealKg) : null;

  return pesos.map((p, i) => {
    const h = horasList[i] || 0;
    const pctIdeal = ideal ? round2((p.pesoKg / ideal) * 100) : null;
    const encheu = ideal != null && p.pesoKg >= ideal;
    let tempoEqEncher: number | null = null;
    if (!encheu && ideal && p.pesoKg > 0 && h > 0) {
      tempoEqEncher = round2(h * (ideal / p.pesoKg));
    }
    return {
      data: opts.data || null,
      rota: opts.rota,
      placa: opts.placa,
      motorista: opts.motorista,
      tipo: opts.tipo,
      nViagem: p.nViagem,
      pesoKg: round2(p.pesoKg),
      pesoIdealKg: ideal,
      pctIdeal,
      encheu,
      horasProdutivasViagem: h,
      horasProdutivasRota: horasRota,
      origemHora: origem,
      tempoEqEncher,
      estimado: !encheu && tempoEqEncher != null,
    };
  });
}

export function agruparViagensPesoPorLinha(itens: ViagemPesoRotaItem[]): GrupoViagemPesoRota[] {
  const mapa = new Map<string, GrupoViagemPesoRota>();
  for (const it of itens) {
    const chave = `${it.data || ''}\0${it.rota}\0${it.placa}\0${it.motorista}`;
    let g = mapa.get(chave);
    if (!g) {
      g = {
        chave,
        data: it.data,
        rota: it.rota,
        placa: it.placa,
        motorista: it.motorista,
        tipo: it.tipo,
        horasProdutivasRota: 0,
        origemHora: it.origemHora,
        viagens: [],
      };
      mapa.set(chave, g);
    }
    g.viagens.push(it);
  }
  const grupos = Array.from(mapa.values());
  for (const g of grupos) {
    g.viagens.sort((a, b) => a.nViagem - b.nViagem);
    g.horasProdutivasRota = round2(
      g.viagens.reduce((s, v) => s + (v.horasProdutivasViagem || 0), 0),
    );
  }
  grupos.sort((a, b) =>
    (a.data || '').localeCompare(b.data || '')
    || a.rota.localeCompare(b.rota, 'pt-BR')
    || a.placa.localeCompare(b.placa, 'pt-BR')
    || a.motorista.localeCompare(b.motorista, 'pt-BR'));
  return grupos;
}
