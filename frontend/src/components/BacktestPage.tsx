import { useState } from 'react'
import { runBacktest } from '../api'
import type { BacktestResult } from '../types'
import { BacktestStatsGrid } from './BacktestStatsGrid'
import { BacktestCharts } from './BacktestCharts'
import { BacktestMetricsTable } from './BacktestMetricsTable'

const STRATEGIES = [
  { value: 'buy_and_hold_strategy', label: 'Buy and Hold' },
  { value: 'double_ma_strategy', label: 'Double MA' },
]

export function BacktestPage() {
  const [symbol, setSymbol] = useState('AAPL')
  const [exchange, setExchange] = useState('NASDAQ')
  const [start, setStart] = useState('2020-01-01')
  const [end, setEnd] = useState('2024-01-01')
  const [capital, setCapital] = useState('100000')
  const [strategy, setStrategy] = useState(STRATEGIES[0].value)

  const [status, setStatus] = useState('')
  const [statusColor, setStatusColor] = useState('')
  const [result, setResult] = useState<BacktestResult | null>(null)

  async function handleRun() {
    setStatus('Running...')
    setStatusColor('')
    setResult(null)
    try {
      const data = await runBacktest({ symbol, exchange, start, end, strategy, capital: parseFloat(capital) })
      setStatus('Complete')
      setStatusColor('#10b981')
      setResult(data)
    } catch (e) {
      setStatus('Error: ' + (e as Error).message)
      setStatusColor('#f43f5e')
    }
  }

  return (
    <div>
      <div className="section">
        <h2>Run Backtest</h2>
        <div>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="Symbol" />
          <input value={exchange} onChange={(e) => setExchange(e.target.value)} placeholder="Exchange" />
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          <input value={capital} onChange={(e) => setCapital(e.target.value)} placeholder="Capital" />
          <select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            {STRATEGIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button onClick={handleRun}>Run Backtest</button>
        </div>
        <div className="status" style={{ color: statusColor }}>
          {status}
        </div>
        <div style={{ marginTop: 12 }}>{result && <BacktestStatsGrid stats={result.statistics} />}</div>
      </div>
      {result && (
        <div className="section">
          <h2>Results</h2>
          <BacktestCharts dailyResults={result.daily_results ?? []} />
          <BacktestMetricsTable stats={result.statistics} />
        </div>
      )}
    </div>
  )
}
