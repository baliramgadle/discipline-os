import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const repositoryRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repositoryRoot, 'API_URL')
  const apiUrl = env.API_URL?.trim().replace(/\/+$/, '')

  if (!apiUrl) {
    throw new Error('API_URL must be configured in the repository .env or deployment environment.')
  }

  return {
    envDir: repositoryRoot,
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl),
    },
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
        },
        '/socket.io': {
          target: apiUrl,
          changeOrigin: true,
          ws: true,
        },
      },
    },
  }
})
