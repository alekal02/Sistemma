/**
 * Relatório gerencial: melhoria do ciclo de operação (ciclo anterior × ciclo atual).
 * Linguagem e layout pensados para apresentação a gerentes de contrato.
 */
import type { PeriodoCicloContrato } from './periodoCicloContrato';
import { formatarIsoParaBr } from './periodoDados';
import { fmtNum, type DadoDiario } from './relatorioDiario';
import { formatarDataArquivoPdf } from './gerarNomePdf';
import { formatarMetricaUnidade } from './unidadeServico';
import {
  alinharDiasCicloOperacao,
  diaTemProducao,
  montarLeituraGerencial,
  resumirCicloOperacao,
  rotuloOcorrenciaDiaSemana,
  variacaoAbsPct,
  type ModoMelhoriaOperacao,
  type TotaisMelhoriaCiclo,
} from './melhoriaCicloOperacao';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function diaSemana(iso?: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][new Date(y, m - 1, d).getDay()] || '';
}

function dataBr(iso?: string | null): string {
  if (!iso) return '—';
  return formatarIsoParaBr(iso);
}

function periodoCicloTxt(c: PeriodoCicloContrato): string {
  const inicioBr = dataBr(c.dataInicio);
  const datas = `${inicioBr} a ${dataBr(c.dataFim)}`;
  if (inicioBr && inicioBr !== '—' && c.label.includes(inicioBr)) return c.label;
  return `${c.label} (${datas})`;
}

function descritivoComparacao(ant: PeriodoCicloContrato, atu: PeriodoCicloContrato): string {
  return `${periodoCicloTxt(ant)}  ×  ${periodoCicloTxt(atu)}`;
}

function dataComSemana(d: DadoDiario | null): string {
  if (!d?.data) return '—';
  const sem = diaSemana(d.data);
  return sem ? `${sem} ${dataBr(d.data)}` : dataBr(d.data);
}

function corVar(abs: number, inverter = false): string {
  const n = inverter ? -abs : abs;
  if (n > 0) return '#15803d';
  if (n < 0) return '#b91c1c';
  return '#64748b';
}

function htmlVar(atual: number, anterior: number, dec = 1, sufixo = '', inverter = false): string {
  const { abs, pct } = variacaoAbsPct(atual, anterior);
  if (abs === 0 && (pct === 0 || pct == null)) {
    return '<span class="muted">0</span>';
  }
  const cor = corVar(abs, inverter);
  const sinal = abs > 0 ? '+' : '−';
  const pctTxt = pct == null ? '' : ` (${abs > 0 ? '+' : '−'}${fmtNum(Math.abs(pct), 1)}%)`;
  return `<span style="color:${cor};font-weight:800">${sinal}${fmtNum(Math.abs(abs), dec)}${esc(sufixo)}${pctTxt}</span>`;
}

function barraPct(valor: number, max: number, cor: string): string {
  const pct = max > 0 ? Math.max(4, Math.round((valor / max) * 100)) : 4;
  return `<div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${cor}"></div></div>`;
}

function cardKpi(
  label: string,
  ant: string,
  atu: string,
  deltaHtml: string,
): string {
  return `
    <div class="kpi">
      <div class="kpi-l">${esc(label)}</div>
      <div class="kpi-row">
        <div><span class="kpi-tag">Anterior</span><div class="kpi-n">${ant}</div></div>
        <div class="kpi-seta">→</div>
        <div><span class="kpi-tag">Atual</span><div class="kpi-n">${atu}</div></div>
      </div>
      <div class="kpi-d">${deltaHtml}</div>
    </div>`;
}

