import type { DadoDiario } from '../utils/relatorioDiario';
import { fmtNum, fmtMoeda } from '../utils/relatorioDiario';

interface Props {
  dias: DadoDiario[];
  totais: DadoDiario;
}

export default function TabelaDiariaOperacional({ dias, totais }: Props) {
  const maxVg = Math.max(...dias.map(d => d.viagens), 1);
  const maxTon = Math.max(...dias.map(d => d.toneladas), 0.1);
  const maxKm = Math.max(...dias.map(d => d.km), 1);
  const maxHr = Math.max(...dias.map(d => d.horas), 0.1);

  const miniBar = (val: number, max: number, cor: string) => (
    <div style={{
      width: `${Math.max(3, (val / max) * 100)}%`,
      maxWidth: '50px', height: '3px', background: cor,
      borderRadius: '2px', margin: '3px 0 0 auto', opacity: 0.5,
    }} />
  );

  return (
    <div style={{
      background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0',
      overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      marginBottom: '1rem',
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', minWidth: '700px' }}>
          <thead>
            <tr style={{ background: '#1e293b', color: '#fff' }}>
              <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left' }}>Data</th>
              <th style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>Viagens</th>
              <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>Toneladas</th>
              <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>KM</th>
              <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>Horas</th>
              <th style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>Col.</th>
              <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>t/viagem</th>
              <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>KM/h</th>
            </tr>
          </thead>
          <tbody>
            {dias.map((d, idx) => (
              <tr key={d.data} style={{
                borderTop: '1px solid #e2e8f0',
                background: idx % 2 === 0 ? '#f8fafc' : '#fff',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#eef2ff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = idx % 2 === 0 ? '#f8fafc' : '#fff'; }}
              >
                <td style={{ padding: '0.45rem 0.6rem', fontWeight: 700, color: '#6366f1' }}>{d.label}</td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center', fontWeight: 600 }}>
                  {fmtNum(d.viagens, 0)}{miniBar(d.viagens, maxVg, '#3b82f6')}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 600, color: '#166534' }}>
                  {fmtNum(d.toneladas, 1)}{miniBar(d.toneladas, maxTon, '#22c55e')}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 600, color: '#92400e' }}>
                  {fmtNum(d.km, 0)}{miniBar(d.km, maxKm, '#f59e0b')}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 600, color: '#6b21a8' }}>
                  {fmtNum(d.horas, 1)}{miniBar(d.horas, maxHr, '#a855f7')}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center', color: '#475569' }}>{d.coletores}</td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 600, color: '#9a3412', fontSize: '0.68rem' }}>
                  {fmtNum(d.viagens > 0 ? d.toneladas / d.viagens : 0, 1)}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 600, color: '#0891b2', fontSize: '0.68rem' }}>
                  {fmtNum(d.horas > 0 ? d.km / d.horas : 0, 0)}
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid #6366f1', background: '#eef2ff', fontWeight: 800 }}>
              <td style={{ padding: '0.5rem 0.6rem', fontWeight: 800, color: '#4338ca' }}>TOTAL</td>
              <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center', fontWeight: 800, color: '#4338ca' }}>{fmtNum(totais.viagens, 0)}</td>
              <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 800, color: '#166534' }}>{fmtNum(totais.toneladas, 1)}</td>
              <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 800, color: '#92400e' }}>{fmtNum(totais.km, 0)}</td>
              <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 800, color: '#6b21a8' }}>{fmtNum(totais.horas, 1)}</td>
              <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center', fontWeight: 800, color: '#4338ca' }}>{totais.coletores}</td>
              <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 700, color: '#9a3412' }}>
                {fmtNum(totais.viagens > 0 ? totais.toneladas / totais.viagens : 0, 1)}
              </td>
              <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 700, color: '#0891b2' }}>
                {fmtNum(totais.horas > 0 ? totais.km / totais.horas : 0, 0)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
