import AppDataSource, {
  getCurrentTenantDb,
  isMultiTenant,
  runWithTenant,
} from '../database/data-source';
import { buscarRoteamentoGrupo } from './whatsappRoteamentoService';
import { WhatsappGrupoMapa } from '../entities/WhatsappGrupoMapa';
import { Servico } from '../entities/Servico';
import { Contract } from '../entities/Contract';
import { TipoServico, TIPOS_SERVICO_META } from '../enums/TipoServico';
import DeduplicacaoService from './DeduplicacaoService';
import RocadaImportService from './rocadaImportService';
import ServicosUnificadosImportService from './servicosUnificadosImportService';
import { classificarPlanilhaContrato } from './planilhaContratoClassifier';
import { obterServicoPorTipoContrato } from './servicosPadraoContratoService';
import PlanilhaService from './PlanilhaService';
import { invalidarCacheSaudeContratos } from '../controllers/ContractController';
import { htmlToPdf } from './PdfGeneratorService';
import { gerarHtmlSaudeDadosServer } from './PdfSaudeDadosHtml';
import { gerarHtmlRelatorioDiaRocadaServer } from './PdfRelatorioDiaHtml';
import { analisarViagensPlanilha } from './analisarViagensPlanilhaService';
import { getAgregacaoColeta, getMapeamentoOperacional } from './coletaAgregacaoService';
import { getAgregacaoRocada } from './rocadaAgregacaoService';
import { extrairCadastroOperacional } from '../utils/configOperacional';
import { normalizarListaPlacasReserva } from '../utils/placasReserva';
import { buildValoresFixosFaturamento } from './configFaturamentoValores';
import { gerarHtmlRelatorioDia } from './relatorioDia/gerarHtmlRelatorioDiaOperacao';
import { gerarNomePdfRelatorioDia } from './relatorioDia/gerarNomePdf';
import { analiseOperacaoDeAgregacaoSql } from './relatorioDia/operacaoDia';
import { diaSemanaPt } from './relatorioDia/fmt';
import { calcularKpisOperacaoDiaSql } from './relatorioDia/kpisOperacaoDia';
import { carregarViagensCapacidadeDia } from './relatorioDia/capacidadeViagemDia';
import wuzapiService from './WuzapiService';
import {
  extrairTextoMensagem,
  processarComandoTextoWhatsapp,
} from './WhatsappComandoRelatorioService';

const EXT_PLANILHA = /\.(xlsx|xls|xlsm)$/i;
const MIME_PLANILHA = /spreadsheet|excel|ms-excel|officedocument\.spreadsheetml|octet-stream/i;

/** Evita processar o mesmo ID de mensagem duas vezes (WuzAPI pode reenviar). */
const mensagensProcessadas = new Set<string>();
const MAX_CACHE_MSG = 500;

export interface WuzapiWebhookPayload {
  type?: string;
  event?: {
    Info?: {
      ID?: string;
      Chat?: string;
      Sender?: string;
      IsFromMe?: boolean;
      IsGroup?: boolean;
      PushName?: string;
      Timestamp?: string;
      MediaType?: string;
    };
    Message?: {
      documentMessage?: {
        url?: string;
        URL?: string;
        mimetype?: string;
        fileName?: string;
        title?: string;
        fileSHA256?: string | Uint8Array;
        fileEncSHA256?: string | Uint8Array;
        fileLength?: number | string;
        mediaKey?: string | Uint8Array;
        directPath?: string;
        DirectPath?: string;
      };
      DocumentMessage?: Record<string, unknown>;
    };
  };
  base64?: string;
  mimeType?: string;
  fileName?: string;
  userID?: string;
  instanceName?: string;
  jsonData?: string;
}

/** Normaliza body form/json da WuzAPI para o formato esperado. */
export function normalizarPayloadWebhook(body: unknown): WuzapiWebhookPayload {
  if (!body || typeof body !== 'object') return {};
  const raw = body as Record<string, any>;

  if (typeof raw.jsonData === 'string') {
    try {
      const parsed = JSON.parse(raw.jsonData);
      return {
        ...parsed,
        userID: raw.userID || parsed.userID,
        instanceName: raw.instanceName || parsed.instanceName,
        base64: raw.base64 || parsed.base64,
        mimeType: raw.mimeType || parsed.mimeType,
        fileName: raw.fileName || parsed.fileName,
      };
    } catch {
      /* segue com raw */
    }
  }

  // Alguns builds mandam event como string JSON
  if (typeof raw.event === 'string') {
    try {
      raw.event = JSON.parse(raw.event);
    } catch { /* ignore */ }
  }

  return raw as WuzapiWebhookPayload;
}

