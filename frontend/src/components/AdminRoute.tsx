import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ehGestor, homePath, ROTA_ACESSO } from '../utils/homePath'
import type { ReactNode } from 'react'

interface AdminRouteProps {
  children: ReactNode
  /** Hub do gestor (sem contrato aberto), usado na configuração do WhatsApp. */
  permitirHubGestor?: boolean
}

/** Rota restrita a administradores */
export default function AdminRoute({ children, permitirHubGestor = false }: AdminRouteProps) {
  const { user, loading, isAdmin } = useAuth()

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Carregando…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to={ROTA_ACESSO} replace />
  }

  if (!isAdmin) {
    return <Navigate to={homePath(user)} replace />
  }

  if (ehGestor(user) && !user.contractId && !permitirHubGestor) {
    return <Navigate to="/visao-geral" replace />
  }

  return <>{children}</>
}
