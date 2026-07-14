import AppDataSource from '../database/data-source';
import { WhatsappGrupoMapa } from '../entities/WhatsappGrupoMapa';
import { Servico } from '../entities/Servico';
import { Contract } from '../entities/Contract';
import { TipoServico, TIPOS_SERVICO_META } from '../enums/TipoServico';
import DeduplicacaoService from './DeduplicacaoService';
import RocadaImportService from './rocadaImportService';
import PlanilhaService from './PlanilhaService';
import { htmlToPdf } from './PdfGeneratorService';
import { gerarHtmlSaudeDadosServer } from './PdfSaudeDadosHtml';
import { gerarHtmlRelatorioDiaRocadaServer } from './PdfRelatorioDiaHtml';
import { analisarViagensPlanilha } from './analisarViagensPlanilhaService';
import { getAgregacaoColeta } from './coletaAgregacaoService';
import { getAgregacaoRocada } from './rocadaAgregacaoService';
import { extrairCadastroOperacional } from '../utils/configOperacional';
import { normalizarListaPlacasReserva } from '../utils/placasReserva';
import { buildValoresFixosFaturamento } from './configFaturamentoValores';
import { gerarHtmlRelatorioDia } from './relatorioDia/gerarHtmlRelatorioDiaOperacao';
import { gerarNomePdfRelatorioDia } from './relatorioDia/gerarNomePdf';
import { analiseOperacaoDeAgregacaoSql } from './relatorioDia/operacaoDia';
import { diaSemanaPt } from './relatorioDia/fmt';
import { calcularKpisOperacaoDiaSql } from './relatorioDia/kpisOperacaoDia';
import wuzapiService from './WuzapiService';

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
    // já pode ser base64
    if (/^[A-Za-z0-9+/=]+$/.test(value) && value.length > 20) return value;
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

  const url = doc.url || doc.URL || doc.directPath;
  const mediaKey = bytesToBase64(doc.mediaKey || doc.MediaKey);
  const fileSHA256 = bytesToBase64(doc.fileSHA256 || doc.FileSHA256);
  const fileEncSHA256 = bytesToBase64(doc.fileEncSHA256 || doc.FileEncSHA256);
  const fileLength = Number(doc.fileLength || doc.FileLength || 0);
  const mimetype = doc.mimetype || doc.Mimetype || 'application/octet-stream';

  if (!url || !mediaKey || !fileSHA256 || !fileLength) {
    throw new Error('Webhook sem base64 e sem metadados suficientes para baixar o documento.');
  }

  const downloaded = await wuzapiService.downloadDocument({
    Url: String(url),
    Mimetype: String(mimetype),
    MediaKey: mediaKey,
    FileSHA256: fileSHA256,
    FileEncSHA256: fileEncSHA256 || undefined,
    FileLength: fileLength,
  });

  if (!downloaded.data) {
    throw new Error('Download do documento retornou vazio.');
  }

  const raw = downloaded.data.includes(',')
    ? downloaded.data.split(',').pop()!
    : downloaded.data;

  return { buffer: Buffer.from(raw, 'base64'), nomeArquivo: nome };
}

