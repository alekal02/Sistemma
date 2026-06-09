import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Abastecimento } from '../entities/Abastecimento';
import { User } from '../entities/User';
import { Caminhao } from '../entities/Caminhao';
import { AbastecimentoLog } from '../entities/AbastecimentoLog';
import { ColetaData } from '../entities/ColetaData';
import { PlanilhaUpload } from '../entities/PlanilhaUpload';
import { Servico } from '../entities/Servico';
import { Contract } from '../entities/Contract';
import { KpiUniversal } from '../entities/KpiUniversal';
import { GraficoPadraoConfig } from '../entities/GraficoPadraoConfig';
const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USER || 'neurai',
  password: process.env.DATABASE_PASSWORD || 'neurai@2025',
  database: process.env.DATABASE_NAME || 'abastecimento',
  // ═══ synchronize: true = cria/atualiza tabelas automaticamente ═══
  // Necessário porque o projeto NÃO tem migrations.
  // Em banco novo (Docker), sem isso as tabelas nunca são criadas
  // e os seeds de KPIs universais e gráficos padrão falham.
  synchronize: true,
  migrationsRun: false,
  logging: process.env.NODE_ENV === 'development',
  entities: [Abastecimento, User, Caminhao, AbastecimentoLog, ColetaData, PlanilhaUpload, Contract, Servico, KpiUniversal, GraficoPadraoConfig],
  
});

export default AppDataSource;