function normalizarGrupoJid(chat: string): string {
  const raw = String(chat || '').trim();
  if (!raw) return '';
  if (raw.includes('@')) return raw;
  return `${raw}@g.us`;
}

function bytesToBase64(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    // Go serializa []byte como base64 no JSON do webhook
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length % 4 === 0) return value;
    try {
      return Buffer.from(value, 'utf8').toString('base64');
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) {
    return Buffer.from(value).toString('base64');
  }
  if (typeof value === 'object' && value !== null && 'data' in (value as object)) {
    const data = (value as { data: number[] }).data;
    if (Array.isArray(data)) return Buffer.from(data).toString('base64');
  }
  return null;
}

function extrairDocumento(payload: WuzapiWebhookPayload) {
  const msg = payload.event?.Message || {};
  const doc = (msg.documentMessage || msg.DocumentMessage || {}) as Record<string, any>;
  const fileName =
    payload.fileName ||
    doc.fileName ||
    doc.FileName ||
    doc.title ||
    '';
  const mimetype = payload.mimeType || doc.mimetype || doc.Mimetype || '';
  return { doc, fileName: String(fileName), mimetype: String(mimetype) };
}

function isPlanilha(fileName: string, mimetype: string): boolean {
  if (EXT_PLANILHA.test(fileName)) return true;
  if (mimetype && MIME_PLANILHA.test(mimetype) && EXT_PLANILHA.test(fileName || '.xlsx')) return true;
  return false;
}

async function obterBufferPlanilha(payload: WuzapiWebhookPayload, doc: Record<string, any>): Promise<{ buffer: Buffer; nomeArquivo: string }> {
  const { fileName } = extrairDocumento(payload);
  const nome = fileName || `planilha_${Date.now()}.xlsx`;

  if (payload.base64) {
    const raw = payload.base64.includes(',')
      ? payload.base64.split(',').pop()!
      : payload.base64;
    return { buffer: Buffer.from(raw, 'base64'), nomeArquivo: nome };
  }

  const url = doc.url || doc.URL || '';
  const directPath = doc.directPath || doc.DirectPath || '';
  const mediaKey = bytesToBase64(doc.mediaKey || doc.MediaKey);
  const fileSHA256 = bytesToBase64(doc.fileSHA256 || doc.FileSHA256);
  const fileEncSHA256 = bytesToBase64(doc.fileEncSHA256 || doc.FileEncSHA256);
  const fileLength = Number(doc.fileLength || doc.FileLength || 0);
  const mimetype = doc.mimetype || doc.Mimetype || 'application/octet-stream';

  if ((!url && !directPath) || !mediaKey || !fileSHA256 || !fileLength) {
    throw new Error('Webhook sem base64 e sem metadados suficientes para baixar o documento.');
  }

  let downloaded: { data: string; mimetype?: string };
  try {
    downloaded = await wuzapiService.downloadDocument({
      Url: String(url),
      DirectPath: String(directPath),
      Mimetype: String(mimetype),
      MediaKey: mediaKey,
      FileSHA256: fileSHA256,
      FileEncSHA256: fileEncSHA256 || undefined,
      FileLength: fileLength,
    });
  } catch (err: any) {
    throw new Error(
      `${err?.message || 'erro ao baixar do WhatsApp'}. `
      + 'Reenvie a planilha como documento (não como encaminhamento antigo).',
    );
  }

  if (!downloaded.data) {
    throw new Error('Download do documento retornou vazio.');
  }

  const raw = downloaded.data.includes(',')
    ? downloaded.data.split(',').pop()!
    : downloaded.data;

  return { buffer: Buffer.from(raw, 'base64'), nomeArquivo: nome };
}

type AlvoImportWhatsapp = {
  servicoId: string;
  servicoNome: string;
  tipo: string;
  importados: number;
};

