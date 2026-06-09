import 'reflect-metadata';
import AppDataSource from './data-source';
import { User } from '../entities/User';
import bcrypt from 'bcryptjs';

/**
 * Script de seed para criar um usuário administrador de teste.
 *
 * Execute com: npx ts-node src/database/seed.ts
 */
async function seed(): Promise<void> {
  try {
    console.log('📦 Conectando ao banco de dados...');
    await AppDataSource.initialize();
    console.log('✅ Conectado!');

    const userRepo = AppDataSource.getRepository(User);

    // Verifica se o usuário de teste já existe
    const existe = await userRepo.findOne({ where: { email: 'admin@teste.com' } });
    if (existe) {
      console.log('ℹ️  Usuário admin@teste.com já existe, pulando seed.');
      await AppDataSource.destroy();
      return;
    }

    // Cria usuário admin
    const senhaHash = await bcrypt.hash('123456', 10);
    const admin = userRepo.create({
      nome: 'Administrador',
      email: 'admin@teste.com',
      senha: senhaHash,
      role: 'admin',
      ativo: true,
    });

    await userRepo.save(admin);
    console.log('✅ Usuário admin criado com sucesso!');
    console.log('   Email: admin@teste.com');
    console.log('   Senha: 123456');
    console.log('   Role:  admin');

    // Cria um usuário comum também
    const userComum = userRepo.create({
      nome: 'Usuário Teste',
      email: 'usuario@teste.com',
      senha: senhaHash,
      role: 'user',
      ativo: true,
    });

    await userRepo.save(userComum);
    console.log('✅ Usuário comum criado com sucesso!');
    console.log('   Email: usuario@teste.com');
    console.log('   Senha: 123456');
    console.log('   Role:  user');

    await AppDataSource.destroy();
    console.log('🔒 Conexão encerrada. Seed concluído!');
  } catch (error) {
    console.error('❌ Erro durante o seed:', error);
    process.exit(1);
  }
}

seed();
