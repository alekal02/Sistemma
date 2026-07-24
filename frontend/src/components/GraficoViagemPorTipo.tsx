import { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Cell,
} from 'recharts';
import type { OperacaoDiaAnalise } from '../utils/operacaoDia';
import { PCT_IDEAL_MAX, PCT_IDEAL_MIN, type MapaLimiteCaminhao } from '../utils/limitesCaminhaoContrato';
import { fmtNum } from '../utils/relatorioDiario';
import {
  montarPontosViagemPorTipo,
  type PontoViagemTipo,
} from '../utils/viagemPorTipoGrafico';

export type { PontoViagemTipo };
export { montarPontosViagemPorTipo };

type Props = {
  analise: OperacaoDiaAnalise;
  volumeL?: MapaLimiteCaminhao | null;
  densidadeResiduoKgL?: number | null;
  densidadeKgL?: MapaLimiteCaminhao | null;
};

function TooltipComposto({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0] as { payload?: PontoViagemTipo };
  const p = row?.payload;
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
      padding: '0.5rem 0.65rem', fontSize: '0.72rem', boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    }}>
      <div style={{ fontWeight: 800, marginBottom: 4, color: '#0f172a' }}>
        {label}{p?.gargalo ? ' · GARGALO' : ' · OK'}
      </div>
      {payload.map((item) => (
        <div key={String(item.dataKey)} style={{ color: item.color || '#334155', marginTop: 2 }}>
          {item.name}: <strong>{
            item.dataKey === 'viagens'
              ? fmtNum(Number(item.value), 0)
              : item.dataKey === 'tonMediaViagem'
                ? `${fmtNum(Number(item.value), 2)} t`
                : `${fmtNum(Number(item.value), 0)} kg`
          }</strong>
        </div>
      ))}
      {p?.pctIdeal != null && (
        <div style={{ marginTop: 4, color: p.gargalo ? '#991b1b' : '#166534', fontWeight: 700 }}>
          {fmtNum(p.pctIdeal, 0)}% do peso ideal
        </div>
      )}
    </div>
  );
}

/**
 * Gráfico por tipo: peso ideal × peso coletado × viagens × t/viagem + status de gargalo.
 * - Barras/linhas (4 séries, 2 eixos Y)
 * - Radar (4 eixos normalizados) por tipo
 */
