import { useState } from 'react';
import ConfirmModal from './ConfirmModal';
import RelatorioQualidade from './RelatorioQualidade';

interface UploadInfo {
  id: number;
  nome: string;
  criadoEm: string;
  linhas: number;
  importados: number;
  ignoradas?: number;
  substituidas?: number;
  conflitantes?: number;
  estrategia?: string;
  resumo?: {
    novos: number;
    duplicadosIgnorados: number;
    conflitantes: number;
    substituidos: number;
  } | null;
}

interface UploadHistoryProps {
  uploads: {
    total: number;
    totalLinhas: number;
    totalImportados: number;
    ultimos: UploadInfo[];
  } | null;
  onExcluir: (id: number) => void;
  onRefresh?: () => void;
  /** Token para requisições de exclusão */
  token: string | null;
  servicoId: string;
  contractId: string;
  adicionarToast: (msg: string, t: 'success' | 'error' | 'warning') => void;
}

export default function UploadHistory({
  uploads,
  onExcluir,
}: UploadHistoryProps) {
  const [confirmExcluir, setConfirmExcluir] = useState<{ id: number; nome: string } | null>(null);
  const [relatorioAberto, setRelatorioAberto] = useState(false);
  const [relatorioUploadId, setRelatorioUploadId] = useState<number | null>(null);

  const abrirRelatorio = (uploadId: number) => {
    setRelatorioUploadId(uploadId);
    setRelatorioAberto(true);
  };

  if (!uploads || uploads.total === 0) return null;

  return (
    <>
      <div style={{ marginTop: '1rem' }}>
        <div
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 700,
            color: 'var(--color-text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          <span>Uploads Recentes ({uploads.total})</span>
          <span
            style={{
              fontSize: '0.6rem',
              fontWeight: 400,
              color: 'var(--color-text-light)',
              textTransform: 'none',
            }}
          >
            — {uploads.totalLinhas} linhas, {uploads.totalImportados} importados
          </span>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Arquivo</th>
                <th style={{ textAlign: 'center' }}>Linhas</th>
                <th style={{ textAlign: 'center' }}>Importados</th>
                <th style={{ textAlign: 'center' }}>Ignorados</th>
                <th style={{ textAlign: 'right' }}>Data</th>
                <th style={{ textAlign: 'center', width: '120px' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {uploads.ultimos.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>
                    {u.nome}
                    {(u.ignoradas && u.ignoradas > 0) || (u.substituidas && u.substituidas > 0) ? (
                      <span style={{
                        display: 'inline-flex',
                        gap: '4px',
                        marginLeft: '8px',
                        verticalAlign: 'middle',
                      }}>
                        {u.ignoradas && u.ignoradas > 0 && (
                          <span
                            title={`${u.ignoradas} duplicatas ignoradas`}
                            style={{
                              fontSize: '0.6rem',
                              background: '#fef3c7',
                              color: '#92400e',
                              padding: '1px 6px',
                              borderRadius: '8px',
                              fontWeight: 600,
                            }}
                          >
                            -{u.ignoradas} dup
                          </span>
                        )}
                        {u.substituidas && u.substituidas > 0 && (
                          <span
                            title={`${u.substituidas} conflitos substituídos`}
                            style={{
                              fontSize: '0.6rem',
                              background: '#dbeafe',
                              color: '#1e40af',
                              padding: '1px 6px',
                              borderRadius: '8px',
                              fontWeight: 600,
                            }}
                          >
                            ~{u.substituidas} alt
                          </span>
                        )}
                      </span>
                    ) : null}
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>{u.linhas}</td>
                  <td style={{ textAlign: 'center', color: 'var(--color-success-dark)', fontWeight: 600 }}>{u.importados}</td>
                  <td style={{ textAlign: 'center', color: '#92400e', fontWeight: u.ignoradas ? 600 : 400 }}>
                    {u.ignoradas || 0}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--color-text-light)', fontSize: '0.72rem' }}>
                    {new Date(u.criadoEm).toLocaleString('pt-BR')}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center' }}>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => abrirRelatorio(u.id)}
                        title="Ver relatório de qualidade dos dados"
                        style={{ fontSize: '0.65rem', padding: '0.2rem 0.4rem' }}
                      >
                        Qualidade
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => setConfirmExcluir({ id: u.id, nome: u.nome })}
                        style={{ fontSize: '0.65rem', padding: '0.2rem 0.4rem' }}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        aberto={confirmExcluir !== null}
        titulo="Excluir Planilha"
        mensagem={`Tem certeza que deseja excluir "${confirmExcluir?.nome || ''}" e todos os dados vinculados?`}
        confirmarTexto="Excluir"
        variante="danger"
        onConfirm={() => {
          if (confirmExcluir) {
            onExcluir(confirmExcluir.id);
            setConfirmExcluir(null);
          }
        }}
        onCancel={() => setConfirmExcluir(null)}
      />

      {/* Modal de Relatório de Qualidade */}
      <RelatorioQualidade
        uploadId={relatorioUploadId}
        aberto={relatorioAberto}
        onFechar={() => {
          setRelatorioAberto(false);
          setRelatorioUploadId(null);
        }}
      />
    </>
  );
}
