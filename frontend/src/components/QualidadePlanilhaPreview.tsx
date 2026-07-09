import { useState } from 'react';
import {
  FiAlertTriangle, FiCheckCircle, FiXCircle, FiAlertCircle,
  FiChevronDown, FiChevronUp, FiInfo, FiBarChart2, FiFileText
} from 'react-icons/fi';

/* ─── TIPOS ─── */
interface ProblemaPreview {
  tipo: string;
  label: string;
  descricao: string;
  gravidade: 'crítico' | 'alto' | 'médio' | 'baixo';
  quantidade: number;
  detalhes?: string[];
}

interface ColunaInfo {
  nome: string;
  tipo: string;
  totalCelulas: number;
  celulasPreenchidas: number;
  celulasVazias: number;
  percentualPreenchimento: number;
  amostraValores: any[];
}

interface ResumoQualidadePreview {
  registrosValidos: number;
  celulasPreenchidas: number;
  celulasVazias: number;
  percentualGeralPreenchimento: number;
  colunasCriticasFaltantes: string[];
}

interface RelatorioPreviewData {
  sucesso: boolean;
  nomeArquivo: string;
  aba: string;
  totalLinhas: number;
  totalColunas: number;
  linhasComDados: number;
  linhasTotalmenteVazias: number;
  linhasVaziasNoFinal: number;
  linhasVaziasNoMeio: number;
  colunas: ColunaInfo[];
  problemas: ProblemaPreview[];
  pontuacaoQualidade: number;
  pontuacaoLegenda: string;
  resumo: ResumoQualidadePreview;
  recomendacoes: string[];
}

/* ─── HELPERS ─── */
function getCorGravidade(g: string): string {
  switch (g) {
    case 'crítico': return '#dc2626';
    case 'alto': return '#ea580c';
    case 'médio': return '#ca8a04';
    case 'baixo': return '#16a34a';
    default: return '#6b7280';
  }
}

function getBgGravidade(g: string): string {
  switch (g) {
    case 'crítico': return '#fef2f2';
    case 'alto': return '#fff7ed';
    case 'médio': return '#fefce8';
    case 'baixo': return '#f0fdf4';
    default: return '#f9fafb';
  }
}

function getIconeGravidade(g: string) {
  switch (g) {
    case 'crítico': return <FiXCircle size={14} />;
    case 'alto': return <FiAlertCircle size={14} />;
    case 'médio': return <FiAlertTriangle size={14} />;
    case 'baixo': return <FiCheckCircle size={14} />;
    default: return null;
  }
}

function getNivelQualidade(score: number): { label: string; cor: string; bg: string; nota: string; notaCor: string; descricao: string } {
  if (score >= 90) return { label: 'Excelente', cor: '#16a34a', bg: '#f0fdf4', nota: 'A', notaCor: '#16a34a', descricao: 'Dados limpos — pode seguir sem preocupações' };
  if (score >= 70) return { label: 'Boa', cor: '#ca8a04', bg: '#fefce8', nota: 'B', notaCor: '#ca8a04', descricao: 'Pequenos ajustes — recomendado revisar' };
  if (score >= 50) return { label: 'Regular', cor: '#ea580c', bg: '#fff7ed', nota: 'C', notaCor: '#ea580c', descricao: 'Problemas moderados — correções necessárias' };
  return { label: 'Crítico', cor: '#dc2626', bg: '#fef2f2', nota: 'D', notaCor: '#dc2626', descricao: 'Muitos problemas — rejeite ou corrija antes de subir' };
}

/* ─── PROPS ─── */
interface QualidadePlanilhaPreviewProps {
  dados: RelatorioPreviewData | null;
  carregando: boolean;
}

