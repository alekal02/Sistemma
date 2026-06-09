import { Request, Response } from 'express';
import AppDataSource from '../database/data-source';
import { Contract } from '../entities/Contract';
import { Servico } from '../entities/Servico';
import { PlanilhaUpload } from '../entities/PlanilhaUpload';
import { invalidarPdfCache } from '../services/PdfCacheManager';

export class ContractController {
  private get repository() {
    return AppDataSource.getRepository(Contract);
  }

  async listar(req: Request, res: Response): Promise<any> {
    try {
      const contracts = await this.repository.find({
        order: { criadoEm: 'DESC' },
      });

      return res.json({ contratos: contracts, total: contracts.length });
    } catch (error) {
      console.error('Erro ao listar contratos:', error);
      return res.status(500).json({ error: 'Erro ao carregar contratos' });
    }
  }

  async buscarUm(req: Request, res: Response): Promise<any> {
    try {
      const { id } = req.params as { id: string };
      const contract = await this.repository.findOne({ where: { id } });

      if (!contract) {
        return res.status(404).json({ error: 'Contrato não encontrado' });
      }

      return res.json(contract);
    } catch (error) {
      console.error('Erro ao buscar contrato:', error);
      return res.status(500).json({ error: 'Erro ao carregar contrato' });
    }
  }

