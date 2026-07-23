import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Analytics, Benchmark } from '../../types'

const AXIS = '#64748b'
const GRID = '#1e293b'
const TOOLTIP_STYLE = {
  backgroundColor: '#020617',
  border: '1px solid #334155',
  borderRadius: 8,
  color: '#e2e8f0',
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function heatColor(ret: number): string {
  const a = Math.min(Math.abs(ret) / 8, 1) * 0.55 + (ret !== 0 ? 0.08 : 0)
  return ret >= 0 ? `rgba(16,185,129,${a})` : `rgba(244,63,94,${a})`
}

export function Tile({ label, value, color, hint }: { label: string; value: string; color?: string; hint?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 120, border: '1px solid #1e293b', borderRadius: 8, padding: 10, background: '#0b1220' }}>
      <div style={{ color: '#64748b', fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? '#e2e8f0' }}>{value}</div>
      {hint && <div style={{ color: '#64748b', fontSize: 11 }}>{hint}</div>}
    </div>
  )
}

/** Downside-aware & benchmark-relative ratios institutions expect. */
export function RiskRatios({ analytics, benchmark }: { analytics: Analytics; benchmark?: Benchmark | null }) {
  const rr = analytics.risk_ratios
  const dist = analytics.return_distribution
  const c = benchmark?.comparison
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {rr?.sortino != null && <Tile label="Sortino ratio" value={rr.sortino.toFixed(2)} color={rr.sortino >= 1 ? '#10b981' : '#f59e0b'} hint="return / downside risk" />}
      {rr?.calmar != null && <Tile label="Calmar ratio" value={rr.calmar.toFixed(2)} color={rr.calmar >= 1 ? '#10b981' : '#f59e0b'} hint="return / max drawdown" />}
      {dist && <Tile label="Daily VaR (95%)" value={`${dist.var_95.toFixed(2)}%`} color="#f43f5e" hint="worst 1-in-20 day" />}
      {dist && <Tile label="Daily CVaR (95%)" value={`${dist.cvar_95.toFixed(2)}%`} color="#f43f5e" hint="avg of worst 5% days" />}
      {c && <Tile label="Information ratio" value={c.information_ratio.toFixed(2)} color={c.information_ratio >= 0.5 ? '#10b981' : '#f59e0b'} hint="excess / tracking error" />}
      {c && <Tile label="Tracking error" value={`${c.tracking_error.toFixed(1)}%`} hint="vs benchmark, annual" />}
      {c?.up_capture != null && <Tile label="Up capture" value={`${c.up_capture.toFixed(0)}%`} color={c.up_capture >= 100 ? '#10b981' : '#e2e8f0'} hint="of benchmark's up moves" />}
      {c?.down_capture != null && <Tile label="Down capture" value={`${c.down_capture.toFixed(0)}%`} color={c.down_capture <= 100 ? '#10b981' : '#f43f5e'} hint="lower is better" />}
    </div>
  )
}

export function TradeStats({ ts }: { ts: NonNullable<Analytics['trade_stats']> }) {
  return (
    <>
      <div style={{ color: '#94a3b8', fontSize: 13, margin: '8px 0 6px' }}>
        Trade statistics <span style={{ color: '#64748b' }}>({ts.count} completed round trips)</span>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Tile label="Win rate" value={`${ts.win_rate.toFixed(1)}%`} color={ts.win_rate >= 50 ? '#10b981' : '#f59e0b'} />
        <Tile label="Profit factor" value={ts.profit_factor == null ? '∞' : ts.profit_factor.toFixed(2)} color={(ts.profit_factor ?? 99) >= 1.5 ? '#10b981' : '#f59e0b'} />
        <Tile label="Expectancy / trade" value={`$${ts.expectancy.toLocaleString()}`} color={ts.expectancy >= 0 ? '#10b981' : '#f43f5e'} />
        <Tile label="Avg win / loss" value={`$${ts.avg_win.toLocaleString()} / $${Math.abs(ts.avg_loss).toLocaleString()}`} />
        <Tile label="Best / worst" value={`$${ts.best.toLocaleString()} / $${ts.worst.toLocaleString()}`} />
        <Tile label="Avg holding" value={`${ts.avg_holding_days.toFixed(1)} d`} />
      </div>
    </>
  )
}

