import type { PeriodoCicloContrato } from './periodoCicloContrato';
import { formatarIsoParaBr } from './periodoDados';
import { fmtMoeda, fmtNum, type DadoDiario } from './relatorioDiario';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** PDF executivo do ciclo — 1 página, leitura rápida para gestão. */
export function gerarHtmlRelatorioCiclo(opts: {
  servicoNome: string;
  ciclo: PeriodoCicloContrato;
  dias: DadoDiario[];
  totais: DadoDiario;
  diasComDados: number;
  geradoEm?: Date;
}): string {
  const { servicoNome, ciclo, dias, totais, diasComDados } = opts;
  const gerado = opts.geradoEm ?? new Date();
  const dataGeracao = gerado.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  const horaGeracao = gerado.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const diasAtivos = dias.filter((d) => d.viagens > 0);
  const receitaTon = totais.toneladas > 0 ? totais.faturamento / totais.toneladas : 0;
  const receitaViagem = totais.viagens > 0 ? totais.faturamento / totais.viagens : 0;
  const tonMediaDia = diasComDados > 0 ? totais.toneladas / diasComDados : 0;
  const viagensMediaDia = diasComDados > 0 ? totais.viagens / diasComDados : 0;
  const kmPorViagem = totais.viagens > 0 ? totais.km / totais.viagens : 0;

  const melhorDiaFat = [...diasAtivos].sort((a, b) => b.faturamento - a.faturamento)[0];
  const melhorDiaVg = [...diasAtivos].sort((a, b) => b.viagens - a.viagens)[0];

  const maxFat = Math.max(...diasAtivos.map((d) => d.faturamento), 1);
  const barrasDia = [...diasAtivos]
    .sort((a, b) => b.faturamento - a.faturamento)
    .slice(0, 8)
    .map((d) => {
      const pct = Math.max(6, Math.round((d.faturamento / maxFat) * 100));
      return `<div class="bar-row">
        <div class="bar-lbl">${esc(d.label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="bar-val">${fmtMoeda(d.faturamento)}</div>
      </div>`;
    })
    .join('');

  const linhasResumo = dias
    .map((d, idx) => {
      const semDados = d.viagens <= 0;
      const bg = idx % 2 === 0 ? '#f8fafc' : '#fff';
      const corLbl = semDados ? '#94a3b8' : '#4338ca';
      const corVal = semDados ? '#cbd5e1' : '#0f172a';
      const corFat = semDados ? '#cbd5e1' : '#065f46';
      return `<tr style="background:${bg}">
        <td style="font-weight:700;color:${corLbl}">${esc(d.label)}</td>
        <td class="c" style="color:${corVal}">${semDados ? '—' : fmtNum(d.viagens, 0)}</td>
        <td class="r" style="color:${corVal}">${semDados ? '—' : `${fmtNum(d.toneladas, 1)} t`}</td>
        <td class="r fat" style="color:${corFat}">${semDados ? '—' : fmtMoeda(d.faturamento)}</td>
      </tr>`;
    })
    .join('');

  const destaque = (titulo: string, valor: string, sub: string) => `
    <div class="destaque">
      <div class="dest-tit">${esc(titulo)}</div>
      <div class="dest-val">${valor}</div>
      <div class="dest-sub">${esc(sub)}</div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 9px;
      color: #1e293b;
      padding: 14px 16px;
      line-height: 1.35;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      background: linear-gradient(135deg,#0f172a,#1e3a5f);
      color: #fff;
      border-radius: 10px;
      padding: 12px 14px;
      margin-bottom: 12px;
    }
    .header h1 { font-size: 15px; font-weight: 800; color: #fbbf24; }
    .header .sub { font-size: 8px; color: #94a3b8; margin-top: 2px; }
    .header .meta { font-size: 7px; color: #64748b; text-align: right; white-space: nowrap; }
    .hero {
      text-align: center;
      background: linear-gradient(135deg,#ecfdf5,#d1fae5);
      border: 2px solid #10b981;
      border-radius: 10px;
      padding: 14px 12px;
      margin-bottom: 12px;
    }
    .hero-lbl { font-size: 8px; font-weight: 700; color: #065f46; text-transform: uppercase; letter-spacing: 0.5px; }
    .hero-val { font-size: 28px; font-weight: 900; color: #047857; margin: 4px 0 2px; }
    .hero-sub { font-size: 8px; color: #475569; }
    .grid2 { display: flex; gap: 10px; margin-bottom: 12px; }
    .col { flex: 1; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; }
    .col-tit {
      font-size: 7px; font-weight: 800; color: #64748b;
      text-transform: uppercase; letter-spacing: 0.4px;
      border-bottom: 1.5px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 6px;
    }
    .metric { display: flex; justify-content: space-between; align-items: baseline; padding: 3px 0; }
    .metric-lbl { font-size: 8px; color: #64748b; }
    .metric-val { font-size: 11px; font-weight: 800; color: #0f172a; }
    .metric-val.green { color: #059669; }
    .metric-val.blue { color: #2563eb; }
    .metric-val.amber { color: #d97706; }
    .destaques { display: flex; gap: 8px; margin-bottom: 12px; }
    .destaque {
      flex: 1; background: #fff; border: 1px solid #e2e8f0;
      border-radius: 8px; padding: 8px; text-align: center;
    }
    .dest-tit { font-size: 6px; font-weight: 700; color: #64748b; text-transform: uppercase; }
    .dest-val { font-size: 12px; font-weight: 800; color: #0f172a; margin: 3px 0 1px; }
    .dest-sub { font-size: 7px; color: #94a3b8; }
    .sec {
      font-size: 7px; font-weight: 800; color: #475569;
      text-transform: uppercase; margin-bottom: 6px;
    }
    .bar-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
    .bar-lbl { width: 32px; font-size: 7px; font-weight: 700; color: #4338ca; flex-shrink: 0; }
    .bar-track { flex: 1; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; }
    .bar-fill { height: 100%; background: linear-gradient(90deg,#10b981,#34d399); border-radius: 4px; }
    .bar-val { width: 58px; font-size: 7px; font-weight: 700; color: #065f46; text-align: right; flex-shrink: 0; }
    .layout-inf { display: flex; gap: 10px; margin-bottom: 10px; }
    .layout-inf .col { margin-bottom: 0; }
    table { width: 100%; border-collapse: collapse; font-size: 7px; }
    th {
      padding: 5px 6px; background: #1e293b; color: #fff;
      font-size: 6px; text-transform: uppercase; text-align: left;
    }
    th.c, td.c { text-align: center; }
    th.r, td.r { text-align: right; }
    td { padding: 3px 5px; border-bottom: 1px solid #f1f5f9; }
    td.fat { font-weight: 800; color: #065f46; font-family: monospace; }
    tfoot td {
      font-weight: 800; background: #eef2ff;
      border-top: 2px solid #6366f1; padding: 5px 6px;
    }
    .footer {
      text-align: center; font-size: 6px; color: #94a3b8;
      margin-top: 10px; padding-top: 8px; border-top: 1px solid #e2e8f0;
    }
    @media print {
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      body { padding: 10px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${esc(servicoNome)}</h1>
      <div class="sub">Resumo executivo · ${esc(ciclo.label)}</div>
      <div class="sub">${formatarIsoParaBr(ciclo.dataInicio)} a ${formatarIsoParaBr(ciclo.dataFim)}</div>
    </div>
    <div class="meta">Gerado ${dataGeracao}<br/>${horaGeracao}</div>
  </div>

  <div class="hero">
    <div class="hero-lbl">Faturamento estimado do ciclo</div>
    <div class="hero-val">${fmtMoeda(totais.faturamento)}</div>
    <div class="hero-sub">
      ${fmtNum(totais.viagens, 0)} viagens · ${fmtNum(totais.toneladas, 1)} t · ${diasComDados} dia${diasComDados !== 1 ? 's' : ''} com operação
    </div>
  </div>

  <div class="grid2">
    <div class="col">
      <div class="col-tit">Operação</div>
      <div class="metric"><span class="metric-lbl">Viagens</span><span class="metric-val blue">${fmtNum(totais.viagens, 0)}</span></div>
      <div class="metric"><span class="metric-lbl">Toneladas</span><span class="metric-val green">${fmtNum(totais.toneladas, 1)} t</span></div>
      <div class="metric"><span class="metric-lbl">KM rodado</span><span class="metric-val amber">${fmtNum(totais.km, 0)} km</span></div>
      <div class="metric"><span class="metric-lbl">Média viagens/dia</span><span class="metric-val">${fmtNum(viagensMediaDia, 1)}</span></div>
      <div class="metric"><span class="metric-lbl">KM/viagem</span><span class="metric-val">${fmtNum(kmPorViagem, 1)}</span></div>
    </div>
    <div class="col">
      <div class="col-tit">Receita</div>
      <div class="metric"><span class="metric-lbl">R$/tonelada</span><span class="metric-val green">${fmtMoeda(receitaTon)}</span></div>
      <div class="metric"><span class="metric-lbl">R$/viagem</span><span class="metric-val">${fmtMoeda(receitaViagem)}</span></div>
      <div class="metric"><span class="metric-lbl">R$/km</span><span class="metric-val amber">${fmtMoeda(totais.receitaKm)}</span></div>
      <div class="metric"><span class="metric-lbl">Média ton/dia</span><span class="metric-val green">${fmtNum(tonMediaDia, 1)} t</span></div>
    </div>
  </div>

  ${melhorDiaFat || melhorDiaVg ? `
  <div class="destaques">
    ${melhorDiaFat ? destaque(
      'Melhor dia (receita)',
      fmtMoeda(melhorDiaFat.faturamento),
      `${melhorDiaFat.label} · ${fmtNum(melhorDiaFat.viagens, 0)} viagens`,
    ) : ''}
    ${melhorDiaVg ? destaque(
      'Dia com mais viagens',
      fmtNum(melhorDiaVg.viagens, 0),
      `${melhorDiaVg.label} · ${fmtMoeda(melhorDiaVg.faturamento)}`,
    ) : ''}
    ${destaque(
      'Média por dia ativo',
      fmtMoeda(diasComDados > 0 ? totais.faturamento / diasComDados : 0),
      `${fmtNum(viagensMediaDia, 1)} viagens · ${fmtNum(tonMediaDia, 1)} t`,
    )}
  </div>` : ''}

  <div class="layout-inf">
    <div class="col" style="flex:1.1">
      <div class="sec">Faturamento por dia (principais)</div>
      ${barrasDia || '<div style="color:#94a3b8;font-size:8px">Sem dias com operação</div>'}
      ${diasAtivos.length > 8 ? `<div style="font-size:6px;color:#94a3b8;margin-top:4px">+ ${diasAtivos.length - 8} dia(s) — ver tabela</div>` : ''}
    </div>
    <div class="col" style="flex:0.9">
      <div class="sec">Resumo diário (${dias.length} dias do ciclo)</div>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th class="c">Viag.</th>
            <th class="r">Ton</th>
            <th class="r">R$</th>
          </tr>
        </thead>
        <tbody>
          ${linhasResumo || '<tr><td colspan="4" style="padding:8px;text-align:center;color:#94a3b8">Sem dados</td></tr>'}
        </tbody>
        <tfoot>
          <tr>
            <td>TOTAL</td>
            <td class="c">${fmtNum(totais.viagens, 0)}</td>
            <td class="r">${fmtNum(totais.toneladas, 1)} t</td>
            <td class="r fat">${fmtMoeda(totais.faturamento)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>

  <div class="footer">
    Sistemma · Resumo executivo do ciclo · ${diasComDados} de ${dias.length} dias com operação
  </div>
</body>
</html>`;
}
