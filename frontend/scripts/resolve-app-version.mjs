import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function readVersionFile() {
  const path = resolve(repoRoot, 'VERSION')
  if (!existsSync(path)) return null
  const line = readFileSync(path, 'utf8').trim().split(/\r?\n/)[0]?.trim()
  return line || null
}

function readTagFromEnvDocker() {
  for (const name of ['.env.docker', '.env']) {
    const path = resolve(repoRoot, name)
    if (!existsSync(path)) continue
    const match = readFileSync(path, 'utf8').match(/^TAG=(.+)$/m)
    if (!match) continue
    const tag = match[1].trim().replace(/^["']|["']$/g, '')
    if (tag && tag !== 'latest') return tag
  }
  return null
}

function isCommitHash(value) {
  return /^[0-9a-f]{7,40}(-dirty)?$/i.test(String(value || '').trim())
}

function isSemverLike(value) {
  return /^v?\d+\.\d+/.test(String(value || '').trim())
}

function git(cmd) {
  try {
    return execSync(cmd, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null
  } catch {
    return null
  }
}

/**
 * Ordem: VERSION (raiz) → VITE_APP_VERSION semver → TAG .env.docker → tags Git → dev
 * Nunca retorna hash de commit — não é versão de release.
 */
export function resolveAppVersion() {
  const fromFile = readVersionFile()
  if (fromFile) return fromFile

  const fromEnv = process.env.VITE_APP_VERSION?.trim()
  if (fromEnv && !isCommitHash(fromEnv)) return fromEnv

  const fromDockerEnv = readTagFromEnvDocker()
  if (fromDockerEnv) return fromDockerEnv

  const exactTag = git('git describe --tags --exact-match')
  if (exactTag && !isCommitHash(exactTag)) return exactTag

  const latestTag = git('git tag --sort=-v:refname')
    ?.split(/\r?\n/)
    .map((t) => t.trim())
    .find((t) => t && isSemverLike(t))
  if (latestTag) return latestTag

  return 'dev'
}
