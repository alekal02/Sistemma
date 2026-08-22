/* ============================================
   COMPONENTE DE ROTA PROTEGIDA
   Sem sessão volta para a escolha de área
   ============================================ */
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ROTA_ACESSO } from '../utils/homePath'
import type { ReactNode } from 'react'

interface ProtectedRouteProps {
  children: ReactNode
}

function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth()

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

  return <>{children}</>
}

export default ProtectedRoute
