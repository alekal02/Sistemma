import { useState } from 'react';
import { FiAlertTriangle, FiCheckCircle, FiXCircle, FiInfo, FiChevronDown, FiChevronUp, FiCalendar, FiBarChart2, FiTool, FiUpload, FiShieldOff } from 'react-icons/fi';
import QualidadePlanilhaPreview from './QualidadePlanilhaPreview';

interface ConflitoAmostra {
  indice: number;
  chave: string;
  dadosPlanilha: {
    dataSaida: string | null;
    placa: string | null;
    turno: string | null;
    motorista: string | null;
    regional: string | null;
    pesoTotal: number | null;
    kmTotal: number | null;
  } | null;
  dadosBanco: {
    dataSaida: string | null;
    placa: string | null;
    turno: string | null;
    motorista: string | null;
    regional: string | null;
    pesoTotal: number | null;
    kmTotal: number | null;
  } | null;
  diferencas: string[];
}

interface PreviewDataRegistro {
  sucesso: boolean;
  totalLinhas: number;
  novos: number;
  duplicados: number;
  conflitantes: number;
  temConflitos: boolean;
  amostraConflitos: ConflitoAmostra[];
  chaveUsada: string;
  arquivo: string;
}

interface DataInfo {
  data: string;
  registrosBanco: number;
  registrosPlanilha: number;
}

interface PreviewDataPorData {
  sucesso: boolean;
  totalLinhas: number;
  totalDatas: number;
  datasExistentes: DataInfo[];
  datasNovas: { data: string; registrosPlanilha: number }[];
  linhasIgnoradas: number;
  linhasImportaveis: number;
  arquivo: string;
}

type ModoPreview = 'registro' | 'data';

interface UploadPreviewModalProps {
  aberto: boolean;
  previewData: PreviewDataRegistro | null;
  previewDataInfo: PreviewDataPorData | null;
  qualidadePreviewData: any;
  carregando: boolean;
  arquivo: File | null;
  onConfirmar: (estrategia: 'ignorar' | 'substituir' | 'atualizar_data' | 'inserir_data') => void;
  onCancelar: () => void;
  onCorrigir?: () => void;
  corrigindo?: boolean;
}

function formatarDataISO(iso: string): string {
  try {
    const [ano, mes, dia] = iso.split('-');
    return `${dia}/${mes}/${ano}`;
  } catch {
    return iso;
  }
}

