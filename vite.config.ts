import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/ampleweb-ai/',


  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      // CORS proxy for NVIDIA NIM — enterprise API blocks direct browser requests.
      // In dev mode: /api/proxy/nvidia/v1/chat/completions → https://integrate.api.nvidia.com/v1/chat/completions
      '/api/proxy/nvidia': {
        target: 'https://integrate.api.nvidia.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/proxy\/nvidia/, ''),
      },
      // CORS proxy for Ollama Cloud
      '/api/proxy/ollama-cloud': {
        target: 'https://api.ollama.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/proxy\/ollama-cloud/, ''),
      },
    },
  },
  optimizeDeps: {
    exclude: ['wasm'],
  },
  build: {
    target: 'esnext',
  },
})
