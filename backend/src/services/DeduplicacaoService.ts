import * as XLSX from 'xlsx';
import { Repository, In } from 'typeorm';
import AppDataSource from '../database/data-source';
import { ColetaData } from '../entities/ColetaData';
import { PlanilhaUpload } from '../entities/PlanilhaUpload';
import { Servico } from '../entities/Servico';
import PlanilhaService from './PlanilhaService';
import { prepararViagemParaImportacao } from './validacaoViagemService';

/**
 * Interface que representa uma linha da planilha já parseada
 */
interface LinhaParseada {
  raw: Record<string, any>;
  dataSaida: Date | null;
  placa: string | null;
  turno: string | null;
  regional: string | null;
  distrito: string | null;
  motorista: string | null;
  [key: string]: any;
}

/**
 * Classificação de cada linha após comparação com o banco
 */
export type ClassificacaoLinha = 'novo' | 'duplicado' | 'conflitante';

/**
 * Resultado da análise de uma linha
 */
export interface LinhaAnalisada {
  indice: number;
  classificacao: ClassificacaoLinha;
  chave: string;
  dadosPlanilha: LinhaParseada;
  dadosBanco?: Partial<ColetaData>;
  diferencas?: string[];
}

/**
 * Resultado completo da análise de conflitos
 */
export interface ResultadoAnalise {
  totalLinhas: number;
  novos: LinhaAnalisada[];
  duplicados: LinhaAnalisada[];
  conflitantes: LinhaAnalisada[];
  chaveUsada: string;
}

/**
 * Resultado da importação com dedup
 */
export interface ResultadoImportacaoDedup {
  planilhaUploadId: number;
  totalLinhas: number;
  importados: number;
  ignorados: number;
  substituidos: number;
  erros: number;
  viagensInconsistentes?: number;
  viagensValidasDashboard?: number;
  resumo: {
    novos: number;
    duplicadosIgnorados: number;
    conflitantes: number;
    substituidos: number;
    viagensInconsistentes?: number;
    viagensValidasDashboard?: number;
  };
}

/**
 * Campos da ColetaData que formam a "impressão digital" do registro
 * para comparação de igualdade entre planilha e banco.
 * Inclui apenas campos de dados (não metadados como id, planilhaUploadId, criadoEm)
 */
const CAMPOS_COMPARACAO: (keyof ColetaData)[] = [
  'turno', 'regional', 'distrito', 'motorista',
  'numeroColetores', 'kmSaida', 'horaSaida', 'kmChegada', 'horaChegada',
  'horaUltimoTerminoCarregamento',
  'peso1', 'peso2', 'peso3', 'peso4', 'peso5', 'pesoTotal',
  'tempoForaUnidade', 'horasForaUnidade', 'tipoCaminhao',
  'kmTotal', 'numeroViagens', 'diaSemana',
];

/**
 * Serviço de deduplicação — analisa e resolve conflitos entre
 * dados da planilha e dados já existentes no banco.
 * 
 * Chave única usada: (dataSaida + placa + turno) dentro do mesmo serviço.
 * 
 * Lógica:
 * 1. Extrai chave única de cada linha da planilha
 * 2. Busca no banco todos os registros que correspondem às chaves
 * 3. Classifica cada linha em: novo, duplicado (idêntico), conflitante (diferente)
 * 4. Na importação, aplica a estratégia escolhida pelo usuário
 */
export class DeduplicacaoService {
  private coletaRepo: Repository<ColetaData>;
  private uploadRepo: Repository<PlanilhaUpload>;
  private servicoRepo: Repository<Servico>;

  constructor() {
    this.coletaRepo = AppDataSource.getRepository(ColetaData);
    this.uploadRepo = AppDataSource.getRepository(PlanilhaUpload);
    this.servicoRepo = AppDataSource.getRepository(Servico);
  }

  /**
   * ⭐ Remove duplicatas no banco via SQL direto.
   * Mantém apenas o registro MAIS ANTIGO (menor id) para cada
   * combinação (dataSaida::date, placa, turno) de um mesmo serviço.
   * 
   * Esta é a REDE DE SEGURANÇA final — garante que não haja
   * duplicatas mesmo que a análise em memória falhe.
   */
  private async limparDuplicatas(servicoId?: string): Promise<number> {
    if (!servicoId) return 0;

    // Buscar IDs de upload do serviço
    const uploads = await this.uploadRepo.find({
      where: { servico_id: servicoId },
      select: ['id'],
    });
    const uploadIds = uploads.map(u => u.id);
    if (uploadIds.length === 0) return 0;

    // Query SQL: identifica duplicatas por (dataSaida, placa, turno)
    // e mantém apenas o registro com menor ID
    const result = await AppDataSource.query(`
      DELETE FROM coleta_dados
      WHERE id IN (
        SELECT id FROM (
          SELECT c.id,
                 ROW_NUMBER() OVER (
                   PARTITION BY c."dataSaida"::date, c."placa", c."turno"
                   ORDER BY c.id ASC
                 ) as rn
          FROM coleta_dados c
          WHERE c."planilhaUploadId" = ANY($1::int[])
        ) sub
        WHERE sub.rn > 1
      )
    `, [uploadIds]);

    const removidos = result?.[1] || 0;
    if (removidos > 0) {
      console.log(`[Dedup SQL] ${removidos} duplicata(s) removida(s) do servico ${servicoId}`);
    }
    return removidos;
  }

