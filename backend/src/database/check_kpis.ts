import 'reflect-metadata';
import AppDataSource from '../database/data-source';
import { KpiUniversal } from '../entities/KpiUniversal';

async function main() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(KpiUniversal);
  
  const total = await repo.count();
  console.log('Total KPIs:', total);
  
  const tipos = await repo.createQueryBuilder('k')
    .select('k.tipoServico')
    .addSelect('COUNT(*)', 'total')
    .groupBy('k.tipoServico')
    .orderBy('k.tipoServico')
    .getRawMany();
  
  console.log('\nKPIs por tipo:');
  for (const t of tipos) {
    console.log('  ' + t.k_tipoServico + ': ' + t.total + ' KPIs');
  }
  
  // Mostrar KPIs de rocadeira
  const rocadeira = await repo.find({ where: { tipoServico: 'rocadeira' } });
  console.log('\nKPIs de rocadeira:');
  for (const k of rocadeira) {
    console.log('  - ' + k.nome + ' (' + k.label + ')  formula=' + k.formula);
  }

  // Mostrar KPIs de varricao
  const varricao = await repo.find({ where: { tipoServico: 'varricao' } });
  console.log('\nKPIs de varricao:');
  for (const k of varricao) {
    console.log('  - ' + k.nome + ' (' + k.label + ')  formula=' + k.formula);
  }

  const poda = await repo.find({ where: { tipoServico: 'poda' } });
  console.log('\nKPIs de poda:');
  for (const k of poda) {
    console.log('  - ' + k.nome + ' (' + k.label + ')  formula=' + k.formula);
  }

  const remocao = await repo.find({ where: { tipoServico: 'remocao' } });
  console.log('\nKPIs de remocao:');
  for (const k of remocao) {
    console.log('  - ' + k.nome + ' (' + k.label + ')  formula=' + k.formula);
  }

  await AppDataSource.destroy();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