function linhasIndicadores(
  modo: ModoMelhoriaOperacao,
  ant: TotaisMelhoriaCiclo,
  atu: TotaisMelhoriaCiclo,
): string {
  const linhas: Array<{ k: string; a: string; b: string; d: string }> = [
    {
      k: 'Dias decorridos do ciclo',
      a: fmtNum(ant.diasDecorridos, 0),
      b: fmtNum(atu.diasDecorridos, 0),
      d: htmlVar(atu.diasDecorridos, ant.diasDecorridos, 0),
    },
    {
      k: 'Dias com operação',
      a: fmtNum(ant.diasOperados, 0),
      b: fmtNum(atu.diasOperados, 0),
      d: htmlVar(atu.diasOperados, ant.diasOperados, 0),
    },
  ];

  if (modo === 'coleta') {
    linhas.push(
      {
        k: 'Viagens no ciclo',
        a: fmtNum(ant.viagens, 0),
        b: fmtNum(atu.viagens, 0),
        d: htmlVar(atu.viagens, ant.viagens, 0),
      },
      {
        k: 'Toneladas coletadas',
        a: `${fmtNum(ant.toneladas, 2)} t`,
        b: `${fmtNum(atu.toneladas, 2)} t`,
        d: htmlVar(atu.toneladas, ant.toneladas, 2, ' t'),
      },
      {
        k: 'Média de viagens / dia do ciclo',
        a: fmtNum(ant.mediaViagensPorDia, 1),
        b: fmtNum(atu.mediaViagensPorDia, 1),
        d: htmlVar(atu.mediaViagensPorDia, ant.mediaViagensPorDia, 1),
      },
      {
        k: 'Média de toneladas / dia do ciclo',
        a: `${fmtNum(ant.mediaTonPorDia, 2)} t`,
        b: `${fmtNum(atu.mediaTonPorDia, 2)} t`,
        d: htmlVar(atu.mediaTonPorDia, ant.mediaTonPorDia, 2, ' t'),
      },
      {
        k: 'Carga média por viagem',
        a: `${fmtNum(ant.mediaTonPorViagem, 2)} t`,
        b: `${fmtNum(atu.mediaTonPorViagem, 2)} t`,
        d: htmlVar(atu.mediaTonPorViagem, ant.mediaTonPorViagem, 2, ' t'),
      },
      {
        k: 'Rotas (linhas da planilha)',
        a: fmtNum(ant.rotas, 0),
        b: fmtNum(atu.rotas, 0),
        d: htmlVar(atu.rotas, ant.rotas, 0),
      },
      {
        k: 'Quilometragem',
        a: `${fmtNum(ant.km, 1)} km`,
        b: `${fmtNum(atu.km, 1)} km`,
        d: htmlVar(atu.km, ant.km, 1, ' km'),
      },
      {
        k: 'Média de KM / dia do ciclo',
        a: `${fmtNum(ant.mediaKmPorDia, 1)} km`,
        b: `${fmtNum(atu.mediaKmPorDia, 1)} km`,
        d: htmlVar(atu.mediaKmPorDia, ant.mediaKmPorDia, 1, ' km'),
      },
      {
        k: 'Média de KM / viagem',
        a: `${fmtNum(ant.mediaKmPorViagem, 1)} km`,
        b: `${fmtNum(atu.mediaKmPorViagem, 1)} km`,
        d: htmlVar(atu.mediaKmPorViagem, ant.mediaKmPorViagem, 1, ' km'),
      },
    );
  } else {
    const suf = atu.metricaSufixo || ant.metricaSufixo;
    const lab = atu.metricaLabel || ant.metricaLabel || 'Produção';
    linhas.push(
      {
        k: `${lab} no ciclo`,
        a: formatarMetricaUnidade(ant.metricaUnidade, suf),
        b: formatarMetricaUnidade(atu.metricaUnidade, suf),
        d: htmlVar(atu.metricaUnidade, ant.metricaUnidade, suf === 'm²' || suf === 'arv' ? 0 : 1, suf ? ` ${suf}` : ''),
      },
      {
        k: 'Registros / rotas',
        a: fmtNum(ant.rotas, 0),
        b: fmtNum(atu.rotas, 0),
        d: htmlVar(atu.rotas, ant.rotas, 0),
      },
      {
        k: `Média de ${lab.toLowerCase()} / dia do ciclo`,
        a: formatarMetricaUnidade(ant.mediaMetricaPorDia, suf),
        b: formatarMetricaUnidade(atu.mediaMetricaPorDia, suf),
        d: htmlVar(atu.mediaMetricaPorDia, ant.mediaMetricaPorDia, 1, suf ? ` ${suf}` : ''),
      },
    );
  }

  return linhas.map((l) => `
    <tr>
      <td>${esc(l.k)}</td>
      <td class="c">${l.a}</td>
      <td class="c">${l.b}</td>
      <td class="c">${l.d}</td>
    </tr>`).join('');
}

