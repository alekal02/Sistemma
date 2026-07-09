/**
 * Importação de planilhas de roçada (multi-modelo) → coleta_dados.
 * Não usa validação de viagem (placa/km/peso).
 */
import { Repository } from 'typeorm';
import AppDataSource from '../database/data-source';
import { ColetaData } from '../entities/ColetaData';
import { PlanilhaUpload } from '../entities/PlanilhaUpload';
import { Servico } from '../entities/Servico';
import {
  parsearPlanilhaRocada,
  resumoParseRocada,
  type LinhaRocadaCanonico,
  type ResultadoParseRocada,
} from './rocadaPlanilhaParser';
import { obterUploadIdsModificaveis } from './cicloPlanilhaService';
import { invalidarCacheDadosServico } from './servicoDadosCache';
import { invalidarCacheDashboardServico } from '../controllers/ServicoController';
import { dashboardCache } from './DashboardCacheManager';
import { agendarWarmupPosUpload } from './executivoCacheWarmupService';

export interface ResultadoImportRocada {
  planilhaUploadId: number;
  totalLinhas: number;
  importados: number;
  ignorados: number;
  modelo: string;
  abasUsadas: string[];
  areaTotalM2: number;
  dias: number;
  bairros: number;
  avisos: string[];
  datasApagadas: { data: string; registrosRemovidos: number }[];
  consolidacao?: {
    uploadsRemovidos: number;
    uploadsRemovidosIds: number[];
  };
  modo: 'rocada';
  viagensValidasDashboard: number;
  viagensInconsistentes: number;
}

class RocadaImportService {
  private get coletaRepo(): Repository<ColetaData> {
    return AppDataSource.getRepository(ColetaData);
  }
  private get uploadRepo(): Repository<PlanilhaUpload> {
    return AppDataSource.getRepository(PlanilhaUpload);
  }
  private get servicoRepo(): Repository<Servico> {
    return AppDataSource.getRepository(Servico);
  }

  preview(buffer: Buffer): ResultadoParseRocada & { resumo: ReturnType<typeof resumoParseRocada> } {
    const parsed = parsearPlanilhaRocada(buffer);
    return { ...parsed, resumo: resumoParseRocada(parsed) };
  }

