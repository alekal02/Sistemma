/**
 * Projeção de fechamento do ciclo e ritmo diário necessário para bater
 * o ciclo anterior.
 */
import { FiTarget } from 'react-icons/fi';
import type { MetricaProjecaoCiclo, ProjecaoCiclo } from '@sistemma/shared';

interface Props {
  projecao: ProjecaoCiclo | null;
}

function fmt(n: number, casas: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function corRumo(noRumo: boolean | null): string {
  if (noRumo == null) return '#64748b';
  return noRumo ? '#0f766e' : '#b91c1c';
}

function Barra({ m }: { m: MetricaProjecaoCiclo }) {
  if (m.alvo == null || m.alvo <= 0) return null;
  const pctRealizado = Math.min(100, (m.realizado / m.alvo) * 100);
  const pctProjetado = Math.min(100, Math.max(0, ((m.projecao - m.realizado) / m.alvo) * 100));
  return (
    <div style={{
      display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden',
      background: '#e2e8f0', marginTop: '0.3rem',
    }}>
      <div style={{ width: `${pctRealizado}%`, background: corRumo(m.noRumo) }} />
      <div style={{
        width: `${pctProjetado}%`,
        background: `repeating-linear-gradient(90deg, ${corRumo(m.noRumo)}55 0 4px, transparent 4px 8px)`,
      }} />
    </div>
  );
}

export default function ProjecaoCicloPainel({ projecao }: Props) {
  if (!projecao) return null;
  const comDados = projecao.metricas.filter((m) => m.realizado > 0);
  if (!comDados.length) return null;

  return (
    <div style={{
      padding: '0.85rem 1.1rem', background: '#fff',
      borderBottom: '1px solid #e2e8f0',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.15rem' }}>
        <FiTarget size={14} color="#4f46e5" />
        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a' }}>
          Como o ciclo deve fechar
        </div>
        <span style={{
          background: '#eef2ff', color: '#4338ca', borderRadius: '999px',
          padding: '0.1rem 0.45rem', fontSize: '0.63rem', fontWeight: 800,
        }}>
          {projecao.cicloFechado
            ? 'ciclo fechado'
            : `${projecao.diasRestantes} dia(s) restantes`}
        </span>
      </div>
      <div style={{ fontSize: '0.68rem', color: '#64748b', marginBottom: '0.7rem', lineHeight: 1.45 }}>
        Projeção = realizado + ritmo dos {projecao.diasDecorridos} dias decorridos aplicado ao
        que falta. O alvo é o ciclo anterior fechado.
      </div>

      <div style={{
        background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '8px',
        padding: '0.5rem 0.65rem', marginBottom: '0.7rem',
        fontSize: '0.73rem', color: '#3730a3', lineHeight: 1.5, fontWeight: 600,
      }}>
        {projecao.leitura}
      </div>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.71rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {[
                { label: 'Indicador', align: 'left' },
                { label: 'Realizado', align: 'right' },
                { label: 'Ritmo / dia', align: 'right' },
                { label: 'Projeção', align: 'right' },
                { label: 'Ciclo anterior', align: 'right' },
                { label: 'Ritmo necessário', align: 'right' },
              ].map((c) => (
                <th key={c.label} style={{
                  padding: '6px 8px', textAlign: c.align as 'left' | 'right',
                  fontSize: '0.61rem', fontWeight: 700, color: '#64748b',
                  textTransform: 'uppercase', letterSpacing: '0.02em',
                  borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
                }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comDados.map((m) => {
              const cor = corRumo(m.noRumo);
              return (
                <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '5px 8px', fontWeight: 700, color: '#0f172a', minWidth: '150px' }}>
                    {m.label}
                    <Barra m={m} />
                  </td>
                  <td style={{
                    padding: '5px 8px', textAlign: 'right', color: '#334155',
                    fontFamily: 'ui-monospace, monospace',
                  }}>
                    {fmt(m.realizado, m.casas)}
                  </td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', color: '#334155' }}>
                    {fmt(m.ritmoAtual, m.casas + 1)}
                  </td>
                  <td style={{
                    padding: '5px 8px', textAlign: 'right', fontWeight: 800, color: cor,
                    fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap',
                  }}>
                    {fmt(m.projecao, m.casas)}
                    {m.pctProjecao != null && (
                      <span style={{ fontWeight: 700, marginLeft: '0.3rem', fontSize: '0.66rem' }}>
                        ({fmt(m.pctProjecao, 0)}%)
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', color: '#64748b' }}>
                    {m.alvo != null ? fmt(m.alvo, m.casas) : '—'}
                  </td>
                  <td style={{
                    padding: '5px 8px', textAlign: 'right', fontWeight: 800,
                    color: m.noRumo === false ? '#b91c1c' : '#0f766e', whiteSpace: 'nowrap',
                  }}>
                    {m.ritmoNecessario != null
                      ? `${m.sentido === 'conter' ? 'até ' : ''}${fmt(m.ritmoNecessario, m.casas + 1)}`
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ margin: '0.4rem 0 0', fontSize: '0.66rem', color: '#94a3b8', lineHeight: 1.5 }}>
        Barra cheia = realizado sobre o ciclo anterior; hachurada = o que a projeção
        acrescenta. Em KM o ritmo necessário é teto, não meta: quanto menos, melhor.
      </p>
    </div>
  );
}