function tabelaDiariaColeta(
  dias: ReturnType<typeof alinharDiasCicloOperacao>,
  totAnt: TotaisMelhoriaCiclo,
  totAtu: TotaisMelhoriaCiclo,
): string {
  const linhas = dias.map((d) => {
    const antOk = diaTemProducao(d.ant, 'coleta');
    const atuOk = diaTemProducao(d.atual, 'coleta');
    const vazio = !antOk && !atuOk;
    const parOk = d.ant != null && d.atual != null;
    const cls = vazio ? ' class="off"' : '';
    const rotulo = rotuloOcorrenciaDiaSemana(d.diaSemana, d.ocorrencia);
    return `<tr${cls}>
      <td class="c">${esc(rotulo)}</td>
      <td>${esc(dataComSemana(d.ant))}</td>
      <td class="c">${antOk ? fmtNum(d.ant!.viagens, 0) : '—'}</td>
      <td class="c">${antOk ? fmtNum(d.ant!.rotas, 0) : '—'}</td>
      <td class="r">${antOk ? fmtNum(d.ant!.toneladas, 2) : '—'}</td>
      <td class="r">${antOk ? fmtNum(d.ant!.km, 1) : '—'}</td>
      <td>${esc(dataComSemana(d.atual))}</td>
      <td class="c">${atuOk ? fmtNum(d.atual!.viagens, 0) : '—'}</td>
      <td class="c">${atuOk ? fmtNum(d.atual!.rotas, 0) : '—'}</td>
      <td class="r">${atuOk ? fmtNum(d.atual!.toneladas, 2) : '—'}</td>
      <td class="r">${atuOk ? fmtNum(d.atual!.km, 1) : '—'}</td>
      <td class="c">${parOk && (antOk || atuOk) ? htmlVar(d.atual?.viagens || 0, d.ant?.viagens || 0, 0) : '—'}</td>
      <td class="r">${parOk && (antOk || atuOk) ? htmlVar(d.atual?.toneladas || 0, d.ant?.toneladas || 0, 2, ' t') : '—'}</td>
      <td class="r">${parOk && (antOk || atuOk) ? htmlVar(d.atual?.km || 0, d.ant?.km || 0, 1, ' km') : '—'}</td>
    </tr>`;
  }).join('');

  return `
    <table class="dia">
      <thead>
        <tr>
          <th rowspan="2">Dia da<br/>semana</th>
          <th colspan="5">Ciclo anterior</th>
          <th colspan="5">Ciclo atual</th>
          <th colspan="3">Variação operacional</th>
        </tr>
        <tr>
          <th>Data</th><th>Viagens</th><th>Rotas</th><th>Ton</th><th>KM</th>
          <th>Data</th><th>Viagens</th><th>Rotas</th><th>Ton</th><th>KM</th>
          <th>Δ viagens</th><th>Δ ton</th><th>Δ km</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
      <tfoot>
        <tr>
          <td class="c">Total</td>
          <td></td>
          <td class="c">${fmtNum(totAnt.viagens, 0)}</td>
          <td class="c">${fmtNum(totAnt.rotas, 0)}</td>
          <td class="r">${fmtNum(totAnt.toneladas, 2)}</td>
          <td class="r">${fmtNum(totAnt.km, 1)}</td>
          <td></td>
          <td class="c">${fmtNum(totAtu.viagens, 0)}</td>
          <td class="c">${fmtNum(totAtu.rotas, 0)}</td>
          <td class="r">${fmtNum(totAtu.toneladas, 2)}</td>
          <td class="r">${fmtNum(totAtu.km, 1)}</td>
          <td class="c">${htmlVar(totAtu.viagens, totAnt.viagens, 0)}</td>
          <td class="r">${htmlVar(totAtu.toneladas, totAnt.toneladas, 2, ' t')}</td>
          <td class="r">${htmlVar(totAtu.km, totAnt.km, 1, ' km')}</td>
        </tr>
      </tfoot>
    </table>`;
}

