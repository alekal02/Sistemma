/**
 * HTML do PDF — relatório diário de roçada (m²), com Manual × Mecanizada.
 */
import { formatarIsoParaBr } from './periodoDados';
import { fmtNum } from './relatorioDiario';
import {
  fmtAreaM2,
  type AnaliseRocadaDia,
  type LinhaRocadaAgrupada,
} from './operacaoRocada';

export interface BlocoTipoRocadaPdf {
  tipo: 'manual' | 'mecanizada';
  label: string;
  registros: number;
  areaM2: number;
  bairros: number;
  operadores: number;
  equipes: number;
  equipamentos: number;
  porBairro: LinhaRocadaAgrupada[];
  porOperador: LinhaRocadaAgrupada[];
  porEquipe: LinhaRocadaAgrupada[];
  porEquipamento: LinhaRocadaAgrupada[];
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
  .tipo-hd {
    display: flex; justify-content: space-between; align-items: baseline;
    padding: 6px 8px; border-radius: 6px 6px 0 0; color: #fff;
    font-weight: 800; font-size: 8px;
  }
  .tipo-hd .m2 { font-size: 11px; font-family: monospace; }
  .tipo-wrap {
    border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;
    margin-bottom: 8px; page-break-inside: avoid;
  }
  .tipo-body { padding: 6px 7px; }
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

function filtrarLinhasPdf(linhas: LinhaRocadaAgrupada[] | undefined): LinhaRocadaAgrupada[] {
  return (linhas || []).filter(
    (l) => l.areaM2 > 0 && l.label && l.label !== 'Não informado',
  );
}

function tabelaGrupoHtml(
  titulo: string,
  linhas: LinhaRocadaAgrupada[],
  maxArea: number,
  thColor = '#166534',
): string {
  const top = filtrarLinhasPdf(linhas).slice(0, 12);
  if (!top.length) return '';
  const max = Math.max(maxArea, 0.01);
  return `
    <div class="bloco">
      <div class="bloco-hd">${esc(titulo)}</div>
      <table class="data">
        <thead>
          <tr>
            <th style="width:42%;background:${thColor}">Nome</th>
            <th class="c" style="width:14%;background:${thColor}">Reg.</th>
            <th class="r" style="width:22%;background:${thColor}">Área (m²)</th>
            <th style="width:22%;background:${thColor}">Participação</th>
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
                  <span class="bar-mini"><span style="width:${pct}%;background:${thColor}"></span></span>
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function secaoTipoHtml(bloco: BlocoTipoRocadaPdf, cor: string): string {
  if (!bloco.registros && bloco.areaM2 <= 0) return '';
  const locais = filtrarLinhasPdf(bloco.porBairro);
  const segmentos = filtrarLinhasPdf(bloco.porOperador);
  const equipes = filtrarLinhasPdf(bloco.porEquipe);
  const equips = filtrarLinhasPdf(bloco.porEquipamento);
  return `
    <div class="tipo-wrap" style="border-color:${cor}55">
      <div class="tipo-hd" style="background:${cor}">
        <span>${esc(bloco.label)} · ${fmtNum(bloco.registros, 0)} registro(s)</span>
        <span class="m2">${fmtAreaM2(bloco.areaM2)} m²</span>
      </div>
      <div class="tipo-body">
        ${cardsHtml([
          { label: 'Locais', valor: String(bloco.bairros), cor },
          { label: 'Segmentos', valor: String(bloco.operadores), cor },
          { label: 'Equipes', valor: String(bloco.equipes), cor },
          { label: 'Equipamentos', valor: String(bloco.equipamentos), cor },
        ])}
        <table class="layout2-tbl">
          <tr>
            <td>${tabelaGrupoHtml('Locais', locais, bloco.areaM2, cor)}</td>
            <td>${tabelaGrupoHtml('Segmentos', segmentos, bloco.areaM2, cor)}</td>
          </tr>
          <tr>
            <td>${tabelaGrupoHtml('Equipes', equipes, bloco.areaM2, cor)}</td>
            <td>${tabelaGrupoHtml('Equipamentos', equips, bloco.areaM2, cor)}</td>
          </tr>
        </table>
      </div>
    </div>`;
}

export interface ParamsRelatorioRocadaDia {
  servicoNome: string;
  contratoNome?: string;
  dataIso: string;
  diaSemana?: string;
  analise: AnaliseRocadaDia;
  porTipo?: LinhaRocadaAgrupada[];
  blocoManual?: BlocoTipoRocadaPdf | null;
  blocoMecanizada?: BlocoTipoRocadaPdf | null;
  valorM2?: number | null;
  valorM2Manual?: number | null;
  valorM2Mecanizada?: number | null;
}

export function gerarHtmlRelatorioRocadaDia(p: ParamsRelatorioRocadaDia): string {
  const r = p.analise.resumo;
  const areaTotal = r.areaM2 || 0;
  const areaMan = r.areaManualM2 || p.blocoManual?.areaM2 || 0;
  const areaMec = r.areaMecanizadaM2 || p.blocoMecanizada?.areaM2 || 0;
  const regMan = r.registrosManual || p.blocoManual?.registros || 0;
  const regMec = r.registrosMecanizada || p.blocoMecanizada?.registros || 0;

  const vMan = Number(p.valorM2Manual || 0) > 0 ? Number(p.valorM2Manual) : Number(p.valorM2 || 0);
  const vMec = Number(p.valorM2Mecanizada || 0) > 0 ? Number(p.valorM2Mecanizada) : Number(p.valorM2 || 0);
  const receita = areaMan * vMan + areaMec * vMec
    + Math.max(0, areaTotal - areaMan - areaMec) * Number(p.valorM2 || vMan || vMec || 0);

  const geradoEm = new Date().toLocaleString('pt-BR');
  const porTipo = ((p.porTipo && p.porTipo.length > 0)
    ? p.porTipo
    : [
        ...(areaMan > 0 || regMan > 0
          ? [{ label: 'Manual', registros: regMan, areaM2: areaMan, chave: 'manual' }]
          : []),
        ...(areaMec > 0 || regMec > 0
          ? [{ label: 'Mecanizada', registros: regMec, areaM2: areaMec, chave: 'mecanizada' }]
          : []),
      ])
    .map((t) => ({
      ...t,
      label: /n[aã]o classificado/i.test(t.label) ? 'Roçada' : t.label,
    }))
    .filter((t) => t.areaM2 > 0);

  const cards = cardsHtml([
    { label: 'Área total', valor: `${fmtAreaM2(areaTotal)} m²`, cor: '#22c55e' },
    { label: 'Registros', valor: fmtNum(r.registros, 0), cor: '#6366f1' },
    ...(areaMan > 0
      ? [{ label: 'Manual', valor: `${fmtAreaM2(areaMan)} m² (${fmtNum(regMan, 0)})`, cor: '#0ea5e9' }]
      : []),
    ...(areaMec > 0
      ? [{ label: 'Mecanizada', valor: `${fmtAreaM2(areaMec)} m² (${fmtNum(regMec, 0)})`, cor: '#f59e0b' }]
      : []),
    { label: 'Bairros', valor: String(r.bairros), cor: '#14b8a6' },
    { label: 'Operadores', valor: String(r.operadores), cor: '#8b5cf6' },
    { label: 'Equipes', valor: String(r.equipes), cor: '#ef4444' },
    { label: 'Equipamentos', valor: String(r.equipamentos), cor: '#64748b' },
    ...(receita > 0
      ? [{
          label: 'Receita estimada',
          valor: receita.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
          cor: '#059669',
        }]
      : []),
  ]);

  const temSplit = Boolean(
    (p.blocoManual && (p.blocoManual.registros > 0 || p.blocoManual.areaM2 > 0))
    || (p.blocoMecanizada && (p.blocoMecanizada.registros > 0 || p.blocoMecanizada.areaM2 > 0)),
  );

  const porLocal = filtrarLinhasPdf(p.analise.porBairro);
  const porSegmento = filtrarLinhasPdf(p.analise.porOperador);
  const porEquipe = filtrarLinhasPdf(p.analise.porEquipe);
  const porEquip = filtrarLinhasPdf(p.analise.porEquipamento);
  const tituloLocal = porLocal.some((l) => /→/.test(l.label))
    ? 'Top locais por área'
    : 'Top locais / trechos / bairros por área';
  const tituloSegmento = porSegmento.some((l) => /→/.test(l.label))
    ? 'Top segmentos (início → término)'
    : 'Top operadores / endereços por área';
  const tituloEquipe = porEquipe.some((l) => /mensal|semanal|diario|diário|bimestral/i.test(l.label))
    ? 'Top periodicidade / equipes por área'
    : 'Top equipes por área';

  const rankingsGerais = !temSplit
    ? `
      <table class="layout2-tbl">
        <tr>
          <td>${tabelaGrupoHtml(tituloLocal, porLocal, areaTotal)}</td>
          <td>${tabelaGrupoHtml(tituloSegmento, porSegmento, areaTotal)}</td>
        </tr>
        <tr>
          <td>${tabelaGrupoHtml(tituloEquipe, porEquipe, areaTotal)}</td>
          <td>${tabelaGrupoHtml('Top equipamentos por área', porEquip, areaTotal)}</td>
        </tr>
      </table>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Relatório Diário Roçada — ${esc(p.servicoNome)} — ${esc(formatarIsoParaBr(p.dataIso))}</title>
  <style>${ESTILOS}</style>
</head>
<body>
  <div class="header">
    <h1>${esc(p.servicoNome)}</h1>
    <div class="sub">${p.contratoNome ? `${esc(p.contratoNome)} · ` : ''}${formatarIsoParaBr(p.dataIso)}${p.diaSemana ? ` · ${esc(p.diaSemana)}` : ''}</div>
    <span class="tipo">Roçada · Relatório diário</span>
  </div>

  <div class="banner">
    Relatório operacional do dia com área (m²) importada da planilha, separado por Manual e Mecanizada quando disponível.
  </div>

  <div class="hero-dark">
    <div class="lbl">Área total roçada no dia</div>
    <div class="val">${fmtAreaM2(areaTotal)} m²</div>
    <div class="sub">
      ${fmtNum(r.registros, 0)} registro(s)
      ${areaMan > 0 ? ` · Manual ${fmtAreaM2(areaMan)} m²` : ''}
      ${areaMec > 0 ? ` · Mecanizada ${fmtAreaM2(areaMec)} m²` : ''}
      · ${r.bairros} bairro(s)
      · ${r.operadores} operador(es)
    </div>
  </div>

  <div class="secao">
    <div class="sec">Indicadores do dia</div>
    ${cards}
  </div>

  ${porTipo.length > 0 ? tabelaGrupoHtml('Área por tipo de execução', porTipo, areaTotal) : ''}

  ${temSplit ? `
    <div class="secao">
      <div class="sec">Detalhamento por tipo</div>
      ${p.blocoManual ? secaoTipoHtml(p.blocoManual, '#0ea5e9') : ''}
      ${p.blocoMecanizada ? secaoTipoHtml(p.blocoMecanizada, '#f59e0b') : ''}
    </div>
  ` : rankingsGerais}

  <div class="footer">
    Sistemma · Relatório diário de roçada · Gerado em ${esc(geradoEm)}
  </div>
</body>
</html>`;
}
