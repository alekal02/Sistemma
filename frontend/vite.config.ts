import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveAppVersion } from './scripts/resolve-app-version.mjs'

const appVersion = resolveAppVersion()
const versionJsonPath = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  'public/app-version.json',
)

function syncAppVersionJson(): void {
  writeFileSync(versionJsonPath, `${JSON.stringify({ version: appVersion })}\n`, 'utf8')
}

function appVersionPlugin(): Plugin {
  return {
    name: 'app-version-json',
    buildStart() {
      syncAppVersionJson()
    },
    configureServer() {
      syncAppVersionJson()
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [appVersionPlugin(), react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      '@sistemma/shared': resolve(
        fileURLToPath(new URL('.', import.meta.url)),
        '../packages/shared/src/index.ts',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    host: '0.0.0.0',
    port: 5175,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3200',
        changeOrigin: true,
      },
      '/health': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3200',
        changeOrigin: true,
      },
    },
  },
})
