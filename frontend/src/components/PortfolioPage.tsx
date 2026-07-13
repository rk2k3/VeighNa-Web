import { useCallback, useEffect, useState } from 'react'
import {
  createSavedStrategy,
  fetchSavedStrategies,
  runPortfolioBacktest,
  updateSavedStrategy,
} from '../api'
import { defaultDates } from '../lib/dates'
import type { PortfolioBacktestResult, SavedStrategy, SavedStrategyInput } from '../types'
import { AllocationTable } from './AllocationTable'
import { BacktestResults } from './BacktestResults'
import { BacktestStatsGrid } from './BacktestStatsGrid'

export function PortfolioPage() {
  const [saved, setSaved] = useState<SavedStrategy[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [start, setStart] = useState(defaultDates().start)
  const [end, setEnd] = useState(defaultDates().end)

  // Editable, autofilled-from-saved config for this run. These seed from the
  // selected strategy but can be overridden before running (edits are not
  // written back to the saved strategy).
  const [capital, setCapital] = useState('')
  const [symbolsText, setSymbolsText] = useState('')
  const [params, setParams] = useState<Record<string, string>>({})

  const [status, setStatus] = useState('')
  const [statusColor, setStatusColor] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<PortfolioBacktestResult | null>(null)

  // "Save as new" inline naming.
  const [saveAsName, setSaveAsName] = useState('')
  const [showSaveAs, setShowSaveAs] = useState(false)

  const selected = saved.find((s) => s.id === selectedId)

  // Reset the editable fields to the selected strategy's saved values.
  const seedFrom = useCallback((s: SavedStrategy) => {
    setCapital(String(s.capital))
    setSymbolsText(s.symbols.join(', '))
    setParams(Object.fromEntries(Object.entries(s.params).map(([k, v]) => [k, String(v)])))
  }, [])

  const refreshSaved = useCallback(() => fetchSavedStrategies().then(setSaved), [])

  useEffect(() => {
    fetchSavedStrategies()
      .then((list) => {
        setSaved(list)
        if (list.length) setSelectedId(list[0].id)
      })
      .catch(() => setSaved([]))
  }, [])

  // Parse the editable fields into the concrete values used to run or save.
  function currentSymbols(): string[] {
    return symbolsText.split(',').map((s) => s.trim()).filter(Boolean)
  }

  function currentCapital(): number {
    return parseFloat(capital) || (selected?.capital ?? 0)
  }

  function currentParams(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const key of Object.keys(selected?.params ?? {})) {
      const n = parseFloat(params[key])
      out[key] = Number.isNaN(n) ? selected!.params[key] : n
    }
    return out
  }

  // Whether the editable config differs from the selected strategy's saved values.
  const dirty =
    !!selected &&
    (currentSymbols().join(',') !== selected.symbols.join(',') ||
      currentCapital() !== selected.capital ||
      Object.keys(selected.params).some((k) => currentParams()[k] !== selected.params[k]))

  // Build a full saved-strategy payload from the current edits.
  function buildInput(name: string): SavedStrategyInput {
    return {
      name,
      goal: selected!.goal,
      goal_label: selected!.goal_label,
      strategy: selected!.strategy,
      strategy_label: selected!.strategy_label,
      universe_label: selected!.universe_label,
      symbols: currentSymbols(),
      exchange: selected!.exchange,
      capital: currentCapital(),
      params: currentParams(),
    }
  }

  async function handleSaveChanges() {
    if (!selected) return
    try {
      await updateSavedStrategy(selected.id, buildInput(selected.name))
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
      const created = await createSavedStrategy(buildInput(saveAsName.trim()))
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

  // Autofill whenever the selected strategy changes.
  useEffect(() => {
    if (selected) seedFrom(selected)
    setShowSaveAs(false)
    setSaveAsName('')
  }, [selectedId, saved]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRun() {
    if (!selected) return
    setRunning(true)
    setStatus('Running backtest...')
    setStatusColor('')
    setResult(null)
    try {
      const data = await runPortfolioBacktest({
        symbols: currentSymbols(),
        exchange: selected.exchange,
        start,
        end,
        capital: currentCapital(),
        strategy: selected.strategy,
        params: currentParams(),
      })
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
                {dirty ? ' — edited' : ''} — edit any value for this run.
              </span>
              {dirty && (
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
                    onClick={() => seedFrom(selected)}
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
                  value={symbolsText}
                  onChange={(e) => setSymbolsText(e.target.value)}
                />
              </div>
              <div className="config-row">
                <span className="config-key">Initial Investment</span>
                <input
                  type="number"
                  style={{ width: 160, margin: 0 }}
                  value={capital}
                  onChange={(e) => setCapital(e.target.value)}
                />
              </div>
              {Object.keys(selected.params).map((key) => (
                <div className="config-row" key={key}>
                  <span className="config-key">{key}</span>
                  <input
                    type="number"
                    style={{ width: 160, margin: 0 }}
                    value={params[key] ?? ''}
                    onChange={(e) => setParams((prev) => ({ ...prev, [key]: e.target.value }))}
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
