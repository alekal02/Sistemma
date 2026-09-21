import type { KpiValor } from '../hooks/useKpiCalculator';
import { formatarIsoParaBr } from './periodoDados';
import type { RegistroDiaLinha } from './dadosPorDia';
import type { OperacaoDiaAnalise, LinhaEficienciaPlaca, OptsAnaliseContratoDia } from './operacaoDia';
import { montarEficienciaPlacas } from './operacaoDia';
import type { ReceitaDiaAnalise, LinhaReceitaGrupo } from './receitaDia';
import type { EstudoRotasDia } from './estudoRotasDia';
import type { CenarioCaixaMediaDia } from './cenarioCaixaMediaDia';
import { fmtMoeda, fmtNum } from './relatorioDiario';
import { resumirFrotaOperacao } from './placasReserva';
import {
  LABEL_TIPO_CAMINHAO,
  PCT_IDEAL_MAX,
  PCT_IDEAL_MIN,
  densidadeOptsToInput,
  pctIdealForaDaMargem,
  textoEscalaIdealCurto,
  TIPOS_LIMITE_CAMINHAO,
  normalizarTipoCaminhaoPeso,
  resolverDensidadeResiduoKgL,
  resolverLimitesPesoKg,
  resolverPesosIdeaisKg,
  type MapaLimiteCaminhao,
  type TipoLimiteCaminhao,
} from './limitesCaminhaoContrato';
import { montarPontosViagemPorTipo } from './viagemPorTipoGrafico';
import {
  COR_STATUS_RANKING,
  LABEL_STATUS_RANKING,
  statusPorPctIdeal,
  type StatusRankingViagem,
} from './rankingViagensTipo';
import { montarDistribuicaoImprodutiva, montarLeituraTrechos } from './trechosImprodutivos';
import {
  referenciaPrincipalBaseline,
  type BaselineDia,
  type ComparativoBaseline,
} from '@sistemma/shared';

export type AbaRelatorioDia = 'operacao' | 'receita';

