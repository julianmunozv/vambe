import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En desarrollo el panel corre en :5173 y el API en :8077. El proxy los pone en
// el mismo origen, así que el código de red es idéntico en dev y en producción
// (donde FastAPI sirve el build) y no hay CORS en ninguno de los dos.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.API_URL ?? 'http://127.0.0.1:8077', changeOrigin: true } },
  },
  build: { outDir: 'dist', sourcemap: false },
})
