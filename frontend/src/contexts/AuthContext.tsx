/* ============================================
   CONTEXTO DE AUTENTICAÇÃO — AuthContext
   Gerencia login, logout, estado do usuário
   e persistência do token JWT
   ============================================ */
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import api from '../services/api'
import type { UserData, AuthResponse } from '../types'

// ---------- Tipos do contexto ----------
interface AuthContextType {
  /** Usuário autenticado ou null */
  user: UserData | null
  /** Token JWT atual */
  token: string | null
  /** Se está carregando o auto-login */
  loading: boolean
  /** Fazer login com email + senha */
  login: (email: string, senha: string) => Promise<void>
  /** Encerrar sessão */
  logout: () => void
  /** Se o usuário logado é admin */
  isAdmin: boolean
}

// ---------- Criação do contexto ----------
const AuthContext = createContext<AuthContextType | undefined>(undefined)

// ---------- Provider ----------
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  /* ── Auto-login ao montar ── */
  useEffect(() => {
    const storedToken = localStorage.getItem('@abastecimento:token')
    const storedUser = localStorage.getItem('@abastecimento:user')

    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser) as UserData
        setToken(storedToken)
        setUser(parsedUser)
      } catch {
        localStorage.removeItem('@abastecimento:token')
        localStorage.removeItem('@abastecimento:user')
      }
    }
    setLoading(false)
  }, [])

  /* ── Login ── */
  const login = async (email: string, senha: string) => {
    const response = await api.post<AuthResponse>('/auth/login', { email, senha })
    const { token: newToken, user: userData } = response.data

    localStorage.setItem('@abastecimento:token', newToken)
    localStorage.setItem('@abastecimento:user', JSON.stringify(userData))

    setToken(newToken)
    setUser(userData)
  }

  /* ── Logout ── */
  const logout = () => {
    localStorage.removeItem('@abastecimento:token')
    localStorage.removeItem('@abastecimento:user')
    setToken(null)
    setUser(null)
  }

  /* ── Helper: isAdmin ── */
  const isAdmin = user?.role === 'admin'

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

// ---------- Hook personalizado ----------
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider')
  }
  return context
}
