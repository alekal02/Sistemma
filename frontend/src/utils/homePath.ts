import type { UserData } from '../types'

/** Tela de escolha de área. Fica na raiz: não existe mais página de login. */
export const ROTA_ACESSO = '/'

export function isSuperadmin(user?: UserData | null): boolean {
  return user?.role === 'superadmin'
}

export function isAdminOuSuper(user?: UserData | null): boolean {
  return user?.role === 'admin' || user?.role === 'superadmin'
}

export function ehGestor(user?: UserData | null): boolean {
  if (!user) return false
  if (typeof user.gestor === 'boolean') return user.gestor
  return user.role === 'superadmin' || (user.role === 'admin' && !user.contractId)
}

export function homePath(user?: UserData | null): string {
  if (!user) return ROTA_ACESSO
  if (user.contractId) return `/contratos/${user.contractId}`
  if (ehGestor(user)) return '/visao-geral'
  return '/visao-geral'
}
