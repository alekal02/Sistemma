/**
 * Seções da operação do dia no mesmo formato do PDF (gerarHtmlRelatorioDia).
 */
import { useMemo, type CSSProperties } from 'react';
import type { OperacaoDiaAnalise } from '../utils/operacaoDia';
import { montarEficienciaPlacas } from '../utils/operacaoDia';
import { analisarEstudoRotasDia, type EstudoRotasDia } from '../utils/estudoRotasDia';
import type { CenarioCaixaMediaDia } from '../utils/cenarioCaixaMediaDia';
import {
  PCT_IDEAL_MAX,
  PCT_IDEAL_MIN,
  pctIdealForaDaMargem,
  resolverDensidadeResiduoKgL,
  type MapaLimiteCaminhao,
} from '../utils/limitesCaminhaoContrato';
import { montarPontosViagemPorTipo } from '../utils/viagemPorTipoGrafico';
import { fmtNum } from '../utils/relatorioDiario';
import GraficoRankingViagensTipo from './GraficoRankingViagensTipo';

type Props = {
  analise: OperacaoDiaAnalise;
  registros: Record<string, unknown>[];
  cenarioCaixaMedia?: CenarioCaixaMediaDia | null;
  placasReserva?: string[];
  volumeL?: MapaLimiteCaminhao | null;
  densidadeResiduoKgL?: number | null;
  densidadeKgL?: MapaLimiteCaminhao | null;
  densidadeKgLPorPlaca?: Record<string, number> | null;
  limitesPesoKg?: MapaLimiteCaminhao | null;
};

type ItemGargalo = {
  severidade: 'critico' | 'atencao';
  origem: 'tipo' | 'rota' | 'placa';
  texto: string;
};

const secStyle: CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 800,
  color: '#334155',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  margin: '1.1rem 0 0.55rem',
};

const cardWrap: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
  gap: '0.5rem',
  marginBottom: '0.35rem',
};

function Secao({ children }: { children: string }) {
  return <div style={secStyle}>{children}</div>;
}

function IndicadorCard({ label, valor, cor }: { label: string; valor: string; cor: string }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 10,
      border: '1px solid #e2e8f0',
      borderTop: `3px solid ${cor}`,
      padding: '0.55rem 0.7rem',
    }}
    >
      <div style={{ fontSize: '0.58rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>
        {valor}
      </div>
    </div>
  );
}

function densidadesPorPlaca(estudo: EstudoRotasDia | null) {
  const viagens = estudo?.capacidade?.viagens;
  if (!viagens?.length) return [];
  const porPlaca = new Map<string, { dens: number; tipoLabel: string; ideal: number | null; n: number }>();
  for (const v of viagens) {
    if (!(v.densidadeKgL != null && v.densidadeKgL > 0) || !v.placa || v.placa === '—') continue;
    const atual = porPlaca.get(v.placa);
    if (atual) {
      atual.n += 1;
      continue;
    }
    porPlaca.set(v.placa, {
      dens: v.densidadeKgL,
      tipoLabel: v.tipoLabel,
      ideal: v.pesoIdealKg,
      n: 1,
    });
  }
  return [...porPlaca.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([placa, info]) => ({ placa, ...info }));
}

