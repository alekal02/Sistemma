import { useState, useEffect, useRef, useCallback } from 'react';
import { FiAlertTriangle, FiCheckCircle, FiXCircle, FiAlertCircle, FiDownload, FiX, FiBarChart2 } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';

/* ───────────────────────────────────────────
   TIPOS
   ─────────────────────────────────────────── */
interface Problema {
  tipo: string;
  label: string;
  descricao: string;
  gravidade: 'crítico' | 'alto' | 'médio' | 'baixo';
  quantidade: number;
  percentual: number;
  amostra: {
    id: number;
    placa: string | null;
    motorista: string | null;
    data: string | null;
    valorAtual: any;
  }[];
}

interface ResumoQualidade {
  registrosValidos: number;
  registrosComAlgumProblema: number;
  percentualValido: number;
  categorias: {
    kmNegativo: number;
    semPeso: number;
    semKmInicial: number;
    semKmFinal: number;
    semKmTotal: number;
    semPlaca: number;
    semMotorista: number;
  };
}

interface RelatorioData {
  uploadId: number;
  nomeArquivo: string;
  totalRegistros: number;
  totalProblemas: number;
  registroMaisAntigo: string | null;
  registroMaisRecente: string | null;
  pontuacaoQualidade: number;
  problemas: Problema[];
  resumo: ResumoQualidade;
}

/* ───────────────────────────────────────────
   HELPERS
   ─────────────────────────────────────────── */
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
    case 'crítico': return <FiXCircle size={16} />;
    case 'alto': return <FiAlertCircle size={16} />;
    case 'médio': return <FiAlertTriangle size={16} />;
    case 'baixo': return <FiCheckCircle size={16} />;
    default: return null;
  }
}

function getNivelQualidade(score: number): { label: string; cor: string; bg: string } {
  if (score >= 90) return { label: 'Excelente', cor: '#16a34a', bg: '#f0fdf4' };
  if (score >= 70) return { label: 'Boa', cor: '#ca8a04', bg: '#fefce8' };
  if (score >= 50) return { label: 'Regular', cor: '#ea580c', bg: '#fff7ed' };
  return { label: 'Crítico', cor: '#dc2626', bg: '#fef2f2' };
}

function formatarValorAmotra(valor: any): string {
  if (valor === null || valor === undefined) return '—';
  if (typeof valor === 'object') {
    return Object.entries(valor)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
  }
  return String(valor);
}

/* ───────────────────────────────────────────
   COMPONENTE PRINCIPAL
   ─────────────────────────────────────────── */
interface RelatorioQualidadeProps {
  uploadId: number | null;
  servicoId?: string;
  aberto: boolean;
  onFechar: () => void;
}

export default function RelatorioQualidade({ uploadId, servicoId, aberto, onFechar }: RelatorioQualidadeProps) {
  const { token } = useAuth();
  const [carregando, setCarregando] = useState(false);
  const [relatorio, setRelatorio] = useState<RelatorioData | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [problemaExpandido, setProblemaExpandido] = useState<string | null>(null);
  const [exportandoPdf, setExportandoPdf] = useState(false);
  const relatorioRef = useRef<HTMLDivElement>(null);

  const carregarRelatorio = useCallback(async () => {
    if (!uploadId && !servicoId) return;
    setCarregando(true);
    setErro(null);
    setRelatorio(null);
    try {
      let url = '';
      if (uploadId) {
        url = `/api/coleta/qualidade/${uploadId}`;
      } else if (servicoId) {
        url = `/api/coleta/qualidade/servico/${servicoId}`;
      }
      const res = await fetch(url, {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao carregar relatório');
      }
      const data = await res.json();
      setRelatorio(data);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, [uploadId, servicoId, token]);

  useEffect(() => {
    if (aberto) {
      carregarRelatorio();
    }
  }, [aberto, carregarRelatorio]);

  const exportarPDF = async () => {
    if (!relatorio) return;
    setExportandoPdf(true);
    try {
      const nivel = getNivelQualidade(relatorio.pontuacaoQualidade);
      const html = gerarHtmlRelatorio(relatorio, nivel);
      
      // Abre em nova janela para impressão (Ctrl+P → Salvar como PDF)
      const w = window.open('', '_blank');
      if (w) {
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 500);
      }
    } catch (err) {
      console.error('Erro ao exportar PDF:', err);
    } finally {
      setExportandoPdf(false);
    }
  };

  // Se não estiver aberto, não renderiza
  if (!aberto) return null;

  return (
    <div className="modal-overlay" onClick={onFechar} style={{ zIndex: 1000 }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: '16px',
          width: '95vw',
          maxWidth: '900px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 80px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#1e293b' }}>
            <FiBarChart2 size={18} />
            Relatório de Qualidade dos Dados
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {relatorio && (
              <button
                onClick={exportarPDF}
                disabled={exportandoPdf}
                className="btn btn-sm btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}
              >
                <FiDownload size={14} />
                {exportandoPdf ? 'Exportando...' : 'Exportar PDF'}
              </button>
            )}
            <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '0.25rem' }}>
              <FiX size={22} />
            </button>
          </div>
        </div>

        {/* Conteúdo */}
        <div ref={relatorioRef} style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
          {carregando && (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <div style={{
                width: '36px', height: '36px',
                border: '3px solid #e2e8f0', borderTopColor: '#6366f1',
                borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                margin: '0 auto 1rem',
              }} />
              <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Analisando qualidade dos dados...</p>
            </div>
          )}

          {erro && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#dc2626' }}>
              <FiXCircle size={40} style={{ opacity: 0.5, marginBottom: '0.5rem' }} />
              <p style={{ fontSize: '0.85rem' }}>{erro}</p>
            </div>
          )}

          {relatorio && <RelatorioConteudo relatorio={relatorio} />}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────
   CONTEÚDO DO RELATÓRIO
   ─────────────────────────────────────────── */