const PALETA_PIZZA = ['#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ef4444', '#06b6d4'];

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const ESTILOS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 8.5px; color: #1e293b; padding: 12px 14px; line-height: 1.35; width: 100%; }
  .header { background: linear-gradient(135deg,#0f172a,#1e3a5f); color: #fff; border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; }
  .header .hd-tbl { width: 100%; border-collapse: collapse; }
  .header .hd-tbl td { vertical-align: middle; padding: 0; }
  .header .eyebrow { font-size: 6.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #94a3b8; }
  .header h1 { font-size: 15px; font-weight: 800; color: #fbbf24; margin-top: 2px; line-height: 1.15; }
  .header .data { font-size: 9.5px; font-weight: 700; color: #e2e8f0; margin-top: 4px; }
  .header .hd-meta { text-align: right; width: 36%; }
  .header .tipo { display: inline-block; font-size: 6.5px; font-weight: 700; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; }
  .header .tipo.op { color: #c7d2fe; background: rgba(99,102,241,0.28); }
  .header .tipo.rec { color: #6ee7b7; background: rgba(16,185,129,0.22); }
  .header .gerado { font-size: 6.5px; color: #94a3b8; margin-top: 5px; }
  .banner { background: linear-gradient(135deg,#fffbeb,#fef3c7); border: 1px solid #fde68a; border-radius: 8px; padding: 6px 8px; margin-bottom: 8px; font-size: 7.5px; color: #92400e; }
  .tbl-layout { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  .tbl-layout td { vertical-align: top; padding: 0; }
  .hero-dark { background: linear-gradient(135deg,#1e293b,#0f172a); border: 1px solid #334155; border-radius: 10px; padding: 10px 12px; color: #fff; }
  .hero-dark .lbl { font-size: 6px; font-weight: 600; color: #94a3b8; text-transform: uppercase; }
  .hero-dark .val { font-size: 18px; font-weight: 900; color: #fbbf24; font-family: monospace; margin-top: 2px; white-space: nowrap; }
  .hero-dark .sub { font-size: 6.5px; color: #64748b; margin-top: 2px; }
  .mini-tbl { width: 100%; border-collapse: separate; border-spacing: 4px; }
  .mini-dark { background: rgba(255,255,255,0.08); border-radius: 5px; padding: 4px 6px; }
  .mini-dark .lbl { font-size: 5.5px; color: #94a3b8; text-transform: uppercase; }
  .mini-dark .val { font-size: 7.5px; font-weight: 700; color: #e2e8f0; font-family: monospace; white-space: nowrap; }
  .sec { font-size: 6.5px; font-weight: 800; color: #64748b; text-transform: uppercase; margin: 8px 0 5px; }
  .cards-tbl { width: 100%; border-collapse: separate; border-spacing: 5px; margin-bottom: 8px; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-top: 3px solid #3b82f6; border-radius: 6px; padding: 5px 6px; vertical-align: top; }
  .card-lbl { font-size: 5.5px; font-weight: 700; color: #64748b; text-transform: uppercase; }
  .card-val { font-size: 8.5px; font-weight: 800; color: #0f172a; margin-top: 2px; white-space: nowrap; }
  .tarifas { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 6px 8px; margin-bottom: 8px; font-size: 7px; color: #92400e; word-break: break-word; }
  .bloco { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 7px; margin-bottom: 8px; }
  .bloco-hd { font-size: 7px; font-weight: 700; color: #475569; margin-bottom: 5px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }
  .bloco-hd-tbl { width: 100%; border-collapse: collapse; margin-bottom: 5px; }
  .bloco-hd-tbl td { font-size: 7px; font-weight: 700; color: #475569; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
  .bloco-hd-tbl .r { text-align: right; }
  .bloco-hd-tbl .badge { font-size: 6.5px; color: #065f46; background: #d1fae5; padding: 2px 6px; border-radius: 4px; font-weight: 700; white-space: nowrap; }
  .r { text-align: right; }
  .nowrap { white-space: nowrap; }
  table.data { width: 100%; border-collapse: collapse; font-size: 7px; table-layout: fixed; }
  table.data th { padding: 4px 5px; background: #1e293b; color: #fff; font-size: 6px; text-transform: uppercase; text-align: left; }
  table.data th.c, table.data td.c { text-align: center; }
  table.data th.r, table.data td.r { text-align: right; }
  table.data th.fat-h { background: #065f46; color: #6ee7b7; }
  table.data td { padding: 3px 5px; border-bottom: 1px solid #f1f5f9; word-wrap: break-word; overflow-wrap: break-word; }
  table.data td.nowrap, table.data th.nowrap { white-space: nowrap; }
  table.data td.fat { font-weight: 700; color: #065f46; font-family: monospace; }
  .bar-mini { display: block; height: 3px; background: #10b981; border-radius: 2px; margin-top: 2px; opacity: 0.55; }
  .chart-tbl { width: 100%; border-collapse: separate; border-spacing: 8px; margin-bottom: 8px; }
  .chart-box { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 7px; vertical-align: top; }
  .pizza-segs { display: block; width: 100%; height: 14px; border-radius: 6px; overflow: hidden; margin: 6px 0 4px; font-size: 0; line-height: 0; }
  .pizza-seg { display: inline-block; height: 14px; vertical-align: top; }
  .pizza-leg { width: 100%; border-collapse: collapse; font-size: 6.5px; margin-top: 4px; }
  .pizza-leg td { padding: 2px 4px 2px 0; vertical-align: middle; }
  .pizza-dot { display: inline-block; width: 8px; height: 8px; border-radius: 2px; }
  .bar-row { display: table; width: 100%; table-layout: fixed; margin-bottom: 3px; }
  .bar-lbl { display: table-cell; width: 52px; font-size: 7px; font-weight: 700; color: #1e293b; vertical-align: middle; padding-right: 4px; }
  .bar-track { display: table-cell; vertical-align: middle; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; }
  .bar-fill { display: block; height: 8px; background: #10b981; border-radius: 4px; }
  .bar-val { display: table-cell; width: 62px; font-size: 7px; font-weight: 700; color: #065f46; text-align: right; vertical-align: middle; padding-left: 4px; white-space: nowrap; font-family: monospace; }
  .bar-detail { font-size: 6px; color: #94a3b8; margin: 0 0 5px 56px; }
  .bar-pct { font-size: 6px; color: #64748b; font-weight: 400; }
  .kpi-grid { width: 100%; border-collapse: separate; border-spacing: 5px; }
  .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 6px; vertical-align: top; }
  .kpi-lbl { font-size: 6px; color: #64748b; }
  .kpi-val { font-size: 9px; font-weight: 800; color: #0f172a; }
  .banner.op { background: linear-gradient(135deg,#eff6ff,#eef2ff); border-color:#c7d2fe; color:#4338ca; }
  .hero-op .val { color: #a5b4fc; }
  .insight-box { border-radius: 8px; padding: 7px; margin-bottom: 8px; border: 1px solid #e2e8f0; }
  .insight-item { padding: 4px 6px; margin-bottom: 4px; border-radius: 5px; font-size: 7px; line-height: 1.4; }
  .insight-item:last-child { margin-bottom: 0; }
  .insight-critico { background: #fef2f2; border-left: 3px solid #ef4444; color: #991b1b; }
  .insight-atencao { background: #fffbeb; border-left: 3px solid #f59e0b; color: #92400e; }
  .insight-info { background: #f0fdf4; border-left: 3px solid #22c55e; color: #166534; }
  .insight-tit { font-weight: 800; font-size: 7px; margin-bottom: 1px; }
  .ref-tbl { width: 100%; border-collapse: collapse; font-size: 7px; margin-bottom: 8px; }
  .ref-tbl th { padding: 4px 6px; background: #eef2ff; color: #4338ca; text-align: left; font-size: 6px; text-transform: uppercase; }
  .ref-tbl td { padding: 4px 6px; border-bottom: 1px solid #f1f5f9; }
  .ref-tbl .dest { font-weight: 800; color: #1e293b; font-family: monospace; }
  .st-bom { color: #166534; font-weight: 700; background: #dcfce7; padding: 1px 4px; border-radius: 3px; font-size: 6px; }
  .st-medio { color: #92400e; font-weight: 700; background: #fef3c7; padding: 1px 4px; border-radius: 3px; font-size: 6px; }
  .st-ruim { color: #991b1b; font-weight: 700; background: #fee2e2; padding: 1px 4px; border-radius: 3px; font-size: 6px; }
  .bar-fill.bom { background: #22c55e; }
  .bar-fill.medio { background: #f59e0b; }
  .bar-fill.ruim { background: #ef4444; }
  .vg-item { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 6px; margin-bottom: 4px; }
  .vg-hd-tbl { width: 100%; border-collapse: collapse; margin-bottom: 3px; }
  .vg-hd-tbl td { font-size: 7px; color: #0f172a; vertical-align: middle; padding: 0; }
  .vg-hora { display: inline-block; font-size: 7px; font-weight: 800; color: #0f766e; background: #ccfbf1; padding: 1px 6px; border-radius: 4px; font-family: monospace; margin-right: 4px; }
  .vg-pill { display: inline-block; font-size: 6.5px; font-weight: 800; padding: 1px 5px; border-radius: 4px; }
  .vg-pill.ok { color: #065f46; background: #d1fae5; }
  .vg-pill.no { color: #9a3412; background: #ffedd5; }
  .bar-val.op { color: #1d4ed8; }
  table.data th.op-h { background: #4338ca; color: #c7d2fe; }
  .layout2-tbl { width: 100%; border-collapse: separate; border-spacing: 8px; margin-bottom: 4px; }
  .layout2-tbl > tbody > tr > td { width: 50%; vertical-align: top; }
  .estudo-nota { font-size: 6.5px; color: #64748b; margin: 0 0 6px; line-height: 1.4; }
  .destaques-tbl { width: 100%; border-collapse: separate; border-spacing: 5px; margin-bottom: 6px; }
  .destaque { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 6px; vertical-align: top; width: 20%; }
  .dest-tit { font-size: 5.5px; font-weight: 700; color: #64748b; text-transform: uppercase; }
  .dest-val { font-size: 8px; font-weight: 800; color: #0f172a; margin-top: 2px; font-family: monospace; white-space: nowrap; }
  .dest-sub { font-size: 6px; color: #94a3b8; margin-top: 1px; }
  .gargalo-rota { font-weight: 800; color: #334155; }
  .gargalo-placa { font-weight: 800; color: #1e3a5f; font-family: monospace; }
  .celula-cenario-perda, .celula-resultado-perda { color: #991b1b !important; }
  .celula-cenario-ganho, .celula-resultado-ganho { color: #166534 !important; }
  .diag-box { border-radius: 8px; border: 1px solid #e2e8f0; padding: 8px 10px; margin-bottom: 8px; }
  .diag-ok { background: #f0fdf4; border-color: #bbf7d0; }
  .diag-atencao { background: #fffbeb; border-color: #fde68a; }
  .diag-critico { background: #fef2f2; border-color: #fecaca; }
  .diag-veredito { font-size: 11px; font-weight: 800; letter-spacing: 0.02em; margin-bottom: 3px; }
  .diag-ok .diag-veredito { color: #166534; }
  .diag-atencao .diag-veredito { color: #92400e; }
  .diag-critico .diag-veredito { color: #991b1b; }
  .diag-resumo { font-size: 7.5px; color: #475569; margin: 0 0 7px; line-height: 1.35; }
  .diag-lista { margin: 0; padding: 0 0 0 14px; }
  .diag-lista li { font-size: 7.5px; color: #1e293b; margin-bottom: 3px; line-height: 1.35; }
  .diag-lista li strong { color: #0f172a; }
  .diag-vazio { font-size: 7.5px; color: #166534; font-weight: 700; margin: 0; }
  .vg-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 7px 8px; margin-bottom: 6px; background: #fff; }
  .vg-card.g { border-color: #fecaca; background: #fef2f2; }
  .vg-card-hd { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  .vg-card-hd td { vertical-align: middle; padding: 0; }
  .vg-tipo { font-size: 9px; font-weight: 800; color: #0f172a; }
  .vg-chips { font-size: 6px; color: #64748b; margin-top: 1px; }
  .vg-chip { display: inline-block; background: #f1f5f9; border-radius: 3px; padding: 1px 4px; margin-right: 3px; font-weight: 700; color: #334155; }
  .vg-status { text-align: right; white-space: nowrap; }
  .vg-row { width: 100%; border-collapse: collapse; margin-top: 3px; }
  .vg-row td { padding: 1px 0; vertical-align: middle; font-size: 6px; }
  .vg-row .lbl { width: 52px; color: #64748b; font-weight: 700; }
  .vg-row .track { background: #f1f5f9; border-radius: 4px; height: 9px; overflow: hidden; }
  .vg-row .fill { display: block; height: 9px; border-radius: 4px; min-width: 2px; }
  .vg-row .val { width: 58px; text-align: right; font-weight: 800; font-family: monospace; color: #0f172a; padding-left: 4px; }
  .vg-legenda { font-size: 6px; color: #64748b; margin: 0 0 6px; }
  .vg-dot { display: inline-block; width: 7px; height: 7px; border-radius: 2px; margin-right: 3px; vertical-align: -1px; }
  .footer { text-align: center; font-size: 6px; color: #94a3b8; margin-top: 10px; padding-top: 8px; border-top: 1px solid #e2e8f0; }

  /* Paginação: nenhum bloco de dados pode ser cortado ao meio pela quebra de página */
  .bloco, .chart-box, .diag-box, .insight-box, .destaque, .card, .kpi-card,
  .vg-item, .vg-card, .hero-dark, .banner, .tarifas {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  /* Título/cabeçalho nunca fica sozinho no pé da página */
  .sec, .bloco-hd, .bloco-hd-tbl, .estudo-nota, .vg-legenda, .diag-veredito {
    break-after: avoid;
    page-break-after: avoid;
  }
  /* Barra e sua legenda de valores andam juntas */
  .bar-row { break-inside: avoid; page-break-inside: avoid; break-after: avoid; page-break-after: avoid; }
  .bar-detail { break-before: avoid; page-break-before: avoid; break-inside: avoid; page-break-inside: avoid; }
  /* Linha de tabela inteira, com cabeçalho repetido nas páginas seguintes */
  table.data tr, .ref-tbl tr, .pizza-leg tr { break-inside: avoid; page-break-inside: avoid; }
  table.data thead, .ref-tbl thead { display: table-header-group; }
  table.data tbody, .ref-tbl tbody { break-before: avoid; page-break-before: avoid; }

  @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } body { padding: 10px; } }
`;

function cardsHtml(items: { label: string; valor: string; cor: string }[]) {
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += 4) {
    const chunk = items.slice(i, i + 4);
    const cells = chunk.map((c) => `
      <td class="card" style="border-top-color:${c.cor};width:25%">
        <div class="card-lbl">${esc(c.label)}</div>
        <div class="card-val">${c.valor}</div>
      </td>`).join('');
    const fill = chunk.length < 4
      ? Array.from({ length: 4 - chunk.length }, () => '<td style="width:25%"></td>').join('')
      : '';
    rows.push(`<tr>${cells}${fill}</tr>`);
  }
  return `<table class="cards-tbl">${rows.join('')}</table>`;
}

function heroReceitaHtml(rec: ReceitaDiaAnalise['resumo'], registros: number) {
  return `
  <table class="tbl-layout">
    <tr>
      <td style="width:58%;padding-right:10px">
        <div class="hero-dark">
          <div class="lbl">Faturamento estimado do dia</div>
          <div class="val">${fmtMoeda(rec.faturamento)}</div>
          <div class="sub">${registros} registro(s) · PESO TOTAL × tarifa por tipo de caminhão</div>
        </div>
      </td>
      <td style="width:42%">
        <div class="hero-dark" style="padding:8px">
          <table class="mini-tbl">
            <tr>
              <td class="mini-dark"><div class="lbl">R$/ton</div><div class="val">${fmtMoeda(rec.receitaTon)}</div></td>
              <td class="mini-dark"><div class="lbl">R$/km</div><div class="val">${fmtMoeda(rec.receitaKm)}</div></td>
            </tr>
            <tr>
              <td class="mini-dark"><div class="lbl">R$/h</div><div class="val">${fmtMoeda(rec.receitaHora)}</div></td>
              <td class="mini-dark"><div class="lbl">R$/viagem</div><div class="val">${fmtMoeda(rec.receitaViagem)}</div></td>
            </tr>
          </table>
        </div>
      </td>
    </tr>
  </table>`;
}

function barraHorizontalHtml(label: string, valor: number, maxVal: number, cor = '#10b981', formato: (v: number) => string = fmtMoeda): string {
  const pct = Math.max(4, Math.round((valor / maxVal) * 100));
  const lbl = label.length > 10 ? label.slice(0, 10) + '…' : label;
  return `
    <div class="bar-row">
      <div class="bar-lbl">${esc(lbl)}</div>
      <div class="bar-track"><span class="bar-fill" style="width:${pct}%;background:${cor}"></span></div>
      <div class="bar-val">${formato(valor)}</div>
    </div>`;
}

export interface ViagemPesoRotaPdf {
  data?: string | null;
  rota: string;
  placa: string;
  motorista: string;
  tipo: string | null;
  nViagem: number;
  pesoKg: number;
  pesoIdealKg: number | null;
  pctIdeal: number | null;
  encheu: boolean;
  semPesagem?: boolean;
  horasProdutivasViagem: number;
  horasProdutivasRota: number;
  horasTotaisRota?: number;
  kmTotalRota?: number;
  kmViagem?: number;
  origemHora: 'trecho' | 'rateio';
  tempoEqEncher: number | null;
  estimado: boolean;
}

export interface TopRotaProdutivaPdf {
  rota: string;
  viagens: number;
  horasTotais: number;
  horasProdutivas: number;
  horasImprodutivas: number;
  horasPorViagem: number;
  kmTotal: number;
  tipoPredominante?: string | null;
  pesoKg?: number;
  pesoMedioKg?: number;
  pesoIdealKg?: number | null;
  pctIdeal?: number | null;
  tempoEqEncher?: number | null;
  atingiuIdeal?: boolean;
  estimado?: boolean;
  tonPorHora?: number;
  faixa?: 'bom' | 'regular' | 'ruim' | null;
}

export interface ResumoMapeamentoPdf {
  rotas: number;
  motoristas: number;
  placas: number;
  viagens: number;
  kmTotal: number;
  horasTotais: number;
  horasProdutivas: number;
  horasImprodutivas: number;
  percentualProdutivo: number;
  horasDeslocamentoInicial?: number;
  horasEntreRotas?: number;
  horasRetornoFinal?: number;
  horasImprodutivasNaoDetalhadas?: number;
  kmProdutivo?: number;
  kmImprodutivo?: number;
  kmDeslocamentoInicial?: number;
  kmEntreRotas?: number;
  kmRetornoFinal?: number;
  registrosComTrecho?: number;
  registros?: number;
}

export interface TrechosDimensaoPdf {
  chave: string;
  viagens: number;
  horasImprodutivas: number;
  horasDeslocamentoInicial: number;
  horasEntreRotas: number;
  horasRetornoFinal: number;
  horasImprodutivasNaoDetalhadas: number;
  kmImprodutivo: number;
  percentualProdutivo: number;
  horasImprodutivasPorViagem: number | null;
}

export interface LinhaMapeamentoPdf {
  rota: string;
  motorista: string;
  placa: string;
  tipoCaminhao?: string | null;
  viagens: number;
  kmTotal: number;
  horasTotais: number;
  horasProdutivas: number;
  horasImprodutivas: number;
  horasProdutivasPorViagem: number;
  percentualProdutivo: number;
}

function viagemTemPesagemPdf(v: ViagemPesoRotaPdf): boolean {
  return !v.semPesagem && Number(v.pesoKg) > 0;
}

function corBarraViagemPesoPdf(v: ViagemPesoRotaPdf): string {
  if (!viagemTemPesagemPdf(v)) return '#94a3b8';
  const st = statusPorPctIdeal(v.pctIdeal);
  if (st) return COR_STATUS_RANKING[st];
  if (v.encheu) return '#0f766e';
  if ((v.pctIdeal ?? 0) >= 80) return '#d97706';
  return '#dc2626';
}

function badgeStatusViagemHtml(pct: number | null): string {
  const st = statusPorPctIdeal(pct);
  if (!st) return '';
  const cls = st === 'pessimo' ? 'st-ruim' : st === 'ruim' ? 'st-medio' : 'st-bom';
  return `<span class="${cls}">${LABEL_STATUS_RANKING[st]}</span>`;
}

function agruparViagensPesoPdf(itens: ViagemPesoRotaPdf[]) {
  const mapa = new Map<string, {
    rota: string; placa: string; motorista: string; tipo: string | null;
    origemHora: 'trecho' | 'rateio'; viagens: ViagemPesoRotaPdf[];
  }>();
  for (const it of itens) {
    const chave = `${it.data || ''}\0${it.rota}\0${it.placa}\0${it.motorista}`;
    let g = mapa.get(chave);
    if (!g) {
      g = {
        rota: it.rota, placa: it.placa, motorista: it.motorista, tipo: it.tipo,
        origemHora: it.origemHora, viagens: [],
      };
      mapa.set(chave, g);
    }
    g.viagens.push(it);
  }
  return Array.from(mapa.values()).map((g) => {
    g.viagens.sort((a, b) => a.nViagem - b.nViagem);
    const horas = g.viagens.reduce((s, v) => s + (v.horasProdutivasViagem || 0), 0);
    const horasTotaisRota = Math.max(...g.viagens.map((v) => v.horasTotaisRota || 0), 0);
    const kmLinha = Math.max(...g.viagens.map((v) => v.kmTotalRota || 0), 0);
    const kmSlots = g.viagens.reduce((s, v) => s + (v.kmViagem || 0), 0);
    return {
      ...g,
      horasProdutivasRota: Math.round(horas * 100) / 100,
      horasTotaisRota: Math.round(horasTotaisRota * 100) / 100,
      kmTotalRota: Math.round((kmLinha > 0 ? kmLinha : kmSlots) * 100) / 100,
    };
  }).sort((a, b) => a.rota.localeCompare(b.rota, 'pt-BR') || a.placa.localeCompare(b.placa, 'pt-BR'));
}

function blocoViagensPesoRotaHtml(itens?: ViagemPesoRotaPdf[] | null): string {
  if (!itens?.length) return '';
  const gruposAll = agruparViagensPesoPdf(itens);
  const pesadas = itens.filter(viagemTemPesagemPdf);
  const nSemPeso = itens.length - pesadas.length;
  const nEncheu = pesadas.filter((v) => v.encheu).length;
  const nFaltou = pesadas.length - nEncheu;
  const nP = pesadas.filter((v) => statusPorPctIdeal(v.pctIdeal) === 'pessimo').length;
  const nR = pesadas.filter((v) => statusPorPctIdeal(v.pctIdeal) === 'ruim').length;
  const nO = pesadas.filter((v) => statusPorPctIdeal(v.pctIdeal) === 'otimo').length;

  const ordemSt: Record<StatusRankingViagem, number> = { pessimo: 0, ruim: 1, otimo: 2 };
  const piores = [...itens]
    .map((v) => ({
      v,
      st: statusPorPctIdeal(v.pctIdeal),
      desvio: Math.abs((v.pctIdeal ?? 100) - 100),
    }))
    .filter((x): x is typeof x & { st: StatusRankingViagem } => x.st != null)
    .sort((a, b) => (ordemSt[a.st] - ordemSt[b.st]) || b.desvio - a.desvio)
    .slice(0, 5);

  const pioresHtml = piores.length ? `
  <div class="bloco" style="margin-bottom:6px">
    <div class="bloco-hd">Piores do dia — maior desvio do peso ideal</div>
    ${piores.map(({ v, st }, i) => `
      <div class="bar-row">
        <div class="bar-lbl">${i + 1}. ${esc(v.placa)}
          <div>${badgeStatusViagemHtml(v.pctIdeal)}</div>
        </div>
        <div class="bar-track" style="height:8px">
          <span class="bar-fill" style="width:${Math.min(100, Math.max(4, Math.round(v.pctIdeal ?? 0)))}%;background:${COR_STATUS_RANKING[st]};height:8px"></span>
        </div>
        <div class="bar-val">${v.pctIdeal != null ? `${fmtNum(v.pctIdeal, 0)}%` : '—'}</div>
      </div>
      <div class="bar-detail">${esc(v.rota)} · ${fmtNum(v.pesoKg, 0)} kg
        ${v.pesoIdealKg != null ? ` / ${fmtNum(v.pesoIdealKg, 0)} kg ideal` : ''}
        · ${fmtNum(v.horasProdutivasViagem, 1)} h
      </div>`).join('')}
  </div>` : '';

  const blocos = gruposAll.map((g) => {
    const tipo = g.tipo ? ` · ${esc(g.tipo)}` : '';
    const mix = g.viagens.map((v) => statusPorPctIdeal(v.pctIdeal)).filter(Boolean);
    const nPg = mix.filter((s) => s === 'pessimo').length;
    const nRg = mix.filter((s) => s === 'ruim').length;
    const nOg = mix.filter((s) => s === 'otimo').length;
    const mixTxt = [
      nPg ? `Péssimo ${nPg}` : '',
      nRg ? `Ruim ${nRg}` : '',
      nOg ? `Ótimo ${nOg}` : '',
    ].filter(Boolean).join(' · ');
    const rows = g.viagens.map((v) => {
      const pct = v.pctIdeal != null ? Math.min(100, Math.max(4, Math.round(v.pctIdeal))) : 4;
      const cor = corBarraViagemPesoPdf(v);
      const semPeso = !viagemTemPesagemPdf(v);
      const pill = semPeso
        ? '<span class="vg-pill">Sem pesagem</span>'
        : (v.pesoIdealKg
          ? (v.encheu
            ? '<span class="vg-pill ok">Já encheu</span>'
            : '<span class="vg-pill no">Não encheu</span>')
          : '');
      const pesoIdealTxt = !semPeso && v.pesoIdealKg != null ? ` / ${fmtNum(v.pesoIdealKg, 0)} kg ideal` : '';
      const falta = !semPeso && !v.encheu && v.pesoIdealKg != null
        ? ` · falta ${fmtNum(Math.max(0, v.pesoIdealKg - v.pesoKg), 0)} kg`
        : '';
      const estim = !semPeso && v.tempoEqEncher != null
        ? ` · estimativa para encher: <strong>${fmtNum(v.tempoEqEncher, 2)} h</strong>`
        : '';
      const pesoTxt = semPeso
        ? 'Sem pesagem — hora desta viagem (trecho), não da rota completa'
        : `${fmtNum(v.pesoKg, 0)} kg${pesoIdealTxt}${falta}${estim}`;
      return `
      <div class="vg-item">
        <table class="vg-hd-tbl"><tr>
          <td><strong>Viagem ${v.nViagem}</strong> ${semPeso ? '' : badgeStatusViagemHtml(v.pctIdeal)}</td>
          <td class="r"><span class="vg-hora">${fmtNum(v.horasProdutivasViagem, 1)} h produtivas</span>${(v.kmViagem || 0) > 0 ? `<span class="vg-hora" style="background:#e0e7ff;color:#3730a3">${fmtNum(v.kmViagem || 0, 0)} km</span>` : ''}${pill}</td>
        </tr></table>
        <div class="bar-row">
          <div class="bar-track" style="height:10px"><span class="bar-fill" style="width:${pct}%;background:${cor};height:10px"></span></div>
          <div class="bar-val">${v.pctIdeal != null ? `${fmtNum(v.pctIdeal, 0)}%` : '—'}</div>
        </div>
        <div class="bar-detail" style="margin-left:0">
          ${pesoTxt}
        </div>
      </div>`;
    }).join('');
    return `
    <div class="bloco" style="margin-bottom:6px">
      <div class="bloco-hd">${esc(g.rota)} · ${esc(g.placa)}${tipo}
        ${g.kmTotalRota > 0 ? ` · ${fmtNum(g.kmTotalRota, 0)} km` : ''}
        ${g.horasTotaisRota > 0 ? ` · ${fmtNum(g.horasTotaisRota, 1)} h totais` : ''}
        · ${fmtNum(g.horasProdutivasRota, 1)} h produtivas
        · ${g.viagens.length} viagem(ns)${mixTxt ? ` · ${mixTxt}` : ''}
      </div>
      ${rows}
    </div>`;
  }).join('');

  return `
  <div class="sec">Viagens do dia — qualidade, peso e hora produtiva</div>
  <p style="font-size:6.5px;color:#64748b;margin:0 0 5px">
    Uma linha = uma viagem da rota. Hora produtiva = HORA SAÍDA ROTA − HORA CHEGADA ROTA
    daquela viagem — não a jornada da rota inteira.
    Qualidade só nas viagens com PESO 1–4 (${esc(textoEscalaIdealCurto())}).
    “Sem pesagem” só entra se o trecho (horário) existe e o peso falta.
    ${fmtNum(gruposAll.length, 0)} rota(s) · ${fmtNum(itens.length, 0)} viagem(ns)${nSemPeso ? ` · ${fmtNum(nSemPeso, 0)} sem pesagem` : ''}.
  </p>
  ${cardsHtml([
    { label: 'Péssimo', valor: fmtNum(nP, 0), cor: '#b91c1c' },
    { label: 'Ruim', valor: fmtNum(nR, 0), cor: '#ea580c' },
    { label: 'Ótimo', valor: fmtNum(nO, 0), cor: '#16a34a' },
    { label: 'Já encheu', valor: fmtNum(nEncheu, 0), cor: '#0f766e' },
    { label: 'Não encheu', valor: fmtNum(nFaltou, 0), cor: '#c2410c' },
  ])}
  ${pioresHtml}
  ${blocos}`;
}

/** Top 10 rotas + tabela de mapeamento km/tempo (mesmo critério do painel operacional). */
function blocoMapeamentoTempoKmHtml(opts: {
  viagensPesoRota?: ViagemPesoRotaPdf[] | null;
  resumo?: ResumoMapeamentoPdf | null;
  linhas?: LinhaMapeamentoPdf[] | null;
}): string {
  const linhas = opts.linhas || [];
  const resumo = opts.resumo;
  if (!linhas.length && !resumo) return '';
  const chips = resumo ? `
  <table class="mini-tbl" style="margin-bottom:6px">
    <tr>
      <td class="kpi-card"><div class="kpi-lbl">Rotas</div><div class="kpi-val">${fmtNum(resumo.rotas, 0)}</div></td>
      <td class="kpi-card"><div class="kpi-lbl">Motoristas</div><div class="kpi-val">${fmtNum(resumo.motoristas, 0)}</div></td>
      <td class="kpi-card"><div class="kpi-lbl">Placas</div><div class="kpi-val">${fmtNum(resumo.placas, 0)}</div></td>
      <td class="kpi-card"><div class="kpi-lbl">KM</div><div class="kpi-val">${fmtNum(resumo.kmTotal, 0)}</div></td>
      <td class="kpi-card"><div class="kpi-lbl">Totais</div><div class="kpi-val">${fmtNum(resumo.horasTotais, 1)} h</div></td>
      <td class="kpi-card"><div class="kpi-lbl">Produtivas</div><div class="kpi-val" style="color:#0f766e">${fmtNum(resumo.horasProdutivas, 1)} h</div></td>
      <td class="kpi-card"><div class="kpi-lbl">Improdutivas</div><div class="kpi-val" style="color:#c2410c">${fmtNum(resumo.horasImprodutivas, 1)} h</div></td>
      <td class="kpi-card"><div class="kpi-lbl">% Prod</div><div class="kpi-val">${fmtNum(resumo.percentualProdutivo, 0)}%</div></td>
    </tr>
  </table>` : '';

  const linhasMap = linhas.map((l) => `
    <tr>
      <td>${esc(l.rota)}</td>
      <td>${esc(l.motorista)}</td>
      <td>${esc(l.placa)}</td>
      <td class="r">${fmtNum(l.viagens, 0)}</td>
      <td class="r">${fmtNum(l.kmTotal, 0)}</td>
      <td class="r">${fmtNum(l.horasTotais, 1)}</td>
      <td class="r" style="color:#0f766e;font-weight:700">${fmtNum(l.horasProdutivas, 1)}</td>
      <td class="r" style="color:#c2410c;font-weight:700">${fmtNum(l.horasImprodutivas, 1)}</td>
      <td class="r">${fmtNum(l.horasProdutivasPorViagem, 2)}</td>
      <td class="r">${fmtNum(l.percentualProdutivo, 0)}%</td>
    </tr>`).join('');

  const tabelaMap = linhas.length ? `
  <div class="sec">Mapeamento do dia — rota × motorista × placa</div>
  <table class="data">
    <thead>
      <tr>
        <th>Rota</th>
        <th>Motorista</th>
        <th>Placa</th>
        <th class="r">Viagens</th>
        <th class="r">KM</th>
        <th class="r">Totais</th>
        <th class="r">Produtivas</th>
        <th class="r">Improdutivas</th>
        <th class="r">h prod/viagem</th>
        <th class="r">% Prod</th>
      </tr>
    </thead>
    <tbody>${linhasMap}</tbody>
  </table>` : '';

  return `
  <div class="sec">Mapeamento operacional — tempo e KM</div>
  ${chips}
  ${tabelaMap}`;
}

/**
 * Régua temporal: o dia contra o mesmo dia da semana no ciclo, a mediana do
 * ciclo e o dia equivalente do ciclo anterior.
 */
function blocoReguaTemporalHtml(baseline?: BaselineDia | null): string {
  if (!baseline) return '';
  const metricas = baseline.metricas.filter((m) => m.valor != null);
  if (!metricas.length) return '';

  const nomeDiaSemana = baseline.rotuloOcorrencia.split(' ')[1] || 'dia igual';

  const celula = (c: ComparativoBaseline, casas: number) => {
    if (c.referencia == null) return '<td class="r" style="color:#cbd5e1">—</td>';
    const cor = c.melhor == null ? '#64748b' : c.melhor ? '#0f766e' : '#b91c1c';
    const sinal = (c.delta ?? 0) > 0 ? '+' : '';
    const variacao = c.pct != null ? `${fmtNum(c.pct, 0)}%` : fmtNum(c.delta ?? 0, casas);
    return `<td class="r">${fmtNum(c.referencia, casas)}
      <strong style="color:${cor}">${sinal}${variacao}</strong></td>`;
  };

  const cards = metricas.slice(0, 6).map((m) => {
    const ref = referenciaPrincipalBaseline(m);
    const cor = ref?.comparativo.melhor == null
      ? '#64748b'
      : ref.comparativo.melhor ? '#0f766e' : '#b91c1c';
    const variacao = ref?.comparativo.pct != null
      ? `${(ref.comparativo.delta ?? 0) > 0 ? '+' : '−'}${fmtNum(Math.abs(ref.comparativo.pct), 0)}% vs normal`
      : 'sem referência';
    return `
    <td class="kpi-card" style="border-top:3px solid ${cor}">
      <div class="kpi-lbl">${esc(m.label)}</div>
      <div class="kpi-val">${fmtNum(m.valor as number, m.casas)}${esc(m.sufixo)}</div>
      <div style="font-size:7px;color:${cor};margin-top:1px;font-weight:700">${esc(variacao)}</div>
    </td>`;
  }).join('');

  const contexto = baseline.diasMesmoDiaSemana > 0
    ? `${baseline.diasMesmoDiaSemana} outro(s) ${nomeDiaSemana} no ciclo entraram na mediana.`
    : 'Sem outro dia igual no ciclo: a régua usa a mediana do ciclo.';

  return `
  <div class="sec">O dia comparado com o padrão do ciclo — ${esc(baseline.rotuloOcorrencia)} do ciclo</div>
  <div style="font-size:8px;color:#64748b;margin-bottom:5px;line-height:1.45">
    Referência = mediana dos outros dias, para que um dia atípico não distorça a régua.
    ${esc(contexto)}
  </div>
  <div class="banner" style="background:#f0fdfa;border-color:#99f6e4;color:#0f766e">
    ${esc(baseline.leitura)}
  </div>
  <table class="mini-tbl" style="margin-bottom:6px"><tr>${cards}</tr></table>
  <table class="data">
    <thead>
      <tr>
        <th>Indicador</th>
        <th class="r">No dia</th>
        <th class="r">Mediana ${esc(nomeDiaSemana)}</th>
        <th class="r">Mediana do ciclo</th>
        <th class="r">Ciclo anterior</th>
      </tr>
    </thead>
    <tbody>
      ${metricas.map((m) => `
      <tr>
        <td>${esc(m.label)}</td>
        <td class="r" style="font-weight:700">${fmtNum(m.valor as number, m.casas)}</td>
        ${celula(m.mesmoDiaSemana, m.casas)}
        ${celula(m.medianaCiclo, m.casas)}
        ${celula(m.cicloAnterior, m.casas)}
      </tr>`).join('')}
    </tbody>
  </table>
  <div style="font-size:7px;color:#94a3b8;margin-bottom:6px;line-height:1.45">
    Cada coluna traz a referência e a variação do dia sobre ela. Verde = melhor;
    vermelho = pior. Em KM e KM por viagem, subir conta como pior.${
    baseline.temCicloAnterior
      ? ' Ciclo anterior = dia equivalente (mesma ocorrência do dia da semana).'
      : ' Sem dia equivalente no ciclo anterior.'
  }
  </div>`;
}

/**
 * Onde a hora improdutiva foi gasta: deslocamento inicial, entre rotas
 * (descarga/aterro) e retorno à base, com ranking por placa e por rota.
 */
function blocoTrechosImprodutivosHtml(opts: {
  resumo?: ResumoMapeamentoPdf | null;
  porPlaca?: TrechosDimensaoPdf[] | null;
  porRota?: TrechosDimensaoPdf[] | null;
}): string {
  const resumo = opts.resumo;
  const fatias = montarDistribuicaoImprodutiva(resumo);
  if (!resumo || !fatias.length) return '';

  const leitura = montarLeituraTrechos(resumo);
  const totalImprod = resumo.horasImprodutivas || 0;

  const barra = `
  <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:6px">
    <tr>
      ${fatias.map((f) => `
        <td style="width:${Math.max(f.pct, 2)}%;background:${f.cor};height:16px;
                   color:#fff;font-size:7.5px;font-weight:800;text-align:center;
                   border:0;padding:0">
          ${f.pct >= 12 ? `${fmtNum(f.pct, 0)}%` : ''}
        </td>`).join('')}
    </tr>
  </table>`;

  const cards = `
  <table class="mini-tbl" style="margin-bottom:6px">
    <tr>
      ${fatias.map((f) => `
        <td class="kpi-card" style="border-top:3px solid ${f.cor}">
          <div class="kpi-lbl">${esc(f.label)}</div>
          <div class="kpi-val" style="color:${f.cor}">${fmtNum(f.horas, 1)} h</div>
          <div style="font-size:7px;color:#64748b;margin-top:1px">
            ${fmtNum(f.pct, 0)}% do improdutivo${f.km > 0 ? ` · ${fmtNum(f.km, 0)} km` : ''}
          </div>
        </td>`).join('')}
    </tr>
  </table>`;

  const kmProdutivo = resumo.kmProdutivo || 0;
  const kmImprodutivo = resumo.kmImprodutivo || 0;
  const linhaKm = kmProdutivo + kmImprodutivo > 0 ? `
  <div style="font-size:8px;color:#334155;margin-bottom:6px">
    KM dentro das rotas: <strong style="color:#0f766e">${fmtNum(kmProdutivo, 0)} km</strong>
    · KM fora das rotas: <strong style="color:#c2410c">${fmtNum(kmImprodutivo, 0)} km</strong>${
    leitura.pctKmImprodutivo != null ? ` (${fmtNum(leitura.pctKmImprodutivo, 0)}%)` : ''
  }
  </div>` : '';

  const leituraHtml = leitura.texto ? `
  <div class="banner" style="background:#fff7ed;border-color:#fed7aa;color:#9a3412">
    ${esc(leitura.texto)}
  </div>` : '';

  const tabelaRanking = (titulo: string, itens: TrechosDimensaoPdf[] | null | undefined, rotulo: string) => {
    const lista = (itens || []).filter((i) => i.horasImprodutivas > 0).slice(0, 8);
    if (!lista.length) return '';
    return `
    <div class="sec">${esc(titulo)}</div>
    <table class="data">
      <thead>
        <tr>
          <th>${esc(rotulo)}</th>
          <th class="r">Improdutivas</th>
          <th class="r">Inicial</th>
          <th class="r">Entre rotas</th>
          <th class="r">Retorno</th>
          <th class="r">h/viagem</th>
          <th class="r">KM fora</th>
          <th class="r">% Prod</th>
        </tr>
      </thead>
      <tbody>
        ${lista.map((i) => `
        <tr>
          <td>${esc(i.chave)}</td>
          <td class="r" style="color:#c2410c;font-weight:700">${fmtNum(i.horasImprodutivas, 1)}</td>
          <td class="r">${fmtNum(i.horasDeslocamentoInicial, 1)}</td>
          <td class="r">${fmtNum(i.horasEntreRotas, 1)}</td>
          <td class="r">${fmtNum(i.horasRetornoFinal, 1)}</td>
          <td class="r">${i.horasImprodutivasPorViagem != null ? fmtNum(i.horasImprodutivasPorViagem, 2) : '—'}</td>
          <td class="r">${fmtNum(i.kmImprodutivo, 0)}</td>
          <td class="r">${fmtNum(i.percentualProdutivo, 0)}%</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  };

  const cobertura = leitura.coberturaPct != null && leitura.coberturaPct < 100
    ? ` Horários suficientes em ${leitura.coberturaPct}% dos registros.`
    : '';

  return `
  <div class="sec">Onde a hora improdutiva foi gasta — ${fmtNum(totalImprod, 1)} h fora da rota</div>
  <div style="font-size:8px;color:#64748b;margin-bottom:5px;line-height:1.45">
    Tempo fora da rota separado por trecho, a partir dos horários de base e de cada
    rota na planilha.${cobertura}
  </div>
  ${leituraHtml}
  ${barra}
  ${cards}
  ${linhaKm}
  ${tabelaRanking('Improdutividade por placa', opts.porPlaca, 'Placa')}
  ${tabelaRanking('Improdutividade por rota', opts.porRota, 'Rota')}`;
}

type LinhaTipoEstudo = {
  tipo: TipoLimiteCaminhao;
  label: string;
  viagens: number;
  toneladas: number;
  tonMediaViagem: number;
  kmMedioViagem: number;
  realizadoKg: number;
  idealKg: number;
  maxKg: number;
  pctIdeal: number | null;
  gargalo: boolean;
};

type ItemGargalo = {
  severidade: 'critico' | 'atencao';
  origem: 'tipo' | 'rota' | 'placa';
  texto: string;
};

function montarLinhasTipoEstudo(
  operacao: OperacaoDiaAnalise,
  estudo: EstudoRotasDia | null | undefined,
  limOpts: OptsAnaliseContratoDia,
): LinhaTipoEstudo[] {
  const ideais = resolverPesosIdeaisKg(limOpts.volumeL, densidadeOptsToInput(limOpts));
  const limites = resolverLimitesPesoKg(limOpts.limitesPesoKg);
  const mediaEstudo = new Map(
    (estudo?.mediaPorTipo || []).map((t) => [t.tipo, t] as const),
  );

  return TIPOS_LIMITE_CAMINHAO.map((tipo) => {
    const g = operacao.porTipoCaminhao.find((x) => normalizarTipoCaminhaoPeso(x.chave) === tipo);
    const m = mediaEstudo.get(tipo);
    if ((!g || g.viagens <= 0) && (!m || m.viagens <= 0)) return null;

    const viagens = m?.viagens || g!.viagens;
    const toneladas = m?.toneladas ?? g!.toneladas;
    const tonMediaViagem = m?.tonMediaViagem ?? g!.tonMediaViagem;
    const kmMedioViagem = m?.kmMedioViagem ?? g!.kmMedioViagem;
    const realizadoKg = m?.mediaPesoKg != null && m.mediaPesoKg > 0
      ? Math.round(m.mediaPesoKg)
      : Math.round(tonMediaViagem * 1000);
    const idealKg = ideais[tipo];
    const pctIdeal = idealKg > 0 ? Math.round((realizadoKg / idealKg) * 1000) / 10 : null;

    return {
      tipo,
      label: LABEL_TIPO_CAMINHAO[tipo],
      viagens,
      toneladas,
      tonMediaViagem,
      kmMedioViagem,
      realizadoKg,
      idealKg,
      maxKg: limites[tipo],
      pctIdeal,
      gargalo: pctIdealForaDaMargem(pctIdeal),
    };
  }).filter(Boolean) as LinhaTipoEstudo[];
}

function blocoIndicadoresDiaHtml(
  op: OperacaoDiaAnalise['resumo'],
  cenario?: CenarioCaixaMediaDia | null,
  dens?: number | null,
): string {
  const densFmt = resolverDensidadeResiduoKgL(cenario?.densidadeKgL ?? dens);
  const tonH = op.horas > 0 ? op.toneladas / op.horas : 0;
  const kmH = op.horas > 0 ? op.km / op.horas : 0;
  const cards: { label: string; valor: string; cor: string }[] = [
    { label: 'Viagens', valor: fmtNum(op.viagens, 0), cor: '#6366f1' },
    { label: 'Toneladas', valor: `${fmtNum(op.toneladas, 1)} t`, cor: '#16a34a' },
    { label: 't / viagem', valor: `${fmtNum(op.tonMediaColeta, 2)} t`, cor: '#0891b2' },
    { label: 'Caminhões', valor: fmtNum(op.caminhoes ?? op.coletores, 0), cor: '#7c3aed' },
  ];
  if (op.horas > 0) {
    cards.push(
      { label: 'Ton./hora', valor: `${fmtNum(tonH, 2)} t/h`, cor: '#8b5cf6' },
      { label: 'Veloc. operacional', valor: `${fmtNum(kmH, 1)} km/h`, cor: '#0f766e' },
    );
  }
  if (cenario && cenario.pesoIdealKg > 0) {
    cards.push(
      { label: '% ideal frota', valor: `${fmtNum(cenario.ocupacaoVsIdealPct ?? 0, 0)}%`, cor: '#5b21b6' },
      { label: 'Densidade', valor: `${fmtNum(densFmt, 2)} kg/L`, cor: '#b45309' },
    );
  } else {
    cards.push(
      { label: 'KM / viagem', valor: `${fmtNum(op.kmMedioViagem, 1)} km`, cor: '#d97706' },
      { label: 'KM total', valor: `${fmtNum(op.km, 0)} km`, cor: '#64748b' },
    );
  }

  return `
  <div class="sec">Indicadores do dia</div>
  ${cardsHtml(cards)}`;
}

/**
 * Gráfico gerencial: só kg na mesma escala (ideal × coletado).
 * Viagens e t/viagem entram como chips — evita misturar unidades.
 */
function blocoGraficoViagemPorTipoHtml(
  operacao: OperacaoDiaAnalise,
  limOpts: OptsAnaliseContratoDia,
): string {
  const pontos = montarPontosViagemPorTipo(operacao, limOpts.volumeL, densidadeOptsToInput(limOpts));
  if (!pontos.length) return '';

  const maxKg = Math.max(...pontos.flatMap((p) => [p.pesoIdealKg, p.pesoColetadoKg]), 1);
  const totalViagens = pontos.reduce((s, p) => s + p.viagens, 0) || 1;

  const cards = pontos.map((p) => {
    const wIdeal = Math.max(2, Math.round((p.pesoIdealKg / maxKg) * 100));
    const wCol = Math.max(2, Math.round((p.pesoColetadoKg / maxKg) * 100));
    const corCol = p.gargalo ? '#ef4444' : '#16a34a';
    const pctViag = Math.round((p.viagens / totalViagens) * 100);
    const statusTxt = p.gargalo
      ? `GARGALO ${p.pctIdeal != null ? `${fmtNum(p.pctIdeal, 0)}%` : ''}`
      : `OK ${p.pctIdeal != null ? `${fmtNum(p.pctIdeal, 0)}%` : ''}`;
    const statusCls = p.gargalo ? 'st-ruim' : 'st-bom';

    return `
    <div class="vg-card${p.gargalo ? ' g' : ''}">
      <table class="vg-card-hd"><tr>
        <td>
          <div class="vg-tipo">${esc(p.label)} <span style="font-weight:600;color:#94a3b8;font-size:7px">· visão média do tipo</span></div>
          <div class="vg-chips">
            <span class="vg-chip">${fmtNum(p.viagens, 0)} viagens (${fmtNum(pctViag, 0)}%)</span>
            <span class="vg-chip">média ${fmtNum(p.tonMediaViagem, 2)} t/v</span>
          </div>
        </td>
        <td class="vg-status"><span class="${statusCls}">${esc(statusTxt)}</span></td>
      </tr></table>
      <table class="vg-row">
        <tr>
          <td class="lbl">Ideal</td>
          <td><div class="track"><span class="fill" style="width:${wIdeal}%;background:#8b5cf6"></span></div></td>
          <td class="val">${fmtNum(p.pesoIdealKg, 0)} kg</td>
        </tr>
        <tr>
          <td class="lbl">Média dia</td>
          <td><div class="track"><span class="fill" style="width:${wCol}%;background:${corCol}"></span></div></td>
          <td class="val" style="color:${corCol}">${fmtNum(p.pesoColetadoKg, 0)} kg</td>
        </tr>
      </table>
    </div>`;
  }).join('');

  return `
  <div class="sec">Desempenho por tipo — peso ideal × média do dia</div>
  <p class="vg-legenda">
    <span class="vg-dot" style="background:#8b5cf6"></span>Peso ideal (contrato)
    &nbsp;&nbsp;<span class="vg-dot" style="background:#16a34a"></span>Média coletada (OK)
    &nbsp;&nbsp;<span class="vg-dot" style="background:#ef4444"></span>Média (fora do ótimo ${PCT_IDEAL_MIN}–${PCT_IDEAL_MAX}%)
    &nbsp;· detalhe viagem a viagem na seção seguinte
  </p>
  ${cards}`;
}

function blocoGargalosOperacaoHtml(opts: {
  tipos: LinhaTipoEstudo[];
  estudo?: EstudoRotasDia | null;
  eficiencia: LinhaEficienciaPlaca[];
  cenario?: CenarioCaixaMediaDia | null;
}): string {
  const itens: ItemGargalo[] = [];

  for (const t of opts.tipos.filter((x) => x.gargalo)) {
    itens.push({
      severidade: (t.pctIdeal != null && Math.abs(t.pctIdeal - 100) > 25) ? 'critico' : 'atencao',
      origem: 'tipo',
      texto: `${t.label}: ${fmtNum(t.realizadoKg, 0)} kg médio vs ideal ${fmtNum(t.idealKg, 0)} kg (${fmtNum(t.pctIdeal ?? 0, 0)}% · ótimo ${PCT_IDEAL_MIN}–${PCT_IDEAL_MAX}%) — ${fmtNum(t.viagens, 0)} viagem(ns)`,
    });
  }

  const rotas = (opts.estudo?.rotas || [])
    .filter((r) => r.status === 'ruim' && pctIdealForaDaMargem(r.pctIdeal))
    .sort((a, b) => Math.abs((b.pctIdeal ?? 100) - 100) - Math.abs((a.pctIdeal ?? 100) - 100))
    .slice(0, 5);
  for (const r of rotas) {
    itens.push({
      severidade: (r.pctIdeal != null && Math.abs(r.pctIdeal - 100) > 25) ? 'critico' : 'atencao',
      origem: 'rota',
      texto: `Rota ${r.rota} (${r.tipoPredominanteLabel}): ${fmtNum(r.tonMediaViagem * 1000, 0)} kg vs ideal ${fmtNum(r.pesoIdealKg ?? 0, 0)} kg (${fmtNum(r.pctIdeal ?? 0, 0)}%)`,
    });
  }

  const placas = opts.eficiencia
    .filter((p) => p.status !== 'bom' && !p.ehReserva)
    .slice(0, 5);
  for (const p of placas) {
    itens.push({
      severidade: p.status === 'ruim' ? 'critico' : 'atencao',
      origem: 'placa',
      texto: `Placa ${p.chave} (${p.mediaRefLabel}): ${fmtNum(p.tonMediaViagem, 2)} t/viag`
        + (p.pctIdeal != null ? ` · ${fmtNum(p.pctIdeal, 0)}% do ideal (ótimo ${PCT_IDEAL_MIN}–${PCT_IDEAL_MAX}%)` : '')
        + ` · ${fmtNum(p.viagens, 0)} viag.`,
    });
  }

  const vistos = new Set<string>();
  const lista = itens.filter((i) => {
    const k = i.texto.toLowerCase();
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  }).slice(0, 10);

  const nCrit = lista.filter((g) => g.severidade === 'critico').length;
  const veredito = nCrit > 0 ? 'critico' : lista.length > 0 ? 'atencao' : 'ok';
  const cls = veredito === 'critico' ? 'diag-critico' : veredito === 'atencao' ? 'diag-atencao' : 'diag-ok';
  const titulo = veredito === 'critico'
    ? 'Gargalos críticos na operação'
    : veredito === 'atencao'
      ? 'Gargalos e pontos de atenção'
      : 'Sem gargalos vs peso ideal por tipo';

  const resumoFrota = opts.cenario && opts.cenario.pesoIdealKg > 0
    ? `Frota do dia: ${fmtNum(opts.cenario.ocupacaoVsIdealPct ?? 0, 0)}% do ideal`
      + ` (${fmtNum(opts.cenario.pesoMedioDiaKg, 0)} / ${fmtNum(opts.cenario.pesoIdealKg, 0)} kg). `
    : '';

  const porOrigem = (origem: ItemGargalo['origem'], label: string) => {
    const subset = lista.filter((g) => g.origem === origem);
    if (!subset.length) return '';
    return `
      <div style="font-size:6.5px;font-weight:800;color:#64748b;text-transform:uppercase;margin:5px 0 2px">${esc(label)}</div>
      <ol class="diag-lista">
        ${subset.map((g) => `<li>${g.severidade === 'critico' ? '<strong>Crítico — </strong>' : ''}${esc(g.texto)}</li>`).join('')}
      </ol>`;
  };

  return `
  <div class="sec">Gargalos da operação</div>
  <div class="diag-box ${cls}">
    <div class="diag-veredito">${esc(titulo)}</div>
    <p class="diag-resumo">${esc(resumoFrota)}${
      lista.length
        ? `${fmtNum(lista.length, 0)} apontamento(s) abaixo do ideal do tipo.`
        : 'Tipos, rotas e placas dentro do parâmetro do contrato.'
    }</p>
    ${lista.length ? `
      ${porOrigem('tipo', 'Por tipo')}
      ${porOrigem('rota', 'Por rota')}
      ${porOrigem('placa', 'Por placa')}
    ` : '<p class="diag-vazio">Nenhum gargalo identificado no dia.</p>'}
  </div>`;
}

/** Todas as rotas do dia — estudo de produção (não só gargalos). */
function blocoEstudoProducaoHtml(estudo?: EstudoRotasDia | null): string {
  if (!estudo?.rotas?.length) return '';
  const rotas = estudo.rotas.filter((r) => r.viagens > 0)
    .slice()
    .sort((a, b) => a.rota.localeCompare(b.rota, 'pt-BR'));
  if (!rotas.length) return '';
  const media = estudo.mediaDia;

  return `
  <div class="sec">Estudo de produção por rota</div>
  <p class="estudo-nota">
    Todas as rotas do dia. Toneladas = soma do PESO TOTAL.
    t/viagem e % do ideal usam PESO 1–4 vs peso ideal do tipo.
    ${media ? `Média do dia: ${fmtNum(media.tonMediaViagem, 2)} t/viagem · ${fmtNum(media.tonHora, 2)} t/h · ${fmtNum(rotas.length, 0)} rota(s).` : ''}
  </p>
  <table class="data">
    <thead><tr>
      <th>Rota</th><th>Tipo</th><th class="c">Viag.</th>
      <th class="r">Ton</th><th class="r">t/viag</th><th class="r">Ideal</th>
      <th class="c">% ideal</th><th class="r">KM</th><th class="r">Horas</th><th class="r">t/h</th>
    </tr></thead>
    <tbody>
      ${rotas.map((r, i) => {
        const cor = r.status === 'ruim' ? '#991b1b' : r.status === 'medio' ? '#92400e' : '#166534';
        const bg = r.status === 'ruim'
          ? (i % 2 === 0 ? '#fef2f2' : '#fff7f7')
          : (i % 2 === 0 ? '#fff' : '#fafbfc');
        return `
        <tr style="background:${bg}">
          <td style="font-weight:600">${esc(r.rota)}</td>
          <td>${esc(r.tipoPredominanteLabel || '—')}</td>
          <td class="c">${fmtNum(r.viagens, 0)}</td>
          <td class="r" style="font-weight:700">${fmtNum(r.toneladas, 2)}</td>
          <td class="r">${fmtNum(r.tonMediaViagem, 2)}</td>
          <td class="r">${r.pesoIdealKg != null ? `${fmtNum(r.pesoIdealKg, 0)} kg` : '—'}</td>
          <td class="c" style="font-weight:800;color:${cor}">${r.pctIdeal != null ? `${fmtNum(r.pctIdeal, 0)}%` : '—'}</td>
          <td class="r">${fmtNum(r.km, 0)}</td>
          <td class="r">${fmtNum(r.horas, 1)}</td>
          <td class="r">${fmtNum(r.tonHora, 2)}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}

function graficoPizzaTipoHtml(linhas: LinhaReceitaGrupo[], faturamentoTotal: number): string {
  const lista = linhas.filter((l) => l.chave && l.chave !== '—' && l.faturamento > 0);
  if (!lista.length) return '';

  const total = lista.reduce((s, l) => s + l.faturamento, 0);
  const segs = lista.map((l, i) => {
    const pct = total > 0 ? (l.faturamento / total) * 100 : 0;
    const cor = PALETA_PIZZA[i % PALETA_PIZZA.length];
    return { ...l, pct, cor };
  });

  return `
    <div class="chart-box">
      <div class="bloco-hd">Faturamento por tipo de caminhão</div>
      <div class="pizza-segs">
        ${segs.map((s) => `<span class="pizza-seg" style="width:${Math.max(s.pct, 1)}%;background:${s.cor}"></span>`).join('')}
      </div>
      <div style="font-size:8px;font-weight:800;color:#047857;text-align:center;margin-bottom:4px">${fmtMoeda(faturamentoTotal)}</div>
      <table class="pizza-leg">
        ${segs.map((s) => `
          <tr>
            <td style="width:12px"><span class="pizza-dot" style="background:${s.cor}"></span></td>
            <td style="font-weight:600;color:#334155">${esc(s.chave)}</td>
            <td class="r nowrap" style="color:#64748b">${fmtMoeda(s.faturamento)} (${fmtNum(s.pct, 0)}%)</td>
          </tr>`).join('')}
      </table>
    </div>`;
}

function graficoBarrasHorizontaisGrupoHtml(titulo: string, linhas: LinhaReceitaGrupo[], cor: string): string {
  const lista = linhas.filter((l) => l.chave && l.chave !== '—' && l.faturamento > 0);
  if (!lista.length) return '';

  const maxVal = Math.max(...lista.map((l) => l.faturamento), 0.01);

  return `
    <div class="chart-box">
      <div class="bloco-hd">${esc(titulo)}</div>
      ${lista.map((l) => barraHorizontalHtml(l.chave, l.faturamento, maxVal, cor)).join('')}
    </div>`;
}

function graficoReceitaPlacaHtml(linhas: LinhaReceitaGrupo[], faturamentoTotal: number): string {
  const lista = linhas.filter((l) => l.chave && l.chave !== '—' && l.faturamento > 0);
  if (!lista.length) return '';

  const maxVal = Math.max(...lista.map((l) => l.faturamento), 0.01);

  return `
    <div class="bloco">
      <div class="sec">Receita por veículo (PLACA)</div>
      <table class="bloco-hd-tbl">
        <tr>
          <td>Faturamento por placa</td>
          <td class="r"><span class="badge">Total: ${fmtMoeda(faturamentoTotal)}</span></td>
        </tr>
      </table>
      ${lista.map((l) => {
        const pct = faturamentoTotal > 0 ? (l.faturamento / faturamentoTotal) * 100 : 0;
        const barW = Math.max(4, Math.round((l.faturamento / maxVal) * 100));
        const detalhe = `${fmtNum(l.viagens, 0)} viag. · ${fmtNum(l.toneladas, 1)} t · ${fmtNum(l.km, 0)} km · ${fmtMoeda(l.receitaTon)}/t`;
        const lbl = l.chave.length > 9 ? l.chave.slice(0, 9) + '…' : l.chave;
        return `
          <div class="bar-row">
            <div class="bar-lbl">${esc(lbl)} <span class="bar-pct">${fmtNum(pct, 1)}%</span></div>
            <div class="bar-track"><span class="bar-fill" style="width:${barW}%"></span></div>
            <div class="bar-val">${fmtMoeda(l.faturamento)}</div>
          </div>
          <div class="bar-detail">${detalhe}</div>`;
      }).join('')}
    </div>`;
}

function tabelaReceitaDetalhada(
  titulo: string,
  linhas: LinhaReceitaGrupo[],
  opts: { compacto?: boolean; comPct?: boolean; faturamentoTotal?: number } = {},
) {
  const lista = linhas.filter((l) => l.chave && l.chave !== '—');
  if (!lista.length) return '';

  const maxFat = Math.max(...lista.map((l) => l.faturamento), 0.01);
  const compacto = opts.compacto === true;
  const comPct = opts.comPct === true;
  const totalFat = opts.faturamentoTotal ?? 0;

  return `
    <div class="bloco">
      <div class="bloco-hd">${esc(titulo)}</div>
      <table class="data">
        <colgroup>
          <col style="width:${compacto ? '38%' : '22%'}"/>
          ${!compacto ? '<col style="width:10%"/>' : ''}
          <col style="width:${compacto ? '22%' : '14%'}"/>
          ${!compacto ? '<col style="width:12%"/>' : ''}
          <col style="width:${compacto ? '40%' : '18%'}"/>
          ${comPct ? '<col style="width:8%"/>' : ''}
          ${!compacto ? '<col style="width:14%"/>' : ''}
        </colgroup>
        <thead><tr>
          <th>Item</th>
          ${!compacto ? '<th class="c">Viag.</th>' : ''}
          <th class="r">Ton</th>
          ${!compacto ? '<th class="r">KM</th>' : ''}
          <th class="r fat-h">Faturamento</th>
          ${comPct ? '<th class="r">%</th>' : ''}
          ${!compacto ? '<th class="r">R$/ton</th>' : ''}
        </tr></thead>
        <tbody>${lista.map((l, i) => {
          const pct = totalFat > 0 ? (l.faturamento / totalFat) * 100 : 0;
          const barW = Math.max(4, (l.faturamento / maxFat) * 100);
          return `
          <tr style="background:${i % 2 === 0 ? '#f8fafc' : '#fff'}">
            <td style="font-weight:600">${esc(l.chave)}</td>
            ${!compacto ? `<td class="c">${fmtNum(l.viagens, 0)}</td>` : ''}
            <td class="r nowrap">${fmtNum(l.toneladas, 1)} t</td>
            ${!compacto ? `<td class="r nowrap">${fmtNum(l.km, 0)}</td>` : ''}
            <td class="r fat nowrap">
              ${fmtMoeda(l.faturamento)}
              ${!compacto ? `<span class="bar-mini" style="width:${barW}%"></span>` : ''}
            </td>
            ${comPct ? `<td class="r nowrap" style="color:#64748b">${fmtNum(pct, 1)}%</td>` : ''}
            ${!compacto ? `<td class="r nowrap" style="color:#92400e">${fmtMoeda(l.receitaTon)}</td>` : ''}
          </tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>`;
}

function blocoOperacao(opts: {
  operacao: OperacaoDiaAnalise;
  dataIso: string;
  kpisOperacao?: KpiValor[];
  placasReserva?: string[];
  estudoRotas?: EstudoRotasDia | null;
  cenarioCaixaMedia?: CenarioCaixaMediaDia | null;
  limitesPesoKg?: MapaLimiteCaminhao | null;
  volumeL?: MapaLimiteCaminhao | null;
  densidadeResiduoKgL?: number | null;
  densidadeKgL?: MapaLimiteCaminhao | null;
  densidadeKgLPorPlaca?: Record<string, number> | null;
  viagensPesoRota?: ViagemPesoRotaPdf[] | null;
  mapeamentoResumo?: ResumoMapeamentoPdf | null;
  mapeamentoLinhas?: LinhaMapeamentoPdf[] | null;
  trechosPorPlaca?: TrechosDimensaoPdf[] | null;
  trechosPorRota?: TrechosDimensaoPdf[] | null;
  baselineDia?: BaselineDia | null;
}): string {
  const op = { ...opts.operacao.resumo };
  const horasJornada = Number(opts.mapeamentoResumo?.horasProdutivas || 0);
  if (horasJornada > 0) op.horas = horasJornada;
  const kmMapeamento = Number(opts.mapeamentoResumo?.kmTotal || opts.mapeamentoResumo?.kmProdutivo || 0);
  if (!(op.km > 0) && kmMapeamento > 0) op.km = kmMapeamento;
  if (!(op.km > 0) && opts.viagensPesoRota?.length) {
    const kmDasRotas = agruparViagensPesoPdf(opts.viagensPesoRota)
      .reduce((s, g) => s + (g.kmTotalRota || 0), 0);
    if (kmDasRotas > 0) op.km = kmDasRotas;
  }
  const limOpts: OptsAnaliseContratoDia = {
    limitesPesoKg: opts.limitesPesoKg,
    volumeL: opts.volumeL,
    densidadeResiduoKgL: opts.densidadeResiduoKgL,
    densidadeKgL: opts.densidadeKgL,
    densidadeKgLPorPlaca: opts.densidadeKgLPorPlaca,
  };
  const eficiencia = montarEficienciaPlacas(opts.operacao, opts.placasReserva, limOpts);
  const tipos = montarLinhasTipoEstudo(opts.operacao, opts.estudoRotas, limOpts);
  const frota = resumirFrotaOperacao(
    opts.operacao.porPlaca.filter((p) => p.chave !== '—').map((p) => p.chave),
    opts.placasReserva,
  );
  const frotaReservaTxt = opts.placasReserva?.length
    ? `${frota.titulares} titular${frota.titulares !== 1 ? 'es' : ''}${frota.reserva > 0 ? ` + ${frota.reserva} reserva` : ''}`
    : '';

  return `
  ${frotaReservaTxt ? `<p style="font-size:7px;color:#64748b;margin:0 0 6px">Frota: ${esc(frotaReservaTxt)}</p>` : ''}
  ${blocoIndicadoresDiaHtml(op, opts.cenarioCaixaMedia, opts.densidadeResiduoKgL)}
  ${blocoReguaTemporalHtml(opts.baselineDia)}
  ${blocoGraficoViagemPorTipoHtml(opts.operacao, limOpts)}
  ${blocoViagensPesoRotaHtml(opts.viagensPesoRota)}
  ${blocoEstudoProducaoHtml(opts.estudoRotas)}
  ${blocoMapeamentoTempoKmHtml({
    viagensPesoRota: opts.viagensPesoRota,
    resumo: opts.mapeamentoResumo,
    linhas: opts.mapeamentoLinhas,
  })}
  ${blocoTrechosImprodutivosHtml({
    resumo: opts.mapeamentoResumo,
    porPlaca: opts.trechosPorPlaca,
    porRota: opts.trechosPorRota,
  })}
  ${blocoGargalosOperacaoHtml({
    tipos,
    estudo: opts.estudoRotas,
    eficiencia,
    cenario: opts.cenarioCaixaMedia,
  })}
  `;
}

function blocoReceita(opts: { receita: ReceitaDiaAnalise; dataIso: string }): string {
  const rec = opts.receita.resumo;
  const tarifas = opts.receita.tarifas;
  const tarifaTxt = `Geral ${fmtMoeda(tarifas.valorTonelada)}/t · Mini ${fmtMoeda(tarifas.valorMini || tarifas.valorTonelada)}/t · Truck ${fmtMoeda(tarifas.valorTruck || tarifas.valorTonelada)}/t · Toco ${fmtMoeda(tarifas.valorToco || tarifas.valorTonelada)}/t · Basculante ${fmtMoeda(tarifas.valorBasculante || tarifas.valorTonelada)}/t`;

  const temTurno = opts.receita.porTurno.some((l) => l.chave !== '—' && l.faturamento > 0);
  const temRegional = opts.receita.porRegional.some((l) => l.chave !== '—' && l.faturamento > 0);

  return `
  <div class="banner">
    Receita de <strong>${fmtNum(rec.viagens, 0)} viagem${rec.viagens !== 1 ? 's' : ''}</strong>
    em ${esc(formatarIsoParaBr(opts.dataIso))}
    · ${opts.receita.registrosConsiderados} registro${opts.receita.registrosConsiderados !== 1 ? 's' : ''}
  </div>
  ${heroReceitaHtml(rec, opts.receita.registrosConsiderados)}

  <div class="sec">Distribuição da receita do dia</div>
  <table class="chart-tbl">
    <tr>
      <td colspan="2">${graficoPizzaTipoHtml(opts.receita.porTipoCaminhao, rec.faturamento)}</td>
    </tr>
    ${temTurno || temRegional ? `
    <tr>
      <td style="width:50%;vertical-align:top">${temTurno ? graficoBarrasHorizontaisGrupoHtml('Faturamento por turno', opts.receita.porTurno, '#7c3aed') : ''}</td>
      <td style="width:50%;vertical-align:top">${temRegional ? graficoBarrasHorizontaisGrupoHtml('Faturamento por regional', opts.receita.porRegional, '#0891b2') : ''}</td>
    </tr>` : ''}
  </table>

  <div class="sec">Base operacional do dia</div>
  ${cardsHtml([
    { label: 'Viagens', valor: fmtNum(rec.viagens, 0), cor: '#3b82f6' },
    { label: 'Toneladas', valor: `${fmtNum(rec.toneladas, 1)} t`, cor: '#16a34a' },
    { label: 'KM TOTAL', valor: `${fmtNum(rec.km, 0)} km`, cor: '#d97706' },
    { label: 'Horas', valor: `${fmtNum(rec.horas, 1)} h`, cor: '#7c3aed' },
    { label: 'Veículos', valor: String(rec.coletores), cor: '#0891b2' },
    { label: 'Motoristas', valor: String(rec.motoristas), cor: '#6366f1' },
    { label: 'Ton./KM', valor: fmtNum(rec.tonKm, 3), cor: '#f97316' },
    { label: 'Ton./veículo', valor: `${fmtNum(rec.prodColetor, 2)} t`, cor: '#22c55e' },
  ])}

  <div class="tarifas">
    <strong>Tarifas aplicadas</strong>${!tarifas.temValorConfigurado ? ' (padrão estimado)' : ''}: ${esc(tarifaTxt)}
  </div>

  ${tabelaReceitaDetalhada('Faturamento por tipo de caminhão', opts.receita.porTipoCaminhao, {
    comPct: true,
    faturamentoTotal: rec.faturamento,
  })}

  <table class="layout2-tbl">
    <tr>
      <td>${temTurno ? tabelaReceitaDetalhada('Por turno', opts.receita.porTurno, { compacto: true }) : ''}</td>
      <td>${temRegional ? tabelaReceitaDetalhada('Por regional', opts.receita.porRegional, { compacto: true }) : ''}</td>
    </tr>
  </table>

  ${graficoReceitaPlacaHtml(opts.receita.porPlaca, rec.faturamento)}`;
}

/** PDF do dia — somente a aba Operação ou Receita ativa. */
function diaSemanaCabecalho(dia: string): string {
  if (/feira$/i.test(dia) || /s[áa]bado|domingo/i.test(dia)) return dia;
  if (/^(segunda|terça|terca|quarta|quinta|sexta)$/i.test(dia)) return `${dia}-feira`;
  return dia;
}

function cabecalhoRelatorioHtml(opts: {
  servicoNome: string;
  titulo: string;
  selo: string;
  variante: 'op' | 'rec';
  dataIso: string;
  diaSemana: string;
  dataGeracao: string;
  horaGeracao: string;
}): string {
  return `
  <div class="header">
    <table class="hd-tbl"><tr>
      <td>
        <div class="eyebrow">${esc(opts.servicoNome)}</div>
        <h1>${esc(opts.titulo)}</h1>
        <div class="data">${esc(formatarIsoParaBr(opts.dataIso))} · ${esc(diaSemanaCabecalho(opts.diaSemana))}</div>
      </td>
      <td class="hd-meta">
        <div class="tipo ${opts.variante}">${esc(opts.selo)}</div>
        <div class="gerado">Gerado em ${esc(opts.dataGeracao)} às ${esc(opts.horaGeracao)}</div>
      </td>
    </tr></table>
  </div>`;
}

export function gerarHtmlRelatorioDia(opts: {
  aba: AbaRelatorioDia;
  servicoNome: string;
  dataIso: string;
  diaSemana: string;
  operacao: OperacaoDiaAnalise;
  receita?: ReceitaDiaAnalise | null;
  linhas?: RegistroDiaLinha[];
  kpisOperacao?: KpiValor[];
  placasReserva?: string[];
  estudoRotas?: EstudoRotasDia | null;
  cenarioCaixaMedia?: CenarioCaixaMediaDia | null;
  limitesPesoKg?: MapaLimiteCaminhao | null;
  volumeL?: MapaLimiteCaminhao | null;
  densidadeResiduoKgL?: number | null;
  densidadeKgL?: MapaLimiteCaminhao | null;
  densidadeKgLPorPlaca?: Record<string, number> | null;
  viagensPesoRota?: ViagemPesoRotaPdf[] | null;
  mapeamentoResumo?: ResumoMapeamentoPdf | null;
  mapeamentoLinhas?: LinhaMapeamentoPdf[] | null;
  trechosPorPlaca?: TrechosDimensaoPdf[] | null;
  trechosPorRota?: TrechosDimensaoPdf[] | null;
  baselineDia?: BaselineDia | null;
  geradoEm?: Date;
}): string {
  const { aba, servicoNome, dataIso, diaSemana, operacao, receita } = opts;
  const gerado = opts.geradoEm ?? new Date();
  const stamp = gerado.getTime();
  const dataGeracao = gerado.toLocaleDateString('pt-BR');
  const horaGeracao = gerado.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const ehReceita = aba === 'receita';
  const tituloAba = ehReceita ? 'Relatório de Receita do dia' : 'Relatório de Operação do dia';
  const tituloPagina = ehReceita ? 'Receita' : 'Operação';

  const corpo = ehReceita
    ? blocoReceita({ receita: receita!, dataIso })
    : blocoOperacao({
      operacao,
      dataIso,
      kpisOperacao: opts.kpisOperacao,
      placasReserva: opts.placasReserva,
      estudoRotas: opts.estudoRotas,
      cenarioCaixaMedia: opts.cenarioCaixaMedia,
      limitesPesoKg: opts.limitesPesoKg,
      volumeL: opts.volumeL,
      densidadeResiduoKgL: opts.densidadeResiduoKgL,
      densidadeKgL: opts.densidadeKgL,
      densidadeKgLPorPlaca: opts.densidadeKgLPorPlaca,
      viagensPesoRota: opts.viagensPesoRota,
      mapeamentoResumo: opts.mapeamentoResumo,
      mapeamentoLinhas: opts.mapeamentoLinhas,
      trechosPorPlaca: opts.trechosPorPlaca,
      trechosPorRota: opts.trechosPorRota,
      baselineDia: opts.baselineDia,
    });

  const resumo = ehReceita ? receita!.resumo : operacao.resumo;
  const footerExtra = ehReceita
    ? `Faturamento ${fmtMoeda(resumo.faturamento)}`
    : `${fmtNum(resumo.viagens, 0)} viagem${resumo.viagens !== 1 ? 's' : ''}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>${esc(tituloPagina)} — ${esc(formatarIsoParaBr(dataIso))}</title>
  <!-- relatorio-dia-${aba}:${esc(dataIso)}:${stamp} -->
  <style>${ESTILOS}</style>
</head>
<body>
  ${cabecalhoRelatorioHtml({
    servicoNome,
    titulo: ehReceita ? 'Receita do dia' : 'Operação do dia',
    selo: ehReceita ? 'Receita' : 'Diário',
    variante: ehReceita ? 'rec' : 'op',
    dataIso,
    diaSemana,
    dataGeracao,
    horaGeracao,
  })}
  ${corpo}
  <div class="footer">
    Sistemma · ${esc(tituloAba)} · ${footerExtra} · ${esc(formatarIsoParaBr(dataIso))}
  </div>
</body>
</html>`;
}
