import { useState } from 'react';

interface KpiImportModalProps {
  contratoKpis: any[];
  servicosComKpis: { id: string; nome: string; kpis: any[]; totalKpis: number }[];
  carregandoServicos: boolean;
  onImportContrato: (kpi: any) => void;
  onImportServico: (kpi: any) => void;
  onCarregarServicos: () => void;
  onClose: () => void;
}

export default function KpiImportModal({
  contratoKpis,
  servicosComKpis,
  carregandoServicos,
  onImportContrato,
  onImportServico,
  onCarregarServicos,
  onClose,
}: KpiImportModalProps) {
  const [aba, setAba] = useState<'contrato' | 'servico'>('contrato');

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.4)', zIndex: 2000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '12px', width: '500px', maxWidth: '90vw',
          boxShadow: '0 16px 48px rgba(0,0,0,0.2)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
            Importar KPI
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', color: '#94a3b8', cursor: 'pointer', padding: '0.25rem' }}>×</button>
        </div>

        {/* Abas: De onde importar */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
          <button
            onClick={() => setAba('contrato')}
            style={{
              flex: 1, padding: '0.5rem', border: 'none', cursor: 'pointer',
              background: aba === 'contrato' ? '#f0fdf4' : 'transparent',
              fontWeight: 700, fontSize: '0.78rem',
              color: aba === 'contrato' ? '#15803d' : '#64748b',
              borderBottom: aba === 'contrato' ? '2px solid #22c55e' : '2px solid transparent',
            }}
          >
            📄 Do Contrato {contratoKpis.length > 0 && `(${contratoKpis.length})`}
          </button>
          <button
            onClick={() => { setAba('servico'); if (!carregandoServicos && servicosComKpis.length === 0) onCarregarServicos(); }}
            style={{
              flex: 1, padding: '0.5rem', border: 'none', cursor: 'pointer',
              background: aba === 'servico' ? '#f0fdf4' : 'transparent',
              fontWeight: 700, fontSize: '0.78rem',
              color: aba === 'servico' ? '#16a34a' : '#64748b',
              borderBottom: aba === 'servico' ? '2px solid #22c55e' : '2px solid transparent',
            }}
          >
            📁 De Outro Serviço {servicosComKpis.length > 0 && `(${servicosComKpis.reduce((s, sv) => s + sv.totalKpis, 0)})`}
          </button>
        </div>

        {/* Conteúdo */}
        <div style={{ maxHeight: '350px', overflow: 'auto', padding: '0.5rem' }}>
          {aba === 'contrato' && (
            <>
              {contratoKpis.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>
                  Nenhum KPI configurado no contrato.
                </div>
              ) : (
                contratoKpis.map((ck, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => { onImportContrato(ck); onClose(); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '0.45rem 0.65rem', border: 'none', borderBottom: '1px solid #f8fafc',
                      background: '#fff', cursor: 'pointer', fontSize: '0.8rem', color: '#1e293b',
                      borderRadius: '4px', marginBottom: '2px',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
                  >
                    <div style={{ fontWeight: 600 }}>{ck.nome || ck.label || 'Sem nome'}</div>
                    <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                      {ck.formato === 'moeda' ? 'R$' : ck.formato === 'porcentagem' ? '%' : 'No'}
                      {ck.expressao ? ' • Fórmula' : ck.agregacao ? ' • ' + ck.agregacao : ''}
                    </div>
                  </button>
                ))
              )}
            </>
          )}

          {aba === 'servico' && (
            <>
              {carregandoServicos ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>Carregando...</div>
              ) : servicosComKpis.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>
                  Nenhum KPI ativo em outros serviços.
                </div>
              ) : (
                servicosComKpis.map(sv => (
                  <div key={sv.id}>
                    <div style={{
                      padding: '0.35rem 0.65rem', background: '#f8fafc', fontSize: '0.7rem',
                      fontWeight: 700, color: '#475569', borderBottom: '1px solid #f1f5f9',
                      display: 'flex', alignItems: 'center', gap: '0.3rem',
                    }}>
                      <span style={{ color: '#22c55e', fontSize: '0.6rem' }}>●</span>
                      {sv.nome}
                      <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: '#94a3b8' }}>
                        {sv.totalKpis} KPI{sv.totalKpis !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {sv.kpis.map((kpi: any, ki: number) => (
                      <button
                        key={ki}
                        type="button"
                        onClick={() => { onImportServico(kpi); onClose(); }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '0.4rem 0.65rem 0.4rem 1.2rem', border: 'none',
                          borderBottom: '1px solid #f8fafc', background: '#fff',
                          cursor: 'pointer', fontSize: '0.78rem', color: '#1e293b',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f0fdf4'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <span style={{ fontSize: '0.6rem', color: '#22c55e' }}>+</span>
                          <span style={{ fontWeight: 600 }}>{kpi.label || kpi.nome || 'KPI'}</span>
                          <span style={{
                            marginLeft: 'auto', fontSize: '0.6rem', padding: '0.05rem 0.3rem',
                            borderRadius: '3px', background: '#f1f5f9', color: '#64748b', fontWeight: 700,
                          }}>
                            {kpi.formato === 'moeda' ? 'R$' : kpi.formato === 'porcentagem' ? '%' : 'No'}
                          </span>
                        </div>
                        {kpi.descricao && (
                          <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '0.1rem', paddingLeft: '0.7rem' }}>
                            {kpi.descricao}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid #e2e8f0', textAlign: 'right' }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.35rem 0.8rem', borderRadius: '6px', border: '1px solid #d1d5db',
              background: '#fff', color: '#374151', fontSize: '0.78rem', cursor: 'pointer',
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
