/**
 * Comandos de texto no WhatsApp (grupos mapeados).
 * "relatorio" → menu → ciclo | comparativo | evolução diária.
 */
import AppDataSource from '../database/data-source';
import { WhatsappGrupoMapa } from '../entities/WhatsappGrupoMapa';
import { Servico } from '../entities/Servico';
import { Contract } from '../entities/Contract';
import { TipoServico, TIPOS_SERVICO_META } from '../enums/TipoServico';
import {
  calcularCicloMensalContrato,
  deslocarMesReferencia,
  inferirMesReferenciaAtual,
  inferirMesReferenciaDeData,
  normalizarDiaInicioCiclo,
  recortarPeriodoAteReferencia,
} from '../utils/periodoCicloContrato';
import PlanilhaService from './PlanilhaService';
import { getAgregacaoColeta } from './coletaAgregacaoService';
import { htmlToPdf } from './PdfGeneratorService';
import { buildValoresFixosFaturamento } from './configFaturamentoValores';
import wuzapiService from './WuzapiService';
import {
  gerarHtmlComparativoContratosWhatsapp,
  gerarHtmlCicloOperacionalWhatsapp,
  gerarHtmlEvolucaoDiariaWhatsapp,
  type BlocoEvolucaoPdf,
} from './WhatsappRelatorioHtml';
import {
  analisarPesoColeta,
  normalizarDensidadeResiduoKgL,
} from './analisePesoColetaService';
import { resolverLimitesDoContrato } from '../config/pesoMaximoCaminhao';
import { normalizarDados } from './FormulaEngine';
import { carregarViagensCapacidadePeriodo } from './relatorioDia/capacidadeViagemDia';
import { montarHtmlRelatorioDiaColeta } from './relatorioDia/montarRelatorioDiaColeta';
import {
  agregarQualidadeIdeal3d,
  type FaixaDominante3d,
} from './qualidadeIdeal3dService';

import {
  textoPedeCicloAnterior,
  type QualCiclo,
} from './WhatsappComandoRelatorioTexto';

type EtapaSessao = 'menu_relatorio' | 'menu_evolucao_janela';
type TipoRelatorioSessao = 'ciclo' | 'peso' | 'evolucao' | 'dia';

interface SessaoChat {
  etapa: EtapaSessao;
  expiresAt: number;
  servicoId: string;
  contratoId: string;
  qualCiclo?: QualCiclo;
}

const sessoes = new Map<string, SessaoChat>();
const TTL_MS = 10 * 60 * 1000;
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;
const FAIXAS_IDS: FaixaDominante3d[] = ['otimo', 'ruim', 'pessimo', 'excedido'];

type JanelaEvolucao = { dias: number; label: string; cicloAnterior?: boolean };

const JANELAS_EVOLUCAO: JanelaEvolucao[] = [
  { dias: 7, label: 'Última semana' },
  { dias: 15, label: 'Últimos 15 dias' },
  { dias: 0, label: 'Por ciclo (completo)' },
];

function limparSessoes(): void {
  const agora = Date.now();
  for (const [k, v] of sessoes) {
    if (v.expiresAt < agora) sessoes.delete(k);
  }
}