type ResultadoImportWhatsapp = {
  planilhaUploadId?: number;
  importadas: number;
  totalLinhas?: number;
  tipoDetectado: string;
  tipoDetectadoLabel: string;
  mensagem: string;
  /** Serviços que receberam dados (ex.: Capina + Roçada no CONSOLIDADO) */
  alvos: AlvoImportWhatsapp[];
};

/**
 * Mesma lógica do upload por contrato: classifica a planilha e grava no serviço certo.
 * O serviço mapeado no grupo define o contrato; o conteúdo define o(s) tipo(s).
 */
async function importarPlanilha(
  buffer: Buffer,
  nomeArquivo: string,
  servicoMapa: Servico,
  estrategia: string,
): Promise<ResultadoImportWhatsapp> {
  const contractId = servicoMapa.contract_id;
  if (!contractId) {
    throw new Error('Serviço mapeado sem contrato');
  }

  const classificacao = classificarPlanilhaContrato(buffer);
  const est = (estrategia || 'atualizar_data') as 'ignorar' | 'substituir' | 'atualizar_data' | 'inserir_data';
  const substituir = est !== 'ignorar';

  if (classificacao.tipo === 'unificado') {
    const r = await ServicosUnificadosImportService.importarPorContrato(
      buffer,
      nomeArquivo,
      contractId,
      undefined,
      substituir,
    );
    invalidarCacheSaudeContratos(contractId);
    const alvos = (r.splitPorServico || [])
      .filter((s) => s.importados > 0)
      .map((s) => ({
        servicoId: s.servicoId,
        servicoNome: s.servicoNome,
        tipo: String(s.tipoSistema),
        importados: s.importados,
      }));
    const partes = alvos.map((s) => `${s.servicoNome}: ${s.importados} reg.`);
    return {
      planilhaUploadId: r.planilhaUploadId,
      importadas: r.importados,
      totalLinhas: r.totalLinhas,
      tipoDetectado: classificacao.tipo,
      tipoDetectadoLabel: classificacao.label,
      mensagem: `Planilha unificada: ${r.importados} registro(s). ${partes.join(' · ')}`,
      alvos: alvos.length
        ? alvos
        : [{
            servicoId: servicoMapa.id,
            servicoNome: servicoMapa.nome,
            tipo: String(servicoMapa.tipo || ''),
            importados: r.importados,
          }],
    };
  }

  if (classificacao.tipo === 'coleta') {
    const alvo = await obterServicoPorTipoContrato(contractId, TipoServico.COLETA_CAMINHAO);
    const r = (est === 'atualizar_data' || est === 'inserir_data')
      ? await DeduplicacaoService.importarPorData(buffer, nomeArquivo, est, undefined, alvo.id)
      : await DeduplicacaoService.importarComDedup(
        buffer,
        nomeArquivo,
        est === 'substituir' ? 'substituir' : 'ignorar',
        undefined,
        alvo.id,
      );
    const qtd = Number((r as { importados?: number }).importados ?? 0);
    await atualizarPadraoServicoAposImport(alvo.id, buffer, nomeArquivo, r.planilhaUploadId, r.totalLinhas);
    invalidarCacheSaudeContratos(contractId);
    return {
      planilhaUploadId: r.planilhaUploadId,
      importadas: qtd,
      totalLinhas: r.totalLinhas,
      tipoDetectado: classificacao.tipo,
      tipoDetectadoLabel: classificacao.label,
      mensagem: `Coleta importada em “${alvo.nome}”: ${qtd} registro(s).`,
      alvos: [{
        servicoId: alvo.id,
        servicoNome: alvo.nome,
        tipo: String(alvo.tipo || TipoServico.COLETA_CAMINHAO),
        importados: qtd,
      }],
    };
  }

  if (classificacao.tipo === 'rocada') {
    const alvo = await obterServicoPorTipoContrato(contractId, TipoServico.ROCADEIRA);
    const r = await RocadaImportService.importar(buffer, nomeArquivo, alvo.id, undefined, true);
    invalidarCacheSaudeContratos(contractId);
    return {
      planilhaUploadId: r.planilhaUploadId,
      importadas: r.importados,
      totalLinhas: r.totalLinhas,
      tipoDetectado: classificacao.tipo,
      tipoDetectadoLabel: classificacao.label,
      mensagem: `Roçada importada em “${alvo.nome}”: ${r.importados} registro(s).`,
      alvos: [{
        servicoId: alvo.id,
        servicoNome: alvo.nome,
        tipo: String(alvo.tipo || TipoServico.ROCADEIRA),
        importados: r.importados,
      }],
    };
  }

  throw new Error(
    'Formato de planilha não reconhecido. Use CONSOLIDADO (DATA/UND/QUANTITATIVO/TIPO DE SERVIÇO), Coleta (PLACA/PESO) ou Roçada.',
  );
}

