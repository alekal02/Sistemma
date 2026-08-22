/* ============================================
   CONTEXTO DE AUTENTICAÇÃO — AuthContext
   Gerencia login, logout, estado do usuário
   e persistência do token JWT
   ============================================ */
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import axios from 'axios'
import api, { limparSessaoLocal, renovarToken } from '../services/api'
import { migrarStorageLegado, STORAGE_REFRESH, STORAGE_TOKEN, STORAGE_USER } from '../utils/storage'

migrarStorageLegado()
import type { UserData, AuthResponse } from '../types'

const RENOVAR_SESSAO_MS = 4 * 60 * 60 * 1000

// ---------- Tipos do contexto ----------
interface AuthContextType {
  /** Usuário autenticado ou null */
  user: UserData | null
  /** Token JWT atual */
  token: string | null
  /** Se está carregando o auto-login */
  loading: boolean
  /** Fazer login com email + senha */
  login: (email: string, senha: string) => Promise<UserData>
  /** Local: entra como gestor ou numa unidade, sem senha */
  entrarLocal: (modo: 'gestor' | 'contrato', contractId?: string) => Promise<UserData>
  /** Super-admin entra no banco de um contrato */
  entrarContrato: (contractId: string) => Promise<void>
  /** Super-admin volta ao hub */
  sairContrato: () => Promise<void>
  /** Encerrar sessão */
  logout: () => void
  /** Se o usuário logado é admin ou super-admin */
  isAdmin: boolean
  isSuperadmin: boolean
}

// ---------- Criação do contexto ----------
const AuthContext = createContext<AuthContextType | undefined>(undefined)

function gravarSessao(token: string, userData: UserData, refreshToken?: string) {
  localStorage.setItem(STORAGE_TOKEN, token)
  localStorage.setItem(STORAGE_USER, JSON.stringify(userData))
  if (refreshToken) localStorage.setItem(STORAGE_REFRESH, refreshToken)
  localStorage.removeItem('@abastecimento:token')
  localStorage.removeItem('@abastecimento:user')
}

function userDoStorage(): UserData | null {
  try {
    const raw = localStorage.getItem(STORAGE_USER)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

// ---------- Provider ----------
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const limparSessao = () => {
    limparSessaoLocal()
    setToken(null)
    setUser(null)
  }

  /* ── Restaura sessão e valida token no backend ── */
  useEffect(() => {
    const storedToken = localStorage.getItem(STORAGE_TOKEN)
      || localStorage.getItem('@abastecimento:token')
    if (!storedToken) {
      setLoading(false)
      return
    }

    const validarSessao = async () => {
      try {
        const { data } = await api.get<{ user: UserData }>('/auth/me', {
          headers: { Authorization: `Bearer ${storedToken}` },
        })
        setToken(localStorage.getItem(STORAGE_TOKEN) || storedToken)
        setUser(data.user)
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          limparSessao()
          return
        }
        // Rede/backend fora: mantém a sessão da TV até o logout manual
        const localUser = userDoStorage()
        if (localUser) {
          setToken(storedToken)
          setUser(localUser)
        }
      } finally {
        setLoading(false)
      }
    }

    validarSessao()
  }, [])

  /* ── Renova o JWT enquanto a tela (TV) permanece ligada ── */
  useEffect(() => {
    if (!token) return undefined
    const tick = async () => {
      const novo = await renovarToken()
      if (novo) setToken(novo)
    }
    const id = window.setInterval(tick, RENOVAR_SESSAO_MS)
    const visivel = () => {
      if (document.visibilityState === 'visible') void tick()
    }
    document.addEventListener('visibilitychange', visivel)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', visivel)
    }
  }, [token])

  /* ── Login ── */
  const login = async (email: string, senha: string) => {
    const response = await api.post<AuthResponse>('/auth/login', { email, senha })
    const { token: newToken, refreshToken, user: userData } = response.data

    gravarSessao(newToken, userData, refreshToken)

    setToken(newToken)
    setUser(userData)
    return userData
  }

  const entrarLocal = async (modo: 'gestor' | 'contrato', contractId?: string) => {
    const response = await api.post<AuthResponse>('/auth/acesso-local', { modo, contractId })
    const { token: newToken, refreshToken, user: userData } = response.data
    gravarSessao(newToken, userData, refreshToken)
    setToken(newToken)
    setUser(userData)
    return userData
  }

  const entrarContrato = async (contractId: string) => {
    const response = await api.post<AuthResponse>('/auth/entrar-contrato', { contractId })
    const { token: newToken, refreshToken, user: userData } = response.data
    gravarSessao(newToken, userData, refreshToken)
    setToken(newToken)
    setUser(userData)
  }

  const sairContrato = async () => {
    const response = await api.post<AuthResponse>('/auth/sair-contrato')
    const { token: newToken, refreshToken, user: userData } = response.data
    gravarSessao(newToken, userData, refreshToken)
    setToken(newToken)
    setUser(userData)
  }

  /* ── Logout ── */
  const logout = () => {
    limparSessao()
  }

  const isSuperadmin = user?.role === 'superadmin'
  const isAdmin = user?.role === 'admin' || isSuperadmin

  return (
    <AuthContext.Provider value={{
      user, token, loading, login, entrarLocal, entrarContrato, sairContrato, logout, isAdmin, isSuperadmin,
    }}>
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
