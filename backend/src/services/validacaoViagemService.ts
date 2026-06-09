import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { Repository } from 'typeorm';
import AppDataSource from '../database/data-source';
import { ColetaData } from '../entities/ColetaData';
import { PlanilhaUpload } from '../entities/PlanilhaUpload';

export interface ResultadoValidacaoViagem {
  validoDashboard: boolean;
  motivos: string[];
  kmEfetivo: number | null;
  pesoEfetivo: number | null;
}

const CAMPOS_KM = ['kmTotal', 'kmSaida', 'kmChegada', 'kmRota1', 'kmRota2', 'kmRota3', 'kmRota4'] as const;
const CAMPOS_PESO = ['pesoTotal', 'peso1', 'peso2', 'peso3', 'peso4', 'peso5'] as const;

function normalizarChave(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
}

function somaPositiva(valores: (number | null | undefined)[]): number {
  let total = 0;
  for (const v of valores) {
    const n = Number(v);
    if (!isNaN(n) && n > 0) total += n;
  }
  return total;
}

/**
 * Remove valores negativos que distorcem KPIs (fórmulas Excel com erro).
 */
export function sanitizarViagem(coleta: ColetaData): boolean {
  let limpou = false;

  for (const campo of CAMPOS_KM) {
    const valor = coleta[campo];
    if (valor !== null && valor !== undefined && valor < 0) {
      (coleta as any)[campo] = null;
      limpou = true;
    }
  }

  for (const campo of CAMPOS_PESO) {
    const valor = coleta[campo];
    if (valor !== null && valor !== undefined && valor < 0) {
      (coleta as any)[campo] = null;
      limpou = true;
    }
  }

  if (coleta.numeroViagens !== null && coleta.numeroViagens !== undefined && coleta.numeroViagens < 0) {
    coleta.numeroViagens = null;
    limpou = true;
  }

  if (coleta.horasForaUnidade !== null && coleta.horasForaUnidade !== undefined && coleta.horasForaUnidade < 0) {
    coleta.horasForaUnidade = null;
    limpou = true;
  }

  if (coleta.tempoForaUnidade !== null && coleta.tempoForaUnidade !== undefined && coleta.tempoForaUnidade < 0) {
    coleta.tempoForaUnidade = null;
    limpou = true;
  }

  return limpou;
}

function calcularPesoEfetivo(coleta: Partial<ColetaData>): number | null {
  if (coleta.pesoTotal !== null && coleta.pesoTotal !== undefined && coleta.pesoTotal > 0) {
    return coleta.pesoTotal;
  }
  const soma = somaPositiva([coleta.peso1, coleta.peso2, coleta.peso3, coleta.peso4, coleta.peso5]);
  return soma > 0 ? soma : null;
}

function calcularKmEfetivo(coleta: Partial<ColetaData>): number | null {
  if (coleta.kmTotal !== null && coleta.kmTotal !== undefined && coleta.kmTotal > 0) {
    return coleta.kmTotal;
  }
  if (
    coleta.kmSaida !== null && coleta.kmSaida !== undefined &&
    coleta.kmChegada !== null && coleta.kmChegada !== undefined &&
    coleta.kmChegada >= coleta.kmSaida
  ) {
    const diff = coleta.kmChegada - coleta.kmSaida;
    if (diff > 0) return diff;
  }
  const somaRotas = somaPositiva([coleta.kmRota1, coleta.kmRota2, coleta.kmRota3, coleta.kmRota4]);
  return somaRotas > 0 ? somaRotas : null;
}

function temValorNegativoOriginal(coleta: Partial<ColetaData>): string[] {
  const motivos: string[] = [];
  for (const campo of CAMPOS_KM) {
    const v = coleta[campo];
    if (v !== null && v !== undefined && v < 0) {
      motivos.push(`KM negativo em ${campo}`);
    }
  }
  for (const campo of CAMPOS_PESO) {
    const v = coleta[campo];
    if (v !== null && v !== undefined && v < 0) {
      motivos.push(`Peso negativo em ${campo}`);
    }
  }
  return motivos;
}