/** Detecta colunas e salva padraoPlanilha (necessário para a UI marcar upload). */
async function atualizarPadraoServicoAposImport(
  servicoId: string,
  buffer: Buffer,
  nomeArquivo: string,
  planilhaUploadId?: number,
  totalLinhas?: number,
): Promise<void> {
  try {
    const { detectarPadraoPlanilha } = await import('./PadraoPlanilhaDetector');
    const { gerarConfigGraficosPadrao, reResolverGraficos } = await import('./graficosPadrao');
    const { buildConfigDashboardPadraoColeta } = await import('../config/dashboardPadraoColeta');

    const servicoRepo = AppDataSource.getRepository(Servico);
    const servico = await servicoRepo.findOne({ where: { id: servicoId } });
    if (!servico) return;

    const colunas = detectarPadraoPlanilha(buffer);
    const colunasNomes = colunas.map((c: { nome: string }) => c.nome);
    const graficosAtuais = servico.configDashboard?.graficos || [];
    const graficosReResolvidos = graficosAtuais.length > 0
      ? reResolverGraficos(graficosAtuais, colunasNomes)
      : gerarConfigGraficosPadrao(servico.tipo || 'coleta_caminhao', colunasNomes);

    servico.padraoPlanilha = {
      colunas,
      totalLinhas: totalLinhas ?? 0,
      ultimoUpload: planilhaUploadId,
      ultimoUploadNome: nomeArquivo,
      detectadoEm: new Date().toISOString(),
    };

    const cfgAtual = servico.configDashboard || {};
    const tipoColeta = servico.tipo === TipoServico.COLETA_CAMINHAO || servico.tipo === 'coleta_caminhao';
    const padraoColeta = tipoColeta ? buildConfigDashboardPadraoColeta() : null;
    const semKpis = !cfgAtual.kpis?.length;

    servico.configDashboard = {
      ...cfgAtual,
      kpis: semKpis && padraoColeta ? padraoColeta.kpis : cfgAtual.kpis,
      graficos: graficosReResolvidos,
      rankingsOperacionais: cfgAtual.rankingsOperacionais ?? padraoColeta?.rankingsOperacionais,
      reResolvidoEm: new Date().toISOString(),
      reResolvido: true,
      graficosPadraoAplicados: true,
      graficosPadraoTotal: graficosReResolvidos.length,
      ...(semKpis && padraoColeta ? { dashboardPadraoVersao: padraoColeta.dashboardPadraoVersao } : {}),
    };

    await servicoRepo.save(servico);
  } catch (err: any) {
    console.warn('[WhatsappPipeline] Falha ao gravar padraoPlanilha:', err?.message || err);
  }
}

/**
 * Processa mensagem de grupo com planilha: importa + gera PDF do dia + responde no grupo.
 */
