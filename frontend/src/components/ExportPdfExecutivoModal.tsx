/* ============================================
   ExportPdfExecutivoModal
   Modal de selecao de secoes para PDF executivo
   Lembra preferencias do usuario por servico
   ============================================ */

import { useState, useEffect } from 'react';
import { FiDownload, FiX, FiFileText, FiDollarSign, FiActivity, FiBarChart2, FiSliders } from 'react-icons/fi';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import dashboardExecutivoService from '../services/dashboardExecutivoService';

/* --- Storage key para preferencias --- */
function getStorageKey(servicoId: string): string {
  return `@sistemma:pdf_prefs:${servicoId}`;
}

interface SecaoConfig {
  id: string;
  label: string;
  descricao: string;
  icone: React.ReactNode;
}

const SECOES: SecaoConfig[] = [
  { id: 'financeira', label: 'Pagina Financeira', descricao: 'Tabelas de faturamento por tipo de caminhao e por periodo com graficos', icone: <FiDollarSign size={15} /> },
  { id: 'operacional', label: 'Pagina Operacional', descricao: 'Tabela compacta de indicadores operacionais', icone: <FiActivity size={15} /> },
  { id: 'graficos', label: 'Graficos', descricao: 'Barras de faturamento pizza por tipo de caminhao e linha de volume', icone: <FiBarChart2 size={15} /> },
  { id: 'customizados', label: 'Indicadores Customizados', descricao: 'Indicadores configurados pelo usuario que nao estao no resumo padrao', icone: <FiSliders size={15} /> },
];

interface ExportPdfExecutivoModalProps {
  contractId: string;
  servicoId: string;
  servicoNome: string;
  periodo: string;
  dataInicio?: string;
  dataFim?: string;
  onClose: () => void;
}

export default function ExportPdfExecutivoModal({
  contractId,
  servicoId,
  servicoNome,
  periodo,
  dataInicio,
  dataFim,
  onClose,
}: ExportPdfExecutivoModalProps) {
  const { adicionarToast } = useToast();
  const { token } = useAuth();

  // Carregar preferencias salvas
  const [secoes, setSecoes] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem(getStorageKey(servicoId));
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        /* fallback */
      }
    }
    return { financeira: true, operacional: true, graficos: true, customizados: true };
  });

  const [exportando, setExportando] = useState(false);

  // Salvar preferencias quando mudar
  useEffect(() => {
    localStorage.setItem(getStorageKey(servicoId), JSON.stringify(secoes));
  }, [secoes, servicoId]);

  const toggleSecao = (id: string) => {
    setSecoes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleExport = async () => {
    // Validar que pelo menos uma secao esta selecionada
    const secoesSelecionadas = Object.entries(secoes)
      .filter(([, v]) => v)
      .map(([k]) => k);

    if (secoesSelecionadas.length === 0) {
      adicionarToast('Selecione pelo menos uma secao para exportar', 'warning');
      return;
    }

    setExportando(true);
    try {
      const { blob, filename } = await dashboardExecutivoService.gerarPdf({
        contractId,
        servicoId,
        servicoNome,
        periodo,
        dataInicio,
        dataFim,
        secoes: secoesSelecionadas,
      });

      // Download do blob
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      adicionarToast('PDF executivo gerado com sucesso!', 'success');
      onClose();
    } catch (err: any) {
      console.error('[ExportPdfExecutivo] Erro:', err);
      const msg = err?.response?.data?.error || err?.message || 'Erro ao gerar PDF';
      adicionarToast(msg, 'error');
    } finally {
      setExportando(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(15,23,42,0.6)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
        backdropFilter: 'blur(2px)',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '14px',
          width: '100%', maxWidth: '480px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '0.85rem 1.1rem',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#f8fafc',
        }}>
          <h3 style={{ margin: 0, fontSize: '0.92rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <FiFileText size={16} /> Exportar PDF Executivo
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.2rem', borderRadius: '4px' }}>
            <FiX size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '0.9rem 1.1rem 1rem' }}>
          <p style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '0.7rem', lineHeight: 1.4 }}>
            Selecione as secoes que deseja incluir no relatorio PDF. Sua escolha sera lembrada para este servico.
          </p>

          {/* Secoes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
            {SECOES.map(sec => {
              const ativa = secoes[sec.id] !== false;
              return (
                <label
                  key={sec.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
                    padding: '0.55rem 0.7rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    background: ativa ? '#f0fdf4' : '#f8fafc',
                    border: `1px solid ${ativa ? '#86efac' : '#e2e8f0'}`,
                    transition: 'all 0.15s',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={ativa}
                    onChange={() => toggleSecao(sec.id)}
                    style={{ marginTop: '2px', accentColor: '#22c55e' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '0.35rem',
                      fontSize: '0.8rem', fontWeight: 600, color: ativa ? '#15803d' : '#334155',
                    }}>
                      <span style={{ opacity: 0.6 }}>{sec.icone}</span>
                      {sec.label}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '1px' }}>
                      {sec.descricao}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {/* Info do servico */}
          <div style={{
            background: '#f1f5f9', borderRadius: '8px', padding: '0.5rem 0.75rem',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            border: '1px solid #e2e8f0', marginBottom: '0.9rem',
          }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#1e293b' }}>{servicoNome}</div>
              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                {periodo === 'hoje' ? 'Hoje' :
                 periodo === 'semana' ? 'Esta Semana' :
                 periodo === 'mes' ? 'Este Mes' :
                 periodo === '30d' ? 'Ultimos 30 Dias' :
                 periodo === '90d' ? 'Ultimos 90 Dias' :
                 periodo === 'personalizado' ? `${dataInicio || '...'} a ${dataFim || '...'}` :
                 periodo}
              </div>
            </div>
            <span style={{
              background: '#22c55e', color: 'white', fontSize: '0.62rem',
              fontWeight: 700, padding: '2px 7px', borderRadius: '4px',
              textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>
              PDF
            </span>
          </div>

          {/* Botao exportar */}
          <button
            onClick={handleExport}
            disabled={exportando}
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '0.4rem', padding: '0.55rem',
              fontSize: '0.85rem', fontWeight: 600,
              background: exportando ? '#94a3b8' : '#1e293b',
              color: 'white', border: 'none', borderRadius: '8px',
              cursor: exportando ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseOver={e => { if (!exportando) (e.target as HTMLElement).style.background = '#0f172a'; }}
            onMouseOut={e => { if (!exportando) (e.target as HTMLElement).style.background = '#1e293b'; }}
          >
            <FiDownload size={15} />
            {exportando ? 'Gerando PDF...' : 'Gerar PDF Executivo'}
          </button>
        </div>
      </div>
    </div>
  );
}
