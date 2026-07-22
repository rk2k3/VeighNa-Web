import { useMemo, useState } from 'react'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { runMonteCarlo } from '../../api'
import type { DailyResult, MonteCarloResult } from '../../types'

const AXIS = '#64748b'
const GRID = '#1e293b'
const TOOLTIP_STYLE = {
  backgroundColor: '#020617',
  border: '1px solid #334155',
  borderRadius: 8,
  color: '#e2e8f0',
}

const METHODS = [
  { value: 'block', label: 'Block bootstrap (daily returns)' },
  { value: 'bootstrap', label: 'Simple bootstrap (daily returns)' },
  { value: 'trades', label: 'Trade shuffle (round-trip P&Ls)' },
]

function money(v: number) {
  return '$' + v.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function Tile({ label, value, color, hint }: { label: string; value: string; color?: string; hint?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 150, border: '1px solid #1e293b', borderRadius: 8, padding: 10, background: '#0b1220' }}>
      <div style={{ color: '#64748b', fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? '#e2e8f0' }}>{value}</div>
      {hint && <div style={{ color: '#64748b', fontSize: 11 }}>{hint}</div>}
    </div>
  )
}

/** Monte Carlo stress test: resample the realised backtest into a fan of outcomes. */
export function MonteCarloPanel({
  dailyResults,
  tradePnls,
}: {
  dailyResults: DailyResult[]
  tradePnls: number[]
}) {
  const [method, setMethod] = useState('block')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<MonteCarloResult | null>(null)

  const curve = useMemo(
    () => dailyResults.map((d) => ({ date: String(d.date).slice(0, 10), balance: Number(d.balance) })),
    [dailyResults],
  )

  async function run() {
    setRunning(true)
    setError('')
    try {
      setResult(await runMonteCarlo({ strategy_curve: curve, method, n_sims: 1000, trade_pnls: tradePnls }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  // Merge the actual equity path onto the bands (daily methods only) so the
  // realised curve can be judged against the simulated fan.
  const chartData = useMemo(() => {
    if (!result) return []
    const actualByDate = new Map(curve.map((p) => [p.date, p.balance]))
    const daily = result.x_axis === 'date'
    return result.bands.map((b) => ({
      ...b,
      x: (daily ? b.date : b.i + 1) as string | number,
      actual: daily && b.date ? actualByDate.get(b.date) : undefined,
    }))
  }, [result, curve])

  const s = result?.stats

  return (
    <div style={{ marginTop: 24 }}>
      <h3>Monte Carlo stress test</h3>
      <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 4 }}>
        Resamples this backtest's own results 1,000 times to show the <em>range</em> of outcomes it
        was drawn from — not just the one path that happened. A strategy whose fan stays healthy is
        robust to luck; one carried by a lucky ordering is not.
      </p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={method} onChange={(e) => setMethod(e.target.value)}>
          {METHODS.map((m) => (
            <option key={m.value} value={m.value} disabled={m.value === 'trades' && tradePnls.length < 5}>
              {m.label}
              {m.value === 'trades' && tradePnls.length < 5 ? ' — needs 5+ trades' : ''}
            </option>
          ))}
        </select>
        <button onClick={run} disabled={running}>
          {running ? 'Simulating…' : 'Run 1,000 simulations'}
        </button>
      </div>
      {error && <div className="status" style={{ color: '#f43f5e' }}>{error}</div>}

      {result && s && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <Tile
              label="Median outcome"
              value={`${s.median_final_return >= 0 ? '+' : ''}${s.median_final_return.toFixed(1)}%`}
              color={s.median_final_return >= 0 ? '#10b981' : '#f43f5e'}
              hint={`90% of runs: ${s.p05_final_return.toFixed(1)}% to ${s.p95_final_return.toFixed(1)}%`}
            />
            <Tile
              label="Probability of loss"
              value={`${s.prob_loss.toFixed(1)}%`}
              color={s.prob_loss <= 20 ? '#10b981' : s.prob_loss <= 40 ? '#f59e0b' : '#f43f5e'}
              hint="runs ending below start"
            />
            <Tile
              label="Median max drawdown"
              value={`${s.median_max_drawdown.toFixed(1)}%`}
              color="#f43f5e"
              hint={`worst 5%: ${s.p05_max_drawdown.toFixed(1)}%`}
            />
            <Tile
              label="P(drawdown > 20%)"
              value={`${s.prob_dd_worse_20.toFixed(1)}%`}
              color={s.prob_dd_worse_20 <= 10 ? '#10b981' : s.prob_dd_worse_20 <= 30 ? '#f59e0b' : '#f43f5e'}
            />
          </div>

          <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 4 }}>
            Simulated equity fan{' '}
            <span style={{ color: '#64748b' }}>
              (shaded: 5–95% and 25–75% bands · {result.x_axis === 'date' ? 'blue: actual path' : 'x-axis: trade number'})
            </span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="x" stroke={AXIS} tick={{ fontSize: 10 }} minTickGap={40} />
              <YAxis stroke={AXIS} tick={{ fontSize: 10 }} tickFormatter={money} width={78} domain={['auto', 'auto']} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => (Array.isArray(v) ? v.map((n) => money(Number(n))).join(' – ') : money(Number(v)))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area dataKey={(d: { p05: number; p95: number }) => [d.p05, d.p95]} name="5–95%" stroke="none" fill="#10b981" fillOpacity={0.12} isAnimationActive={false} />
              <Area dataKey={(d: { p25: number; p75: number }) => [d.p25, d.p75]} name="25–75%" stroke="none" fill="#10b981" fillOpacity={0.2} isAnimationActive={false} />
              <Line dataKey="p50" name="Median" stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
              {result.x_axis === 'date' && (
                <Line dataKey="actual" name="Actual" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} />
              )}
              <ReferenceLine y={result.capital} stroke="#334155" strokeDasharray="4 3" />
            </ComposedChart>
          </ResponsiveContainer>

          <div style={{ color: '#94a3b8', fontSize: 13, margin: '12px 0 4px' }}>Distribution of final returns (%)</div>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={result.final_return_hist}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="x0" stroke={AXIS} tick={{ fontSize: 10 }} tickFormatter={(v) => Number(v).toFixed(0)} minTickGap={30} />
              <YAxis stroke={AXIS} tick={{ fontSize: 10 }} width={40} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(v) => `${Number(v).toFixed(1)}%`} formatter={(v) => [String(v), 'runs']} />
              <Bar dataKey="count">
                {result.final_return_hist.map((b, i) => (
                  <Cell key={i} fill={b.x1 <= 0 ? '#f43f5e' : '#10b981'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