export class WhatsappPlanilhaPipelineService {
  async processarWebhook(rawPayload: WuzapiWebhookPayload | unknown): Promise<{
    processado: boolean;
    motivo?: string;
    resultado?: Record<string, unknown>;
  }> {
    const payload = normalizarPayloadWebhook(rawPayload);

    if (payload.type && payload.type !== 'Message') {
      return { processado: false, motivo: `Evento ignorado: ${payload.type}` };
    }

    const info = payload.event?.Info;
    if (!info) {
      return { processado: false, motivo: 'Payload sem Info' };
    }

    const chat = String(info.Chat || '');
    const isGroup = info.IsGroup === true || chat.endsWith('@g.us');
    if (!isGroup) {
      return { processado: false, motivo: 'Não é mensagem de grupo' };
    }

    const msgId = String(info.ID || '');
    if (msgId && mensagensProcessadas.has(msgId)) {
      return { processado: false, motivo: `Duplicata ignorada: ${msgId}` };
    }

    const grupoJid = normalizarGrupoJid(chat);
    if (isMultiTenant() && !getCurrentTenantDb()) {
      const rota = await buscarRoteamentoGrupo(grupoJid);
      if (rota) {
        return runWithTenant(rota.tenantDb, () => this.processarWebhook(rawPayload));
      }
    }
    const textoMsg = extrairTextoMensagem(payload);

    // Comandos de texto (relatorio / ciclo / comparativo) — antes do fluxo de planilha
    if (textoMsg && !payload.base64) {
      const { doc: docChk, fileName: fnChk, mimetype: mimeChk } = extrairDocumento(payload);
      const temDocChk = !!(docChk && Object.keys(docChk).length > 0);
      if (!temDocChk || (!isPlanilha(fnChk, mimeChk) && !EXT_PLANILHA.test(fnChk))) {
        if (msgId) {
          mensagensProcessadas.add(msgId);
          if (mensagensProcessadas.size > MAX_CACHE_MSG) {
            const primeiro = mensagensProcessadas.values().next().value;
            if (primeiro) mensagensProcessadas.delete(primeiro);
          }
        }
        const cmd = await processarComandoTextoWhatsapp({
          grupoJid,
          texto: textoMsg,
          isFromMe: info.IsFromMe === true,
        });
        if (cmd.processado) {
          return { processado: true, motivo: 'comando-texto', resultado: { comando: true } };
        }
      }
    }

    const { doc, fileName, mimetype } = extrairDocumento(payload);
    const temDocumento = !!(doc && Object.keys(doc).length > 0) || !!payload.base64;

    // Mensagens próprias (IsFromMe) só entram se forem planilha/documento —
    // permite testar enviando do mesmo número conectado.
    if (info.IsFromMe && !temDocumento) {
      return { processado: false, motivo: 'Mensagem própria ignorada' };
    }

    if (!temDocumento) {
      return { processado: false, motivo: 'Sem documento na mensagem' };
    }

    if (!isPlanilha(fileName, mimetype) && !payload.base64) {
      if (!MIME_PLANILHA.test(mimetype) && !EXT_PLANILHA.test(fileName)) {
        return { processado: false, motivo: `Arquivo não é planilha: ${fileName || mimetype}` };
      }
    }
    if (fileName && !EXT_PLANILHA.test(fileName) && !payload.base64) {
      return { processado: false, motivo: `Extensão ignorada: ${fileName}` };
    }

    if (msgId && mensagensProcessadas.has(msgId)) {
      return { processado: false, motivo: `Duplicata ignorada: ${msgId}` };
    }
    if (msgId) {
      mensagensProcessadas.add(msgId);
      if (mensagensProcessadas.size > MAX_CACHE_MSG) {
        const primeiro = mensagensProcessadas.values().next().value;
        if (primeiro) mensagensProcessadas.delete(primeiro);
      }
    }

    const mapaRepo = AppDataSource.getRepository(WhatsappGrupoMapa);
    const mapa = await mapaRepo.findOne({
      where: { grupoJid, ativo: true },
      relations: ['servico', 'servico.contract'],
    });

    if (!mapa) {
      console.warn(`[WhatsappPipeline] Grupo sem mapeamento: ${grupoJid}`);
      return { processado: false, motivo: `Grupo não mapeado: ${grupoJid}` };
    }

    const servico = mapa.servico
      || await AppDataSource.getRepository(Servico).findOne({
        where: { id: mapa.servicoId },
        relations: ['contract'],
      });

    if (!servico) {
      return { processado: false, motivo: 'Serviço do mapeamento não encontrado' };
    }

    if (!wuzapiService.isConfigured) {
      return { processado: false, motivo: 'WuzAPI não configurada (WUZAPI_URL/WUZAPI_TOKEN)' };
    }

    const { buffer, nomeArquivo: nomeRaw } = await obterBufferPlanilha(payload, doc);
    const nomeArquivo = EXT_PLANILHA.test(nomeRaw) ? nomeRaw : `${nomeRaw.replace(/\.[^.]+$/, '') || 'planilha'}.xlsx`;
    const importResult = await importarPlanilha(buffer, nomeArquivo, servico, mapa.estrategia);

    return this.posImport(mapa, servico, grupoJid, nomeArquivo, importResult, buffer);
  }