export default function QualidadePlanilhaPreview({ dados, carregando }: QualidadePlanilhaPreviewProps) {
  const [problemaExpandido, setProblemaExpandido] = useState<string | null>(null);
  const [mostrarColunas, setMostrarColunas] = useState(false);

  if (carregando) {
    return (
      <div style={{
        background: '#f8fafc',
        borderRadius: '10px',
        padding: '1rem',
        textAlign: 'center',
        marginBottom: '0.75rem',
      }}>
        <div style={{
          width: '24px', height: '24px',
          border: '2px solid #e2e8f0', borderTopColor: '#6366f1',
          borderRadius: '50%', animation: 'spin 0.7s linear infinite',
          margin: '0 auto 0.5rem',
        }} />
        <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: 0 }}>
          Analisando qualidade da planilha...
        </p>
      </div>
    );
  }

  if (!dados || !dados.sucesso) return null;

  // Preview de roçada (e outros fluxos) não traz o shape de qualidade de coleta
  if (!Array.isArray(dados.problemas) || typeof dados.pontuacaoQualidade !== 'number') {
    return null;
  }

  const nivel = getNivelQualidade(dados.pontuacaoQualidade);
  const temProblemasGraves = dados.problemas.some(p => p.gravidade === 'crítico' || p.gravidade === 'alto');
  const totalProblemas = dados.problemas.length;

  return (
    <div style={{ marginBottom: '0.75rem' }}>
      {/* ═══ Cabeçalho + Score com NOTA ═══ */}
      <div style={{
        background: nivel.bg,
        border: `1px solid ${nivel.cor}33`,
        borderRadius: '10px',
        padding: '0.75rem 1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        marginBottom: '0.5rem',
      }}>
        {/* Nota A/B/C/D grande */}
        <div style={{
          width: '52px',
          height: '52px',
          borderRadius: '12px',
          background: nivel.cor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: `0 3px 10px ${nivel.cor}40`,
        }}>
          <span style={{
            fontSize: '1.5rem',
            fontWeight: 900,
            color: '#fff',
            lineHeight: 1,
          }}>
            {nivel.nota}
          </span>
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            color: nivel.cor,
            textTransform: 'uppercase',
            letterSpacing: '0.3px',
          }}>
            Qualidade: {nivel.label}
          </div>
          <div style={{
            fontSize: '0.65rem',
            color: '#475569',
            marginTop: '1px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}>
            <span>{dados.linhasComDados} registros · {dados.totalColunas} colunas</span>
            <span style={{ color: '#16a34a' }}>{dados.resumo.percentualGeralPreenchimento}% preenchido</span>
            {totalProblemas > 0 && (
              <span style={{ color: getCorGravidade(temProblemasGraves ? 'crítico' : 'médio') }}>
                {totalProblemas} problema{totalProblemas !== 1 ? 's' : ''}
              </span>
            )}
            <span style={{ color: '#64748b' }}>Score: {dados.pontuacaoQualidade}</span>
          </div>
          <div style={{
            fontSize: '0.6rem',
            color: nivel.cor,
            marginTop: '2px',
            fontWeight: 500,
          }}>
            {nivel.descricao}
          </div>
        </div>

        {/* Badge de alerta */}
        {temProblemasGraves && (
          <div style={{
            background: '#dc2626',
            color: 'white',
            borderRadius: '20px',
            padding: '0.2rem 0.5rem',
            fontSize: '0.6rem',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            REQUER ATENÇÃO
          </div>
        )}
      </div>

      {/* ═══ Mini Cards de Info ═══ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
        gap: '0.35rem',
        marginBottom: '0.5rem',
      }}>
        <MiniCard label="Linhas c/ Dados" valor={dados.linhasComDados} cor="#6366f1" />
        <MiniCard label="Células Vazias" valor={dados.resumo.celulasVazias} cor={dados.resumo.celulasVazias > 0 ? '#dc2626' : '#16a34a'} />
        <MiniCard label="Linhas Vazias" valor={dados.linhasTotalmenteVazias} cor={dados.linhasTotalmenteVazias > 0 ? '#ea580c' : '#16a34a'} />
        {dados.linhasVaziasNoFinal > 0 && (
          <MiniCard label="Vazias no Final" valor={dados.linhasVaziasNoFinal} cor="#ca8a04" />
        )}
      </div>

      {/* ═══ Problemas ═══ */}
      {dados.problemas.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '1rem',
          background: '#f0fdf4',
          borderRadius: '8px',
          color: '#16a34a',
          fontSize: '0.75rem',
        }}>
          <FiCheckCircle size={20} style={{ marginBottom: '0.25rem', opacity: 0.6 }} />
          <p style={{ fontWeight: 600, margin: 0 }}>Nenhum problema encontrado! A planilha está limpa.</p>
        </div>
      ) : (
        <div>
          {dados.problemas.slice(0, 5).map((p) => {
            const expandido = problemaExpandido === p.tipo;
            return (
              <div
                key={p.tipo}
                style={{
                  background: getBgGravidade(p.gravidade),
                  border: `1px solid ${getCorGravidade(p.gravidade)}33`,
                  borderRadius: '6px',
                  marginBottom: '0.25rem',
                  overflow: 'hidden',
                }}
              >
                {/* Header do problema */}
                <div
                  onClick={() => setProblemaExpandido(expandido ? null : p.tipo)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.4rem 0.6rem',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <span style={{ color: getCorGravidade(p.gravidade), flexShrink: 0 }}>
                    {getIconeGravidade(p.gravidade)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0, fontSize: '0.7rem' }}>
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{p.label}</span>
                    {!expandido && (
                      <span style={{ color: '#64748b', marginLeft: '0.3rem', fontSize: '0.65rem' }}>
                        — {p.descricao.slice(0, 60)}...
                      </span>
                    )}
                  </div>
                  <div style={{
                    background: getCorGravidade(p.gravidade),
                    color: 'white',
                    borderRadius: '10px',
                    padding: '0.1rem 0.4rem',
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}>
                    {p.quantidade}
                  </div>
                  <span style={{ color: '#94a3b8', fontSize: '0.65rem', flexShrink: 0 }}>
                    {expandido ? <FiChevronUp size={12} /> : <FiChevronDown size={12} />}
                  </span>
                </div>

                {/* Detalhes expandidos */}
                {expandido && (
                  <div style={{ padding: '0 0.6rem 0.5rem' }}>
                    <p style={{ fontSize: '0.65rem', color: '#475569', margin: '0 0 0.3rem' }}>
                      {p.descricao}
                    </p>
                    {p.detalhes && p.detalhes.length > 0 && (
                      <div style={{
                        background: '#fff',
                        borderRadius: '4px',
                        padding: '0.3rem 0.5rem',
                        fontSize: '0.62rem',
                        fontFamily: 'monospace',
                      }}>
                        {p.detalhes.map((d, i) => (
                          <div key={i} style={{ color: '#64748b', padding: '1px 0' }}>{d}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Se houver mais problemas que o limite de 5 */}
          {dados.problemas.length > 5 && (
            <div style={{
              textAlign: 'center',
              fontSize: '0.62rem',
              color: '#94a3b8',
              padding: '0.25rem',
            }}>
              ... e mais {dados.problemas.length - 5} problema(s)
            </div>
          )}
        </div>
      )}

      {/* ═══ Recomendações (só se houver) ═══ */}
      {dados.recomendacoes.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            fontSize: '0.65rem',
            color: '#64748b',
            marginBottom: '0.25rem',
          }}>
            <FiInfo size={11} />
            <span style={{ fontWeight: 600 }}>Recomendações ({dados.recomendacoes.length})</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            {dados.recomendacoes.map((r, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.3rem',
                  fontSize: '0.62rem',
                  color: '#475569',
                  padding: '0.2rem 0.5rem',
                  background: '#f8fafc',
                  borderRadius: '4px',
                }}
              >
                <span style={{ color: '#6366f1', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                <span>{r}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Colunas (expandível) ═══ */}
      <div style={{ marginTop: '0.5rem' }}>
        <button
          onClick={() => setMostrarColunas(!mostrarColunas)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            border: 'none',
            background: 'transparent',
            fontSize: '0.65rem',
            fontWeight: 600,
            color: '#64748b',
            cursor: 'pointer',
            padding: '0.2rem 0',
          }}
        >
          {mostrarColunas ? <FiChevronUp size={11} /> : <FiChevronDown size={11} />}
          Ver colunas detectadas ({dados.colunas.length})
        </button>

        {mostrarColunas && (
          <div style={{
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            overflow: 'hidden',
            fontSize: '0.62rem',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={{ padding: '0.25rem 0.4rem', textAlign: 'left', color: '#475569' }}>Coluna</th>
                  <th style={{ padding: '0.25rem 0.4rem', textAlign: 'left', color: '#475569' }}>Tipo</th>
                  <th style={{ padding: '0.25rem 0.4rem', textAlign: 'right', color: '#475569' }}>Preench.</th>
                  <th style={{ padding: '0.25rem 0.4rem', textAlign: 'right', color: '#475569' }}>%</th>
                  <th style={{ padding: '0.25rem 0.4rem', textAlign: 'left', color: '#475569' }}>Amostra</th>
                </tr>
              </thead>
              <tbody>
                {dados.colunas.map((col, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{
                      padding: '0.25rem 0.4rem',
                      fontWeight: 600,
                      color: col.percentualPreenchimento < 100 ? '#dc2626' : '#1e293b',
                    }}>
                      {col.nome}
                    </td>
                    <td style={{ padding: '0.25rem 0.4rem', color: '#64748b' }}>
                      {col.tipo === 'numero' ? '🔢' : col.tipo === 'data' ? '📅' : '📝'} {col.tipo}
                    </td>
                    <td style={{ padding: '0.25rem 0.4rem', textAlign: 'right' }}>
                      {col.celulasPreenchidas}/{col.totalCelulas}
                    </td>
                    <td style={{
                      padding: '0.25rem 0.4rem',
                      textAlign: 'right',
                      fontWeight: 600,
                      color: col.percentualPreenchimento < 100 ? '#dc2626' : '#16a34a',
                    }}>
                      {col.percentualPreenchimento}%
                    </td>
                    <td style={{
                      padding: '0.25rem 0.4rem',
                      color: '#94a3b8',
                      fontFamily: 'monospace',
                      fontSize: '0.55rem',
                      maxWidth: '120px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {col.amostraValores.slice(0, 2).join(', ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

/* ─── Subcomponentes ─── */
function MiniCard({ label, valor, cor }: { label: string; valor: number; cor: string }) {
  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${cor}33`,
      borderRadius: '6px',
      padding: '0.35rem 0.5rem',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '1rem', fontWeight: 800, color: cor }}>
        {valor.toLocaleString('pt-BR')}
      </div>
      <div style={{ fontSize: '0.55rem', color: '#64748b', marginTop: '1px', lineHeight: 1.1 }}>
        {label}
      </div>
    </div>
  );
}
