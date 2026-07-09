/**
 * Pré-aquecimento do cache do Dashboard Executivo.
 * Roda após startup, diariamente e após upload de planilha.
 */

import AppDataSource from '../database/data-source';
import { Contract } from '../entities/Contract';
import { Servico } from '../entities/Servico';
import { inferirMesReferenciaAtual } from '../utils/periodoCicloContrato';
import { dashboardCache, type ExecutivoCacheParams } from './DashboardCacheManager';
import PlanilhaService from './PlanilhaService';
import type { DashboardExecutivoController } from '../controllers/DashboardExecutivoController';

let aquecendo = false;
let controllerRef: DashboardExecutivoController | null = null;
let timerDiario: ReturnType<typeof setInterval> | null = null;

const INTERVALO_MS = parseInt(
  process.env.DASHBOARD_WARMUP_INTERVAL_MS || String(24 * 60 * 60 * 1000),
  10,
);
const DELAY_INICIAL_MS = parseInt(
  process.env.DASHBOARD_WARMUP_DELAY_MS || '45000',
  10,
);
const WARMUP_ENABLED = process.env.DASHBOARD_WARMUP_ENABLED !== 'false';
const WARMUP_PAUSE_MS = parseInt(process.env.DASHBOARD_WARMUP_PAUSE_MS || '1500', 10);

let warmupPendente: { contractId?: string; servicoId?: string } | null = null;

function pausaWarmup(): Promise<void> {
  if (WARMUP_PAUSE_MS <= 0) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, WARMUP_PAUSE_MS));
}

export function registrarControllerExecutivo(ctrl: DashboardExecutivoController): void {
  controllerRef = ctrl;
}

function montarParamsCiclo(
  contractId: string,
  servicoId: string | undefined,
  diaInicioCiclo: number,
): ExecutivoCacheParams {
  const { mes, ano } = inferirMesReferenciaAtual(diaInicioCiclo);
  return {
    periodo: 'ciclo',
    contractId,
    ...(servicoId ? { servicoId } : {}),
    mesReferencia: mes,
    anoReferencia: ano,
  };
}

export async function aquecerEntradaExecutivo(params: ExecutivoCacheParams): Promise<boolean> {
  if (!controllerRef) return false;
  if (dashboardCache.obter(params)) return true;
  return controllerRef.calcularECachear(params);
}

export async function aquecerCacheExecutivo(opts?: {
  contractId?: string;
  servicoId?: string;
}): Promise<void> {
  if (!WARMUP_ENABLED || !controllerRef) return;
  if (aquecendo) {
    warmupPendente = { contractId: opts?.contractId, servicoId: opts?.servicoId };
    return;
  }
  if (!AppDataSource.isInitialized) return;

  aquecendo = true;
  const inicio = Date.now();
  let ok = 0;
  let skip = 0;
  let fail = 0;
  let vazio = 0;

  try {
    const contractRepo = AppDataSource.getRepository(Contract);
    const servicoRepo = AppDataSource.getRepository(Servico);

    let contratos: Contract[] = [];
    if (opts?.contractId) {
      const c = await contractRepo.findOne({ where: { id: opts.contractId } });
      if (c) contratos = [c];
    } else {
      contratos = await contractRepo.find({ order: { numeroContrato: 'ASC' } });
    }

    const todosServicos: Servico[] = [];
    for (const contrato of contratos) {
      if (opts?.servicoId) {
        const s = await servicoRepo.findOne({ where: { id: opts.servicoId, contract_id: contrato.id } });
        if (s) todosServicos.push(s);
      } else {
        const lista = await servicoRepo.find({ where: { contract_id: contrato.id }, order: { nome: 'ASC' } });
        todosServicos.push(...lista);
      }
    }
    const contagens = await PlanilhaService.getContagemRegistrosPorServicos(todosServicos.map(s => s.id));
    const servicoTemDados = (id: string) => (contagens.get(id)?.total || 0) > 0;

    for (const contrato of contratos) {
      const dia = contrato.diaInicioCiclo ?? 1;

      if (opts?.servicoId) {
        if (!servicoTemDados(opts.servicoId)) { vazio++; continue; }
        const params = montarParamsCiclo(contrato.id, opts.servicoId, dia);
        if (dashboardCache.obter(params)) { skip++; continue; }
        const res = await controllerRef.calcularECachear(params);
        if (res) ok++; else fail++;
        await pausaWarmup();
        continue;
      }

      const servicos = todosServicos.filter(s => s.contract_id === contrato.id);
      const servicosComDados = servicos.filter(s => servicoTemDados(s.id));

      if (servicosComDados.length === 0) {
        vazio += 1 + servicos.length;
        continue;
      }

      // Visão do contrato (todos serviços com dados)
      const paramsContrato = montarParamsCiclo(contrato.id, undefined, dia);
      if (dashboardCache.obter(paramsContrato)) skip++;
      else if (await controllerRef.calcularECachear(paramsContrato)) ok++;
      else fail++;
      await pausaWarmup();

      for (const servico of servicosComDados) {
        const params = montarParamsCiclo(contrato.id, servico.id, dia);
        if (dashboardCache.obter(params)) { skip++; continue; }
        if (await controllerRef.calcularECachear(params)) ok++;
        else fail++;
        await pausaWarmup();
      }
      vazio += servicos.length - servicosComDados.length;
    }

    const seg = ((Date.now() - inicio) / 1000).toFixed(1);
    const stats = dashboardCache.estatisticas();
    console.log(
      `[DashboardWarmup] Concluído em ${seg}s — ok:${ok} cache:${skip} vazio:${vazio} falha:${fail} | entradas mem:${stats.memoria} disco:${stats.disco}`,
    );
  } catch (err) {
    console.error('[DashboardWarmup] Erro:', (err as Error)?.message || err);
  } finally {
    aquecendo = false;
    const pendente = warmupPendente;
    warmupPendente = null;
    if (pendente) {
      setTimeout(() => {
        void aquecerCacheExecutivo(pendente);
      }, 10000);
    }
  }
}

/** Agenda warmup inicial + repetição diária */
export function iniciarAgendamentoWarmupExecutivo(): void {
  if (!WARMUP_ENABLED) {
    console.log('[DashboardWarmup] Desabilitado (DASHBOARD_WARMUP_ENABLED=false)');
    return;
  }

  setTimeout(() => {
    void aquecerCacheExecutivo();
  }, DELAY_INICIAL_MS);

  if (timerDiario) clearInterval(timerDiario);
  timerDiario = setInterval(() => {
    void aquecerCacheExecutivo();
  }, INTERVALO_MS);

  console.log(
    `[DashboardWarmup] Agendado — 1ª execução em ${DELAY_INICIAL_MS / 1000}s, depois a cada ${INTERVALO_MS / 3600000}h`,
  );
  const stats = dashboardCache.estatisticas();
  if (stats.memoria > 0 || stats.disco > 0) {
    console.log(`[DashboardWarmup] Cache em disco/memória: ${stats.disco} arquivo(s), ${stats.memoria} em RAM`);
  }
}

/** Após upload — aquece só contrato/serviço afetado (em background) */
export function agendarWarmupPosUpload(servicoId: string, contractId?: string): void {
  if (!WARMUP_ENABLED) return;
  setTimeout(() => {
    void (async () => {
      let cid = contractId;
      if (!cid) {
        const s = await AppDataSource.getRepository(Servico).findOne({ where: { id: servicoId } });
        cid = s?.contract_id;
      }
      if (cid) await aquecerCacheExecutivo({ contractId: cid, servicoId });
    })();
  }, 5000);
}
