/* ============================================
   CONTEXTO DE TOAST — Notificações efêmeras
   Gerencia fila de toasts no canto superior direito
   ============================================ */
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  mensagem: string
  tipo: ToastType
  duracao?: number
}

interface ToastContextType {
  toasts: Toast[]
  adicionarToast: (mensagem: string, tipo?: ToastType, duracao?: number) => void
  removerToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

let toastIdCounter = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removerToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const adicionarToast = useCallback((mensagem: string, tipo: ToastType = 'info', duracao = 4000) => {
    const id = `toast-${++toastIdCounter}`
    const novoToast: Toast = { id, mensagem, tipo, duracao }

    setToasts(prev => [...prev, novoToast])

    // Auto-remover após duração
    if (duracao > 0) {
      setTimeout(() => removerToast(id), duracao)
    }
  }, [removerToast])

  return (
    <ToastContext.Provider value={{ toasts, adicionarToast, removerToast }}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextType {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast deve ser usado dentro de um ToastProvider')
  }
  return context
}