export default function UploadPreviewModal({
  aberto,
  previewData,
  previewDataInfo,
  qualidadePreviewData,
  carregando,
  arquivo,
  onConfirmar,
  onCancelar,
  onCorrigir,
  corrigindo = false,
}: UploadPreviewModalProps) {
  const [modo, setModo] = useState<ModoPreview>('data');
  const [estrategiaRegistro, setEstrategiaRegistro] = useState<'ignorar' | 'substituir'>('ignorar');
  const [estrategiaData, setEstrategiaData] = useState<'atualizar_data' | 'inserir_data'>('atualizar_data');
  const [showDetalhes, setShowDetalhes] = useState(false);

  if (!aberto) return null;

  // Determinar se cada modo está disponível
  const temPreviewRegistro = previewData && previewData.sucesso;
  const temPreviewData = previewDataInfo && previewDataInfo.sucesso;

  // Só mostrar seletor de modo se ambos estiverem disponíveis
  const mostrarSeletorModo = temPreviewRegistro && temPreviewData;

  // Resumo total
  const totalLinhas = previewDataInfo?.totalLinhas || previewData?.totalLinhas || 0;
  const nomeArquivo = arquivo?.name || previewDataInfo?.arquivo || previewData?.arquivo || '';

  // Determinar nota de qualidade
  const getNota = (score: number): { nota: string; cor: string; bg: string } => {
    if (score >= 90) return { nota: 'A', cor: '#16a34a', bg: '#f0fdf4' };
    if (score >= 70) return { nota: 'B', cor: '#ca8a04', bg: '#fefce8' };
    if (score >= 50) return { nota: 'C', cor: '#ea580c', bg: '#fff7ed' };
    return { nota: 'D', cor: '#dc2626', bg: '#fef2f2' };
  };

  const scoreQualidade = qualidadePreviewData?.pontuacaoQualidade ?? 100;
  const notaQualidade = getNota(scoreQualidade);
  const qualidadeRuim = notaQualidade.nota === 'C' || notaQualidade.nota === 'D';
  const qualidadeCritica = notaQualidade.nota === 'D';

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancelar(); }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '14px',
          maxWidth: '640px',
          width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          overflow: 'hidden',
          animation: 'slideUp 0.2s ease',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem 0.75rem',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          flexShrink: 0,
        }}>
          <div style={{
            width: '36px', height: '36px',
            borderRadius: '10px',
            background: previewDataInfo?.datasExistentes?.length ? '#fef3c7' : '#f0fdf4',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.1rem',
          }}>
            {carregando ? '⏳' : temPreviewData ? (previewDataInfo!.datasExistentes.length > 0 ? '🔄' : '✅') : (previewData?.temConflitos ? '⚠️' : '✅')}
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a', fontWeight: 700 }}>
              {carregando ? 'Analisando...' : (temPreviewData ? 'Preview por Data' : 'Preview do Upload')}
            </h3>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.7rem', color: '#94a3b8' }}>
              {nomeArquivo}
            </p>
          </div>
          {qualidadePreviewData?.sucesso && (
            <div style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '0.2rem 0.6rem',
              borderRadius: '20px',
              background: qualidadePreviewData.pontuacaoQualidade >= 90 ? '#f0fdf4' :
                          qualidadePreviewData.pontuacaoQualidade >= 70 ? '#fefce8' : '#fef2f2',
              color: qualidadePreviewData.pontuacaoQualidade >= 90 ? '#16a34a' :
                     qualidadePreviewData.pontuacaoQualidade >= 70 ? '#ca8a04' : '#dc2626',
            }}>
              <FiBarChart2 size={12} />
              Qualidade: {qualidadePreviewData.pontuacaoQualidade}%
            </div>
          )}
        </div>

        {/* Conteúdo rolável */}
        <div style={{ padding: '1rem 1.5rem', overflowY: 'auto', flex: 1 }}>
          {/* ═══ QUALIDADE DA PLANILHA (PRE-IMPORT) ═══ */}
          {!carregando && (
            <QualidadePlanilhaPreview
              dados={qualidadePreviewData}
              carregando={false}
            />
          )}

          {carregando ? (
            <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              <div style={{
                width: '32px', height: '32px',
                border: '3px solid #e2e8f0',
                borderTopColor: '#6366f1',
                borderRadius: '50%',
                animation: 'spin 0.7s linear infinite',
                margin: '0 auto 0.75rem',
              }} />
              <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0 }}>
                Comparando registros com o banco de dados...
              </p>
            </div>
          ) : temPreviewData ? (
            <>
              {/* ─── MODO DATA ─── */}

              {/* Seletor de modo */}
              {mostrarSeletorModo && (
                <div style={{
                  display: 'flex',
                  gap: '0.3rem',
                  marginBottom: '1rem',
                  background: '#f1f5f9',
                  borderRadius: '8px',
                  padding: '0.2rem',
                }}>
                  <button
                    onClick={() => setModo('data')}
                    style={{
                      flex: 1,
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.45rem 0.6rem',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: modo === 'data' ? 'white' : 'transparent',
                      color: modo === 'data' ? '#6366f1' : '#64748b',
                      boxShadow: modo === 'data' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      transition: 'all 0.1s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.3rem',
                    }}
                  >
                    <FiCalendar size={12} /> Por Data
                  </button>
                  <button
                    onClick={() => setModo('registro')}
                    style={{
                      flex: 1,
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.45rem 0.6rem',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: modo === 'registro' ? 'white' : 'transparent',
                      color: modo === 'registro' ? '#6366f1' : '#64748b',
                      boxShadow: modo === 'registro' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      transition: 'all 0.1s',
                    }}
                  >
                    Registro a Registro
                  </button>
                </div>
              )}

              {modo === 'data' ? (
                <>
                  {/* Cartões de resumo por data */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '0.5rem',
                    marginBottom: '1rem',
                  }}>
                    {/* Total linhas */}
                    <div style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      padding: '0.75rem 0.5rem',
                      textAlign: 'center',
                    }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>
                        {previewDataInfo!.totalLinhas}
                      </div>
                      <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                        Total Linhas
                      </div>
                    </div>

                    {/* Datas Novas */}
                    <div style={{
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: '10px',
                      padding: '0.75rem 0.5rem',
                      textAlign: 'center',
                    }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#16a34a' }}>
                        {previewDataInfo!.datasNovas.length}
                      </div>
                      <div style={{ fontSize: '0.62rem', color: '#15803d', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                        Datas Novas
                      </div>
                      <div style={{ fontSize: '0.6rem', color: '#86efac', marginTop: '0.15rem' }}>
                        {previewDataInfo!.linhasImportaveis} registros
                      </div>
                    </div>

                    {/* Datas Existentes */}
                    <div style={{
                      background: previewDataInfo!.datasExistentes.length > 0 ? '#fefce8' : '#f8fafc',
                      border: `1px solid ${previewDataInfo!.datasExistentes.length > 0 ? '#fde68a' : '#e2e8f0'}`,
                      borderRadius: '10px',
                      padding: '0.75rem 0.5rem',
                      textAlign: 'center',
                    }}>
                      <div style={{
                        fontSize: '1.5rem',
                        fontWeight: 800,
                        color: previewDataInfo!.datasExistentes.length > 0 ? '#b45309' : '#94a3b8',
                      }}>
                        {previewDataInfo!.datasExistentes.length}
                      </div>
                      <div style={{
                        fontSize: '0.62rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.3px',
                        color: previewDataInfo!.datasExistentes.length > 0 ? '#92400e' : '#94a3b8',
                      }}>
                        Datas Existentes
                      </div>
                      <div style={{ fontSize: '0.6rem', color: '#d97706', marginTop: '0.15rem' }}>
                        {previewDataInfo!.linhasIgnoradas} registros
                      </div>
                    </div>
                  </div>

                  {/* Resumo visual do período */}
                  {previewDataInfo!.totalDatas > 0 && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.65rem',
                      color: '#94a3b8',
                      marginBottom: '0.75rem',
                      padding: '0.35rem 0.6rem',
                      background: '#f8fafc',
                      borderRadius: '6px',
                    }}>
                      <FiInfo size={12} />
                      Período: <strong>
                        {formatarDataISO(previewDataInfo!.datasNovas[0]?.data || previewDataInfo!.datasExistentes[0]?.data)} 
                        {' → '}
                        {formatarDataISO(
                          [...previewDataInfo!.datasExistentes, ...previewDataInfo!.datasNovas]
                            .sort((a, b) => (a.data > b.data ? -1 : 1))[0]?.data || ''
                        )}
                      </strong>
                      <span style={{ marginLeft: 'auto' }}>
                        {previewDataInfo!.totalDatas} datas na planilha
                      </span>
                    </div>
                  )}

                  {/* Datas existentes em detalhe */}
                  {previewDataInfo!.datasExistentes.length > 0 && (
                    <div style={{ marginBottom: '0.75rem' }}>
                      <button
                        onClick={() => setShowDetalhes(!showDetalhes)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          border: 'none',
                          background: 'transparent',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          color: '#b45309',
                          cursor: 'pointer',
                          padding: '0.25rem 0',
                        }}
                      >
                        {showDetalhes ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
                        Ver {previewDataInfo!.datasExistentes.length} data(s) que já existem no banco
                      </button>

                      {showDetalhes && (
                        <div style={{
                          maxHeight: '200px',
                          overflowY: 'auto',
                          border: '1px solid #fde68a',
                          borderRadius: '8px',
                          background: '#fefce8',
                        }}>
                          <table style={{ width: '100%', fontSize: '0.65rem', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid #fde68a' }}>
                                <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left', color: '#92400e' }}>Data</th>
                                <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: '#92400e' }}>Reg. no Banco</th>
                                <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: '#92400e' }}>Reg. na Planilha</th>
                              </tr>
                            </thead>
                            <tbody>
                              {previewDataInfo!.datasExistentes.map((d, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #fef3c7' }}>
                                  <td style={{ padding: '0.3rem 0.5rem', fontWeight: 600 }}>
                                    {formatarDataISO(d.data)}
                                  </td>
                                  <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right' }}>
                                    {d.registrosBanco}
                                  </td>
                                  <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right' }}>
                                    {d.registrosPlanilha}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Seletor de estratégia (modo data) */}
                  <div style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '0.75rem',
                    marginBottom: '0.5rem',
                  }}>
                    <div style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: '#1e293b',
                      marginBottom: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}>
                      <FiCalendar size={14} color="#6366f1" />
                      Modo de Importação por Data
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.5rem',
                        padding: '0.55rem 0.65rem',
                        background: estrategiaData === 'atualizar_data' ? '#eff6ff' : 'white',
                        border: `2px solid ${estrategiaData === 'atualizar_data' ? '#3b82f6' : '#e2e8f0'}`,
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.1s',
                      }}>
                        <input
                          type="radio"
                          name="estrategia_data"
                          value="atualizar_data"
                          checked={estrategiaData === 'atualizar_data'}
                          onChange={() => setEstrategiaData('atualizar_data')}
                          style={{ marginTop: '0.15rem' }}
                        />
                        <div>
                          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1e293b' }}>
                            🔄 Atualizar dados existentes
                          </div>
                          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                            Remove os registros ANTIGOS das datas coincidentes e insere os NOVOS
                            da planilha. Use quando a planilha tiver a versão mais recente dos dados
                            (correções, planilha consolidada do período).
                          </div>
                          {previewDataInfo!.datasExistentes.length > 0 && (
                            <div style={{
                              marginTop: '0.35rem',
                              fontSize: '0.62rem',
                              color: '#b45309',
                              background: '#fef3c7',
                              padding: '0.2rem 0.4rem',
                              borderRadius: '4px',
                              display: 'inline-block',
                            }}>
                              {previewDataInfo!.datasExistentes.length} data(s) serão substituídas
                              ({previewDataInfo!.linhasIgnoradas} registros antigos removidos)
                            </div>
                          )}
                        </div>
                      </label>

                      <label style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.5rem',
                        padding: '0.55rem 0.65rem',
                        background: estrategiaData === 'inserir_data' ? '#f0fdf4' : 'white',
                        border: `2px solid ${estrategiaData === 'inserir_data' ? '#16a34a' : '#e2e8f0'}`,
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.1s',
                      }}>
                        <input
                          type="radio"
                          name="estrategia_data"
                          value="inserir_data"
                          checked={estrategiaData === 'inserir_data'}
                          onChange={() => setEstrategiaData('inserir_data')}
                          style={{ marginTop: '0.15rem' }}
                        />
                        <div>
                          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1e293b' }}>
                            ➕ Apenas inserir novos registros
                          </div>
                          <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                            Ignora registros de datas que já existem no banco. Apenas datas NOVAS
                            são importadas. Use para complementar dados sem sobrescrever existentes.
                          </div>
                          {previewDataInfo!.datasExistentes.length > 0 && (
                            <div style={{
                              marginTop: '0.35rem',
                              fontSize: '0.62rem',
                              color: '#15803d',
                              background: '#dcfce7',
                              padding: '0.2rem 0.4rem',
                              borderRadius: '4px',
                              display: 'inline-block',
                            }}>
                              {previewDataInfo!.datasNovas.length} nova(s) data(s) serão importadas
                              ({previewDataInfo!.linhasImportaveis} registros)
                            </div>
                          )}
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Totais finais */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.5rem 0.65rem',
                    background: '#f1f5f9',
                    borderRadius: '8px',
                    marginTop: '0.25rem',
                  }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#1e293b' }}>
                      Total: {previewDataInfo!.totalLinhas} registros · {previewDataInfo!.totalDatas} datas
                    </span>
                    <span style={{
                      fontSize: '0.7rem',
                      color: previewDataInfo!.datasExistentes.length > 0 ? (estrategiaData === 'atualizar_data' ? '#2563eb' : '#16a34a') : '#16a34a',
                      fontWeight: 600,
                    }}>
                      {estrategiaData === 'atualizar_data'
                        ? `${previewDataInfo!.linhasImportaveis + previewDataInfo!.linhasIgnoradas} importados · ${previewDataInfo!.datasExistentes.length} datas substituídas`
                        : `${previewDataInfo!.linhasImportaveis} novos · ${previewDataInfo!.linhasIgnoradas} ignorados`}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  {/* ─── MODO REGISTRO (legado) ─── */}
                  {temPreviewRegistro && (
                    <>
                      {/* Cartões de resumo */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '0.5rem',
                        marginBottom: '1rem',
                      }}>
                        <div style={{
                          background: '#f0fdf4',
                          border: '1px solid #bbf7d0',
                          borderRadius: '10px',
                          padding: '0.75rem 0.5rem',
                          textAlign: 'center',
                        }}>
                          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#16a34a' }}>
                            {previewData!.novos}
                          </div>
                          <div style={{ fontSize: '0.62rem', color: '#15803d', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                            Novos
                          </div>
                          <div style={{ fontSize: '0.6rem', color: '#86efac', marginTop: '0.15rem' }}>
                            serão inseridos
                          </div>
                        </div>

                        <div style={{
                          background: '#fefce8',
                          border: '1px solid #fde68a',
                          borderRadius: '10px',
                          padding: '0.75rem 0.5rem',
                          textAlign: 'center',
                        }}>
                          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#b45309' }}>
                            {previewData!.duplicados}
                          </div>
                          <div style={{ fontSize: '0.62rem', color: '#92400e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                            Duplicados
                          </div>
                          <div style={{ fontSize: '0.6rem', color: '#d97706', marginTop: '0.15rem' }}>
                            serão ignorados
                          </div>
                        </div>

                        <div style={{
                          background: previewData!.conflitantes > 0 ? '#fef2f2' : '#f8fafc',
                          border: `1px solid ${previewData!.conflitantes > 0 ? '#fecaca' : '#e2e8f0'}`,
                          borderRadius: '10px',
                          padding: '0.75rem 0.5rem',
                          textAlign: 'center',
                        }}>
                          <div style={{
                            fontSize: '1.5rem', fontWeight: 800,
                            color: previewData!.conflitantes > 0 ? '#dc2626' : '#94a3b8',
                          }}>
                            {previewData!.conflitantes}
                          </div>
                          <div style={{
                            fontSize: '0.62rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px',
                            color: previewData!.conflitantes > 0 ? '#b91c1c' : '#94a3b8',
                          }}>
                            Conflitantes
                          </div>
                          <div style={{ fontSize: '0.6rem', color: previewData!.conflitantes > 0 ? '#ef4444' : '#cbd5e1', marginTop: '0.15rem' }}>
                            {previewData!.conflitantes > 0 ? 'exigem decisão' : 'nenhum'}
                          </div>
                        </div>
                      </div>

                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.35rem',
                        fontSize: '0.65rem', color: '#94a3b8', marginBottom: '0.75rem',
                        padding: '0.35rem 0.6rem', background: '#f8fafc', borderRadius: '6px',
                      }}>
                        <FiInfo size={12} />
                        Chave única usada: <strong>{previewData!.chaveUsada}</strong>
                        <span style={{ marginLeft: 'auto' }}>{previewData!.totalLinhas} linhas</span>
                      </div>

                      {/* Amostra de conflitos */}
                      {previewData!.conflitantes > 0 && (
                        <div style={{ marginBottom: '0.75rem' }}>
                          <button
                            onClick={() => setShowDetalhes(!showDetalhes)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '0.3rem',
                              border: 'none', background: 'transparent',
                              fontSize: '0.72rem', fontWeight: 600, color: '#dc2626',
                              cursor: 'pointer', padding: '0.25rem 0',
                            }}
                          >
                            {showDetalhes ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
                            Ver {previewData!.conflitantes} registro(s) conflitante(s)
                          </button>
                          {showDetalhes && (
                            <div style={{
                              maxHeight: '200px', overflowY: 'auto',
                              border: '1px solid #fecaca', borderRadius: '8px', background: '#fef2f2',
                            }}>
                              <table style={{ width: '100%', fontSize: '0.65rem', borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
                                    <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left', color: '#991b1b' }}>Data</th>
                                    <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left', color: '#991b1b' }}>Placa</th>
                                    <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left', color: '#991b1b' }}>Campos Diferentes</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {previewData!.amostraConflitos.map((c, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #fee2e2' }}>
                                      <td style={{ padding: '0.3rem 0.5rem', fontWeight: 600 }}>
                                        {c.dadosPlanilha?.dataSaida
                                          ? new Date(c.dadosPlanilha.dataSaida).toLocaleDateString('pt-BR')
                                          : 'N/A'}
                                      </td>
                                      <td style={{ padding: '0.3rem 0.5rem' }}>{c.dadosPlanilha?.placa || 'N/A'}</td>
                                      <td style={{ padding: '0.3rem 0.5rem', color: '#b91c1c' }}>
                                        {(c.diferencas || []).join(', ')}
                                      </td>
                                    </tr>
                                  ))}
                                  {previewData!.amostraConflitos.length < previewData!.conflitantes && (
                                    <tr>
                                      <td colSpan={3} style={{ padding: '0.3rem 0.5rem', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                                        ... e mais {previewData!.conflitantes - previewData!.amostraConflitos.length} registro(s)
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Seletor de estratégia */}
                      {previewData!.conflitantes > 0 && (
                        <div style={{
                          background: '#f8fafc', border: '1px solid #e2e8f0',
                          borderRadius: '10px', padding: '0.75rem', marginBottom: '0.5rem',
                        }}>
                          <div style={{
                            fontSize: '0.72rem', fontWeight: 700, color: '#1e293b',
                            marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem',
                          }}>
                            <FiAlertTriangle size={14} color="#d97706" />
                            Estratégia para Conflitos
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <label style={{
                              display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                              padding: '0.55rem 0.65rem',
                              background: estrategiaRegistro === 'ignorar' ? '#fefce8' : 'white',
                              border: `2px solid ${estrategiaRegistro === 'ignorar' ? '#f59e0b' : '#e2e8f0'}`,
                              borderRadius: '8px', cursor: 'pointer',
                            }}>
                              <input type="radio" name="estrategia_registro" value="ignorar"
                                checked={estrategiaRegistro === 'ignorar'}
                                onChange={() => setEstrategiaRegistro('ignorar')}
                                style={{ marginTop: '0.15rem' }} />
                              <div>
                                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1e293b' }}>
                                  Ignorar duplicatas
                                </div>
                                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                                  Mantém os registros existentes. Os dados da planilha para esses registros são descartados.
                                </div>
                              </div>
                            </label>

                            <label style={{
                              display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                              padding: '0.55rem 0.65rem',
                              background: estrategiaRegistro === 'substituir' ? '#eff6ff' : 'white',
                              border: `2px solid ${estrategiaRegistro === 'substituir' ? '#3b82f6' : '#e2e8f0'}`,
                              borderRadius: '8px', cursor: 'pointer',
                            }}>
                              <input type="radio" name="estrategia_registro" value="substituir"
                                checked={estrategiaRegistro === 'substituir'}
                                onChange={() => setEstrategiaRegistro('substituir')}
                                style={{ marginTop: '0.15rem' }} />
                              <div>
                                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1e293b' }}>
                                  Substituir pelos dados da planilha
                                </div>
                                <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                                  Remove os registros existentes e insere os novos da planilha.
                                </div>
                              </div>
                            </label>
                          </div>
                        </div>
                      )}

                      <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.5rem 0.65rem', background: '#f1f5f9', borderRadius: '8px', marginTop: '0.25rem',
                      }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#1e293b' }}>
                          Total: {previewData!.totalLinhas} registros
                        </span>
                        <span style={{
                          fontSize: '0.7rem',
                          color: previewData!.conflitantes > 0 ? '#92400e' : '#16a34a', fontWeight: 600,
                        }}>
                          {estrategiaRegistro === 'ignorar'
                            ? `${previewData!.novos} novos · ${previewData!.duplicados + previewData!.conflitantes} ignorados`
                            : `${previewData!.novos + previewData!.conflitantes} importados · ${previewData!.duplicados} ignorados`}
                        </span>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: '#ef4444' }}>
              <FiXCircle size={28} style={{ marginBottom: '0.5rem' }} />
              <p style={{ fontSize: '0.85rem', margin: 0 }}>Erro ao analisar planilha.</p>
            </div>
          )}
        </div>

        {/* Footer — 3 botões de decisão baseados na qualidade */}
        <div style={{
          padding: '0.85rem 1.5rem 1.1rem',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: qualidadeRuim ? 'space-between' : 'flex-end',
          gap: '0.5rem',
          flexShrink: 0,
          background: qualidadeRuim ? '#fffbeb' : '#fff',
        }}>
          {/* Lado esquerdo: rejeitar (quando qualidade ruim) */}
          {qualidadeRuim && (
            <button
              onClick={onCancelar}
              disabled={carregando || corrigindo}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.35rem',
                fontSize: '0.75rem', fontWeight: 700,
                padding: '0.45rem 0.9rem',
                background: '#fef2f2', color: '#dc2626',
                border: '1px solid #fecaca', borderRadius: '8px',
                cursor: 'pointer',
                opacity: carregando ? 0.6 : 1,
              }}
            >
              <FiShieldOff size={14} /> Rejeitar
            </button>
          )}

          {/* Lado direito: corrigir + seguir */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {/* Botão Corrigir automaticamente (só quando qualidade C/D e onCorrigir existe) */}
            {qualidadeRuim && onCorrigir && (
              <button
                onClick={onCorrigir}
                disabled={carregando || corrigindo}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                  fontSize: '0.75rem', fontWeight: 700,
                  padding: '0.45rem 0.9rem',
                  background: '#eff6ff', color: '#2563eb',
                  border: '1px solid #bfdbfe', borderRadius: '8px',
                  cursor: 'pointer',
                  opacity: carregando || corrigindo ? 0.6 : 1,
                }}
              >
                <FiTool size={14} />
                {corrigindo ? 'Corrigindo...' : '🛠️ Corrigir automaticamente'}
              </button>
            )}

            {/* Botão Seguir / Confirmar */}
            {!qualidadeRuim && (
              <button
                className="btn btn-secondary"
                onClick={onCancelar}
                disabled={carregando}
                style={{ fontSize: '0.78rem', padding: '0.45rem 0.9rem' }}
              >
                Cancelar
              </button>
            )}
            <button
              onClick={() => {
                if (modo === 'data') {
                  onConfirmar(estrategiaData);
                } else {
                  onConfirmar(estrategiaRegistro);
                }
              }}
              disabled={carregando || corrigindo || (!temPreviewData && !temPreviewRegistro)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.35rem',
                fontSize: '0.78rem', fontWeight: 700,
                padding: '0.45rem 0.9rem',
                background: qualidadeRuim ? '#fefce8' : '#22c55e',
                color: qualidadeRuim ? '#b45309' : '#fff',
                border: qualidadeRuim ? '2px solid #f59e0b' : 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                opacity: carregando || corrigindo || (!temPreviewData && !temPreviewRegistro) ? 0.6 : 1,
              }}
            >
              {carregando ? (
                'Analisando...'
              ) : (
                <>
                  <FiUpload size={14} />
                  {qualidadeRuim ? 'Subir mesmo assim' : (modo === 'data'
                    ? (estrategiaData === 'atualizar_data' ? 'Seguir — Atualizar' : 'Seguir — Inserir')
                    : 'Seguir')}
                  {temPreviewData && modo === 'data' && (
                    <span style={{ marginLeft: '0.3rem', fontSize: '0.65rem', opacity: 0.8 }}>
                      ({previewDataInfo!.linhasImportaveis + (estrategiaData === 'atualizar_data' ? previewDataInfo!.linhasIgnoradas : 0)} registros)
                    </span>
                  )}
                  {temPreviewRegistro && modo === 'registro' && (
                    <span style={{ marginLeft: '0.3rem', fontSize: '0.65rem', opacity: 0.8 }}>
                      ({previewData!.novos + (estrategiaRegistro === 'substituir' ? previewData!.conflitantes : 0)} registros)
                    </span>
                  )}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
