import { useMemo, useState, type CSSProperties } from 'react';
import { analisarCapacidadeViagensDia } from '../utils/capacidadeViagemDia';
import {
  LABEL_TIPO_CAMINHAO,
  PCT_IDEAL_MAX,
  PCT_IDEAL_MIN,
  PCT_PESSIMO_ALTO,
  PCT_PESSIMO_BAIXO,
  textoEscalaIdealCurto,
  type MapaLimiteCaminhao,
  type TipoLimiteCaminhao,
} from '../utils/limitesCaminhaoContrato';
import {
  COR_STATUS_RANKING,
  LABEL_STATUS_RANKING,
  montarRankingViagensPorTipo,
  tiposPresentesRanking,
  type RankingViagemTipoItem,
  type StatusRankingViagem,
} from '../utils/rankingViagensTipo';
import { fmtNum } from '../utils/relatorioDiario';

type FiltroTipo = 'TODOS' | TipoLimiteCaminhao;

type Props = {
  registros: Record<string, unknown>[];
  volumeL?: MapaLimiteCaminhao | null;
  densidadeResiduoKgL?: number | null;
  densidadeKgL?: MapaLimiteCaminhao | null;
  limitesPesoKg?: MapaLimiteCaminhao | null;
  /** Máx. de linhas no gráfico (piores primeiro). */
  limite?: number;
};

const BADGE_STYLE: Record<StatusRankingViagem, CSSProperties> = {
  pessimo: { color: '#7f1d1d', background: '#fecaca' },
  ruim: { color: '#9a3412', background: '#ffedd5' },
  otimo: { color: '#166534', background: '#dcfce7' },
};

function detalheLinha(item: RankingViagemTipoItem): string {
  const parts = [
    `1 viag.`,
    `${fmtNum(item.toneladas, 2)} t/viag`,
  ];
  if (item.pctIdeal != null && item.pesoIdealKg != null) {
    parts.push(`${fmtNum(item.pctIdeal, 0)}% do ideal ${item.tipoLabel}`);
    parts.push(item.faixaLabel);
  } else if (item.pctMediaTipo != null) {
    parts.push(`${fmtNum(item.pctMediaTipo, 0)}% da média ${item.tipoLabel}`);
  }
  if (item.pctIdeal != null && item.pctMediaTipo != null) {
    parts.push(`${fmtNum(item.pctMediaTipo, 0)}% da média tipo`);
  }
  if (item.rota && item.rota !== '—') {
    parts.push(item.rota.length > 18 ? `${item.rota.slice(0, 18)}…` : item.rota);
  }
  return parts.join(' · ');
}

/**
 * Ranking horizontal viagem a viagem (estilo produção por veículo),
 * comparado com o ideal/média do próprio tipo (Mini, Toco, …).
 */
