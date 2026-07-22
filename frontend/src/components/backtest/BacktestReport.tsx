import { createPortal } from 'react-dom'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { BacktestStatistics, Benchmark, DailyResult, ReportMeta } from '../../types'

// Light-themed colours so the printed PDF reads on white paper.
const INK = '#0f172a'
const MUTED = '#475569'
const GRID = '#e2e8f0'

function num(v: string | number | undefined): number {
  return parseFloat(String(v ?? 0))
}

function money(v: number) {
  return '$' + v.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${GRID}` }}>
      <span style={{ color: MUTED, fontSize: 12 }}>{label}</span>
      <span style={{ color: INK, fontSize: 12, fontWeight: strong ? 700 : 500 }}>{value}</span>
    </div>
  )
}

/**
 * A print/PDF-oriented backtest report. Rendered off-screen (see `.report-holder`
 * in App.css) so its charts get real dimensions; a print stylesheet reveals only
 * this element, and the user's "Export Report" button calls window.print().
 */
export function BacktestReport({
  statistics,
  dailyResults,
  benchmark,
  meta,
}: {
  statistics: BacktestStatistics
  dailyResults: DailyResult[]
  benchmark: Benchmark | null
  meta: ReportMeta
}) {
  const hasBench = !!benchmark && benchmark.daily_balances.length > 0
  const byDate = new Map((benchmark?.daily_balances ?? []).map((p) => [p.date, p.balance]))
  const equityData = dailyResults.map((d) => ({
    date: String(d.date).slice(0, 10),
    balance: d.balance,
    benchmark: hasBench ? byDate.get(String(d.date).slice(0, 10)) : undefined,
  }))
  const totalReturn = num(statistics.total_return)
  const c = benchmark?.comparison

  return createPortal(
    <div className="report-holder">
      {/* Header */}
      <div style={{ borderBottom: `2px solid ${INK}`, paddingBottom: 10, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: INK }}>Strategy Lab</div>
          <div style={{ fontSize: 12, color: MUTED }}>Backtest Report</div>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: INK, marginTop: 8 }}>{meta.title}</div>
        {meta.subtitle && <div style={{ fontSize: 13, color: MUTED }}>{meta.subtitle}</div>}
        <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>
          Period {meta.period.start} → {meta.period.end} · Starting capital {money(meta.capital)} · Generated{' '}
          {new Date().toLocaleString()}
        </div>
      </div>

      {/* Two columns: strategy stats + benchmark */}
      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 4 }}>Performance</div>
          <Row label="Total return" value={`${totalReturn.toFixed(2)}%`} strong />
          <Row label="Annual return" value={`${num(statistics.annual_return).toFixed(2)}%`} />
          <Row label="Sharpe ratio" value={num(statistics.sharpe_ratio).toFixed(2)} />
          <Row label="Max drawdown" value={`${num(statistics.max_ddpercent).toFixed(2)}%`} />
          <Row label="Total trades" value={String(statistics.total_trade_count ?? '—')} />
          <Row label="End balance" value={money(num(statistics.end_balance))} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 4 }}>
            Vs. benchmark {benchmark ? `(${benchmark.symbol})` : ''}
          </div>
          {hasBench ? (
            <>
              <Row label="Benchmark return" value={`${benchmark!.statistics.total_return.toFixed(2)}%`} />
              {c && <Row label="Excess return" value={`${c.excess_return >= 0 ? '+' : ''}${c.excess_return.toFixed(2)}%`} strong />}
              {c && <Row label="Alpha (annual)" value={`${c.alpha.toFixed(2)}%`} />}
              {c && <Row label="Beta" value={c.beta.toFixed(2)} />}
              {c && <Row label="Correlation" value={c.correlation.toFixed(2)} />}
            </>
          ) : (
            <div style={{ fontSize: 12, color: MUTED }}>No benchmark data.</div>
          )}
        </div>
      </div>

      {/* Equity curve */}
      <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginTop: 16, marginBottom: 4 }}>Equity curve</div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={equityData}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" stroke={MUTED} tick={{ fontSize: 10, fill: MUTED }} minTickGap={40} />
          <YAxis stroke={MUTED} tick={{ fontSize: 10, fill: MUTED }} tickFormatter={money} width={70} domain={['auto', 'auto']} />
          <Tooltip formatter={(v) => money(Number(v))} />
          {hasBench && <Legend wrapperStyle={{ fontSize: 11 }} />}
          <Line type="monotone" dataKey="balance" name="Strategy" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} />
          {hasBench && (
            <Line type="monotone" dataKey="benchmark" name="Benchmark" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
          )}
        </LineChart>
      </ResponsiveContainer>

      {/* Drawdown */}
      <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginTop: 12, marginBottom: 4 }}>Drawdown</div>
      <ResponsiveContainer width="100%" height={150}>
        <AreaChart data={dailyResults}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="date" stroke={MUTED} tick={{ fontSize: 10, fill: MUTED }} minTickGap={40} />
          <YAxis stroke={MUTED} tick={{ fontSize: 10, fill: MUTED }} tickFormatter={(v) => v + '%'} width={50} />
          <Tooltip formatter={(v) => Number(v).toFixed(2) + '%'} />
          <Area type="monotone" dataKey="ddpercent" name="Drawdown" stroke="#dc2626" fill="#dc2626" fillOpacity={0.15} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>

      <div style={{ fontSize: 10, color: MUTED, marginTop: 14, borderTop: `1px solid ${GRID}`, paddingTop: 8 }}>
        Backtest includes modelled commission and slippage. Past performance does not guarantee future results.
        For research use only.
      </div>
    </div>,
    document.body,
  )
}
