/**
 * Migration: corrige KPIs de contadores (motoristas, coletores, placas, distritos)
 * para contar valores únicos — mesma pessoa/local em várias viagens conta 1x.
 */
import AppDataSource from './data-source';
import { Servico } from '../entities/Servico';
import { KpiUniversal } from '../entities/KpiUniversal';

type KpiLike = { nome?: string; label?: string; expressao?: string; formula?: string; descricao?: string };

function textoKpi(kpi: KpiLike): string {
  return `${kpi.label || ''} ${kpi.nome || ''}`.toUpperCase();
}

function exprKpi(kpi: KpiLike): string {
  return (kpi.expressao || kpi.formula || '').trim();
}

function patchContador(kpi: KpiLike): Partial<KpiLike> | null {
  const expr = exprKpi(kpi);
  const texto = textoKpi(kpi);

  const ehColetoresAtivos =
    texto.includes('COLETORES ATIVOS') ||
    texto.includes('QTD COLETORES') ||
    (texto.includes('COLETORES') && !texto.includes('EQUIPE') && !texto.includes('TOTAL COLETORES'));

  const ehMotoristas =
    texto.includes('MOTORISTAS ATIVOS') ||
    texto.includes('TOTAL DE MOTORISTAS') ||
    texto.includes('MOTORISTAS');

  const ehPlacas =
    texto.includes('PLACA') ||
    texto.includes('VEÍCULOS ATIVOS') ||
    texto.includes('VEICULOS ATIVOS');

  const ehDistritos = texto.includes('DISTRITOS');

  if (ehColetoresAtivos && !texto.includes('EQUIPE') && !texto.includes('PESO') && !texto.includes('KM')) {
    if (/COLETORES_UNICOS\s*\(\s*\)/i.test(expr)) return null;
    if (/COUNT\s*(\(\s*)?DISTINCT\s*\(\s*PLACA/i.test(expr) || /SUM\s*\(/i.test(expr)) {
      return {
        expressao: 'COLETORES_UNICOS()',
        descricao: 'Coletores únicos (COLETOR 01–04): mesma pessoa em várias viagens conta apenas uma vez',
      };
    }
  }

  if (ehMotoristas && !texto.includes('VIAGEM') && !texto.includes('PRODUTIV')) {
    if (/MOTORISTAS_UNICOS\s*\(\s*\)/i.test(expr)) return null;
    if (/SUM\s*\(\s*MOTORISTA/i.test(expr) || (/COUNT\s*\(\s*MOTORISTA/i.test(expr) && !/DISTINCT/i.test(expr))) {
      return {
        expressao: 'MOTORISTAS_UNICOS()',
        descricao: 'Motoristas distintos no período (mesmo motorista em várias viagens conta uma vez)',
      };
    }
    if (/COUNT\s*(\(\s*)?DISTINCT\s*\(\s*MOTORISTA/i.test(expr)) {
      return {
        expressao: 'MOTORISTAS_UNICOS()',
        descricao: 'Motoristas distintos no período (mesmo motorista em várias viagens conta uma vez)',
      };
    }
  }

  if (ehPlacas && !texto.includes('COLETOR')) {
    if (/PLACAS_UNICAS\s*\(\s*\)/i.test(expr)) return null;
    if (/COUNT\s*(\(\s*)?DISTINCT\s*\(\s*PLACA/i.test(expr)) {
      return {
        expressao: 'PLACAS_UNICAS()',
        descricao: 'Placas/veículos distintos em operação',
      };
    }
  }

  if (ehDistritos && !texto.includes('PODA') && !texto.includes('REMOÇÃO')) {
    if (/DISTRITOS_UNICOS\s*\(\s*\)/i.test(expr)) return null;
    if (/COUNT\s*(\(\s*)?DISTINCT\s*\(\s*DISTRITO/i.test(expr)) {
      return {
        expressao: 'DISTRITOS_UNICOS()',
        descricao: 'Distritos/bairros distintos atendidos no período',
      };
    }
  }

  return null;
}

function aplicarPatch(kpi: KpiLike, patch: Partial<KpiLike>): KpiLike {
  const out = { ...kpi, ...patch };
  if ('formula' in kpi) {
    (out as any).formula = patch.expressao;
  }
  return out;
}

function corrigirKpisLista(kpis: KpiLike[]): { kpis: KpiLike[]; mudou: boolean } {
  let mudou = false;
  const kpisNovos = kpis.map((k) => {
    const patch = patchContador(k);
    if (!patch) return k;
    mudou = true;
    return aplicarPatch(k, patch);
  });
  return { kpis: kpisNovos, mudou };
}

export async function migrateContadoresAtivosKpi(): Promise<void> {
  const servicoRepo = AppDataSource.getRepository(Servico);
  const kpiRepo = AppDataSource.getRepository(KpiUniversal);
  let servicosAtualizados = 0;
  let universaisAtualizados = 0;

  const servicos = await servicoRepo.find();
  for (const servico of servicos) {
    const kpis: KpiLike[] = servico.configDashboard?.kpis || [];
    if (kpis.length === 0) continue;
    const { kpis: kpisNovos, mudou } = corrigirKpisLista(kpis);
    if (mudou) {
      servico.configDashboard = { ...(servico.configDashboard || {}), kpis: kpisNovos };
      await servicoRepo.save(servico);
      servicosAtualizados++;
    }
  }

  const universais = await kpiRepo.find({ where: { isPersonalizado: false } });
  for (const kpi of universais) {
    const patch = patchContador({
      nome: kpi.nome,
      label: kpi.label,
      formula: kpi.formula,
      descricao: kpi.descricao || undefined,
    });
    if (!patch) continue;
    Object.assign(kpi, { formula: patch.expressao, descricao: patch.descricao ?? kpi.descricao });
    await kpiRepo.save(kpi);
    universaisAtualizados++;
  }

  if (servicosAtualizados > 0 || universaisAtualizados > 0) {
    console.log(
      `[migrateContadoresAtivosKpi] ✅ ${servicosAtualizados} serviço(s), ${universaisAtualizados} KPI(s) universal(is) corrigido(s)`,
    );
  }
}

if (require.main === module) {
  (async () => {
    await AppDataSource.initialize();
    await migrateContadoresAtivosKpi();
    await AppDataSource.destroy();
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
