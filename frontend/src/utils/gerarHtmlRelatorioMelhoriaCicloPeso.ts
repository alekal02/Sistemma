import { toneladasDoPesoKg } from '@sistemma/shared';
import type { CompararPorTipoServico } from '../services/servicoService';
import { CORES_SERVICO_PESO, fmtIntPeso, fmtNumPeso } from './analisePesoComparativoMetricas';
import { formatarDataArquivoPdf } from './gerarNomePdf';
import { rotuloOcorrenciaDiaSemana } from './melhoriaCicloOperacao';
import {
  alinharDiasCicloAnteriorAtual,
  montarMelhoriaCicloAnteriorAtual,
  type DiaComparadoCiclo,
  type ResumoMelhoriaCiclo,
} from './melhoriaCicloPeso';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isoBr(iso?: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const sem = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][new Date(y, m - 1, d).getDay()] || '';
  const br = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  return sem ? `${sem} ${br}` : br;
}

function labelColuna(r: ResumoMelhoriaCiclo): string {
  const contrato = r.servico.contratoNome || '—';
  return `${contrato} · ${r.servico.nome}`;
}

function periodoTxt(r: ResumoMelhoriaCiclo): string {
  return r.servico.periodo?.label || '—';
}

function deltaTxt(atual: number, ant: number, dec = 1, sufixo = ''): { html: string; cor: string } {
  const d = Math.round((atual - ant) * (10 ** dec)) / (10 ** dec);
  if (d === 0) return { html: '0', cor: '#64748b' };
  const sinal = d > 0 ? '+' : '−';
  const cor = d > 0 ? '#15803d' : '#b91c1c';
  return {
    html: `${sinal} ${fmtNumPeso(Math.abs(d), dec)}${sufixo}`,
    cor,
  };
}

function cardCiclo(r: ResumoMelhoriaCiclo, titulo: string, cor: string): string {
  const tonAbs = fmtNumPeso(Math.abs(r.resultadoTon), 2);
  const sinal = r.resultadoTon < 0 ? '−' : r.resultadoTon > 0 ? '+' : '';
  const corCenario = r.cenario === 'PERDA' ? '#b91c1c' : r.cenario === 'SUPERÁVIT' ? '#15803d' : '#64748b';
  const viagensTxt = r.cenario === 'PERDA'
    ? `${fmtNumPeso(r.viagensEvitaveis, 1)} viagens evitáveis`
    : r.viagensEquivalentes != null && r.viagensEquivalentes > 0
      ? `${fmtNumPeso(r.viagensEquivalentes, 1)} viagens equiv.`
      : '0 viagens evitáveis';
  return `
    <div class="card" style="border-top:3px solid ${cor}">
      <div class="card-tag">${esc(titulo)}</div>
      <div class="card-titulo">${esc(labelColuna(r))}</div>
      <div class="card-periodo">${esc(periodoTxt(r))}</div>
      <div class="card-grid">
        <div><span class="k">Viagens no ciclo</span><span class="v">${fmtIntPeso(r.numeroViagens)}</span></div>
        <div><span class="k">Dias decorridos do ciclo</span><span class="v">${r.diasDecorridos > 0 ? fmtIntPeso(r.diasDecorridos) : '—'}</span></div>
        <div><span class="k">Dias com operação</span><span class="v">${r.diasOperados > 0 ? fmtIntPeso(r.diasOperados) : '—'}</span></div>
        <div><span class="k">Média viagens/dia do ciclo</span><span class="v">${r.diasDecorridos > 0 ? fmtNumPeso(r.mediaViagensPorDia, 1) : '—'}</span></div>
        <div><span class="k">Peso médio/viagem</span><span class="v">${fmtNumPeso(r.pesoMedioKg, 2)} kg</span></div>
        <div><span class="k">Peso médio/dia do ciclo</span><span class="v">${r.diasDecorridos > 0 ? `${fmtNumPeso(r.mediaPesoPorDiaKg / 1000, 2)} t` : '—'}</span></div>
        <div><span class="k">Toneladas no ciclo</span><span class="v">${fmtNumPeso(r.toneladas, 2)} t</span></div>
        <div><span class="k">Peso ideal</span><span class="v">${fmtNumPeso(r.pesoIdealKg, 2)} kg</span></div>
        <div><span class="k">Cenário / Resultado</span><span class="v" style="color:${corCenario}">${esc(r.cenario)} · ${sinal}${tonAbs} TON</span></div>
        <div class="span2"><span class="k">Aterro (RESULTADO ÷ IDEAL)</span><span class="v" style="color:${corCenario}">${esc(viagensTxt)}</span></div>
      </div>
    </div>`;
}

