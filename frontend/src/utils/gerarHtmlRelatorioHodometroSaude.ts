/**
 * PDF — Saúde dos dados: caminhões com hodômetro quebrado / KM não informado.
 * Inclui detalhe das correções automáticas (mesmo texto do relatório de saúde do upload).
 */
import { formatarIsoParaBr } from './periodoDados';
import type { RelatorioHodometroSaude } from './relatorioHodometroSaude';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtNum(v: number, dec = 0): string {
  return v.toLocaleString('pt-BR', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function fmtDatas(datas: string[]): string {
  if (!datas.length) return '—';
  if (datas.length <= 4) return datas.map(formatarIsoParaBr).join(', ');
  return `${datas.slice(0, 3).map(formatarIsoParaBr).join(', ')}… (+${datas.length - 3})`;
}

export function gerarHtmlRelatorioHodometroSaude(opts: {
  servicoNome: string;
  contratoNome?: string;
  dataInicio: string;
  dataFim: string;
  relatorio: RelatorioHodometroSaude;
  geradoEm?: Date;
}): string {
  const { servicoNome, contratoNome, dataInicio, dataFim, relatorio } = opts;
  const gerado = opts.geradoEm ?? new Date();
  const periodoLabel = dataInicio === dataFim
    ? formatarIsoParaBr(dataInicio)
    : `${formatarIsoParaBr(dataInicio)} → ${formatarIsoParaBr(dataFim)}`;

  const linhasPlaca = relatorio.placas.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${esc(p.placa)}</strong></td>
      <td>${esc(p.tipoCaminhao)}</td>
      <td>${esc(p.motorista)}</td>
      <td class="num">${fmtNum(p.viagens)}</td>
      <td class="num">${fmtNum(p.pesoTotalKg, 0)}</td>
      <td>${esc(fmtDatas(p.datas))}</td>
      <td class="alerta">${esc(p.alerta)}</td>
    </tr>`).join('');

  const linhasViagem = relatorio.viagensCorrigidas.map((v, i) => `
    <tr class="${v.corrigidaAutomaticamente ? 'row-ok' : 'row-warn'}">
      <td>${i + 1}</td>
      <td>${esc(v.data ? formatarIsoParaBr(v.data) : '—')}</td>
      <td><strong>${esc(v.placa)}</strong></td>
      <td>${esc(v.motorista)}</td>
      <td>${esc(v.rota)}</td>
      <td class="num">${v.kmTotal > 0 ? fmtNum(v.kmTotal, 1) : '0 (tratado)'}</td>
      <td class="num">${fmtNum(v.pesoKg, 0)}</td>
      <td class="alerta">${esc(v.motivo)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Saúde — Hodômetro quebrado</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 18px; background: #f8fafc; color: #0f172a; }
    h1 { margin: 0; font-size: 18px; color: #1e293b; }
    h2 { margin: 16px 0 8px; font-size: 13px; color: #334155; }
    .sub { margin: 4px 0 0; font-size: 11px; color: #64748b; }
    .resumo { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 14px 0; }
    .card { background: #fff; border-radius: 8px; padding: 10px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
    .card .n { font-size: 20px; font-weight: 800; }
    .card .l { font-size: 8px; color: #64748b; margin-top: 2px; text-transform: uppercase; letter-spacing: .03em; }
    .card.destaque .n { color: #b91c1c; }
    .card.ok .n { color: #16a34a; }
    .card.info .n { color: #0f766e; }
    .aviso { background: #fff7ed; border: 1px solid #fdba74; color: #9a3412; border-radius: 8px; padding: 10px; font-size: 11px; margin-bottom: 12px; }
    .aviso-ok { background: #f0fdf4; border: 1px solid #86efac; color: #166534; border-radius: 8px; padding: 10px; font-size: 11px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 9px; background: #fff; margin-bottom: 8px; }
    th { background: #1e293b; color: #fff; text-align: left; padding: 6px 7px; }
    td { padding: 5px 7px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    tr:nth-child(even) td { background: #f8fafc; }
    tr.row-ok td { background: #f0fdf4; }
    tr.row-ok:nth-child(even) td { background: #ecfdf5; }
    .num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; }
    .alerta { color: #166534; font-size: 8px; max-width: 280px; }
    tr.row-warn .alerta { color: #9a3412; }
    .footer { margin-top: 14px; font-size: 9px; color: #94a3b8; text-align: center; }
    .vazio { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 14px; border-radius: 8px; text-align: center; font-weight: 700; }
  </style>
</head>
<body>
  <h1>Relatório de Saúde — Hodômetro quebrado / KM não informado</h1>
  <p class="sub">
    ${contratoNome ? `Contrato: <strong>${esc(contratoNome)}</strong> · ` : ''}
    Serviço: <strong>${esc(servicoNome)}</strong> · Período: <strong>${esc(periodoLabel)}</strong>
  </p>
  <p class="sub">Gerado em ${esc(gerado.toLocaleString('pt-BR'))}</p>

  <div class="resumo">
    <div class="card destaque">
      <div class="n">${fmtNum(relatorio.caminhoesComHodometroQuebrado)}</div>
      <div class="l">Caminhões afetados</div>
    </div>
    <div class="card info">
      <div class="n">${fmtNum(relatorio.registrosCorrigidosAutomaticamente)}</div>
      <div class="l">Corrigidas automaticamente</div>
    </div>
    <div class="card">
      <div class="n">${fmtNum(relatorio.viagensComHodometroQuebrado)}</div>
      <div class="l">Viagens sem KM válido</div>
    </div>
    <div class="card">
      <div class="n">${fmtNum(relatorio.pctViagensAfetadas, 1)}%</div>
      <div class="l">% das viagens do período</div>
    </div>
    <div class="card ok">
      <div class="n">${fmtNum(relatorio.totalViagensPeriodo)}</div>
      <div class="l">Total de viagens no período</div>
    </div>
  </div>

  <div class="aviso-ok">
    <strong>Correção automática na importação:</strong>
    viagens com hodômetro inconsistente (KM inicial = final, salto absurdo ou chegada &lt; saída)
    entram no dashboard com <strong>KM zerado</strong>; peso e quantidade de viagens são mantidos.
    O motivo abaixo usa o mesmo texto do relatório de saúde do upload
    (<em>Corrigido automaticamente: KM zerado por hodômetro inconsistente (…)</em>).
  </div>

  ${relatorio.placas.length === 0
    ? '<div class="vazio">Nenhum caminhão com hodômetro quebrado neste período.</div>'
    : `
  <h2>Resumo por caminhão (placa)</h2>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Placa</th>
        <th>Tipo</th>
        <th>Motorista</th>
        <th>Viagens</th>
        <th>Peso (kg)</th>
        <th>Datas</th>
        <th>Correção / motivo</th>
      </tr>
    </thead>
    <tbody>${linhasPlaca}</tbody>
  </table>

  <h2>Detalhe — viagens corrigidas automaticamente (${fmtNum(relatorio.viagensCorrigidas.length)})</h2>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Data</th>
        <th>Placa</th>
        <th>Motorista</th>
        <th>Rota</th>
        <th>KM Total</th>
        <th>Peso (kg)</th>
        <th>Problemas / correção</th>
      </tr>
    </thead>
    <tbody>${linhasViagem}</tbody>
  </table>`}

  <div class="footer">SistemMA — Saúde dos dados · Hodômetro / KM · ${esc(periodoLabel)}</div>
</body>
</html>`;
}
