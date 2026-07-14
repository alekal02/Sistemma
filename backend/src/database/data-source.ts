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
import { WhatsappGrupoMapa } from '../entities/WhatsappGrupoMapa';
const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USER || 'neurai',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'abastecimento',
  // synchronize: true mantém compatibilidade com deploy sem migrations formais.
  // Em produção estável: TYPEORM_SYNCHRONIZE=false
  synchronize: process.env.TYPEORM_SYNCHRONIZE !== 'false',
  migrationsRun: false,
  logging: process.env.NODE_ENV === 'development',
  entities: [Abastecimento, User, Caminhao, AbastecimentoLog, ColetaData, PlanilhaUpload, Contract, Servico, KpiUniversal, GraficoPadraoConfig, WhatsappGrupoMapa],
  extra: {
    max: parseInt(process.env.DB_POOL_MAX || '8', 10),
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_MS || '10000', 10),
    connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECT_MS || '20000', 10),
    options: `-c statement_timeout=${parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '120000', 10)}`,
  },
});

export default AppDataSource;
