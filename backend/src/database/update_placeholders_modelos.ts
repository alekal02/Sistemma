import 'reflect-metadata';
import AppDataSource from './data-source';
import { KpiUniversal } from '../entities/KpiUniversal';
import { TipoServico } from '../enums/TipoServico';

/**
 * Atualiza os placeholders dos KPIs universais EXISTENTES
 * para reconhecerem as novas colunas das planilhas modelo.
 *
 * Executar: npx ts-node src/database/update_placeholders_modelos.ts
 */
export async function updatePlaceholders(): Promise<void> {
  const repo = AppDataSource.getRepository(KpiUniversal);

  // ═══ 1. Placeholder KM_VARRIDOS → adicionar 'KM Linear' ═══
  const kmVarridosKpis = await repo.find({
    where: { tipoServico: TipoServico.VARRICAO },
  });

  for (const kpi of kmVarridosKpis) {
    if (!kpi.placeholders) continue;
    let alterado = false;

    for (const ph of kpi.placeholders) {
      // KM_VARRIDOS_PLACEHOLDER → adicionar 'KM Linear'
      if (ph.nome === 'KM_VARRIDOS_PLACEHOLDER' && !ph.colunasCandidatas.includes('KM Linear')) {
        ph.colunasCandidatas.push('KM Linear', 'KM_LINEAR', 'KM LINEAR');
        alterado = true;
      }
      // FUNCIONARIO_PLACEHOLDER → adicionar 'Equipe'
      if (ph.nome === 'FUNCIONARIO_PLACEHOLDER' && !ph.colunasCandidatas.includes('Equipe')) {
        ph.colunasCandidatas.push('Equipe', 'EQUIPE');
        alterado = true;
      }
    }

    if (alterado) {
      await repo.save(kpi);
      console.log(`  ✅ Placeholders atualizados: ${kpi.nome} (varricao)`);
    }
  }

  // ═══ 2. Placeholder ARVORES → adicionar 'Quantidade de Arvore' ═══
  const podaKpis = await repo.find({
    where: { tipoServico: TipoServico.PODA },
  });

  for (const kpi of podaKpis) {
    if (!kpi.placeholders) continue;
    let alterado = false;

    for (const ph of kpi.placeholders) {
      if (ph.nome === 'ARVORES_PLACEHOLDER' && !ph.colunasCandidatas.includes('Quantidade de Arvore')) {
        ph.colunasCandidatas.push('Quantidade de Arvore', 'QUANTIDADE DE ARVORE', 'QUANTIDADE ARVORE');
        alterado = true;
      }
      if (ph.nome === 'FUNCIONARIO_PLACEHOLDER' && !ph.colunasCandidatas.includes('Equipe')) {
        ph.colunasCandidatas.push('Equipe', 'EQUIPE');
        alterado = true;
      }
      if (ph.nome === 'BAIRRO_PLACEHOLDER' && !ph.colunasCandidatas.includes('Setor')) {
        ph.colunasCandidatas.push('Setor', 'SETOR');
        alterado = true;
      }
    }

    if (alterado) {
      await repo.save(kpi);
      console.log(`  ✅ Placeholders atualizados: ${kpi.nome} (poda)`);
    }
  }

  // ═══ 3. Placeholder AREA → adicionar 'Area m²' ═══
  const rocadeiraKpis = await repo.find({
    where: { tipoServico: TipoServico.ROCADEIRA },
  });

  for (const kpi of rocadeiraKpis) {
    if (!kpi.placeholders) continue;
    let alterado = false;

    for (const ph of kpi.placeholders) {
      if (ph.nome === 'AREA_PLACEHOLDER' && !ph.colunasCandidatas.includes('Area m²')) {
        ph.colunasCandidatas.push('Area m²', 'AREA M2', 'AREA M²');
        alterado = true;
      }
      if (ph.nome === 'FUNCIONARIO_PLACEHOLDER' && !ph.colunasCandidatas.includes('Equipe')) {
        ph.colunasCandidatas.push('Equipe', 'EQUIPE');
        alterado = true;
      }
      if (ph.nome === 'FUNCIONARIO_PLACEHOLDER' && !ph.colunasCandidatas.includes('Operador')) {
        ph.colunasCandidatas.push('Operador', 'OPERADOR');
        alterado = true;
      }
    }

    if (alterado) {
      await repo.save(kpi);
      console.log(`  ✅ Placeholders atualizados: ${kpi.nome} (rocadeira)`);
    }
  }

  // ═══ 4. Remoção — adicionar 'Peso' aos placeholders de peso ═══
  const remocaoKpis = await repo.find({
    where: { tipoServico: TipoServico.REMOCAO },
  });

  for (const kpi of remocaoKpis) {
    if (!kpi.placeholders) continue;
    let alterado = false;

    for (const ph of kpi.placeholders) {
      if (ph.nome === 'PESO_PLACEHOLDER' && !ph.colunasCandidatas.includes('Peso')) {
        ph.colunasCandidatas.push('Peso');
        alterado = true;
      }
    }

    if (alterado) {
      await repo.save(kpi);
      console.log(`  ✅ Placeholders atualizados: ${kpi.nome} (remocao)`);
    }
  }

  console.log('\n✅ Atualização de placeholders concluída!');
}

async function main() {
  try {
    console.log('📦 Conectando ao banco de dados...');
    await AppDataSource.initialize();
    console.log('✅ Conectado!');
    await updatePlaceholders();
    await AppDataSource.destroy();
    console.log('🔒 Conexão encerrada.');
    process.exit(0);
  } catch (err) {
    console.error('[updatePlaceholders] Erro:', err);
    process.exit(1);
  }
}

main();
