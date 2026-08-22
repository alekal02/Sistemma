import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ehGestor, homePath } from '../utils/homePath'
import type { ReactNode } from 'react'

interface AdminRouteProps {
  children: ReactNode
}

/** Rota restrita a administradores */
export default function AdminRoute({ children }: AdminRouteProps) {
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
    return <Navigate to="/login" replace />
  }

  if (!isAdmin) {
    return <Navigate to={homePath(user)} replace />
  }

  if (ehGestor(user) && !user.contractId) {
    return <Navigate to="/visao-geral" replace />
  }

  return <>{children}</>
}