function tabelaDiariaUnidade(
  dias: ReturnType<typeof alinharDiasCicloOperacao>,
  totAnt: TotaisMelhoriaCiclo,
  totAtu: TotaisMelhoriaCiclo,
): string {
  const suf = totAtu.metricaSufixo || totAnt.metricaSufixo;
  const lab = totAtu.metricaLabel || totAnt.metricaLabel || 'Produção';
  const linhas = dias.map((d) => {
    const antOk = diaTemProducao(d.ant, 'unidade');
    const atuOk = diaTemProducao(d.atual, 'unidade');
    const vazio = !antOk && !atuOk;
    const parOk = d.ant != null && d.atual != null;
    const cls = vazio ? ' class="off"' : '';
    const rotulo = rotuloOcorrenciaDiaSemana(d.diaSemana, d.ocorrencia);
    return `<tr${cls}>
      <td class="c">${esc(rotulo)}</td>
      <td>${esc(dataComSemana(d.ant))}</td>
      <td class="c">${antOk ? fmtNum(d.ant!.rotas, 0) : '—'}</td>
      <td class="r">${antOk ? formatarMetricaUnidade(d.ant!.metricaUnidade || 0, suf) : '—'}</td>
      <td>${esc(dataComSemana(d.atual))}</td>
      <td class="c">${atuOk ? fmtNum(d.atual!.rotas, 0) : '—'}</td>
      <td class="r">${atuOk ? formatarMetricaUnidade(d.atual!.metricaUnidade || 0, suf) : '—'}</td>
      <td class="c">${parOk && (antOk || atuOk) ? htmlVar(d.atual?.rotas || 0, d.ant?.rotas || 0, 0) : '—'}</td>
      <td class="r">${parOk && (antOk || atuOk) ? htmlVar(d.atual?.metricaUnidade || 0, d.ant?.metricaUnidade || 0, 1, suf ? ` ${suf}` : '') : '—'}</td>
    </tr>`;
  }).join('');

  return `
    <table class="dia">
      <thead>
        <tr>
          <th rowspan="2">Dia da<br/>semana</th>
          <th colspan="3">Ciclo anterior</th>
          <th colspan="3">Ciclo atual</th>
          <th colspan="2">Variação</th>
        </tr>
        <tr>
          <th>Data</th><th>Registros</th><th>${esc(lab)}</th>
          <th>Data</th><th>Registros</th><th>${esc(lab)}</th>
          <th>Δ registros</th><th>Δ ${esc(lab.toLowerCase())}</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
      <tfoot>
        <tr>
          <td class="c">Total</td>
          <td></td>
          <td class="c">${fmtNum(totAnt.rotas, 0)}</td>
          <td class="r">${formatarMetricaUnidade(totAnt.metricaUnidade, suf)}</td>
          <td></td>
          <td class="c">${fmtNum(totAtu.rotas, 0)}</td>
          <td class="r">${formatarMetricaUnidade(totAtu.metricaUnidade, suf)}</td>
          <td class="c">${htmlVar(totAtu.rotas, totAnt.rotas, 0)}</td>
          <td class="r">${htmlVar(totAtu.metricaUnidade, totAnt.metricaUnidade, 1, suf ? ` ${suf}` : '')}</td>
        </tr>
      </tfoot>
    </table>`;
}

export interface RelatorioMelhoriaCicloOpts {
  servicoNome: string;
  contratoNome?: string;
  tipoServicoLabel?: string;
  cicloAnterior: PeriodoCicloContrato;
  cicloAtual: PeriodoCicloContrato;
  diasAnterior: DadoDiario[];
  diasAtual: DadoDiario[];
  modo: ModoMelhoriaOperacao;
  geradoEm?: Date;
  cicloEmAndamento?: boolean;
  diasCicloCompleto?: number;
  /** Só o conteúdo interno (sem html/head) — para o PDF consolidado */
  fragmento?: boolean;
}

