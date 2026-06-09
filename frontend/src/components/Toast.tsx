/* ============================================
   COMPONENTE TOAST — Notificações no canto superior direito
   Renderiza a fila de toasts do ToastContext
   ============================================ */
import { useToast } from '../contexts/ToastContext'
import '../styles/Toast.css'

const icones: Record<string, string> = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
}

function ToastContainer() {
  const { toasts, removerToast } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast-item toast-${toast.tipo}`}>
          <span className="toast-icone">{icones[toast.tipo] || 'ℹ️'}</span>
          <span className="toast-mensagem">{toast.mensagem}</span>
          <button
            className="toast-fechar"
            onClick={() => removerToast(toast.id)}
            aria-label="Fechar notificação"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

export default ToastContainer
