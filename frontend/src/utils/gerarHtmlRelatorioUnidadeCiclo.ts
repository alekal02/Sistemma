/**
 * HTML do PDF — relatório de ciclo para serviços por unidade
 * (capina / varrição / poda / pintura).
 */
import { formatarIsoParaBr } from './periodoDados';
import { fmtNum, type DadoDiario } from './relatorioDiario';
import {
  formatarMetricaUnidade,
  unidadeOperacionalDoTipo,
} from './unidadeServico';

export interface ParamsRelatorioUnidadeCiclo {
  servicoNome: string;
  contratoNome?: string;
  tipoServico: string;
  cicloLabel?: string;
  dataInicio: string;
  dataFim: string;
  dias: DadoDiario[];
  diasComDados: number;
  totais: DadoDiario;
}

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
    background: linear-gradient(135deg,#0f766e,#115e59);
    color: #fff; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px;
  }
  .header h1 { font-size: 13px; font-weight: 800; color: #ccfbf1; }
  .header .sub { font-size: 7px; color: #99f6e4; margin-top: 2px; }
  .header .tipo {
    display: inline-block; margin-top: 3px; font-size: 6.5px; font-weight: 700;
    padding: 2px 7px; border-radius: 4px; text-transform: uppercase;
    color: #ecfeff; background: rgba(255,255,255,0.15);
  }
  .banner {
    background: #f0fdfa; border: 1px solid #5eead4; border-radius: 6px;
    padding: 5px 8px; margin-bottom: 8px; font-size: 7px; color: #115e59;
  }
  .hero-dark {
    background: linear-gradient(135deg,#0f766e,#134e4a);
    border: 1px solid #0f766e; border-radius: 8px;
    padding: 8px 10px; color: #fff; margin-bottom: 8px;
  }
  .hero-dark .lbl { font-size: 6px; font-weight: 600; color: #5eead4; text-transform: uppercase; }
  .hero-dark .val { font-size: 18px; font-weight: 900; color: #ccfbf1; font-family: monospace; }
  .hero-dark .sub { font-size: 6.5px; color: #99f6e4; margin-top: 2px; }
  .cards-tbl { width: 100%; border-collapse: separate; border-spacing: 4px; margin-bottom: 8px; }
  .card {
    background: #fff; border: 1px solid #e2e8f0; border-top: 3px solid #14b8a6;
    border-radius: 5px; padding: 4px 5px; vertical-align: top;
  }
  .card-lbl { font-size: 5.5px; font-weight: 700; color: #64748b; text-transform: uppercase; }
  .card-val { font-size: 8px; font-weight: 800; color: #0f172a; margin-top: 1px; }
  .sec {
    font-size: 6.5px; font-weight: 800; color: #64748b;
    text-transform: uppercase; margin: 0 0 4px; letter-spacing: 0.03em;
  }
  table.data { width: 100%; border-collapse: collapse; font-size: 6.5px; }
  table.data th {
    padding: 3px 4px; background: #0f766e; color: #ccfbf1;
    font-size: 5.5px; text-transform: uppercase; text-align: left; font-weight: 700;
  }
  table.data th.c, table.data td.c { text-align: center; }
  table.data th.r, table.data td.r { text-align: right; }
  table.data td { padding: 3px 4px; border-bottom: 1px solid #f1f5f9; }
  table.data tbody tr:nth-child(even) td { background: #f8fafc; }
  .bar-mini { display: block; height: 5px; background: #e2e8f0; border-radius: 3px; overflow: hidden; margin-top: 2px; }
  .bar-mini span { display: block; height: 5px; border-radius: 3px; background: #14b8a6; }
  .footer {
    text-align: center; font-size: 5.5px; color: #94a3b8;
    margin-top: 8px; padding-top: 6px; border-top: 1px solid #e2e8f0;
  }

  /* Paginação: nenhum bloco de dados pode ser cortado ao meio pela quebra de página */
  .card, .hero-dark, .banner { break-inside: avoid; page-break-inside: avoid; }
  .sec { break-after: avoid; page-break-after: avoid; }
  table.data tr { break-inside: avoid; page-break-inside: avoid; }
  table.data thead { display: table-header-group; }
  table.data tbody { break-before: avoid; page-break-before: avoid; }

  @media print {
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
`;

function labelTipo(tipo: string): string {
  switch (tipo) {
    case 'capina': return 'Capina';
    case 'varricao': return 'Varrição';
    case 'poda': return 'Poda';
    case 'pintura_meio_fio': return 'Pintura';
    default: return unidadeOperacionalDoTipo(tipo).labelMetrica;
  }
}

export function gerarHtmlRelatorioUnidadeCiclo(p: ParamsRelatorioUnidadeCiclo): string {
  const unidade = unidadeOperacionalDoTipo(p.tipoServico);
  const tipoLabel = labelTipo(p.tipoServico);
  const geradoEm = new Date().toLocaleString('pt-BR');
  const metricaTotal = Number(p.totais.metricaUnidade || 0);
  const sufixo = p.totais.metricaSufixo || unidade.sufixo;
  const labelMetrica = p.totais.metricaLabel || unidade.labelMetrica;
  const diasCom = p.dias.filter((d) => (d.metricaUnidade || 0) > 0 || d.rotas > 0);
  const maxDia = Math.max(...diasCom.map((d) => Number(d.metricaUnidade || 0)), 0.01);

  const cards = `
    <table class="cards-tbl">
      <tr>
        <td class="card" style="border-top-color:#14b8a6;width:25%">
          <div class="card-lbl">${esc(labelMetrica)} total</div>
          <div class="card-val">${esc(formatarMetricaUnidade(metricaTotal, sufixo))}</div>
        </td>
        <td class="card" style="border-top-color:#6366f1;width:25%">
          <div class="card-lbl">Registros</div>
          <div class="card-val">${fmtNum(p.totais.rotas || 0, 0)}</div>
        </td>
        <td class="card" style="border-top-color:#0ea5e9;width:25%">
          <div class="card-lbl">Dias do ciclo</div>
          <div class="card-val">${fmtNum(p.dias.length, 0)}</div>
        </td>
        <td class="card" style="border-top-color:#f59e0b;width:25%">
          <div class="card-lbl">Média / dia do ciclo</div>
          <div class="card-val">${esc(formatarMetricaUnidade(
            p.dias.length > 0 ? metricaTotal / p.dias.length : 0,
            sufixo,
          ))}</div>
        </td>
      </tr>
    </table>`;

  const tabelaDias = `
    <table class="data">
      <thead>
        <tr>
          <th style="width:18%">Data</th>
          <th class="c" style="width:14%">Registros</th>
          <th class="r" style="width:28%">${esc(labelMetrica)}</th>
          <th style="width:40%">Participação</th>
        </tr>
      </thead>
      <tbody>
        ${diasCom.map((d) => {
          const v = Number(d.metricaUnidade || 0);
          const pct = metricaTotal > 0 ? (v / metricaTotal) * 100 : 0;
          const bar = Math.max(3, Math.round((v / maxDia) * 100));
          return `
            <tr>
              <td>${esc(formatarIsoParaBr(d.data))}</td>
              <td class="c">${fmtNum(d.rotas || 0, 0)}</td>
              <td class="r">${esc(formatarMetricaUnidade(v, d.metricaSufixo || sufixo))}</td>
              <td>
                ${fmtNum(pct, 1)}%
                <span class="bar-mini"><span style="width:${bar}%"></span></span>
              </td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Relatório Ciclo ${esc(tipoLabel)} — ${esc(p.servicoNome)}</title>
  <style>${ESTILOS}</style>
</head>
<body>
  <div class="header">
    <h1>${esc(p.servicoNome)}</h1>
    <div class="sub">
      ${p.contratoNome ? `${esc(p.contratoNome)} · ` : ''}
      ${formatarIsoParaBr(p.dataInicio)} a ${formatarIsoParaBr(p.dataFim)}
      ${p.cicloLabel ? ` · ${esc(p.cicloLabel)}` : ''}
    </div>
    <span class="tipo">${esc(tipoLabel)} · Relatório de ciclo</span>
  </div>

  <div class="banner">
    Consolidado do ciclo com métricas da planilha por dia (sem regras de viagem/coleta).
  </div>

  <div class="hero-dark">
    <div class="lbl">${esc(labelMetrica)} no ciclo</div>
    <div class="val">${esc(formatarMetricaUnidade(metricaTotal, sufixo))}</div>
    <div class="sub">
      ${fmtNum(p.totais.rotas || 0, 0)} registro(s)
      · ${fmtNum(p.dias.length, 0)} dia(s) do ciclo
      · ${fmtNum(p.diasComDados, 0)} com operação
    </div>
  </div>

  <div class="sec">Indicadores do ciclo</div>
  ${cards}

  <div class="sec" style="margin-top:8px">Produção por dia</div>
  ${diasCom.length ? tabelaDias : '<p style="color:#64748b">Nenhum dia com dados no período.</p>'}

  <div class="footer">
    Sistemma · Relatório de ciclo de ${esc(tipoLabel.toLowerCase())} · Gerado em ${esc(geradoEm)}
  </div>
</body>
</html>`;
}