export function gerarHtmlRelatorioMelhoriaCicloOperacao(opts: RelatorioMelhoriaCicloOpts): string {
  const modo = opts.modo;
  const gerado = opts.geradoEm ?? new Date();
  const dataGeracao = gerado.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  const horaGeracao = gerado.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const totAnt = resumirCicloOperacao(opts.diasAnterior, modo);
  const totAtu = resumirCicloOperacao(opts.diasAtual, modo);
  const dias = alinharDiasCicloOperacao(opts.diasAnterior, opts.diasAtual);
  const descCiclos = descritivoComparacao(opts.cicloAnterior, opts.cicloAtual);
  const labelAnt = periodoCicloTxt(opts.cicloAnterior);
  const labelAtu = periodoCicloTxt(opts.cicloAtual);
  const leitura = montarLeituraGerencial({
    modo,
    anterior: totAnt,
    atual: totAtu,
    dias,
    labelAnterior: labelAnt,
    labelAtual: labelAtu,
  });

  const maxProd = Math.max(
    modo === 'coleta' ? totAnt.toneladas : totAnt.metricaUnidade,
    modo === 'coleta' ? totAtu.toneladas : totAtu.metricaUnidade,
    0.001,
  );

  const kpis = modo === 'coleta'
    ? [
      cardKpi('Viagens', fmtNum(totAnt.viagens, 0), fmtNum(totAtu.viagens, 0), htmlVar(totAtu.viagens, totAnt.viagens, 0)),
      cardKpi('Toneladas', `${fmtNum(totAnt.toneladas, 1)} t`, `${fmtNum(totAtu.toneladas, 1)} t`, htmlVar(totAtu.toneladas, totAnt.toneladas, 2, ' t')),
      cardKpi('KM rodado', `${fmtNum(totAnt.km, 0)} km`, `${fmtNum(totAtu.km, 0)} km`, htmlVar(totAtu.km, totAnt.km, 1, ' km')),
      cardKpi(
        't / dia do ciclo',
        `${fmtNum(totAnt.mediaTonPorDia, 2)} t`,
        `${fmtNum(totAtu.mediaTonPorDia, 2)} t`,
        htmlVar(totAtu.mediaTonPorDia, totAnt.mediaTonPorDia, 2, ' t'),
      ),
      cardKpi(
        'Média t / viagem',
        `${fmtNum(totAnt.mediaTonPorViagem, 2)} t`,
        `${fmtNum(totAtu.mediaTonPorViagem, 2)} t`,
        htmlVar(totAtu.mediaTonPorViagem, totAnt.mediaTonPorViagem, 2, ' t'),
      ),
    ]
    : [
      cardKpi(
        totAtu.metricaLabel || 'Produção',
        formatarMetricaUnidade(totAnt.metricaUnidade, totAtu.metricaSufixo || totAnt.metricaSufixo),
        formatarMetricaUnidade(totAtu.metricaUnidade, totAtu.metricaSufixo || totAnt.metricaSufixo),
        htmlVar(totAtu.metricaUnidade, totAnt.metricaUnidade, 1),
      ),
      cardKpi('Registros', fmtNum(totAnt.rotas, 0), fmtNum(totAtu.rotas, 0), htmlVar(totAtu.rotas, totAnt.rotas, 0)),
      cardKpi('Dias do ciclo', fmtNum(totAnt.diasDecorridos, 0), fmtNum(totAtu.diasDecorridos, 0), htmlVar(totAtu.diasDecorridos, totAnt.diasDecorridos, 0)),
      cardKpi(
        'Média / dia do ciclo',
        formatarMetricaUnidade(totAnt.mediaMetricaPorDia, totAtu.metricaSufixo || totAnt.metricaSufixo),
        formatarMetricaUnidade(totAtu.mediaMetricaPorDia, totAtu.metricaSufixo || totAnt.metricaSufixo),
        htmlVar(totAtu.mediaMetricaPorDia, totAnt.mediaMetricaPorDia, 1),
      ),
    ];

  const labelProd = modo === 'coleta' ? 'Toneladas no ciclo' : (totAtu.metricaLabel || 'Produção');
  const txtAnt = modo === 'coleta'
    ? `${fmtNum(totAnt.toneladas, 2)} t`
    : formatarMetricaUnidade(totAnt.metricaUnidade, totAnt.metricaSufixo || totAtu.metricaSufixo);
  const txtAtu = modo === 'coleta'
    ? `${fmtNum(totAtu.toneladas, 2)} t`
    : formatarMetricaUnidade(totAtu.metricaUnidade, totAtu.metricaSufixo || totAnt.metricaSufixo);

  const corpo = `
  <div class="header">
    <div>
      <div class="marca">SistemMA · Relatório gerencial</div>
      ${opts.contratoNome ? `<div class="contrato">${esc(opts.contratoNome)}</div>` : ''}
      <h1>Melhoria do ciclo de operação</h1>
      <div class="sub">${esc(opts.servicoNome)}${opts.tipoServicoLabel ? ` · ${esc(opts.tipoServicoLabel)}` : ''} — comparativo operacional do ciclo anterior com o ciclo atual</div>
      <div class="ciclos">Ciclos comparados: ${esc(descCiclos)}</div>
    </div>
    <div class="meta">Gerado em ${esc(dataGeracao)} · ${esc(horaGeracao)}<br/>Ref. ${esc(formatarDataArquivoPdf(gerado))}</div>
  </div>

  <div class="periodos">
    <div class="per ant">
      <div class="tag">Ciclo anterior</div>
      <div class="tit">${esc(opts.cicloAnterior.label)}</div>
      <div class="dt">${esc(dataBr(opts.cicloAnterior.dataInicio))} → ${esc(dataBr(opts.cicloAnterior.dataFim))}</div>
    </div>
    <div class="seta">→</div>
    <div class="per atual">
      <div class="tag">${opts.cicloEmAndamento ? 'Ciclo atual (em andamento)' : 'Ciclo atual (em análise)'}</div>
      <div class="tit">${esc(opts.cicloAtual.label)}</div>
      <div class="dt">${esc(dataBr(opts.cicloAtual.dataInicio))} → ${esc(dataBr(opts.cicloAtual.dataFim))}</div>
    </div>
  </div>

  ${opts.cicloEmAndamento ? `
  <p class="nota">
    Ciclo em andamento: as médias (t/dia, viagens/dia, KM/dia) dividem o total pelos
    <strong>${fmtNum(totAtu.diasDecorridos, 0)} dias decorridos</strong>
    ${opts.diasCicloCompleto ? ` de ${fmtNum(opts.diasCicloCompleto, 0)} dias do ciclo completo` : ''}
    (início até hoje), não só pelos dias com viagem.
    A coluna <strong>Ton</strong> de cada dia é o total da planilha naquela data (soma do PESO TOTAL), não a média.
    O ciclo anterior entra com os mesmos ${fmtNum(totAnt.diasDecorridos, 0)} primeiros dias, para a comparação ser justa.
  </p>` : `
  <p class="nota">
    Médias /dia = total do ciclo ÷ dias de calendário do ciclo (do início ao fim), não só dias com viagem.
  </p>`}

  <div class="leitura">
    <h2>Leitura para a gerência</h2>
    <ul>${leitura.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
  </div>

  <div class="kpis">${kpis.join('')}</div>

  <h2>${esc(labelProd)}</h2>
  <div class="bars">
    <div class="bar-lbl">Anterior</div>
    ${barraPct(modo === 'coleta' ? totAnt.toneladas : totAnt.metricaUnidade, maxProd, '#94a3b8')}
    <div class="bar-val">${esc(txtAnt)}</div>
    <div class="bar-lbl">Atual</div>
    ${barraPct(modo === 'coleta' ? totAtu.toneladas : totAtu.metricaUnidade, maxProd, '#6366f1')}
    <div class="bar-val">${esc(txtAtu)}</div>
  </div>

  <h2>Totais do ciclo</h2>
  <p class="nota">Variação em verde = aumento; em vermelho = redução. Percentual em relação ao mesmo recorte do ciclo anterior. t/dia = toneladas ÷ dias decorridos do ciclo.</p>
  <table>
    <thead>
      <tr>
        <th>Indicador</th>
        <th>Anterior<br/><span style="font-weight:500">${esc(labelAnt)}</span></th>
        <th>Atual<br/><span style="font-weight:500">${esc(labelAtu)}</span></th>
        <th>Variação</th>
      </tr>
    </thead>
    <tbody>${linhasIndicadores(modo, totAnt, totAtu)}</tbody>
  </table>

  <h2>Comparativo dia a dia</h2>
  <p class="nota">
    Cada linha é o <strong>mesmo dia da semana</strong> nos dois ciclos
    (1ª segunda com 1ª segunda, 1º domingo com 1º domingo), para não cruzar dia útil com fim de semana.
    A coluna Ton é o <strong>total da planilha naquele dia</strong> (soma do PESO TOTAL), não a média.
    A última linha fecha o total do recorte comparado.
  </p>
  ${modo === 'coleta' ? tabelaDiariaColeta(dias, totAnt, totAtu) : tabelaDiariaUnidade(dias, totAnt, totAtu)}

  <div class="footer">
    SistemMA — Melhoria do ciclo de operação · ${esc(descCiclos)} · totais e série diária alinhada pelo dia da semana
  </div>`;

  if (opts.fragmento) return corpo;
  return wrapDocumentoMelhoriaCiclo(`Melhoria do ciclo — ${descCiclos}`, corpo);
}