function montarGargalos(opts: {
  analise: OperacaoDiaAnalise;
  estudo: EstudoRotasDia | null;
  cenario: CenarioCaixaMediaDia | null | undefined;
  placasReserva?: string[];
  limOpts: {
    limitesPesoKg?: MapaLimiteCaminhao | null;
    volumeL?: MapaLimiteCaminhao | null;
    densidadeResiduoKgL?: number | null;
    densidadeKgL?: MapaLimiteCaminhao | null;
    densidadeKgLPorPlaca?: Record<string, number> | null;
  };
}): { titulo: string; cls: 'critico' | 'atencao' | 'ok'; resumo: string; lista: ItemGargalo[] } {
  const pontos = montarPontosViagemPorTipo(opts.analise, opts.limOpts.volumeL, {
    global: opts.limOpts.densidadeResiduoKgL,
    porTipo: opts.limOpts.densidadeKgL,
  });
  const itens: ItemGargalo[] = [];

  for (const t of pontos.filter((x) => x.gargalo)) {
    itens.push({
      severidade: (t.pctIdeal != null && Math.abs(t.pctIdeal - 100) > 25) ? 'critico' : 'atencao',
      origem: 'tipo',
      texto: `${t.label}: ${fmtNum(t.pesoColetadoKg, 0)} kg médio vs ideal ${fmtNum(t.pesoIdealKg, 0)} kg (${fmtNum(t.pctIdeal ?? 0, 0)}% · ótimo ${PCT_IDEAL_MIN}–${PCT_IDEAL_MAX}%) — ${fmtNum(t.viagens, 0)} viagem(ns)`,
    });
  }

  const rotas = (opts.estudo?.rotas || [])
    .filter((r) => r.status === 'ruim' && pctIdealForaDaMargem(r.pctIdeal))
    .sort((a, b) => Math.abs((b.pctIdeal ?? 100) - 100) - Math.abs((a.pctIdeal ?? 100) - 100))
    .slice(0, 5);
  for (const r of rotas) {
    itens.push({
      severidade: (r.pctIdeal != null && Math.abs(r.pctIdeal - 100) > 25) ? 'critico' : 'atencao',
      origem: 'rota',
      texto: `Rota ${r.rota} (${r.tipoPredominanteLabel}): ${fmtNum(r.tonMediaViagem * 1000, 0)} kg vs ideal ${fmtNum(r.pesoIdealKg ?? 0, 0)} kg (${fmtNum(r.pctIdeal ?? 0, 0)}%)`,
    });
  }

  const eficiencia = montarEficienciaPlacas(opts.analise, opts.placasReserva, opts.limOpts);
  for (const p of eficiencia.filter((x) => x.status !== 'bom' && !x.ehReserva).slice(0, 5)) {
    itens.push({
      severidade: p.status === 'ruim' ? 'critico' : 'atencao',
      origem: 'placa',
      texto: `Placa ${p.chave} (${p.mediaRefLabel}): ${fmtNum(p.tonMediaViagem, 2)} t/viag`
        + (p.pctIdeal != null ? ` · ${fmtNum(p.pctIdeal, 0)}% do ideal (ótimo ${PCT_IDEAL_MIN}–${PCT_IDEAL_MAX}%)` : '')
        + ` · ${fmtNum(p.viagens, 0)} viag.`,
    });
  }

  const vistos = new Set<string>();
  const lista = itens.filter((i) => {
    const k = i.texto.toLowerCase();
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  }).slice(0, 10);

  const nCrit = lista.filter((g) => g.severidade === 'critico').length;
  const veredito = nCrit > 0 ? 'critico' : lista.length > 0 ? 'atencao' : 'ok';
  const titulo = veredito === 'critico'
    ? 'Gargalos críticos na operação'
    : veredito === 'atencao'
      ? 'Gargalos e pontos de atenção'
      : 'Sem gargalos vs peso ideal por tipo';

  const resumoFrota = opts.cenario && opts.cenario.pesoIdealKg > 0
    ? `Frota do dia: ${fmtNum(opts.cenario.ocupacaoVsIdealPct ?? 0, 0)}% do ideal`
      + ` (${fmtNum(opts.cenario.pesoMedioDiaKg, 0)} / ${fmtNum(opts.cenario.pesoIdealKg, 0)} kg). `
    : '';

  return {
    titulo,
    cls: veredito,
    resumo: `${resumoFrota}${lista.length
      ? `${fmtNum(lista.length, 0)} apontamento(s) abaixo do ideal do tipo.`
      : 'Tipos, rotas e placas dentro do parâmetro do contrato.'}`,
    lista,
  };
}