function tabelaOperacao(d: { de: ResumoMelhoriaCiclo; para: ResumoMelhoriaCiclo }): string {
  const linhas: Array<{ k: string; ant: string; atu: string; delta: { html: string; cor: string } }> = [
    {
      k: 'Viagens no ciclo',
      ant: fmtIntPeso(d.de.numeroViagens),
      atu: fmtIntPeso(d.para.numeroViagens),
      delta: deltaTxt(d.para.numeroViagens, d.de.numeroViagens, 0),
    },
    {
      k: 'Dias decorridos do ciclo',
      ant: d.de.diasDecorridos > 0 ? fmtIntPeso(d.de.diasDecorridos) : '—',
      atu: d.para.diasDecorridos > 0 ? fmtIntPeso(d.para.diasDecorridos) : '—',
      delta: deltaTxt(d.para.diasDecorridos, d.de.diasDecorridos, 0),
    },
    {
      k: 'Dias com operação',
      ant: d.de.diasOperados > 0 ? fmtIntPeso(d.de.diasOperados) : '—',
      atu: d.para.diasOperados > 0 ? fmtIntPeso(d.para.diasOperados) : '—',
      delta: deltaTxt(d.para.diasOperados, d.de.diasOperados, 0),
    },
    {
      k: 'Média de viagens / dia do ciclo',
      ant: d.de.diasDecorridos > 0 ? fmtNumPeso(d.de.mediaViagensPorDia, 1) : '—',
      atu: d.para.diasDecorridos > 0 ? fmtNumPeso(d.para.mediaViagensPorDia, 1) : '—',
      delta: deltaTxt(d.para.mediaViagensPorDia, d.de.mediaViagensPorDia, 1),
    },
    {
      k: 'Peso médio por viagem (kg)',
      ant: fmtNumPeso(d.de.pesoMedioKg, 2),
      atu: fmtNumPeso(d.para.pesoMedioKg, 2),
      delta: deltaTxt(d.para.pesoMedioKg, d.de.pesoMedioKg, 2, ' kg'),
    },
    {
      k: 'Peso médio / dia do ciclo (t)',
      ant: d.de.diasDecorridos > 0 ? fmtNumPeso(d.de.mediaPesoPorDiaKg / 1000, 2) : '—',
      atu: d.para.diasDecorridos > 0 ? fmtNumPeso(d.para.mediaPesoPorDiaKg / 1000, 2) : '—',
      delta: deltaTxt(d.para.mediaPesoPorDiaKg / 1000, d.de.mediaPesoPorDiaKg / 1000, 2, ' t'),
    },
    {
      k: 'Toneladas coletadas',
      ant: fmtNumPeso(d.de.toneladas, 2),
      atu: fmtNumPeso(d.para.toneladas, 2),
      delta: deltaTxt(d.para.toneladas, d.de.toneladas, 2, ' t'),
    },
  ];
  return linhas.map((l) => `
    <tr>
      <td>${esc(l.k)}</td>
      <td class="c">${l.ant}</td>
      <td class="c">${l.atu}</td>
      <td class="c" style="color:${l.delta.cor};font-weight:800">${l.delta.html}</td>
    </tr>`).join('');
}

function celDelta(atual: number | null, ant: number | null, dec: number, sufixo = ''): string {
  if (atual == null || ant == null) return '<span class="muted">—</span>';
  const { html, cor } = deltaTxt(atual, ant, dec, sufixo);
  return `<span style="color:${cor};font-weight:700">${html}</span>`;
}

