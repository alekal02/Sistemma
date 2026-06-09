import type { RotaKpi } from '../services/dashboardExecutivoService';

interface Props {
  rotas: RotaKpi[];
}

export default function AnaliseRotas({ rotas }: Props) {
  if (rotas.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '1.5rem', color: '#94a3b8',
        fontSize: '0.82rem',
      }}>
        Nenhuma coluna de rota detectada. Para usar esta funcionalidade,
        a planilha deve conter uma coluna como "ROTA", "REGIONAL" ou "DESTINO".
      </div>
    );
  }

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table className="analise-tabela" style={{ fontSize: '0.72rem' }}>
          <thead>
            <tr>
              <th>#</th>
              <th>Rota / Regional</th>
              <th>Viagens</th>
              <th>Tonelagem</th>
              <th>KM</th>
              <th>t/viagem</th>
            </tr>
          </thead>
          <tbody>
            {rotas.map((r, i) => (
              <tr key={r.rota}>
                <td style={{ color: '#94a3b8', fontWeight: 600 }}>{i + 1}</td>
                <td><strong>{r.rota}</strong></td>
                <td style={{ fontWeight: 600 }}>
                  {r.viagens.toLocaleString('pt-BR')}
                </td>
                <td style={{ fontWeight: 700, color: '#059669' }}>
                  {r.tonelagem.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} t
                </td>
                <td>
                  {r.kmTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} km
                </td>
                <td style={{ fontWeight: 600 }}>
                  {r.tonPorViagem.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mini cards de resumo */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: '0.5rem', marginTop: '0.75rem',
      }}>
        {rotas.slice(0, 4).map(r => {
          const cor = ['#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6'][rotas.indexOf(r) % 4];
          return (
            <div key={r.rota} style={{
              background: '#f8fafc', border: '1px solid #e2e8f0',
              borderRadius: '8px', padding: '0.6rem 0.75rem',
              borderLeft: `3px solid ${cor}`,
            }}>
              <div style={{
                fontSize: '0.65rem', fontWeight: 700, color: '#64748b',
                textTransform: 'uppercase', letterSpacing: '0.02em',
              }}>
                {r.rota}
              </div>
              <div style={{
                fontSize: '1rem', fontWeight: 700, color: '#0f172a',
                marginTop: '0.15rem',
              }}>
                {r.tonelagem.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} t
              </div>
              <div style={{
                fontSize: '0.6rem', color: '#94a3b8', marginTop: '0.1rem',
              }}>
                {r.viagens} viagens &middot; {r.tonPorViagem.toFixed(1)} t/via
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
