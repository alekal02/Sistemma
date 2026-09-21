/**
 * Monta o HTML do PDF diário conforme o tipo do serviço.
 * Usado pelo chatbot (sob demanda) e pelos scripts de geração.
 */
import { Servico } from '../../entities/Servico';
import { Contract } from '../../entities/Contract';
import PlanilhaService from '../PlanilhaService';
import { getAgregacaoRocada } from '../rocadaAgregacaoService';
import { montarHtmlRelatorioDiaColeta } from './montarRelatorioDiaColeta';
import {
  gerarHtmlRelatorioDiaRocada,
  gerarHtmlRelatorioDiaUnidade,
  type LinhaGrupoDia,
} from './gerarHtmlRelatorioDiaPorTipo';

export interface HtmlRelatorioDiaServico {
  html: string;
  nomeArquivo: string;
}

function slug(s: string): string {
  return String(s || 'servico')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'servico';
}

function fmtArquivo(iso: string): string {
  return iso.split('-').reverse().join('-');
}

function numDe(r: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = r[k];
    if (v == null || v === '') continue;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return 0;
}

function textoDe(r: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v == null || v === '') continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

function agrupar(
  regs: Record<string, unknown>[],
  keys: string[],
  valorFn: (r: Record<string, unknown>) => number,
): LinhaGrupoDia[] {
  const mapa = new Map<string, LinhaGrupoDia>();
  for (const r of regs) {
    const label = textoDe(r, keys) || 'Não informado';
    const valor = valorFn(r);
    const atual = mapa.get(label) || { label, registros: 0, valor: 0 };
    atual.registros += 1;
    atual.valor += valor;
    mapa.set(label, atual);
  }
  return [...mapa.values()]
    .filter((l) => l.label !== 'Não informado' && l.valor > 0)
    .sort((a, b) => b.valor - a.valor);
}

function metricaLinha(tipo: string, r: Record<string, unknown>): { valor: number; sufixo: string; label: string; tipoLabel: string } {
  const area = numDe(r, ['Area m²', 'AREA_M2', 'M2', 'AREA_ROCADA']);
  const mLin = numDe(r, ['Metro Linear', 'METRO_LINEAR', 'COMPRIMENTO']);
  const kmLin = numDe(r, ['KM Linear', 'KM_LINEAR', 'QUILOMETROS_VARRIDOS']);
  const arv = numDe(r, ['Quantidade de Arvore', 'QTD_ARVORE', 'ARVORES_PODADAS']);
  const qtd = numDe(r, ['QUANTITATIVO', 'QUANTIDADE', 'QTD', 'QTDE']);
  switch (tipo) {
    case 'rocadeira':
      return { valor: area || qtd, sufixo: 'm²', label: 'Área', tipoLabel: 'Roçada' };
    case 'varricao':
      return { valor: kmLin || qtd, sufixo: 'km', label: 'KM linear', tipoLabel: 'Varrição' };
    case 'capina':
      if (kmLin > 0) return { valor: kmLin, sufixo: 'km', label: 'Extensão', tipoLabel: 'Capina' };
      return { valor: mLin || qtd, sufixo: 'm', label: 'Metro linear', tipoLabel: 'Capina' };
    case 'poda':
      return { valor: arv || qtd, sufixo: 'arv', label: 'Árvores', tipoLabel: 'Poda' };
    case 'pintura_meio_fio':
      return { valor: mLin || qtd, sufixo: 'm', label: 'Metro linear', tipoLabel: 'Pintura' };
    case 'remocao':
      return { valor: qtd || arv, sufixo: 'pts', label: 'Pontos', tipoLabel: 'Remoção' };
    default:
      return { valor: qtd || arv, sufixo: 'pts', label: 'Pontos', tipoLabel: 'Serviço' };
  }
}

async function htmlRocada(servico: Servico, contrato: Contract | null, dataIso: string): Promise<string | null> {
  const agg = await getAgregacaoRocada(servico.id, { data: dataIso, topN: 50 });
  if (agg.resumo.areaM2 <= 0 && agg.resumo.registros <= 0) return null;
  const toGrupo = (arr: Array<{ label: string; registros: number; areaM2: number }>): LinhaGrupoDia[] =>
    arr.map((l) => ({ label: l.label, registros: l.registros, valor: l.areaM2 }));
  return gerarHtmlRelatorioDiaRocada({
    servicoNome: servico.nome,
    contratoNome: contrato?.numeroContrato || '—',
    dataIso,
    resumo: {
      registros: agg.resumo.registros,
      areaM2: agg.resumo.areaM2,
      areaManualM2: agg.resumo.areaManualM2,
      areaMecanizadaM2: agg.resumo.areaMecanizadaM2,
      registrosManual: agg.resumo.registrosManual,
      registrosMecanizada: agg.resumo.registrosMecanizada,
      bairros: agg.resumo.bairros,
      operadores: agg.resumo.operadores,
      equipes: agg.resumo.equipes,
      equipamentos: agg.resumo.equipamentos,
    },
    porTipo: agg.porTipo,
    porBairro: toGrupo(agg.porBairro),
    porOperador: toGrupo(agg.porOperador),
    porEquipe: toGrupo(agg.porEquipe),
    porEquipamento: toGrupo(agg.porEquipamento),
    frotaCiclo: agg.frotaCiclo,
    valorM2: Number(servico.configFaturamento?.valorM2 || 0) || null,
  });
}

