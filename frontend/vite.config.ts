import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5175,
    proxy: {
      // Live/paper trading
      '/subscribe': { target: 'http://localhost:8100', changeOrigin: true },
      '/order': { target: 'http://localhost:8100', changeOrigin: true },
      '/positions': { target: 'http://localhost:8100', changeOrigin: true },
      '/account': { target: 'http://localhost:8100', changeOrigin: true },
      // Market data
      '/symbols': { target: 'http://localhost:8100', changeOrigin: true },
      '/load_data': { target: 'http://localhost:8100', changeOrigin: true },
      // Backtest execution
      '/stock_backtest': { target: 'http://localhost:8100', changeOrigin: true },
      '/portfolio_backtest': { target: 'http://localhost:8100', changeOrigin: true },
      // Parameter optimization
      '/optimize': { target: 'http://localhost:8100', changeOrigin: true },
      // AI generation
      '/generate_stock_strategy': { target: 'http://localhost:8100', changeOrigin: true },
      '/generate_portfolio_strategy': { target: 'http://localhost:8100', changeOrigin: true },
      // Saved strategies
      '/saved_stock_strategies': { target: 'http://localhost:8100', changeOrigin: true },
      '/saved_portfolio_strategies': { target: 'http://localhost:8100', changeOrigin: true },
      // WebSocket (live ticks)
      '/ws': { target: 'ws://localhost:8100', ws: true },
    },
  },
})
