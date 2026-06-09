import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Servico } from './Servico';

@Entity('contracts')
export class Contract {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('varchar', { length: 200, nullable: true })
  numeroContrato!: string | null;

  @Column('varchar', { length: 20, default: 'ativo' })
  status!: 'ativo' | 'encerrado';

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  valorTonelada!: number | null;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  valorMini!: number | null;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  valorTruck!: number | null;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  valorToco!: number | null;

  @Column('jsonb', { nullable: true })
  kpisConfig!: any[] | null;

  @Column('jsonb', { nullable: true })
  configResumo!: any | null;

  @OneToMany(() => Servico, (servico) => servico.contract)
  servicos!: Servico[];

  @CreateDateColumn()
  criadoEm!: Date;

  @UpdateDateColumn()
  atualizadoEm!: Date;
}