  /** Envia relatório do último dia operacional de um serviço (PDF ou texto). */
  private async enviarRelatorioUltimoDia(
    servico: Servico,
    contrato: Contract | null,
    grupoJid: string,
    bufferPlanilha: Buffer,
    nomeArquivo: string,
    planilhaUploadId?: number,
  ): Promise<{ pdfSaude: boolean; pdfDiario: boolean; ultimoDia: string | null; erros: string[] }> {
    const contratoNome = contrato?.numeroContrato || '—';
    const tipoSvc = String(servico.tipo || '');
    const tipoLabel = TIPOS_SERVICO_META[tipoSvc]?.label || tipoSvc || 'Serviço';
    const ehRocada = tipoSvc === TipoServico.ROCADEIRA || tipoSvc === 'rocadeira';
    const ehUnidadeNaoRocada = (
      tipoSvc === TipoServico.CAPINA || tipoSvc === 'capina'
      || tipoSvc === TipoServico.VARRICAO || tipoSvc === 'varricao'
      || tipoSvc === TipoServico.PODA || tipoSvc === 'poda'
      || tipoSvc === 'pintura_meio_fio'
    );

    // O PDF deve representar o último dia DESTE arquivo, não o maior dia histórico
    // já existente no serviço (um reenvio de ciclo antigo não pode gerar PDF de outro upload).
    const periodoUpload = planilhaUploadId
      ? await PlanilhaService.getPeriodoDadosPorUpload(planilhaUploadId, servico.id)
      : null;
    const periodo = periodoUpload || await PlanilhaService.getPeriodoDadosPorServico(servico.id);
    const ultimoDia = periodo?.dataFim || null;
    let pdfSaude = false;
    let pdfDiario = false;
    const erros: string[] = [];

    if (!ehRocada && !ehUnidadeNaoRocada) {
      try {
        const cadastro = extrairCadastroOperacional(contrato?.configOperacional);
        const relatorio = analisarViagensPlanilha(bufferPlanilha, nomeArquivo, cadastro);
        const htmlSaude = gerarHtmlSaudeDadosServer({
          relatorio,
          contratoNome: String(contratoNome),
          servicoNome: servico.nome,
          tipoLabel,
        });
        const pdfBuf = await htmlToPdf(htmlSaude, {
          margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' },
        });
        await wuzapiService.enviarDocumento(
          grupoJid,
          `Saude_Dados_${servico.nome.replace(/[^\w\-]+/g, '_')}.pdf`,
          pdfBuf,
          `Saúde dos dados — ${servico.nome}`,
        );
        pdfSaude = true;
      } catch (err: any) {
        console.error('[WhatsappPipeline] Erro PDF saúde:', err?.message || err);
        erros.push(`saúde ${servico.nome}: ${err?.message || 'erro'}`);
      }
    }

    if (!ultimoDia) {
      erros.push(`diário ${servico.nome}: sem dia operacional`);
      return { pdfSaude, pdfDiario, ultimoDia, erros };
    }

    try {
      const dataFmt = ultimoDia.split('-').reverse().join('-');
      const dataBr = ultimoDia.split('-').reverse().join('/');

      if (ehRocada) {
        const agg = await getAgregacaoRocada(servico.id, { data: ultimoDia, topN: 15 });
        const htmlDia = gerarHtmlRelatorioDiaRocadaServer({
          servicoNome: servico.nome,
          contratoNome: String(contratoNome),
          dataIso: ultimoDia,
          resumo: agg.resumo,
          porBairro: (agg.porBairro || []).map((l) => ({
            label: l.label,
            registros: l.registros,
            areaM2: l.areaM2,
          })),
          porOperador: (agg.porOperador || []).map((l) => ({
            label: l.label,
            registros: l.registros,
            areaM2: l.areaM2,
          })),
        });
        const pdfDia = await htmlToPdf(htmlDia, {
          margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' },
        });
        await wuzapiService.enviarDocumento(
          grupoJid,
          `Relatorio_Dia_${dataFmt}_${servico.nome.replace(/[^\w\-]+/g, '_')}.pdf`,
          pdfDia,
          `Roçada ${dataBr} — ${servico.nome}`,
        );
        pdfDiario = true;
      } else if (ehUnidadeNaoRocada) {
        const dias = await PlanilhaService.getMetricasPorDia(servico.id, ultimoDia, ultimoDia);
        const d = dias[0];
        const linhasMsg = [
          `*${servico.nome}* — ${dataBr}`,
          `Registros: ${d?.rotas ?? 0}`,
        ];
        if (Number(d?.metroLinear || 0) > 0) {
          linhasMsg.push(`Metro linear: ${Number(d?.metroLinear).toLocaleString('pt-BR')} m`);
        }
        if (Number(d?.kmLinear || 0) > 0) {
          linhasMsg.push(`Extensão: ${Number(d?.kmLinear).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} km`);
        }
        if (Number(d?.areaM2 || 0) > 0) {
          linhasMsg.push(`Área: ${Number(d?.areaM2).toLocaleString('pt-BR')} m²`);
        }
        if (Number(d?.qtdArvore || 0) > 0) {
          linhasMsg.push(`Árvores: ${Number(d?.qtdArvore).toLocaleString('pt-BR')}`);
        }
        if (Number(d?.quantitativo || 0) > 0) {
          linhasMsg.push(`Quantitativo: ${Number(d?.quantitativo).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}`);
        }
        await wuzapiService.enviarTexto(grupoJid, linhasMsg.join('\n'));
        pdfDiario = true;
      } else {
        const valoresFixos = buildValoresFixosFaturamento(contrato || null, servico.configFaturamento);
        const agg = await getAgregacaoColeta(servico.id, {
          data: ultimoDia,
          topN: 50,
          valoresFixos,
        });
        const operacao = analiseOperacaoDeAgregacaoSql(agg);
        const placasReserva = normalizarListaPlacasReserva(contrato?.configOperacional?.placasReserva);
        const kpisOperacao = calcularKpisOperacaoDiaSql({
          servico,
          contract: contrato || null,
          metricas: agg.resumo,
          valoresFixos,
          limite: 8,
        });
        const cfgOp = contrato?.configOperacional;
        const capacidade = await carregarViagensCapacidadeDia(servico.id, ultimoDia, {
          volumeL: cfgOp?.volumeL || null,
          pesoMaximoKg: cfgOp?.pesoMaximoKg || null,
          densidadeResiduoKgL: cfgOp?.densidadeResiduoKgL ?? null,
          densidadeKgL: cfgOp?.densidadeKgL || null,
          densidadeKgLPorPlaca: cfgOp?.densidadeKgLPorPlaca || null,
        });
        let viagensPesoRota: Awaited<ReturnType<typeof getMapeamentoOperacional>>['viagensPesoRota'] = [];
        try {
          const mapeamento = await getMapeamentoOperacional(servico.id, { data: ultimoDia });
          viagensPesoRota = mapeamento.viagensPesoRota || [];
        } catch (errMap: any) {
          console.warn('[WhatsappPipeline] Mapeamento operacional (viagens peso):', errMap?.message || errMap);
        }
        const htmlDia = gerarHtmlRelatorioDia({
          aba: 'operacao',
          servicoNome: servico.nome,
          dataIso: ultimoDia,
          diaSemana: diaSemanaPt(ultimoDia),
          operacao,
          kpisOperacao,
          placasReserva,
          capacidade,
          viagensPesoRota,
          volumeL: cfgOp?.volumeL || null,
          densidadeResiduoKgL: cfgOp?.densidadeResiduoKgL ?? null,
          densidadeKgL: cfgOp?.densidadeKgL || null,
          densidadeKgLPorPlaca: cfgOp?.densidadeKgLPorPlaca || null,
        });
        const nomeDia = `${gerarNomePdfRelatorioDia({
          servicoNome: servico.nome,
          aba: 'operacao',
          dataIso: ultimoDia,
        })}.pdf`;
        const pdfDia = await htmlToPdf(htmlDia, {
          margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' },
        });
        await wuzapiService.enviarDocumento(
          grupoJid,
          nomeDia,
          pdfDia,
          `Operação ${dataBr} — ${servico.nome}`,
        );
        pdfDiario = true;
      }
    } catch (err: any) {
      console.error('[WhatsappPipeline] Erro relatório diário:', err?.message || err);
      erros.push(`diário ${servico.nome}: ${err?.message || 'erro'}`);
    }

    return { pdfSaude, pdfDiario, ultimoDia, erros };
  }

