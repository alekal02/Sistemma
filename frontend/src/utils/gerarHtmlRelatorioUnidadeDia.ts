/**
 * HTML do PDF — relatório diário de serviços por unidade
 * (capina / varrição / poda / pintura), com dados da planilha.
 */
import { formatarIsoParaBr } from './periodoDados';
import { fmtNum } from './relatorioDiario';
import {
  formatarMetricaUnidade,
  metricaPrincipalDoDia,
  unidadeOperacionalDoTipo,
} from './unidadeServico';

export interface ParamsRelatorioUnidadeDia {
  servicoNome: string;
  contratoNome?: string;
  dataIso: string;
  diaSemana?: string;
  tipoServico: string;
  agregacao: {
    areaM2?: number;
    metroLinear?: number;
    kmLinear?: number;
    qtdArvore?: number;
    quantitativo?: number;
    rotas?: number;
  };
  registros: Record<string, unknown>[];
  totalRegistros: number;
  kpisOperacao?: Array<{
    id?: string;
    nome: string;
    label?: string;
    valor: number | string | null;
    unidade?: string;
  }>;
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
    color: #fff;
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 8px;
    page-break-inside: avoid;
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
    page-break-inside: avoid;
  }
  .secao { margin-bottom: 10px; page-break-inside: avoid; }
  .sec {
    font-size: 6.5px; font-weight: 800; color: #64748b;
    text-transform: uppercase; margin: 0 0 4px; letter-spacing: 0.03em;
  }
  .hero-dark {
    background: linear-gradient(135deg,#0f766e,#134e4a);
    border: 1px solid #0f766e; border-radius: 8px;
    padding: 8px 10px; color: #fff; margin-bottom: 8px;
  }
  .hero-dark .lbl { font-size: 6px; font-weight: 600; color: #5eead4; text-transform: uppercase; }
  .hero-dark .val { font-size: 18px; font-weight: 900; color: #ccfbf1; font-family: monospace; white-space: nowrap; }
  .hero-dark .sub { font-size: 6.5px; color: #99f6e4; margin-top: 2px; }
  .cards-tbl { width: 100%; border-collapse: separate; border-spacing: 4px; margin-bottom: 8px; }
  .card {
    background: #fff; border: 1px solid #e2e8f0; border-top: 3px solid #14b8a6;
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
    padding: 3px 4px; background: #0f766e; color: #ccfbf1;
    font-size: 5.5px; text-transform: uppercase; text-align: left; font-weight: 700;
  }
  table.data th.c, table.data td.c { text-align: center; }
  table.data th.r, table.data td.r { text-align: right; }
  table.data td { padding: 3px 4px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  table.data tr { page-break-inside: avoid; }
  table.data tbody tr:nth-child(even) td { background: #f8fafc; }
  .bar-mini { display: block; height: 5px; background: #e2e8f0; border-radius: 3px; overflow: hidden; margin-top: 2px; }
  .bar-mini span { display: block; height: 5px; border-radius: 3px; background: #14b8a6; }
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

function numDe(r: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = r[k];
    if (v == null || v === '') continue;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (!isNaN(n) && n > 0) return n;
  }
  return 0;
}

function textoDe(r: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v == null || v === '') continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

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

function agrupar(
  registros: Record<string, unknown>[],
  chaveKeys: string[],
  valorFn: (r: Record<string, unknown>) => number,
): Array<{ label: string; registros: number; valor: number }> {
  const map = new Map<string, { registros: number; valor: number }>();
  for (const r of registros) {
    const label = textoDe(r, chaveKeys) || '—';
    const cur = map.get(label) || { registros: 0, valor: 0 };
    cur.registros += 1;
    cur.valor += valorFn(r);
    map.set(label, cur);
  }
  return [...map.entries()]
    .map(([label, v]) => ({ label, ...v }))
    .filter((x) => x.valor > 0 && x.label !== '—')
    .sort((a, b) => b.valor - a.valor);
}

function tabelaRanking(
  titulo: string,
  linhas: Array<{ label: string; registros: number; valor: number }>,
  total: number,
  sufixo: string,
): string {
  const top = linhas.slice(0, 12);
  if (!top.length) return '';
  const max = Math.max(total, top[0]?.valor || 0.01, 0.01);
  return `
    <div class="bloco">
      <div class="bloco-hd">${esc(titulo)}</div>
      <table class="data">
        <thead>
          <tr>
            <th style="width:42%">Nome</th>
            <th class="c" style="width:14%">Reg.</th>
            <th class="r" style="width:22%">Métrica</th>
            <th style="width:22%">Participação</th>
          </tr>
        </thead>
        <tbody>
          ${top.map((l) => {
            const pctBar = Math.max(3, Math.round((l.valor / max) * 100));
            const part = total > 0 ? (l.valor / total) * 100 : 0;
            const nome = l.label.length > 28 ? `${l.label.slice(0, 28)}…` : l.label;
            return `
              <tr>
                <td>${esc(nome)}</td>
                <td class="c">${fmtNum(l.registros, 0)}</td>
                <td class="r">${esc(formatarMetricaUnidade(l.valor, sufixo))}</td>
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

function labelTipo(tipo: string): string {
  switch (tipo) {
    case 'capina': return 'Capina';
    case 'varricao': return 'Varrição';
    case 'poda': return 'Poda';
    case 'pintura_meio_fio': return 'Pintura';
    default: return unidadeOperacionalDoTipo(tipo).labelMetrica;
  }
}

export function gerarHtmlRelatorioUnidadeDia(p: ParamsRelatorioUnidadeDia): string {
  const unidade = unidadeOperacionalDoTipo(p.tipoServico);
  const metrica = metricaPrincipalDoDia(p.tipoServico, p.agregacao);
  const totalRegs = p.totalRegistros || p.agregacao.rotas || p.registros.length;
  const geradoEm = new Date().toLocaleString('pt-BR');
  const tipoLabel = labelTipo(p.tipoServico);

  const valorLinha = (r: Record<string, unknown>) => metricaPrincipalDoDia(p.tipoServico, {
    areaM2: numDe(r, ['Area m²', 'AREA_M2']),
    metroLinear: numDe(r, ['Metro Linear', 'METRO_LINEAR', 'COMPRIMENTO']),
    kmLinear: numDe(r, ['KM Linear', 'KM_LINEAR', 'QUILOMETROS_VARRIDOS']),
    qtdArvore: numDe(r, ['Quantidade de Arvore', 'QTD_ARVORE']),
    quantitativo: numDe(r, ['QUANTITATIVO']),
  }).valor;

  const porBairro = agrupar(p.registros, ['BAIRRO', 'bairro', 'Setor', 'SETOR', 'regional'], valorLinha);
  const porEquipe = agrupar(p.registros, ['Equipe', 'EQUIPE', 'turno'], valorLinha);
  const porOperador = agrupar(p.registros, ['Operador', 'OPERADOR', 'Funcionario', 'FUNCIONARIO'], valorLinha);

  const cards = cardsHtml([
    { label: 'Registros', valor: fmtNum(totalRegs, 0), cor: '#6366f1' },
    { label: metrica.label, valor: formatarMetricaUnidade(metrica.valor, metrica.sufixo || unidade.sufixo), cor: '#14b8a6' },
    ...(Number(p.agregacao.quantitativo || 0) > 0
      ? [{
          label: 'Quantitativo planilha',
          valor: Number(p.agregacao.quantitativo).toLocaleString('pt-BR', { maximumFractionDigits: 3 }),
          cor: '#0ea5e9',
        }]
      : []),
    ...(p.tipoServico === 'capina' && Number(p.agregacao.kmLinear || 0) > 0 && metrica.sufixo !== 'km'
      ? [{ label: 'Extensão', valor: formatarMetricaUnidade(Number(p.agregacao.kmLinear), 'km'), cor: '#f59e0b' }]
      : []),
    ...(p.tipoServico === 'capina' && Number(p.agregacao.metroLinear || 0) > 0 && metrica.sufixo !== 'm'
      ? [{ label: 'Metro linear', valor: formatarMetricaUnidade(Number(p.agregacao.metroLinear), 'm'), cor: '#22c55e' }]
      : []),
    { label: 'Bairros', valor: String(porBairro.length || 0), cor: '#8b5cf6' },
    { label: 'Equipes', valor: String(porEquipe.length || 0), cor: '#ef4444' },
    { label: 'Operadores', valor: String(porOperador.length || 0), cor: '#64748b' },
  ]);

  const kpis = (p.kpisOperacao || []).filter((k) => k.valor != null && k.valor !== '').slice(0, 8);
  const kpisHtml = kpis.length
    ? cardsHtml(kpis.map((k, i) => ({
        label: k.label || k.nome,
        valor: `${Number(k.valor).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${k.unidade ? ` ${k.unidade}` : ''}`,
        cor: ['#14b8a6', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444', '#22c55e', '#6366f1', '#64748b'][i % 8],
      })))
    : '';

  const sufixo = metrica.sufixo || unidade.sufixo;
  const totalMetrica = metrica.valor || porBairro.reduce((s, x) => s + x.valor, 0);

  const tabelaRegs = p.registros.slice(0, 40);
  const tabelaHtml = tabelaRegs.length
    ? `
      <div class="bloco">
        <div class="bloco-hd">Registros do dia${p.registros.length > 40 ? ` (top 40 de ${p.registros.length})` : ''}</div>
        <table class="data">
          <thead>
            <tr>
              <th style="width:26%">Logradouro</th>
              <th style="width:18%">Bairro</th>
              <th class="c" style="width:8%">UND</th>
              <th class="r" style="width:12%">Qtd</th>
              <th class="r" style="width:14%">${esc(metrica.label)}</th>
              <th style="width:11%">Equipe</th>
              <th style="width:11%">Operador</th>
            </tr>
          </thead>
          <tbody>
            ${tabelaRegs.map((r) => {
              const m = metricaPrincipalDoDia(p.tipoServico, {
                areaM2: numDe(r, ['Area m²', 'AREA_M2']),
                metroLinear: numDe(r, ['Metro Linear', 'METRO_LINEAR', 'COMPRIMENTO']),
                kmLinear: numDe(r, ['KM Linear', 'KM_LINEAR']),
                qtdArvore: numDe(r, ['Quantidade de Arvore', 'QTD_ARVORE']),
                quantitativo: numDe(r, ['QUANTITATIVO']),
              });
              const q = numDe(r, ['QUANTITATIVO']);
              const log = textoDe(r, ['LOGRADOURO', 'logradouro', 'distrito', 'Avenida / Rua']) || '—';
              const bairro = textoDe(r, ['BAIRRO', 'bairro', 'Setor', 'regional']) || '—';
              return `
                <tr>
                  <td>${esc(log.length > 32 ? `${log.slice(0, 32)}…` : log)}</td>
                  <td>${esc(bairro.length > 22 ? `${bairro.slice(0, 22)}…` : bairro)}</td>
                  <td class="c">${esc(textoDe(r, ['UND', '_undNormalizada']) || '—')}</td>
                  <td class="r">${q > 0 ? q.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '—'}</td>
                  <td class="r">${esc(formatarMetricaUnidade(m.valor, m.sufixo || sufixo))}</td>
                  <td>${esc(textoDe(r, ['Equipe', 'EQUIPE', 'turno']) || '—')}</td>
                  <td>${esc(textoDe(r, ['Operador', 'OPERADOR', 'Funcionario']) || '—')}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Relatório Diário ${esc(tipoLabel)} — ${esc(p.servicoNome)} — ${esc(formatarIsoParaBr(p.dataIso))}</title>
  <style>${ESTILOS}</style>
</head>
<body>
  <div class="header">
    <h1>${esc(p.servicoNome)}</h1>
    <div class="sub">${p.contratoNome ? `${esc(p.contratoNome)} · ` : ''}${formatarIsoParaBr(p.dataIso)}${p.diaSemana ? ` · ${esc(p.diaSemana)}` : ''}</div>
    <span class="tipo">${esc(tipoLabel)} · Relatório diário</span>
  </div>

  <div class="banner">
    Relatório do dia com quantitativos importados da planilha (DATA, UND, QUANTITATIVO, TIPO DE SERVIÇO).
  </div>

  <div class="hero-dark">
    <div class="lbl">${esc(metrica.label)} no dia</div>
    <div class="val">${esc(formatarMetricaUnidade(metrica.valor, metrica.sufixo || unidade.sufixo))}</div>
    <div class="sub">
      ${fmtNum(totalRegs, 0)} registro(s)
      ${Number(p.agregacao.quantitativo || 0) > 0
        ? ` · Quantitativo ${Number(p.agregacao.quantitativo).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}`
        : ''}
      · ${porBairro.length} bairro(s)
    </div>
  </div>

  <div class="secao">
    <div class="sec">Indicadores do dia</div>
    ${cards}
  </div>

  ${kpisHtml ? `
    <div class="secao">
      <div class="sec">KPIs da operação</div>
      ${kpisHtml}
    </div>` : ''}

  <table class="layout2-tbl">
    <tr>
      <td>${tabelaRanking('Por bairro', porBairro, totalMetrica, sufixo)}</td>
      <td>${tabelaRanking('Por equipe', porEquipe, totalMetrica, sufixo)}</td>
    </tr>
    <tr>
      <td>${tabelaRanking('Por operador', porOperador, totalMetrica, sufixo)}</td>
      <td></td>
    </tr>
  </table>

  ${tabelaHtml}

  <div class="footer">
    Sistemma · Relatório diário de ${esc(tipoLabel.toLowerCase())} · Gerado em ${esc(geradoEm)}
  </div>
</body>
</html>`;
}
