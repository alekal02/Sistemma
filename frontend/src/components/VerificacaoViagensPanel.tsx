import { FiAlertTriangle, FiCheckCircle, FiInfo } from 'react-icons/fi';

export interface VerificacaoViagensData {
  linhasImportadas: number;
  linhasValidasDashboard: number;
  linhasExcluidasDashboard: number;
  somaContadorPlanilha: number;
  viagensPorRota: number;
  viagensValidadas: number;
  sumContadorFormula: number;
  linhasSemContador: number;
  linhasComFallback: number;
  temDivergencia: boolean;
  explicacao: string[];
  divergencias?: Array<{
    data: string | null;
    placa: string | null;
    contadorPlanilha: number | null;
    viagensCalculadas: number;
    motivo: string;
  }>;
  truncado?: boolean;
}

interface VerificacaoViagensPanelProps {
  dados: VerificacaoViagensData | null;
  compacto?: boolean;
}

export default function VerificacaoViagensPanel({ dados, compacto }: VerificacaoViagensPanelProps) {
  if (!dados) return null;

  const icone = dados.temDivergencia ? FiAlertTriangle : FiCheckCircle;
  const corBorda = dados.temDivergencia ? '#fcd34d' : '#86efac';
  const corFundo = dados.temDivergencia ? '#fffbeb' : '#f0fdf4';
  const corTexto = dados.temDivergencia ? '#92400e' : '#166534';
  const Icon = icone;

  return (
    <div style={{
      background: corFundo,
      border: `1px solid ${corBorda}`,
      borderRadius: '10px',
      padding: compacto ? '0.6rem 0.75rem' : '0.75rem 1rem',
      marginBottom: '0.75rem',
      fontSize: '0.75rem',
      color: corTexto,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: dados.temDivergencia ? '0.5rem' : 0 }}>
        <Icon size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
            {dados.temDivergencia ? 'Verificação de viagens — atenção' : 'Verificação de viagens — OK'}
          </div>
          {!compacto && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: '0.35rem',
              marginBottom: '0.45rem',
            }}>
              <Metrica label="Linhas (rotas)" valor={dados.linhasImportadas} />
              <Metrica label="No dashboard" valor={dados.linhasValidasDashboard} />
              <Metrica label="Soma contador" valor={dados.somaContadorPlanilha} destaque />
              <Metrica label="Viagens KPI" valor={dados.viagensValidadas} destaque />
              {dados.linhasExcluidasDashboard > 0 && (
                <Metrica label="Excluídas" valor={dados.linhasExcluidasDashboard} alerta />
              )}
              {dados.linhasSemContador > 0 && (
                <Metrica label="Sem contador" valor={dados.linhasSemContador} alerta />
              )}
            </div>
          )}
          {dados.explicacao.slice(0, compacto ? 2 : 4).map((txt, i) => (
            <p key={i} style={{ margin: i === 0 ? 0 : '0.25rem 0 0', lineHeight: 1.45, fontSize: '0.72rem' }}>
              {txt}
            </p>
          ))}
          {dados.truncado && (
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <FiInfo size={12} /> Período pode estar truncado pelo limite de registros do servidor.
            </p>
          )}
        </div>
      </div>
      {!compacto && (dados.divergencias?.length ?? 0) > 0 && (
        <div style={{ marginTop: '0.5rem', borderTop: `1px solid ${corBorda}`, paddingTop: '0.45rem' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, marginBottom: '0.25rem' }}>
            Linhas com contagem diferente (amostra):
          </div>
          {dados.divergencias!.slice(0, 5).map((d, i) => (
            <div key={i} style={{ fontSize: '0.65rem', color: '#78350f', marginBottom: '0.15rem' }}>
              {d.data || '—'} · {d.placa || '—'} — contador {d.contadorPlanilha ?? 'vazio'} → {d.viagensCalculadas} viagem(ns): {d.motivo}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Metrica({ label, valor, destaque, alerta }: {
  label: string;
  valor: number;
  destaque?: boolean;
  alerta?: boolean;
}) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: '6px',
      padding: '0.35rem 0.45rem',
      textAlign: 'center',
      border: '1px solid rgba(0,0,0,0.06)',
    }}>
      <div style={{
        fontSize: '1rem',
        fontWeight: 800,
        color: alerta ? '#dc2626' : destaque ? '#1e40af' : '#1e293b',
      }}>
        {valor}
      </div>
      <div style={{ fontSize: '0.58rem', color: '#64748b' }}>{label}</div>
    </div>
  );
}
