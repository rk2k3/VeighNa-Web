import { useEffect, useState } from 'react'
import { fetchPortfolioStrategies, fetchSymbols, runPortfolioBacktest } from '../api'
import type { PortfolioBacktestResult, StrategyInfo, SymbolInfo } from '../types'
import { BacktestStatsGrid } from './BacktestStatsGrid'
import { BacktestCharts } from './BacktestCharts'
import { BacktestMetricsTable } from './BacktestMetricsTable'
import { ParamInputs, buildScalarParams, seedParamValues } from './ParamInputs'
import { SymbolsTable } from './SymbolsTable'

// Polygon's free tier only serves ~2 years of history, so default to the last year
function defaultDates() {
  const end = new Date()
  const start = new Date()
  start.setFullYear(end.getFullYear() - 1)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

// "AAPL" -> "AAPL.NASDAQ" using the default; "SPY.ARCA" is left as-is.
function toVtSymbol(entry: string, defaultExchange: string) {
  const t = entry.trim()
  return t.includes('.') ? t : `${t}.${defaultExchange}`
}

export function PortfolioPage() {
  const [symbols, setSymbols] = useState('AAPL,MSFT,GOOGL')
  const [exchange, setExchange] = useState('NASDAQ')
  const [start, setStart] = useState(defaultDates().start)
  const [end, setEnd] = useState(defaultDates().end)
  const [capital, setCapital] = useState('100000')

  const [strategies, setStrategies] = useState<StrategyInfo[]>([])
  const [strategy, setStrategy] = useState('')
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  // Per-symbol weight as a percentage string, keyed by the raw symbol entry.
  const [weights, setWeights] = useState<Record<string, string>>({})

  const [status, setStatus] = useState('')
  const [statusColor, setStatusColor] = useState('')
  const [result, setResult] = useState<PortfolioBacktestResult | null>(null)

  const [dbSymbols, setDbSymbols] = useState<SymbolInfo[] | null>(null)

  const symbolList = symbols
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const selected = strategies.find((s) => s.name === strategy)
  const hasWeights = selected?.parameters.some((p) => p.name === 'weights') ?? false

  // Load available portfolio strategies once.
  useEffect(() => {
    fetchPortfolioStrategies()
      .then((list) => {
        setStrategies(list)
        if (list.length) setStrategy(list[0].name)
      })
      .catch(() => setStrategies([]))
  }, [])

  // Seed scalar parameter inputs with the selected strategy's defaults.
  useEffect(() => {
    setParamValues(seedParamValues(selected))
  }, [strategy, strategies]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the weight rows in sync with the symbols field.
  useEffect(() => {
    const list = symbols
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    setWeights((prev) => {
      const equal = list.length ? 100 / list.length : 0
      const next: Record<string, string> = {}
      for (const s of list) next[s] = prev[s] ?? equal.toFixed(2)
      return next
    })
  }, [symbols])

  const totalPct = symbolList.reduce((sum, s) => sum + (parseFloat(weights[s]) || 0), 0)

  function setEqualWeights() {
    const equal = symbolList.length ? 100 / symbolList.length : 0
    setWeights(Object.fromEntries(symbolList.map((s) => [s, equal.toFixed(2)])))
  }

  function buildParams(): Record<string, unknown> {
    const params = buildScalarParams(selected, paramValues)
    if (hasWeights) {
      const pcts = symbolList.map((s) => parseFloat(weights[s]) || 0)
      const total = pcts.reduce((a, b) => a + b, 0)
      const weightMap: Record<string, number> = {}
      symbolList.forEach((s, i) => {
        weightMap[toVtSymbol(s, exchange)] = total > 0 ? pcts[i] / total : 1 / symbolList.length
      })
      params.weights = weightMap
    }
    return params
  }

  async function handleRun() {
    setStatus('Running portfolio backtest...')
    setStatusColor('')
    setResult(null)
    try {
      const data = await runPortfolioBacktest({
        symbols: symbolList,
        exchange,
        start,
        end,
        capital: parseFloat(capital),
        strategy,
        params: buildParams(),
      })
      setStatus('Complete')
      setStatusColor('#10b981')
      setResult(data)
    } catch (e) {
      setStatus('Error: ' + (e as Error).message)
      setStatusColor('#f43f5e')
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
            placeholder="Symbols (e.g. AAPL, SPY.ARCA)"
          />
          <input value={exchange} onChange={(e) => setExchange(e.target.value)} placeholder="Default exchange" />
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

        {hasWeights && symbolList.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <h3>
              Weights (%){' '}
              <button style={{ fontSize: 12, padding: '2px 8px' }} onClick={setEqualWeights}>
                Equal
              </button>
            </h3>
            {symbolList.map((s) => (
              <span key={s} style={{ display: 'inline-block', marginRight: 12, marginBottom: 8 }}>
                <label style={{ fontSize: 18, marginRight: 6 }}>{s}</label>
                <input
                  style={{ width: 90 }}
                  type="number"
                  value={weights[s] ?? ''}
                  onChange={(e) => setWeights({ ...weights, [s]: e.target.value })}
                />
              </span>
            ))}
            <div className="status">
              Total: {totalPct.toFixed(1)}%
              {Math.abs(totalPct - 100) > 0.1 ? ' — will be normalized to 100%' : ''}
            </div>
          </div>
        )}

        <div>
          <button onClick={handleRun}>Run Portfolio Backtest</button>
        </div>
        <div className="status" style={{ color: statusColor }}>
          {status}
        </div>
        <div style={{ marginTop: 12 }}>
          {result && (
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
                  {Object.entries(result.weights).map(([sym, w]) => (
                    <tr key={sym}>
                      <td>{sym}</td>
                      <td>{(w * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3 style={{ marginTop: 16 }}>Portfolio Results</h3>
              <BacktestStatsGrid stats={result.statistics} />
            </>
          )}
        </div>
      </div>
      {result && (
        <div className="section">
          <h2>Results</h2>
          <BacktestCharts dailyResults={result.daily_results ?? []} />
          <BacktestMetricsTable stats={result.statistics} />
        </div>
      )}
      <SymbolsTable symbols={dbSymbols} onLoad={handleLoadSymbols} />
    </div>
  )
}
