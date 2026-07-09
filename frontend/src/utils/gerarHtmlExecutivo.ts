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
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    background: #f1f5f9;
    color: #0f172a;
    line-height: 1.45;
    padding: 24px;
  }
  .wrap { max-width: 1100px; margin: 0 auto; }
  .capa {
    background: linear-gradient(135deg, #ecfdf5 0%, #fff 60%);
    border: 1px solid #bbf7d0;
    border-radius: 14px;
    padding: 28px 32px;
    margin-bottom: 20px;
  }
  .capa h1 { font-size: 1.6rem; color: #065f46; margin-bottom: 6px; }
  .capa .sub { color: #475569; font-size: 0.92rem; margin-bottom: 4px; }
  .capa .meta { color: #64748b; font-size: 0.78rem; margin-top: 12px; }
  .badge {
    display: inline-block;
    background: #dcfce7;
    color: #166534;
    font-size: 0.72rem;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 999px;
    margin-top: 10px;
  }
  .secao-titulo {
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #64748b;
    margin: 24px 0 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .secao-titulo::before {
    content: '';
    width: 4px;
    height: 18px;
    border-radius: 2px;
    background: #22c55e;
  }
  .grid-kpi {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
    margin-bottom: 8px;
  }
  .kpi {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 14px 16px;
  }
  .kpi.destaque {
    border-color: #86efac;
    background: #f0fdf4;
    grid-column: span 1;
  }
  .kpi-label {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    color: #64748b;
    margin-bottom: 6px;
  }
  .kpi-valor { font-size: 1.35rem; font-weight: 800; color: #0f172a; }
  .var { font-size: 0.72rem; font-weight: 700; margin-top: 4px; display: inline-block; }
  .var.up { color: #059669; }
  .var.down { color: #dc2626; }
  .var.estavel { color: #64748b; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 768px) { .grid-2 { grid-template-columns: 1fr; } }
  .bloco {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 16px 18px;
    margin-bottom: 16px;
  }
  .bloco h2 {
    font-size: 0.88rem;
    font-weight: 700;
    color: #334155;
    margin-bottom: 12px;
  }
  table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  th {
    text-align: left;
    background: #1e293b;
    color: #fff;
    padding: 8px 10px;
    font-size: 0.68rem;
    text-transform: uppercase;
  }
  th.r, td.r { text-align: right; }
  td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
  tr:nth-child(even) td { background: #f8fafc; }
  .barras { display: flex; flex-direction: column; gap: 8px; }
  .barra-linha { display: grid; grid-template-columns: 120px 1fr 90px; gap: 8px; align-items: center; }
  .barra-label {
    font-size: 0.72rem;
    color: #475569;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .barra-track { height: 10px; background: #e2e8f0; border-radius: 5px; overflow: hidden; }
  .barra-fill { height: 100%; border-radius: 5px; }
  .barra-valor { font-size: 0.72rem; font-weight: 700; text-align: right; color: #334155; }
  .vazio { color: #94a3b8; font-size: 0.82rem; font-style: italic; }
  .rodape {
    text-align: center;
    color: #94a3b8;
    font-size: 0.72rem;
    margin-top: 28px;
    padding-top: 16px;
    border-top: 1px solid #e2e8f0;
  }
  @media print {
    body { background: #fff; padding: 0; }
    .capa, .bloco, .kpi { break-inside: avoid; }
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
    <header class="capa">
      <h1>Dashboard Executivo</h1>
      <p class="sub"><strong>${esc(escopo)}</strong></p>
      <p class="sub">Período: ${esc(p.label)} (${fmtData(p.inicio)} — ${fmtData(p.fim)})</p>
      <span class="badge">${g.usandoEstimativa ? 'Valores estimados' : 'Dados reais'}</span>
      <p class="meta">
        Gerado em ${fmtData(m.dataGeracao)} às ${fmtHora(m.dataGeracao)} •
        ${m.totalRegistrosAtual.toLocaleString('pt-BR')} registros no período
      </p>
    </header>

    <div class="secao-titulo">Painel Financeiro</div>
    <div class="grid-kpi">
      ${cardKpi('Faturamento Total', f.faturamento.formatado, f.faturamento.variacao, true)}
      ${cardKpi('Custo Operacional', f.custoOperacional.formatado, f.custoOperacional.variacao)}
      ${cardKpi('Margem Bruta', f.margemBruta.formatado, f.margemBruta.variacao)}
      ${cardKpi('Ticket Médio', f.ticketMedio.formatado, f.ticketMedio.variacao)}
      ${cardKpi('Receita / Hora', f.receitaHora.formatado, f.receitaHora.variacao)}
    </div>

    <div class="secao-titulo">Painel Operacional</div>
    <div class="grid-kpi">
      ${cardKpi('Tonelagem', o.tonelagem.formatado, o.tonelagem.variacao)}
      ${cardKpi('KM Rodados', o.kmRodados.formatado, o.kmRodados.variacao)}
      ${cardKpi('Viagens', o.viagens.formatado, o.viagens.variacao)}
      ${cardKpi('Coletores Ativos', o.coletoresAtivos.formatado, o.coletoresAtivos.variacao)}
      ${cardKpi('Horas Produtivas', o.horasProdutivas.formatado, o.horasProdutivas.variacao)}
      ${cardKpi('Eficiência (t/km)', o.eficiencia.formatado, o.eficiencia.variacao)}
    </div>

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