const CSS_MELHORIA_CICLO = `
    @page { size: A4 portrait; margin: 10mm 11mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9px; color: #1e293b; line-height: 1.4; }
    .header {
      background: #0f172a; color: #fff; border-radius: 10px;
      padding: 14px 16px; margin-bottom: 10px;
      display: flex; justify-content: space-between; gap: 12px;
    }
    .header .marca { font-size: 8px; font-weight: 700; letter-spacing: 0.12em; color: #94a3b8; text-transform: uppercase; }
    .header h1 { font-size: 15px; font-weight: 800; color: #fbbf24; margin-top: 3px; }
    .header .sub { font-size: 9px; color: #cbd5e1; margin-top: 4px; }
    .header .ciclos { font-size: 9.5px; font-weight: 700; color: #f8fafc; margin-top: 6px; line-height: 1.4; }
    .header .meta { font-size: 8px; color: #94a3b8; text-align: right; white-space: nowrap; }
    .header .contrato { font-size: 10px; font-weight: 800; color: #a5b4fc; margin-top: 4px; }
    .periodos { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: stretch; margin-bottom: 10px; }
    .per {
      border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; background: #f8fafc;
    }
    .per.atual { border-top: 3px solid #6366f1; background: #eef2ff; }
    .per.ant { border-top: 3px solid #94a3b8; }
    .per .tag { font-size: 7px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
    .per .tit { font-size: 11px; font-weight: 800; color: #0f172a; margin-top: 2px; }
    .per .dt { font-size: 8px; color: #475569; margin-top: 2px; }
    .seta { display: flex; align-items: center; font-size: 18px; font-weight: 800; color: #6366f1; }
    .leitura {
      background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;
      padding: 9px 12px; margin-bottom: 10px;
    }
    .leitura h2 { font-size: 10px; font-weight: 800; color: #92400e; margin-bottom: 5px; }
    .leitura li { margin: 0 0 4px 14px; font-size: 8.5px; color: #334155; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 7px; margin-bottom: 10px; }
    .kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; }
    .kpi-l { font-size: 7px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 5px; }
    .kpi-row { display: flex; align-items: flex-end; gap: 6px; }
    .kpi-tag { display: block; font-size: 6px; color: #94a3b8; font-weight: 700; text-transform: uppercase; }
    .kpi-n { font-size: 12px; font-weight: 800; color: #0f172a; }
    .kpi-seta { color: #6366f1; font-weight: 800; padding-bottom: 1px; }
    .kpi-d { margin-top: 4px; font-size: 8px; }
    h2 { font-size: 11px; font-weight: 800; color: #334155; margin: 12px 0 6px; border-bottom: 2px solid #6366f1; padding-bottom: 3px; }
    .nota { font-size: 7.5px; color: #64748b; margin-bottom: 5px; }
    .bars { display: grid; grid-template-columns: 90px 1fr 90px; gap: 6px; align-items: center; margin: 4px 0 10px; }
    .bar-track { height: 10px; background: #e2e8f0; border-radius: 99px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 99px; }
    .bar-lbl { font-size: 7.5px; color: #64748b; font-weight: 700; }
    .bar-val { font-size: 8px; font-weight: 800; text-align: right; }
    table { width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; margin-bottom: 8px; }
    th { background: #1e293b; color: #fff; padding: 5px 6px; text-align: left; font-size: 7.5px; font-weight: 700; }
    th span { font-weight: 500; text-transform: none; color: #cbd5e1; }
    td { padding: 4px 6px; border-bottom: 1px solid #f1f5f9; font-size: 8px; vertical-align: middle; }
    .c { text-align: center; }
    .r { text-align: right; }
    .muted { color: #94a3b8; }
    table.dia th { font-size: 6.5px; }
    table.dia td { font-size: 7.5px; white-space: nowrap; }
    table.dia tr.off td { color: #cbd5e1; }
    .header, .kpi, .per, .leitura { page-break-inside: avoid; break-inside: avoid; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    thead { display: table-header-group; }
    tbody { page-break-before: avoid; break-before: avoid; }
    h2, h3, .nota { page-break-after: avoid; break-after: avoid; }
    tfoot td { background: #eef2ff; color: #0f172a; font-weight: 800; }
    .footer { margin-top: 12px; font-size: 7px; color: #94a3b8; text-align: center; }
    .quebra-pagina { page-break-before: always; }
    .capa { margin-bottom: 8px; }
    .capa .marca { font-size: 8px; font-weight: 700; letter-spacing: 0.12em; color: #64748b; text-transform: uppercase; }
    .capa h1 { font-size: 16px; font-weight: 800; color: #0f172a; margin: 4px 0 8px; }
    .capa .resumo { font-size: 9px; color: #475569; margin-bottom: 10px; }
    .capa .omitidos { margin-top: 10px; font-size: 8px; color: #64748b; }
    .capa .omitidos li { margin: 0 0 3px 14px; }
`;

