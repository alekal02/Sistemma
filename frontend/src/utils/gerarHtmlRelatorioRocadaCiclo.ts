/**
 * HTML do PDF — relatório de ciclo de roçada (m²).
 */
import { formatarIsoParaBr } from './periodoDados';
import { fmtNum, type DadoDiario } from './relatorioDiario';
import {
  analisarRocadaDia,
  fmtAreaM2,
  type AnaliseRocadaDia,
  type LinhaRocadaAgrupada,
} from './operacaoRocada';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
    background: linear-gradient(135deg,#14532d,#166534);
    color: #fff;
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 8px;
    page-break-inside: avoid;
  }
  .header h1 { font-size: 13px; font-weight: 800; color: #bbf7d0; }
  .header .sub { font-size: 7px; color: #d1fae5; margin-top: 2px; }
  .header .tipo {
    display: inline-block; margin-top: 3px; font-size: 6.5px; font-weight: 700;
    padding: 2px 7px; border-radius: 4px; text-transform: uppercase;
    color: #ecfccb; background: rgba(255,255,255,0.15);
  }
  .banner {
    background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px;
    padding: 5px 8px; margin-bottom: 8px; font-size: 7px; color: #166534;
    page-break-inside: avoid;
  }
  .secao { margin-bottom: 10px; page-break-inside: avoid; }
  .sec {
    font-size: 6.5px; font-weight: 800; color: #64748b;
    text-transform: uppercase; margin: 0 0 4px; letter-spacing: 0.03em;
  }
  .hero-dark {
    background: linear-gradient(135deg,#14532d,#052e16);
    border: 1px solid #166534; border-radius: 8px;
    padding: 8px 10px; color: #fff; margin-bottom: 8px;
  }
  .hero-dark .lbl { font-size: 6px; font-weight: 600; color: #86efac; text-transform: uppercase; }
  .hero-dark .val { font-size: 18px; font-weight: 900; color: #bbf7d0; font-family: monospace; white-space: nowrap; }
  .hero-dark .sub { font-size: 6.5px; color: #a7f3d0; margin-top: 2px; }
  .cards-tbl { width: 100%; border-collapse: separate; border-spacing: 4px; margin-bottom: 8px; }
  .card {
    background: #fff; border: 1px solid #e2e8f0; border-top: 3px solid #22c55e;
    border-radius: 5px; padding: 4px 5px; vertical-align: top;
  }
  .card-lbl { font-size: 5.5px; font-weight: 700; color: #64748b; text-transform: uppercase; }
  .card-val { font-size: 8px; font-weight: 800; color: #0f172a; white-space: nowrap; margin-top: 1px; }
  .bloco {
    background: #fff; border: 1px solid #e2e8f0; border-radius: 6px;
    padding: 6px 7px; page-break-inside: avoid; margin-bottom: 8px;
  }
  .bloco-hd {
    font-size: 6.5px; font-weight: 800; color: #475569; text-transform: uppercase;
    margin-bottom: 4px; padding-bottom: 3px; border-bottom: 1px solid #e2e8f0;
  }
  table.data { width: 100%; border-collapse: collapse; font-size: 6.5px; table-layout: fixed; }
  table.data thead { display: table-header-group; }
  table.data th {
    padding: 3px 4px; background: #166534; color: #dcfce7;
    font-size: 5.5px; text-transform: uppercase; text-align: left; font-weight: 700;
  }
  table.data th.c, table.data td.c { text-align: center; }
  table.data th.r, table.data td.r { text-align: right; }
  table.data td { padding: 3px 4px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  table.data tr { page-break-inside: avoid; }
  table.data tbody tr:nth-child(even) td { background: #f8fafc; }
  .bar-mini { display: block; height: 5px; background: #e2e8f0; border-radius: 3px; overflow: hidden; margin-top: 2px; }
  .bar-mini span { display: block; height: 5px; border-radius: 3px; background: #22c55e; }
  .layout2-tbl { width: 100%; border-collapse: separate; border-spacing: 6px; }
  .layout2-tbl > tbody > tr > td { width: 50%; vertical-align: top; }
  .footer {
    text-align: center; font-size: 5.5px; color: #94a3b8;
    margin-top: 8px; padding-top: 6px; border-top: 1px solid #e2e8f0;
  }
  @media print {
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
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

function tabelaGrupoHtml(titulo: string, linhas: LinhaRocadaAgrupada[], maxArea: number): string {
  const top = linhas.filter((l) => l.areaM2 > 0).slice(0, 12);
  if (!top.length) return '';
  const max = Math.max(maxArea, 0.01);
  return `
    <div class="bloco">
      <div class="bloco-hd">${esc(titulo)}</div>
      <table class="data">
        <thead>
          <tr>
            <th style="width:42%">Nome</th>
            <th class="c" style="width:14%">Reg.</th>
            <th class="r" style="width:22%">Área (m²)</th>
            <th style="width:22%">Participação</th>
          </tr>
        </thead>
        <tbody>
          ${top.map((l) => {
            const pct = Math.max(3, Math.round((l.areaM2 / max) * 100));
            const part = maxArea > 0 ? (l.areaM2 / maxArea) * 100 : 0;
            return `
              <tr>
                <td>${esc(l.label.length > 28 ? `${l.label.slice(0, 28)}…` : l.label)}</td>
                <td class="c">${fmtNum(l.registros, 0)}</td>
                <td class="r">${fmtAreaM2(l.areaM2)}</td>
                <td>
                  ${fmtNum(part, 1)}%
                  <span class="bar-mini"><span style="width:${pct}%"></span></span>
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function tabelaDiasHtml(dias: DadoDiario[], areaTotal: number): string {
  const ativos = dias.filter((d) => (d.areaM2 || 0) > 0 || d.rotas > 0);
  if (!ativos.length) return '';
  const max = Math.max(...ativos.map((d) => d.areaM2 || 0), 0.01);
  return `
    <div class="bloco">
      <div class="bloco-hd">Área por dia do ciclo (${ativos.length} dia(s) com operação)</div>
      <table class="data">
        <thead>
          <tr>
            <th style="width:18%">Data</th>
            <th class="c" style="width:16%">Registros</th>
            <th class="r" style="width:28%">Área (m²)</th>
            <th style="width:38%">Participação no ciclo</th>
          </tr>
        </thead>
        <tbody>
          ${ativos.map((d) => {
            const area = d.areaM2 || 0;
            const pctBar = Math.max(3, Math.round((area / max) * 100));
            const part = areaTotal > 0 ? (area / areaTotal) * 100 : 0;
            return `
              <tr>
                <td>${esc(formatarIsoParaBr(d.data))}</td>
                <td class="c">${fmtNum(d.rotas, 0)}</td>
                <td class="r">${fmtAreaM2(area)}</td>
                <td>
                  ${fmtNum(part, 1)}%
                  <span class="bar-mini"><span style="width:${pctBar}%"></span></span>
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

export interface ParamsRelatorioRocadaCiclo {
  servicoNome: string;
  contratoNome?: string;
  cicloLabel: string;
  dataInicio: string;
  dataFim: string;
  dias: DadoDiario[];
  diasComDados: number;
  totais: DadoDiario;
  analise: AnaliseRocadaDia;
  valorM2?: number | null;
}

export function gerarHtmlRelatorioRocadaCiclo(p: ParamsRelatorioRocadaCiclo): string {
  const areaTotal = p.totais.areaM2 || p.analise.resumo.areaM2 || 0;
  const mediaDia = p.diasComDados > 0 ? areaTotal / p.diasComDados : 0;
  const receita = p.valorM2 && p.valorM2 > 0 ? areaTotal * p.valorM2 : 0;
  const geradoEm = new Date().toLocaleString('pt-BR');

  const cards = cardsHtml([
    { label: 'Área total', valor: `${fmtAreaM2(areaTotal)} m²`, cor: '#22c55e' },
    { label: 'Registros', valor: fmtNum(p.totais.rotas || p.analise.resumo.registros, 0), cor: '#6366f1' },
    { label: 'Dias com operação', valor: String(p.diasComDados), cor: '#0ea5e9' },
    { label: 'Média m² / dia', valor: `${fmtAreaM2(mediaDia)} m²`, cor: '#8b5cf6' },
    { label: 'Bairros', valor: String(p.analise.resumo.bairros), cor: '#14b8a6' },
    { label: 'Operadores', valor: String(p.analise.resumo.operadores), cor: '#f59e0b' },
    { label: 'Equipes', valor: String(p.analise.resumo.equipes), cor: '#ef4444' },
    { label: 'Equipamentos', valor: String(p.analise.resumo.equipamentos), cor: '#64748b' },
    ...(receita > 0
      ? [{ label: 'Receita estimada', valor: receita.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), cor: '#059669' }]
      : []),
  ]);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Relatório Ciclo Roçada — ${esc(p.servicoNome)}</title>
  <style>${ESTILOS}</style>
</head>
<body>
  <div class="header">
    <h1>${esc(p.servicoNome)}</h1>
    <div class="sub">${p.contratoNome ? `${esc(p.contratoNome)} · ` : ''}Ciclo ${esc(p.cicloLabel)}</div>
    <div class="sub">${formatarIsoParaBr(p.dataInicio)} → ${formatarIsoParaBr(p.dataFim)}</div>
    <span class="tipo">Roçada · Relatório do ciclo</span>
  </div>

  <div class="banner">
    Relatório operacional de roçada com base na área (m²) importada da planilha.
    Linhas sem metragem não entram neste consolidado.
  </div>

  <div class="hero-dark">
    <div class="lbl">Área total roçada no ciclo</div>
    <div class="val">${fmtAreaM2(areaTotal)} m²</div>
    <div class="sub">
      ${fmtNum(p.totais.rotas || p.analise.resumo.registros, 0)} registro(s)
      · ${p.diasComDados} dia(s) com operação
      · ${p.analise.resumo.bairros} bairro(s)
      · ${p.analise.resumo.operadores} operador(es)
    </div>
  </div>

  <div class="secao">
    <div class="sec">Indicadores do ciclo</div>
    ${cards}
  </div>

  ${tabelaDiasHtml(p.dias, areaTotal)}

  <table class="layout2-tbl">
    <tr>
      <td>${tabelaGrupoHtml('Top bairros por área', p.analise.porBairro, areaTotal)}</td>
      <td>${tabelaGrupoHtml('Top operadores por área', p.analise.porOperador, areaTotal)}</td>
    </tr>
    <tr>
      <td>${tabelaGrupoHtml('Top equipes por área', p.analise.porEquipe, areaTotal)}</td>
      <td>${tabelaGrupoHtml('Top equipamentos por área', p.analise.porEquipamento, areaTotal)}</td>
    </tr>
  </table>

  <div class="footer">
    Sistemma · Relatório de ciclo de roçada · Gerado em ${esc(geradoEm)}
  </div>
</body>
</html>`;
}

/** Analisa registros do período (vários dias) com a mesma lógica do dia. */
export function analisarRocadaPeriodo(registros: Record<string, unknown>[]): AnaliseRocadaDia {
  return analisarRocadaDia(registros);
}
