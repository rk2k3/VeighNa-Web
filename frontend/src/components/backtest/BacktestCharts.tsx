import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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

export function EquityChart({
  dailyResults,
  benchmark,
}: {
  dailyResults: DailyResult[]
  benchmark?: { date: string; balance: number }[]
}) {
  const hasBenchmark = !!benchmark && benchmark.length > 0

  const equityData = useMemo(() => {
    if (!hasBenchmark) return dailyResults
    const byDate = new Map(benchmark!.map((p) => [p.date, p.balance]))
    return dailyResults.map((d) => ({ ...d, benchmark: byDate.get(String(d.date).slice(0, 10)) }))
  }, [dailyResults, benchmark, hasBenchmark])

  if (!dailyResults.length) return null

  return (
    <div>
      <h3>Equity Curve</h3>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={equityData}>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
          <XAxis dataKey="date" stroke={AXIS_COLOR} tick={{ fontSize: 11 }} minTickGap={40} />
          <YAxis stroke={AXIS_COLOR} tick={{ fontSize: 11 }} tickFormatter={formatMoney} width={80} domain={['auto', 'auto']} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatMoney(Number(v))} />
          {hasBenchmark && <Legend wrapperStyle={{ fontSize: 12 }} />}
          <Line type="monotone" dataKey="balance" name="Strategy" stroke="#2563eb" strokeWidth={2} dot={false} />
          {hasBenchmark && (
            <Line
              type="monotone"
              dataKey="benchmark"
              name="Benchmark"
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function DrawdownChart({ dailyResults }: { dailyResults: DailyResult[] }) {
  if (!dailyResults.length) return null
  return (
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
  )
}

export function DailyPnlChart({ dailyResults }: { dailyResults: DailyResult[] }) {
  if (!dailyResults.length) return null
  return (
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
  )
}
