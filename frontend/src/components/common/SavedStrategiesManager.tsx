import { useEffect, useState } from 'react'
import {
  deleteDslStrategy,
  deleteSavedStrategy,
  fetchDslStrategies,
  fetchSavedStrategies,
  updateDslStrategy,
  updateSavedStrategy,
} from '../../api'
import { ruleText } from '../../lib/dsl'
import type { SavedDslStrategy, SavedStrategy } from '../../types'

type Section = 'portfolio' | 'stock'

const btn = { fontSize: 13, padding: '4px 12px' }

/**
 * Edit/delete surface for saved strategies, shared by the Strategy Builder and
 * AI Strategy Builder tabs. `sections` controls which stores are shown; it
 * reloads whenever `refreshKey` changes (bump it after a save).
 * Portfolio rows allow editing name/goal/params; stock rows allow editing name.
 */
export function SavedStrategiesManager({
  refreshKey,
  sections = ['portfolio', 'stock'],
}: {
  refreshKey: number
  sections?: Section[]
}) {
  const [portfolios, setPortfolios] = useState<SavedStrategy[]>([])
  const [stocks, setStocks] = useState<SavedDslStrategy[]>([])

  // The row currently being edited, plus its draft fields.
  const [editId, setEditId] = useState('')
  const [draftName, setDraftName] = useState('')
  const [draftGoal, setDraftGoal] = useState('')
  const [draftSymbol, setDraftSymbol] = useState('')
  const [draftSymbols, setDraftSymbols] = useState('')
  const [draftParams, setDraftParams] = useState<Record<string, string>>({})

  const showPortfolio = sections.includes('portfolio')
  const showStock = sections.includes('stock')

  async function load() {
    try {
      const tasks: Promise<void>[] = []
      if (showPortfolio) tasks.push(fetchSavedStrategies().then(setPortfolios))
      if (showStock) tasks.push(fetchDslStrategies().then(setStocks))
      await Promise.all(tasks)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    load()
  }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  function startEditPortfolio(s: SavedStrategy) {
    setEditId(s.id)
    setDraftName(s.name)
    setDraftGoal(s.goal_label)
    setDraftSymbols(s.symbols.join(', '))
    setDraftParams(Object.fromEntries(Object.entries(s.params).map(([k, v]) => [k, String(v)])))
  }

  async function savePortfolio(s: SavedStrategy) {
    const params: Record<string, number> = {}
    for (const [k, v] of Object.entries(draftParams)) {
      const n = parseFloat(v)
      params[k] = Number.isNaN(n) ? s.params[k] : n
    }
    const symbols = draftSymbols.split(',').map((x) => x.trim()).filter(Boolean)
    await updateSavedStrategy(s.id, {
      name: draftName.trim() || s.name,
      goal: s.goal,
      goal_label: draftGoal.trim() || s.goal_label,
      strategy: s.strategy,
      strategy_label: s.strategy_label,
      universe_label: s.universe_label,
      symbols: symbols.length ? symbols : s.symbols,
      exchange: s.exchange,
      capital: s.capital,
      params,
    })
    setEditId('')
    await load()
  }

  function startEditStock(s: SavedDslStrategy) {
    setEditId(s.id)
    setDraftName(s.dsl.name)
    setDraftSymbol(s.dsl.symbol)
  }

  async function saveStock(s: SavedDslStrategy) {
    await updateDslStrategy(s.id, {
      ...s.dsl,
      name: draftName.trim() || s.dsl.name,
      symbol: draftSymbol.trim() || s.dsl.symbol,
    })
    setEditId('')
    await load()
  }

  async function removePortfolio(id: string) {
    await deleteSavedStrategy(id)
    await load()
  }

  async function removeStock(id: string) {
    await deleteDslStrategy(id)
    await load()
  }

  const nothing =
    (!showPortfolio || !portfolios.length) && (!showStock || !stocks.length)
  if (nothing) return null

  return (
    <div className="section">
      <h2>Manage Saved Strategies</h2>

      {showPortfolio && portfolios.length > 0 && (
        <>
          <h3>Portfolio Strategies</h3>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Goal</th>
                <th>Strategy</th>
                <th>Symbols</th>
                <th>Parameters</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {portfolios.map((s) =>
                editId === s.id ? (
                  <tr key={s.id}>
                    <td>
                      <input style={{ width: 150, margin: 0 }} value={draftName} onChange={(e) => setDraftName(e.target.value)} />
                    </td>
                    <td>
                      <input style={{ width: 190, margin: 0 }} value={draftGoal} onChange={(e) => setDraftGoal(e.target.value)} placeholder="Goal summary" />
                    </td>
                    <td>{s.strategy_label}</td>
                    <td>
                      <input
                        style={{ width: 220, margin: 0 }}
                        value={draftSymbols}
                        onChange={(e) => setDraftSymbols(e.target.value)}
                        placeholder="e.g. AAPL, MSFT"
                      />
                    </td>
                    <td>
                      {Object.keys(draftParams).map((k) => (
                        <div key={k} style={{ marginBottom: 4 }}>
                          <span className="config-key" style={{ marginRight: 6 }}>{k}</span>
                          <input
                            type="number"
                            style={{ width: 90, margin: 0 }}
                            value={draftParams[k]}
                            onChange={(e) => setDraftParams((p) => ({ ...p, [k]: e.target.value }))}
                          />
                        </div>
                      ))}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button style={btn} onClick={() => savePortfolio(s)}>Save</button>
                      <button className="secondary" style={btn} onClick={() => setEditId('')}>Cancel</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td style={{ color: '#94a3b8' }}>{s.goal_label}</td>
                    <td>{s.strategy_label}</td>
                    <td style={{ color: '#94a3b8', fontSize: 13 }}>{s.symbols.join(', ')}</td>
                    <td style={{ color: '#94a3b8', fontSize: 13 }}>
                      {Object.entries(s.params).map(([k, v]) => `${k}=${v}`).join(', ')}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button style={btn} onClick={() => startEditPortfolio(s)}>Edit</button>
                      <button className="danger" onClick={() => removePortfolio(s.id)}>Delete</button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </>
      )}

      {showStock && stocks.length > 0 && (
        <>
          <h3 style={{ marginTop: 16 }}>Single-Stock Strategies</h3>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Symbol</th>
                <th>Rules</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((s) =>
                editId === s.id ? (
                  <tr key={s.id}>
                    <td>
                      <input style={{ width: 150, margin: 0 }} value={draftName} onChange={(e) => setDraftName(e.target.value)} />
                    </td>
                    <td>
                      <input style={{ width: 90, margin: 0 }} value={draftSymbol} onChange={(e) => setDraftSymbol(e.target.value)} />
                    </td>
                    <td style={{ color: '#94a3b8', fontSize: 13 }}>{ruleText(s.dsl.entry)} → {ruleText(s.dsl.exit)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button style={btn} onClick={() => saveStock(s)}>Save</button>
                      <button className="secondary" style={btn} onClick={() => setEditId('')}>Cancel</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id}>
                    <td>{s.dsl.name}</td>
                    <td>{s.dsl.symbol}</td>
                    <td style={{ color: '#94a3b8', fontSize: 13 }}>{ruleText(s.dsl.entry)} → {ruleText(s.dsl.exit)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button style={btn} onClick={() => startEditStock(s)}>Edit</button>
                      <button className="danger" onClick={() => removeStock(s.id)}>Delete</button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
