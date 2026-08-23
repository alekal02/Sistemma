import type { DashboardExecutivoResponse } from '../services/dashboardExecutivoService';

export interface ContextoHtmlExecutivo {
  contratoNome: string;
  servicoNome?: string;
}

function esc(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtData(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

function fmtHora(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function badgeVariacao(variacao: { valor: number; tipo: string }): string {
  if (variacao.tipo === 'estavel' || Math.abs(variacao.valor) < 0.5) {
    return '<span class="var estavel">→ 0%</span>';
  }
  const up = variacao.tipo === 'aumento';
  const cls = up ? 'up' : 'down';
  const seta = up ? '↑' : '↓';
  return `<span class="var ${cls}">${seta} ${Math.abs(variacao.valor).toFixed(1)}%</span>`;
}

function cardKpi(label: string, valor: string, variacao?: { valor: number; tipo: string }, destaque = false): string {
  return `
    <div class="kpi ${destaque ? 'destaque' : ''}">
      <div class="kpi-label">${esc(label)}</div>
      <div class="kpi-valor">${esc(valor)}</div>
      ${variacao ? badgeVariacao(variacao) : ''}
    </div>`;
}

function barrasCss(
  itens: Array<{ label: string; valor: number }>,
  cor = '#22c55e',
  formatar?: (v: number) => string,
): string {
  if (!itens.length) return '<p class="vazio">Sem dados</p>';
  const max = Math.max(...itens.map(i => i.valor), 1);
  const fmt = formatar || ((v: number) => v.toLocaleString('pt-BR'));
  return `
    <div class="barras">
      ${itens.map(item => {
        const pct = Math.max(4, Math.round((item.valor / max) * 100));
        return `
          <div class="barra-linha">
            <div class="barra-label" title="${esc(item.label)}">${esc(item.label)}</div>
            <div class="barra-track"><div class="barra-fill" style="width:${pct}%;background:${cor}"></div></div>
            <div class="barra-valor">${esc(fmt(item.valor))}</div>
          </div>`;
      }).join('')}
    </div>`;
}

function tabela(
  titulo: string,
  colunas: Array<{ key: string; label: string; align?: 'left' | 'right' }>,
  linhas: Record<string, unknown>[],
  formatadores?: Record<string, (v: unknown) => string>,
): string {
  if (!linhas.length) return '';
  const fmt = (key: string, val: unknown) => {
    if (formatadores?.[key]) return formatadores[key](val);
    if (typeof val === 'number') return val.toLocaleString('pt-BR');
    return esc(val);
  };
  return `
    <section class="bloco">
      <h2>${esc(titulo)}</h2>
      <table>
        <thead><tr>
          ${colunas.map(c => `<th class="${c.align === 'right' ? 'r' : ''}">${esc(c.label)}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${linhas.map(linha => `
            <tr>
              ${colunas.map(c => `<td class="${c.align === 'right' ? 'r' : ''}">${fmt(c.key, linha[c.key])}</td>`).join('')}
            </tr>`).join('')}
        </tbody>
      </table>
    </section>`;
}

const ESTILOS = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Aptos', 'Segoe UI', system-ui, sans-serif;
    background: #edf2f7;
    color: #172238;
    line-height: 1.45;
    padding: 32px;
  }
  .wrap { max-width: 1180px; margin: 0 auto; }
  .toolbar { display: flex; justify-content: flex-end; margin-bottom: 16px; }
  .print-btn { border: 0; border-radius: 8px; padding: 10px 16px; background: #2457d6; color: #fff; font: 700 12px inherit; cursor: pointer; box-shadow: 0 6px 16px rgba(36,87,214,.2); }
  .print-btn:hover { background: #18388f; }
  .capa {
    position: relative;
    overflow: hidden;
    background: linear-gradient(125deg, #172238 0%, #263b61 66%, #2457d6 100%);
    color: #fff;
    border-radius: 16px;
    padding: 34px 38px 30px;
    margin-bottom: 26px;
    box-shadow: 0 18px 38px rgba(23,34,56,.16);
  }
  .capa::after { content: ''; position: absolute; width: 260px; height: 260px; right: -80px; top: -120px; border: 1px solid rgba(255,255,255,.13); border-radius: 50%; box-shadow: 0 0 0 24px rgba(255,255,255,.025), 0 0 0 48px rgba(255,255,255,.02); }
  .capa h1 { font-size: 2rem; letter-spacing: -.04em; color: #fff; margin-bottom: 7px; }
  .capa .sub { color: #d5e0f2; font-size: .94rem; margin-bottom: 4px; }
  .capa .meta { color: #aebed5; font-size: .76rem; margin-top: 18px; }
  .capa-kicker { color: #91e1d0; font-size: .66rem; font-weight: 800; text-transform: uppercase; letter-spacing: .14em; margin-bottom: 10px; }
  .badge {
    display: inline-flex;
    background: #9de6d8;
    color: #075d54;
    font-size: .7rem;
    font-weight: 700;
    padding: 5px 11px;
    border-radius: 999px;
    margin-top: 12px;
  }
  .secao-titulo {
    font-size: .68rem;
    font-weight: 800;
    letter-spacing: .13em;
    text-transform: uppercase;
    color: #697890;
    margin: 25px 0 11px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .secao-titulo::before {
    content: '';
    width: 4px; height: 17px; border-radius: 4px;
    background: #0f9f86;
  }
  .grid-kpi {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 10px;
    margin-bottom: 10px;
  }
  .kpi {
    background: #fff; border: 1px solid #dce4ef; border-radius: 10px;
    padding: 15px 16px; min-height: 92px;
    box-shadow: 0 5px 14px rgba(23,34,56,.05);
  }
  .kpi.destaque {
    border-color: #73cfc0;
    background: linear-gradient(135deg, #e7faf5, #fff);
  }
  .kpi-label {
    font-size: .61rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .06em; color: #697890; margin-bottom: 8px;
  }
  .kpi-valor { font-size: 1.3rem; font-weight: 800; letter-spacing: -.03em; color: #172238; }
  .var { font-size: .68rem; font-weight: 700; margin-top: 5px; display: inline-block; }
  .var.up { color: #0f9f86; } .var.down { color: #d34b59; } .var.estavel { color: #8794a8; }
  .grid-2 { display: grid; grid-template-columns: 1.35fr 1fr; gap: 14px; }
  .bloco {
    background: #fff; border: 1px solid #dce4ef; border-radius: 12px;
    padding: 17px 19px; margin-bottom: 14px;
    box-shadow: 0 5px 14px rgba(23,34,56,.04);
  }
  .bloco h2 {
    font-size: .82rem;
    font-weight: 700;
    color: #253653; margin-bottom: 14px;
  }
  table { width: 100%; border-collapse: collapse; font-size: .74rem; }
  th {
    text-align: left; background: #172238; color: #e7eef8; padding: 9px 10px;
    font-size: .6rem; text-transform: uppercase; letter-spacing: .07em;
  }
  th.r, td.r { text-align: right; }
  td { padding: 8px 10px; border-bottom: 1px solid #e9eef5; color: #3b4a62; }
  tr:nth-child(even) td { background: #f7f9fc; }
  .barras { display: flex; flex-direction: column; gap: 9px; }
  .barra-linha { display: grid; grid-template-columns: 105px 1fr 104px; gap: 9px; align-items: center; }
  .barra-label {
    font-size: .67rem; color: #52627a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .barra-track { height: 8px; background: #e8eef5; border-radius: 5px; overflow: hidden; }
  .barra-fill { height: 100%; border-radius: 5px; }
  .barra-valor { font-size: .67rem; font-weight: 700; text-align: right; color: #253653; }
  .vazio { color: #92a0b4; font-size: .78rem; font-style: italic; }
  .rodape {
    text-align: center; color: #92a0b4; font-size: .68rem; margin-top: 26px;
    padding-top: 14px; border-top: 1px solid #dce4ef;
  }
  @media (max-width: 800px) { body { padding: 16px; } .grid-kpi { grid-template-columns: repeat(2, 1fr); } .grid-2 { grid-template-columns: 1fr; } .capa { padding: 26px 24px; } }
  @media print {
    body { background: #fff; padding: 0; } .toolbar { display: none; }
    .capa, .bloco, .kpi { break-inside: avoid; box-shadow: none; }
  }
`;

export function gerarHtmlExecutivoCompartilhavel(
  dados: DashboardExecutivoResponse,
  ctx: ContextoHtmlExecutivo,
): string {
  const { financeiro: f, operacional: o, graficos: g, periodo: p, analiseFinanceira: af, analiseOperacional: ao, metadados: m } = dados;

  const escopo = ctx.servicoNome
    ? `${ctx.contratoNome} → ${ctx.servicoNome}`
    : ctx.contratoNome;

  const moeda = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num = (v: number, dec = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

  const rankingMotoristas = (g.rankingMotoristas || af.faturamentoPorMotorista || []).slice(0, 15);
  const receitaRegional = (g.receitaPorRegional || af.faturamentoPorRegional || []).slice(0, 12);
  const receitaTurno = (g.receitaPorTurno || af.faturamentoPorTurno || []).slice(0, 8);
  const receitaDiaSemana = (g.receitaPorDiaSemana || af.faturamentoPorDiaSemana || []).slice(0, 7);
  const receitaDiaria = (g.receitaDiaria || g.receitaKmDiario || []).slice(-14);
  const temPlanilha = m.totalRegistrosAtual > 0;
  const temAbastecimentos = m.totalAbastecimentosAtual > 0;
  const financeiroCards = [
    f.faturamento.valor > 0 ? cardKpi('Faturamento Total', f.faturamento.formatado, f.faturamento.variacao, true) : '',
    temAbastecimentos && f.custoOperacional.valor > 0 ? cardKpi('Custo Operacional', f.custoOperacional.formatado, f.custoOperacional.variacao) : '',
    temAbastecimentos && f.margemBruta.valor !== 0 ? cardKpi('Margem Bruta', f.margemBruta.formatado, f.margemBruta.variacao) : '',
    f.ticketMedio.valor > 0 ? cardKpi('Ticket Médio', f.ticketMedio.formatado, f.ticketMedio.variacao) : '',
    f.receitaHora.valor > 0 ? cardKpi('Receita / Hora', f.receitaHora.formatado, f.receitaHora.variacao) : '',
  ].filter(Boolean).join('');
  const operacionalCards = [
    o.tonelagem.valor > 0 ? cardKpi('Tonelagem', o.tonelagem.formatado, o.tonelagem.variacao) : '',
    o.kmRodados.valor > 0 ? cardKpi('KM Rodados', o.kmRodados.formatado, o.kmRodados.variacao) : '',
    o.viagens.valor > 0 ? cardKpi('Viagens', o.viagens.formatado, o.viagens.variacao) : '',
    o.coletoresAtivos.valor > 0 ? cardKpi('Coletores Ativos', o.coletoresAtivos.formatado, o.coletoresAtivos.variacao) : '',
    o.horasProdutivas.valor > 0 ? cardKpi('Horas Produtivas', o.horasProdutivas.formatado, o.horasProdutivas.variacao) : '',
    o.eficiencia.valor > 0 ? cardKpi('Eficiência (t/km)', o.eficiencia.formatado, o.eficiencia.variacao) : '',
  ].filter(Boolean).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dashboard Executivo — ${esc(escopo)}</title>
  <style>${ESTILOS}</style>
</head>
<body>
  <div class="wrap">
    <div class="toolbar"><button class="print-btn" type="button" onclick="window.print()">Imprimir / salvar PDF</button></div>
    <header class="capa">
      <div class="capa-kicker">Sistemma · Inteligência operacional</div>
      <h1>Dashboard Executivo</h1>
      <p class="sub"><strong>${esc(escopo)}</strong></p>
      <p class="sub">Período: ${esc(p.label)} (${fmtData(p.inicio)} — ${fmtData(p.fim)})</p>
      <span class="badge">${g.usandoEstimativa ? 'Valores estimados' : 'Dados reais'}</span>
      <p class="meta">
        Gerado em ${fmtData(m.dataGeracao)} às ${fmtHora(m.dataGeracao)} •
        ${m.totalRegistrosAtual.toLocaleString('pt-BR')} registros no período
      </p>
    </header>

    ${financeiroCards ? `<div class="secao-titulo">Painel Financeiro</div><div class="grid-kpi">${financeiroCards}</div>` : ''}

    ${temPlanilha && operacionalCards ? `<div class="secao-titulo">Painel Operacional</div><div class="grid-kpi">${operacionalCards}</div>` : ''}

    <div class="grid-2">
      <div class="bloco">
        <h2>Receita diária</h2>
        ${barrasCss(
          receitaDiaria.map(d => ({ label: d.label, valor: (d as { valor?: number; faturamento?: number }).valor ?? (d as { faturamento?: number }).faturamento ?? 0 })),
          '#059669',
          moeda,
        )}
      </div>
      <div class="bloco">
        <h2>Receita por regional</h2>
        ${barrasCss(
          receitaRegional.map(r => ({ label: r.regional, valor: r.faturamento })),
          '#3b82f6',
          moeda,
        )}
      </div>
    </div>

    <div class="grid-2">
      <div class="bloco">
        <h2>Receita por turno</h2>
        ${barrasCss(
          receitaTurno.map(t => ({ label: t.turno, valor: t.faturamento })),
          '#8b5cf6',
          moeda,
        )}
      </div>
      <div class="bloco">
        <h2>Receita por dia da semana</h2>
        ${barrasCss(
          receitaDiaSemana.map(d => ({ label: d.diaNome, valor: d.faturamento })),
          '#f59e0b',
          moeda,
        )}
      </div>
    </div>

    ${tabela(
      'Ranking de motoristas',
      [
        { key: 'motorista', label: 'Motorista' },
        { key: 'placa', label: 'Placa' },
        { key: 'viagens', label: 'Viagens', align: 'right' },
        { key: 'faturamento', label: 'Faturamento', align: 'right' },
      ],
      rankingMotoristas,
      { faturamento: v => moeda(Number(v)) },
    )}

    ${tabela(
      'Produtividade por coletor',
      [
        { key: 'coletor', label: 'Coletor' },
        { key: 'tonelagem', label: 'Tonelagem (t)', align: 'right' },
        { key: 'viagens', label: 'Viagens', align: 'right' },
        { key: 'tonPorDia', label: 't/dia', align: 'right' },
      ],
      (af.produtividadePorColetor || []).slice(0, 15),
      { tonelagem: v => num(Number(v), 2), tonPorDia: v => num(Number(v), 2) },
    )}

    ${tabela(
      'Motoristas — desempenho operacional',
      [
        { key: 'motorista', label: 'Motorista' },
        { key: 'viagens', label: 'Viagens', align: 'right' },
        { key: 'tonelagem', label: 'Tonelagem', align: 'right' },
        { key: 'kmTotal', label: 'KM', align: 'right' },
        { key: 'tonPorHora', label: 't/h', align: 'right' },
      ],
      (ao.motoristas || []).slice(0, 20),
      {
        tonelagem: v => num(Number(v), 2),
        kmTotal: v => num(Number(v), 0),
        tonPorHora: v => num(Number(v), 2),
      },
    )}

    ${af.projecaoMensal ? `
    <section class="bloco">
      <h2>Projeção mensal</h2>
      <p style="font-size:0.88rem;color:#334155;">
        Projeção: <strong>${moeda(af.projecaoMensal.projecao)}</strong> •
        Média diária: ${moeda(af.projecaoMensal.mediaDiaria)} •
        ${af.projecaoMensal.diasPassados} dias passados, ${af.projecaoMensal.diasRestantes} restantes
      </p>
    </section>` : ''}

    <footer class="rodape">
      Sistemma — Relatório executivo offline • Abra este arquivo em qualquer navegador (Chrome, Edge, Firefox)
    </footer>
  </div>
</body>
</html>`;

  return html;
}

export function baixarHtmlExecutivo(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.html') ? filename : `${filename}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function abrirHtmlExecutivoNovaAba(html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
