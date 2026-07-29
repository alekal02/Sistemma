import type { CompararPorTipoServico } from '../services/servicoService';
import { CORES_SERVICO_PESO, fmtNumPeso } from './analisePesoComparativoMetricas';
import { formatarDataArquivoPdf } from './gerarNomePdf';
import {
  montarMelhoriaCicloAnteriorAtual,
  type ResumoMelhoriaCiclo,
} from './melhoriaCicloPeso';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function labelColuna(r: ResumoMelhoriaCiclo): string {
  const contrato = r.servico.contratoNome || '—';
  return `${contrato} · ${r.servico.nome}`;
}

function periodoTxt(r: ResumoMelhoriaCiclo): string {
  return r.servico.periodo?.label || '—';
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
        <div><span class="k">Cenário</span><span class="v" style="color:${corCenario}">${esc(r.cenario)}</span></div>
        <div><span class="k">Resultado</span><span class="v" style="color:${corCenario}">${sinal} ${tonAbs} TON</span></div>
        <div><span class="k">Peso ideal</span><span class="v">${fmtNumPeso(r.pesoIdealKg, 2)} kg</span></div>
        <div><span class="k">Peso médio</span><span class="v">${fmtNumPeso(r.pesoMedioKg, 2)} kg</span></div>
        <div><span class="k">Viagens no ciclo</span><span class="v">${r.numeroViagens.toLocaleString('pt-BR')}</span></div>
        <div><span class="k">Aterro (RESULTADO ÷ IDEAL)</span><span class="v" style="color:${corCenario}">${esc(viagensTxt)}</span></div>
      </div>
    </div>`;
}

/**
 * PDF — melhoria ciclo anterior → ciclo atual.
 * RESULTADO (TON) ÷ peso ideal → viagens ao aterro sem necessidade (PERDA).
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

  const paresHtml = deltas.map((d, idx) => {
    const cor = CORES_SERVICO_PESO[idx % CORES_SERVICO_PESO.length];
    return `
      <div class="par">
        <div class="par-titulo">${esc(labelColuna(d.para))}</div>
        <div class="cards-par">
          ${cardCiclo(d.de, 'Ciclo anterior', '#94a3b8')}
          <div class="seta">→</div>
          ${cardCiclo(d.para, 'Ciclo atual', cor)}
        </div>
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
        <td style="color:${cor};font-weight:800">${fmtNumPeso(d.deltaResultadoTon, 2)} TON</td>
        <td style="color:${cor};font-weight:800">${esc(deltaVTxt)}</td>
        <td>${esc(d.textoResumo)}</td>
      </tr>`;
  }).join('');

  const totalEvitAnt = resumosAnterior.reduce((s, r) => s + r.viagensEvitaveis, 0);
  const totalEvitAtual = resumosAtual.reduce((s, r) => s + r.viagensEvitaveis, 0);
  const deltaTotal = Math.round((totalEvitAnt - totalEvitAtual) * 10) / 10;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9px; color: #1e293b; padding: 14px 16px; line-height: 1.4; }
    .header {
      display: flex; justify-content: space-between; gap: 12px;
      background: linear-gradient(135deg,#0f172a,#1e3a5f); color: #fff;
      border-radius: 10px; padding: 12px 14px; margin-bottom: 12px;
    }
    .header h1 { font-size: 14px; font-weight: 800; color: #fbbf24; }
    .header .sub { font-size: 8px; color: #94a3b8; margin-top: 4px; }
    .header .meta { font-size: 7px; color: #64748b; text-align: right; }
    .aviso {
      background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px;
      padding: 8px 10px; margin-bottom: 12px; font-size: 8px; color: #1e40af;
    }
    .resumo {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px;
    }
    .resumo .box {
      background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; text-align: center;
    }
    .resumo .n { font-size: 16px; font-weight: 800; color: #0f172a; }
    .resumo .l { font-size: 7px; color: #64748b; margin-top: 2px; text-transform: uppercase; font-weight: 700; }
    .par { margin-bottom: 14px; page-break-inside: avoid; }
    .par-titulo { font-size: 10px; font-weight: 800; color: #334155; margin-bottom: 6px; }
    .cards-par { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: stretch; }
    .seta { display: flex; align-items: center; font-size: 18px; font-weight: 800; color: #6366f1; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; }
    .card-tag { font-size: 6px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
    .card-titulo { font-size: 8px; font-weight: 800; color: #0f172a; margin-top: 2px; }
    .card-periodo { font-size: 7px; color: #64748b; margin: 2px 0 6px; }
    .card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 8px; }
    .k { display: block; font-size: 6px; color: #64748b; text-transform: uppercase; font-weight: 700; }
    .v { display: block; font-size: 9px; font-weight: 800; color: #0f172a; }
    h2 { font-size: 11px; font-weight: 800; color: #334155; margin: 8px 0; border-bottom: 2px solid #6366f1; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
    th { background: #1e293b; color: #fff; padding: 6px 7px; text-align: left; font-size: 7px; }
    td { padding: 6px 7px; border-bottom: 1px solid #f1f5f9; font-size: 8px; vertical-align: top; }
    .footer { margin-top: 12px; font-size: 6px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Relatório de melhoria — ciclo anterior × ciclo atual</h1>
      <div class="sub">${esc(tipoLabel)} — ${deltas.length} serviço${deltas.length > 1 ? 's' : ''} · RESULTADO ÷ peso ideal = viagens ao aterro</div>
    </div>
    <div class="meta">Gerado em ${esc(dataGeracao)} · ${esc(horaGeracao)}<br/>Ref. ${esc(formatarDataArquivoPdf(gerado))}</div>
  </div>

  <div class="aviso">
    <strong>Fórmula:</strong> viagens ao aterro sem necessidade =
    |RESULTADO (TON)| × 1000 ÷ PESO IDEAL (kg), quando o cenário é <strong>PERDA</strong> (peso médio abaixo do ideal).
    A melhoria é a redução dessas viagens do ciclo anterior para o ciclo atual (mês de medição − 1 → mês selecionado na tela).
  </div>

  <div class="resumo">
    <div class="box">
      <div class="n">${fmtNumPeso(totalEvitAnt, 1)}</div>
      <div class="l">Viagens evitáveis — ciclo anterior</div>
    </div>
    <div class="box">
      <div class="n">${fmtNumPeso(totalEvitAtual, 1)}</div>
      <div class="l">Viagens evitáveis — ciclo atual</div>
    </div>
    <div class="box">
      <div class="n" style="color:${deltaTotal > 0 ? '#15803d' : deltaTotal < 0 ? '#b91c1c' : '#0f172a'}">
        ${deltaTotal > 0 ? '−' : deltaTotal < 0 ? '+' : ''}${fmtNumPeso(Math.abs(deltaTotal), 1)}
      </div>
      <div class="l">${deltaTotal > 0 ? 'Melhoria (menos idas evitáveis)' : deltaTotal < 0 ? 'Piora (mais idas evitáveis)' : 'Sem mudança'}</div>
    </div>
  </div>

  ${paresHtml}

  <h2>Detalhe da melhoria (anterior → atual)</h2>
  <table>
    <thead>
      <tr>
        <th>Serviço / contrato</th>
        <th>Ciclo anterior</th>
        <th>Ciclo atual</th>
        <th>Δ Resultado (TON)</th>
        <th>Δ Viagens aterro evitáveis</th>
        <th>Leitura</th>
      </tr>
    </thead>
    <tbody>
      ${linhasDelta}
    </tbody>
  </table>

  <div class="footer">SistemMA — Melhoria ciclo anterior × atual (toneladas ÷ peso ideal = viagens equivalentes ao aterro)</div>
</body>
</html>`;
}
