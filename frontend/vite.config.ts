import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5175,
    proxy: {
      '/subscribe': { target: 'http://localhost:8100', changeOrigin: true },
      '/order': { target: 'http://localhost:8100', changeOrigin: true },
      '/positions': { target: 'http://localhost:8100', changeOrigin: true },
      '/account': { target: 'http://localhost:8100', changeOrigin: true },
      '/strategies': { target: 'http://localhost:8100', changeOrigin: true },
      '/symbols': { target: 'http://localhost:8100', changeOrigin: true },
      '/load_data': { target: 'http://localhost:8100', changeOrigin: true },
      '/portfolio_backtest': { target: 'http://localhost:8100', changeOrigin: true },
      '/backtest': { target: 'http://localhost:8100', changeOrigin: true },
      '/ws': { target: 'ws://localhost:8100', ws: true },
    },
  },
})