function temDadosRota(coleta: Partial<ColetaData>): boolean {
  if (coleta.regional?.trim()) return true;
  if (coleta.distrito?.trim()) return true;

  const kmRotas = somaPositiva([coleta.kmRota1, coleta.kmRota2, coleta.kmRota3, coleta.kmRota4]);
  if (kmRotas > 0) return true;

  if (coleta.dados && typeof coleta.dados === 'object') {
    for (const [chave, valor] of Object.entries(coleta.dados)) {
      if (valor === null || valor === undefined || valor === '') continue;
      const norm = normalizarChave(chave);
      if (
        norm.includes('ROTA') || norm.includes('SETOR') || norm.includes('BAIRRO') ||
        norm.includes('REGIAO') || norm.includes('REGIONAL') || norm.includes('DESTINO')
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Valida se a viagem pode alimentar o dashboard (KM, peso e rota mínimos).
 */
export function validarViagemParaDashboard(coleta: Partial<ColetaData>): ResultadoValidacaoViagem {
  const motivos: string[] = [...temValorNegativoOriginal(coleta)];

  const pesoEfetivo = calcularPesoEfetivo(coleta);
  if (!pesoEfetivo || pesoEfetivo <= 0) {
    if (coleta.pesoTotal !== null && coleta.pesoTotal !== undefined && coleta.pesoTotal <= 0) {
      motivos.push('Peso Total zerado ou negativo (verifique fórmulas da planilha)');
    } else {
      motivos.push('Peso Total ausente');
    }
  }

  const kmEfetivo = calcularKmEfetivo(coleta);
  if (!kmEfetivo || kmEfetivo <= 0) {
    if (coleta.kmTotal !== null && coleta.kmTotal !== undefined && coleta.kmTotal <= 0) {
      motivos.push('KM Total zerado ou negativo (verifique fórmulas da planilha)');
    } else {
      motivos.push('KM Total ausente');
    }
  }

  if (!temDadosRota(coleta)) {
    motivos.push('Dados da rota ausentes (regional, distrito ou rota)');
  }

  const validoDashboard = motivos.length === 0;
  return { validoDashboard, motivos, kmEfetivo, pesoEfetivo };
}

/**
 * Sanitiza e marca validade da viagem para o dashboard.
 */
export function prepararViagemParaImportacao(coleta: ColetaData): ResultadoValidacaoViagem {
  sanitizarViagem(coleta);
  const resultado = validarViagemParaDashboard(coleta);
  coleta.validoDashboard = resultado.validoDashboard;
  coleta.motivosInconsistencia = resultado.motivos.length > 0 ? resultado.motivos : null;
  return resultado;
}

export function aplicarFiltroViagensValidasDashboard<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias = 'c'
): SelectQueryBuilder<T> {
  return qb.andWhere(`${alias}.validoDashboard = :validoDashboard`, { validoDashboard: true });
}

export interface ResumoInconsistenciasViagem {
  totalViagens: number;
  viagensValidas: number;
  viagensInconsistentes: number;
  percentualValido: number;
  impactoDashboard: string;
  resumoPorMotivo: { motivo: string; quantidade: number }[];
  amostra: {
    id: number;
    data: string | null;
    placa: string | null;
    motorista: string | null;
    kmTotal: number | null;
    pesoTotal: number | null;
    motivos: string[];
  }[];
}

export class ValidacaoViagemService {
  private coletaRepo: Repository<ColetaData>;
  private uploadRepo: Repository<PlanilhaUpload>;

  constructor() {
    this.coletaRepo = AppDataSource.getRepository(ColetaData);
    this.uploadRepo = AppDataSource.getRepository(PlanilhaUpload);
  }

  private async getUploadIdsPorServico(servicoId: string): Promise<number[]> {
    const uploads = await this.uploadRepo.find({
      where: { servico_id: servicoId },
      select: ['id'],
    });
    return uploads.map(u => u.id);
  }

  /**
   * Revalida todas as viagens de um serviço (útil para dados importados antes desta feature).
   */
  async revalidarViagensServico(servicoId: string): Promise<{ atualizadas: number; inconsistentes: number }> {
    const uploadIds = await this.getUploadIdsPorServico(servicoId);
    if (uploadIds.length === 0) return { atualizadas: 0, inconsistentes: 0 };

    const BATCH = 500;
    let offset = 0;
    let atualizadas = 0;
    let inconsistentes = 0;

    while (true) {
      const batch = await this.coletaRepo.createQueryBuilder('c')
        .where('c.planilhaUploadId IN (:...uploadIds)', { uploadIds })
        .orderBy('c.id', 'ASC')
        .skip(offset)
        .take(BATCH)
        .getMany();

      if (batch.length === 0) break;

      for (const coleta of batch) {
        const r = prepararViagemParaImportacao(coleta);
        atualizadas++;
        if (!r.validoDashboard) inconsistentes++;
      }

      await this.coletaRepo.save(batch);
      offset += BATCH;
      if (batch.length < BATCH) break;
    }

    return { atualizadas, inconsistentes };
  }

  async getResumoInconsistencias(servicoId: string, revalidar = true): Promise<ResumoInconsistenciasViagem> {
    if (revalidar) {
      await this.revalidarViagensServico(servicoId);
    }

    const uploadIds = await this.getUploadIdsPorServico(servicoId);
    if (uploadIds.length === 0) {
      return {
        totalViagens: 0,
        viagensValidas: 0,
        viagensInconsistentes: 0,
        percentualValido: 100,
        impactoDashboard: 'Nenhum dado importado.',
        resumoPorMotivo: [],
        amostra: [],
      };
    }

    const totalViagens = await this.coletaRepo.createQueryBuilder('c')
      .where('c.planilhaUploadId IN (:...uploadIds)', { uploadIds })
      .getCount();

    const viagensInconsistentes = await this.coletaRepo.createQueryBuilder('c')
      .where('c.planilhaUploadId IN (:...uploadIds)', { uploadIds })
      .andWhere('c.validoDashboard = :valido', { valido: false })
      .getCount();

    const viagensValidas = totalViagens - viagensInconsistentes;
    const percentualValido = totalViagens > 0
      ? Math.round((viagensValidas / totalViagens) * 1000) / 10
      : 100;

    const inconsistentes = await this.coletaRepo.createQueryBuilder('c')
      .where('c.planilhaUploadId IN (:...uploadIds)', { uploadIds })
      .andWhere('c.validoDashboard = :valido', { valido: false })
      .orderBy('c.dataSaida', 'DESC')
      .take(100)
      .getMany();

    const contagemMotivos = new Map<string, number>();
    for (const v of inconsistentes) {
      for (const m of v.motivosInconsistencia || []) {
        contagemMotivos.set(m, (contagemMotivos.get(m) || 0) + 1);
      }
    }

    const resumoPorMotivo = Array.from(contagemMotivos.entries())
      .map(([motivo, quantidade]) => ({ motivo, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade);

    const impactoDashboard = viagensInconsistentes > 0
      ? `${viagensInconsistentes} viagem(ns) com dados incompletos ou inconsistentes foram excluídas dos cálculos do dashboard. Corrija a planilha e reimporte para incluir esses valores.`
      : 'Todas as viagens importadas estão válidas para o dashboard.';

    return {
      totalViagens,
      viagensValidas,
      viagensInconsistentes,
      percentualValido,
      impactoDashboard,
      resumoPorMotivo,
      amostra: inconsistentes.slice(0, 20).map(v => ({
        id: v.id,
        data: v.dataSaida ? v.dataSaida.toISOString().slice(0, 10) : null,
        placa: v.placa,
        motorista: v.motorista,
        kmTotal: v.kmTotal,
        pesoTotal: v.pesoTotal,
        motivos: v.motivosInconsistencia || [],
      })),
    };
  }
}

export default new ValidacaoViagemService();
