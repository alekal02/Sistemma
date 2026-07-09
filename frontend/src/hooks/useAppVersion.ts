import { useEffect, useState } from 'react'
import { APP_VERSION, appVersionLabel } from '../config/appVersion'

interface VersionPayload {
  version?: string
}

interface HealthPayload {
  tag?: string
}

function isCommitHash(value: string): boolean {
  return /^[0-9a-f]{7,40}(-dirty)?$/i.test(value.trim())
}

function isSemverLike(value: string): boolean {
  return /^v?\d+\.\d+/.test(value.trim())
}

function versaoUtilizavel(value: string | undefined): value is string {
  if (!value) return false
  const v = value.trim()
  if (!v || v === 'unknown' || v === 'latest' || v === 'dev') return false
  if (isCommitHash(v)) return false
  return isSemverLike(v) || v.length <= 20
}

async function carregarVersao(): Promise<string> {
  try {
    const res = await fetch('/app-version.json', { cache: 'no-store' })
    if (res.ok) {
      const data = (await res.json()) as VersionPayload
      if (versaoUtilizavel(data.version)) return data.version!.trim()
    }
  } catch {
    /* ignore */
  }

  try {
    const res = await fetch('/health')
    if (res.ok) {
      const data = (await res.json()) as HealthPayload
      if (versaoUtilizavel(data.tag)) return data.tag!.trim()
    }
  } catch {
    /* ignore */
  }

  return APP_VERSION
}

/** Versão exibida no rodapé — lê app-version.json (arquivo VERSION) em runtime. */
export function useAppVersion(): string {
  const [label, setLabel] = useState(() => appVersionLabel(APP_VERSION))

  useEffect(() => {
    let cancelled = false
    carregarVersao().then((version) => {
      if (!cancelled) setLabel(appVersionLabel(version))
    })
    return () => {
      cancelled = true
    }
  }, [])

  return label
}

export { APP_VERSION, appVersionLabel }