async function importarPlanilha(
  buffer: Buffer,
  nomeArquivo: string,
  servico: Servico,
  estrategia: string,
): Promise<{ planilhaUploadId?: number; importadas?: number; totalLinhas?: number }> {
  if (servico.tipo === TipoServico.ROCADEIRA || servico.tipo === 'rocadeira') {
    const r = await RocadaImportService.importar(buffer, nomeArquivo, servico.id, undefined, true);
    return {
      planilhaUploadId: r.planilhaUploadId,
      importadas: r.importados,
      totalLinhas: r.totalLinhas,
    };
  }

  const est = (estrategia || 'atualizar_data') as 'ignorar' | 'substituir' | 'atualizar_data' | 'inserir_data';
  let resultado: { planilhaUploadId?: number; importadas?: number; totalLinhas?: number };
  if (est === 'atualizar_data' || est === 'inserir_data') {
    const r = await DeduplicacaoService.importarPorData(buffer, nomeArquivo, est, undefined, servico.id);
    resultado = {
      planilhaUploadId: r.planilhaUploadId,
      importadas: r.importados,
      totalLinhas: r.totalLinhas,
    };
  } else {
    const r = await DeduplicacaoService.importarComDedup(buffer, nomeArquivo, est, undefined, servico.id);
    resultado = {
      planilhaUploadId: r.planilhaUploadId,
      importadas: r.importados,
      totalLinhas: r.totalLinhas,
    };
  }

  // Mesmo pós-processamento do upload manual: grava padrão da planilha no serviço
  await atualizarPadraoServicoAposImport(
    servico.id,
    buffer,
    nomeArquivo,
    resultado.planilhaUploadId,
    resultado.totalLinhas,
  );

  return resultado;
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

    const msgId = String(info.ID || '');
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

    const grupoJid = normalizarGrupoJid(chat);
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

    try {
      await wuzapiService.enviarTexto(
        grupoJid,
        `📥 Planilha recebida (${fileName || 'arquivo'}). Importando para o serviço "${servico.nome}"…`,
      );
    } catch (err: any) {
      console.warn('[WhatsappPipeline] Falha ao avisar grupo:', err?.message || err);
    }

    const { buffer, nomeArquivo: nomeRaw } = await obterBufferPlanilha(payload, doc);
    const nomeArquivo = EXT_PLANILHA.test(nomeRaw) ? nomeRaw : `${nomeRaw.replace(/\.[^.]+$/, '') || 'planilha'}.xlsx`;
    const importResult = await importarPlanilha(buffer, nomeArquivo, servico, mapa.estrategia);
    return this.posImport(mapa, servico, grupoJid, nomeArquivo, importResult, buffer);
  }

  private async posImport(
    mapa: WhatsappGrupoMapa,
    servico: Servico,
    grupoJid: string,
    nomeArquivo: string,
    importResult: { planilhaUploadId?: number; importadas?: number; totalLinhas?: number },
    bufferPlanilha: Buffer,
  ) {
    const periodo = await PlanilhaService.getPeriodoDadosPorServico(servico.id);
    const ultimoDiaOperacional = periodo?.dataFim || null;
    const contrato = (servico as Servico & { contract?: Contract }).contract
      || await AppDataSource.getRepository(Contract).findOne({ where: { id: servico.contract_id } });
    const contratoNome = contrato?.numeroContrato || '—';
    const tipoLabel = TIPOS_SERVICO_META[servico.tipo || '']?.label || servico.tipo || 'Serviço';
    const ehRocada = servico.tipo === TipoServico.ROCADEIRA || servico.tipo === 'rocadeira';

    let pdfSaudeEnviado = false;
    let pdfDiarioEnviado = false;
    const errosPdf: string[] = [];

    if (mapa.responderPdf) {
      // 1) PDF Saúde dos Dados (mesma análise do upload manual)
      if (!ehRocada) {
        try {
          const cadastro = extrairCadastroOperacional(contrato?.configOperacional);
          const relatorio = analisarViagensPlanilha(bufferPlanilha, nomeArquivo, cadastro);
          const htmlSaude = gerarHtmlSaudeDadosServer({
            relatorio,
            contratoNome: String(contratoNome),
            servicoNome: servico.nome,
            tipoLabel,
          });
          const pdfSaude = await htmlToPdf(htmlSaude, {
            margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' },
          });
          const nomeSaude = `Saude_Dados_${servico.nome.replace(/[^\w\-]+/g, '_')}.pdf`;
          await wuzapiService.enviarDocumento(
            grupoJid,
            nomeSaude,
            pdfSaude,
            `🩺 Saúde dos dados — ${servico.nome} (${nomeArquivo})`,
          );
          pdfSaudeEnviado = true;
        } catch (err: any) {
          console.error('[WhatsappPipeline] Erro PDF saúde:', err?.message || err);
          errosPdf.push(`saúde: ${err?.message || 'erro'}`);
        }
      }

      // 2) PDF diário do último dia com dados no ciclo
      if (ultimoDiaOperacional) {
        try {
          const dataFmt = ultimoDiaOperacional.split('-').reverse().join('-');
          if (ehRocada) {
            const agg = await getAgregacaoRocada(servico.id, { data: ultimoDiaOperacional, topN: 15 });
            const htmlDia = gerarHtmlRelatorioDiaRocadaServer({
              servicoNome: servico.nome,
              contratoNome: String(contratoNome),
              dataIso: ultimoDiaOperacional,
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
              `📅 Relatório diário — ${ultimoDiaOperacional.split('-').reverse().join('/')} (${servico.nome})`,
            );
            pdfDiarioEnviado = true;
          } else {
            const valoresFixos = buildValoresFixosFaturamento(
              contrato || null,
              servico.configFaturamento,
            );
            const agg = await getAgregacaoColeta(servico.id, {
              data: ultimoDiaOperacional,
              topN: 50,
              valoresFixos,
            });
            const operacao = analiseOperacaoDeAgregacaoSql(agg);
            const placasReserva = normalizarListaPlacasReserva(
              contrato?.configOperacional?.placasReserva,
            );
            const kpisOperacao = calcularKpisOperacaoDiaSql({
              servico,
              contract: contrato || null,
              metricas: agg.resumo,
              valoresFixos,
              limite: 8,
            });
            const htmlDia = gerarHtmlRelatorioDia({
              aba: 'operacao',
              servicoNome: servico.nome,
              dataIso: ultimoDiaOperacional,
              diaSemana: diaSemanaPt(ultimoDiaOperacional),
              operacao,
              kpisOperacao,
              placasReserva,
            });
            const nomeDia = `${gerarNomePdfRelatorioDia({
              servicoNome: servico.nome,
              aba: 'operacao',
              dataIso: ultimoDiaOperacional,
            })}.pdf`;
            const pdfDia = await htmlToPdf(htmlDia, {
              margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' },
            });
            await wuzapiService.enviarDocumento(
              grupoJid,
              nomeDia,
              pdfDia,
              `📅 Relatório de Operação — ${ultimoDiaOperacional.split('-').reverse().join('/')} (${servico.nome})`,
            );
            pdfDiarioEnviado = true;
          }
        } catch (err: any) {
          console.error('[WhatsappPipeline] Erro PDF diário:', err?.message || err);
          errosPdf.push(`diário: ${err?.message || 'erro'}`);
        }
      } else {
        errosPdf.push('diário: sem dia operacional no ciclo');
      }

      if (errosPdf.length && (!pdfSaudeEnviado || !pdfDiarioEnviado)) {
        try {
          await wuzapiService.enviarTexto(
            grupoJid,
            `⚠️ Planilha importada, mas falhou o envio de PDF (${errosPdf.join('; ')})`,
          );
        } catch { /* ignore */ }
      }
    }

    const resumo = [
      `✅ Importação concluída`,
      `Contrato: ${contratoNome}`,
      `Serviço: ${servico.nome}`,
      `Arquivo: ${nomeArquivo}`,
      importResult.importadas != null ? `Linhas: ${importResult.importadas}` : null,
      ultimoDiaOperacional
        ? `Último dia operacional: ${ultimoDiaOperacional.split('-').reverse().join('/')}`
        : null,
      `PDF saúde: ${pdfSaudeEnviado ? 'enviado' : (ehRocada ? 'n/a' : 'não enviado')}`,
      `PDF diário: ${pdfDiarioEnviado ? 'enviado' : 'não enviado'}`,
    ].filter(Boolean).join('\n');

    if (!mapa.responderPdf || (!pdfSaudeEnviado && !pdfDiarioEnviado)) {
      try {
        await wuzapiService.enviarTexto(grupoJid, resumo);
      } catch { /* ignore */ }
    } else if (!pdfSaudeEnviado || !pdfDiarioEnviado) {
      try {
        await wuzapiService.enviarTexto(grupoJid, resumo);
      } catch { /* ignore */ }
    }

    return {
      processado: true,
      resultado: {
        grupoJid,
        servicoId: servico.id,
        contrato: contratoNome,
        nomeArquivo,
        importadas: importResult.importadas,
        planilhaUploadId: importResult.planilhaUploadId,
        ultimoDiaOperacional,
        pdfSaudeEnviado,
        pdfDiarioEnviado,
      },
    };
  }
}

export default new WhatsappPlanilhaPipelineService();