export default function OperacaoDiaLayoutRelatorio({
  analise,
  registros,
  cenarioCaixaMedia = null,
  placasReserva = [],
  volumeL = null,
  densidadeResiduoKgL = null,
  densidadeKgL = null,
  densidadeKgLPorPlaca = null,
  limitesPesoKg = null,
}: Props) {
  const limOpts = useMemo(() => ({
    limitesPesoKg,
    volumeL,
    densidadeResiduoKgL,
    densidadeKgL,
    densidadeKgLPorPlaca,
  }), [limitesPesoKg, volumeL, densidadeResiduoKgL, densidadeKgL, densidadeKgLPorPlaca]);

  const estudo = useMemo(() => {
    if (!registros.length) return null;
    return analisarEstudoRotasDia(registros, limOpts);
  }, [registros, limOpts]);

  const op = analise.resumo;
  const densFmt = resolverDensidadeResiduoKgL(cenarioCaixaMedia?.densidadeKgL ?? densidadeResiduoKgL);

  const indicadores = useMemo(() => {
    const cards: { label: string; valor: string; cor: string }[] = [
      { label: 'Viagens', valor: fmtNum(op.viagens, 0), cor: '#6366f1' },
      { label: 'Toneladas', valor: `${fmtNum(op.toneladas, 1)} t`, cor: '#16a34a' },
      { label: 't / viagem', valor: `${fmtNum(op.tonMediaColeta, 2)} t`, cor: '#0891b2' },
      { label: 'Caminhões', valor: fmtNum(op.caminhoes ?? op.coletores, 0), cor: '#7c3aed' },
    ];
    if (cenarioCaixaMedia && cenarioCaixaMedia.pesoIdealKg > 0) {
      cards.push(
        { label: '% ideal frota', valor: `${fmtNum(cenarioCaixaMedia.ocupacaoVsIdealPct ?? 0, 0)}%`, cor: '#5b21b6' },
        { label: 'Densidade', valor: `${fmtNum(densFmt, 2)} kg/L`, cor: '#b45309' },
      );
    } else {
      cards.push(
        { label: 'KM / viagem', valor: `${fmtNum(op.kmMedioViagem, 1)} km`, cor: '#d97706' },
        { label: 'KM total', valor: `${fmtNum(op.km, 0)} km`, cor: '#64748b' },
      );
    }
    return cards;
  }, [op, cenarioCaixaMedia, densFmt]);

  const pontosTipo = useMemo(
    () => montarPontosViagemPorTipo(analise, volumeL, {
      global: densidadeResiduoKgL,
      porTipo: densidadeKgL,
    }),
    [analise, volumeL, densidadeResiduoKgL, densidadeKgL],
  );

  const densidades = useMemo(() => densidadesPorPlaca(estudo), [estudo]);
  const densUnicas = useMemo(
    () => new Set(densidades.map((d) => d.dens.toFixed(2))),
    [densidades],
  );

  const gargalos = useMemo(
    () => montarGargalos({
      analise,
      estudo,
      cenario: cenarioCaixaMedia,
      placasReserva,
      limOpts,
    }),
    [analise, estudo, cenarioCaixaMedia, placasReserva, limOpts],
  );

  const rotasEstudo = useMemo(() => {
    if (!estudo?.rotas?.length) return [];
    return [...estudo.rotas]
      .filter((r) => r.viagens > 0)
      .sort((a, b) => a.rota.localeCompare(b.rota, 'pt-BR'));
  }, [estudo]);

  const maxKgTipo = Math.max(...pontosTipo.flatMap((p) => [p.pesoIdealKg, p.pesoColetadoKg]), 1);
  const totalViagensTipo = pontosTipo.reduce((s, p) => s + p.viagens, 0) || 1;

  const boxGargalo = gargalos.cls === 'critico'
    ? { bg: '#fef2f2', border: '#fecaca', titulo: '#991b1b' }
    : gargalos.cls === 'atencao'
      ? { bg: '#fffbeb', border: '#fde68a', titulo: '#92400e' }
      : { bg: '#f0fdf4', border: '#bbf7d0', titulo: '#166534' };

  const porOrigem = (origem: ItemGargalo['origem'], label: string) => {
    const subset = gargalos.lista.filter((g) => g.origem === origem);
    if (!subset.length) return null;
    return (
      <div key={origem} style={{ marginTop: '0.55rem' }}>
        <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
          {label}
        </div>
        <ol style={{ margin: 0, paddingLeft: '1.15rem', fontSize: '0.78rem', color: '#334155', lineHeight: 1.45 }}>
          {subset.map((g, i) => (
            <li key={i}>
              {g.severidade === 'critico' ? <strong>Crítico — </strong> : null}
              {g.texto}
            </li>
          ))}
        </ol>
      </div>
    );
  };

  return (
    <div>
      <Secao>Indicadores do dia</Secao>
      <div style={cardWrap}>
        {indicadores.map((c) => (
          <IndicadorCard key={c.label} label={c.label} valor={c.valor} cor={c.cor} />
        ))}
      </div>

      {pontosTipo.length > 0 && (
        <>
          <Secao>Desempenho por tipo — peso ideal × média do dia</Secao>
          <p style={{ fontSize: '0.68rem', color: '#64748b', margin: '0 0 0.65rem', lineHeight: 1.4 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#8b5cf6', marginRight: 4 }} />
            Peso ideal (contrato)
            {' · '}
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#16a34a', marginRight: 4 }} />
            Média coletada (OK)
            {' · '}
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#ef4444', marginRight: 4 }} />
            Média (fora do ótimo {PCT_IDEAL_MIN}–{PCT_IDEAL_MAX}%)
            {' · detalhe viagem a viagem na seção seguinte'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.65rem' }}>
            {pontosTipo.map((p) => {
              const wIdeal = Math.max(2, Math.round((p.pesoIdealKg / maxKgTipo) * 100));
              const wCol = Math.max(2, Math.round((p.pesoColetadoKg / maxKgTipo) * 100));
              const corCol = p.gargalo ? '#ef4444' : '#16a34a';
              const pctViag = Math.round((p.viagens / totalViagensTipo) * 100);
              return (
                <div
                  key={p.tipo}
                  style={{
                    background: '#fff',
                    border: `1px solid ${p.gargalo ? '#fecaca' : '#e2e8f0'}`,
                    borderRadius: 12,
                    padding: '0.75rem 0.85rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.92rem' }}>
                        {p.label}
                        <span style={{ fontWeight: 600, color: '#94a3b8', fontSize: '0.65rem' }}> · visão média do tipo</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                        <span style={chip}>{fmtNum(p.viagens, 0)} viagens ({fmtNum(pctViag, 0)}%)</span>
                        <span style={chip}>média {fmtNum(p.tonMediaViagem, 2)} t/v</span>
                      </div>
                    </div>
                    <span style={{
                      fontSize: '0.62rem',
                      fontWeight: 800,
                      padding: '0.2rem 0.45rem',
                      borderRadius: 6,
                      whiteSpace: 'nowrap',
                      color: p.gargalo ? '#991b1b' : '#166534',
                      background: p.gargalo ? '#fee2e2' : '#dcfce7',
                    }}
                    >
                      {p.gargalo ? 'GARGALO' : 'OK'}
                      {p.pctIdeal != null ? ` ${fmtNum(p.pctIdeal, 0)}%` : ''}
                    </span>
                  </div>
                  <BarraLinha label="Ideal" pct={wIdeal} cor="#8b5cf6" valor={`${fmtNum(p.pesoIdealKg, 0)} kg`} />
                  <BarraLinha label="Média dia" pct={wCol} cor={corCol} valor={`${fmtNum(p.pesoColetadoKg, 0)} kg`} valorCor={corCol} />
                </div>
              );
            })}
          </div>
        </>
      )}

      <Secao>Ranking de produção por viagem</Secao>
      <p style={{ fontSize: '0.68rem', color: '#64748b', margin: '0 0 0.55rem', lineHeight: 1.4 }}>
        Vista rápida: piores primeiro vs peso ideal. No PDF do dia, qualidade, peso e hora produtiva
        ficam juntos numa única seção (por rota).
      </p>

      {densidades.length > 0 && densUnicas.size === 1 && (
        <p style={{ fontSize: '0.68rem', color: '#64748b', margin: '0 0 0.55rem' }}>
          Densidade única no dia: <strong>{fmtNum(densidades[0].dens, 2)} kg/L</strong>
          {densidades[0].ideal != null ? ` · ideal ${fmtNum(densidades[0].ideal, 0)} kg` : ''}
          {' '}({fmtNum(densidades.length, 0)} placa{densidades.length !== 1 ? 's' : ''}).
        </p>
      )}

      {densidades.length > 0 && densUnicas.size > 1 && (
        <div style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 10,
          padding: '0.7rem 0.85rem',
          marginBottom: '0.75rem',
          overflowX: 'auto',
        }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0f766e', marginBottom: 4 }}>
            Densidade por caminhão no dia
          </div>
          <p style={{ fontSize: '0.65rem', color: '#64748b', margin: '0 0 0.45rem' }}>
            Ideal = volume × densidade da placa (ou do tipo, se a placa não tiver override no contrato).
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', minWidth: 420 }}>
            <thead>
              <tr style={{ background: '#f1f5f9', color: '#475569' }}>
                <th style={th}>Placa</th>
                <th style={th}>Tipo</th>
                <th style={{ ...th, textAlign: 'center' }}>Densidade</th>
                <th style={{ ...th, textAlign: 'center' }}>Peso ideal</th>
                <th style={{ ...th, textAlign: 'center' }}>Viag.</th>
              </tr>
            </thead>
            <tbody>
              {densidades.map((d, i) => (
                <tr key={d.placa} style={{ borderTop: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                  <td style={{ ...td, fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>{d.placa}</td>
                  <td style={td}>{d.tipoLabel}</td>
                  <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#0f766e' }}>
                    {fmtNum(d.dens, 2)} kg/L
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    {d.ideal != null ? `${fmtNum(d.ideal, 0)} kg` : '—'}
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>{fmtNum(d.n, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {registros.length > 0 ? (
        <GraficoRankingViagensTipo
          registros={registros}
          volumeL={volumeL}
          densidadeResiduoKgL={densidadeResiduoKgL}
          densidadeKgL={densidadeKgL}
          densidadeKgLPorPlaca={densidadeKgLPorPlaca}
          limitesPesoKg={limitesPesoKg}
          toneladasDia={op.toneladas}
          limite={0}
        />
      ) : (
        <p style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
          Sem pesos individuais (PESO 1–4) no dia para rankear viagem a viagem.
        </p>
      )}

      <Secao>Gargalos da operação</Secao>
      <div style={{
        background: boxGargalo.bg,
        border: `1px solid ${boxGargalo.border}`,
        borderRadius: 12,
        padding: '0.85rem 1rem',
      }}
      >
        <div style={{ fontWeight: 800, color: boxGargalo.titulo, fontSize: '0.92rem' }}>
          {gargalos.titulo}
        </div>
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: '#475569', lineHeight: 1.4 }}>
          {gargalos.resumo}
        </p>
        {gargalos.lista.length > 0 ? (
          <>
            {porOrigem('tipo', 'Por tipo')}
            {porOrigem('rota', 'Por rota')}
            {porOrigem('placa', 'Por placa')}
          </>
        ) : (
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
            Nenhum gargalo identificado no dia.
          </p>
        )}
      </div>

      {rotasEstudo.length > 0 && (
        <>
          <Secao>Estudo de produção por rota</Secao>
          <p style={{ fontSize: '0.68rem', color: '#64748b', margin: '0 0 0.55rem', lineHeight: 1.4 }}>
            Todas as rotas do dia. Toneladas = soma do PESO TOTAL. t/viagem e % do ideal usam PESO 1–4 vs peso ideal do tipo.
            {estudo?.mediaDia ? ` Média do dia: ${fmtNum(estudo.mediaDia.tonMediaViagem, 2)} t/viagem · ${fmtNum(estudo.mediaDia.tonHora, 2)} t/h.` : ''}
          </p>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', minWidth: 640 }}>
              <thead>
                <tr style={{ background: '#f1f5f9', color: '#475569' }}>
                  <th style={th}>Rota</th>
                  <th style={th}>Tipo</th>
                  <th style={{ ...th, textAlign: 'center' }}>Viag.</th>
                  <th style={{ ...th, textAlign: 'right' }}>Ton</th>
                  <th style={{ ...th, textAlign: 'right' }}>t/viag</th>
                  <th style={{ ...th, textAlign: 'right' }}>Ideal</th>
                  <th style={{ ...th, textAlign: 'center' }}>% ideal</th>
                  <th style={{ ...th, textAlign: 'right' }}>KM</th>
                  <th style={{ ...th, textAlign: 'right' }}>Horas</th>
                  <th style={{ ...th, textAlign: 'right' }}>t/h</th>
                </tr>
              </thead>
              <tbody>
                {rotasEstudo.map((r, i) => {
                  const corPct = r.status === 'ruim' ? '#991b1b' : r.status === 'medio' ? '#92400e' : '#166534';
                  const bg = r.status === 'ruim'
                    ? (i % 2 === 0 ? '#fef2f2' : '#fff7f7')
                    : (i % 2 === 0 ? '#fff' : '#fafbfc');
                  return (
                    <tr key={`${r.rota}-${r.tipoPredominante || i}`} style={{ background: bg, borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ ...td, fontWeight: 600 }}>{r.rota}</td>
                      <td style={td}>{r.tipoPredominanteLabel || '—'}</td>
                      <td style={{ ...td, textAlign: 'center' }}>{fmtNum(r.viagens, 0)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtNum(r.toneladas, 2)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{fmtNum(r.tonMediaViagem, 2)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {r.pesoIdealKg != null ? `${fmtNum(r.pesoIdealKg, 0)} kg` : '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'center', fontWeight: 800, color: corPct }}>
                        {r.pctIdeal != null ? `${fmtNum(r.pctIdeal, 0)}%` : '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>{fmtNum(r.km, 0)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{fmtNum(r.horas, 1)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{fmtNum(r.tonHora, 2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function BarraLinha({
  label, pct, cor, valor, valorCor,
}: {
  label: string;
  pct: number;
  cor: string;
  valor: string;
  valorCor?: string;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr 72px', gap: 8, alignItems: 'center', marginTop: 8 }}>
      <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>{label}</span>
      <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: cor, borderRadius: 4 }} />
      </div>
      <span style={{
        fontSize: '0.72rem',
        fontWeight: 700,
        textAlign: 'right',
        fontFamily: 'ui-monospace, monospace',
        color: valorCor || '#334155',
      }}
      >
        {valor}
      </span>
    </div>
  );
}

const chip: CSSProperties = {
  fontSize: '0.62rem',
  fontWeight: 600,
  color: '#475569',
  background: '#f1f5f9',
  padding: '0.15rem 0.4rem',
  borderRadius: 5,
};

const th: CSSProperties = {
  padding: '0.4rem 0.5rem',
  textAlign: 'left',
  fontWeight: 700,
  fontSize: '0.65rem',
};

const td: CSSProperties = {
  padding: '0.4rem 0.5rem',
};