export default function GraficoRankingViagensTipo({
  registros,
  volumeL = null,
  densidadeResiduoKgL = null,
  densidadeKgL = null,
  limitesPesoKg = null,
  limite = 40,
}: Props) {
  const [filtro, setFiltro] = useState<FiltroTipo>('TODOS');

  const capacidade = useMemo(
    () => analisarCapacidadeViagensDia(registros, {
      limitesPesoKg,
      volumeL,
      densidadeResiduoKgL,
      densidadeKgL,
    }),
    [registros, limitesPesoKg, volumeL, densidadeResiduoKgL, densidadeKgL],
  );

  const ranking = useMemo(
    () => montarRankingViagensPorTipo(capacidade),
    [capacidade],
  );

  const tipos = useMemo(() => tiposPresentesRanking(ranking), [ranking]);

  const filtrados = useMemo(() => {
    const base = filtro === 'TODOS'
      ? ranking
      : ranking.filter((r) => r.tipo === filtro);
    return base.slice(0, limite);
  }, [ranking, filtro, limite]);

  if (!ranking.length) return null;

  const maxTon = Math.max(...filtrados.map((d) => d.toneladas), 0.01);
  const totalTon = filtrados.reduce((s, d) => s + d.toneladas, 0);
  const nPessimo = filtrados.filter((d) => d.status === 'pessimo').length;
  const nRuim = filtrados.filter((d) => d.status === 'ruim').length;
  const nOtimo = filtrados.filter((d) => d.status === 'otimo').length;

  const SVG_W = 420;
  const rowH = 38;
  const headerH = 8;
  const SVG_H = headerH + filtrados.length * rowH + 4;
  const labelW = 78;
  const chartX = labelW + 8;
  const chartW = SVG_W - chartX - 48;

  const tabs: { id: FiltroTipo; label: string }[] = [
    { id: 'TODOS', label: 'Todos' },
    ...tipos.map((t) => ({ id: t as FiltroTipo, label: LABEL_TIPO_CAMINHAO[t] })),
  ];

  // Legenda de referência no caption (média/ideal por tipo filtrado)
  const captionRef = (() => {
    if (filtro !== 'TODOS') {
      const ideal = capacidade.pesosIdeaisAplicados[filtro];
      const media = capacidade.porTipo.find((t) => t.tipo === filtro)?.mediaPesoKg;
      const parts: string[] = [];
      if (ideal > 0) parts.push(`ideal ${fmtNum(ideal / 1000, 2)} t`);
      if (media && media > 0) parts.push(`média tipo ${fmtNum(media / 1000, 2)} t`);
      return parts.length ? ` (${parts.join(' · ')})` : '';
    }
    return ' — cada viagem vs ideal do próprio tipo';
  })();

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 10,
      padding: '0.75rem 0.85rem',
      marginBottom: '0.85rem',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '0.5rem',
        marginBottom: '0.35rem',
      }}>
        <div>
          <div style={{
            fontSize: '0.7rem',
            fontWeight: 800,
            color: '#334155',
            textTransform: 'uppercase',
            letterSpacing: '0.03em',
          }}>
            Ranking de produção por viagem
          </div>
          <div style={{ fontSize: '0.62rem', color: '#64748b', marginTop: 2, lineHeight: 1.35 }}>
            Toneladas por viagem{captionRef}. Escala: &lt;{PCT_PESSIMO_BAIXO}% péssimo · {PCT_PESSIMO_BAIXO}–{PCT_IDEAL_MIN}% ruim · {PCT_IDEAL_MIN}–{PCT_IDEAL_MAX}% ótimo · {PCT_IDEAL_MAX}–{PCT_PESSIMO_ALTO}% ruim · &gt;{PCT_PESSIMO_ALTO}% péssimo.
          </div>
        </div>
        <span style={{
          fontSize: '0.58rem',
          fontWeight: 700,
          padding: '0.15rem 0.5rem',
          borderRadius: 6,
          color: '#1d4ed8',
          background: '#dbeafe',
          whiteSpace: 'nowrap',
        }}>
          Total: {fmtNum(totalTon, 1)} t
        </span>
      </div>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        marginBottom: '0.55rem',
        alignItems: 'center',
      }}>
        {tabs.map((t) => {
          const ativo = filtro === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setFiltro(t.id)}
              style={{
                border: ativo ? '1px solid #6366f1' : '1px solid #e2e8f0',
                background: ativo ? '#eef2ff' : '#f8fafc',
                color: ativo ? '#4338ca' : '#64748b',
                fontSize: '0.62rem',
                fontWeight: 700,
                padding: '0.2rem 0.5rem',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          );
        })}
        <span style={{ fontSize: '0.58rem', color: '#94a3b8', marginLeft: 4 }} title={textoEscalaIdealCurto()}>
          {fmtNum(nPessimo, 0)} péssimo · {fmtNum(nRuim, 0)} ruim · {fmtNum(nOtimo, 0)} ótimo
          {ranking.length > limite ? ` · top ${limite} piores` : ''}
        </span>
      </div>

      {!filtrados.length ? (
        <div style={{ fontSize: '0.68rem', color: '#94a3b8', padding: '0.5rem 0' }}>
          Nenhuma viagem neste filtro.
        </div>
      ) : (
        <svg
          width="100%"
          height={SVG_H}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          style={{ display: 'block' }}
        >
          {filtrados.map((d, i) => {
            const y = headerH + i * rowH;
            const barW = Math.max(4, (d.toneladas / maxTon) * chartW);
            const cor = COR_STATUS_RANKING[d.status];
            const placa = d.placa.length > 9 ? `${d.placa.slice(0, 9)}…` : d.placa;
            const badge = LABEL_STATUS_RANKING[d.status];
            const badgeFill = BADGE_STYLE[d.status].background as string;
            const badgeColor = BADGE_STYLE[d.status].color as string;
            const badgeW = Math.max(36, badge.length * 5.2 + 8);

            return (
              <g key={d.id}>
                <text
                  x={labelW}
                  y={y + 8}
                  textAnchor="end"
                  fontSize="8.5"
                  fontWeight="700"
                  fill="#1e293b"
                >
                  {placa}
                </text>
                <rect
                  x={labelW - badgeW}
                  y={y + 12}
                  width={badgeW}
                  height={11}
                  rx={3}
                  fill={badgeFill}
                />
                <text
                  x={labelW - badgeW / 2}
                  y={y + 20}
                  textAnchor="middle"
                  fontSize="6.5"
                  fontWeight="700"
                  fill={badgeColor}
                >
                  {badge}
                </text>
                <text
                  x={labelW - badgeW / 2}
                  y={y + 30}
                  textAnchor="middle"
                  fontSize="5.5"
                  fill="#94a3b8"
                >
                  {d.tipoLabel}
                </text>

                <rect
                  x={chartX}
                  y={y + 2}
                  width={barW}
                  height={14}
                  fill={cor}
                  rx={3}
                  opacity={0.92}
                >
                  <title>
                    {`${d.placa} (${d.tipoLabel}): ${fmtNum(d.toneladas, 2)} t — ${fmtNum(d.pctRef, 0)}% do ${d.refLabel}`}
                  </title>
                </rect>
                <text
                  x={chartX + barW + 4}
                  y={y + 13}
                  fontSize="7.5"
                  fontWeight="700"
                  fill="#1d4ed8"
                >
                  {fmtNum(d.toneladas, 1)} t
                </text>
                <text x={chartX} y={y + 28} fontSize="6.2" fill="#94a3b8">
                  {detalheLinha(d)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