function RelatorioConteudo({ relatorio }: { relatorio: RelatorioData }) {
  const nivel = getNivelQualidade(relatorio.pontuacaoQualidade);
  const [problemaExpandido, setProblemaExpandido] = useState<string | null>(null);

  return (
    <div>
      {/* ═══ Score de Qualidade ═══ */}
      <div style={{
        display: 'flex',
        gap: '1.5rem',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        alignItems: 'stretch',
      }}>
        {/* Círculo de pontuação */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: nivel.bg,
          borderRadius: '14px',
          padding: '1.5rem 2rem',
          minWidth: '160px',
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: `conic-gradient(${nivel.cor} ${relatorio.pontuacaoQualidade}%, #e2e8f0 ${relatorio.pontuacaoQualidade}%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '0.5rem',
            position: 'relative',
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <span style={{ fontSize: '1.4rem', fontWeight: 800, color: nivel.cor }}>
                {relatorio.pontuacaoQualidade}
              </span>
            </div>
          </div>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: nivel.cor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {nivel.label}
          </span>
        </div>

        {/* Cards de resumo */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
          <ResumoCard
            icon={<FiBarChart2 size={18} />}
            label="Total de Registros"
            valor={relatorio.totalRegistros.toLocaleString('pt-BR')}
            cor="#6366f1"
          />
          <ResumoCard
            icon={<FiCheckCircle size={18} />}
            label="Registros Válidos"
            valor={relatorio.resumo.registrosValidos.toLocaleString('pt-BR')}
            cor="#16a34a"
          />
          <ResumoCard
            icon={<FiAlertTriangle size={18} />}
            label="Com Problemas"
            valor={relatorio.resumo.registrosComAlgumProblema.toLocaleString('pt-BR')}
            cor="#dc2626"
          />
          <ResumoCard
            icon={<FiAlertCircle size={18} />}
            label="Tipos de Problemas"
            valor={String(relatorio.totalProblemas)}
            cor="#ea580c"
          />
        </div>
      </div>

      {/* ═══ Info do Arquivo ═══ */}
      <div style={{
        background: '#f8fafc',
        borderRadius: '10px',
        padding: '0.75rem 1rem',
        marginBottom: '1.5rem',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1.5rem',
        fontSize: '0.78rem',
        color: '#475569',
      }}>
        <span><strong>Arquivo:</strong> {relatorio.nomeArquivo}</span>
        <span><strong>Período:</strong> {relatorio.registroMaisAntigo || 'N/A'} até {relatorio.registroMaisRecente || 'N/A'}</span>
        <span><strong>% Válido:</strong> {relatorio.resumo.percentualValido}%</span>
      </div>

      {/* ═══ Categorias em Mini Cards ═══ */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h4 style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', margin: '0 0 0.6rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Problemas Encontrados
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.5rem' }}>
          <CatCard label="KM Negativo" valor={relatorio.resumo.categorias.kmNegativo} cor="#dc2626" />
          <CatCard label="Sem Peso" valor={relatorio.resumo.categorias.semPeso} cor="#dc2626" />
          <CatCard label="Sem KM Inicial" valor={relatorio.resumo.categorias.semKmInicial} cor="#ea580c" />
          <CatCard label="Sem KM Final" valor={relatorio.resumo.categorias.semKmFinal} cor="#ea580c" />
          <CatCard label="Sem KM Total" valor={relatorio.resumo.categorias.semKmTotal} cor="#ca8a04" />
          <CatCard label="Sem Placa" valor={relatorio.resumo.categorias.semPlaca} cor="#dc2626" />
          <CatCard label="Sem Motorista" valor={relatorio.resumo.categorias.semMotorista} cor="#ca8a04" />
        </div>
      </div>

      {/* ═══ Lista Detalhada de Problemas ═══ */}
      {relatorio.problemas.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          background: '#f0fdf4',
          borderRadius: '12px',
          color: '#16a34a',
        }}>
          <FiCheckCircle size={36} style={{ marginBottom: '0.5rem', opacity: 0.7 }} />
          <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>Nenhum problema encontrado! Todos os dados estão consistentes.</p>
        </div>
      ) : (
        <div>
          {relatorio.problemas.map((p) => {
            const expandido = problemaExpandido === p.tipo;
            return (
              <div
                key={p.tipo}
                style={{
                  background: getBgGravidade(p.gravidade),
                  border: `1px solid ${getCorGravidade(p.gravidade)}33`,
                  borderRadius: '10px',
                  marginBottom: '0.6rem',
                  overflow: 'hidden',
                }}
              >
                {/* Cabeçalho do problema */}
                <div
                  onClick={() => setProblemaExpandido(expandido ? null : p.tipo)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.7rem 1rem',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <span style={{ color: getCorGravidade(p.gravidade), flexShrink: 0 }}>
                    {getIconeGravidade(p.gravidade)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#1e293b' }}>
                      {p.label}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '1px' }}>
                      {p.descricao}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: getCorGravidade(p.gravidade) }}>
                      {p.quantidade.toLocaleString('pt-BR')}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                      {p.percentual}% dos registros
                    </div>
                  </div>
                  <span style={{ color: '#94a3b8', transform: expandido ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <FiAlertCircle size={14} />
                  </span>
                </div>

                {/* Detalhes expandidos */}
                {expandido && p.amostra.length > 0 && (
                  <div style={{ padding: '0 1rem 0.8rem' }}>
                    <div style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: '#64748b',
                      marginBottom: '0.4rem',
                      textTransform: 'uppercase',
                    }}>
                      Amostra (primeiros {p.amostra.length} registros)
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{
                        width: '100%',
                        fontSize: '0.72rem',
                        borderCollapse: 'collapse',
                        background: '#fff',
                        borderRadius: '6px',
                        overflow: 'hidden',
                      }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9' }}>
                            <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left', color: '#475569', fontWeight: 600 }}>#</th>
                            <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Data</th>
                            <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Placa</th>
                            <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Motorista</th>
                            <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Valor Atual</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.amostra.map((a, i) => (
                            <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '0.3rem 0.5rem', color: '#94a3b8' }}>{i + 1}</td>
                              <td style={{ padding: '0.3rem 0.5rem' }}>{a.data || '—'}</td>
                              <td style={{ padding: '0.3rem 0.5rem', fontWeight: 600 }}>{a.placa || '—'}</td>
                              <td style={{ padding: '0.3rem 0.5rem' }}>{a.motorista || '—'}</td>
                              <td style={{ padding: '0.3rem 0.5rem', fontFamily: 'monospace', fontSize: '0.68rem', color: '#dc2626' }}>
                                {formatarValorAmotra(a.valorAtual)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────
   SUBCOMPONENTES
   ─────────────────────────────────────────── */
function ResumoCard({ icon, label, valor, cor }: { icon: React.ReactNode; label: string; valor: string; cor: string }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: '10px',
      padding: '0.75rem 1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.25rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color }}>
        {icon}
        <span style={{ fontSize: '0.7rem', fontWeight: 500, color: '#64748b' }}>{label}</span>
      </div>
      <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1e293b' }}>{valor}</span>
    </div>
  );
}

function CatCard({ label, valor, cor }: { label: string; valor: number; cor: string }) {
  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${cor}33`,
      borderRadius: '8px',
      padding: '0.5rem 0.7rem',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: cor }}>
        {valor.toLocaleString('pt-BR')}
      </div>
      <div style={{ fontSize: '0.62rem', color: '#64748b', marginTop: '1px', lineHeight: 1.2 }}>
        {label}
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────
   GERADOR DE HTML PARA PDF
   ─────────────────────────────────────────── */
function gerarHtmlRelatorio(relatorio: RelatorioData, nivel: { label: string; cor: string; bg: string }): string {
  const problemasHtml = relatorio.problemas.map(p => `
    <div class="problema" style="border-left: 4px solid ${getCorGravidade(p.gravidade)}; background: ${getBgGravidade(p.gravidade)}; padding: 10px 14px; margin-bottom: 8px; border-radius: 6px; page-break-inside: avoid;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong style="font-size: 13px; color: #1e293b;">${p.label}</strong>
          <p style="font-size: 11px; color: #64748b; margin: 2px 0 0;">${p.descricao}</p>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 18px; font-weight: 800; color: ${getCorGravidade(p.gravidade)};">${p.quantidade}</div>
          <div style="font-size: 10px; color: #94a3b8;">${p.percentual}%</div>
        </div>
      </div>
      ${p.amostra.length > 0 ? `
      <table style="width:100%; border-collapse: collapse; margin-top: 8px; font-size: 10px;">
        <thead>
          <tr style="background: #e2e8f0;">
            <th style="padding: 4px 6px; text-align: left;">Data</th>
            <th style="padding: 4px 6px; text-align: left;">Placa</th>
            <th style="padding: 4px 6px; text-align: left;">Motorista</th>
            <th style="padding: 4px 6px; text-align: left;">Valor</th>
          </tr>
        </thead>
        <tbody>
          ${p.amostra.map(a => `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 3px 6px;">${a.data || '—'}</td>
              <td style="padding: 3px 6px; font-weight: 600;">${a.placa || '—'}</td>
              <td style="padding: 3px 6px;">${a.motorista || '—'}</td>
              <td style="padding: 3px 6px; color: #dc2626;">${formatarValorAmotra(a.valorAtual)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>` : ''}
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; color: #1e293b; background: #fff; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    h2 { font-size: 14px; color: #64748b; font-weight: 400; margin-bottom: 20px; }
    .score-box { display: flex; align-items: center; gap: 20px; margin-bottom: 20px; }
    .score-circle { width: 90px; height: 90px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    .score-circle-inner { width: 72px; height: 72px; border-radius: 50%; background: #fff; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 800; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #1e293b; color: white; padding: 6px 8px; font-size: 11px; text-align: left; }
    td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; font-size: 10px; }
    @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
  </style>
</head>
<body>
  <h1>Relatório de Qualidade dos Dados</h1>
  <h2>${relatorio.nomeArquivo} — ${relatorio.registroMaisAntigo || 'N/A'} a ${relatorio.registroMaisRecente || 'N/A'}</h2>

  <div class="score-box">
    <div class="score-circle" style="background: conic-gradient(${nivel.cor} ${relatorio.pontuacaoQualidade}%, #e2e8f0 ${relatorio.pontuacaoQualidade}%);">
      <div class="score-circle-inner" style="color: ${nivel.cor};">${relatorio.pontuacaoQualidade}</div>
    </div>
    <div>
      <div style="font-size: 16px; font-weight: 800; color: ${nivel.cor};">${nivel.label}</div>
      <div style="font-size: 12px; color: #64748b;">${relatorio.totalRegistros} registros analisados</div>
      <div style="font-size: 12px; color: #64748b;">${relatorio.resumo.percentualValido}% válidos</div>
    </div>
  </div>

  <table style="margin-bottom: 20px;">
    <tr><th colspan="2">Resumo</th></tr>
    <tr><td>Total de Registros</td><td style="font-weight: 700;">${relatorio.totalRegistros.toLocaleString('pt-BR')}</td></tr>
    <tr><td>Registros Válidos</td><td style="font-weight: 700; color: #16a34a;">${relatorio.resumo.registrosValidos.toLocaleString('pt-BR')}</td></tr>
    <tr><td>Registros com Problemas</td><td style="font-weight: 700; color: #dc2626;">${relatorio.resumo.registrosComAlgumProblema.toLocaleString('pt-BR')}</td></tr>
    <tr><td>Tipos de Problemas</td><td style="font-weight: 700;">${relatorio.totalProblemas}</td></tr>
  </table>

  <table style="margin-bottom: 20px;">
    <tr><th>Categoria</th><th>Quantidade</th></tr>
    <tr><td>KM Negativo</td><td style="font-weight: 700; color: #dc2626;">${relatorio.resumo.categorias.kmNegativo}</td></tr>
    <tr><td>Sem Peso</td><td style="font-weight: 700; color: #dc2626;">${relatorio.resumo.categorias.semPeso}</td></tr>
    <tr><td>Sem KM Inicial</td><td style="font-weight: 700; color: #ea580c;">${relatorio.resumo.categorias.semKmInicial}</td></tr>
    <tr><td>Sem KM Final</td><td style="font-weight: 700; color: #ea580c;">${relatorio.resumo.categorias.semKmFinal}</td></tr>
    <tr><td>Sem KM Total</td><td style="font-weight: 700; color: #ca8a04;">${relatorio.resumo.categorias.semKmTotal}</td></tr>
    <tr><td>Sem Placa</td><td style="font-weight: 700; color: #dc2626;">${relatorio.resumo.categorias.semPlaca}</td></tr>
    <tr><td>Sem Motorista</td><td style="font-weight: 700; color: #ca8a04;">${relatorio.resumo.categorias.semMotorista}</td></tr>
  </table>

  <h2 style="margin-bottom: 10px;">Detalhamento dos Problemas</h2>
  ${problemasHtml}

  <p style="margin-top: 30px; font-size: 10px; color: #94a3b8; text-align: center;">
    Relatório gerado automaticamente — Sistemma
  </p>
</body>
</html>`;
}