  /**
   * Gera a chave única para um registro.
   * Combina dataSaida + placa + turno para formar a chave.
   */
  gerarChave(dataSaida: Date | string | null, placa: string | null, turno: string | null): string {
    let data: string;
    if (dataSaida instanceof Date) {
      data = dataSaida.toISOString().slice(0, 10);
    } else if (typeof dataSaida === 'string') {
      data = dataSaida.slice(0, 10);
    } else {
      data = 'SEM_DATA';
    }
    const placaNorm = (placa || 'SEM_PLACA').toUpperCase().trim();
    const turnoNorm = (turno || 'SEM_TURNO').toUpperCase().trim();
    return `${data}|${placaNorm}|${turnoNorm}`;
  }

  /**
   * Gera a chave a partir de uma linha já parseada (ColetaData)
   */
  gerarChaveDeColeta(coleta: ColetaData): string {
    return this.gerarChave(coleta.dataSaida, coleta.placa, coleta.turno);
  }

  /**
   * Extrai os campos de uma linha para comparação
   */
  private extrairCamposComparacao(linha: LinhaParseada): Record<string, any> {
    return {
      turno: linha.turno,
      regional: linha.regional,
      distrito: linha.distrito,
      motorista: linha.motorista,
      numeroColetores: linha.numeroColetores,
      kmSaida: linha.kmSaida,
      horaSaida: linha.horaSaida,
      kmChegada: linha.kmChegada,
      horaChegada: linha.horaChegada,
      horaUltimoTerminoCarregamento: linha.horaUltimoTerminoCarregamento,
      peso1: linha.peso1,
      peso2: linha.peso2,
      peso3: linha.peso3,
      peso4: linha.peso4,
      peso5: linha.peso5,
      pesoTotal: linha.pesoTotal,
      tempoForaUnidade: linha.tempoForaUnidade,
      horasForaUnidade: linha.horasForaUnidade,
      tipoCaminhao: linha.tipoCaminhao,
      kmTotal: linha.kmTotal,
      numeroViagens: linha.numeroViagens,
      diaSemana: linha.diaSemana,
    };
  }

  /**
   * Compara campos da planilha com os do banco e retorna as diferenças
   */
  private compararCampos(planilha: Record<string, any>, banco: Record<string, any>): string[] {
    const diferencas: string[] = [];
    for (const campo of CAMPOS_COMPARACAO) {
      const valPlanilha = planilha[campo];
      const valBanco = banco[campo];
      // Normalizar undefined/null como null
      const a = valPlanilha === undefined ? null : valPlanilha;
      const b = valBanco === undefined ? null : valBanco;
      // Comparação flexível: string vs number
      if (String(a ?? '') !== String(b ?? '')) {
        diferencas.push(String(campo));
      }
    }
    return diferencas;
  }

  /**
   * Lê e parseia as linhas de uma planilha, extraindo dados estruturados
   */
  private parsearLinhas(buffer: Buffer): LinhaParseada[] {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const nomeAba = workbook.SheetNames[0];
    const sheet = workbook.Sheets[nomeAba];
    const linhas: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, {
      defval: null,
      raw: true,
    });

