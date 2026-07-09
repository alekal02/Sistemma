/* ============================================
   CLIENTE API — Axios configurado com JWT
   ============================================ */
import axios from 'axios'
import { migrarStorageLegado, STORAGE_TOKEN, STORAGE_USER } from '../utils/storage'

migrarStorageLegado()

const API_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(STORAGE_TOKEN)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRoute = error.config?.url?.includes('/auth/login')
    if (error.response?.status === 401 && !isLoginRoute) {
      localStorage.removeItem(STORAGE_TOKEN)
      localStorage.removeItem(STORAGE_USER)
      localStorage.removeItem('@abastecimento:token')
      localStorage.removeItem('@abastecimento:user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api

/** Timeout para endpoints pesados (dashboard executivo, PDFs) */
export const TIMEOUT_ENDPOINTS_PESADOS_MS = 120_000
