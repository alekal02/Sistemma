import { FiMap, FiUsers, FiTool, FiLayers } from 'react-icons/fi';
import { fmtAreaM2, type AnaliseRocadaDia } from '../utils/operacaoRocada';
import { formatarIsoParaBr } from '../utils/periodoDados';

interface Props {
  dataIso: string;
  analise: AnaliseRocadaDia | null;
  registros?: Record<string, unknown>[];
  totalRegistros?: number;
  carregandoRegistros?: boolean;
  mostrarRegistros?: boolean;
  onToggleRegistros?: () => void;
  pagina?: number;
  totalPaginas?: number;
  onPaginaChange?: (pagina: number) => void;
}

function Kpi({ label, valor, cor, icone }: { label: string; valor: string; cor: string; icone: React.ReactNode }) {
  return (
    <div style={{
      flex: '1 1 140px', background: '#fff', border: '1px solid #e2e8f0',
      borderRadius: '10px', padding: '0.65rem 0.75rem', borderTop: `3px solid ${cor}`, minWidth: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.3rem',
        fontSize: '0.62rem', fontWeight: 700, color: '#64748b',
        textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '0.25rem',
      }}>
        {icone} {label}
      </div>
      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>{valor}</div>
    </div>
  );
}

function TabelaGrupo({ titulo, linhas }: { titulo: string; linhas: { label: string; registros: number; areaM2: number }[] }) {
  if (!linhas.length) return null;
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px',
      overflow: 'hidden', marginBottom: '0.75rem',
    }}>
      <div style={{
        padding: '0.55rem 0.85rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
        fontSize: '0.75rem', fontWeight: 700, color: '#334155',
      }}>
        {titulo}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
          <thead>
            <tr style={{ color: '#64748b', background: '#fafbfc' }}>
              <th style={{ padding: '0.4rem 0.85rem', textAlign: 'left' }}>Nome</th>
              <th style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>Registros</th>
              <th style={{ padding: '0.4rem 0.85rem', textAlign: 'right' }}>Área (m²)</th>
            </tr>
          </thead>
          <tbody>
            {linhas.slice(0, 30).map((l) => (
              <tr key={l.label} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ padding: '0.4rem 0.85rem', fontWeight: 600, color: '#1e293b' }}>{l.label}</td>
                <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center', color: '#475569' }}>{l.registros}</td>
                <td style={{ padding: '0.4rem 0.85rem', textAlign: 'right', fontWeight: 700, color: '#166534' }}>
                  {fmtAreaM2(l.areaM2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function RocadaDiaPanel({
  dataIso,
  analise,
  registros = [],
  totalRegistros,
  carregandoRegistros,
  mostrarRegistros,
  onToggleRegistros,
  pagina = 1,
  totalPaginas = 1,
  onPaginaChange,
}: Props) {
  if (carregandoRegistros && !analise) {
    return <div style={{ padding: '1rem', color: '#94a3b8', fontSize: '0.8rem' }}>Carregando operação de roçada...</div>;
  }

  if (!analise || analise.resumo.registros <= 0) {
    return (
      <div style={{
        background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '10px',
        padding: '1rem', color: '#9a3412', fontSize: '0.85rem',
      }}>
        Nenhuma área roçada em {formatarIsoParaBr(dataIso)}.
      </div>
    );
  }

  const { resumo } = analise;
  const total = totalRegistros ?? resumo.registros;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.85rem' }}>
        <Kpi label="Área total" valor={`${fmtAreaM2(resumo.areaM2)} m²`} cor="#22c55e" icone={<FiLayers size={11} />} />
        <Kpi label="Registros" valor={String(resumo.registros)} cor="#6366f1" icone={<FiMap size={11} />} />
        <Kpi label="Bairros" valor={String(resumo.bairros)} cor="#0ea5e9" icone={<FiMap size={11} />} />
        <Kpi label="Operadores" valor={String(resumo.operadores)} cor="#8b5cf6" icone={<FiUsers size={11} />} />
        <Kpi label="Equipes" valor={String(resumo.equipes)} cor="#f59e0b" icone={<FiUsers size={11} />} />
        <Kpi label="Equipamentos" valor={String(resumo.equipamentos)} cor="#14b8a6" icone={<FiTool size={11} />} />
      </div>

      <TabelaGrupo titulo="Área por bairro" linhas={analise.porBairro} />
      <TabelaGrupo titulo="Área por operador" linhas={analise.porOperador} />
      <TabelaGrupo titulo="Área por equipe" linhas={analise.porEquipe} />
      <TabelaGrupo titulo="Área por equipamento" linhas={analise.porEquipamento} />

      {onToggleRegistros && (
        <button
          type="button"
          onClick={onToggleRegistros}
          style={{
            fontSize: '0.72rem', fontWeight: 600, padding: '0.4rem 0.7rem',
            borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff',
            color: '#475569', cursor: 'pointer', marginBottom: '0.5rem',
          }}
        >
          {mostrarRegistros ? 'Ocultar registros' : `Ver registros (${total.toLocaleString('pt-BR')})`}
        </button>
      )}

      {mostrarRegistros && (
        <div>
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#fff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', color: '#475569' }}>
                  <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left' }}>Bairro</th>
                  <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left' }}>Operador</th>
                  <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left' }}>Equipe</th>
                  <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left' }}>Equipamento</th>
                  <th style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>m²</th>
                </tr>
              </thead>
              <tbody>
                {carregandoRegistros ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '0.75rem', color: '#94a3b8', textAlign: 'center' }}>
                      Carregando página...
                    </td>
                  </tr>
                ) : (
                  registros.map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.35rem 0.6rem' }}>{String(r.BAIRRO ?? r.regional ?? '—')}</td>
                      <td style={{ padding: '0.35rem 0.6rem' }}>{String(r.Operador ?? r.OPERADOR ?? r.motorista ?? '—')}</td>
                      <td style={{ padding: '0.35rem 0.6rem' }}>{String(r.Equipe ?? r.EQUIPE ?? r.turno ?? '—')}</td>
                      <td style={{ padding: '0.35rem 0.6rem' }}>{String(r.Equipamento ?? r.EQUIPAMENTO ?? r.tipoCaminhao ?? '—')}</td>
                      <td style={{ padding: '0.35rem 0.6rem', textAlign: 'right', fontWeight: 700, color: '#166534' }}>
                        {fmtAreaM2(Number(r['Area m²'] ?? r.AREA_M2 ?? r.M2 ?? 0))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {totalPaginas > 1 && onPaginaChange && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
              marginTop: '0.5rem', fontSize: '0.72rem', color: '#64748b',
            }}>
              <button
                type="button"
                disabled={pagina <= 1 || carregandoRegistros}
                onClick={() => onPaginaChange(pagina - 1)}
                style={{
                  padding: '0.3rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0',
                  background: '#fff', cursor: pagina <= 1 ? 'not-allowed' : 'pointer',
                }}
              >
                Anterior
              </button>
              <span>Página {pagina} de {totalPaginas}</span>
              <button
                type="button"
                disabled={pagina >= totalPaginas || carregandoRegistros}
                onClick={() => onPaginaChange(pagina + 1)}
                style={{
                  padding: '0.3rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0',
                  background: '#fff', cursor: pagina >= totalPaginas ? 'not-allowed' : 'pointer',
                }}
              >
                Próxima
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
