/**
 * Régua temporal do dia: cada indicador contra o mesmo dia da semana no ciclo,
 * a mediana do ciclo e o dia equivalente do ciclo anterior.
 */
import { FiTrendingDown, FiTrendingUp, FiMinus, FiActivity } from 'react-icons/fi';
import {
  referenciaPrincipalBaseline,
  type BaselineDia,
  type ComparativoBaseline,
  type MetricaBaselineDia,
} from '@sistemma/shared';

interface Props {
  baseline: BaselineDia | null;
  carregando?: boolean;
}

const VERDE = '#0f766e';
const VERMELHO = '#b91c1c';
const CINZA = '#64748b';

function fmt(n: number, casas: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function corDe(melhor: boolean | null): string {
  if (melhor == null) return CINZA;
  return melhor ? VERDE : VERMELHO;
}

function Delta({ c, casas }: { c: ComparativoBaseline; casas: number }) {
  if (c.referencia == null) {
    return <span style={{ color: '#cbd5e1' }}>—</span>;
  }
  const cor = corDe(c.melhor);
  const sinal = (c.delta ?? 0) > 0 ? '+' : '';
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      <span style={{ color: '#334155', fontFamily: 'ui-monospace, monospace' }}>
        {fmt(c.referencia, casas)}
      </span>
      <span style={{ color: cor, fontWeight: 700, marginLeft: '0.35rem' }}>
        {sinal}{c.pct != null ? `${fmt(c.pct, 0)}%` : fmt(c.delta ?? 0, casas)}
      </span>
    </span>
  );
}

function Chip({ m }: { m: MetricaBaselineDia }) {
  const ref = referenciaPrincipalBaseline(m);
  const cor = corDe(ref?.comparativo.melhor ?? null);
  const Icone = ref?.comparativo.melhor == null
    ? FiMinus
    : (ref.comparativo.delta ?? 0) > 0 ? FiTrendingUp : FiTrendingDown;

  return (
    <div style={{
      border: '1px solid #e2e8f0', borderRadius: '8px', borderLeft: `4px solid ${cor}`,
      padding: '0.45rem 0.6rem', background: '#fff',
    }}>
      <div style={{ fontSize: '0.63rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
        {m.label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: '0.1rem' }}>
        <span style={{
          fontSize: '0.95rem', fontWeight: 800, color: '#0f172a',
          fontFamily: 'ui-monospace, monospace',
        }}>
          {m.valor != null ? `${fmt(m.valor, m.casas)}${m.sufixo}` : '—'}
        </span>
        {ref?.comparativo.pct != null && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.15rem',
            fontSize: '0.7rem', fontWeight: 800, color: cor,
          }}>
            <Icone size={11} />
            {fmt(Math.abs(ref.comparativo.pct), 0)}%
          </span>
        )}
      </div>
    </div>
  );
}

export default function ReguaTemporalDiaPainel({ baseline, carregando }: Props) {
  if (carregando) {
    return (
      <div style={{
        border: '1px solid #e2e8f0', borderRadius: '10px', background: '#fff',
        padding: '0.7rem 0.8rem', marginBottom: '0.85rem',
        fontSize: '0.72rem', color: '#94a3b8',
      }}>
        Montando a régua do dia dentro do ciclo…
      </div>
    );
  }

  if (!baseline) return null;

  const metricas = baseline.metricas.filter((m) => m.valor != null);
  if (!metricas.length) return null;

  return (
    <div style={{
      border: '1px solid #e2e8f0', borderRadius: '10px',
      padding: '0.7rem 0.8rem', marginBottom: '0.85rem', background: '#fff',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.15rem' }}>
        <FiActivity size={14} color="#0f766e" />
        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a' }}>
          O dia comparado com o padrão do ciclo
        </div>
        <span style={{
          background: '#f1f5f9', color: '#475569', borderRadius: '999px',
          padding: '0.1rem 0.45rem', fontSize: '0.63rem', fontWeight: 800,
        }}>
          {baseline.rotuloOcorrencia} do ciclo
        </span>
      </div>
      <div style={{ fontSize: '0.68rem', color: '#64748b', marginBottom: '0.7rem', lineHeight: 1.45 }}>
        Referência = mediana dos outros dias, para que um dia atípico não distorça a régua.
        {baseline.diasMesmoDiaSemana > 0
          ? ` ${baseline.diasMesmoDiaSemana} outro(s) ${baseline.rotuloOcorrencia.split(' ')[1]} no ciclo.`
          : ' Sem outro dia igual no ciclo ainda: a régua usa a mediana do ciclo.'}
      </div>

      <div style={{
        background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '8px',
        padding: '0.5rem 0.65rem', marginBottom: '0.7rem',
        fontSize: '0.73rem', color: '#0f766e', lineHeight: 1.5, fontWeight: 600,
      }}>
        {baseline.leitura}
      </div>

      <div style={{
        display: 'grid', gap: '0.4rem', marginBottom: '0.8rem',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      }}>
        {metricas.map((m) => <Chip key={m.id} m={m} />)}
      </div>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.71rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {[
                { label: 'Indicador', align: 'left' },
                { label: 'No dia', align: 'right' },
                { label: `Mediana ${baseline.rotuloOcorrencia.split(' ')[1] || 'dia igual'}`, align: 'right' },
                { label: 'Mediana do ciclo', align: 'right' },
                { label: 'Ciclo anterior', align: 'right' },
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
            {metricas.map((m) => (
              <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '5px 8px', fontWeight: 700, color: '#0f172a' }}>
                  {m.label}
                </td>
                <td style={{
                  padding: '5px 8px', textAlign: 'right', fontWeight: 800, color: '#0f172a',
                  fontFamily: 'ui-monospace, monospace',
                }}>
                  {m.valor != null ? fmt(m.valor, m.casas) : '—'}
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                  <Delta c={m.mesmoDiaSemana} casas={m.casas} />
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                  <Delta c={m.medianaCiclo} casas={m.casas} />
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                  <Delta c={m.cicloAnterior} casas={m.casas} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ margin: '0.4rem 0 0', fontSize: '0.66rem', color: '#94a3b8', lineHeight: 1.5 }}>
        Cada célula traz a referência e a variação do dia sobre ela. Verde = melhor que a
        referência; vermelho = pior. Em KM e KM por viagem, subir conta como pior.
        {baseline.temCicloAnterior
          ? ' O ciclo anterior é o dia equivalente (mesma ocorrência do dia da semana).'
          : ' Sem dia equivalente no ciclo anterior.'}
      </p>
    </div>
  );
}
