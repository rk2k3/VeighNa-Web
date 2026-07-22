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
import type { Analytics } from '../../types'

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
  // Green for gains, red for losses; intensity saturates around ±8%.
  const a = Math.min(Math.abs(ret) / 8, 1) * 0.55 + (ret !== 0 ? 0.08 : 0)
  return ret >= 0 ? `rgba(16,185,129,${a})` : `rgba(244,63,94,${a})`
}

function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 110, border: '1px solid #1e293b', borderRadius: 8, padding: 10, background: '#0b1220' }}>
      <div style={{ color: '#64748b', fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? '#e2e8f0' }}>{value}</div>
    </div>
  )
}

function MonthlyHeatmap({ rows }: { rows: Analytics['monthly_returns'] }) {
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

/** The deeper analytics section: calendar, risk, and trade-level views. */
export function AnalyticsPanel({ analytics }: { analytics: Analytics }) {
  const ts = analytics.trade_stats
  const dist = analytics.return_distribution
  return (
    <div style={{ marginTop: 24 }}>
      <h3>Analytics</h3>

      {ts && (
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
      )}

      {analytics.monthly_returns.length > 0 && (
        <>
          <div style={{ color: '#94a3b8', fontSize: 13, margin: '16px 0 0' }}>Monthly returns (%)</div>
          <MonthlyHeatmap rows={analytics.monthly_returns} />
        </>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 16 }}>
        {analytics.rolling_sharpe.length > 0 && (
          <div>
            <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 4 }}>
              Rolling Sharpe <span style={{ color: '#64748b' }}>(63-day)</span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={analytics.rolling_sharpe}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke={AXIS} tick={{ fontSize: 10 }} minTickGap={40} />
                <YAxis stroke={AXIS} tick={{ fontSize: 10 }} width={40} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <ReferenceLine y={0} stroke="#334155" />
                <Line dataKey="sharpe" stroke="#a78bfa" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {dist && (
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
        )}
      </div>

      {analytics.drawdown_periods.length > 0 && (
        <>
          <div style={{ color: '#94a3b8', fontSize: 13, margin: '16px 0 0' }}>Worst drawdown periods</div>
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
                {analytics.drawdown_periods.map((p, i) => (
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
        </>
      )}
    </div>
  )
}
