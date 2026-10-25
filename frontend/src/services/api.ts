/* ============================================
   CLIENTE API — Axios configurado com JWT
   ============================================ */
import axios, { type InternalAxiosRequestConfig } from 'axios'
import { migrarStorageLegado, STORAGE_REFRESH, STORAGE_TOKEN, STORAGE_USER } from '../utils/storage'

migrarStorageLegado()

const API_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean }

function persistirSessao(token: string, refreshToken?: string, user?: unknown) {
  localStorage.setItem(STORAGE_TOKEN, token)
  if (refreshToken) localStorage.setItem(STORAGE_REFRESH, refreshToken)
  if (user) localStorage.setItem(STORAGE_USER, JSON.stringify(user))
  localStorage.removeItem('@abastecimento:token')
  localStorage.removeItem('@abastecimento:user')
}

export function limparSessaoLocal() {
  localStorage.removeItem(STORAGE_TOKEN)
  localStorage.removeItem(STORAGE_REFRESH)
  localStorage.removeItem(STORAGE_USER)
  localStorage.removeItem('@abastecimento:token')
  localStorage.removeItem('@abastecimento:user')
}

let refreshPromise: Promise<string | null> | null = null

/** Renova o JWT com o refresh token (ou o access token ainda na graça). */
export async function renovarToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    const refresh = localStorage.getItem(STORAGE_REFRESH)
    const access = localStorage.getItem(STORAGE_TOKEN)
    const raw = refresh || access
    if (!raw) return null
    try {
      const { data } = await axios.post<{ token: string; refreshToken?: string; user?: unknown }>(
        `${API_URL}/auth/refresh`,
        { refreshToken: raw },
        { timeout: 15000 },
      )
      if (!data?.token) return null
      persistirSessao(data.token, data.refreshToken, data.user)
      return data.token
    } catch {
      return null
    }
  })().finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(STORAGE_TOKEN)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  // Evita tempestade de 304 lentos no DevTools (revalidação por linha/componente).
  config.headers['Cache-Control'] = 'no-cache'
  config.headers.Pragma = 'no-cache'
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const cfg = error.config as RetryConfig | undefined
    const url = String(cfg?.url || '')
    const isAuthLivre = url.includes('/auth/login')
      || url.includes('/auth/refresh')
      || url.includes('/auth/acesso-direto')
    if (error.response?.status !== 401 || isAuthLivre || !cfg || cfg._retry) {
      return Promise.reject(error)
    }

    cfg._retry = true
    const novo = await renovarToken()
    if (novo) {
      cfg.headers = cfg.headers || {}
      cfg.headers.Authorization = `Bearer ${novo}`
      return api(cfg)
    }

    limparSessaoLocal()
    if (window.location.pathname !== '/') {
      window.location.href = '/'
    }
    return Promise.reject(error)
  },
)

export default api

/** Timeout para endpoints pesados (dashboard executivo, PDFs) */
export const TIMEOUT_ENDPOINTS_PESADOS_MS = 120_000
