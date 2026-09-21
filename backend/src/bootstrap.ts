import type { Express } from 'express';
import AppDataSource, { isMultiTenant, runWithTenant } from './database/data-source';
import { seedKpisUniversais } from './database/seedKpiUniversal';
import { seedKpisUniversaisExtra } from './database/seedKpiUniversalExtra';
import { seedKpisUniversaisReceita } from './database/seedKpiUniversalReceita';
import { seedGraficosPadrao } from './database/seedGraficosPadrao';
import { migrateHorasProdutivas } from './database/migrate_horas_produtivas';
import { migrateColetoresEquipeKpi } from './database/migrate_coletores_equipe_kpi';
import { migrateMediaHorasViagemKpi } from './database/migrate_media_horas_viagem_kpi';
import { migratePesoCelulasPlanilha } from './database/migrate_peso_celulas_planilha';
import { migrateWhatsappPdfSobDemanda } from './database/migrate_whatsapp_pdf_sob_demanda';
import { sincronizarKpisUniversaisBiblioteca } from './database/sincronizarKpisUniversaisBiblioteca';
import { iniciarAgendamentoWarmupExecutivo } from './services/executivoCacheWarmupService';

export async function prepararBancoAtivo(): Promise<void> {
  const skipStartup = process.env.SKIP_STARTUP_SEED === 'true';

  if (!skipStartup) {
    try {
      await seedKpisUniversais();
    } catch (err) {
      console.error('⚠️ Erro ao seed KPIs universais:', err);
    }
    try {
      await seedKpisUniversaisExtra();
    } catch (err) {
      console.error('⚠️ Erro ao seed KPIs universais extra:', err);
    }
    try {
      await seedKpisUniversaisReceita();
    } catch (err) {
      console.error('⚠️ Erro ao seed KPIs universais receita:', err);
    }
    if (process.env.SYNC_KPIS_UNIVERSAIS !== 'false') {
      try {
        await sincronizarKpisUniversaisBiblioteca();
      } catch (err) {
        console.error('⚠️ Erro ao sincronizar biblioteca de KPIs universais:', err);
      }
    }
    try {
      await seedGraficosPadrao();
    } catch (err) {
      console.error('⚠️ Erro ao seed gráficos padrão:', err);
    }
  } else {
    console.log('⏭️ SKIP_STARTUP_SEED=true — seeds de biblioteca ignorados');
  }

  if (process.env.SKIP_STARTUP_MIGRATIONS !== 'true') {
    try {
      await migrateHorasProdutivas();
    } catch (err) {
      console.error('⚠️ Erro na migration de horas produtivas:', err);
    }
    try {
      await migrateColetoresEquipeKpi();
    } catch (err) {
      console.error('⚠️ Erro na migration de coletores na equipe:', err);
    }
    try {
      await migrateMediaHorasViagemKpi();
    } catch (err) {
      console.error('⚠️ Erro na migration de média horas/viagem:', err);
    }
    try {
      await migratePesoCelulasPlanilha();
    } catch (err) {
      console.error('⚠️ Erro na migration de peso das células da planilha:', err);
    }
    try {
      await migrateWhatsappPdfSobDemanda();
    } catch (err) {
      console.error('⚠️ Erro na migration de PDF WhatsApp sob demanda:', err);
    }
  } else {
    console.log('⏭️ SKIP_STARTUP_MIGRATIONS=true — migrations automáticas ignoradas');
  }
}

export async function iniciarAplicacao(app: Express, port: number): Promise<void> {
  try {
    await AppDataSource.initialize();
    console.log('✅ Banco de dados conectado com sucesso');

    if (isMultiTenant()) {
      const { contratosComBanco } = await import('./services/tenantFanout');
      const bancos = await contratosComBanco();
      console.log(`🗂️ Modo um-banco-por-contrato — ${bancos.length} contrato(s) para preparar`);
      for (const tenant of bancos) {
        try {
          await runWithTenant(tenant.databaseName, () => prepararBancoAtivo());
          console.log(`   ✔ ${tenant.numeroContrato} (${tenant.databaseName})`);
        } catch (err) {
          console.error(`   ✖ ${tenant.numeroContrato} (${tenant.databaseName}):`, err);
        }
      }
    } else {
      await prepararBancoAtivo();
    }

    app.listen(port, () => {
      console.log(`✅ Servidor rodando em http://localhost:${port}`);
      iniciarAgendamentoWarmupExecutivo();
    });
  } catch (error) {
    console.error('❌ Erro ao conectar ao banco de dados:', error);
    process.exit(1);
  }
}
