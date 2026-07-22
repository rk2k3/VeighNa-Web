import type { Benchmark } from '../../types'

function Metric({ label, value, color, hint }: { label: string; value: string; color?: string; hint?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 130 }}>
      <div style={{ color: '#64748b', fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color ?? '#e2e8f0' }}>{value}</div>
      {hint && <div style={{ color: '#64748b', fontSize: 11 }}>{hint}</div>}
    </div>
  )
}

/** On-screen strategy-vs-benchmark comparison shown under the equity chart. */
export function BenchmarkCard({ benchmark }: { benchmark: Benchmark }) {
  const c = benchmark.comparison
  const bs = benchmark.statistics
  return (
    <div
      className="section"
      style={{ marginTop: 16, border: '1px solid #1e293b', background: '#0b1220' }}
    >
      <h3 style={{ marginTop: 0 }}>
        Vs. benchmark <span style={{ color: '#64748b', fontWeight: 400, fontSize: 14 }}>({benchmark.symbol}, buy &amp; hold)</span>
      </h3>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {c && (
          <Metric
            label="Excess return"
            value={`${c.excess_return >= 0 ? '+' : ''}${c.excess_return.toFixed(2)}%`}
            color={c.excess_return >= 0 ? '#10b981' : '#f43f5e'}
            hint="strategy − benchmark"
          />
        )}
        {c && <Metric label="Alpha (annual)" value={`${c.alpha.toFixed(2)}%`} color={c.alpha >= 0 ? '#10b981' : '#f43f5e'} hint="return beyond beta" />}
        {c && <Metric label="Beta" value={c.beta.toFixed(2)} hint="market sensitivity" />}
        {c && <Metric label="Correlation" value={c.correlation.toFixed(2)} hint="daily returns" />}
        <Metric label="Benchmark return" value={`${bs.total_return.toFixed(2)}%`} color={bs.total_return >= 0 ? '#10b981' : '#f43f5e'} hint={`Sharpe ${bs.sharpe_ratio.toFixed(2)}`} />
      </div>
      {!c && (
        <p style={{ color: '#f59e0b', fontSize: 13, marginBottom: 0, marginTop: 10 }}>
          Not enough overlapping days to compute comparison metrics.
        </p>
      )}
    </div>
  )
}
