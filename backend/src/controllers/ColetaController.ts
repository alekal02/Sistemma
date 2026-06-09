import { Request, Response } from 'express';
import PlanilhaService from '../services/PlanilhaService';
import DeduplicacaoService from '../services/DeduplicacaoService';
import QualidadeDadosService from '../services/QualidadeDadosService';
import { analisarQualidadePlanilha } from '../services/QualidadePlanilhaPreviewService';
import AppDataSource from '../database/data-source';
import { User } from '../entities/User';

// Extensão para request com file do multer
interface RequestWithFile extends Request {
  file?: Express.Multer.File;
}

/**
 * Controller para upload de planilhas e consulta de dados de coleta
 */
export class ColetaController {
  /**
   * Valida se o usuarioId realmente existe no banco.
   * Se o banco foi resetado, tokens antigos podem ter IDs inválidos.
   */
  private async validarUsuarioId(usuarioId?: string): Promise<string | null> {
    if (!usuarioId) return null;
    try {
      const userRepo = AppDataSource.getRepository(User);
      const existe = await userRepo.findOne({ where: { id: usuarioId }, select: ['id'] });
      return existe ? usuarioId : null;
    } catch {
      return null;
    }
  }

  /**
   * POST /api/coleta/upload
   * Faz upload e importa dados de uma planilha XLSX
   * Agora aceita estratégia de conflito para deduplicação.
   * 
   * Body (multipart):
   *   - planilha: arquivo .xlsx/.xls
   *   - servico_id: string (opcional)
   *   - estrategia: 'ignorar' | 'substituir' | 'atualizar_data' | 'inserir_data'
   *     (opcional, default 'ignorar')
   */
  async upload(req: RequestWithFile, res: Response): Promise<void> {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        return;
      }

      // Validar extensão
      const ext = file.originalname.split('.').pop()?.toLowerCase();
      if (ext !== 'xlsx' && ext !== 'xls') {
        res.status(400).json({ error: 'Formato inválido. Envie um arquivo .xlsx ou .xls.' });
        return;
      }

      const { servico_id, estrategia: estrategiaRaw } = req.body;

      // Validar usuarioId contra o banco (evita FK violation se banco foi resetado)
      const usuarioIdValido = await this.validarUsuarioId(req.usuario?.id);

      // Normalizar estratégia
      let estrategia: 'ignorar' | 'substituir' | 'atualizar_data' | 'inserir_data' = 'ignorar';
      if (estrategiaRaw === 'substituir') estrategia = 'substituir';
      else if (estrategiaRaw === 'atualizar_data') estrategia = 'atualizar_data';
      else if (estrategiaRaw === 'inserir_data') estrategia = 'inserir_data';

      let resultado: any;

      // Estratégias por data usam o novo pipeline
      if (estrategia === 'atualizar_data' || estrategia === 'inserir_data') {
        resultado = await DeduplicacaoService.importarPorData(
          file.buffer,
          file.originalname,
          estrategia,
          usuarioIdValido ?? undefined,
          servico_id
        );
      } else {
        resultado = await DeduplicacaoService.importarComDedup(
          file.buffer,
          file.originalname,
          estrategia,
          usuarioIdValido ?? undefined,
          servico_id
        );
      }

      // Também disparar a detecção de padrão (como fazia o fluxo antigo)
      if (servico_id) {
        try {
          const { detectarPadraoPlanilha } = await import('../services/PadraoPlanilhaDetector');
          const { gerarConfigGraficosPadrao, reResolverGraficos } = await import('../services/graficosPadrao');
          const ServicoRepo = (await import('../database/data-source')).default.getRepository('Servico');
          const servico = await ServicoRepo.findOne({ where: { id: servico_id } });
          if (servico) {
            const colunas = detectarPadraoPlanilha(file.buffer);
            const colunasNomes = colunas.map((c: any) => c.nome);
            const graficosAtuais = servico.configDashboard?.graficos || [];
            const graficosReResolvidos = graficosAtuais.length > 0
              ? reResolverGraficos(graficosAtuais, colunasNomes)
              : gerarConfigGraficosPadrao(servico.tipo || 'coleta_caminhao', colunasNomes);

            servico.padraoPlanilha = {
              colunas,
              totalLinhas: resultado.totalLinhas,
              ultimoUpload: resultado.planilhaUploadId,
              ultimoUploadNome: file.originalname,
              detectadoEm: new Date().toISOString(),
            };
            servico.configDashboard = {
              ...(servico.configDashboard || {}),
              graficos: graficosReResolvidos,
              reResolvidoEm: new Date().toISOString(),
              reResolvido: true,
              graficosPadraoAplicados: true,
              graficosPadraoTotal: graficosReResolvidos.length,
            };
            await ServicoRepo.save(servico);
          }
        } catch (err) {
          console.warn('[ColetaController] Erro ao detectar padrão:', err);
        }
      }

