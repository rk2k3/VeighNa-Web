import { useCallback, useEffect, useState } from 'react'
import {
  createSavedPortfolioStrategy,
  fetchSavedPortfolioStrategies,
  runPortfolioBacktest,
  updateSavedPortfolioStrategy,
} from '../api'
import { defaultDates } from '../lib/dates'
import { useBacktestRunner } from '../hooks/useBacktestRunner'
import { useSavedPortfolioConfig } from '../hooks/useSavedPortfolioConfig'
import type { PortfolioBacktestResult, SavedPortfolioStrategy } from '../types'
import { AllocationTable } from '../components/portfolio/AllocationTable'
import { BacktestResults } from '../components/backtest/BacktestResults'
import { BacktestStatsGrid } from '../components/backtest/BacktestStatsGrid'

export function PortfolioPage() {
  const [saved, setSaved] = useState<SavedPortfolioStrategy[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [start, setStart] = useState(defaultDates().start)
  const [end, setEnd] = useState(defaultDates().end)

  // "Save as new" inline naming.
  const [saveAsName, setSaveAsName] = useState('')
  const [showSaveAs, setShowSaveAs] = useState(false)

  const selected = saved.find((s) => s.id === selectedId)

  // Editable config seeded from the selected strategy, plus run plumbing.
  const config = useSavedPortfolioConfig(selected)
  const { status, setStatus, statusColor, setStatusColor, running, result, run } =
    useBacktestRunner<PortfolioBacktestResult>()

  const refreshSaved = useCallback(() => fetchSavedPortfolioStrategies().then(setSaved), [])

  useEffect(() => {
    fetchSavedPortfolioStrategies()
      .then((list) => {
        setSaved(list)
        if (list.length) setSelectedId(list[0].id)
      })
      .catch(() => setSaved([]))
      .finally(() => setLoading(false))
  }, [])

  // Close the "save as new" box when the selection changes.
  useEffect(() => {
    setShowSaveAs(false)
    setSaveAsName('')
  }, [selectedId])

  async function handleSaveChanges() {
    if (!selected) return
    try {
      await updateSavedPortfolioStrategy(selected.id, config.buildInput(selected.name))
      await refreshSaved()
      setStatus(`Saved changes to “${selected.name}”.`)
      setStatusColor('#10b981')
    } catch (e) {
      setStatus('Error saving: ' + (e as Error).message)
      setStatusColor('#f43f5e')
    }
  }

  async function handleSaveAsNew() {
    if (!selected) return
    if (!saveAsName.trim()) {
      setStatus('Please enter a name for the new strategy.')
      setStatusColor('#f43f5e')
      return
    }
    try {
      const created = await createSavedPortfolioStrategy(config.buildInput(saveAsName.trim()))
      await refreshSaved()
      setSelectedId(created.id)
      setShowSaveAs(false)
      setSaveAsName('')
      setStatus(`Saved as “${created.name}”.`)
      setStatusColor('#10b981')
    } catch (e) {
      setStatus('Error saving: ' + (e as Error).message)
      setStatusColor('#f43f5e')
    }
  }

  function handleRun() {
    if (!selected) return
    run(
      () =>
        runPortfolioBacktest({
          symbols: config.currentSymbols(),
          exchange: selected.exchange,
          start,
          end,
          capital: config.currentCapital(),
          strategy: selected.strategy,
          params: config.currentParams(),
        }),
      'Running backtest...',
    )
  }

  if (loading) {
    return (
      <div className="section">
        <h2>Backtest a Saved Strategy</h2>
        <p style={{ color: '#94a3b8' }}>Loading saved strategies…</p>
      </div>
    )
  }

  if (!saved.length) {
    return (
      <div className="section">
        <h2>Backtest a Saved Strategy</h2>
        <p style={{ color: '#94a3b8' }}>
          You have no saved strategies yet. Head to the <strong>Strategy Builder</strong>{' '}
          tab to create one, then come back here to backtest it.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="section">
        <h2>Backtest a Saved Strategy</h2>

        <div>
          <label className="question-label">Saved Strategy</label>
          <div>
            <select
              style={{ width: 320 }}
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {saved.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.strategy_label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selected && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <label className="question-label" style={{ marginBottom: 0 }}>
                Configuration
              </label>
              <span style={{ color: '#64748b', fontSize: 13 }}>
                Autofilled from “{selected.name}”
                {config.dirty ? ' — edited' : ''} — edit any value for this run.
              </span>
              {config.dirty && (
                <>
                  <button
                    style={{ fontSize: 13, padding: '4px 12px' }}
                    onClick={handleSaveChanges}
                  >
                    Save Changes
                  </button>
                  <button
                    className="secondary"
                    style={{ fontSize: 13, padding: '4px 12px' }}
                    onClick={() => setShowSaveAs((v) => !v)}
                  >
                    Save as New…
                  </button>
                  <button
                    className="secondary"
                    style={{ fontSize: 13, padding: '4px 12px' }}
                    onClick={() => config.seed(selected)}
                  >
                    Reset
                  </button>
                </>
              )}
            </div>

            {showSaveAs && (
              <div style={{ marginTop: 8 }}>
                <input
                  style={{ width: 260 }}
                  value={saveAsName}
                  onChange={(e) => setSaveAsName(e.target.value)}
                  placeholder="New strategy name"
                />
                <button style={{ fontSize: 13, padding: '4px 12px' }} onClick={handleSaveAsNew}>
                  Create
                </button>
                <button
                  className="secondary"
                  style={{ fontSize: 13, padding: '4px 12px' }}
                  onClick={() => {
                    setShowSaveAs(false)
                    setSaveAsName('')
                  }}
                >
                  Cancel
                </button>
              </div>
            )}

            <div className="config-summary">
              <div className="config-row">
                <span className="config-key">Goal</span>
                <span>{selected.goal_label}</span>
              </div>
              <div className="config-row">
                <span className="config-key">Strategy</span>
                <span>{selected.strategy_label}</span>
              </div>
              <div className="config-row">
                <span className="config-key">Symbols</span>
                <input
                  style={{ width: 380, margin: 0 }}
                  value={config.symbolsText}
                  onChange={(e) => config.setSymbolsText(e.target.value)}
                />
              </div>
              <div className="config-row">
                <span className="config-key">Initial Investment</span>
                <input
                  type="number"
                  style={{ width: 160, margin: 0 }}
                  value={config.capital}
                  onChange={(e) => config.setCapital(e.target.value)}
                />
              </div>
              {Object.keys(selected.params).map((key) => (
                <div className="config-row" key={key}>
                  <span className="config-key">{key}</span>
                  <input
                    type="number"
                    style={{ width: 160, margin: 0 }}
                    value={config.params[key] ?? ''}
                    onChange={(e) =>
                      config.setParams((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <label className="question-label">Backtest Period</label>
          <div>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
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

        {result && (
          <div style={{ marginTop: 12 }}>
            <AllocationTable weights={result.weights} />
            <h3 style={{ marginTop: 16 }}>Portfolio Results</h3>
            <BacktestStatsGrid stats={result.statistics} />
          </div>
        )}
      </div>

      {result && (
        <BacktestResults statistics={result.statistics} dailyResults={result.daily_results ?? []} />
      )}
    </div>
  )
}
