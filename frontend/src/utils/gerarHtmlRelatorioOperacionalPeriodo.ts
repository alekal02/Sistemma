import { formatarIsoParaBr } from './periodoDados';
import type { PeriodoOperacional } from './periodoRelatorioOperacional';
import {
  gerarInsightsOperacao,
  montarEficienciaPlacas,
  type InsightOperacao,
  type LinhaOperacaoGrupo,
  type OperacaoDiaAnalise,
} from './operacaoDia';
import { fmtNum, type DadoDiario } from './relatorioDiario';
import { resumirFrotaOperacao } from './placasReserva';

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
  @page { size: A4 portrait; margin: 10mm 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 8px;
    color: #1e293b;
    line-height: 1.35;
    width: 100%;
  }
  .header {
    background: linear-gradient(135deg,#0f172a,#1e3a5f);
    color: #fff;
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 8px;
    page-break-inside: avoid;
  }
  .header h1 { font-size: 13px; font-weight: 800; color: #fbbf24; }
  .header .sub { font-size: 7px; color: #94a3b8; margin-top: 2px; }
  .header .tipo {
    display: inline-block; margin-top: 3px; font-size: 6.5px; font-weight: 700;
    padding: 2px 7px; border-radius: 4px; text-transform: uppercase;
    color: #a5b4fc; background: rgba(99,102,241,0.25);
  }
  .banner {
    background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 6px;
    padding: 5px 8px; margin-bottom: 8px; font-size: 7px; color: #4338ca;
    page-break-inside: avoid;
  }
  .secao { margin-bottom: 10px; }
  .secao-fixa { page-break-inside: avoid; margin-bottom: 10px; }
  .sec {
    font-size: 6.5px; font-weight: 800; color: #64748b;
    text-transform: uppercase; margin: 0 0 4px; letter-spacing: 0.03em;
  }
  .tbl-layout { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  .tbl-layout td { vertical-align: top; padding: 0; }
  .hero-dark {
    background: linear-gradient(135deg,#1e293b,#0f172a);
    border: 1px solid #334155; border-radius: 8px;
    padding: 8px 10px; color: #fff;
  }
  .hero-dark .lbl { font-size: 6px; font-weight: 600; color: #94a3b8; text-transform: uppercase; }
  .hero-dark .val { font-size: 20px; font-weight: 900; color: #a5b4fc; font-family: monospace; white-space: nowrap; }
  .hero-dark .sub { font-size: 6.5px; color: #64748b; margin-top: 2px; }
  .mini-tbl { width: 100%; border-collapse: separate; border-spacing: 3px; }
  .mini-dark { background: rgba(255,255,255,0.08); border-radius: 4px; padding: 4px 5px; }
  .mini-dark .lbl { font-size: 5.5px; color: #94a3b8; text-transform: uppercase; }
  .mini-dark .val { font-size: 7px; font-weight: 700; color: #e2e8f0; font-family: monospace; white-space: nowrap; }
  .cards-tbl { width: 100%; border-collapse: separate; border-spacing: 4px; margin-bottom: 0; }
  .card {
    background: #fff; border: 1px solid #e2e8f0; border-top: 3px solid #3b82f6;
    border-radius: 5px; padding: 4px 5px; vertical-align: top;
  }
  .card-lbl { font-size: 5.5px; font-weight: 700; color: #64748b; text-transform: uppercase; }
  .card-val { font-size: 8px; font-weight: 800; color: #0f172a; white-space: nowrap; margin-top: 1px; }
  .destaques-tbl { width: 100%; border-collapse: separate; border-spacing: 5px; margin-bottom: 6px; }
  .destaque {
    background: #fff; border: 1px solid #e2e8f0; border-radius: 6px;
    padding: 5px 6px; text-align: center; vertical-align: top;
  }
  .dest-tit { font-size: 5.5px; font-weight: 700; color: #64748b; text-transform: uppercase; }
  .dest-val { font-size: 10px; font-weight: 800; color: #0f172a; margin: 2px 0; }
  .dest-sub { font-size: 6px; color: #94a3b8; }
  .insight-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px; background: #fff; }
  .insight-item { padding: 3px 5px; margin-bottom: 3px; border-radius: 4px; font-size: 6.5px; line-height: 1.35; page-break-inside: avoid; }
  .insight-item:last-child { margin-bottom: 0; }
  .insight-critico { background: #fef2f2; border-left: 3px solid #ef4444; color: #991b1b; }
  .insight-atencao { background: #fffbeb; border-left: 3px solid #f59e0b; color: #92400e; }
  .insight-info { background: #f0fdf4; border-left: 3px solid #22c55e; color: #166534; }
  .insight-tit { font-weight: 800; font-size: 6.5px; margin-bottom: 1px; }
  .bloco {
    background: #fff; border: 1px solid #e2e8f0; border-radius: 6px;
    padding: 6px 7px; page-break-inside: avoid;
  }
  .bloco-hd {
    font-size: 6.5px; font-weight: 800; color: #475569; text-transform: uppercase;
    margin-bottom: 4px; padding-bottom: 3px; border-bottom: 1px solid #e2e8f0;
  }
  .badge { font-size: 6px; font-weight: 700; color: #0891b2; background: #cffafe; padding: 2px 5px; border-radius: 3px; white-space: nowrap; }
  table.data { width: 100%; border-collapse: collapse; font-size: 6.5px; table-layout: fixed; }
  table.data thead { display: table-header-group; }
  table.data th {
    padding: 3px 4px; background: #4338ca; color: #e0e7ff;
    font-size: 5.5px; text-transform: uppercase; text-align: left; font-weight: 700;
  }
  table.data th.c, table.data td.c { text-align: center; }
  table.data th.r, table.data td.r { text-align: right; }
  table.data td { padding: 3px 4px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; word-wrap: break-word; }
  table.data tr { page-break-inside: avoid; }
  table.data tbody tr:nth-child(even) td { background: #f8fafc; }
  .bar-cell { padding: 2px 4px !important; }
  .bar-mini { display: block; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; margin-top: 2px; }
  .bar-mini span { display: block; height: 6px; border-radius: 3px; }
  .bar-mini.km span { background: #0891b2; }
  .bar-mini.ton span { background: #16a34a; }
  .bar-mini.vg span { background: #7c3aed; }
  .layout2-tbl { width: 100%; border-collapse: separate; border-spacing: 6px; }
  .layout2-tbl > tbody > tr > td { width: 50%; vertical-align: top; }
  .bar-tbl { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 2px; }
  .bar-tbl td { padding: 1px 2px; vertical-align: middle; font-size: 6.5px; }
  .bar-tbl .lbl { width: 28%; font-weight: 700; color: #334155; }
  .bar-tbl .track { width: 52%; }
  .bar-tbl .track div { height: 7px; background: #e2e8f0; border-radius: 3px; overflow: hidden; }
  .bar-tbl .track span { display: block; height: 7px; border-radius: 3px; }
  .bar-tbl .val { width: 20%; text-align: right; font-weight: 700; font-family: monospace; white-space: nowrap; }
  .r { text-align: right; }
  .nowrap { white-space: nowrap; }
  .footer {
    text-align: center; font-size: 5.5px; color: #94a3b8;
    margin-top: 8px; padding-top: 6px; border-top: 1px solid #e2e8f0;
    page-break-inside: avoid;
  }
  .page-break { page-break-before: always; }
  @media print {
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { padding: 0; }
  }
`;

function cardsHtml(items: { label: string; valor: string; cor: string }[]): string {
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += 3) {
    const chunk = items.slice(i, i + 3);
    const cells = chunk.map((c) => `
      <td class="card" style="border-top-color:${c.cor};width:33.33%">
        <div class="card-lbl">${esc(c.label)}</div>
        <div class="card-val">${c.valor}</div>
      </td>`).join('');
    const fill = chunk.length < 3
      ? Array.from({ length: 3 - chunk.length }, () => '<td style="width:33.33%"></td>').join('')
      : '';
    rows.push(`<tr>${cells}${fill}</tr>`);
  }
  return `<table class="cards-tbl">${rows.join('')}</table>`;
}

function heroResumoHtml(op: OperacaoDiaAnalise['resumo']): string {
  const tonH = op.horas > 0 ? op.toneladas / op.horas : 0;
  const kmH = op.horas > 0 ? op.km / op.horas : 0;
  return `
  <table class="tbl-layout">
    <tr>
      <td style="width:55%;padding-right:8px">
        <div class="hero-dark">
          <div class="lbl">Total de viagens no período</div>
          <div class="val">${fmtNum(op.viagens, 0)}</div>
          <div class="sub">${fmtNum(op.toneladas, 1)} t · ${fmtNum(op.km, 0)} km · ${fmtNum(op.horas, 1)} h · ${op.coletores} veíc. · ${op.motoristas} mot.</div>
        </div>
      </td>
      <td style="width:45%">
        <div class="hero-dark" style="padding:6px">
          <table class="mini-tbl">
            <tr>
              <td class="mini-dark"><div class="lbl">Ton./viagem</div><div class="val">${fmtNum(op.tonMediaColeta, 2)} t</div></td>
              <td class="mini-dark"><div class="lbl">KM/viagem</div><div class="val">${fmtNum(op.kmMedioViagem, 1)} km</div></td>
            </tr>
            <tr>
              <td class="mini-dark"><div class="lbl">Ton./hora</div><div class="val">${fmtNum(tonH, 2)} t/h</div></td>
              <td class="mini-dark"><div class="lbl">KM/hora</div><div class="val">${fmtNum(kmH, 1)} km/h</div></td>
            </tr>
          </table>
        </div>
      </td>
    </tr>
  </table>`;
}

function insightsHtml(insights: InsightOperacao[]): string {
  if (!insights.length) return '';
  const clsMap = { critico: 'insight-critico', atencao: 'insight-atencao', info: 'insight-info' };
  return `
    <div class="secao-fixa">
      <div class="sec">Gargalos e pontos de atenção</div>
      <div class="insight-box">
        ${insights.slice(0, 5).map((i) => `
          <div class="insight-item ${clsMap[i.severidade]}">
            <div class="insight-tit">${esc(i.titulo)}</div>
            <div>${esc(i.texto)}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

function barraTabelaHtml(linhas: LinhaOperacaoGrupo[], campo: 'viagens' | 'km' | 'toneladas', cor: string): string {
  const lista = linhas.filter((l) => l.chave && l.chave !== '—' && l[campo] > 0).slice(0, 8);
  if (!lista.length) return '';
  const maxVal = Math.max(...lista.map((l) => l[campo]), 0.01);
  const fmt = campo === 'viagens'
    ? (v: number) => `${fmtNum(v, 0)}`
    : campo === 'km'
      ? (v: number) => `${fmtNum(v, 0)} km`
      : (v: number) => `${fmtNum(v, 1)} t`;

  return lista.map((l) => {
    const pct = Math.max(4, Math.round((l[campo] / maxVal) * 100));
    const lbl = l.chave.length > 14 ? l.chave.slice(0, 14) + '…' : l.chave;
    return `
      <table class="bar-tbl">
        <tr>
          <td class="lbl">${esc(lbl)}</td>
          <td class="track"><div><span style="width:${pct}%;background:${cor}"></span></div></td>
          <td class="val" style="color:${cor}">${fmt(l[campo])}</td>
        </tr>
      </table>`;
  }).join('');
}

function tabelaDistritoHtml(linhas: LinhaOperacaoGrupo[]): string {
  const lista = linhas
    .filter((l) => l.chave && l.chave !== '—' && (l.km > 0 || l.toneladas > 0))
    .sort((a, b) => b.km - a.km || b.toneladas - a.toneladas)
    .slice(0, 12);

  if (!lista.length) return '';

  const maxKm = Math.max(...lista.map((l) => l.km), 0.01);
  const maxTon = Math.max(...lista.map((l) => l.toneladas), 0.01);
  const totalKm = lista.reduce((s, l) => s + l.km, 0);
  const totalTon = lista.reduce((s, l) => s + l.toneladas, 0);

  const rows = lista.map((l) => {
    const pctKmBar = Math.max(4, Math.round((l.km / maxKm) * 100));
    const pctTonBar = Math.max(4, Math.round((l.toneladas / maxTon) * 100));
    const pctKm = totalKm > 0 ? (l.km / totalKm) * 100 : 0;
    const pctTon = totalTon > 0 ? (l.toneladas / totalTon) * 100 : 0;
    return `
      <tr>
        <td style="font-weight:700">${esc(l.chave)}</td>
        <td class="r nowrap">${fmtNum(l.km, 0)} km</td>
        <td class="bar-cell"><div class="bar-mini km"><span style="width:${pctKmBar}%"></span></div></td>
        <td class="r nowrap">${fmtNum(l.toneladas, 1)} t</td>
        <td class="bar-cell"><div class="bar-mini ton"><span style="width:${pctTonBar}%"></span></div></td>
        <td class="c">${fmtNum(l.viagens, 0)}</td>
        <td class="r nowrap">${fmtNum(pctKm, 1)}%</td>
        <td class="r nowrap">${fmtNum(pctTon, 1)}%</td>
      </tr>`;
  }).join('');

  return `
    <div class="secao">
      <div class="sec">KM e peso por distrito</div>
      <div class="bloco">
        <table class="tbl-layout" style="margin-bottom:5px">
          <tr>
            <td><span class="badge">${fmtNum(totalKm, 0)} km · ${fmtNum(totalTon, 1)} t no período</span></td>
          </tr>
        </table>
        <table class="data">
          <colgroup>
            <col style="width:18%"/><col style="width:11%"/><col style="width:14%"/>
            <col style="width:11%"/><col style="width:14%"/><col style="width:8%"/>
            <col style="width:12%"/><col style="width:12%"/>
          </colgroup>
          <thead><tr>
            <th>Distrito</th><th class="r">KM</th><th></th>
            <th class="r">Peso</th><th></th><th class="c">Viag.</th>
            <th class="r">% KM</th><th class="r">% Peso</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function periodoLongo(tipo: PeriodoOperacional['tipo']): boolean {
  return tipo === 'quinzenal' || tipo === 'ciclo';
}

function tabelaDiariaHtml(dias: DadoDiario[], diasComDados: number, tipo: PeriodoOperacional['tipo']): string {
  const ativos = dias.filter((d) => d.viagens > 0);
  if (!ativos.length) return '';

  const melhorVg = [...ativos].sort((a, b) => b.viagens - a.viagens)[0];
  const melhorTon = [...ativos].sort((a, b) => b.toneladas - a.toneladas)[0];
  const maxVg = Math.max(...ativos.map((d) => d.viagens), 1);

  const linhas = [...ativos]
    .sort((a, b) => b.data.localeCompare(a.data))
    .map((d) => {
      const barW = Math.max(4, Math.round((d.viagens / maxVg) * 100));
      return `
        <tr>
          <td style="font-weight:700;color:#4338ca">${esc(d.label)}</td>
          <td class="c nowrap">${fmtNum(d.viagens, 0)}</td>
          <td class="bar-cell"><div class="bar-mini vg"><span style="width:${barW}%"></span></div></td>
          <td class="r nowrap">${fmtNum(d.toneladas, 1)} t</td>
          <td class="r nowrap">${fmtNum(d.km, 0)} km</td>
          <td class="r nowrap">${fmtNum(d.horas, 1)} h</td>
          <td class="c">${fmtNum(d.coletores, 0)}</td>
        </tr>`;
    })
    .join('');

  const quebraPagina = periodoLongo(tipo) ? ' page-break' : '';

  return `
    <div class="secao${quebraPagina}">
      <div class="sec">Evolução diária</div>
      <table class="destaques-tbl">
        <tr>
          <td class="destaque">
            <div class="dest-tit">Melhor dia — viagens</div>
            <div class="dest-val">${fmtNum(melhorVg.viagens, 0)}</div>
            <div class="dest-sub">${esc(melhorVg.label)}</div>
          </td>
          <td class="destaque">
            <div class="dest-tit">Melhor dia — toneladas</div>
            <div class="dest-val">${fmtNum(melhorTon.toneladas, 1)} t</div>
            <div class="dest-sub">${esc(melhorTon.label)}</div>
          </td>
          <td class="destaque">
            <div class="dest-tit">Dias com operação</div>
            <div class="dest-val">${diasComDados}/${dias.length}</div>
            <div class="dest-sub">no período</div>
          </td>
        </tr>
      </table>
      <table class="data">
        <colgroup>
          <col style="width:14%"/><col style="width:10%"/><col style="width:14%"/>
          <col style="width:14%"/><col style="width:14%"/><col style="width:14%"/><col style="width:10%"/>
        </colgroup>
        <thead><tr>
          <th>Data</th><th class="c">Viagens</th><th></th>
          <th class="r">Toneladas</th><th class="r">KM</th><th class="r">Horas</th><th class="c">Veíc.</th>
        </tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>`;
}

function graficosDimHtml(operacao: OperacaoDiaAnalise, tipo: PeriodoOperacional['tipo']): string {
  const temTurno = operacao.porTurno.some((l) => l.chave !== '—' && l.viagens > 0);
  const temRegional = operacao.porRegional.some((l) => l.chave !== '—' && l.viagens > 0);
  const temDistrito = operacao.porDistrito.some((l) => l.chave !== '—' && (l.km > 0 || l.toneladas > 0));

  if (!temTurno && !temRegional && !temDistrito) return '';

  const distrito = temDistrito ? tabelaDistritoHtml(operacao.porDistrito) : '';

  const quebraTurnoReg = periodoLongo(tipo) && temDistrito ? ' page-break' : '';

  const turnoRegional = (temTurno || temRegional) ? `
    <div class="secao${quebraTurnoReg}">
      <table class="layout2-tbl">
        <tr>
          ${temTurno ? `
          <td>
            <div class="bloco">
              <div class="bloco-hd">Viagens por turno</div>
              ${barraTabelaHtml(operacao.porTurno, 'viagens', '#7c3aed')}
            </div>
          </td>` : '<td></td>'}
          ${temRegional ? `
          <td>
            <div class="bloco">
              <div class="bloco-hd">Viagens por regional</div>
              ${barraTabelaHtml(operacao.porRegional, 'viagens', '#6366f1')}
            </div>
          </td>` : '<td></td>'}
        </tr>
      </table>
    </div>` : '';

  return distrito + turnoRegional;
}

function tabelaPlacasHtml(
  operacao: OperacaoDiaAnalise,
  tipo: PeriodoOperacional['tipo'],
  placasReserva?: string[],
): string {
  const eficiencia = montarEficienciaPlacas(operacao, placasReserva).slice(0, 15);
  if (!eficiencia.length) return '';

  const quebra = periodoLongo(tipo) ? ' page-break' : '';

  return `
    <div class="secao${quebra}">
      <div class="sec">Ranking por veículo (período)</div>
      <table class="data">
        <colgroup>
          <col style="width:16%"/><col style="width:9%"/><col style="width:12%"/>
          <col style="width:12%"/><col style="width:12%"/><col style="width:12%"/>
        </colgroup>
        <thead><tr>
          <th>Placa</th><th class="c">Viag.</th><th class="r">Ton</th>
          <th class="r">t/viag</th><th class="r">KM</th><th class="r">t/h</th>
        </tr></thead>
        <tbody>${eficiencia.map((l) => `
          <tr>
            <td style="font-weight:700">${placaComReservaHtml(l.chave, l.ehReserva)}</td>
            <td class="c">${fmtNum(l.viagens, 0)}</td>
            <td class="r nowrap">${fmtNum(l.toneladas, 1)} t</td>
            <td class="r nowrap">${fmtNum(l.tonMediaViagem, 2)}</td>
            <td class="r nowrap">${fmtNum(l.km, 0)}</td>
            <td class="r nowrap">${fmtNum(l.tonHora, 2)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/** PDF operacional agregado — semana ou quinzena. */
export function gerarHtmlRelatorioOperacionalPeriodo(opts: {
  servicoNome: string;
  periodo: PeriodoOperacional;
  operacao: OperacaoDiaAnalise;
  dias: DadoDiario[];
  diasComDados: number;
  totais: DadoDiario;
  placasReserva?: string[];
  geradoEm?: Date;
}): string {
  const { servicoNome, periodo, operacao, dias, diasComDados, totais, placasReserva } = opts;
  const op = operacao.resumo;
  const gerado = opts.geradoEm ?? new Date();
  const dataGeracao = gerado.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  const horaGeracao = gerado.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const tituloTipo = periodo.tipo === 'semanal'
    ? 'Relatório Operacional Semanal'
    : periodo.tipo === 'quinzenal'
      ? 'Relatório Operacional Quinzenal'
      : 'Relatório Operacional do Ciclo Completo';
  const insights = gerarInsightsOperacao(operacao, placasReserva);
  const frota = resumirFrotaOperacao(
    operacao.porPlaca.filter((p) => p.chave !== '—').map((p) => p.chave),
    placasReserva,
  );
  const frotaReservaTxt = placasReserva?.length
    ? ` · ${frota.titulares} titular${frota.titulares !== 1 ? 'es' : ''}${frota.reserva > 0 ? ` + ${frota.reserva} reserva` : ''}`
    : '';

  const tonH = op.horas > 0 ? op.toneladas / op.horas : 0;
  const viagensMediaDia = diasComDados > 0 ? op.viagens / diasComDados : 0;
  const tonMediaDia = diasComDados > 0 ? op.toneladas / diasComDados : 0;

  const cards = cardsHtml([
    { label: 'Média viagens/dia', valor: fmtNum(viagensMediaDia, 1), cor: '#3b82f6' },
    { label: 'Média ton/dia', valor: `${fmtNum(tonMediaDia, 1)} t`, cor: '#22c55e' },
    { label: 'Ton./viagem', valor: `${fmtNum(op.tonMediaColeta, 2)} t`, cor: '#f59e0b' },
    { label: 'Ton./hora', valor: `${fmtNum(tonH, 2)} t/h`, cor: '#8b5cf6' },
    { label: 'KM/viagem', valor: `${fmtNum(op.kmMedioViagem, 1)} km`, cor: '#0891b2' },
    { label: 'Prod./veículo', valor: `${fmtNum(op.prodColetor, 2)} t`, cor: '#6366f1' },
  ]);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>${esc(tituloTipo)} — ${esc(servicoNome)}</title>
  <style>${ESTILOS}</style>
</head>
<body>
  <div class="secao-fixa">
    <div class="header">
      <h1>${esc(servicoNome)}</h1>
      <div class="sub">${esc(periodo.label)}</div>
      <div class="tipo">${esc(tituloTipo)}</div>
      <div class="sub" style="margin-top:3px">Gerado ${dataGeracao} às ${horaGeracao}</div>
    </div>

    <div class="banner">
      Período: <strong>${esc(formatarIsoParaBr(periodo.dataInicio))}</strong> a
      <strong>${esc(formatarIsoParaBr(periodo.dataFim))}</strong>
      · ${fmtNum(op.viagens, 0)} viagem${op.viagens !== 1 ? 's' : ''}
      · ${fmtNum(op.toneladas, 1)} t · ${fmtNum(op.km, 0)} km
      · ${op.caminhoes ?? op.coletores} veículo${(op.caminhoes ?? op.coletores) !== 1 ? 's' : ''}${frotaReservaTxt}
    </div>

    ${heroResumoHtml(op)}
    ${cards}
  </div>

  ${insightsHtml(insights)}
  ${tabelaDiariaHtml(dias, diasComDados, periodo.tipo)}
  ${graficosDimHtml(operacao, periodo.tipo)}
  ${tabelaPlacasHtml(operacao, periodo.tipo, placasReserva)}

  <div class="footer">
    Sistemma · ${esc(tituloTipo)} · ${fmtNum(totais.viagens, 0)} viagens · ${esc(periodo.label)}
  </div>
</body>
</html>`;
}
