import { useEffect, useRef } from 'react';
import { FiAlertTriangle, FiInfo, FiTrash2 } from 'react-icons/fi';

interface ConfirmModalProps {
  aberto: boolean;
  titulo: string;
  mensagem: string;
  confirmarTexto?: string;
  cancelarTexto?: string;
  variante?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
  carregando?: boolean;
}

export default function ConfirmModal({
  aberto,
  titulo,
  mensagem,
  confirmarTexto = 'Confirmar',
  cancelarTexto = 'Cancelar',
  variante = 'danger',
  onConfirm,
  onCancel,
  carregando = false,
}: ConfirmModalProps) {
  const focusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (aberto && focusRef.current) {
      setTimeout(() => focusRef.current?.focus(), 50);
    }
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter' && !carregando) onConfirm();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [aberto, onConfirm, onCancel, carregando]);

  if (!aberto) return null;

  const cores = {
    danger: { icon: FiTrash2, bg: 'var(--color-danger-light)', color: 'var(--color-danger)', border: 'var(--color-danger)' },
    warning: { icon: FiAlertTriangle, bg: 'var(--color-warning-light)', color: 'var(--color-warning-dark)', border: 'var(--color-warning)' },
    info: { icon: FiInfo, bg: 'var(--color-info-light)', color: 'var(--color-info)', border: 'var(--color-info)' },
  };

  const { icon: Icon, bg, color } = cores[variante];

  return (
    <div
      className="modal-overlay"
      onClick={onCancel}
      style={{ zIndex: 2000 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '420px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '1.5rem 1.5rem 1rem', textAlign: 'center' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem',
            }}
          >
            <Icon size={24} color={color} />
          </div>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', color: '#1e293b' }}>
            {titulo}
          </h3>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', lineHeight: 1.5 }}>
            {mensagem}
          </p>
        </div>
        <div
          style={{
            padding: '0.75rem 1.5rem 1.25rem',
            display: 'flex',
            gap: '0.6rem',
            justifyContent: 'center',
          }}
        >
          <button
            ref={focusRef}
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={carregando}
          >
            {cancelarTexto}
          </button>
          <button
            className={`btn ${variante === 'danger' ? 'btn-danger' : variante === 'warning' ? 'btn-primary' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={carregando}
          >
            {carregando ? 'Aguarde...' : confirmarTexto}
          </button>
        </div>
      </div>
    </div>
  );
}