function tabelaDiaria(dias: DiaComparadoCiclo[]): string {
  if (dias.length === 0) {
    return '<p class="vazio-dia">Série diária indisponível neste ciclo (atualize o backend para 2.6.12+).</p>';
  }
  const linhas = dias.map((d) => {
    const ant = d.ant;
    const atu = d.atual;
    return `<tr>
      <td class="c">${esc(rotuloOcorrenciaDiaSemana(d.diaSemana, d.ocorrencia))}</td>
      <td>${isoBr(ant?.data)}</td>
      <td class="c">${ant ? fmtIntPeso(ant.viagens) : '—'}</td>
      <td class="r">${ant ? fmtNumPeso(ant.pesoMedioKg, 0) : '—'}</td>
      <td class="r">${ant ? fmtNumPeso(toneladasDoPesoKg(ant.pesoTotalKg), 2) : '—'}</td>
      <td>${isoBr(atu?.data)}</td>
      <td class="c">${atu ? fmtIntPeso(atu.viagens) : '—'}</td>
      <td class="r">${atu ? fmtNumPeso(atu.pesoMedioKg, 0) : '—'}</td>
      <td class="r">${atu ? fmtNumPeso(toneladasDoPesoKg(atu.pesoTotalKg), 2) : '—'}</td>
      <td class="c">${celDelta(atu?.viagens ?? null, ant?.viagens ?? null, 0)}</td>
      <td class="r">${celDelta(atu?.pesoMedioKg ?? null, ant?.pesoMedioKg ?? null, 0, ' kg')}</td>
    </tr>`;
  }).join('');
  return `
    <table class="dia">
      <thead>
        <tr>
          <th rowspan="2">Dia da<br/>semana</th>
          <th colspan="4">Ciclo anterior</th>
          <th colspan="4">Ciclo atual</th>
          <th colspan="2">Variação</th>
        </tr>
        <tr>
          <th>Data</th><th>Viagens</th><th>Peso méd. (kg)</th><th>Ton</th>
          <th>Data</th><th>Viagens</th><th>Peso méd. (kg)</th><th>Ton</th>
          <th>Δ viagens</th><th>Δ peso méd.</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>`;
}

/**
 * PDF analítico — ciclo anterior × ciclo atual:
 * operação (viagens, peso/dia) + melhoria (RESULTADO ÷ peso ideal).
 */
