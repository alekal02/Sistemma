import { FiArrowLeft, FiUpload, FiRefreshCw } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

interface DashboardHeaderProps {
  servicoNome: string;
  contractId: string;
  uploading: boolean;
  onUpload: (file: File) => void;
  onRefresh: () => void;
  uploadRef: React.RefObject<HTMLInputElement | null>;
}

export default function DashboardHeader({
  servicoNome,
  contractId,
  uploading,
  onUpload,
  onRefresh,
  uploadRef,
}: DashboardHeaderProps) {
  const navigate = useNavigate();

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '0.5rem',
      }}
    >
      <div>
        <button
          className="btn btn-ghost"
          onClick={() => navigate('/contratos/' + contractId)}
          style={{ margin: 0, padding: '0.3rem 0', fontSize: '0.85rem' }}
        >
          <FiArrowLeft size={14} /> Voltar para Contrato
        </button>
        <h2 style={{ margin: '0.25rem 0 0', fontSize: '1.25rem' }}>
          {servicoNome || 'Dashboard'}
        </h2>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="file"
          accept=".xlsx,.xls"
          ref={uploadRef}
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) {
              onUpload(f);
              e.target.value = '';
            }
          }}
          style={{ display: 'none' }}
          id="dash-upload-input"
        />
        <label
          htmlFor="dash-upload-input"
          className="btn btn-primary"
          style={{
            cursor: uploading ? 'not-allowed' : 'pointer',
            opacity: uploading ? 0.7 : 1,
          }}
        >
          <FiUpload size={15} />
          {uploading ? 'Enviando...' : 'Upload'}
        </label>
        <button className="btn btn-secondary" onClick={onRefresh}>
          <FiRefreshCw size={16} />
        </button>
      </div>
    </div>
  );
}
