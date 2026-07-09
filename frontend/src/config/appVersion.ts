declare const __APP_VERSION__: string

/** Versão embutida no build (VERSION / tag Git / TAG do deploy). */
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ ? __APP_VERSION__ : 'dev'

export function formatVersionLabel(version: string): string {
  const raw = (version || 'dev').trim()
  if (!raw || raw === 'dev' || raw === 'unknown' || raw === 'latest') return 'Sistemma (dev)'

  const clean = raw.replace(/-dirty$/, '')

  if (/^v[\d.]/.test(clean)) return `Sistemma ${clean}`
  if (/^[\d]+\.[\d]/.test(clean)) return `Sistemma v${clean}`
  return `Sistemma ${clean}`
}

/** Rótulo exibido no rodapé — ex.: "Sistemma v2.0.1" */
export function appVersionLabel(version: string = APP_VERSION): string {
  return formatVersionLabel(version)
}