export function gerarHtmlRelatorioMelhoriaCicloPeso(opts: {
  anterior: CompararPorTipoServico[];
  atual: CompararPorTipoServico[];
  tipoServicoLabel?: string;
  geradoEm?: Date;
}): string {
  const { resumosAnterior, resumosAtual, deltas } = montarMelhoriaCicloAnteriorAtual(
    opts.anterior,
    opts.atual,
  );
  if (deltas.length === 0) return '';

  const tipoLabel = opts.tipoServicoLabel || 'Coleta com caminhão';
  const gerado = opts.geradoEm ?? new Date();
  const dataGeracao = gerado.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  const horaGeracao = gerado.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const totalVgAnt = resumosAnterior.reduce((s, r) => s + r.numeroViagens, 0);
  const totalVgAtual = resumosAtual.reduce((s, r) => s + r.numeroViagens, 0);
  const totalTonAnt = resumosAnterior.reduce((s, r) => s + r.toneladas, 0);
  const totalTonAtual = resumosAtual.reduce((s, r) => s + r.toneladas, 0);
  const totalEvitAnt = resumosAnterior.reduce((s, r) => s + r.viagensEvitaveis, 0);
  const totalEvitAtual = resumosAtual.reduce((s, r) => s + r.viagensEvitaveis, 0);
  const deltaTotal = Math.round((totalEvitAnt - totalEvitAtual) * 10) / 10;
  const dVg = deltaTxt(totalVgAtual, totalVgAnt, 0);
  const dTon = deltaTxt(totalTonAtual, totalTonAnt, 2, ' t');

  const paresHtml = deltas.map((d, idx) => {
    const cor = CORES_SERVICO_PESO[idx % CORES_SERVICO_PESO.length];
    const dias = alinharDiasCicloAnteriorAtual(d.de.servico, d.para.servico);
    return `
      <div class="par">
        <div class="par-titulo">${esc(labelColuna(d.para))}</div>
        <div class="cards-par">
          ${cardCiclo(d.de, 'Ciclo anterior', '#94a3b8')}
          <div class="seta">→</div>
          ${cardCiclo(d.para, 'Ciclo atual', cor)}
        </div>
        <h3>Operação comparada (mês anterior × mês atual)</h3>
        <table>
          <thead>
            <tr>
              <th>Indicador</th>
              <th>Ciclo anterior</th>
              <th>Ciclo atual</th>
              <th>Variação</th>
            </tr>
          </thead>
          <tbody>${tabelaOperacao(d)}</tbody>
        </table>
        <h3>Viagens e peso por dia da semana</h3>
        <p class="nota-dia">Cada linha é o mesmo dia relativo do ciclo (1º dia × 1º dia), para comparar os meses mesmo com datas diferentes.</p>
        ${tabelaDiaria(dias)}
      </div>`;
  }).join('');

  const linhasDelta = deltas.map((d) => {
    const cor = d.houveMelhoria ? '#15803d' : d.deltaViagensEvitaveis < 0 ? '#b91c1c' : '#64748b';
    const deltaV = d.deltaViagensEvitaveis;
    const deltaVTxt = deltaV > 0
      ? `− ${fmtNumPeso(deltaV, 1)} viagens evitáveis (melhoria)`
      : deltaV < 0
        ? `+ ${fmtNumPeso(Math.abs(deltaV), 1)} viagens evitáveis (piora)`
        : 'sem mudança nas viagens evitáveis';
    return `
      <tr>
        <td>${esc(labelColuna(d.para))}</td>
        <td>${esc(periodoTxt(d.de))}</td>
        <td>${esc(periodoTxt(d.para))}</td>
        <td class="c">${fmtIntPeso(d.de.numeroViagens)} → ${fmtIntPeso(d.para.numeroViagens)}</td>
        <td class="r">${fmtNumPeso(d.de.pesoMedioKg, 0)} → ${fmtNumPeso(d.para.pesoMedioKg, 0)} kg</td>
        <td style="color:${cor};font-weight:800">${fmtNumPeso(d.deltaResultadoTon, 2)} TON</td>
        <td style="color:${cor};font-weight:800">${esc(deltaVTxt)}</td>
        <td>${esc(d.textoResumo)}</td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 8.5px; color: #1e293b; padding: 12px 14px; line-height: 1.35; }
    .header {
      display: flex; justify-content: space-between; gap: 12px;
      background: #0f172a; color: #fff;
      border-radius: 8px; padding: 12px 14px; margin-bottom: 10px;
    }
    .header h1 { font-size: 13px; font-weight: 800; color: #fbbf24; }
    .header .sub { font-size: 8px; color: #94a3b8; margin-top: 4px; }
    .header .meta { font-size: 7px; color: #64748b; text-align: right; }
    .aviso {
      background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
      padding: 7px 10px; margin-bottom: 10px; font-size: 7.5px; color: #334155;
    }
    .resumo { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; margin-bottom: 12px; }
    .resumo .box {
      background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 7px; text-align: center;
    }
    .resumo .n { font-size: 14px; font-weight: 800; color: #0f172a; }
    .resumo .l { font-size: 6.5px; color: #64748b; margin-top: 2px; text-transform: uppercase; font-weight: 700; }
    .par { margin-bottom: 14px; page-break-inside: avoid; }
    .par-titulo { font-size: 10px; font-weight: 800; color: #334155; margin-bottom: 6px; }
    .cards-par { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: stretch; margin-bottom: 8px; }
    .seta { display: flex; align-items: center; font-size: 16px; font-weight: 800; color: #6366f1; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; }
    .card-tag { font-size: 6px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
    .card-titulo { font-size: 8px; font-weight: 800; color: #0f172a; margin-top: 2px; }
    .card-periodo { font-size: 7px; color: #64748b; margin: 2px 0 6px; }
    .card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 8px; }
    .span2 { grid-column: 1 / -1; }
    .k { display: block; font-size: 6px; color: #64748b; text-transform: uppercase; font-weight: 700; }
    .v { display: block; font-size: 8.5px; font-weight: 800; color: #0f172a; }
    h2 { font-size: 11px; font-weight: 800; color: #334155; margin: 10px 0 6px; border-bottom: 2px solid #6366f1; padding-bottom: 3px; }
    h3 { font-size: 9px; font-weight: 800; color: #475569; margin: 10px 0 4px; }
    .nota-dia { font-size: 7px; color: #64748b; margin-bottom: 4px; }
    .vazio-dia { font-size: 8px; color: #94a3b8; padding: 6px 0; }
    table { width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; margin-bottom: 6px; }
    th { background: #1e293b; color: #fff; padding: 4px 5px; text-align: left; font-size: 6.5px; }
    td { padding: 4px 5px; border-bottom: 1px solid #f1f5f9; font-size: 7.5px; vertical-align: top; }
    .c { text-align: center; }
    .r { text-align: right; }
    .muted { color: #94a3b8; }
    table.dia th { font-size: 6px; }
    table.dia td { font-size: 7px; white-space: nowrap; }
    .footer { margin-top: 10px; font-size: 6px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Relatório analítico da operação — ciclo anterior × ciclo atual</h1>
      <div class="sub">${esc(tipoLabel)} — ${deltas.length} serviço${deltas.length > 1 ? 's' : ''} · viagens, peso por dia e melhoria de carga</div>
    </div>
    <div class="meta">Gerado em ${esc(dataGeracao)} · ${esc(horaGeracao)}<br/>Ref. ${esc(formatarDataArquivoPdf(gerado))}</div>
  </div>

  <div class="aviso">
    Comparação mês a mês do mesmo contrato/serviço. A tabela diária alinha o <strong>dia da semana</strong>
    (1ª segunda com 1ª segunda, 1º domingo com 1º domingo). Peso médio = toneladas ÷ viagens do dia.
    Viagens evitáveis = |RESULTADO TON| × 1000 ÷ peso ideal, quando o cenário é PERDA.
  </div>

  <div class="resumo">
    <div class="box">
      <div class="n">${fmtIntPeso(totalVgAnt)} → ${fmtIntPeso(totalVgAtual)}</div>
      <div class="l">Viagens (anterior → atual)</div>
      <div class="l" style="color:${dVg.cor}">${dVg.html}</div>
    </div>
    <div class="box">
      <div class="n">${fmtNumPeso(totalTonAnt, 1)} → ${fmtNumPeso(totalTonAtual, 1)}</div>
      <div class="l">Toneladas (anterior → atual)</div>
      <div class="l" style="color:${dTon.cor}">${dTon.html}</div>
    </div>
    <div class="box">
      <div class="n">${fmtNumPeso(totalEvitAnt, 1)} → ${fmtNumPeso(totalEvitAtual, 1)}</div>
      <div class="l">Viagens evitáveis (aterro)</div>
    </div>
    <div class="box">
      <div class="n" style="color:${deltaTotal > 0 ? '#15803d' : deltaTotal < 0 ? '#b91c1c' : '#0f172a'}">
        ${deltaTotal > 0 ? '−' : deltaTotal < 0 ? '+' : ''}${fmtNumPeso(Math.abs(deltaTotal), 1)}
      </div>
      <div class="l">${deltaTotal > 0 ? 'Melhoria (menos idas evitáveis)' : deltaTotal < 0 ? 'Piora (mais idas evitáveis)' : 'Sem mudança na perda'}</div>
    </div>
  </div>

  ${paresHtml}

  <h2>Síntese da melhoria (anterior → atual)</h2>
  <table>
    <thead>
      <tr>
        <th>Serviço / contrato</th>
        <th>Ciclo anterior</th>
        <th>Ciclo atual</th>
        <th>Viagens</th>
        <th>Peso médio</th>
        <th>Δ Resultado (TON)</th>
        <th>Δ Viagens aterro evitáveis</th>
        <th>Leitura</th>
      </tr>
    </thead>
    <tbody>
      ${linhasDelta}
    </tbody>
  </table>

  <div class="footer">SistemMA — Relatório analítico ciclo anterior × atual (viagens, peso/dia e RESULTADO ÷ peso ideal)</div>
</body>
</html>`;
}
