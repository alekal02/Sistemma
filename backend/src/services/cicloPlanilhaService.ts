import AppDataSource from '../database/data-source';
import { PlanilhaUpload } from '../entities/PlanilhaUpload';
import { ColetaData } from '../entities/ColetaData';
import { Contract } from '../entities/Contract';
import { Servico } from '../entities/Servico';
import {
  calcularCicloMensalContrato,
  inferirCicloReferenciaDeDatas,
  inferirMesReferenciaAtual,
  normalizarDiaInicioCiclo,
  type PeriodoCicloContrato,
} from '../utils/periodoCicloContrato';
import { invalidarCacheDadosServico } from './servicoDadosCache';
import { dashboardCache } from './DashboardCacheManager';
import { agendarWarmupPosUpload } from './executivoCacheWarmupService';

export interface CicloFechadoInfo {
  mesReferencia: number;
  anoReferencia: number;
  dataInicio: string;
  dataFim: string;
  label: string;
  fechadoEm: string;
  uploadIds: number[];
  totalRegistros: number;
}

export interface FiltroUploadsCiclo {
  /** Ciclo específico para consulta histórica */
  mesReferencia?: number;
  anoReferencia?: number;
  /** Apenas uploads ainda abertos (padrão para importação) */
  apenasAbertos?: boolean;
}

async function obterDiaInicioCiclo(servicoId: string): Promise<number> {
  const servicoRepo = AppDataSource.getRepository(Servico);
  const servico = await servicoRepo.findOne({
    where: { id: servicoId },
    relations: ['contract'],
  });
  if (!servico?.contract) return 1;
  return normalizarDiaInicioCiclo(servico.contract.diaInicioCiclo);
}

export async function obterUploadIdsPorServico(
  servicoId: string,
  filtro?: FiltroUploadsCiclo,
): Promise<number[]> {
  const uploadRepo = AppDataSource.getRepository(PlanilhaUpload);
  const qb = uploadRepo.createQueryBuilder('u')
    .select('u.id', 'id')
    .where('u.servico_id = :servicoId', { servicoId });

  if (filtro?.apenasAbertos) {
    qb.andWhere('u.cicloFechadoEm IS NULL');
  }

  if (filtro?.mesReferencia != null && filtro?.anoReferencia != null) {
    qb.andWhere('u.cicloMesReferencia = :mes', { mes: filtro.mesReferencia })
      .andWhere('u.cicloAnoReferencia = :ano', { ano: filtro.anoReferencia });
  }

  const rows = await qb.getRawMany<{ id: number }>();
  return rows.map(r => Number(r.id)).filter(id => Number.isFinite(id));
}

/** Uploads que novas importações podem substituir/apagar */
export async function obterUploadIdsModificaveis(servicoId: string): Promise<number[]> {
  return obterUploadIdsPorServico(servicoId, { apenasAbertos: true });
}

export async function cicloEstaFechado(
  servicoId: string,
  mesReferencia: number,
  anoReferencia: number,
): Promise<boolean> {
  const uploadRepo = AppDataSource.getRepository(PlanilhaUpload);
  const count = await uploadRepo.createQueryBuilder('u')
    .where('u.servico_id = :servicoId', { servicoId })
    .andWhere('u.cicloMesReferencia = :mes', { mes: mesReferencia })
    .andWhere('u.cicloAnoReferencia = :ano', { ano: anoReferencia })
    .andWhere('u.cicloFechadoEm IS NOT NULL')
    .getCount();
  return count > 0;
}

export async function listarCiclosFechados(servicoId: string): Promise<CicloFechadoInfo[]> {
  const uploadRepo = AppDataSource.getRepository(PlanilhaUpload);
  const diaInicio = await obterDiaInicioCiclo(servicoId);

  const uploads = await uploadRepo.find({
    where: { servico_id: servicoId },
    order: { cicloAnoReferencia: 'DESC', cicloMesReferencia: 'DESC', cicloFechadoEm: 'DESC' },
  });

  const fechados = uploads.filter(u => u.cicloFechadoEm != null && u.cicloMesReferencia && u.cicloAnoReferencia);
  const mapa = new Map<string, CicloFechadoInfo>();

  for (const u of fechados) {
    const chave = `${u.cicloAnoReferencia}-${u.cicloMesReferencia}`;
    const periodo = calcularCicloMensalContrato(u.cicloAnoReferencia!, u.cicloMesReferencia!, diaInicio);
    const existente = mapa.get(chave);
    if (!existente) {
      mapa.set(chave, {
        mesReferencia: u.cicloMesReferencia!,
        anoReferencia: u.cicloAnoReferencia!,
        dataInicio: periodo.dataInicio,
        dataFim: periodo.dataFim,
        label: periodo.label,
        fechadoEm: u.cicloFechadoEm!.toISOString(),
        uploadIds: [u.id],
        totalRegistros: 0,
      });
    } else {
      existente.uploadIds.push(u.id);
      if (u.cicloFechadoEm && u.cicloFechadoEm.toISOString() > existente.fechadoEm) {
        existente.fechadoEm = u.cicloFechadoEm.toISOString();
      }
    }
  }

  const coletaRepo = AppDataSource.getRepository(ColetaData);
  for (const info of mapa.values()) {
    if (info.uploadIds.length === 0) continue;
    info.totalRegistros = await coletaRepo.createQueryBuilder('c')
      .where('c.planilhaUploadId IN (:...ids)', { ids: info.uploadIds })
      .getCount();
  }

  return [...mapa.values()].sort((a, b) => {
    if (a.anoReferencia !== b.anoReferencia) return b.anoReferencia - a.anoReferencia;
    return b.mesReferencia - a.mesReferencia;
  });
}