function normalizarTexto(raw: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Extrai texto de conversation / extendedText / caption do payload WuzAPI. */
export function extrairTextoMensagem(payload: {
  event?: { Message?: Record<string, any> };
}): string {
  const msg = payload.event?.Message || {};
  const candidatos = [
    msg.conversation,
    msg.Conversation,
    msg.extendedTextMessage?.text,
    msg.ExtendedTextMessage?.Text,
    msg.ExtendedTextMessage?.text,
    msg.imageMessage?.caption,
    msg.ImageMessage?.Caption,
    msg.documentMessage?.caption,
    msg.DocumentMessage?.Caption,
  ];
  for (const c of candidatos) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return '';
}

function menuRelatorioTexto(qual: QualCiclo = 'atual'): string {
  const escopo = qual === 'anterior'
    ? 'do *ciclo anterior* (ciclo fechado)'
    : 'do *ciclo atual*';
  return [
    '📊 *Relatórios Sistemma*',
    '',
    `Os PDFs usam *somente os dados deste contrato* (grupo mapeado) — ${escopo}.`,
    '',
    'Escolha uma opção (responda com o número):',
    '',
    '*1* — Ciclo operacional',
    'PDF gerencial do ciclo de medição — indicadores, qualidade vs ideal, frota e rankings.',
    '',
    '*2* — Análise de peso (ciclo)',
    'PDF da análise de peso vs ideal do *seu* contrato (mesmo critério da Análise de Peso no sistema).',
    '',
    '*3* — Evolução diária (gráficos)',
    'PDF com gráficos de qualidade vs peso ideal *deste contrato*. Depois escolha a janela: semana, 15 dias, ciclo atual ou *ciclo anterior*.',
    '',
    '*4* — Relatório do dia (operação)',
    'PDF diário no formato Coleta BH: viagens, peso × ideal, hora produtiva por trecho e rankings.',
    '',
    qual === 'atual'
      ? '_Atalho: *ciclo anterior* · *peso anterior* · *evolucao anterior*_'
      : '_Você pediu o ciclo anterior. Escolha 1, 2 ou 3._',
    '',
    '_Digite *cancelar* para sair._',
  ].join('\n');
}

function menuEvolucaoJanelaTexto(): string {
  return [
    '📈 *Evolução diária — janela*',
    '',
    'Escolha o período dos gráficos:',
    '',
    '*1* — Última semana',
    '*2* — Últimos 15 dias',
    '*3* — Por ciclo atual (completo)',
    '*4* — Ciclo anterior (completo)',
    '',
    '_Digite *cancelar* para sair._',
  ].join('\n');
}

function resolverJanelaEvolucao(norm: string): JanelaEvolucao | null {
  if (norm === '4' || textoPedeCicloAnterior(norm)) {
    return { dias: 0, label: 'Ciclo anterior (completo)', cicloAnterior: true };
  }
  if (norm === '1' || norm.includes('semana')) return JANELAS_EVOLUCAO[0];
  if (norm === '2' || norm.includes('15')) return JANELAS_EVOLUCAO[1];
  if (
    norm === '3'
    || norm.includes('ciclo')
    || norm === 'completo'
    || norm.includes('por ciclo')
  ) {
    return JANELAS_EVOLUCAO[2];
  }
  return null;
}

function fmtEixoDia(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const semana = DIAS_SEMANA[new Date(y, m - 1, d, 12).getDay()] || '';
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return semana ? `${semana} ${dd}/${mm}` : `${dd}/${mm}`;
}

function zeradoFaixas(): Record<FaixaDominante3d, number> {
  return { otimo: 0, ruim: 0, pessimo: 0, excedido: 0 };
}

async function resolverMapaGrupo(grupoJid: string): Promise<{
  mapa: WhatsappGrupoMapa;
  servico: Servico;
  contrato: Contract | null;
} | null> {
  const mapaRepo = AppDataSource.getRepository(WhatsappGrupoMapa);
  const mapa = await mapaRepo.findOne({
    where: { grupoJid, ativo: true },
    relations: ['servico', 'servico.contract'],
  });
  if (!mapa) return null;

  const servico = mapa.servico
    || await AppDataSource.getRepository(Servico).findOne({
      where: { id: mapa.servicoId },
      relations: ['contract'],
    });
  if (!servico) return null;

  const contrato = (servico as any).contract
    || await AppDataSource.getRepository(Contract).findOne({ where: { id: servico.contract_id } });

  return { mapa, servico, contrato: contrato || null };
}

async function periodoCicloDisponivel(
  servico: Servico,
  contrato: Contract | null,
  qual: QualCiclo = 'atual',
): Promise<{
  dataInicio: string;
  dataFim: string;
  label: string;
  mes: number;
  ano: number;
}> {
  const dia = normalizarDiaInicioCiclo(contrato?.diaInicioCiclo);
  const periodoDados = await PlanilhaService.getPeriodoDadosPorServico(servico.id);
  const { mes, ano } = periodoDados?.dataFim
    ? inferirMesReferenciaDeData(periodoDados.dataFim, dia)
    : inferirMesReferenciaAtual(dia);
  const ref = qual === 'anterior' ? deslocarMesReferencia(mes, ano, -1) : { mes, ano };
  const ciclo = calcularCicloMensalContrato(ref.ano, ref.mes, dia);

  if (qual === 'anterior') {
    return {
      dataInicio: ciclo.dataInicio,
      dataFim: ciclo.dataFim,
      label: `Ciclo anterior — ${ciclo.label}`,
      mes: ref.mes,
      ano: ref.ano,
    };
  }

  const recorte = recortarPeriodoAteReferencia(ciclo.dataInicio, ciclo.dataFim);
  return {
    dataInicio: recorte.dataInicio,
    dataFim: recorte.dataFim,
    label: recorte.emAndamento
      ? `${ciclo.label} — ${recorte.diasDecorridos} dia${recorte.diasDecorridos === 1 ? '' : 's'} decorrido${recorte.diasDecorridos === 1 ? '' : 's'}`
      : ciclo.label,
    mes,
    ano,
  };
}

/** Serviços do mesmo tipo no *mesmo contrato* do grupo mapeado (nunca outros contratos). */
async function listarServicosDoContratoMesmoTipo(servicoBase: Servico): Promise<Servico[]> {
  const contractId = servicoBase.contract_id;
  if (!contractId) return [servicoBase];
  const tipo = String(servicoBase.tipo || TipoServico.COLETA_CAMINHAO);
  const lista = await AppDataSource.getRepository(Servico).find({
    where: { contract_id: contractId, tipo: tipo as any },
    relations: ['contract'],
    order: { nome: 'ASC' },
  });
  if (!lista.length) return [servicoBase];
  if (!lista.some((s) => s.id === servicoBase.id)) {
    lista.unshift(servicoBase);
  }
  return lista;
}

async function gerarEEnviarDia(
  grupoJid: string,
  servico: Servico,
  contrato: Contract | null,
): Promise<void> {
  const tipo = String(servico.tipo || '');
  const ehColeta = tipo === TipoServico.COLETA_CAMINHAO || tipo === 'coleta_caminhao';
  if (!ehColeta) {
    await wuzapiService.enviarTexto(
      grupoJid,
      'O relatório do dia no formato Coleta BH vale só para serviço de *coleta*.',
    );
    return;
  }

  const periodo = await PlanilhaService.getPeriodoDadosPorServico(servico.id);
  const dataIso = periodo?.dataFim || null;
  if (!dataIso) {
    await wuzapiService.enviarTexto(
      grupoJid,
      '⚠️ Sem dia operacional neste contrato. Envie a planilha do dia primeiro.',
    );
    return;
  }

  const dataBr = dataIso.split('-').reverse().join('/');
  await wuzapiService.enviarTexto(
    grupoJid,
    `⏳ Gerando *relatório de operação do dia* ${dataBr}…\n${servico.nome}`,
  );

  const { html, nomeArquivo } = await montarHtmlRelatorioDiaColeta({
    servico,
    contrato,
    dataIso,
  });
  const pdf = await htmlToPdf(html, {
    useCache: false,
    margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' },
  });
  await wuzapiService.enviarDocumento(
    grupoJid,
    nomeArquivo,
    pdf,
    `Operação ${dataBr} — ${servico.nome}`,
  );
}

async function gerarEEnviarCiclo(
  grupoJid: string,
  servico: Servico,
  contrato: Contract | null,
  qual: QualCiclo = 'atual',
): Promise<void> {
  const periodo = await periodoCicloDisponivel(servico, contrato, qual);
  const nomeCiclo = qual === 'anterior' ? 'ciclo anterior' : 'ciclo atual';
  await wuzapiService.enviarTexto(
    grupoJid,
    `⏳ Gerando *PDF Ciclo Operacional* (${nomeCiclo})…\n${periodo.label}\n(${periodo.dataInicio} → ${periodo.dataFim})`,
  );

  const dias = await PlanilhaService.getMetricasPorDia(
    servico.id,
    periodo.dataInicio,
    periodo.dataFim,
  );
  const totais = dias.reduce(
    (acc, d) => ({
      rotas: acc.rotas + d.rotas,
      viagens: acc.viagens + d.viagens,
      pesoTotalKg: acc.pesoTotalKg + d.pesoTotalKg,
      kmTotal: acc.kmTotal + d.kmTotal,
    }),
    { rotas: 0, viagens: 0, pesoTotalKg: 0, kmTotal: 0 },
  );

  if (totais.viagens <= 0) {
    await wuzapiService.enviarTexto(
      grupoJid,
      `⚠️ Sem viagens no ${nomeCiclo} (${periodo.label}). Importe a planilha ou escolha o ciclo atual.`,
    );
    return;
  }

  const valoresFixos = buildValoresFixosFaturamento(
    contrato,
    servico.configFaturamento?.ativo ? servico.configFaturamento : null,
  );
  const agregacao = await getAgregacaoColeta(servico.id, {
    dataInicio: periodo.dataInicio,
    dataFim: periodo.dataFim,
    valoresFixos,
  });

  const cfgOp = contrato?.configOperacional;
  const capacidade = await carregarViagensCapacidadePeriodo(
    servico.id,
    periodo.dataInicio,
    periodo.dataFim,
    {
      volumeL: cfgOp?.volumeL || null,
      pesoMaximoKg: cfgOp?.pesoMaximoKg || null,
      densidadeResiduoKgL: cfgOp?.densidadeResiduoKgL ?? null,
      densidadeKgL: cfgOp?.densidadeKgL || null,
      densidadeKgLPorPlaca: cfgOp?.densidadeKgLPorPlaca || null,
    },
  );

  const html = gerarHtmlCicloOperacionalWhatsapp({
    servicoNome: servico.nome,
    contratoNome: contrato?.numeroContrato || '—',
    periodo,
    dias,
    totais,
    resumo: agregacao.resumo,
    porPlaca: agregacao.porPlaca.slice(0, 40),
    porMotorista: agregacao.porMotorista.slice(0, 25),
    porDistrito: agregacao.porDistrito.slice(0, 25),
    porTipoFat: agregacao.resumo.fatPorTipo || {},
    capacidade,
  });

  const pdf = await htmlToPdf(html, { useCache: false });
  const nomeServico = String(servico.nome || 'Servico')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const dataArquivo = (iso: string) => iso.split('-').reverse().join('-');
  const tagCiclo = qual === 'anterior' ? 'Anterior' : 'Operacional';
  const nome = `${nomeServico}_Operacao_Ciclo_${tagCiclo}_${dataArquivo(periodo.dataInicio)}_a_${dataArquivo(periodo.dataFim)}.pdf`;
  await wuzapiService.enviarDocumento(
    grupoJid,
    nome,
    pdf,
    `📄 Ciclo ${qual === 'anterior' ? 'anterior' : 'operacional'} · ${servico.nome} · ${periodo.label}`,
  );
}

async function gerarEEnviarComparativo(
  grupoJid: string,
  servicoBase: Servico,
  contratoBase: Contract | null,
  qual: QualCiclo = 'atual',
): Promise<void> {
  const tipo = String(servicoBase.tipo || TipoServico.COLETA_CAMINHAO);
  const tipoLabel = TIPOS_SERVICO_META[tipo]?.label || tipo;
  const contratoNome = contratoBase?.numeroContrato || servicoBase.nome || 'Contrato';
  const nomeCiclo = qual === 'anterior' ? 'ciclo anterior' : 'ciclo atual';

  await wuzapiService.enviarTexto(
    grupoJid,
    `⏳ Gerando *análise de peso* do contrato *${contratoNome}* (${nomeCiclo})…\nTipo: ${tipoLabel}`,
  );

  const servicos = await listarServicosDoContratoMesmoTipo(servicoBase);
  const periodoBase = await periodoCicloDisponivel(servicoBase, contratoBase, qual);
  const linhas: Array<{
    contratoNome: string;
    servicoNome: string;
    totalRegistros: number;
    periodoLabel: string;
    analise: NonNullable<ReturnType<typeof analisarPesoColeta>>;
  }> = [];

  for (const s of servicos) {
    const contrato = (s as any).contract as Contract | undefined
      || await AppDataSource.getRepository(Contract).findOne({ where: { id: s.contract_id } });
    const periodo = await periodoCicloDisponivel(s, contrato || null, qual);
    const diasPeriodo = await PlanilhaService.getMetricasPorDia(
      s.id,
      periodo.dataInicio,
      periodo.dataFim,
    );
    const datasAtivas = diasPeriodo.filter((d) => d.viagens > 0).map((d) => d.data);
    const dadosPeriodo: Record<string, any>[] = [];
    for (const data of datasAtivas) {
      const pagina = await PlanilhaService.getDadosBrutosPorDia(s.id, data, {
        apenasValidos: true,
      });
      dadosPeriodo.push(...pagina.dados);
    }
    if (dadosPeriodo.length === 0) continue;

    const cfgOp = contrato?.configOperacional;
    const limites = resolverLimitesDoContrato(cfgOp);
    const analise = analisarPesoColeta(normalizarDados(dadosPeriodo), s.id, {
      colunaTipoCaminhao: s.configFaturamento?.colunaTipoCaminhao || undefined,
      limitesPeso: limites.peso,
      limitesVolume: limites.volume,
      densidadeOtima: normalizarDensidadeResiduoKgL(cfgOp?.densidadeResiduoKgL),
      densidadeKgL: cfgOp?.densidadeKgL || null,
      densidadeKgLPorPlaca: cfgOp?.densidadeKgLPorPlaca || null,
    });
    if (!analise) continue;

    linhas.push({
      contratoNome: contrato?.numeroContrato || '—',
      servicoNome: s.nome,
      totalRegistros: dadosPeriodo.length,
      periodoLabel: periodo.label,
      analise,
    });
  }

  if (linhas.length < 1) {
    await wuzapiService.enviarTexto(
      grupoJid,
      `⚠️ Sem dados no ${nomeCiclo} (${periodoBase.label}) para *${contratoNome}*.`,
    );
    return;
  }

  const html = gerarHtmlComparativoContratosWhatsapp({
    tipoLabel,
    periodoRef: periodoBase.label,
    linhas,
  });
  const pdf = await htmlToPdf(html, { useCache: false });
  const nomeSafe = String(contratoNome).replace(/[^\w\-]+/g, '_');
  const tag = qual === 'anterior' ? 'Anterior' : periodoBase.dataInicio;
  const nome = `Analise_Peso_${nomeSafe}_${tag}_${periodoBase.dataInicio}.pdf`;
  await wuzapiService.enviarDocumento(
    grupoJid,
    nome,
    pdf,
    `📊 Análise de peso · ${contratoNome} · ${periodoBase.label}`,
  );
}

async function gerarEEnviarEvolucaoDiaria(
  grupoJid: string,
  servicoBase: Servico,
  contratoBase: Contract | null,
  janela: JanelaEvolucao = JANELAS_EVOLUCAO[0],
): Promise<void> {
  const tipo = String(servicoBase.tipo || TipoServico.COLETA_CAMINHAO);
  if (tipo !== TipoServico.COLETA_CAMINHAO && tipo !== 'coleta_caminhao') {
    await wuzapiService.enviarTexto(
      grupoJid,
      '⚠️ Evolução diária está disponível apenas para *Coleta com caminhão*.',
    );
    return;
  }

  const tipoLabel = TIPOS_SERVICO_META[tipo]?.label || 'Coleta com caminhão';
  const qual: QualCiclo = janela.cicloAnterior ? 'anterior' : 'atual';
  const periodo = await periodoCicloDisponivel(servicoBase, contratoBase, qual);
  const contratoNome = contratoBase?.numeroContrato || servicoBase.nome || 'Contrato';

  await wuzapiService.enviarTexto(
    grupoJid,
    `⏳ Gerando *PDF Evolução Diária* de *${contratoNome}*…\n${periodo.label}\nJanela: *${janela.label}*`,
  );

  // Somente serviços deste contrato (grupo mapeado) — nunca outros municípios/contratos
  const servicos = await listarServicosDoContratoMesmoTipo(servicoBase);
  if (!servicos.length) {
    await wuzapiService.enviarTexto(grupoJid, '⚠️ Nenhum serviço de coleta encontrado neste contrato.');
    return;
  }

  const dataInicio = periodo.dataInicio;
  const dataFim = periodo.dataFim;

  const result = await agregarQualidadeIdeal3d({
    servicoIds: servicos.map((s) => s.id),
    dataInicio,
    dataFim,
  });

  const diasComDados = [...new Set(result.pontos.map((p) => p.data))].sort();
  const diasJanela = janela.dias > 0 ? diasComDados.slice(-janela.dias) : diasComDados;
  if (diasJanela.length === 0) {
    await wuzapiService.enviarTexto(
      grupoJid,
      `⚠️ Sem pesagens no ${qual === 'anterior' ? 'ciclo anterior' : 'ciclo atual'} (${periodo.label}) para montar a evolução diária.`,
    );
    return;
  }

  const dentro = new Set(diasJanela);
  const porContrato = new Map<string, {
    nome: string;
    porDia: Map<string, Record<FaixaDominante3d, number>>;
    total: Record<FaixaDominante3d, number>;
  }>();
  const totalGeral = zeradoFaixas();

  for (const p of result.pontos) {
    if (!dentro.has(p.data)) continue;
    const chave = p.contratoId || p.servicoId;
    let bloco = porContrato.get(chave);
    if (!bloco) {
      const nome = String(p.contratoNome || 'Contrato').trim() || 'Contrato';
      const servico = String(p.servicoNome || '').trim();
      bloco = {
        nome: servico ? `${nome} · ${servico}` : nome,
        porDia: new Map(),
        total: zeradoFaixas(),
      };
      porContrato.set(chave, bloco);
    }
    const faixas = p.faixas || zeradoFaixas();
    const doDia = bloco.porDia.get(p.data) || zeradoFaixas();
    for (const f of FAIXAS_IDS) {
      const n = Number(faixas[f]) || 0;
      doDia[f] += n;
      bloco.total[f] += n;
      totalGeral[f] += n;
    }
    bloco.porDia.set(p.data, doDia);
  }

  const montarLinhas = (porDia: Map<string, Record<FaixaDominante3d, number>>) =>
    diasJanela.map((data) => {
      const c = porDia.get(data);
      const viagens = c ? FAIXAS_IDS.reduce((s, f) => s + c[f], 0) : 0;
      if (!c || viagens === 0) {
        return {
          data,
          label: fmtEixoDia(data),
          viagens: 0,
          otimo: null,
          ruim: null,
          pessimo: null,
          excedido: null,
        };
      }
      const pct = (n: number) => Math.round((n / viagens) * 1000) / 10;
      return {
        data,
        label: fmtEixoDia(data),
        viagens,
        otimo: pct(c.otimo),
        ruim: pct(c.ruim),
        pessimo: pct(c.pessimo),
        excedido: pct(c.excedido),
      };
    });

  const blocos: BlocoEvolucaoPdf[] = [...porContrato.entries()]
    .map(([id, b]) => {
      const viagens = FAIXAS_IDS.reduce((s, f) => s + b.total[f], 0);
      const pct = Object.fromEntries(
        FAIXAS_IDS.map((f) => [f, viagens > 0 ? (b.total[f] / viagens) * 100 : 0]),
      ) as Record<FaixaDominante3d, number>;
      return { id, nome: b.nome, viagens, pct, linhas: montarLinhas(b.porDia) };
    })
    .filter((b) => b.viagens > 0)
    .sort((a, b) => b.viagens - a.viagens);

  if (blocos.length === 0) {
    await wuzapiService.enviarTexto(grupoJid, '⚠️ Sem dados de qualidade vs peso ideal na janela.');
    return;
  }

  const totalViagens = FAIXAS_IDS.reduce((s, f) => s + totalGeral[f], 0);
  const pctGeral = Object.fromEntries(
    FAIXAS_IDS.map((f) => [f, totalViagens > 0 ? (totalGeral[f] / totalViagens) * 100 : 0]),
  ) as Record<FaixaDominante3d, number>;

  const periodoLabel = `${fmtEixoDia(diasJanela[0])} a ${fmtEixoDia(diasJanela[diasJanela.length - 1])}`;
  const html = gerarHtmlEvolucaoDiariaWhatsapp({
    tipoLabel,
    periodoLabel,
    janelaLabel: janela.dias > 0 ? `${janela.label} (${diasJanela.length} dias)` : `Por ciclo · ${diasJanela.length} dias`,
    geradoEm: new Date().toLocaleString('pt-BR'),
    totalViagens,
    pctGeral,
    blocos,
  });

  const pdf = await htmlToPdf(html, { useCache: false, waitMs: 4500 });
  const nomeSafe = String(contratoNome).replace(/[^\w\-]+/g, '_');
  const nome = `Evolucao_Diaria_${nomeSafe}_${diasJanela[0]}_${diasJanela[diasJanela.length - 1]}.pdf`;
  await wuzapiService.enviarDocumento(
    grupoJid,
    nome,
    pdf,
    `📈 Evolução diária · ${contratoNome} · ${periodoLabel}`,
  );
}

/**
 * Processa comando de texto. Retorna true se consumiu a mensagem.
 */
export async function processarComandoTextoWhatsapp(opts: {
  grupoJid: string;
  texto: string;
  isFromMe?: boolean;
}): Promise<{ processado: boolean; motivo?: string }> {
  limparSessoes();
  const texto = opts.texto.trim();
  if (!texto) return { processado: false, motivo: 'Sem texto' };

  // Ignora eco das próprias mensagens do bot (exceto se for teste humano no mesmo número com comando explícito)
  const norm = normalizarTexto(texto);

  const resolvido = await resolverMapaGrupo(opts.grupoJid);
  if (!resolvido) {
    return { processado: false, motivo: 'Grupo não mapeado' };
  }
  if (!wuzapiService.isConfigured) {
    return { processado: false, motivo: 'WuzAPI não configurada' };
  }

  const { servico, contrato } = resolvido;
  const sessao = sessoes.get(opts.grupoJid);

  const ehRelatorioDiaDireto =
    norm === 'relatorio dia'
    || norm === 'relatorio do dia'
    || norm === 'relatorios do dia'
    || /^relatorio(s)? do dia$/.test(norm);

  const ehRelatorio = /^(relatorio|relatorios|report)(\b|$)/.test(norm) && !ehRelatorioDiaDireto;

  if (ehRelatorioDiaDireto) {
    try {
      await gerarEEnviarDia(opts.grupoJid, servico, contrato);
    } catch (err: any) {
      await wuzapiService.enviarTexto(
        opts.grupoJid,
        `❌ Falha ao gerar o relatório do dia: ${err?.message || 'erro'}`,
      );
    }
    return { processado: true };
  }

  if (ehRelatorio) {
    const qualPedido = textoPedeCicloAnterior(norm) ? 'anterior' : undefined;
    sessoes.set(opts.grupoJid, {
      etapa: 'menu_relatorio',
      expiresAt: Date.now() + TTL_MS,
      servicoId: servico.id,
      contratoId: servico.contract_id,
      qualCiclo: qualPedido,
    });
    await wuzapiService.enviarTexto(opts.grupoJid, menuRelatorioTexto(qualPedido || 'atual'));
    return { processado: true };
  }

  if (norm === 'cancelar' || norm === 'sair') {
    sessoes.delete(opts.grupoJid);
    await wuzapiService.enviarTexto(opts.grupoJid, 'Ok, cancelei. Digite *relatorio* quando quiser de novo.');
    return { processado: true };
  }

  if (norm === 'menu' || norm === 'ajuda' || norm === 'help' || norm === 'comandos') {
    sessoes.delete(opts.grupoJid);
    await wuzapiService.enviarTexto(
      opts.grupoJid,
      [
        '🤖 *Sistemma — comandos*',
        '',
        '*relatorio* — menu de PDFs (só deste contrato)',
        '*relatorio anterior* — mesmo menu, já no ciclo fechado',
        '*diario* / *pdf dia* — relatório de operação do último dia',
        '*ciclo* / *ciclo anterior* — PDF ciclo operacional',
        '*comparativo* / *peso anterior* — PDF análise de peso',
        '*evolucao* — gráficos (semana, 15 dias, ciclo atual ou anterior)',
        '',
        'Envie planilha .xlsx para importar + PDF do dia.',
      ].join('\n'),
    );
    return { processado: true };
  }

  if (sessao?.etapa === 'menu_relatorio') {
    const escolhaCiclo = /^1\b/.test(norm) || (norm.includes('ciclo') && !norm.includes('evol') && !norm.includes('por') && !norm.includes('dia'));
    const escolhaComp = /^2\b/.test(norm) || norm.includes('compar') || norm.includes('peso') || norm.includes('analise');
    const escolhaEvol =
      /^3\b/.test(norm)
      || norm.includes('evolucao')
      || norm.includes('grafico')
      || norm.includes('gerente');
    const escolhaDia =
      /^4\b/.test(norm)
      || norm === 'diario'
      || norm.includes('do dia')
      || norm === 'operacao'
      || norm === 'pdf dia';

    if (!escolhaCiclo && !escolhaComp && !escolhaEvol && !escolhaDia) {
      if (textoPedeCicloAnterior(norm)) {
        sessoes.set(opts.grupoJid, {
          ...sessao,
          expiresAt: Date.now() + TTL_MS,
          qualCiclo: 'anterior',
        });
        await wuzapiService.enviarTexto(opts.grupoJid, menuRelatorioTexto('anterior'));
        return { processado: true };
      }
      await wuzapiService.enviarTexto(
        opts.grupoJid,
        'Não entendi. Responda *1* (ciclo), *2* (análise de peso), *3* (evolução) ou *4* (relatório do dia), ou *cancelar*.',
      );
      return { processado: true };
    }

    const tipo: TipoRelatorioSessao = escolhaDia
      ? 'dia'
      : escolhaEvol
        ? 'evolucao'
        : escolhaCiclo
          ? 'ciclo'
          : 'peso';
    const qual: QualCiclo = textoPedeCicloAnterior(norm)
      ? 'anterior'
      : (/\batual\b/.test(norm) ? 'atual' : (sessao.qualCiclo || 'atual'));

    if (tipo === 'evolucao' && qual === 'atual') {
      sessoes.set(opts.grupoJid, {
        etapa: 'menu_evolucao_janela',
        expiresAt: Date.now() + TTL_MS,
        servicoId: servico.id,
        contratoId: servico.contract_id,
        qualCiclo: 'atual',
      });
      await wuzapiService.enviarTexto(opts.grupoJid, menuEvolucaoJanelaTexto());
      return { processado: true };
    }

    sessoes.delete(opts.grupoJid);
    try {
      await gerarRelatorioTipo(opts.grupoJid, servico, contrato, tipo, qual);
    } catch (err: any) {
      console.error('[WhatsappComandoRelatorio]', err?.message || err);
      await wuzapiService.enviarTexto(
        opts.grupoJid,
        `❌ Falha ao gerar relatório: ${err?.message || 'erro desconhecido'}`,
      );
    }
    return { processado: true };
  }

  if (sessao?.etapa === 'menu_evolucao_janela') {
    const janela = resolverJanelaEvolucao(norm);
    if (!janela) {
      await wuzapiService.enviarTexto(
        opts.grupoJid,
        'Não entendi. Responda *1* (semana), *2* (15 dias), *3* (ciclo atual) ou *4* (ciclo anterior), ou *cancelar*.',
      );
      return { processado: true };
    }
    sessoes.delete(opts.grupoJid);
    try {
      await gerarEEnviarEvolucaoDiaria(opts.grupoJid, servico, contrato, janela);
    } catch (err: any) {
      console.error('[WhatsappComandoRelatorio]', err?.message || err);
      await wuzapiService.enviarTexto(
        opts.grupoJid,
        `❌ Falha ao gerar evolução diária: ${err?.message || 'erro desconhecido'}`,
      );
    }
    return { processado: true };
  }

  // Atalhos diretos sem menu
  if (
    norm === 'ciclo'
    || norm === 'ciclo operacional'
    || norm === 'pdf ciclo'
    || /^ciclo( operacional)? anterior$/.test(norm)
    || /^pdf ciclo anterior$/.test(norm)
  ) {
    const qual: QualCiclo = textoPedeCicloAnterior(norm) ? 'anterior' : 'atual';
    try {
      await gerarEEnviarCiclo(opts.grupoJid, servico, contrato, qual);
    } catch (err: any) {
      await wuzapiService.enviarTexto(
        opts.grupoJid,
        `❌ Falha ao gerar ciclo: ${err?.message || 'erro'}`,
      );
    }
    return { processado: true };
  }
  if (
    norm === 'comparativo'
    || norm === 'comparar'
    || norm === 'pdf comparativo'
    || /^(comparativo|peso|analise de peso) anterior$/.test(norm)
    || norm === 'peso anterior'
  ) {
    const qual: QualCiclo = textoPedeCicloAnterior(norm) ? 'anterior' : 'atual';
    try {
      await gerarEEnviarComparativo(opts.grupoJid, servico, contrato, qual);
    } catch (err: any) {
      await wuzapiService.enviarTexto(
        opts.grupoJid,
        `❌ Falha ao gerar comparativo: ${err?.message || 'erro'}`,
      );
    }
    return { processado: true };
  }
  if (
    norm === 'diario'
    || norm === 'pdf dia'
    || norm === 'relatorio dia'
    || norm === 'relatorio do dia'
    || norm === 'operacao'
    || norm === 'pdf operacao'
  ) {
    try {
      await gerarEEnviarDia(opts.grupoJid, servico, contrato);
    } catch (err: any) {
      await wuzapiService.enviarTexto(
        opts.grupoJid,
        `❌ Falha ao gerar o relatório do dia: ${err?.message || 'erro'}`,
      );
    }
    return { processado: true };
  }
  if (
    /^evolucao anterior$/.test(norm)
    || /^evolucao ciclo anterior$/.test(norm)
  ) {
    try {
      await gerarRelatorioTipo(opts.grupoJid, servico, contrato, 'evolucao', 'anterior');
    } catch (err: any) {
      await wuzapiService.enviarTexto(
        opts.grupoJid,
        `❌ Falha ao gerar evolução diária: ${err?.message || 'erro'}`,
      );
    }
    return { processado: true };
  }
  if (
    norm === 'evolucao'
    || norm === 'evolucao diaria'
    || norm === 'pdf evolucao'
    || norm === 'graficos'
  ) {
    sessoes.set(opts.grupoJid, {
      etapa: 'menu_evolucao_janela',
      expiresAt: Date.now() + TTL_MS,
      servicoId: servico.id,
      contratoId: servico.contract_id,
    });
    await wuzapiService.enviarTexto(opts.grupoJid, menuEvolucaoJanelaTexto());
    return { processado: true };
  }
  if (norm === 'evolucao ciclo' || norm === 'evolucao por ciclo') {
    try {
      await gerarEEnviarEvolucaoDiaria(opts.grupoJid, servico, contrato, JANELAS_EVOLUCAO[2]);
    } catch (err: any) {
      await wuzapiService.enviarTexto(
        opts.grupoJid,
        `❌ Falha ao gerar evolução diária: ${err?.message || 'erro'}`,
      );
    }
    return { processado: true };
  }

  return { processado: false, motivo: 'Não é comando conhecido' };
}

async function gerarRelatorioTipo(
  grupoJid: string,
  servico: Servico,
  contrato: Contract | null,
  tipo: TipoRelatorioSessao,
  qual: QualCiclo,
): Promise<void> {
  if (tipo === 'dia') {
    await gerarEEnviarDia(grupoJid, servico, contrato);
    return;
  }
  if (tipo === 'ciclo') {
    await gerarEEnviarCiclo(grupoJid, servico, contrato, qual);
    return;
  }
  if (tipo === 'peso') {
    await gerarEEnviarComparativo(grupoJid, servico, contrato, qual);
    return;
  }
  const janela: JanelaEvolucao = qual === 'anterior'
    ? { dias: 0, label: 'Ciclo anterior (completo)', cicloAnterior: true }
    : JANELAS_EVOLUCAO[2];
  await gerarEEnviarEvolucaoDiaria(grupoJid, servico, contrato, janela);
}
