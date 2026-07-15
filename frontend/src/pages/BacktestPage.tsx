import { useEffect, useState } from 'react'
import { fetchDslStrategies, fetchStrategies, runBacktest } from '../api'
import { useStrategySelection } from '../hooks/useStrategySelection'
import { defaultDates } from '../lib/dates'
import { riskText, ruleText } from '../lib/dsl'
import type { BacktestResult, SavedDslStrategy } from '../types'
import { BacktestResults } from '../components/backtest/BacktestResults'
import { BacktestStatsGrid } from '../components/backtest/BacktestStatsGrid'
import { ParamInputs, buildScalarParams } from '../components/backtest/ParamInputs'

export function BacktestPage() {
  const [start, setStart] = useState(defaultDates().start)
  const [end, setEnd] = useState(defaultDates().end)
  const [capital, setCapital] = useState('100000')

  // Saved AI stock strategies. Selecting one drives the backtest; the empty
  // value falls back to manual mode (built-in CTA strategies).
  const [saved, setSaved] = useState<SavedDslStrategy[]>([])
  const [aiId, setAiId] = useState('')
  const selectedAi = saved.find((s) => s.id === aiId)

  // Manual mode state.
  const [symbol, setSymbol] = useState('AAPL')
  const [exchange, setExchange] = useState('NASDAQ')
  const { strategies, strategy, setStrategy, selected, paramValues, setParamValues } =
    useStrategySelection(fetchStrategies)

  const [status, setStatus] = useState('')
  const [statusColor, setStatusColor] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<BacktestResult | null>(null)

  useEffect(() => {
    fetchDslStrategies()
      .then((list) => {
        setSaved(list)
        if (list.length) setAiId(list[0].id)
      })
      .catch(() => setSaved([]))
  }, [])

  async function handleRun() {
    setRunning(true)
    setStatus('Running...')
    setStatusColor('')
    setResult(null)
    try {
      const req = selectedAi
        ? {
            symbol: selectedAi.dsl.symbol,
            exchange: selectedAi.dsl.exchange,
            start,
            end,
            strategy: 'dsl_strategy',
            capital: parseFloat(capital) || 100000,
            params: { dsl: selectedAi.dsl },
          }
        : {
            symbol,
            exchange,
            start,
            end,
            strategy,
            capital: parseFloat(capital) || 100000,
            params: buildScalarParams(selected, paramValues),
          }
      const data = await runBacktest(req)
      setStatus('Complete')
      setStatusColor('#10b981')
      setResult(data)
    } catch (e) {
      setStatus('Error: ' + (e as Error).message)
      setStatusColor('#f43f5e')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      <div className="section">
        <h2>Stock Backtest</h2>

        <div>
          <label className="question-label">Strategy</label>
          <div>
            <select style={{ width: 320 }} value={aiId} onChange={(e) => setAiId(e.target.value)}>
              {saved.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.dsl.name} — {s.dsl.symbol} (AI)
                </option>
              ))}
              <option value="">Manual (built-in strategy)</option>
            </select>
          </div>
        </div>

        {selectedAi ? (
          <div className="config-summary">
            <div className="config-row">
              <span className="config-key">Symbol</span>
              <span>{selectedAi.dsl.symbol}</span>
            </div>
            <div className="config-row">
              <span className="config-key">Direction</span>
              <span>{selectedAi.dsl.direction}</span>
            </div>
            <div className="config-row">
              <span className="config-key">Entry when</span>
              <span>{ruleText(selectedAi.dsl.entry)}</span>
            </div>
            <div className="config-row">
              <span className="config-key">Exit when</span>
              <span>{ruleText(selectedAi.dsl.exit)}</span>
            </div>
            <div className="config-row">
              <span className="config-key">Risk</span>
              <span>{riskText(selectedAi.dsl)}</span>
            </div>
          </div>
        ) : (
          <>
            <div>
              <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="Symbol" />
              <input value={exchange} onChange={(e) => setExchange(e.target.value)} placeholder="Exchange" />
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
          </>
        )}

        <div style={{ marginTop: 12 }}>
          <label className="question-label">Backtest Period & Capital</label>
          <div>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            <input value={capital} onChange={(e) => setCapital(e.target.value)} placeholder="Capital" />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <button onClick={handleRun} disabled={running}>
            {running ? 'Running...' : 'Run Backtest'}
          </button>
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