async function htmlUnidade(servico: Servico, contrato: Contract | null, dataIso: string): Promise<string | null> {
  const dias = await PlanilhaService.getMetricasPorDia(servico.id, dataIso, dataIso);
  const d = dias[0];
  const brutos = await PlanilhaService.getDadosBrutosPorDia(servico.id, dataIso, {
    apenasValidos: false,
    pularValidacaoViagem: true,
  });
  const regs = brutos.dados || [];
  const valorFn = (r: Record<string, unknown>) => metricaLinha(servico.tipo, r).valor;
  const meta = metricaLinha(servico.tipo, {});
  const metricaTotal = d
    ? (servico.tipo === 'varricao'
      ? Number(d.kmLinear || d.quantitativo || 0)
      : servico.tipo === 'poda'
        ? Number(d.qtdArvore || d.quantitativo || d.rotas || 0)
        : servico.tipo === 'remocao'
          ? Number(d.quantitativo || d.qtdArvore || d.rotas || 0)
          : Number(d.quantitativo || d.metroLinear || d.kmLinear || d.rotas || 0))
    : regs.reduce((s, r) => s + valorFn(r), 0);
  const registros = Number(d?.rotas || brutos.total || regs.length);
  if (metricaTotal <= 0 && registros <= 0) return null;

  const porBairro = agrupar(regs, ['BAIRRO', 'bairro', 'Setor', 'SETOR', 'regional', 'DISTRITO'], valorFn);
  const porEquipe = agrupar(regs, ['Equipe', 'EQUIPE', 'turno', 'TURNO'], valorFn);
  const porOperador = agrupar(regs, ['Operador', 'OPERADOR', 'Funcionario', 'FUNCIONARIO', 'MOTORISTA'], valorFn);

  return gerarHtmlRelatorioDiaUnidade({
    servicoNome: servico.nome,
    contratoNome: contrato?.numeroContrato || '—',
    dataIso,
    tipoLabel: meta.tipoLabel,
    labelMetrica: meta.label,
    sufixo: meta.sufixo,
    metricaTotal,
    registros,
    quantitativo: Number(d?.quantitativo || 0) || undefined,
    porBairro,
    porEquipe,
    porOperador,
    linhas: regs.map((r) => {
      const m = metricaLinha(servico.tipo, r);
      return {
        logradouro: textoDe(r, ['LOGRADOURO', 'logradouro', 'distrito', 'Avenida / Rua', 'DISTRITO']) || '—',
        bairro: textoDe(r, ['BAIRRO', 'bairro', 'Setor', 'regional']) || '—',
        und: textoDe(r, ['UND', '_undNormalizada']) || '—',
        qtd: numDe(r, ['QUANTITATIVO', 'QUANTIDADE', 'QTD', 'QTDE']),
        metrica: m.valor,
        equipe: textoDe(r, ['Equipe', 'EQUIPE', 'turno']) || '—',
        operador: textoDe(r, ['Operador', 'OPERADOR', 'Funcionario']) || '—',
      };
    }),
  });
}

export async function montarHtmlRelatorioDiaPorServico(
  servico: Servico,
  contrato: Contract | null,
  dataIso: string,
): Promise<HtmlRelatorioDiaServico | null> {
  const tipo = String(servico.tipo || '');
  const contratoSlug = slug(contrato?.numeroContrato || 'contrato');
  const nomePadrao = `${contratoSlug}_Dia_${slug(servico.nome)}_${fmtArquivo(dataIso)}.pdf`;

  if (tipo === 'coleta_caminhao') {
    const dias = await PlanilhaService.getMetricasPorDia(servico.id, dataIso, dataIso);
    const d = dias[0];
    if (!d || (d.viagens <= 0 && d.rotas <= 0 && d.pesoTotalKg <= 0)) return null;
    const gerado = await montarHtmlRelatorioDiaColeta({ servico, contrato, dataIso });
    if (!gerado?.html) return null;
    const nome = gerado.nomeArquivo.endsWith('.pdf') ? gerado.nomeArquivo : `${gerado.nomeArquivo}.pdf`;
    return { html: gerado.html, nomeArquivo: nome };
  }

  if (tipo === 'rocadeira') {
    const html = await htmlRocada(servico, contrato, dataIso);
    if (html) return { html, nomeArquivo: nomePadrao };
  }

  const html = await htmlUnidade(servico, contrato, dataIso);
  return html ? { html, nomeArquivo: nomePadrao } : null;
}
