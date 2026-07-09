import { useState } from 'react'
import { fetchStrategies, runBacktest } from '../api'
import { useStrategySelection } from '../hooks/useStrategySelection'
import { defaultDates } from '../lib/dates'
import type { BacktestResult } from '../types'
import { BacktestResults } from './BacktestResults'
import { BacktestStatsGrid } from './BacktestStatsGrid'
import { ParamInputs, buildScalarParams } from './ParamInputs'

export function BacktestPage() {
  const [symbol, setSymbol] = useState('AAPL')
  const [exchange, setExchange] = useState('NASDAQ')
  const [start, setStart] = useState(defaultDates().start)
  const [end, setEnd] = useState(defaultDates().end)
  const [capital, setCapital] = useState('100000')

  const { strategies, strategy, setStrategy, selected, paramValues, setParamValues } =
    useStrategySelection(fetchStrategies)

  const [status, setStatus] = useState('')
  const [statusColor, setStatusColor] = useState('')
  const [result, setResult] = useState<BacktestResult | null>(null)

  async function handleRun() {
    setStatus('Running...')
    setStatusColor('')
    setResult(null)
    try {
      const data = await runBacktest({
        symbol,
        exchange,
        start,
        end,
        strategy,
        capital: parseFloat(capital),
        params: buildScalarParams(selected, paramValues),
      })
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
            {strategies.map((s) => (
              <option key={s.name} value={s.name}>
                {s.class_name}
              </option>
            ))}
          </select>
        </div>

        <ParamInputs
          strategy={selected}
          values={paramValues}
          onChange={(name, value) => setParamValues((prev) => ({ ...prev, [name]: value }))}
        />

        <div>
          <button onClick={handleRun}>Run Backtest</button>
        </div>
        <div className="status" style={{ color: statusColor }}>
          {status}
        </div>
        <div style={{ marginTop: 12 }}>{result && <BacktestStatsGrid stats={result.statistics} />}</div>
      </div>
      {result && <BacktestResults statistics={result.statistics} dailyResults={result.daily_results ?? []} />}
    </div>
  )
}
