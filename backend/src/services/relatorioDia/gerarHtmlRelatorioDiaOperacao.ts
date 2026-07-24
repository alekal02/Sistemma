/**
 * Port fiel do PDF "Relatório de Operação do dia" do frontend
 * (`gerarHtmlRelatorioDia` com aba: 'operacao').
 */
import { resumirFrotaOperacao } from '../../utils/placasReserva';
import { esc, fmtNum, formatarIsoParaBr } from './fmt';
import {
  blocoDesempenhoPorTipoHtml,
  blocoRankingViagensHtml,
  type ResumoCapacidadeDia,
} from './capacidadeViagemDia';
import { PCT_IDEAL_MAX, PCT_IDEAL_MIN, textoEscalaIdealCurto } from './escalaIdealPeso';
import {
  gerarInsightsOperacao,
  montarEficienciaGrupos,
  montarEficienciaPlacas,
  type InsightOperacao,
  type LinhaEficienciaPlaca,
  type LinhaOperacaoGrupo,
  type OperacaoDiaAnalise,
  type OptsEficienciaContrato,
} from './operacaoDia';
import type { TipoCaminhaoPeso } from '../../config/pesoMaximoCaminhao';

export interface KpiValorPdf {
  nome: string;
  formatado: string;
}

const PALETA_PIZZA = ['#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ef4444', '#06b6d4'];

function badgeReservaHtml(): string {
  return '<span class="badge" style="color:#92400e;background:#fef3c7;font-size:5px;margin-left:3px">RESERVA</span>';
}

function placaComReservaHtml(placa: string, ehReserva?: boolean): string {
  return `${esc(placa)}${ehReserva ? badgeReservaHtml() : ''}`;
}