function wrapDocumentoMelhoriaCiclo(titulo: string, corpo: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>${esc(titulo)}</title>
  <style>${CSS_MELHORIA_CICLO}</style>
</head>
<body>
${corpo}
</body>
</html>`;
}

export interface ItemOmitidoMelhoriaCiclo {
  contratoNome: string;
  servicoNome: string;
  motivo: string;
}

function linhaSinteseCapa(item: RelatorioMelhoriaCicloOpts): string {
  const totAnt = resumirCicloOperacao(item.diasAnterior, item.modo);
  const totAtu = resumirCicloOperacao(item.diasAtual, item.modo);
  const indicador = item.modo === 'coleta' ? 'Toneladas' : (totAtu.metricaLabel || 'Produção');
  const antTxt = item.modo === 'coleta'
    ? `${fmtNum(totAnt.toneladas, 1)} t`
    : formatarMetricaUnidade(totAnt.metricaUnidade, totAtu.metricaSufixo || totAnt.metricaSufixo);
  const atuTxt = item.modo === 'coleta'
    ? `${fmtNum(totAtu.toneladas, 1)} t`
    : formatarMetricaUnidade(totAtu.metricaUnidade, totAtu.metricaSufixo || totAnt.metricaSufixo);
  const delta = item.modo === 'coleta'
    ? htmlVar(totAtu.toneladas, totAnt.toneladas, 2, ' t')
    : htmlVar(totAtu.metricaUnidade, totAnt.metricaUnidade, 1);
  const vg = item.modo === 'coleta'
    ? `${fmtNum(totAnt.viagens, 0)} → ${fmtNum(totAtu.viagens, 0)}`
    : `${fmtNum(totAnt.rotas, 0)} → ${fmtNum(totAtu.rotas, 0)}`;
  return `<tr>
    <td>${esc(item.contratoNome || '—')}</td>
    <td>${esc(item.servicoNome)}</td>
    <td>${esc(item.cicloAtual.label)}</td>
    <td class="c">${esc(item.modo === 'coleta' ? 'Viagens' : 'Registros')}: ${vg}</td>
    <td>${esc(indicador)}</td>
    <td class="r">${antTxt}</td>
    <td class="r">${atuTxt}</td>
    <td class="c">${delta}</td>
  </tr>`;
}

export function gerarHtmlRelatorioMelhoriaCicloTodosContratos(opts: {
  itens: RelatorioMelhoriaCicloOpts[];
  omitidos?: ItemOmitidoMelhoriaCiclo[];
  geradoEm?: Date;
}): string {
  const gerado = opts.geradoEm ?? new Date();
  const dataGeracao = gerado.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  const horaGeracao = gerado.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const nContratos = new Set(opts.itens.map((i) => i.contratoNome || i.servicoNome)).size;
  const omitidos = opts.omitidos || [];

  const capa = `
  <div class="capa">
    <div class="marca">SistemMA · Relatório gerencial</div>
    <h1>Melhoria do ciclo — todos os contratos</h1>
    <p class="resumo">
      ${opts.itens.length} serviço(s) em ${nContratos} contrato(s) · comparativo operacional ciclo anterior × ciclo atual
      · gerado em ${esc(dataGeracao)} às ${esc(horaGeracao)}
    </p>
    <h2>Síntese operacional</h2>
    <p class="nota">Cada linha é um serviço. O detalhe dia a dia vem nas páginas seguintes.</p>
    <table>
      <thead>
        <tr>
          <th>Contrato</th>
          <th>Serviço</th>
          <th>Ciclo atual</th>
          <th>Ritmo</th>
          <th>Indicador</th>
          <th>Anterior</th>
          <th>Atual</th>
          <th>Variação</th>
        </tr>
      </thead>
      <tbody>
        ${opts.itens.map(linhaSinteseCapa).join('') || '<tr><td colspan="8" class="muted">Nenhum serviço com operação no ciclo.</td></tr>'}
      </tbody>
    </table>
    ${omitidos.length > 0 ? `
    <div class="omitidos">
      <strong>Sem comparativo neste PDF (${omitidos.length}):</strong>
      <ul>${omitidos.map((o) => `<li>${esc(o.contratoNome)} · ${esc(o.servicoNome)} — ${esc(o.motivo)}</li>`).join('')}</ul>
    </div>` : ''}
  </div>`;

  const secoes = opts.itens.map((item) => (
    `<div class="quebra-pagina">${gerarHtmlRelatorioMelhoriaCicloOperacao({ ...item, geradoEm: gerado, fragmento: true })}</div>`
  )).join('\n');

  return wrapDocumentoMelhoriaCiclo(
    'Melhoria do ciclo — todos os contratos',
    capa + secoes,
  );
}
