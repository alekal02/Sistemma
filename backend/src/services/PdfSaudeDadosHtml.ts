import type { ResultadoAnaliseViagens } from './analisarViagensPlanilhaService';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Mensagens de tratamento de hodômetro (inclui motivo explícito de coluna menor que outra). */
function problemaEhTratamentoHodometro(pl: string): boolean {
  return pl.includes('hodômetro')
    || pl.includes('hodometro')
    || pl.includes('km zerado')
    || pl.includes('km total corrigido')
    || pl.includes('km total mantido')
    || pl.includes('motivo do tratamento')
    || pl.includes('leitura foi descartada')
    || pl.includes('km saída')
    || pl.includes('km chegada');
}

function fmtPesoTon(kg: unknown): string {
  if (kg == null || kg === '') return '—';
  const n = Number(kg);
  if (Number.isNaN(n)) return '—';
  return (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 1 });
}

export function gerarHtmlSaudeDadosServer(opts: {
  relatorio: ResultadoAnaliseViagens;
  contratoNome: string;
  servicoNome: string;
  tipoLabel?: string;
}): string {
  const { relatorio, contratoNome, servicoNome, tipoLabel = 'Coleta' } = opts;
  const viagens = relatorio.viagens || [];
  const inconsistentes = relatorio.viagensInconsistentesTotal ?? relatorio.viagensIncompletas ?? 0;
  const validas = relatorio.viagensValidasDashboard ?? relatorio.viagensCompletas ?? 0;
  const descartadas = relatorio.linhasDescartadasSemDados ?? 0;
  const corrigidasHodometro = relatorio.viagensCorrigidasHodometro ?? 0;
  const pesagensAltas = relatorio.pesagensAltas ?? 0;
  const linhasPesagemAlta = relatorio.linhasComPesagemAlta ?? 0;
  const tDash = ((relatorio.pesoKgDashboard ?? 0) / 1000);
  const tFora = ((relatorio.pesoKgForaDashboard ?? 0) / 1000);
  const dataRelatorio = new Date().toLocaleDateString('pt-BR');

  const filtrarProblemas = (
    problemas: string[] | undefined,
    opts?: { corrigidaHodometro?: boolean; alertaPesagemAlta?: boolean },
  ) =>
    (problemas || []).filter((p) => {
      const pl = p.toLowerCase();
      if (opts?.corrigidaHodometro && problemaEhTratamentoHodometro(pl)) {
        return true;
      }
      if (opts?.alertaPesagemAlta && pl.includes('pesagem alta')) {
        return true;
      }
      return !pl.includes('placa será unificada') && !pl.startsWith('corrigido automaticamente');
    });

  const linhasTabela = viagens.map((v) => {
    const probs = filtrarProblemas(v.problemas, {
      corrigidaHodometro: v.corrigidaHodometro,
      alertaPesagemAlta: v.alertaPesagemAlta,
    });
    const corProb = v.foraDashboard || v.descartada
      ? '#dc2626'
      : v.alertaPesagemAlta
        ? '#9a3412'
        : (v.corrigidaHodometro ? '#166534' : '#b45309');
    const kmCell = (() => {
      if (!v.corrigidaHodometro) {
        if (v.kmTotal != null) {
          return Number(v.kmTotal).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
        }
        if (v.kmTotalCalculado != null) {
          return `${Number(v.kmTotalCalculado).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}*`;
        }
        return '—';
      }
      const kmFinal = v.kmTotalCalculado != null && v.kmTotalCalculado > 0
        ? v.kmTotalCalculado
        : (v.kmTotal != null && v.kmTotal > 0 ? v.kmTotal : null);
      if (kmFinal != null && kmFinal > 0) {
        return `${Number(kmFinal).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} (ajustado)`;
      }
      return '0 (tratado)';
    })();
    const statusHtml = v.foraDashboard || v.descartada
      ? `<strong style="color:#dc2626">FORA DO DASH</strong>${v.motivoForaDashboard ? ` — ${esc(v.motivoForaDashboard)}` : ''}`
        + (probs.length ? `<br/>${esc(probs.join('; '))}` : '')
      : esc(probs.join('; ') || (v.corrigidaHodometro ? 'No dash (KM tratado) — peso/viagens mantidos' : '—'));
    return `
      <tr>
        <td>${esc(v.linha)}</td>
        <td>${esc(v.data || '—')}</td>
        <td>${esc(v.placa || '—')}</td>
        <td>${esc(v.motorista || '—')}</td>
        <td style="text-align:center;font-weight:700;color:${v.foraDashboard || v.descartada ? '#dc2626' : '#16a34a'}">${esc(v.contadorViagens ?? '—')}</td>
        <td>${kmCell}</td>
        <td style="${v.alertaPesagemAlta ? 'font-weight:700;color:#9a3412' : ''}">${fmtPesoTon(v.pesoTotal)}${v.alertaPesagemAlta && v.pesoAlertaKg != null
          ? ` <span style="font-size:8px">(máx viagem ${Number(v.pesoAlertaKg).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kg)</span>`
          : ''}</td>
        <td style="color:${corProb};font-size:9px">${statusHtml}</td>
      </tr>`;
  }).join('');

  const problemasLista = relatorio.problemasDashboard || relatorio.problemasAgrupados || [];
  const problemasHtml = problemasLista.map((p) => `
    <div style="display:flex;justify-content:space-between;padding:6px 10px;background:#fef2f2;border-radius:6px;margin-bottom:4px;font-size:13px;">
      <span>${esc(p.tipo)}</span>
      <span style="font-weight:700;color:#dc2626">${esc(p.quantidade)} viagem(ns)</span>
    </div>`).join('');

  const resumoPlacasHtml = relatorio.resumoPlacas?.alerta
    ? `<div class="aviso" style="background:#fef2f2;border-color:#fecaca;color:#991b1b">
        <strong>Placas:</strong> ${esc(relatorio.resumoPlacas.alerta)}
      </div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; overflow: visible; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 20px; background: #f1f5f9; }
    .header { text-align: center; padding: 20px 0 10px; }
    .header h1 { margin: 0; font-size: 20px; color: #1e293b; }
    .header p { margin: 4px 0 0; font-size: 12px; color: #64748b; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 14px 0; }
    .card { background: #fff; border-radius: 8px; padding: 12px; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
    .card .num { font-size: 22px; font-weight: 700; color: #1e293b; }
    .card .label { font-size: 10px; color: #64748b; margin-top: 2px; }
    .card.completas .num { color: #16a34a; }
    .card.incompletas .num { color: #dc2626; }
    .section-title { font-size: 14px; font-weight: 700; color: #334155; margin: 16px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #6366f1; }
    .problemas-box { background: #fff; border-radius: 8px; padding: 10px; margin-bottom: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
    .aviso { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px; margin-bottom: 12px; font-size: 12px; color: #1e40af; }
    table { width: 100%; border-collapse: collapse; font-size: 9px; }
    th { background: #1e293b; color: #fff; padding: 6px 8px; text-align: left; font-weight: 600; }
    td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
    tr:nth-child(even) { background: #f8fafc; }
    tr { break-inside: avoid; }
    .footer { text-align: center; font-size: 10px; color: #94a3b8; margin-top: 20px; padding-top: 10px; border-top: 1px solid #e2e8f0; }
    .obs { font-size: 10px; color: #64748b; font-style: italic; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Relatório de Saúde dos Dados</h1>
    <p style="font-size:13px;font-weight:600;color:#334155;margin:6px 0 2px">
      Contrato: ${esc(contratoNome)} • Tipo: ${esc(tipoLabel)} • Data: ${esc(dataRelatorio)}
    </p>
    <p>Serviço: ${esc(servicoNome)} • Arquivo: ${esc(relatorio.nomeArquivo || '—')} • Aba: ${esc(relatorio.aba || '—')}</p>
  </div>

  <div class="summary">
    <div class="card"><div class="num">${esc((relatorio.somaContadorViagens ?? relatorio.totalViagens) || 0)}</div><div class="label">CONTADOR planilha</div></div>
    <div class="card completas"><div class="num">${esc(relatorio.somaContadorNoDashboard ?? validas)}</div><div class="label">CONTADOR no dashboard</div></div>
    <div class="card incompletas"><div class="num">${esc(relatorio.somaContadorForaDashboard ?? inconsistentes)}</div><div class="label">CONTADOR fora do dash</div></div>
    ${pesagensAltas > 0
      ? `<div class="card"><div class="num" style="color:#ea580c">${esc(pesagensAltas)}</div><div class="label">Pesagens &gt; 15 t</div></div>`
      : ''}
    ${tFora > 0
      ? `<div class="card incompletas"><div class="num">${esc(tFora.toLocaleString('pt-BR', { maximumFractionDigits: 1 }))}</div><div class="label">t FORA do ciclo</div></div>`
      : ''}
    ${tDash > 0
      ? `<div class="card completas"><div class="num">${esc(tDash.toLocaleString('pt-BR', { maximumFractionDigits: 1 }))}</div><div class="label">t no ciclo/dash</div></div>`
      : ''}
    ${descartadas > 0
      ? `<div class="card"><div class="num">${esc(descartadas)}</div><div class="label">Linhas ignoradas</div></div>`
      : ''}
    <div class="card"><div class="num">${esc(relatorio.percentualCompleto || 0)}%</div><div class="label">% Linhas válidas</div></div>
  </div>

  <div class="aviso">
    CONTADOR DE VIAGENS na planilha: <strong>${esc(relatorio.somaContadorViagens ?? '—')}</strong>.
    Entram no dashboard: <strong>${esc(relatorio.somaContadorNoDashboard ?? validas)}</strong>.
    Ficam fora: <strong>${esc(relatorio.somaContadorForaDashboard ?? 0)}</strong>
    (${esc(inconsistentes)} linha(s) inconsistente(s)${descartadas > 0 ? ` + ${esc(descartadas)} ignorada(s)` : ''}).
    ${tFora > 0
      ? `A coluna <strong>Toneladas</strong> do ciclo soma só as viagens válidas: <strong>${esc(tDash.toLocaleString('pt-BR', { maximumFractionDigits: 1 }))} t</strong>. `
        + `<strong>${esc(tFora.toLocaleString('pt-BR', { maximumFractionDigits: 1 }))} t</strong> ficaram FORA DO DASH (linhas com erro) e não entram no total. `
        + `Planilha ≈ ciclo + toneladas fora. `
      : ''}
    ${corrigidasHodometro > 0
      ? `${esc(corrigidasHodometro)} viagem(ns) com hodômetro inconsistente foram tratadas (KM zerado; peso/viagens mantidos). `
      : ''}
    ${pesagensAltas > 0
      ? `${esc(pesagensAltas)} pesagem(ns) &gt; 15.000 kg/viagem — alerta informativo. `
      : ''}
    ${descartadas > 0 ? `${esc(descartadas)} linha(s) sem placa, KM Total e Peso Total foram ignoradas. ` : ''}
    Regras: KM máx. 300, peso &gt; 0, sem negativos, horas com ":". Hodômetro quebrado e pesagem alta não travam a subida.
  </div>

  ${(relatorio.regrasSaude || []).length > 0 ? `
  <div class="section-title">O que precisa para entrar no dashboard</div>
  <ul style="font-size:11px;color:#475569;margin:0 0 12px 18px;padding:0;">
    ${(relatorio.regrasSaude || []).map((r) => `<li>${esc(r)}</li>`).join('')}
  </ul>` : ''}

  <div class="section-title">Problemas que excluem viagens do dashboard</div>
  <div class="problemas-box">
    ${problemasHtml || '<p style="color:#16a34a;font-weight:600">Nenhum bloqueio — todas as viagens identificadas entram no dashboard.</p>'}
  </div>

  ${resumoPlacasHtml}

  ${viagens.length > 0 ? `
  <div class="section-title">Viagens que NÃO sobem / tratadas / alerta (${esc(viagens.length)}${viagens.length >= 500 ? '+' : ''})</div>
  <table>
    <thead>
      <tr>
        <th>Linha</th><th>Data</th><th>Placa</th><th>Motorista</th><th>Contador</th>
        <th>KM Total</th><th>Peso (t)</th><th>Status / Problemas</th>
      </tr>
    </thead>
    <tbody>${linhasTabela}</tbody>
  </table>
  <div class="obs">* Contador = coluna CONTADOR DE VIAGENS. Peso em toneladas (kg ÷ 1000). Linhas FORA DO DASH não entram na coluna Toneladas do ciclo.</div>
  ` : ''}

  <div class="footer">
    Relatório gerado automaticamente • Sistemma • ${esc(new Date().toLocaleString('pt-BR'))}
  </div>
</body>
</html>`;
}