export function MonthlyHeatmap({ rows }: { rows: Analytics['monthly_returns'] }) {
  const years = [...new Set(rows.map((r) => r.year))].sort()
  const cell = new Map(rows.map((r) => [`${r.year}-${r.month}`, r.return]))
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ marginTop: 8 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Year</th>
            {MONTHS.map((m) => (
              <th key={m} style={{ textAlign: 'right', fontSize: 12 }}>{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {years.map((y) => (
            <tr key={y}>
              <td style={{ fontWeight: 600 }}>{y}</td>
              {MONTHS.map((_, i) => {
                const v = cell.get(`${y}-${i + 1}`)
                return (
                  <td
                    key={i}
                    style={{
                      textAlign: 'right',
                      fontSize: 12,
                      background: v == null ? undefined : heatColor(v),
                      color: v == null ? '#334155' : '#f8fafc',
                    }}
                  >
                    {v == null ? '—' : v.toFixed(1)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function RollingSharpe({ data }: { data: Analytics['rolling_sharpe'] }) {
  if (!data.length) return null
  return (
    <div>
      <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 4 }}>
        Rolling Sharpe <span style={{ color: '#64748b' }}>(63-day)</span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
          <XAxis dataKey="date" stroke={AXIS} tick={{ fontSize: 10 }} minTickGap={40} />
          <YAxis stroke={AXIS} tick={{ fontSize: 10 }} width={40} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <ReferenceLine y={0} stroke="#334155" />
          <Line dataKey="sharpe" stroke="#a78bfa" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ReturnDistribution({ dist }: { dist: NonNullable<Analytics['return_distribution']> }) {
  return (
    <div>
      <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 4 }}>
        Daily return distribution{' '}
        <span style={{ color: '#64748b' }}>
          σ {dist.std.toFixed(2)}% · skew {dist.skew.toFixed(2)} · 5% VaR {dist.var_95.toFixed(2)}%
        </span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={dist.bins}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
          <XAxis dataKey="x0" stroke={AXIS} tick={{ fontSize: 10 }} tickFormatter={(v) => Number(v).toFixed(1)} minTickGap={30} />
          <YAxis stroke={AXIS} tick={{ fontSize: 10 }} width={40} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={(v) => `${Number(v).toFixed(2)}%`}
            formatter={(v) => [String(v), 'days']}
          />
          <Bar dataKey="count">
            {dist.bins.map((b, i) => (
              <Cell key={i} fill={b.x1 <= 0 ? '#f43f5e' : '#10b981'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function DrawdownPeriods({ periods }: { periods: Analytics['drawdown_periods'] }) {
  if (!periods.length) return null
  return (
    <div>
      <div style={{ color: '#94a3b8', fontSize: 13, margin: '4px 0 0' }}>Worst drawdown periods</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ marginTop: 6 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Peak</th>
              <th style={{ textAlign: 'left' }}>Trough</th>
              <th style={{ textAlign: 'left' }}>Recovered</th>
              <th style={{ textAlign: 'right' }}>Depth</th>
              <th style={{ textAlign: 'right' }}>Days</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p, i) => (
              <tr key={i}>
                <td>{p.start}</td>
                <td>{p.trough}</td>
                <td style={{ color: p.recovery ? undefined : '#f59e0b' }}>{p.recovery ?? 'not yet'}</td>
                <td style={{ textAlign: 'right', color: '#f43f5e', fontWeight: 600 }}>{p.depth.toFixed(2)}%</td>
                <td style={{ textAlign: 'right' }}>{p.days}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