      let mensagem: string;
      if (estrategia === 'atualizar_data' || estrategia === 'inserir_data') {
        if (resultado.ignorados > 0) {
          mensagem = `Planilha processada! ${resultado.importados} registros importados, ${resultado.ignorados} ignorados (${resultado.datasApagadas?.length || 0} datas substituídas).`;
        } else {
          mensagem = `Planilha processada! ${resultado.importados} registros importados de ${resultado.totalLinhas}.`;
        }
      } else {
        mensagem = resultado.ignorados > 0
          ? `Planilha processada! ${resultado.importados} registros importados, ${resultado.ignorados} duplicatas ignoradas.`
          : `Planilha processada! ${resultado.importados} registros importados de ${resultado.totalLinhas}.`;
      }

      res.json({
        sucesso: true,
        ...resultado,
        mensagem,
      });
    } catch (error: any) {
      console.error('Erro ao importar planilha:', error);
      res.status(500).json({ error: error.message || 'Erro ao processar planilha.' });
    }
  }

  /**
   * POST /api/coleta/upload/preview
   * Analisa uma planilha sem importar — mostra o resumo de conflitos.
   * 
   * Body (multipart):
   *   - planilha: arquivo .xlsx/.xls
   *   - servico_id: string (opcional)
   */
  async previewUpload(req: RequestWithFile, res: Response): Promise<void> {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        return;
      }

      const ext = file.originalname.split('.').pop()?.toLowerCase();
      if (ext !== 'xlsx' && ext !== 'xls') {
        res.status(400).json({ error: 'Formato inválido. Envie um arquivo .xlsx ou .xls.' });
        return;
      }

      const { servico_id } = req.body;

      const analise = await DeduplicacaoService.analisarPlanilha(
        file.buffer,
        servico_id
      );

      // Amostra de conflitos (até 5) para exibição
      const amostraConflitos = analise.conflitantes.slice(0, 5).map(c => ({
        indice: c.indice,
        chave: c.chave,
        dadosPlanilha: {
          dataSaida: c.dadosPlanilha.dataSaida,
          placa: c.dadosPlanilha.placa,
          turno: c.dadosPlanilha.turno,
          motorista: c.dadosPlanilha.motorista,
          regional: c.dadosPlanilha.regional,
          pesoTotal: c.dadosPlanilha.pesoTotal,
          kmTotal: c.dadosPlanilha.kmTotal,
        },
        dadosBanco: c.dadosBanco ? {
          dataSaida: (c.dadosBanco as any).dataSaida,
          placa: (c.dadosBanco as any).placa,
          turno: (c.dadosBanco as any).turno,
          motorista: (c.dadosBanco as any).motorista,
          regional: (c.dadosBanco as any).regional,
          pesoTotal: (c.dadosBanco as any).pesoTotal,
          kmTotal: (c.dadosBanco as any).kmTotal,
        } : null,
        diferencas: c.diferencas,
      }));

      res.json({
        sucesso: true,
        totalLinhas: analise.totalLinhas,
        novos: analise.novos.length,
        duplicados: analise.duplicados.length,
        conflitantes: analise.conflitantes.length,
        temConflitos: analise.conflitantes.length > 0,
        amostraConflitos,
        chaveUsada: analise.chaveUsada,
        arquivo: file.originalname,
      });
    } catch (error: any) {
      console.error('Erro ao analisar planilha:', error);
      res.status(500).json({ error: error.message || 'Erro ao analisar planilha.' });
    }
  }

  /**
   * POST /api/coleta/upload/preview-data
   * Analisa uma planilha agrupando por DATA — mostra quantas datas
   * já existem no banco e quantas são novas.
   * 
   * Body (multipart):
   *   - planilha: arquivo .xlsx/.xls
   *   - servico_id: string (opcional)
   */
  async previewUploadData(req: RequestWithFile, res: Response): Promise<void> {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        return;
      }

      const ext = file.originalname.split('.').pop()?.toLowerCase();
      if (ext !== 'xlsx' && ext !== 'xls') {
        res.status(400).json({ error: 'Formato inválido. Envie um arquivo .xlsx ou .xls.' });
        return;
      }

      const { servico_id } = req.body;

      const analise = await DeduplicacaoService.analisarPlanilhaPorData(
        file.buffer,
        servico_id
      );

      res.json({
        sucesso: true,
        ...analise,
        arquivo: file.originalname,
      });
    } catch (error: any) {
      console.error('Erro ao analisar planilha por data:', error);
      res.status(500).json({ error: error.message || 'Erro ao analisar planilha.' });
    }
  }

  /**
   * GET /api/coleta/dashboard
   * Retorna dados agregados para o dashboard
   */
  async dashboard(req: Request, res: Response): Promise<void> {
    try {
      const { dataInicio, dataFim, regional, distrito, planilhaId } = req.query;

      const filtros = {
        dataInicio: dataInicio as string | undefined,
        dataFim: dataFim as string | undefined,
        regional: regional as string | undefined,
        distrito: distrito as string | undefined,
        planilhaId: planilhaId ? parseInt(planilhaId as string) : undefined,
      };

      const [
        resumo,
        pesoPorRegional,
        pesoPorDia,
        topPlacas,
        tipoCaminhao,
        dadosPorTurno,
        topMotoristas,
        dadosPorDiaSemana,
        listaRegionais,
        listaDistritos,
        listaUploads,
      ] = await Promise.all([
        PlanilhaService.getDashboardData(filtros),
        PlanilhaService.getPesoPorRegional(filtros),
        PlanilhaService.getPesoPorDia(filtros),
        PlanilhaService.getTopPlacas(10, filtros),
        PlanilhaService.getDistribuicaoTipoCaminhao(filtros),
        PlanilhaService.getDadosPorTurno(filtros),
        PlanilhaService.getTopMotoristas(10, filtros),
        PlanilhaService.getDadosPorDiaSemana(filtros),
        PlanilhaService.getListaRegionais(),
        PlanilhaService.getListaDistritos(),
        PlanilhaService.listarUploadsResumido(),
      ]);

      // Normalizar tipos numéricos (getRawMany retorna strings)
      const normalizar = (arr: any[], campos: string[]) =>
        arr.map(item => {
          const obj: any = { ...item };
          for (const campo of campos) {
            if (obj[campo] !== undefined && obj[campo] !== null) {
              obj[campo] = Number(obj[campo]);
            }
          }
          return obj;
        });

      res.json({
        resumo,
        pesoPorRegional: normalizar(pesoPorRegional, ['total_peso', 'quantidade']),
        pesoPorDia: normalizar(pesoPorDia, ['total_peso', 'quantidade', 'total_km', 'total_viagens']),
        topPlacas: normalizar(topPlacas, ['total_peso', 'quantidade', 'total_km', 'total_viagens']),
        tipoCaminhao: normalizar(tipoCaminhao, ['quantidade', 'total_peso', 'media_peso']),
        dadosPorTurno: normalizar(dadosPorTurno, ['quantidade', 'total_peso', 'media_peso']),
        topMotoristas: normalizar(topMotoristas, ['total_peso', 'quantidade', 'total_km', 'total_viagens']),
        dadosPorDiaSemana: normalizar(dadosPorDiaSemana, ['quantidade', 'total_peso', 'total_km', 'total_viagens']),
        listaRegionais: listaRegionais.map((r: any) => r.regional),
        listaDistritos: listaDistritos.map((d: any) => d.distrito),
        listaUploads,
      });
    } catch (error: any) {
      console.error('Erro ao carregar dashboard:', error);
      res.status(500).json({ error: error.message || 'Erro ao carregar dados do dashboard.' });
    }
  }

  /**
   * GET /api/coleta/uploads
   * Lista histórico de uploads (com filtro opcional por serviço)
   */
  async uploads(req: Request, res: Response): Promise<void> {
    try {
      const { servico_id } = req.query;
      let uploads;
      if (servico_id) {
        uploads = await PlanilhaService.listarUploadsPorServico(servico_id as string);
      } else {
        uploads = await PlanilhaService.listarUploads();
      }
      res.json(uploads);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Erro ao listar uploads.' });
    }
  }

  /**
   * GET /api/coleta/uploads/:id/export
   * Exporta os dados de um upload como planilha XLSX
   */
  async exportarUpload(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido.' });
        return;
      }

      const { buffer, nomeArquivo } = await PlanilhaService.exportarPlanilha(id);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
      res.send(buffer);
    } catch (error: any) {
      console.error('Erro ao exportar planilha:', error);
      res.status(500).json({ error: error.message || 'Erro ao exportar planilha.' });
    }
  }

  /**
   * GET /api/coleta/dados
   * Retorna dados brutos com paginação
   */
  async dados(req: Request, res: Response): Promise<void> {
    try {
      const { page = '1', limit = '50', regional, turno, placa, dataInicio, dataFim, planilhaId } = req.query;
      const pageNum = Math.max(1, parseInt(page as string));
      const limitNum = Math.min(500, Math.max(1, parseInt(limit as string)));
      const skip = (pageNum - 1) * limitNum;

      const qb = PlanilhaService['coletaRepo'].createQueryBuilder('c')
        .orderBy('c.dataSaida', 'DESC')
        .skip(skip)
        .take(limitNum);

      if (regional) qb.andWhere('c.regional = :regional', { regional });
      if (turno) qb.andWhere('c.turno = :turno', { turno });
      if (placa) qb.andWhere('c.placa = :placa', { placa });
      if (dataInicio) qb.andWhere('c.dataSaida >= :dataInicio', { dataInicio });
      if (dataFim) qb.andWhere('c.dataSaida <= :dataFim', { dataFim });
      if (planilhaId) qb.andWhere('c.planilhaUploadId = :planilhaId', { planilhaId: parseInt(planilhaId as string) });

      const [dados, total] = await qb.getManyAndCount();

      res.json({
        dados,
        total,
        pagina: pageNum,
        totalPaginas: Math.ceil(total / limitNum),
        limite: limitNum,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Erro ao buscar dados.' });
    }
  }

  /**
   * PUT /api/coleta/dados/:id
   * Atualiza um registro de coleta
   */
  async atualizarDado(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido.' });
        return;
      }

      const repo = PlanilhaService['coletaRepo'];
      const registro = await repo.findOne({ where: { id } });
      if (!registro) {
        res.status(404).json({ error: 'Registro não encontrado.' });
        return;
      }

      const camposPermitidos = [
        'turno', 'regional', 'distrito', 'placa', 'motorista',
        'numeroColetores', 'kmSaida', 'horaSaida', 'kmChegada', 'horaChegada',
        'peso1', 'peso2', 'peso3', 'peso4', 'peso5', 'pesoTotal',
        'kmTotal', 'numeroViagens', 'tipoCaminhao', 'dataSaida',
        'horaUltimoTerminoCarregamento', 'tempoForaUnidade', 'horasForaUnidade', 'diaSemana',
      ];

      for (const campo of camposPermitidos) {
        if (req.body[campo] !== undefined) {
          (registro as any)[campo] = req.body[campo];
        }
      }

      await repo.save(registro);
      res.json(registro);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Erro ao atualizar registro.' });
    }
  }

  /**
   * DELETE /api/coleta/dados/:id
   * Exclui um registro de coleta
   */
  async excluirDado(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido.' });
        return;
      }

      const repo = PlanilhaService['coletaRepo'];
      const registro = await repo.findOne({ where: { id } });
      if (!registro) {
        res.status(404).json({ error: 'Registro não encontrado.' });
        return;
      }

      await repo.remove(registro);
      res.json({ sucesso: true, mensagem: 'Registro excluído.' });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Erro ao excluir registro.' });
    }
  }

  /**
   * PUT /api/coleta/uploads/:id/rename
   * Renomeia o arquivo de um upload
   */
  async renomearUpload(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido.' });
        return;
      }
      const { nome } = req.body;
      if (!nome || typeof nome !== 'string' || nome.trim().length === 0) {
        res.status(400).json({ error: 'Nome inválido.' });
        return;
      }
      const upload = await PlanilhaService.renomearUpload(id, nome.trim());
      res.json(upload);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Erro ao renomear.' });
    }
  }

  /**
   * GET /api/coleta/estudo-viagens/:id
   * Retorna o estudo detalhado das viagens de um registro de coleta
   */
  async estudoViagens(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido.' });
        return;
      }
      const resultado = await PlanilhaService.getEstudoViagens(id);
      res.json(resultado);
    } catch (error: any) {
      console.error('Erro ao buscar estudo de viagens:', error);
      res.status(500).json({ error: error.message || 'Erro ao buscar estudo de viagens.' });
    }
  }

  /**
   * DELETE /api/coleta/uploads/:id
   * Exclui um upload e todos os dados vinculados
   */
  async excluirUpload(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID inválido.' });
        return;
      }
      await PlanilhaService.excluirUpload(id);
      res.json({ sucesso: true, mensagem: 'Upload excluído com sucesso.' });
    } catch (error: any) {
      console.error('Erro ao excluir upload:', error);
      res.status(500).json({ error: error.message || 'Erro ao excluir upload.' });
    }
  }

  /**
   * GET /api/coleta/qualidade/:uploadId
   * Retorna relatório de qualidade dos dados de um upload específico.
   * Detecta: KM negativo, viagens sem peso, sem KM inicial/final, etc.
   */
  async qualidade(req: Request, res: Response): Promise<void> {
    try {
      const uploadId = parseInt(String(req.params.uploadId));
      if (isNaN(uploadId)) {
        res.status(400).json({ error: 'ID de upload inválido.' });
        return;
      }
      const relatorio = await QualidadeDadosService.gerarRelatorio(uploadId);
      res.json(relatorio);
    } catch (error: any) {
      console.error('Erro ao gerar relatório de qualidade:', error);
      res.status(500).json({ error: error.message || 'Erro ao gerar relatório de qualidade.' });
    }
  }

  /**
   * GET /api/coleta/qualidade/servico/:servicoId
   * Retorna relatório de qualidade do último upload de um serviço
   */
  async qualidadeUltimoUpload(req: Request, res: Response): Promise<void> {
    try {
      const servicoIdParam = req.params.servicoId;
      if (!servicoIdParam || Array.isArray(servicoIdParam)) {
        res.status(400).json({ error: 'ID do serviço é obrigatório.' });
        return;
      }
      const relatorio = await QualidadeDadosService.gerarRelatorioUltimoUpload(servicoIdParam);
      if (!relatorio) {
        res.status(404).json({ error: 'Nenhum upload encontrado para este serviço.' });
        return;
      }
      res.json(relatorio);
    } catch (error: any) {
      console.error('Erro ao gerar relatório de qualidade:', error);
      res.status(500).json({ error: error.message || 'Erro ao gerar relatório de qualidade.' });
    }
  }

  /**
   * POST /api/coleta/preview-qualidade
   * Analisa a qualidade da planilha ANTES da importação.
   * Detecta células vazias, linhas vazias, dados no final,
   * duplicatas, valores negativos, etc.
   * 
   * Body (multipart):
   *   - planilha: arquivo .xlsx/.xls
   */
  async previewQualidade(req: RequestWithFile, res: Response): Promise<void> {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        return;
      }

      const ext = file.originalname.split('.').pop()?.toLowerCase();
      if (ext !== 'xlsx' && ext !== 'xls') {
        res.status(400).json({ error: 'Formato inválido. Envie um arquivo .xlsx ou .xls.' });
        return;
      }

      const relatorio = analisarQualidadePlanilha(file.buffer, file.originalname);

      res.json({
        sucesso: true,
        ...relatorio,
      });
    } catch (error: any) {
      console.error('Erro ao analisar qualidade da planilha:', error);
      res.status(500).json({ error: error.message || 'Erro ao analisar qualidade da planilha.' });
    }
  }
}