    return linhas.map((raw) => {
      // Usa os helpers do PlanilhaService (replicados aqui para independência)
      const dataSerial = this.getNum(raw, 'DATA SAIDA');
      const dataSaida = dataSerial ? ColetaData.fromExcelDate(dataSerial) : null;

      const linha: LinhaParseada = {
        raw,
        dataSaida,
        placa: this.getStr(raw, 'PLACA'),
        turno: this.getStr(raw, 'TURNO'),
        regional: this.getStr(raw, 'REGIONAL'),
        distrito: this.getStr(raw, 'DISTRITO'),
        motorista: this.getStr(raw, 'MOTORISTA'),
        numeroColetores: this.getInt(raw, 'Nº DE COLETORES'),
        kmSaida: this.getNum(raw, 'KM SAIDA'),
        horaSaida: this.getNum(raw, 'HORA SÁIDA'),
        kmChegada: this.getNum(raw, 'KM CHEGADA'),
        horaChegada: this.getNum(raw, 'HORA CHEGADA'),
        horaUltimoTerminoCarregamento: this.getNum(raw, 'HORA ULTIMO TÉRMINO DO CARREGAMENTO'),
        peso1: this.getNum(raw, 'PESO 1'),
        peso2: this.getNum(raw, 'PESO 2'),
        peso3: this.getNum(raw, 'PESO 3'),
        peso4: this.getNum(raw, 'PESO 4'),
        peso5: this.getNum(raw, 'PESO 5'),
        pesoTotal: this.getNum(raw, 'PESO TOTAL'),
        tempoForaUnidade: this.getNum(raw, 'TEMPO FORA DA UNIDADE'),
        horasForaUnidade: this.getNum(raw, 'HORAS QUE FICA FORA DA UNIDADE'),
        tipoCaminhao: this.getStr(raw, 'CAMINHÃO'),
        kmTotal: this.getNum(raw, 'KM TOTAL'),
        numeroViagens: this.getInt(raw, 'Nº DE VIAGENS'),
        diaSemana: this.getInt(raw, 'DIA DA SEMANA'),
      };

      return linha;
    });
  }

  // ── Helpers de extração (replicados do PlanilhaService) ──

  private normalizarChave(chave: string): string {
    return chave
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/[^A-Z0-9\s]/g, '')
      .replace(/\s+(BASE|ROTA\s*\d+)\s*/g, ' ')
      .replace(/\s+/g, '')
      .trim();
  }

  private encontrarChave(obj: any, key: string): string | null {
    if (obj[key] !== undefined && obj[key] !== null) return key;
    if (obj[key.trim()] !== undefined && obj[key.trim()] !== null) return key.trim();
    if (obj[' ' + key + ' '] !== undefined && obj[' ' + key + ' '] !== null) return ' ' + key + ' ';
    if (obj[' ' + key] !== undefined && obj[' ' + key] !== null) return ' ' + key;
    if (obj[key + ' '] !== undefined && obj[key + ' '] !== null) return key + ' ';

    const keyNorm = this.normalizarChave(key);
    const chaves = Object.keys(obj);
    for (const ch of chaves) {
      const chNorm = this.normalizarChave(ch);
      if (keyNorm.length > 0 && chNorm.includes(keyNorm)) return ch;
      if (keyNorm.length > 0 && keyNorm.includes(chNorm)) return ch;
    }
    return null;
  }

  private getStr(obj: any, key: string): string | null {
    const chave = this.encontrarChave(obj, key);
    if (!chave) return null;
    const valor = obj[chave];
    if (valor === null || valor === undefined) return null;
    const str = String(valor).trim();
    return str || null;
  }

  private getNum(obj: any, key: string): number | null {
    const chave = this.encontrarChave(obj, key);
    if (!chave) return null;
    const valor = obj[chave];
    if (valor === null || valor === undefined) return null;
    const num = Number(valor);
    return isNaN(num) ? null : num;
  }

  private getInt(obj: any, key: string): number | null {
    const num = this.getNum(obj, key);
    return num !== null ? Math.round(num) : null;
  }

  /**
   * ════════════════════════════════════════════════════════════
   * API PÚBLICA — Análise de Conflitos
   * ════════════════════════════════════════════════════════════
   */

  /**
   * Analisa uma planilha comparando com os dados já existentes no banco
   * para um determinado serviço. NÃO importa nada — apenas classifica.
   * 
   * @param buffer - Conteúdo da planilha
   * @param servicoId - ID do serviço (para filtrar registros existentes)
   * @returns Resultado da análise com as 3 categorias
   */
  async analisarPlanilha(buffer: Buffer, servicoId?: string): Promise<ResultadoAnalise> {
    const linhas = this.parsearLinhas(buffer);

    // Se não há serviço, todos são "novos" (não temos referência)
    if (!servicoId) {
      return {
        totalLinhas: linhas.length,
        novos: linhas.map((l, i) => ({
          indice: i,
          classificacao: 'novo' as ClassificacaoLinha,
          chave: this.gerarChave(l.dataSaida, l.placa, l.turno),
          dadosPlanilha: l,
        })),
        duplicados: [],
        conflitantes: [],
        chaveUsada: 'dataSaida + placa + turno',
      };
    }

    // Buscar uploads do serviço para saber quais IDs de upload pertencem a ele
    const uploads = await this.uploadRepo.find({
      where: { servico_id: servicoId },
      select: ['id'],
    });
    const uploadIds = uploads.map(u => u.id);

    if (uploadIds.length === 0) {
      // Serviço sem uploads anteriores — todos são novos
      return {
        totalLinhas: linhas.length,
        novos: linhas.map((l, i) => ({
          indice: i,
          classificacao: 'novo' as ClassificacaoLinha,
          chave: this.gerarChave(l.dataSaida, l.placa, l.turno),
          dadosPlanilha: l,
        })),
        duplicados: [],
        conflitantes: [],
        chaveUsada: 'dataSaida + placa + turno',
      };
    }

    // Gerar chaves de todas as linhas da planilha
    const chavesPlanilha = linhas.map(l => this.gerarChave(l.dataSaida, l.placa, l.turno));
    
    // ⭐ DEBUG: mostrar as chaves geradas
    console.log('[DEBUG analisarPlanilha] servicoId:', servicoId);
    console.log('[DEBUG analisarPlanilha] uploadIds:', uploadIds);
    console.log('[DEBUG analisarPlanilha] total linhas parseadas:', linhas.length);
    for (let di = 0; di < linhas.length; di++) {
      const l = linhas[di];
      console.log(`[DEBUG] Linha ${di}: dataSaida=${l.dataSaida} (${typeof l.dataSaida}), placa=${l.placa}, turno=${l.turno}, chave=${chavesPlanilha[di]}`);
    }

    // Buscar TODOS os registros existentes que correspondam a essas chaves
    // Precisamos buscar por dataSaida, placa e turno individualmente
    // Como a chave é composta, vamos buscar por lote

    const linhasComData: Date[] = [];
    const placas: string[] = [];
    const turnos: string[] = [];

    for (const linha of linhas) {
      if (linha.dataSaida) {
        const d = new Date(linha.dataSaida);
        // Normalizar para YYYY-MM-DD
        d.setHours(0, 0, 0, 0);
        linhasComData.push(d);
      }
      if (linha.placa) placas.push(linha.placa.toUpperCase().trim());
      if (linha.turno) turnos.push(linha.turno.toUpperCase().trim());
    }

    // Buscar registros existentes no banco que podem coincidir
    const registrosExistentes = await this.coletaRepo.createQueryBuilder('c')
      .where('c.planilhaUploadId IN (:...uploadIds)', { uploadIds })
      .andWhere('c.dataSaida IS NOT NULL')
      .andWhere('c.placa IS NOT NULL')
      .getMany();

    // Indexar registros existentes por chave
    const mapaBanco = new Map<string, ColetaData>();
    console.log('[DEBUG analisarPlanilha] registrosExistentes.length:', registrosExistentes.length);
    for (const reg of registrosExistentes) {
      const chave = this.gerarChaveDeColeta(reg);
      console.log(`[DEBUG] Banco reg id=${reg.id}: dataSaida=${reg.dataSaida} (${typeof reg.dataSaida}), placa=${reg.placa}, turno=${reg.turno}, chave=${chave}`);
      if (!mapaBanco.has(chave)) {
        mapaBanco.set(chave, reg);
      }
    }
    console.log('[DEBUG] mapaBanco chaves:', Array.from(mapaBanco.keys()));

    // Classificar cada linha
    const novos: LinhaAnalisada[] = [];
    const duplicados: LinhaAnalisada[] = [];
    const conflitantes: LinhaAnalisada[] = [];

    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      const chave = chavesPlanilha[i];
      const registroBanco = mapaBanco.get(chave);

      if (!registroBanco) {
        console.log(`[DEBUG] Linha ${i}: chave=${chave} -> NOVO (nao encontrado no banco)`);
        // Chave não existe no banco → NOVO
        novos.push({
          indice: i,
          classificacao: 'novo',
          chave,
          dadosPlanilha: linha,
        });
      } else {
        // Chave já existe → comparar campos
        const camposPlanilha = this.extrairCamposComparacao(linha);
        const camposBanco = this.extrairCamposComparacao({
          ...linha,
          ...registroBanco,
          raw: registroBanco.dados || {},
        });
        const diferencas = this.compararCampos(camposPlanilha, registroBanco);

        if (diferencas.length === 0) {
          // Mesmos valores → DUPLICADO
          duplicados.push({
            indice: i,
            classificacao: 'duplicado',
            chave,
            dadosPlanilha: linha,
            dadosBanco: registroBanco,
          });
        } else {
          // Valores diferentes → CONFLITANTE
          conflitantes.push({
            indice: i,
            classificacao: 'conflitante',
            chave,
            dadosPlanilha: linha,
            dadosBanco: registroBanco,
            diferencas,
          });
        }
      }
    }

    return {
      totalLinhas: linhas.length,
      novos,
      duplicados,
      conflitantes,
      chaveUsada: 'dataSaida + placa + turno',
    };
  }

  /**
   * ════════════════════════════════════════════════════════════
   * API PÚBLICA — Importação com Deduplicação
   * ════════════════════════════════════════════════════════════
   */

  /**
   * Importa uma planilha aplicando a estratégia de conflito escolhida.
   * 
   * @param buffer - Conteúdo da planilha
   * @param nomeArquivo - Nome original do arquivo
   * @param estrategia - Estratégia para conflitos: 'ignorar' | 'substituir'
   * @param usuarioId - ID do usuário (opcional)
   * @param servicoId - ID do serviço (opcional)
   * @returns Resultado detalhado da importação
   */
  async importarComDedup(
    buffer: Buffer,
    nomeArquivo: string,
    estrategia: 'ignorar' | 'substituir',
    usuarioId?: string,
    servicoId?: string
  ): Promise<ResultadoImportacaoDedup> {
    // 1. Analisar conflitos
    const analise = await this.analisarPlanilha(buffer, servicoId);

    // 2. Criar registro de upload
    const upload = this.uploadRepo.create({
      nomeArquivo,
      totalLinhas: analise.totalLinhas,
      linhasImportadas: 0,
      linhasComErro: 0,
      linhasIgnoradas: 0,
      linhasSubstituidas: 0,
      linhasConflitantes: analise.conflitantes.length,
      estrategia,
      usuarioId: usuarioId || null,
      servico_id: servicoId || null,
      resumo: {
        novos: analise.novos.length,
        duplicadosIgnorados: analise.duplicados.length,
        conflitantes: analise.conflitantes.length,
        substituidos: 0,
      },
    });
    const uploadSalvo = await this.uploadRepo.save(upload);

    let importados = 0;
    let ignorados = 0;
    let substituidos = 0;
    let erros = 0;
    let viagensInconsistentes = 0;

    // 3. Identificar registros a excluir (se estratégia = substituir)
    if (estrategia === 'substituir' && analise.conflitantes.length > 0) {
      const idsExcluir = analise.conflitantes
        .map(c => (c.dadosBanco as ColetaData)?.id)
        .filter(Boolean);
      if (idsExcluir.length > 0) {
        await this.coletaRepo.delete({ id: In(idsExcluir) });
      }
    }

    // 4. Processar registros
    // - Novos: sempre inserir
    // - Duplicados: ignorar (a menos que estratégia seja substituir)
    // - Conflitantes: se estratégia = substituir, já excluímos acima e vamos reinserir
    //                 se estratégia = ignorar, não inserimos

    const batch: ColetaData[] = [];
    const BATCH_SIZE = 500;

    // Função auxiliar para criar entidade ColetaData a partir de LinhaParseada
    const criarColeta = (linha: LinhaParseada): ColetaData => {
      const coleta = new ColetaData();
      coleta.planilhaUploadId = uploadSalvo.id;
      coleta.dataSaida = linha.dataSaida;
      coleta.turno = linha.turno;
      coleta.regional = linha.regional;
      coleta.distrito = linha.distrito;
      coleta.placa = linha.placa;
      coleta.motorista = linha.motorista;
      coleta.numeroColetores = linha.numeroColetores;
      coleta.kmSaida = linha.kmSaida;
      coleta.horaSaida = linha.horaSaida;
      coleta.kmChegada = linha.kmChegada;
      coleta.horaChegada = linha.horaChegada;
      coleta.horaUltimoTerminoCarregamento = linha.horaUltimoTerminoCarregamento;
      coleta.peso1 = linha.peso1;
      coleta.peso2 = linha.peso2;
      coleta.peso3 = linha.peso3;
      coleta.peso4 = linha.peso4;
      coleta.peso5 = linha.peso5;
      coleta.pesoTotal = linha.pesoTotal;
      coleta.tempoForaUnidade = linha.tempoForaUnidade;
      coleta.horasForaUnidade = linha.horasForaUnidade;
      coleta.tipoCaminhao = linha.tipoCaminhao;
      coleta.kmTotal = linha.kmTotal;
      coleta.numeroViagens = linha.numeroViagens;
      coleta.diaSemana = linha.diaSemana;
      coleta.dados = this.filtrarChavesVazias(linha.raw);
      const validacao = prepararViagemParaImportacao(coleta);
      if (!validacao.validoDashboard) viagensInconsistentes++;
      return coleta;
    };

    // Processar NOVOS
    for (const item of analise.novos) {
      try {
        batch.push(criarColeta(item.dadosPlanilha));
        importados++;
        if (batch.length >= BATCH_SIZE) {
          await this.coletaRepo.save(batch);
          batch.length = 0;
        }
      } catch (err) {
        erros++;
      }
    }

    // Processar CONFLITANTES (apenas se estratégia = substituir)
    if (estrategia === 'substituir') {
      for (const item of analise.conflitantes) {
        try {
          batch.push(criarColeta(item.dadosPlanilha));
          substituidos++;
          importados++;
          if (batch.length >= BATCH_SIZE) {
            await this.coletaRepo.save(batch);
            batch.length = 0;
          }
        } catch (err) {
          erros++;
        }
      }
    } else {
      ignorados += analise.conflitantes.length;
    }

    // Processar DUPLICADOS
    ignorados += analise.duplicados.length;

    // Salvar lote final
    if (batch.length > 0) {
      await this.coletaRepo.save(batch);
    }

    // 5. Atualizar metadados do upload
    uploadSalvo.linhasImportadas = importados;
    uploadSalvo.linhasIgnoradas = ignorados;
    uploadSalvo.linhasSubstituidas = substituidos;
    uploadSalvo.linhasComErro = erros;
    const detalhes: { data: string; placa: string; motivo: string }[] = [];
    if (analise.conflitantes.length > 0) {
      for (const c of analise.conflitantes.slice(0, 50)) {
        detalhes.push({
          data: c.dadosPlanilha.dataSaida
            ? c.dadosPlanilha.dataSaida.toISOString().slice(0, 10)
            : 'N/A',
          placa: c.dadosPlanilha.placa || 'N/A',
          motivo: `Campos diferentes: ${(c.diferencas || []).join(', ')}`,
        });
      }
    }
    uploadSalvo.resumo = {
      novos: analise.novos.length,
      duplicadosIgnorados: analise.duplicados.length,
      conflitantes: analise.conflitantes.length,
      substituidos,
      detalhes,
      viagensInconsistentes,
      viagensValidasDashboard: importados - viagensInconsistentes,
    };

    await this.uploadRepo.save(uploadSalvo);

    // ⭐ Pós-importação: limpeza de duplicatas via SQL (rede de segurança)
    const duplicatasRemovidas = await this.limparDuplicatas(servicoId);

    return {
      planilhaUploadId: uploadSalvo.id,
      totalLinhas: analise.totalLinhas,
      importados,
      ignorados,
      substituidos,
      erros,
      viagensInconsistentes,
      viagensValidasDashboard: importados - viagensInconsistentes,
      resumo: {
        novos: analise.novos.length,
        duplicadosIgnorados: analise.duplicados.length,
        conflitantes: analise.conflitantes.length,
        substituidos,
        viagensInconsistentes,
        viagensValidasDashboard: importados - viagensInconsistentes,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 🆕 API — Análise e Importação por Data (dedup por data)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Analisa uma planilha agrupando por DATA e verificando
   * quais datas já existem no banco para um serviço.
   * 
   * Diferente da analisarPlanilha() que compara registro a registro
   * (dataSaida + placa + turno), esta analisa apenas por data.
   * 
   * @param buffer - Conteúdo da planilha
   * @param servicoId - ID do serviço
   */
  async analisarPlanilhaPorData(buffer: Buffer, servicoId?: string): Promise<{
    totalLinhas: number;
    totalDatas: number;
    datasExistentes: { data: string; registrosBanco: number; registrosPlanilha: number }[];
    datasNovas: { data: string; registrosPlanilha: number }[];
    linhasIgnoradas: number;
    linhasImportaveis: number;
  }> {
    const linhas = this.parsearLinhas(buffer);

    // Agrupar linhas por data
    const mapaDatas = new Map<string, LinhaParseada[]>();
    for (const linha of linhas) {
      if (!linha.dataSaida) continue;
      const chaveData = linha.dataSaida.toISOString().slice(0, 10);
      if (!mapaDatas.has(chaveData)) {
        mapaDatas.set(chaveData, []);
      }
      mapaDatas.get(chaveData)!.push(linha);
    }

    const datasUnicas = Array.from(mapaDatas.keys()).sort();

    // Se não tem serviço, todas são novas
    if (!servicoId) {
      return {
        totalLinhas: linhas.length,
        totalDatas: datasUnicas.length,
        datasExistentes: [],
        datasNovas: datasUnicas.map(d => ({
          data: d,
          registrosPlanilha: mapaDatas.get(d)!.length,
        })),
        linhasIgnoradas: 0,
        linhasImportaveis: linhas.length,
      };
    }

    // Buscar IDs de upload do serviço
    const uploads = await this.uploadRepo.find({
      where: { servico_id: servicoId },
      select: ['id'],
    });
    const uploadIds = uploads.map(u => u.id);

    if (uploadIds.length === 0) {
      return {
        totalLinhas: linhas.length,
        totalDatas: datasUnicas.length,
        datasExistentes: [],
        datasNovas: datasUnicas.map(d => ({
          data: d,
          registrosPlanilha: mapaDatas.get(d)!.length,
        })),
        linhasIgnoradas: 0,
        linhasImportaveis: linhas.length,
      };
    }

    // Para cada data única, contar registros existentes no banco
    const datasExistentes: { data: string; registrosBanco: number; registrosPlanilha: number }[] = [];
    const datasNovas: { data: string; registrosPlanilha: number }[] = [];

    for (const dataStr of datasUnicas) {
      const dataInicio = new Date(dataStr + 'T00:00:00');
      const dataFim = new Date(dataStr + 'T23:59:59');

      const count = await this.coletaRepo.createQueryBuilder('c')
        .where('c.planilhaUploadId IN (:...uploadIds)', { uploadIds })
        .andWhere('c.dataSaida BETWEEN :inicio AND :fim', { inicio: dataInicio, fim: dataFim })
        .getCount();

      const qtdPlanilha = mapaDatas.get(dataStr)!.length;

      if (count > 0) {
        datasExistentes.push({ data: dataStr, registrosBanco: count, registrosPlanilha: qtdPlanilha });
      } else {
        datasNovas.push({ data: dataStr, registrosPlanilha: qtdPlanilha });
      }
    }

    const totalIgnorados = datasExistentes.reduce((acc, d) => acc + d.registrosPlanilha, 0);
    const totalImportaveis = datasNovas.reduce((acc, d) => acc + d.registrosPlanilha, 0);

    return {
      totalLinhas: linhas.length,
      totalDatas: datasUnicas.length,
      datasExistentes,
      datasNovas,
      linhasIgnoradas: totalIgnorados,
      linhasImportaveis: totalImportaveis,
    };
  }

  /**
   * Importa uma planilha usando estratégia baseada em DATA.
   * 
   * 'atualizar_data' → apaga TODOS os registros do banco cuja dataSaida
   *   esteja na planilha, depois insere todos os dados novos.
   *   Ideal para substituir planilhas corrigidas de um período.
   * 
   * 'inserir_data' → insere apenas registros de datas que AINDA NÃO
   *   existem no banco. Datas já existentes são ignoradas.
   *   Ideal para adicionar novos dias sem sobrescrever existentes.
   * 
   * @param buffer - Conteúdo da planilha
   * @param nomeArquivo - Nome original do arquivo
   * @param estrategia - 'atualizar_data' | 'inserir_data'
   * @param usuarioId - ID do usuário (opcional)
   * @param servicoId - ID do serviço (opcional)
   */
  async importarPorData(
    buffer: Buffer,
    nomeArquivo: string,
    estrategia: 'atualizar_data' | 'inserir_data',
    usuarioId?: string,
    servicoId?: string
  ): Promise<{
    planilhaUploadId: number;
    totalLinhas: number;
    importados: number;
    ignorados: number;
    datasExistentes: number;
    datasNovas: number;
    datasApagadas: { data: string; registrosRemovidos: number }[];
    modo: 'atualizar_data' | 'inserir_data';
    viagensInconsistentes?: number;
    viagensValidasDashboard?: number;
  }> {
    const linhas = this.parsearLinhas(buffer);

    // Agrupar por data
    const mapaDatas = new Map<string, LinhaParseada[]>();
    for (const linha of linhas) {
      if (!linha.dataSaida) continue;
      const chaveData = linha.dataSaida.toISOString().slice(0, 10);
      if (!mapaDatas.has(chaveData)) {
        mapaDatas.set(chaveData, []);
      }
      mapaDatas.get(chaveData)!.push(linha);
    }

    const datasUnicas = Array.from(mapaDatas.keys()).sort();

    // Criar registro de upload
    const upload = this.uploadRepo.create({
      nomeArquivo,
      totalLinhas: linhas.length,
      linhasImportadas: 0,
      linhasComErro: 0,
      linhasIgnoradas: 0,
      linhasSubstituidas: 0,
      linhasConflitantes: 0,
      estrategia,
      usuarioId: usuarioId || null,
      servico_id: servicoId || null,
      resumo: null,
    });
    const uploadSalvo = await this.uploadRepo.save(upload);

    const datasApagadas: { data: string; registrosRemovidos: number }[] = [];
    let importados = 0;
    let ignorados = 0;
    let viagensInconsistentes = 0;

    // Se tem serviço, buscar upload IDs
    let uploadIds: number[] = [];
    if (servicoId) {
      const uploads = await this.uploadRepo.find({
        where: { servico_id: servicoId },
        select: ['id'],
      });
      uploadIds = uploads.map(u => u.id);
    }

    // ─── Decidir quais datas importar ───
    const datasParaImportar: string[] = [];

    if (estrategia === 'atualizar_data') {
      // Remove registros de TODAS as datas da planilha
      if (uploadIds.length > 0) {
        for (const dataStr of datasUnicas) {
          const dataInicio = new Date(dataStr + 'T00:00:00');
          const dataFim = new Date(dataStr + 'T23:59:59');

          const registrosParaApagar = await this.coletaRepo.createQueryBuilder('c')
            .where('c.planilhaUploadId IN (:...uploadIds)', { uploadIds })
            .andWhere('c.dataSaida BETWEEN :inicio AND :fim', { inicio: dataInicio, fim: dataFim })
            .getCount();

          if (registrosParaApagar > 0) {
            await this.coletaRepo.createQueryBuilder()
              .delete()
              .from('coleta_dados')
              .where('planilhaUploadId IN (:...uploadIds)', { uploadIds })
              .andWhere('dataSaida BETWEEN :inicio AND :fim', { inicio: dataInicio, fim: dataFim })
              .execute();

            datasApagadas.push({ data: dataStr, registrosRemovidos: registrosParaApagar });
          }
        }
      }
      // Importa todas as datas
      datasParaImportar.push(...datasUnicas);
    } else {
      // 'inserir_data': só importa datas que NÃO existem
      if (uploadIds.length > 0) {
        for (const dataStr of datasUnicas) {
          const dataInicio = new Date(dataStr + 'T00:00:00');
          const dataFim = new Date(dataStr + 'T23:59:59');

          const count = await this.coletaRepo.createQueryBuilder('c')
            .where('c.planilhaUploadId IN (:...uploadIds)', { uploadIds })
            .andWhere('c.dataSaida BETWEEN :inicio AND :fim', { inicio: dataInicio, fim: dataFim })
            .getCount();

          if (count === 0) {
            datasParaImportar.push(dataStr);
          }
        }
      } else {
        datasParaImportar.push(...datasUnicas);
      }
    }

    const datasSet = new Set(datasParaImportar);

    // ─── Inserir registros ───
    const batch: ColetaData[] = [];
    const BATCH_SIZE = 500;

    for (const linha of linhas) {
      if (!linha.dataSaida) {
        ignorados++;
        continue;
      }
      const chaveData = linha.dataSaida.toISOString().slice(0, 10);

      if (!datasSet.has(chaveData)) {
        ignorados++;
        continue;
      }

      try {
        const coleta = new ColetaData();
        coleta.planilhaUploadId = uploadSalvo.id;
        coleta.dataSaida = linha.dataSaida;
        coleta.turno = linha.turno;
        coleta.regional = linha.regional;
        coleta.distrito = linha.distrito;
        coleta.placa = linha.placa;
        coleta.motorista = linha.motorista;
        coleta.numeroColetores = linha.numeroColetores;
        coleta.kmSaida = linha.kmSaida;
        coleta.horaSaida = linha.horaSaida;
        coleta.kmChegada = linha.kmChegada;
        coleta.horaChegada = linha.horaChegada;
        coleta.horaUltimoTerminoCarregamento = linha.horaUltimoTerminoCarregamento;
        coleta.peso1 = linha.peso1;
        coleta.peso2 = linha.peso2;
        coleta.peso3 = linha.peso3;
        coleta.peso4 = linha.peso4;
        coleta.peso5 = linha.peso5;
        coleta.pesoTotal = linha.pesoTotal;
        coleta.tempoForaUnidade = linha.tempoForaUnidade;
        coleta.horasForaUnidade = linha.horasForaUnidade;
        coleta.tipoCaminhao = linha.tipoCaminhao;
        coleta.kmTotal = linha.kmTotal;
        coleta.numeroViagens = linha.numeroViagens;
        coleta.diaSemana = linha.diaSemana;
        coleta.dados = this.filtrarChavesVazias(linha.raw);
        const validacao = prepararViagemParaImportacao(coleta);
        if (!validacao.validoDashboard) viagensInconsistentes++;
        batch.push(coleta);
        importados++;

        if (batch.length >= BATCH_SIZE) {
          await this.coletaRepo.save(batch);
          batch.length = 0;
        }
      } catch (err) {
        // Linha com erro é ignorada
      }
    }

    if (batch.length > 0) {
      await this.coletaRepo.save(batch);
    }

    // ─── Atualizar metadados do upload ───
    uploadSalvo.linhasImportadas = importados;
    uploadSalvo.linhasIgnoradas = ignorados;
    uploadSalvo.linhasSubstituidas = estrategia === 'atualizar_data' ? importados : 0;
    uploadSalvo.resumo = {
      novos: importados,
      duplicadosIgnorados: ignorados,
      conflitantes: 0,
      substituidos: estrategia === 'atualizar_data' ? importados : 0,
      viagensInconsistentes,
      viagensValidasDashboard: importados - viagensInconsistentes,
    };
    await this.uploadRepo.save(uploadSalvo);

    // ⭐ Pós-importação: limpeza de duplicatas via SQL (rede de segurança)
    const duplicatasRemovidas = await this.limparDuplicatas(servicoId);

    return {
      planilhaUploadId: uploadSalvo.id,
      totalLinhas: linhas.length,
      importados,
      ignorados,
      datasExistentes: datasApagadas.length,
      datasNovas: datasParaImportar.length,
      datasApagadas,
      modo: estrategia,
      viagensInconsistentes,
      viagensValidasDashboard: importados - viagensInconsistentes,
    };
  }

  /**
   * Filtra chaves artefato do Excel
   */
  private filtrarChavesVazias(linha: Record<string, any>): Record<string, any> {
    const resultado: Record<string, any> = {};
    for (const [chave, valor] of Object.entries(linha)) {
      const nome = (chave || '').trim();
      if (!nome || nome.startsWith('__EMPTY')) continue;
      if (valor === null || valor === undefined || valor === '') continue;
      resultado[chave] = valor;
    }
    return resultado;
  }
}

export default new DeduplicacaoService();