  /** Limites das colunas varchar em coleta_dados (QGIS traz textos longos). */
  private trunc(v: string | null | undefined, max: number): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s) return null;
    return s.length > max ? s.slice(0, max) : s;
  }

  private montarColeta(linha: LinhaRocadaCanonico, uploadId: number): ColetaData {
    const coleta = new ColetaData();
    coleta.planilhaUploadId = uploadId;
    coleta.dataSaida = linha.dataSaida;
    // regional/distrito varchar(50), motorista(100), tipoCaminhao(30), turno(20)
    coleta.regional = this.trunc(linha.bairro, 50);
    coleta.distrito = this.trunc(linha.distrito || linha.logradouro, 50);
    coleta.motorista = this.trunc(linha.operador, 100);
    coleta.tipoCaminhao = this.trunc(linha.equipamento, 30);
    coleta.turno = this.trunc(linha.equipe, 20);
    coleta.placa = null;
    coleta.pesoTotal = null;
    coleta.kmTotal = null;
    coleta.numeroViagens = 1;
    coleta.viagensPorRota = 1;
    coleta.validoDashboard = true;
    coleta.motivosInconsistencia = null;
    // dados JSONB guarda o texto completo para KPIs/gráficos
    coleta.dados = {
      ...linha.dados,
      BAIRRO: linha.bairro,
      LOGRADOURO: linha.logradouro,
      Equipamento: linha.equipamento,
      EQUIPAMENTO: linha.equipamento,
      Operador: linha.operador,
      OPERADOR: linha.operador,
      Equipe: linha.equipe,
      EQUIPE: linha.equipe,
      _tipoServico: 'rocadeira',
      _modeloPlanilha: linha.modelo,
      _aba: linha.aba,
    };
    if (linha.dataSaida) {
      coleta.diaSemana = linha.dataSaida.getUTCDay() + 1;
    }
    return coleta;
  }

  async importar(
    buffer: Buffer,
    nomeArquivo: string,
    servicoId: string,
    usuarioId?: string,
    substituirPorData = true,
  ): Promise<ResultadoImportRocada> {
    const parsed = parsearPlanilhaRocada(buffer);
    const resumo = resumoParseRocada(parsed);

    if (!resumo.podeImportar || parsed.linhas.length === 0 || resumo.areaTotalM2 <= 0) {
      if (parsed.semColunaArea) {
        throw new Error(
          'Planilha de roçada sem coluna de metragem/área (m²). '
          + 'Inclua METRAGEM, TOTAL (M²), Área ou EXECUTADO e envie novamente.',
        );
      }
      if (parsed.linhasSemArea > 0) {
        throw new Error(
          `Nenhuma linha com m²/área válida. ${parsed.linhasSemArea} linha(s) sem metragem foram encontradas. `
          + 'Preencha a área (m²) nas linhas e envie novamente.',
        );
      }
      throw new Error(
        parsed.avisos[0]
        || 'Nenhuma linha de roçada válida encontrada na planilha.',
      );
    }

    const upload = this.uploadRepo.create({
      nomeArquivo,
      totalLinhas: parsed.totalLinhasBrutas,
      linhasImportadas: 0,
      linhasComErro: 0,
      linhasIgnoradas: 0,
      linhasSubstituidas: 0,
      linhasConflitantes: 0,
      estrategia: substituirPorData ? 'atualizar_data' : 'ignorar',
      usuarioId: usuarioId || null,
      servico_id: servicoId,
      resumo: null,
    });
    const uploadSalvo = await this.uploadRepo.save(upload);

    const datasApagadas: { data: string; registrosRemovidos: number }[] = [];
    const uploadIds = await obterUploadIdsModificaveis(servicoId);

    if (substituirPorData && uploadIds.length > 0) {
      const datas = [...new Set(
        parsed.linhas
          .map((l) => (l.dataSaida ? l.dataSaida.toISOString().slice(0, 10) : null))
          .filter((d): d is string => !!d),
      )];

      for (const dataStr of datas) {
        const dataInicio = new Date(`${dataStr}T00:00:00`);
        const dataFim = new Date(`${dataStr}T23:59:59`);
        const count = await this.coletaRepo.createQueryBuilder('c')
          .where('c.planilhaUploadId IN (:...uploadIds)', { uploadIds })
          .andWhere('c.dataSaida BETWEEN :inicio AND :fim', { inicio: dataInicio, fim: dataFim })
          .getCount();
        if (count > 0) {
          await this.coletaRepo.createQueryBuilder()
            .delete()
            .from('coleta_dados')
            .where('planilhaUploadId IN (:...uploadIds)', { uploadIds })
            .andWhere('dataSaida BETWEEN :inicio AND :fim', { inicio: dataInicio, fim: dataFim })
            .execute();
          datasApagadas.push({ data: dataStr, registrosRemovidos: count });
        }
      }
    }

    const batch: ColetaData[] = [];
    let importados = 0;
    const BATCH = 500;
    for (const linha of parsed.linhas) {
      batch.push(this.montarColeta(linha, uploadSalvo.id));
      importados++;
      if (batch.length >= BATCH) {
        await this.coletaRepo.save(batch);
        batch.length = 0;
      }
    }
    if (batch.length) await this.coletaRepo.save(batch);

    // Remover uploads antigos vazios
    const uploadsRemovidosIds: number[] = [];
    for (const oldId of uploadIds) {
      if (oldId === uploadSalvo.id) continue;
      const restantes = await this.coletaRepo.count({ where: { planilhaUploadId: oldId } });
      if (restantes > 0) continue;
      const old = await this.uploadRepo.findOne({ where: { id: oldId } });
      if (!old || old.cicloFechadoEm) continue;
      await this.uploadRepo.remove(old);
      uploadsRemovidosIds.push(oldId);
    }

    uploadSalvo.linhasImportadas = importados;
    uploadSalvo.linhasSubstituidas = datasApagadas.reduce((s, d) => s + d.registrosRemovidos, 0);
    uploadSalvo.resumo = {
      novos: importados,
      duplicadosIgnorados: 0,
      conflitantes: 0,
      substituidos: uploadSalvo.linhasSubstituidas,
      viagensValidasDashboard: importados,
      consolidacao: {
        registrosPreservados: 0,
        uploadsRemovidos: uploadsRemovidosIds.length,
        diasPreservados: [],
      },
    };
    await this.uploadRepo.save(uploadSalvo);

    // Garantir padraoPlanilha com colunas canônicas de roçada
    const servico = await this.servicoRepo.findOne({ where: { id: servicoId } });
    if (servico) {
      const colunasCanonicas = [
        'DATA', 'BAIRRO', 'Area m²', 'Equipamento', 'Operador', 'Equipe', 'LOGRADOURO',
      ];
      servico.padraoPlanilha = {
        colunas: colunasCanonicas.map((nome) => ({
          nome,
          tipo: nome === 'DATA' ? 'data' : nome === 'Area m²' ? 'numero' : 'texto',
          obrigatorio: ['BAIRRO', 'Area m²'].includes(nome),
        })),
        totalLinhas: importados,
        ultimoUpload: uploadSalvo.id,
        ultimoUploadNome: nomeArquivo,
        detectadoEm: new Date().toISOString(),
        modeloRocada: parsed.modelo,
        abasUsadas: parsed.abasUsadas,
      } as any;
      await this.servicoRepo.save(servico);
    }

    invalidarCacheDadosServico(servicoId);
    invalidarCacheDashboardServico(servicoId);
    dashboardCache.invalidar(servicoId);
    agendarWarmupPosUpload(servicoId);

    return {
      planilhaUploadId: uploadSalvo.id,
      totalLinhas: parsed.totalLinhasBrutas,
      importados,
      ignorados: Math.max(0, parsed.totalLinhasBrutas - importados),
      modelo: parsed.modelo,
      abasUsadas: parsed.abasUsadas,
      areaTotalM2: resumo.areaTotalM2,
      dias: resumo.dias,
      bairros: resumo.bairros,
      avisos: parsed.avisos,
      datasApagadas,
      consolidacao: {
        uploadsRemovidos: uploadsRemovidosIds.length,
        uploadsRemovidosIds,
      },
      modo: 'rocada',
      viagensValidasDashboard: importados,
      viagensInconsistentes: 0,
    };
  }
}

export default new RocadaImportService();