const ESTILOS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 8.5px; color: #1e293b; padding: 12px 14px; line-height: 1.35; width: 100%; }
  .header { background: linear-gradient(135deg,#0f172a,#1e3a5f); color: #fff; border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; }
  .header h1 { font-size: 14px; font-weight: 800; color: #fbbf24; }
  .header .sub { font-size: 7.5px; color: #94a3b8; margin-top: 2px; }
  .header .tipo { display: inline-block; margin-top: 4px; font-size: 7px; font-weight: 700; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; }
  .header .tipo.op { color: #a5b4fc; background: rgba(99,102,241,0.2); }
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
  table.data td { padding: 3px 5px; border-bottom: 1px solid #f1f5f9; word-wrap: break-word; overflow-wrap: break-word; }
  table.data td.nowrap, table.data th.nowrap { white-space: nowrap; }
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
  .bar-val.op { color: #1d4ed8; }
  table.data th.op-h { background: #4338ca; color: #c7d2fe; }
  .layout2-tbl { width: 100%; border-collapse: separate; border-spacing: 8px; margin-bottom: 4px; }
  .layout2-tbl > tbody > tr > td { width: 50%; vertical-align: top; }
  .footer { text-align: center; font-size: 6px; color: #94a3b8; margin-top: 10px; padding-top: 8px; border-top: 1px solid #e2e8f0; }
  @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } body { padding: 10px; } }
`;

function barraHorizontalHtml(
  label: string,
  valor: number,
  maxVal: number,
  cor = '#10b981',
  formato: (v: number) => string = (v) => fmtNum(v, 0),
): string {
  const pct = Math.max(4, Math.round((valor / maxVal) * 100));
  const lbl = label.length > 10 ? label.slice(0, 10) + '…' : label;
  return `
    <div class="bar-row">
      <div class="bar-lbl">${esc(lbl)}</div>
      <div class="bar-track"><span class="bar-fill" style="width:${pct}%;background:${cor}"></span></div>
      <div class="bar-val">${formato(valor)}</div>
    </div>`;
}

function heroOperacaoHtml(op: OperacaoDiaAnalise['resumo']) {
  const tonH = op.horas > 0 ? op.toneladas / op.horas : 0;
  const kmH = op.horas > 0 ? op.km / op.horas : 0;
  return `
  <table class="tbl-layout">
    <tr>
      <td style="width:58%;padding-right:10px">
        <div class="hero-dark hero-op">
          <div class="lbl">Viagens do dia</div>
          <div class="val">${fmtNum(op.viagens, 0)}</div>
          <div class="sub">${op.caminhoes ?? op.coletores} caminhão(ões) · ${op.motoristas} motorista(s) · ${op.registros} registro(s)</div>
        </div>
      </td>
      <td style="width:42%">
        <div class="hero-dark" style="padding:8px">
          <table class="mini-tbl">
            <tr>
              <td class="mini-dark"><div class="lbl">Toneladas</div><div class="val">${fmtNum(op.toneladas, 1)} t</div></td>
              <td class="mini-dark"><div class="lbl">KM total</div><div class="val">${fmtNum(op.km, 0)} km</div></td>
            </tr>
            <tr>
              <td class="mini-dark"><div class="lbl">Ton./viagem</div><div class="val">${fmtNum(op.tonMediaColeta, 2)} t</div></td>
              <td class="mini-dark"><div class="lbl">Ton./hora</div><div class="val">${fmtNum(tonH, 2)} t/h</div></td>
            </tr>
          </table>
        </div>
      </td>
    </tr>
  </table>
  <table class="ref-tbl">
    <thead><tr>
      <th>Indicador-chave</th><th>Valor do dia</th><th>Referência gerencial</th>
    </tr></thead>
    <tbody>
      <tr><td>Produtividade por veículo</td><td class="dest">${fmtNum(op.prodColetor, 2)} t</td><td>Volume médio por placa ativa</td></tr>
      <tr><td>KM por viagem</td><td class="dest">${fmtNum(op.kmMedioViagem, 1)} km</td><td>Eficiência de deslocamento</td></tr>
      <tr><td>Ton./KM</td><td class="dest">${fmtNum(op.tonKm, 3)}</td><td>Carga transportada por km rodado</td></tr>
      <tr><td>Velocidade operacional</td><td class="dest">${fmtNum(kmH, 1)} km/h</td><td>KM rodado por hora produtiva</td></tr>
    </tbody>
  </table>`;
}

function insightsHtml(insights: InsightOperacao[]): string {
  if (!insights.length) return '';
  const clsMap = { critico: 'insight-critico', atencao: 'insight-atencao', info: 'insight-info' };
  return `
    <div class="sec">Gargalos e pontos de atenção</div>
    <div class="insight-box">
      ${insights.map((i) => `
        <div class="insight-item ${clsMap[i.severidade]}">
          <div class="insight-tit">${esc(i.titulo)}</div>
          <div>${esc(i.texto)}</div>
        </div>`).join('')}
    </div>`;
}

function statusBadge(status: 'bom' | 'medio' | 'ruim'): string {
  // Alinhado à escala ideal: ótimo / ruim / péssimo
  const map = { bom: ['st-bom', 'Ótimo'], medio: ['st-medio', 'Ruim'], ruim: ['st-ruim', 'Péssimo'] };
  const [cls, lbl] = map[status];
  return `<span class="${cls}">${lbl}</span>`;
}

function graficoPizzaTipoOpHtml(linhas: LinhaOperacaoGrupo[], totalViagens: number): string {
  const lista = linhas.filter((l) => l.chave && l.viagens > 0);
  if (!lista.length) return '';

  const total = lista.reduce((s, l) => s + l.viagens, 0);
  const segs = lista.map((l, i) => {
    const pct = total > 0 ? (l.viagens / total) * 100 : 0;
    const cor = PALETA_PIZZA[i % PALETA_PIZZA.length];
    return { ...l, pct, cor };
  });

  return `
    <div class="chart-box">
      <div class="bloco-hd">Viagens por tipo de caminhão</div>
      <div class="pizza-segs">
        ${segs.map((s) => `<span class="pizza-seg" style="width:${Math.max(s.pct, 1)}%;background:${s.cor}"></span>`).join('')}
      </div>
      <div style="font-size:8px;font-weight:800;color:#4338ca;text-align:center;margin-bottom:4px">${fmtNum(totalViagens, 0)} viagens</div>
      <table class="pizza-leg">
        ${segs.map((s) => `
          <tr>
            <td style="width:12px"><span class="pizza-dot" style="background:${s.cor}"></span></td>
            <td style="font-weight:600;color:#334155">${esc(s.chave)}</td>
            <td class="r nowrap" style="color:#64748b">${fmtNum(s.viagens, 0)} viag. (${fmtNum(s.pct, 0)}%)</td>
          </tr>`).join('')}
      </table>
    </div>`;
}

function graficoBarrasHorizontaisOpHtml(
  titulo: string,
  linhas: LinhaOperacaoGrupo[],
  cor: string,
  campo: 'viagens' | 'toneladas' = 'viagens',
): string {
  const lista = linhas.filter((l) => l.chave && l.chave !== '—' && l[campo] > 0);
  if (!lista.length) return '';

  const maxVal = Math.max(...lista.map((l) => l[campo]), 0.01);
  const fmt = campo === 'viagens'
    ? (v: number) => `${fmtNum(v, 0)} viag.`
    : (v: number) => `${fmtNum(v, 1)} t`;

  return `
    <div class="chart-box">
      <div class="bloco-hd">${esc(titulo)}</div>
      ${lista.map((l) => barraHorizontalHtml(l.chave, l[campo], maxVal, cor, fmt)).join('')}
    </div>`;
}

/** Quadro resumido por placa — vs ideal do tipo (não média geral do dia). */
function tabelaEficienciaPlacaHtml(linhas: LinhaEficienciaPlaca[]): string {
  if (!linhas.length) return '';
  const piores = [...linhas]
    .filter((l) => l.status !== 'bom')
    .slice(0, 12);
  if (!piores.length) return '';
  return `
    <div class="bloco">
      <div class="bloco-hd">Placas a monitorar — vs ideal do tipo</div>
      <table class="data">
        <thead><tr>
          <th>Placa</th><th>Tipo</th><th class="c">Viag.</th><th class="r">Ton</th>
          <th class="r op-h">t/viag</th><th class="c">% ideal</th><th class="c">Status</th>
        </tr></thead>
        <tbody>${piores.map((l, i) => `
          <tr style="background:${i % 2 === 0 ? '#f8fafc' : '#fff'}">
            <td style="font-weight:700">${placaComReservaHtml(l.chave, l.ehReserva)}</td>
            <td style="font-size:6px;color:#64748b">${esc(l.mediaRefLabel || '—')}</td>
            <td class="c">${fmtNum(l.viagens, 0)}</td>
            <td class="r nowrap">${fmtNum(l.toneladas, 1)} t</td>
            <td class="r nowrap" style="font-weight:700">${fmtNum(l.tonMediaViagem, 2)}</td>
            <td class="c">${l.pctIdeal != null ? `${fmtNum(l.pctIdeal, 0)}%` : '—'}</td>
            <td class="c">${statusBadge(l.status)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div style="font-size:6px;color:#94a3b8;margin-top:4px">
        Mini compara com ideal Mini; Toco com Toco. Escala: ${esc(textoEscalaIdealCurto())}.
      </div>
    </div>`;
}

function tabelaGrupoEficienciaHtml(titulo: string, linhas: LinhaEficienciaPlaca[]): string {
  if (!linhas.length) return '';

  return `
    <div class="bloco">
      <div class="bloco-hd">${esc(titulo)} — vs ideal do tipo</div>
      <table class="data">
        <thead><tr>
          <th>Grupo</th><th>Tipo</th><th class="c">Viag.</th><th class="r">Ton</th>
          <th class="r op-h">t/viag</th><th class="c">% ideal</th><th class="c">Status</th>
        </tr></thead>
        <tbody>${linhas.map((l, i) => `
          <tr style="background:${i % 2 === 0 ? '#f8fafc' : '#fff'}">
            <td style="font-weight:600">${esc(l.chave)}</td>
            <td style="font-size:6px;color:#64748b">${esc(l.mediaRefLabel || '—')}</td>
            <td class="c">${fmtNum(l.viagens, 0)}</td>
            <td class="r nowrap">${fmtNum(l.toneladas, 1)} t</td>
            <td class="r nowrap" style="font-weight:700">${fmtNum(l.tonMediaViagem, 2)}</td>
            <td class="c">${l.pctIdeal != null ? `${fmtNum(l.pctIdeal, 0)}%` : '—'}</td>
            <td class="c">${statusBadge(l.status)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div style="font-size:6px;color:#94a3b8;margin-top:4px">
        Motorista de Mini é julgado pelo ideal Mini — não pela média geral do dia.
      </div>
    </div>`;
}

function kpisHtml(kpis: KpiValorPdf[], titulo: string) {
  if (!kpis.length) return '';
  const rows: string[] = [];
  for (let i = 0; i < kpis.length; i += 4) {
    const chunk = kpis.slice(i, i + 4);
    const cells = chunk.map((k) => `
      <td class="kpi-card" style="width:25%">
        <div class="kpi-lbl">${esc(k.nome)}</div>
        <div class="kpi-val">${esc(k.formatado || '—')}</div>
      </td>`).join('');
    const fill = chunk.length < 4
      ? Array.from({ length: 4 - chunk.length }, () => '<td style="width:25%"></td>').join('')
      : '';
    rows.push(`<tr>${cells}${fill}</tr>`);
  }
  return `
    <div class="bloco">
      <div class="sec">${esc(titulo)}</div>
      <table class="kpi-grid">${rows.join('')}</table>
    </div>`;
}

function blocoOperacao(opts: {
  operacao: OperacaoDiaAnalise;
  dataIso: string;
  kpisOperacao?: KpiValorPdf[];
  placasReserva?: string[];
  capacidade?: ResumoCapacidadeDia | null;
  eficienciaOpts?: OptsEficienciaContrato;
}): string {
  const op = opts.operacao.resumo;
  const insights = gerarInsightsOperacao(opts.operacao, opts.placasReserva);
  // Fallback tipo por placa a partir das viagens PESO 1–4
  const tipoPorPlaca = new Map<string, TipoCaminhaoPeso>();
  for (const v of opts.capacidade?.viagens || []) {
    if (!v.tipo || !v.placa) continue;
    const k = v.placa.trim().toUpperCase();
    if (!tipoPorPlaca.has(k)) tipoPorPlaca.set(k, v.tipo);
  }
  const effOpts: OptsEficienciaContrato = {
    ...opts.eficienciaOpts,
    tipoPorPlaca,
  };
  const eficiencia = montarEficienciaPlacas(opts.operacao, opts.placasReserva, effOpts);
  const eficienciaMotorista = montarEficienciaGrupos(opts.operacao.porMotorista, effOpts);
  const eficienciaTurno = montarEficienciaGrupos(opts.operacao.porTurno, effOpts);
  const eficienciaRegional = montarEficienciaGrupos(opts.operacao.porRegional, effOpts);
  const frota = resumirFrotaOperacao(
    opts.operacao.porPlaca.filter((p) => p.chave !== '—').map((p) => p.chave),
    opts.placasReserva,
  );
  const frotaReservaTxt = opts.placasReserva?.length
    ? ` · ${frota.titulares} titular${frota.titulares !== 1 ? 'es' : ''}${frota.reserva > 0 ? ` + ${frota.reserva} reserva` : ''}`
    : '';

  const temTurno = opts.operacao.porTurno.some((l) => l.chave !== '—' && l.viagens > 0);
  const temRegional = opts.operacao.porRegional.some((l) => l.chave !== '—' && l.viagens > 0);
  const temMotorista = opts.operacao.porMotorista.some((l) => l.chave !== '—' && l.viagens > 0);
  const temTipo = opts.operacao.porTipoCaminhao.some((l) => l.viagens > 0)
    || (opts.capacidade?.porTipo?.length ?? 0) > 0;

  // Insights da escala ideal (quando há PESO 1–4)
  const insightsCap: InsightOperacao[] = [];
  if (opts.capacidade && opts.capacidade.viagensComPeso > 0) {
    const c = opts.capacidade;
    if (c.pessimo > 0 || c.ruim > 0) {
      insightsCap.push({
        severidade: c.pessimo > 0 ? 'critico' : 'atencao',
        titulo: 'Viagens fora da faixa ótima do ideal',
        texto: `${fmtNum(c.pessimo, 0)} péssima(s) · ${fmtNum(c.ruim, 0)} ruim · ${fmtNum(c.otimo, 0)} ótima(s). Escala: ${textoEscalaIdealCurto()}.`,
      });
    } else {
      insightsCap.push({
        severidade: 'info',
        titulo: 'Viagens dentro da faixa ótima',
        texto: `${fmtNum(c.otimo, 0)} viagem(ns) entre ${PCT_IDEAL_MIN}–${PCT_IDEAL_MAX}% do peso ideal do tipo.`,
      });
    }
  }
  const insightsAll = [...insightsCap, ...insights].slice(0, 6);

  return `
  <div class="banner op">
    <strong>${fmtNum(op.viagens, 0)} viagem${op.viagens !== 1 ? 's' : ''}</strong>
    em ${esc(formatarIsoParaBr(opts.dataIso))}
    · ${opts.operacao.registrosConsiderados} registro${opts.operacao.registrosConsiderados !== 1 ? 's' : ''}
    · ${op.caminhoes ?? op.coletores} caminhão${(op.caminhoes ?? op.coletores) !== 1 ? 'es' : ''}${frotaReservaTxt}
  </div>

  ${heroOperacaoHtml(op)}
  ${insightsHtml(insightsAll)}

  ${blocoDesempenhoPorTipoHtml(opts.capacidade)}
  ${blocoRankingViagensHtml(opts.capacidade)}

  <div class="sec">Onde está o volume do dia</div>
  <table class="chart-tbl">
    <tr>
      <td colspan="2">${temTipo && opts.operacao.porTipoCaminhao.length ? graficoPizzaTipoOpHtml(opts.operacao.porTipoCaminhao, op.viagens) : ''}</td>
    </tr>
    ${temTurno || temRegional ? `
    <tr>
      <td style="width:50%;vertical-align:top">${temTurno ? graficoBarrasHorizontaisOpHtml('Viagens por turno', opts.operacao.porTurno, '#7c3aed') : ''}</td>
      <td style="width:50%;vertical-align:top">${temRegional ? graficoBarrasHorizontaisOpHtml('Viagens por regional', opts.operacao.porRegional, '#0891b2') : ''}</td>
    </tr>` : ''}
  </table>

  ${tabelaEficienciaPlacaHtml(eficiencia)}

  <div class="sec">Comparativo por dimensão (vs ideal do tipo)</div>
  <table class="layout2-tbl">
    <tr>
      <td>${temTurno ? tabelaGrupoEficienciaHtml('Turno — eficiência', eficienciaTurno) : ''}</td>
      <td>${temRegional ? tabelaGrupoEficienciaHtml('Regional — eficiência', eficienciaRegional) : ''}</td>
    </tr>
    ${temMotorista ? `
    <tr>
      <td colspan="2">${tabelaGrupoEficienciaHtml('Motorista — eficiência', eficienciaMotorista)}</td>
    </tr>` : ''}
  </table>

  ${kpisHtml(opts.kpisOperacao || [], 'Indicadores complementares')}`;
}

/** PDF do dia — aba Operação (alinhado ao frontend: ranking por viagem + escala ideal). */
export function gerarHtmlRelatorioDia(opts: {
  aba: 'operacao';
  servicoNome: string;
  dataIso: string;
  diaSemana: string;
  operacao: OperacaoDiaAnalise;
  kpisOperacao?: KpiValorPdf[];
  placasReserva?: string[];
  /** PESO 1–4 tipados + ideal do contrato — ranking viagem a viagem. */
  capacidade?: ResumoCapacidadeDia | null;
  volumeL?: OptsEficienciaContrato['volumeL'];
  densidadeResiduoKgL?: number | null;
  densidadeKgL?: OptsEficienciaContrato['densidadeKgL'];
  geradoEm?: Date;
}): string {
  const { servicoNome, dataIso, diaSemana, operacao } = opts;
  const gerado = opts.geradoEm ?? new Date();
  const stamp = gerado.getTime();
  const dataGeracao = gerado.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  const horaGeracao = gerado.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const tituloAba = 'Relatório de Operação do dia';
  const tituloPagina = 'Operação';
  const corpo = blocoOperacao({
    operacao,
    dataIso,
    kpisOperacao: opts.kpisOperacao,
    placasReserva: opts.placasReserva,
    capacidade: opts.capacidade,
    eficienciaOpts: {
      volumeL: opts.volumeL,
      densidadeResiduoKgL: opts.densidadeResiduoKgL,
      densidadeKgL: opts.densidadeKgL,
    },
  });
  const resumo = operacao.resumo;
  const footerExtra = `${fmtNum(resumo.viagens, 0)} viagem${resumo.viagens !== 1 ? 's' : ''}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>${esc(tituloPagina)} — ${esc(formatarIsoParaBr(dataIso))}</title>
  <!-- relatorio-dia-operacao:${esc(dataIso)}:${stamp} -->
  <style>${ESTILOS}</style>
</head>
<body>
  <div class="header">
    <h1>${esc(servicoNome)}</h1>
    <div class="sub">${esc(formatarIsoParaBr(dataIso))} · ${esc(diaSemana)}</div>
    <div class="tipo op">${esc(tituloAba)}</div>
    <div class="sub" style="margin-top:4px">Gerado ${dataGeracao} às ${horaGeracao}</div>
  </div>
  ${corpo}
  <div class="footer">
    Sistemma · ${esc(tituloAba)} · ${footerExtra} · ${esc(formatarIsoParaBr(dataIso))}
  </div>
</body>
</html>`;
}