  async criar(req: Request, res: Response): Promise<any> {
    try {
      const { numeroContrato, valorTonelada, valorMini, valorTruck, valorToco } = req.body;

      if (!numeroContrato || !numeroContrato.trim()) {
        return res.status(400).json({ error: 'Nome do contrato é obrigatório' });
      }

      const contract = this.repository.create({
        numeroContrato: numeroContrato.trim(),
        valorTonelada: valorTonelada !== undefined ? Number(valorTonelada) : null,
        valorMini: valorMini !== undefined ? Number(valorMini) : null,
        valorTruck: valorTruck !== undefined ? Number(valorTruck) : null,
        valorToco: valorToco !== undefined ? Number(valorToco) : null,
      });

      const novoContract = await this.repository.save(contract);

      return res.status(201).json(novoContract);
    } catch (error: any) {
      console.error('❌ Erro ao criar contrato:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao criar contrato' });
    }
  }

  async atualizar(req: Request, res: Response): Promise<any> {
    try {
      const { id } = req.params as { id: string };
      const { numeroContrato, valorTonelada, valorMini, valorTruck, valorToco } = req.body;

      const contract = await this.repository.findOne({ where: { id } });

      if (!contract) {
        return res.status(404).json({ error: 'Contrato não encontrado' });
      }

      if (numeroContrato !== undefined) {
        contract.numeroContrato = numeroContrato.trim();
      }
      if (valorTonelada !== undefined) contract.valorTonelada = Number(valorTonelada);
      if (valorMini !== undefined) contract.valorMini = Number(valorMini);
      if (valorTruck !== undefined) contract.valorTruck = Number(valorTruck);
      if (valorToco !== undefined) contract.valorToco = Number(valorToco);

      await this.repository.save(contract);

      // Invalidar cache do dashboard e PDF ao salvar valores do contrato
      invalidarPdfCache(id);
      invalidarPdfCache(); // limpar cache geral também

      return res.json(contract);
    } catch (error: any) {
      console.error('Erro ao atualizar contrato:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao atualizar contrato' });
    }
  }

  async excluir(req: Request, res: Response): Promise<any> {
    try {
      const { id } = req.params as { id: string };

      const contract = await this.repository.findOne({ where: { id } });
      if (!contract) {
        return res.status(404).json({ error: 'Contrato não encontrado' });
      }

      await this.repository.remove(contract);
      return res.json({ message: 'Contrato excluído com sucesso' });
    } catch (error: any) {
      console.error('Erro ao excluir contrato:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao excluir contrato' });
    }
  }

  /**
   * GET /api/contracts/:id/kpis
   * Retorna os KPIs configurados no contrato
   */
  async listarKpis(req: Request, res: Response): Promise<any> {
    try {
      const { id } = req.params as { id: string };
      const contract = await this.repository.findOne({ where: { id }, relations: ['servicos'] });

      if (!contract) {
        return res.status(404).json({ error: 'Contrato não encontrado' });
      }

      // Coletar colunas disponiveis de todos os servicos do contrato
      const colunasDisponiveis: { nome: string; tipo: string; servico: string }[] = [];
      for (const servico of contract.servicos || []) {
        const padrao = (servico as any).padraoPlanilha;
        if (padrao?.colunas) {
          for (const col of padrao.colunas) {
            colunasDisponiveis.push({
              nome: col.nome,
              tipo: col.tipo,
              servico: servico.nome,
            });
          }
        }
      }

      return res.json({
        kpis: contract.kpisConfig || [],
        colunasDisponiveis,
        valoresCaminhao: {
          VALOR_TONELADA: contract.valorTonelada,
          VALOR_MINI: contract.valorMini,
          VALOR_TRUCK: contract.valorTruck,
          VALOR_TOCO: contract.valorToco,
        },
      });
    } catch (error: any) {
      console.error('Erro ao listar KPIs:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao carregar KPIs' });
    }
  }

  /**
   * PUT /api/contracts/:id/kpis
   * Salva a configuracao de KPIs do contrato
   */
  async salvarKpis(req: Request, res: Response): Promise<any> {
    try {
      const { id } = req.params as { id: string };
      const { kpis } = req.body;

      const contract = await this.repository.findOne({ where: { id } });
      if (!contract) {
        return res.status(404).json({ error: 'Contrato não encontrado' });
      }

      contract.kpisConfig = kpis || [];
      await this.repository.save(contract);

      return res.json({ message: 'KPIs salvos com sucesso!', kpis: contract.kpisConfig });
    } catch (error: any) {
      console.error('Erro ao salvar KPIs:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao salvar KPIs' });
    }
  }

  /**
   * GET /api/contracts/:id/config-resumo
   * Retorna a configuracao do resumo executivo do contrato
   */
  async getConfigResumo(req: Request, res: Response): Promise<any> {
    try {
      const { id } = req.params as { id: string };
      const contract = await this.repository.findOne({ where: { id } });

      if (!contract) {
        return res.status(404).json({ error: 'Contrato não encontrado' });
      }

      return res.json({
        configResumo: contract.configResumo || null,
      });
    } catch (error: any) {
      console.error('Erro ao buscar config resumo:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao carregar configuração do resumo' });
    }
  }

  /**
   * PUT /api/contracts/:id/config-resumo
   * Salva a configuracao do resumo executivo do contrato
   * Body: { metricas: string[] }
   */
  async salvarConfigResumo(req: Request, res: Response): Promise<any> {
    try {
      const { id } = req.params as { id: string };
      const { configResumo } = req.body;

      const contract = await this.repository.findOne({ where: { id } });
      if (!contract) {
        return res.status(404).json({ error: 'Contrato não encontrado' });
      }

      contract.configResumo = configResumo || null;
      await this.repository.save(contract);

      return res.json({ message: 'Configuração do resumo salva com sucesso!', configResumo: contract.configResumo });
    } catch (error: any) {
      console.error('Erro ao salvar config resumo:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao salvar configuração do resumo' });
    }
  }

  /**
   * ⭐ GET /api/contracts/saude
   * Retorna dados consolidados de SAÚDE de TODOS os contratos.
   * Cada contrato inclui statusSaude (green/yellow/red),
   * totalServicos, servicosConfigurados, totalRegistros, ultimoUpload, tiposServico, etc.
   */
  async saudeLista(req: Request, res: Response): Promise<any> {
    try {
      const servicoRepo = AppDataSource.getRepository(Servico);
      const uploadRepo = AppDataSource.getRepository(PlanilhaUpload);

      const contracts = await this.repository.find({
        order: { criadoEm: 'DESC' },
      });

      const resultados = await Promise.all(
        contracts.map(async (contract) => {
          const servicos = await servicoRepo.find({ where: { contract_id: contract.id } });

          let totalRegistros = 0;
          let ultimoUpload: string | null = null;
          let tiposSet = new Set<string>();
          let servicosConfigurados = 0;
          let servicosComUpload = 0;
          let servicosSemKpi = 0;
          let totalKpisAtivos = 0;

          const servicosComDados = await Promise.all(
            servicos.map(async (s) => {
              const uploads = await uploadRepo.find({
                where: { servico_id: s.id },
                order: { criadoEm: 'DESC' },
                take: 1,
              });

              const totalImportados = await uploadRepo
                .createQueryBuilder('u')
                .where('u.servico_id = :sid', { sid: s.id })
                .select('COALESCE(SUM(u.linhasImportadas), 0)', 'total')
                .getRawOne();

              const registros = parseInt(totalImportados?.total || '0');
              const configKpis: any[] = s.configDashboard?.kpis || [];
              const kpisAtivos = configKpis.filter((k: any) => k.ativo !== false).length;

              const tiposStr = s.tipo || '';
              tiposStr.split(',').filter(Boolean).forEach((t: string) => tiposSet.add(t.trim()));

              return {
                temUpload: registros > 0,
                registros,
                kpisAtivos,
                ultimoUploadStr: uploads[0]?.criadoEm ? uploads[0].criadoEm.toISOString() : null,
                temConfig: kpisAtivos > 0,
              };
            })
          );

          for (const sd of servicosComDados) {
            totalRegistros += sd.registros;
            if (sd.ultimoUploadStr && (!ultimoUpload || new Date(sd.ultimoUploadStr).getTime() > new Date(ultimoUpload).getTime())) {
              ultimoUpload = sd.ultimoUploadStr;
            }
            if (sd.temUpload) servicosComUpload++;
            if (sd.temConfig) servicosConfigurados++;
            if (!sd.temConfig) servicosSemKpi++;
            totalKpisAtivos += sd.kpisAtivos;
          }

          const seteDiasAtras = Date.now() - 7 * 24 * 60 * 60 * 1000;
          const temUploadRecente = ultimoUpload && new Date(ultimoUpload).getTime() > seteDiasAtras;
          const todosConfigurados = servicos.length === 0 || servicosConfigurados >= servicos.length;

          let statusSaude: 'green' | 'yellow' | 'red';
          if (servicos.length === 0) statusSaude = 'yellow';
          else if (servicosComUpload === 0) statusSaude = 'red';
          else if (todosConfigurados && temUploadRecente) statusSaude = 'green';
          else statusSaude = 'yellow';

          return {
            id: contract.id,
            numeroContrato: contract.numeroContrato,
            status: contract.status,
            statusSaude,
            totalServicos: servicos.length,
            servicosConfigurados,
            servicosComUpload,
            servicosSemKpi,
            totalRegistros,
            totalKpisAtivos,
            ultimoUpload,
            tiposServico: Array.from(tiposSet),
          };
        })
      );

      return res.json({ contratos: resultados });
    } catch (error: any) {
      console.error('Erro ao carregar saude dos contratos:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao carregar dados de saude' });
    }
  }

  /**
   * ⭐ GET /api/contracts/:id/saude
   * Retorna dados consolidados de SAÚDE de UM contrato (inclui detalhes de cada serviço).
   */
  async saudeDetalhe(req: Request, res: Response): Promise<any> {
    try {
      const { id } = req.params as { id: string };
      const servicoRepo = AppDataSource.getRepository(Servico);
      const uploadRepo = AppDataSource.getRepository(PlanilhaUpload);

      const contract = await this.repository.findOne({ where: { id } });
      if (!contract) return res.status(404).json({ error: 'Contrato não encontrado' });

      const servicos = await servicoRepo.find({ where: { contract_id: id } });

      const servicosDetalhados = await Promise.all(
        servicos.map(async (s) => {
          const uploads = await uploadRepo.find({
            where: { servico_id: s.id },
            order: { criadoEm: 'DESC' },
            take: 1,
          });

          const totalImportados = await uploadRepo
            .createQueryBuilder('u')
            .where('u.servico_id = :sid', { sid: s.id })
            .select('COALESCE(SUM(u.linhasImportadas), 0)', 'total')
            .getRawOne();

          const registros = parseInt(totalImportados?.total || '0');
          const configKpis: any[] = s.configDashboard?.kpis || [];
          const kpisAtivos = configKpis.filter((k: any) => k.ativo !== false).length;

          return {
            id: s.id,
            nome: s.nome,
            tipo: s.tipo || 'coleta_caminhao',
            totalRegistros: registros,
            kpisAtivos,
            kpisTotal: configKpis.length,
            ultimoUpload: uploads[0]?.criadoEm ? uploads[0].criadoEm.toISOString() : null,
            temConfig: kpisAtivos > 0,
            temUpload: registros > 0,
          };
        })
      );

      let totalRegistros = 0;
      let ultimoUpload: string | null = null;
      let servicosConfigurados = 0;
      let servicosComUpload = 0;
      let servicosSemKpi = 0;
      let totalKpisAtivos = 0;

      for (const sd of servicosDetalhados) {
        totalRegistros += sd.totalRegistros;
        if (sd.ultimoUpload && (!ultimoUpload || new Date(sd.ultimoUpload).getTime() > new Date(ultimoUpload).getTime())) {
          ultimoUpload = sd.ultimoUpload;
        }
        if (sd.temUpload) servicosComUpload++;
        if (sd.temConfig) servicosConfigurados++;
        if (!sd.temConfig) servicosSemKpi++;
        totalKpisAtivos += sd.kpisAtivos;
      }

      const seteDiasAtras = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const temUploadRecente = ultimoUpload && new Date(ultimoUpload).getTime() > seteDiasAtras;
      const todosConfigurados = servicos.length === 0 || servicosConfigurados >= servicos.length;

      let statusSaude: 'green' | 'yellow' | 'red';
      if (servicos.length === 0) statusSaude = 'yellow';
      else if (servicosComUpload === 0) statusSaude = 'red';
      else if (todosConfigurados && temUploadRecente) statusSaude = 'green';
      else statusSaude = 'yellow';

      return res.json({
        id,
        numeroContrato: contract.numeroContrato,
        status: contract.status,
        statusSaude,
        totalServicos: servicos.length,
        servicosConfigurados,
        servicosComUpload,
        servicosSemKpi,
        totalRegistros,
        totalKpisAtivos,
        ultimoUpload,
        servicos: servicosDetalhados,
      });
    } catch (error: any) {
      console.error('Erro ao carregar saude do contrato:', error?.message || error);
      return res.status(500).json({ error: 'Erro ao carregar dados de saude' });
    }
  }
}
