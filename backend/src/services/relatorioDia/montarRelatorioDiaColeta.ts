/**
 * Mesmo PDF de operação do dia em todo contrato de coleta:
 * tela, upload no WhatsApp e comando *relatorio*.
 */
import { Contract } from '../../entities/Contract';
import { Servico } from '../../entities/Servico';
import { normalizarListaPlacasReserva } from '../../utils/placasReserva';
import { getAgregacaoColeta, getMapeamentoOperacional } from '../coletaAgregacaoService';
import { buildValoresFixosFaturamento } from '../configFaturamentoValores';
import { carregarViagensCapacidadeDia } from './capacidadeViagemDia';
import { diaSemanaPt } from './fmt';
import { gerarHtmlRelatorioDia } from './gerarHtmlRelatorioDiaOperacao';
import { gerarNomePdfRelatorioDia } from './gerarNomePdf';
import { calcularKpisOperacaoDiaSql } from './kpisOperacaoDia';
import { analiseOperacaoDeAgregacaoSql } from './operacaoDia';

export async function montarHtmlRelatorioDiaColeta(opts: {
  servico: Servico;
  contrato: Contract | null;
  dataIso: string;
}): Promise<{ html: string; nomeArquivo: string }> {
  const { servico, contrato, dataIso } = opts;
  const valoresFixos = buildValoresFixosFaturamento(contrato, servico.configFaturamento);
  const agg = await getAgregacaoColeta(servico.id, {
    data: dataIso,
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
  const capacidade = await carregarViagensCapacidadeDia(servico.id, dataIso, {
    volumeL: cfgOp?.volumeL || null,
    pesoMaximoKg: cfgOp?.pesoMaximoKg || null,
    densidadeResiduoKgL: cfgOp?.densidadeResiduoKgL ?? null,
    densidadeKgL: cfgOp?.densidadeKgL || null,
    densidadeKgLPorPlaca: cfgOp?.densidadeKgLPorPlaca || null,
  });

  let viagensPesoRota: Awaited<ReturnType<typeof getMapeamentoOperacional>>['viagensPesoRota'] = [];
  try {
    const mapeamento = await getMapeamentoOperacional(servico.id, { data: dataIso });
    viagensPesoRota = mapeamento.viagensPesoRota || [];
  } catch (err: any) {
    console.warn('[RelatorioDiaColeta] Mapeamento operacional:', err?.message || err);
  }

  const html = gerarHtmlRelatorioDia({
    aba: 'operacao',
    servicoNome: servico.nome,
    dataIso,
    diaSemana: diaSemanaPt(dataIso),
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

  const nomeArquivo = `${gerarNomePdfRelatorioDia({
    servicoNome: servico.nome,
    aba: 'operacao',
    dataIso,
  })}.pdf`;

  return { html, nomeArquivo };
}
