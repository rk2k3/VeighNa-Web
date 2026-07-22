import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  fetchBenchmark,
  fetchSavedPortfolioStrategies,
  fetchSavedStockStrategies,
  runPortfolioBacktest,
  runStockBacktest,
} from '../api'
import { defaultDates } from '../lib/dates'
import type { BacktestStatistics, SavedPortfolioStrategy, SavedStockStrategy } from '../types'

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#a78bfa', '#f43f5e', '#22d3ee', '#f472b6', '#84cc16']
const BENCH_COLOR = '#94a3b8'

type Series = {
  name: string
  kind: 'portfolio' | 'stock' | 'benchmark'
  stats: BacktestStatistics | null
  // growth of $1, keyed by date
  curve: { date: string; value: number }[]
}

function num(v: string | number | undefined): number {
  return parseFloat(String(v ?? 0))
}

/** Overlay multiple saved strategies (and SPY) over the same window. */
export function ComparePage() {
  const [portfolios, setPortfolios] = useState<SavedPortfolioStrategy[]>([])
  const [stocks, setStocks] = useState<SavedStockStrategy[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [includeSpy, setIncludeSpy] = useState(true)

  const dd = useMemo(() => defaultDates(), [])
  const [start, setStart] = useState(dd.start)
  const [end, setEnd] = useState(dd.end)

  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState('')
  const [series, setSeries] = useState<Series[]>([])

  useEffect(() => {
    Promise.all([
      fetchSavedPortfolioStrategies().then(setPortfolios).catch(() => setPortfolios([])),
      fetchSavedStockStrategies().then(setStocks).catch(() => setStocks([])),
    ]).finally(() => setLoading(false))
  }, [])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function normalize(daily: { date?: unknown; balance?: unknown }[]): Series['curve'] {
    const pts = daily
      .map((d) => ({ date: String(d.date).slice(0, 10), balance: Number(d.balance) }))
      .filter((d) => Number.isFinite(d.balance))
    const base = pts[0]?.balance
    if (!base) return []
    return pts.map((p) => ({ date: p.date, value: p.balance / base }))
  }

  async function handleRun() {
    const chosenPortfolios = portfolios.filter((s) => selected.has(s.id))
    const chosenStocks = stocks.filter((s) => selected.has(s.id))
    if (chosenPortfolios.length + chosenStocks.length === 0) return

    setRunning(true)
    setSeries([])
    const out: Series[] = []
    const total = chosenPortfolios.length + chosenStocks.length
    let done = 0

    // Run sequentially — each backtest is heavy, and the shared engine is not
    // built for concurrent runs.
    for (const s of chosenPortfolios) {
      setStatus(`Backtesting ${s.name}… (${++done}/${total})`)
      try {
        const r = await runPortfolioBacktest({
          symbols: s.symbols,
          exchange: s.exchange,
          start,
          end,
          capital: s.capital,
          strategy: s.strategy,
          params: s.params,
        })
        out.push({ name: s.name, kind: 'portfolio', stats: r.statistics, curve: normalize(r.daily_results ?? []) })
      } catch (e) {
        out.push({ name: `${s.name} (failed: ${(e as Error).message})`, kind: 'portfolio', stats: null, curve: [] })
      }
    }
    for (const s of chosenStocks) {
      setStatus(`Backtesting ${s.dsl.name}… (${++done}/${total})`)
      try {
        const r = await runStockBacktest({
          symbol: s.dsl.symbol,
          exchange: s.dsl.exchange,
          start,
          end,
          strategy: 'dsl_strategy',
          capital: 100000,
          params: { dsl: s.dsl },
        })
        out.push({ name: s.dsl.name, kind: 'stock', stats: r.statistics, curve: normalize(r.daily_results ?? []) })
      } catch (e) {
        out.push({ name: `${s.dsl.name} (failed: ${(e as Error).message})`, kind: 'stock', stats: null, curve: [] })
      }
    }

    if (includeSpy) {
      setStatus('Fetching SPY benchmark…')
      try {
        const b = await fetchBenchmark({ symbol: 'SPY', exchange: 'NASDAQ', start, end, capital: 100000, strategy_curve: [] })
        out.push({
          name: 'SPY (buy & hold)',
          kind: 'benchmark',
          stats: null,
          curve: b.daily_balances.map((p) => ({ date: p.date, value: p.balance / 100000 })),
        })
      } catch {
        // benchmark is optional here
      }
    }

    setSeries(out)
    setStatus(`Done — ${out.filter((s) => s.curve.length).length} curves.`)
    setRunning(false)
  }

  // Merge all curves into one recharts dataset keyed by date.
  const chartData = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>()
    for (const s of series) {
      for (const p of s.curve) {
        const row = byDate.get(p.date) ?? { date: p.date }
        row[s.name] = p.value
        byDate.set(p.date, row)
      }
    }
    return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  }, [series])

  const drawn = series.filter((s) => s.curve.length > 0)

  return (
    <div>
      <div className="section">
        <h2>Compare Strategies</h2>
        <p style={{ color: '#94a3b8', fontSize: 15, marginTop: 0 }}>
          Run several saved strategies over the same window and overlay their equity curves —
          normalized to growth of $1 so different capitals compare fairly.
        </p>

        {loading ? (
          <p style={{ color: '#64748b' }}>Loading saved strategies…</p>
        ) : portfolios.length + stocks.length === 0 ? (
          <p style={{ color: '#64748b' }}>
            No saved strategies yet. Create some on the <strong>Guided Builder</strong> or{' '}
            <strong>Strategy Builder</strong> tabs first.
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              {portfolios.length > 0 && (
                <div>
                  <label className="question-label">Portfolio strategies</label>
                  {portfolios.map((s) => (
                    <div key={s.id} style={{ marginBottom: 4 }}>
                      <label style={{ fontSize: 14, cursor: 'pointer' }}>
                        <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />{' '}
                        {s.name} <span style={{ color: '#64748b' }}>— {s.strategy_label}</span>
                      </label>
                    </div>
                  ))}
                </div>
              )}
              {stocks.length > 0 && (
                <div>
                  <label className="question-label">Single-asset strategies</label>
                  {stocks.map((s) => (
                    <div key={s.id} style={{ marginBottom: 4 }}>
                      <label style={{ fontSize: 14, cursor: 'pointer' }}>
                        <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />{' '}
                        {s.dsl.name} <span style={{ color: '#64748b' }}>— {s.dsl.symbol}</span>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: '#64748b', fontSize: 13, marginBottom: 4 }}>Period</div>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
              <label style={{ fontSize: 14, cursor: 'pointer', paddingBottom: 6 }}>
                <input type="checkbox" checked={includeSpy} onChange={(e) => setIncludeSpy(e.target.checked)} /> Include
                SPY benchmark
              </label>
              <button onClick={handleRun} disabled={running || selected.size === 0}>
                {running ? 'Running…' : `Compare ${selected.size || ''} ${selected.size === 1 ? 'strategy' : 'strategies'}`}
              </button>
            </div>
            {status && <div className="status">{status}</div>}
          </>
        )}
      </div>

      {drawn.length > 0 && (
        <div className="section">
          <h3 style={{ marginTop: 0 }}>Growth of $1</h3>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} minTickGap={40} />
              <YAxis
                stroke="#64748b"
                tick={{ fontSize: 11 }}
                width={50}
                domain={['auto', 'auto']}
                tickFormatter={(v) => Number(v).toFixed(2)}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#020617', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(v) => Number(v).toFixed(3)}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={1} stroke="#334155" strokeDasharray="4 3" />
              {drawn.map((s, i) => (
                <Line
                  key={s.name}
                  dataKey={s.name}
                  stroke={s.kind === 'benchmark' ? BENCH_COLOR : COLORS[i % COLORS.length]}
                  strokeWidth={s.kind === 'benchmark' ? 1.5 : 2}
                  strokeDasharray={s.kind === 'benchmark' ? '5 3' : undefined}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>

          <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Strategy</th>
                  <th style={{ textAlign: 'right' }}>Total Ret %</th>
                  <th style={{ textAlign: 'right' }}>Annual %</th>
                  <th style={{ textAlign: 'right' }}>Sharpe</th>
                  <th style={{ textAlign: 'right' }}>Max DD %</th>
                  <th style={{ textAlign: 'right' }}>Trades</th>
                </tr>
              </thead>
              <tbody>
                {drawn.map((s, i) => {
                  const finalV = s.curve[s.curve.length - 1]?.value
                  return (
                    <tr key={s.name}>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            marginRight: 8,
                            background: s.kind === 'benchmark' ? BENCH_COLOR : COLORS[i % COLORS.length],
                          }}
                        />
                        {s.name}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {s.stats ? num(s.stats.total_return).toFixed(2) : finalV ? ((finalV - 1) * 100).toFixed(2) : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>{s.stats ? num(s.stats.annual_return).toFixed(2) : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{s.stats ? num(s.stats.sharpe_ratio).toFixed(2) : '—'}</td>
                      <td style={{ textAlign: 'right', color: '#f43f5e' }}>
                        {s.stats ? num(s.stats.max_ddpercent).toFixed(2) : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>{s.stats ? s.stats.total_trade_count : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
