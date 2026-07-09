import type { KpiValor } from '../hooks/useKpiCalculator';
import { formatarIsoParaBr } from './periodoDados';
import type { RegistroDiaLinha } from './dadosPorDia';
import type { OperacaoDiaAnalise, LinhaOperacaoGrupo, InsightOperacao, LinhaEficienciaPlaca } from './operacaoDia';
import { gerarInsightsOperacao, montarEficienciaPlacas } from './operacaoDia';
import type { ReceitaDiaAnalise, LinhaReceitaGrupo } from './receitaDia';
import type { EstudoRotasDia, GargaloRota, LinhaEstudoRota } from './estudoRotasDia';
import { fmtMoeda, fmtNum } from './relatorioDiario';
import { resumirFrotaOperacao } from './placasReserva';

export type AbaRelatorioDia = 'operacao' | 'receita';

const PALETA_PIZZA = ['#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ef4444', '#06b6d4'];

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
  .header .tipo.rec { color: #6ee7b7; background: rgba(16,185,129,0.2); }
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
  .footer { text-align: center; font-size: 6px; color: #94a3b8; margin-top: 10px; padding-top: 8px; border-top: 1px solid #e2e8f0; }
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
  const map = { bom: ['st-bom', 'OK'], medio: ['st-medio', 'Atenção'], ruim: ['st-ruim', 'Gargalo'] };
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

function graficoBarrasHorizontaisOpHtml(titulo: string, linhas: LinhaOperacaoGrupo[], cor: string, campo: 'viagens' | 'toneladas' = 'viagens'): string {
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

function graficoOperacaoPlacaHtml(linhas: LinhaEficienciaPlaca[], mediaTonViag: number): string {
  if (!linhas.length) return '';

  const maxVal = Math.max(...linhas.map((l) => l.toneladas), 0.01);
  const totalTon = linhas.reduce((s, l) => s + l.toneladas, 0);

  return `
    <div class="bloco">
      <div class="sec">Ranking de produção por veículo</div>
      <table class="bloco-hd-tbl">
        <tr>
          <td>Toneladas por placa (vs média ${fmtNum(mediaTonViag, 2)} t/viag)</td>
          <td class="r"><span class="badge" style="color:#1d4ed8;background:#dbeafe">Total: ${fmtNum(totalTon, 1)} t</span></td>
        </tr>
      </table>
      ${linhas.map((l) => {
        const barW = Math.max(4, Math.round((l.toneladas / maxVal) * 100));
        const pctTon = totalTon > 0 ? (l.toneladas / totalTon) * 100 : 0;
        const lbl = l.chave.length > 9 ? l.chave.slice(0, 9) + '…' : l.chave;
        const detalhe = `${fmtNum(l.viagens, 0)} viag. · ${fmtNum(l.tonMediaViagem, 2)} t/viag · ${fmtNum(l.tonHora, 2)} t/h`;
        return `
          <div class="bar-row">
            <div class="bar-lbl">${placaComReservaHtml(lbl, l.ehReserva)} ${statusBadge(l.status)}</div>
            <div class="bar-track"><span class="bar-fill ${l.status}" style="width:${barW}%"></span></div>
            <div class="bar-val op">${fmtNum(l.toneladas, 1)} t</div>
          </div>
          <div class="bar-detail">${detalhe} · ${fmtNum(pctTon, 1)}% do volume · ${fmtNum(l.pctMediaTonViag, 0)}% da média</div>`;
      }).join('')}
    </div>`;
}

function tabelaEficienciaPlacaHtml(linhas: LinhaEficienciaPlaca[], mediaTonViag: number): string {
  if (!linhas.length) return '';
  return `
    <div class="bloco">
      <div class="bloco-hd">Quadro de eficiência — onde agir primeiro</div>
      <table class="data">
        <colgroup>
          <col style="width:16%"/><col style="width:8%"/><col style="width:12%"/>
          <col style="width:12%"/><col style="width:10%"/><col style="width:10%"/>
          <col style="width:10%"/><col style="width:12%"/><col style="width:10%"/>
        </colgroup>
        <thead><tr>
          <th>Placa</th><th class="c">Viag.</th><th class="r">Ton</th>
          <th class="r op-h">t/viag</th><th class="r">KM/viag</th><th class="r">t/h</th>
          <th class="r">% média</th><th class="c">Status</th><th class="r">Prioridade</th>
        </tr></thead>
        <tbody>${linhas.map((l, i) => {
          const prioridade = l.status === 'ruim' ? 1 : l.status === 'medio' ? 2 : 3;
          return `
          <tr style="background:${i % 2 === 0 ? '#f8fafc' : '#fff'}">
            <td style="font-weight:700">${placaComReservaHtml(l.chave, l.ehReserva)}</td>
            <td class="c">${fmtNum(l.viagens, 0)}</td>
            <td class="r nowrap">${fmtNum(l.toneladas, 1)} t</td>
            <td class="r nowrap" style="font-weight:700;color:${l.status === 'ruim' ? '#991b1b' : l.status === 'medio' ? '#92400e' : '#166534'}">${fmtNum(l.tonMediaViagem, 2)}</td>
            <td class="r nowrap">${fmtNum(l.kmMedioViagem, 1)}</td>
            <td class="r nowrap">${fmtNum(l.tonHora, 2)}</td>
            <td class="r nowrap">${fmtNum(l.pctMediaTonViag, 0)}%</td>
            <td class="c">${statusBadge(l.status)}</td>
            <td class="r nowrap" style="font-weight:700;color:${prioridade === 1 ? '#ef4444' : prioridade === 2 ? '#f59e0b' : '#64748b'}">P${prioridade}</td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>
      <div style="font-size:6px;color:#94a3b8;margin-top:4px">Referência t/viag do dia: ${fmtNum(mediaTonViag, 2)} t · P1 = ação imediata · P2 = monitorar · P3 = dentro da média</div>
    </div>`;
}

function tabelaGrupoEficienciaHtml(titulo: string, linhas: LinhaOperacaoGrupo[], mediaTonViag: number): string {
  const lista = linhas.filter((l) => l.chave && l.chave !== '—' && l.viagens > 0);
  if (!lista.length) return '';

  const ordenada = [...lista].sort((a, b) => a.tonMediaViagem - b.tonMediaViagem);

  return `
    <div class="bloco">
      <div class="bloco-hd">${esc(titulo)}</div>
      <table class="data">
        <thead><tr>
          <th>Grupo</th><th class="c">Viag.</th><th class="r">Ton</th>
          <th class="r op-h">t/viag</th><th class="c">vs média</th>
        </tr></thead>
        <tbody>${ordenada.map((l, i) => {
          const pct = mediaTonViag > 0 ? (l.tonMediaViagem / mediaTonViag) * 100 : 100;
          const st = statusVsMediaPdf(pct);
          return `
          <tr style="background:${i % 2 === 0 ? '#f8fafc' : '#fff'}">
            <td style="font-weight:600">${esc(l.chave)}</td>
            <td class="c">${fmtNum(l.viagens, 0)}</td>
            <td class="r nowrap">${fmtNum(l.toneladas, 1)} t</td>
            <td class="r nowrap" style="font-weight:700">${fmtNum(l.tonMediaViagem, 2)}</td>
            <td class="c">${statusBadge(st)}</td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>`;
}

function statusVsMediaPdf(pct: number): 'bom' | 'medio' | 'ruim' {
  if (pct >= 90) return 'bom';
  if (pct >= 75) return 'medio';
  return 'ruim';
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

function kpisHtml(kpis: KpiValor[], titulo: string) {
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

function statusRotaHtml(status: LinhaEstudoRota['status']): string {
  if (status === 'bom') return '<span class="st-bom">OK</span>';
  if (status === 'medio') return '<span class="st-medio">Atenção</span>';
  return '<span class="st-ruim">Gargalo</span>';
}

function gargalosRotaHtml(gargalos: GargaloRota[]): string {
  if (!gargalos.length) return '';
  return `
  <div class="bloco">
    <div class="bloco-hd">Gargalos por rota</div>
    ${gargalos.map((g) => {
      const cls = g.severidade === 'critico' ? 'insight-critico'
        : g.severidade === 'atencao' ? 'insight-atencao' : 'insight-info';
      const rotaTxt = g.rota && g.rota !== '—'
        ? `<span class="gargalo-rota">${esc(g.rota)}</span> — `
        : '';
      return `
      <div class="insight-item ${cls}">
        <div class="insight-tit">${rotaTxt}${esc(g.titulo)}</div>
        <div>${esc(g.texto)}</div>
      </div>`;
    }).join('')}
  </div>`;
}

function tabelaEstudoRotasHtml(estudo: EstudoRotasDia): string {
  const lista = estudo.rotas.slice(0, 25);
  if (!lista.length) return '';
  const maxTon = Math.max(...lista.map((r) => r.toneladas), 0.001);

  return `
  <div class="bloco">
    <div class="bloco-hd">Detalhamento por rota (dados da planilha)</div>
    <table class="data">
      <colgroup>
        <col style="width:14%"/><col style="width:7%"/><col style="width:7%"/>
        <col style="width:9%"/><col style="width:8%"/><col style="width:9%"/>
        <col style="width:8%"/><col style="width:9%"/><col style="width:9%"/>
        <col style="width:10%"/><col style="width:10%"/>
      </colgroup>
      <thead><tr>
        <th>Rota</th>
        <th class="c">Linhas</th>
        <th class="c">Viag.</th>
        <th class="r">Ton</th>
        <th class="r">% dia</th>
        <th class="r op-h">t/viag</th>
        <th class="r">km/viag</th>
        <th class="r">t/h</th>
        <th class="r">Peso min–máx</th>
        <th>Placas</th>
        <th class="c">Status</th>
      </tr></thead>
      <tbody>
        ${lista.map((r, i) => {
          const barW = Math.max(4, (r.toneladas / maxTon) * 100);
          const pesoTxt = r.pesoMinKg != null && r.pesoMaxKg != null
            ? `${fmtNum(r.pesoMinKg, 0)}–${fmtNum(r.pesoMaxKg, 0)}`
            : '—';
          const placasTxt = r.placas.length
            ? (r.placas.length <= 2 ? r.placas.join(', ') : `${r.placas.slice(0, 2).join(', ')}+${r.placas.length - 2}`)
            : '—';
          return `
          <tr style="background:${i % 2 === 0 ? '#f8fafc' : '#fff'}">
            <td style="font-weight:700">${esc(r.rota)}</td>
            <td class="c">${fmtNum(r.registros, 0)}</td>
            <td class="c">${fmtNum(r.viagens, 0)}</td>
            <td class="r nowrap">
              ${fmtNum(r.toneladas, 1)} t
              <span class="bar-mini" style="width:${barW}%;background:#6366f1"></span>
            </td>
            <td class="r nowrap" style="color:#64748b">${fmtNum(r.pctTonDia, 1)}%</td>
            <td class="r nowrap" style="font-weight:700">${fmtNum(r.tonMediaViagem, 2)}</td>
            <td class="r nowrap">${fmtNum(r.kmMedioViagem, 1)}</td>
            <td class="r nowrap">${fmtNum(r.tonHora, 2)}</td>
            <td class="r nowrap" style="font-size:6px">${pesoTxt}</td>
            <td style="font-size:6px">${esc(placasTxt)}</td>
            <td class="c">${statusRotaHtml(r.status)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    ${estudo.rotas.length > 25
      ? `<div class="estudo-nota" style="margin-top:4px">Exibindo as 25 rotas de maior volume (total: ${estudo.rotas.length}).</div>`
      : ''}
  </div>`;
}

function blocoEstudoRotasHtml(estudo: EstudoRotasDia | null | undefined): string {
  if (!estudo || estudo.rotas.length === 0) return '';

  const m = estudo.mediaDia;
  const d = estudo.destaques;

  return `
  <div class="sec">Estudo de rotas do dia</div>
  <p class="estudo-nota">
    Agrupamento pela coluna <strong>${esc(estudo.colunaRota)}</strong> da planilha.
    Cada linha = 1 rota; viagens = CONTADOR DE VIAGENS / PESO 1–4.
    Médias e gargalos comparados à média do dia.
  </p>

  ${cardsHtml([
    { label: 'Rotas ativas', valor: fmtNum(m.rotasAtivas, 0), cor: '#6366f1' },
    { label: 'Média t/viagem (dia)', valor: `${fmtNum(m.tonMediaViagem, 2)} t`, cor: '#16a34a' },
    { label: 'Média km/viagem (dia)', valor: `${fmtNum(m.kmMedioViagem, 1)} km`, cor: '#d97706' },
    { label: 'Média t/h (dia)', valor: `${fmtNum(m.tonHora, 2)} t/h`, cor: '#7c3aed' },
    { label: 'Viagens / rota', valor: fmtNum(m.viagensPorRota, 1), cor: '#0891b2' },
    { label: 'Toneladas (rotas)', valor: `${fmtNum(m.toneladas, 1)} t`, cor: '#22c55e' },
  ])}

  <table class="destaques-tbl">
    <tr>
      <td class="destaque">
        <div class="dest-tit">Maior volume</div>
        <div class="dest-val">${d.maiorVolume ? `${fmtNum(d.maiorVolume.toneladas, 1)} t` : '—'}</div>
        <div class="dest-sub">${esc(d.maiorVolume?.rota || '—')}</div>
      </td>
      <td class="destaque">
        <div class="dest-tit">Menor rendimento</div>
        <div class="dest-val">${d.menorRendimento ? `${fmtNum(d.menorRendimento.tonMediaViagem, 2)} t/v` : '—'}</div>
        <div class="dest-sub">${esc(d.menorRendimento?.rota || '—')}</div>
      </td>
      <td class="destaque">
        <div class="dest-tit">Maior KM/viagem</div>
        <div class="dest-val">${d.maiorKm ? `${fmtNum(d.maiorKm.kmMedioViagem, 1)} km` : '—'}</div>
        <div class="dest-sub">${esc(d.maiorKm?.rota || '—')}</div>
      </td>
      <td class="destaque">
        <div class="dest-tit">Menor peso viagem</div>
        <div class="dest-val">${d.menorPesoViagem ? fmtNum(d.menorPesoViagem.pesoKg, 0) : '—'}</div>
        <div class="dest-sub">${esc(d.menorPesoViagem?.rota || '—')}</div>
      </td>
      <td class="destaque">
        <div class="dest-tit">Maior peso viagem</div>
        <div class="dest-val">${d.maiorPesoViagem ? fmtNum(d.maiorPesoViagem.pesoKg, 0) : '—'}</div>
        <div class="dest-sub">${esc(d.maiorPesoViagem?.rota || '—')}</div>
      </td>
    </tr>
  </table>

  ${gargalosRotaHtml(estudo.gargalos)}
  ${tabelaEstudoRotasHtml(estudo)}`;
}

function blocoOperacao(opts: {
  operacao: OperacaoDiaAnalise;
  dataIso: string;
  kpisOperacao?: KpiValor[];
  placasReserva?: string[];
  estudoRotas?: EstudoRotasDia | null;
}): string {
  const op = opts.operacao.resumo;
  const insights = gerarInsightsOperacao(opts.operacao, opts.placasReserva);
  const eficiencia = montarEficienciaPlacas(opts.operacao, opts.placasReserva);
  const mediaTonViag = op.tonMediaColeta;
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
  const temTipo = opts.operacao.porTipoCaminhao.some((l) => l.viagens > 0);

  return `
  <div class="banner op">
    <strong>${fmtNum(op.viagens, 0)} viagem${op.viagens !== 1 ? 's' : ''}</strong>
    em ${esc(formatarIsoParaBr(opts.dataIso))}
    · ${opts.operacao.registrosConsiderados} registro${opts.operacao.registrosConsiderados !== 1 ? 's' : ''}
    · ${op.caminhoes ?? op.coletores} caminhão${(op.caminhoes ?? op.coletores) !== 1 ? 'es' : ''}${frotaReservaTxt}
  </div>

  ${heroOperacaoHtml(op)}
  ${insightsHtml(insights)}

  ${blocoEstudoRotasHtml(opts.estudoRotas)}

  <div class="sec">Onde está o volume do dia</div>
  <table class="chart-tbl">
    <tr>
      <td colspan="2">${temTipo ? graficoPizzaTipoOpHtml(opts.operacao.porTipoCaminhao, op.viagens) : ''}</td>
    </tr>
    ${temTurno || temRegional ? `
    <tr>
      <td style="width:50%;vertical-align:top">${temTurno ? graficoBarrasHorizontaisOpHtml('Viagens por turno', opts.operacao.porTurno, '#7c3aed') : ''}</td>
      <td style="width:50%;vertical-align:top">${temRegional ? graficoBarrasHorizontaisOpHtml('Viagens por regional', opts.operacao.porRegional, '#0891b2') : ''}</td>
    </tr>` : ''}
  </table>

  ${graficoOperacaoPlacaHtml(eficiencia, mediaTonViag)}
  ${tabelaEficienciaPlacaHtml(eficiencia, mediaTonViag)}

  <div class="sec">Comparativo por dimensão</div>
  <table class="layout2-tbl">
    <tr>
      <td>${temTurno ? tabelaGrupoEficienciaHtml('Turno — eficiência', opts.operacao.porTurno, mediaTonViag) : ''}</td>
      <td>${temRegional ? tabelaGrupoEficienciaHtml('Regional — eficiência', opts.operacao.porRegional, mediaTonViag) : ''}</td>
    </tr>
    ${temMotorista ? `
    <tr>
      <td colspan="2">${tabelaGrupoEficienciaHtml('Motorista — eficiência', opts.operacao.porMotorista, mediaTonViag)}</td>
    </tr>` : ''}
  </table>

  ${kpisHtml(opts.kpisOperacao || [], 'Indicadores complementares')}`;
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
  geradoEm?: Date;
}): string {
  const { aba, servicoNome, dataIso, diaSemana, operacao, receita, linhas = [] } = opts;
  const gerado = opts.geradoEm ?? new Date();
  const stamp = gerado.getTime();
  const dataGeracao = gerado.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  const horaGeracao = gerado.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const ehReceita = aba === 'receita';
  const tituloAba = ehReceita ? 'Relatório de Receita do dia' : 'Relatório de Operação do dia';
  const tituloPagina = ehReceita ? 'Receita' : 'Operação';
  const classeTipo = ehReceita ? 'rec' : 'op';

  const corpo = ehReceita
    ? blocoReceita({ receita: receita!, dataIso })
    : blocoOperacao({
      operacao,
      dataIso,
      kpisOperacao: opts.kpisOperacao,
      placasReserva: opts.placasReserva,
      estudoRotas: opts.estudoRotas,
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
  <div class="header">
    <h1>${esc(servicoNome)}</h1>
    <div class="sub">${esc(formatarIsoParaBr(dataIso))} · ${esc(diaSemana)}</div>
    <div class="tipo ${classeTipo}">${esc(tituloAba)}</div>
    <div class="sub" style="margin-top:4px">Gerado ${dataGeracao} às ${horaGeracao}</div>
  </div>
  ${corpo}
  <div class="footer">
    Sistemma · ${esc(tituloAba)} · ${footerExtra} · ${esc(formatarIsoParaBr(dataIso))}
  </div>
</body>
</html>`;
}
