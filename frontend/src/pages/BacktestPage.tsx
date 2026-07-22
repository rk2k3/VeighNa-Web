import { useEffect, useState } from 'react'
import { fetchSavedStockStrategies, runStockBacktest } from '../api'
import { defaultDates } from '../lib/dates'
import { riskText, ruleText } from '../lib/dsl'
import { useBacktestRunner } from '../hooks/useBacktestRunner'
import type { BacktestResult, SavedStockStrategy } from '../types'
import { BacktestResults } from '../components/backtest/BacktestResults'
import { BacktestStatsGrid } from '../components/backtest/BacktestStatsGrid'

export function BacktestPage() {
  const [start, setStart] = useState(defaultDates().start)
  const [end, setEnd] = useState(defaultDates().end)
  const [capital, setCapital] = useState('100000')

  // Saved AI stock strategies — the only thing backtested here.
  const [saved, setSaved] = useState<SavedStockStrategy[]>([])
  const [aiId, setAiId] = useState('')
  const [loading, setLoading] = useState(true)
  const selectedAi = saved.find((s) => s.id === aiId)

  const { status, statusColor, running, result, run } = useBacktestRunner<BacktestResult>()

  useEffect(() => {
    fetchSavedStockStrategies()
      .then((list) => {
        setSaved(list)
        if (list.length) setAiId(list[0].id)
      })
      .catch(() => setSaved([]))
      .finally(() => setLoading(false))
  }, [])

  function handleRun() {
    if (!selectedAi) return
    run(() =>
      runStockBacktest({
        symbol: selectedAi.dsl.symbol,
        exchange: selectedAi.dsl.exchange,
        start,
        end,
        strategy: 'dsl_strategy',
        capital: parseFloat(capital) || 100000,
        params: { dsl: selectedAi.dsl },
      }),
    )
  }

  return (
    <div>
      <div className="section">
        <h2>Single-Asset Backtest</h2>

        {loading ? (
          <p style={{ color: '#64748b' }}>Loading saved strategies…</p>
        ) : saved.length === 0 ? (
          <p style={{ color: '#64748b' }}>
            No saved single-asset strategies yet. Create one on the <strong>Strategy Builder</strong>{' '}
            tab, then come back here to backtest it.
          </p>
        ) : (
          <>
            <div>
              <label className="question-label">Strategy</label>
              <div>
                <select style={{ width: 320 }} value={aiId} onChange={(e) => setAiId(e.target.value)}>
                  {saved.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.dsl.name} — {s.dsl.symbol} (AI)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedAi && (
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
          </>
        )}
      </div>
      {result && <BacktestResults statistics={result.statistics} dailyResults={result.daily_results ?? []} />}
    </div>
  )
}
