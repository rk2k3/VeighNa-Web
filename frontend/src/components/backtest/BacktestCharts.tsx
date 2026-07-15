import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { DailyResult } from '../../types'

const AXIS_COLOR = '#64748b'
const GRID_COLOR = '#1e293b'
const TOOLTIP_STYLE = {
  backgroundColor: '#020617',
  border: '1px solid #334155',
  borderRadius: 8,
  color: '#e2e8f0',
}

function formatMoney(value: number) {
  return '$' + value.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

export function BacktestCharts({ dailyResults }: { dailyResults: DailyResult[] }) {
  if (!dailyResults.length) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 20 }}>
      <div>
        <h3>Equity Curve</h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={dailyResults}>
            <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke={AXIS_COLOR} tick={{ fontSize: 11 }} minTickGap={40} />
            <YAxis stroke={AXIS_COLOR} tick={{ fontSize: 11 }} tickFormatter={formatMoney} width={80} domain={['auto', 'auto']} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatMoney(Number(v))} />
            <Line type="monotone" dataKey="balance" name="Balance" stroke="#2563eb" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h3>Drawdown</h3>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={dailyResults}>
            <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke={AXIS_COLOR} tick={{ fontSize: 11 }} minTickGap={40} />
            <YAxis stroke={AXIS_COLOR} tick={{ fontSize: 11 }} tickFormatter={(v) => v + '%'} width={60} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => Number(v).toFixed(2) + '%'} />
            <Area type="monotone" dataKey="ddpercent" name="Drawdown" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.25} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h3>Daily P&amp;L</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dailyResults}>
            <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke={AXIS_COLOR} tick={{ fontSize: 11 }} minTickGap={40} />
            <YAxis stroke={AXIS_COLOR} tick={{ fontSize: 11 }} tickFormatter={formatMoney} width={80} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatMoney(Number(v))} />
            <Bar dataKey="net_pnl" name="Net P&L">
              {dailyResults.map((d, i) => (
                <Cell key={i} fill={d.net_pnl >= 0 ? '#10b981' : '#f43f5e'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