  private async posImport(
    mapa: WhatsappGrupoMapa,
    servicoMapa: Servico,
    grupoJid: string,
    nomeArquivo: string,
    importResult: ResultadoImportWhatsapp,
    bufferPlanilha: Buffer,
  ) {
    const contrato = (servicoMapa as Servico & { contract?: Contract }).contract
      || await AppDataSource.getRepository(Contract).findOne({ where: { id: servicoMapa.contract_id } });
    const contratoNome = contrato?.numeroContrato || '—';
    const servicoRepo = AppDataSource.getRepository(Servico);

    let pdfSaudeEnviado = false;
    let pdfDiarioEnviado = false;
    const errosPdf: string[] = [];
    const diasPorServico: Array<{ nome: string; dia: string | null }> = [];

    for (const alvo of importResult.alvos) {
      if (alvo.importados <= 0) continue;
      try {
        const { mergePlacasAtivasPorUpload } = await import('./mergePlacasAtivasContratoService');
        await mergePlacasAtivasPorUpload(alvo.servicoId, importResult.planilhaUploadId);
      } catch (err: any) {
        console.warn('[WhatsappPipeline] Merge placas:', err?.message || err);
      }
    }

    if (mapa.responderPdf) {
      for (const alvo of importResult.alvos) {
        if (alvo.importados <= 0) continue;
        const servico = await servicoRepo.findOne({
          where: { id: alvo.servicoId },
          relations: ['contract'],
        });
        if (!servico) {
          errosPdf.push(`${alvo.servicoNome}: serviço não encontrado`);
          continue;
        }
        const contratoAlvo = (servico as Servico & { contract?: Contract }).contract || contrato;
        const envio = await this.enviarRelatorioUltimoDia(
          servico,
          contratoAlvo || null,
          grupoJid,
          bufferPlanilha,
          nomeArquivo,
          importResult.planilhaUploadId,
        );
        if (envio.pdfSaude) pdfSaudeEnviado = true;
        if (envio.pdfDiario) pdfDiarioEnviado = true;
        errosPdf.push(...envio.erros);
        diasPorServico.push({ nome: servico.nome, dia: envio.ultimoDia });
      }

      if (errosPdf.length && (!pdfSaudeEnviado || !pdfDiarioEnviado)) {
        try {
          await wuzapiService.enviarTexto(
            grupoJid,
            `⚠️ Importação ok, mas falhou parte do relatório (${errosPdf.slice(0, 4).join('; ')})`,
          );
        } catch { /* ignore */ }
      }
    }

    const servicosTxt = importResult.alvos
      .filter((a) => a.importados > 0)
      .map((a) => `${a.servicoNome} (${a.importados})`)
      .join(' · ');
    const diasTxt = diasPorServico
      .filter((d) => d.dia)
      .map((d) => `${d.nome}: ${String(d.dia).split('-').reverse().join('/')}`)
      .join(' · ');
    const relatoriosEnviados = mapa.responderPdf && (pdfSaudeEnviado || pdfDiarioEnviado);

    // Com PDF/relatório no grupo, o arquivo já confirma o sucesso — não manda recap.
    if (!relatoriosEnviados) {
      const resumo = [
        `✅ ${importResult.importadas} registro(s) importado(s)`,
        servicosTxt ? servicosTxt : null,
        `Contrato: ${contratoNome}`,
        diasTxt ? `Último dia: ${diasTxt}` : null,
      ].filter(Boolean).join('\n');
      try {
        await wuzapiService.enviarTexto(grupoJid, resumo);
      } catch { /* ignore */ }
    }

    return {
      processado: true,
      resultado: {
        grupoJid,
        contrato: contratoNome,
        nomeArquivo,
        tipoDetectado: importResult.tipoDetectado,
        importadas: importResult.importadas,
        planilhaUploadId: importResult.planilhaUploadId,
        alvos: importResult.alvos,
        diasPorServico,
        pdfSaudeEnviado,
        pdfDiarioEnviado,
      },
    };
  }
}

export default new WhatsappPlanilhaPipelineService();