export async function verificarDatasEmCicloFechado(
  servicoId: string,
  datasIso: string[],
): Promise<{ bloqueadas: string[]; ciclos: { mes: number; ano: number; label: string }[] }> {
  const diaInicio = await obterDiaInicioCiclo(servicoId);
  const fechados = await listarCiclosFechados(servicoId);
  if (fechados.length === 0) return { bloqueadas: [], ciclos: [] };

  const bloqueadas = new Set<string>();
  const ciclosHit = new Map<string, { mes: number; ano: number; label: string }>();

  for (const data of datasIso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) continue;
    for (const ciclo of fechados) {
      if (data >= ciclo.dataInicio && data <= ciclo.dataFim) {
        bloqueadas.add(data);
        ciclosHit.set(`${ciclo.anoReferencia}-${ciclo.mesReferencia}`, {
          mes: ciclo.mesReferencia,
          ano: ciclo.anoReferencia,
          label: ciclo.label,
        });
      }
    }
  }

  return {
    bloqueadas: [...bloqueadas].sort(),
    ciclos: [...ciclosHit.values()],
  };
}

export async function aplicarReferenciaCicloNoUpload(
  uploadId: number,
  datasIso: string[],
  diaInicioCiclo: number,
): Promise<void> {
  const ref = inferirCicloReferenciaDeDatas(datasIso, diaInicioCiclo);
  const fallback = inferirMesReferenciaAtual(diaInicioCiclo);
  const uploadRepo = AppDataSource.getRepository(PlanilhaUpload);
  await uploadRepo.update(uploadId, {
    cicloMesReferencia: ref?.mesReferencia ?? fallback.mes,
    cicloAnoReferencia: ref?.anoReferencia ?? fallback.ano,
  });
}

export async function fecharCicloServico(opts: {
  servicoId: string;
  contractId: string;
  mesReferencia: number;
  anoReferencia: number;
}): Promise<{ ciclo: PeriodoCicloContrato; uploadIds: number[]; totalRegistros: number }> {
  const { servicoId, contractId, mesReferencia, anoReferencia } = opts;

  const contractRepo = AppDataSource.getRepository(Contract);
  const contract = await contractRepo.findOne({ where: { id: contractId } });
  if (!contract) throw new Error('Contrato não encontrado');

  const diaInicio = normalizarDiaInicioCiclo(contract.diaInicioCiclo);
  const periodo = calcularCicloMensalContrato(anoReferencia, mesReferencia, diaInicio);

  const jaFechado = await cicloEstaFechado(servicoId, mesReferencia, anoReferencia);
  if (jaFechado) {
    throw new Error(`O ciclo ${periodo.label} já está fechado.`);
  }

  const uploadRepo = AppDataSource.getRepository(PlanilhaUpload);
  const coletaRepo = AppDataSource.getRepository(ColetaData);
  const agora = new Date();

  // Uploads com dados neste período
  const uploadIdsComDados = await coletaRepo.createQueryBuilder('c')
    .innerJoin(PlanilhaUpload, 'u', 'u.id = c.planilhaUploadId AND u.servico_id = :servicoId', { servicoId })
    .select('DISTINCT c.planilhaUploadId', 'uploadId')
    .where('c.dataSaida BETWEEN :inicio AND :fim', {
      inicio: new Date(`${periodo.dataInicio}T00:00:00`),
      fim: new Date(`${periodo.dataFim}T23:59:59`),
    })
    .getRawMany<{ uploadId: number }>();

  const idsSet = new Set<number>(
    uploadIdsComDados.map(r => Number(r.uploadId)).filter(id => Number.isFinite(id)),
  );

  // Uploads já marcados para este ciclo (mesmo sem dados ainda)
  const uploadsMarcados = await uploadRepo.find({
    where: {
      servico_id: servicoId,
      cicloMesReferencia: mesReferencia,
      cicloAnoReferencia: anoReferencia,
    },
    select: ['id'],
  });
  for (const u of uploadsMarcados) idsSet.add(u.id);

  const uploadIds = [...idsSet];
  if (uploadIds.length === 0) {
    throw new Error(`Nenhuma planilha com dados no ciclo ${periodo.label} para fechar.`);
  }

  await uploadRepo.createQueryBuilder()
    .update(PlanilhaUpload)
    .set({
      cicloFechadoEm: agora,
      cicloMesReferencia: mesReferencia,
      cicloAnoReferencia: anoReferencia,
    })
    .where('id IN (:...uploadIds)', { uploadIds })
    .andWhere('servico_id = :servicoId', { servicoId })
    .execute();

  const totalRegistros = await coletaRepo.createQueryBuilder('c')
    .where('c.planilhaUploadId IN (:...uploadIds)', { uploadIds })
    .andWhere('c.dataSaida BETWEEN :inicio AND :fim', {
      inicio: new Date(`${periodo.dataInicio}T00:00:00`),
      fim: new Date(`${periodo.dataFim}T23:59:59`),
    })
    .getCount();

  invalidarCacheDadosServico(servicoId);
  dashboardCache.invalidar(servicoId);
  agendarWarmupPosUpload(servicoId);

  return { ciclo: periodo, uploadIds, totalRegistros };
}