export default function GraficoViagemPorTipo({
  analise,
  volumeL = null,
  densidadeResiduoKgL = null,
  densidadeKgL = null,
}: Props) {
  const pontos = useMemo(
    () => montarPontosViagemPorTipo(analise, volumeL, {
      global: densidadeResiduoKgL,
      porTipo: densidadeKgL,
    }),
    [analise, volumeL, densidadeResiduoKgL, densidadeKgL],
  );

  const radarData = useMemo(() => {
    if (!pontos.length) return [];
    const maxIdeal = Math.max(...pontos.map((p) => p.pesoIdealKg), 1);
    const maxColetado = Math.max(...pontos.map((p) => p.pesoColetadoKg), 1);
    const maxViagens = Math.max(...pontos.map((p) => p.viagens), 1);
    const maxTon = Math.max(...pontos.map((p) => p.tonMediaViagem), 0.01);

    const metricas: Array<{ chave: keyof PontoViagemTipo; eixo: string; max: number }> = [
      { chave: 'pesoIdealKg', eixo: 'Peso ideal', max: maxIdeal },
      { chave: 'pesoColetadoKg', eixo: 'Peso coletado', max: maxColetado },
      { chave: 'viagens', eixo: 'Qtd. viagens', max: maxViagens },
      { chave: 'tonMediaViagem', eixo: 't / viagem', max: maxTon },
    ];

    return metricas.map((m) => {
      const row: Record<string, string | number> = { eixo: m.eixo };
      for (const p of pontos) {
        const raw = Number(p[m.chave]);
        row[p.label] = Math.round((raw / m.max) * 1000) / 10;
      }
      return row;
    });
  }, [pontos]);

  const coresTipo = ['#6366f1', '#16a34a', '#d97706', '#dc2626'];

  if (!pontos.length) return null;

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 10,
      padding: '0.75rem 0.85rem',
      marginBottom: '0.85rem',
    }}>
      <div style={{
        fontSize: '0.7rem', fontWeight: 800, color: '#334155',
        textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '0.25rem',
      }}>
        Viagens por tipo — ideal × coletado × volume
      </div>
      <div style={{ fontSize: '0.62rem', color: '#64748b', marginBottom: '0.65rem', lineHeight: 1.4 }}>
        Cada tipo com seu peso ideal (volume × densidade). Barras vermelhas = fora da faixa ótima ({PCT_IDEAL_MIN}–{PCT_IDEAL_MAX}% do ideal).
        O radar usa 4 eixos normalizados (0–100) para comparar tipos.
      </div>

      <div style={{ width: '100%', height: 280, marginBottom: '0.75rem' }}>
        <ResponsiveContainer>
          <ComposedChart data={pontos} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 700 }} />
            <YAxis
              yAxisId="kg"
              tick={{ fontSize: 10, fill: '#64748b' }}
              width={48}
              tickFormatter={(v: number) => `${fmtNum(v, 0)}`}
              label={{ value: 'kg', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#94a3b8' } }}
            />
            <YAxis
              yAxisId="qtd"
              orientation="right"
              tick={{ fontSize: 10, fill: '#64748b' }}
              width={40}
              tickFormatter={(v: number) => fmtNum(v, 1)}
              label={{ value: 'viag. / t', angle: 90, position: 'insideRight', style: { fontSize: 10, fill: '#94a3b8' } }}
            />
            <Tooltip content={<TooltipComposto />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="kg" dataKey="pesoIdealKg" name="Peso ideal (kg)" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={36}>
              {pontos.map((p) => (
                <Cell key={`ideal-${p.tipo}`} fill="#8b5cf6" fillOpacity={0.85} />
              ))}
            </Bar>
            <Bar yAxisId="kg" dataKey="pesoColetadoKg" name="Peso coletado (kg)" radius={[4, 4, 0, 0]} maxBarSize={36}>
              {pontos.map((p) => (
                <Cell key={`col-${p.tipo}`} fill={p.gargalo ? '#ef4444' : '#22c55e'} />
              ))}
            </Bar>
            <Line
              yAxisId="qtd"
              type="monotone"
              dataKey="viagens"
              name="Qtd. viagens"
              stroke="#2563eb"
              strokeWidth={2.5}
              dot={{ r: 4, fill: '#2563eb' }}
            />
            <Line
              yAxisId="qtd"
              type="monotone"
              dataKey="tonMediaViagem"
              name="t / viagem"
              stroke="#ea580c"
              strokeWidth={2.5}
              strokeDasharray="4 3"
              dot={{ r: 4, fill: '#ea580c' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(240px, 1fr) minmax(220px, 0.9fr)',
        gap: '0.75rem',
        alignItems: 'stretch',
      }}>
        <div style={{ width: '100%', height: 260 }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
            Radar — 4 eixos por tipo (normalizado)
          </div>
          <ResponsiveContainer>
            <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="eixo" tick={{ fontSize: 10, fill: '#475569', fontWeight: 600 }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9, fill: '#94a3b8' }} />
              {pontos.map((p, i) => (
                <Radar
                  key={p.tipo}
                  name={p.label}
                  dataKey={p.label}
                  stroke={coresTipo[i % coresTipo.length]}
                  fill={coresTipo[i % coresTipo.length]}
                  fillOpacity={p.gargalo ? 0.28 : 0.12}
                  strokeWidth={p.gargalo ? 2.5 : 1.8}
                />
              ))}
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: number) => [`${fmtNum(v, 0)} / 100`, 'índice']}
                contentStyle={{ borderRadius: 8, fontSize: '0.72rem' }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div style={{
          border: '1px solid #f1f5f9', borderRadius: 8, padding: '0.5rem 0.6rem',
          background: '#f8fafc',
        }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', marginBottom: 6 }}>
            Leitura por tipo
          </div>
          {pontos.map((p) => (
            <div
              key={p.tipo}
              style={{
                display: 'grid',
                gridTemplateColumns: '72px 1fr auto',
                gap: '0.35rem',
                alignItems: 'center',
                padding: '0.35rem 0',
                borderBottom: '1px solid #e2e8f0',
                fontSize: '0.68rem',
              }}
            >
              <strong style={{ color: '#0f172a' }}>{p.label}</strong>
              <span style={{ color: '#64748b' }}>
                {fmtNum(p.pesoColetadoKg, 0)} / {fmtNum(p.pesoIdealKg, 0)} kg
                {' · '}{fmtNum(p.viagens, 0)} viag.
                {' · '}{fmtNum(p.tonMediaViagem, 2)} t/v
              </span>
              <span style={{
                fontWeight: 800,
                fontSize: '0.62rem',
                padding: '0.12rem 0.4rem',
                borderRadius: 4,
                color: p.gargalo ? '#991b1b' : '#166534',
                background: p.gargalo ? '#fee2e2' : '#dcfce7',
              }}>
                {p.gargalo ? 'GARGALO' : 'OK'}
                {p.pctIdeal != null ? ` ${fmtNum(p.pctIdeal, 0)}%` : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
