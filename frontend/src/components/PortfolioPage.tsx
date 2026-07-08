import { useState } from 'react'
import { fetchSymbols, runPortfolioBacktest } from '../api'
import type { BacktestStatistics, SymbolInfo } from '../types'
import { BacktestStatsGrid } from './BacktestStatsGrid'
import { SymbolsTable } from './SymbolsTable'

// Polygon's free tier only serves ~2 years of history, so default to the last year
function defaultDates() {
  const end = new Date()
  const start = new Date()
  start.setFullYear(end.getFullYear() - 1)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

export function PortfolioPage() {
  const [symbols, setSymbols] = useState('AAPL,MSFT,GOOGL')
  const [exchange, setExchange] = useState('NASDAQ')
  const [start, setStart] = useState(defaultDates().start)
  const [end, setEnd] = useState(defaultDates().end)
  const [capital, setCapital] = useState('100000')

  const [status, setStatus] = useState('')
  const [statusColor, setStatusColor] = useState('')
  const [stats, setStats] = useState<BacktestStatistics | null>(null)
  const [weights, setWeights] = useState<Record<string, number> | null>(null)

  const [dbSymbols, setDbSymbols] = useState<SymbolInfo[] | null>(null)

  async function handleRun() {
    setStatus('Running portfolio backtest...')
    setStatusColor('')
    setStats(null)
    setWeights(null)
    try {
      const data = await runPortfolioBacktest({
        symbols: symbols.split(',').map((s) => s.trim()),
        exchange,
        start,
        end,
        capital: parseFloat(capital),
      })
      if (data.detail) throw new Error(data.detail)
      setStatus('Complete')
      setStatusColor('#69f0ae')
      setStats(data.statistics)
      setWeights(data.weights)
    } catch (e) {
      setStatus('Error: ' + (e as Error).message)
      setStatusColor('#ef5350')
    }
  }

  async function handleLoadSymbols() {
    setDbSymbols(await fetchSymbols())
  }

  return (
    <div>
      <div className="section">
        <h2>Portfolio Backtest</h2>
        <div>
          <input
            style={{ width: 300 }}
            value={symbols}
            onChange={(e) => setSymbols(e.target.value)}
            placeholder="Symbols (comma separated)"
          />
          <input value={exchange} onChange={(e) => setExchange(e.target.value)} placeholder="Exchange" />
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          <input value={capital} onChange={(e) => setCapital(e.target.value)} placeholder="Capital" />
          <button onClick={handleRun}>Run Portfolio Backtest</button>
        </div>
        <div className="status" style={{ color: statusColor }}>
          {status}
        </div>
        <div style={{ marginTop: 12 }}>
          {weights && (
            <>
              <h3>Allocation</h3>
              <table>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(weights).map(([sym, w]) => (
                    <tr key={sym}>
                      <td>{sym}</td>
                      <td>{(w * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {stats && (
            <>
              <h3 style={{ marginTop: 16 }}>Portfolio Results</h3>
              <BacktestStatsGrid stats={stats} />
            </>
          )}
        </div>
      </div>
      <SymbolsTable symbols={dbSymbols} onLoad={handleLoadSymbols} />
    </div>
  )
}
