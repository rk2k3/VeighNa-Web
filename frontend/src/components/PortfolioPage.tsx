import { useEffect, useState } from 'react'
import { fetchPortfolioStrategies, fetchSymbols, runPortfolioBacktest } from '../api'
import { useStrategySelection } from '../hooks/useStrategySelection'
import { defaultDates } from '../lib/dates'
import { equalPercents, normalizeWeights, parseSymbols } from '../lib/weights'
import type { PortfolioBacktestResult, SymbolInfo } from '../types'
import { AllocationTable } from './AllocationTable'
import { BacktestResults } from './BacktestResults'
import { BacktestStatsGrid } from './BacktestStatsGrid'
import { ParamInputs, buildScalarParams } from './ParamInputs'
import { SymbolsTable } from './SymbolsTable'
import { WeightsEditor } from './WeightsEditor'

export function PortfolioPage() {
  const [symbols, setSymbols] = useState('AAPL,MSFT,GOOGL')
  const [exchange, setExchange] = useState('NASDAQ')
  const [start, setStart] = useState(defaultDates().start)
  const [end, setEnd] = useState(defaultDates().end)
  const [capital, setCapital] = useState('100000')

  const { strategies, strategy, setStrategy, selected, paramValues, setParamValues } =
    useStrategySelection(fetchPortfolioStrategies)

  // Per-symbol weight as a percentage string, keyed by the raw symbol entry.
  const [weights, setWeights] = useState<Record<string, string>>({})

  const [status, setStatus] = useState('')
  const [statusColor, setStatusColor] = useState('')
  const [result, setResult] = useState<PortfolioBacktestResult | null>(null)
  const [dbSymbols, setDbSymbols] = useState<SymbolInfo[] | null>(null)

  const symbolList = parseSymbols(symbols)
  const hasWeights = selected?.parameters.some((p) => p.name === 'weights') ?? false

  // Keep the weight rows in sync with the symbols field: preserve edited values,
  // default new symbols to an equal share, drop removed ones.
  useEffect(() => {
    const list = parseSymbols(symbols)
    setWeights((prev) => {
      const equal = list.length ? 100 / list.length : 0
      const next: Record<string, string> = {}
      for (const s of list) next[s] = prev[s] ?? equal.toFixed(2)
      return next
    })
  }, [symbols])

  function buildParams(): Record<string, unknown> {
    const params = buildScalarParams(selected, paramValues)
    if (hasWeights) {
      params.weights = normalizeWeights(symbolList, weights, exchange)
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

        {hasWeights && (
          <WeightsEditor
            symbols={symbolList}
            weights={weights}
            onChange={(s, value) => setWeights((prev) => ({ ...prev, [s]: value }))}
            onEqual={() => setWeights(equalPercents(symbolList))}
          />
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
              <AllocationTable weights={result.weights} />
              <h3 style={{ marginTop: 16 }}>Portfolio Results</h3>
              <BacktestStatsGrid stats={result.statistics} />
            </>
          )}
        </div>
      </div>
      {result && <BacktestResults statistics={result.statistics} dailyResults={result.daily_results ?? []} />}
      <SymbolsTable symbols={dbSymbols} onLoad={handleLoadSymbols} />
    </div>
  )
}
