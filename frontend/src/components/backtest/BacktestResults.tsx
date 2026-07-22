import type { Analytics, BacktestStatistics, Benchmark, DailyResult, ReportMeta } from '../../types'
import { AnalyticsPanel } from './AnalyticsPanel'
import { BacktestCharts } from './BacktestCharts'
import { BacktestMetricsTable } from './BacktestMetricsTable'
import { BacktestReport } from './BacktestReport'
import { BenchmarkCard } from './BenchmarkCard'
import { MonteCarloPanel } from './MonteCarloPanel'

/** The "Results" section shared by the single and portfolio backtest pages. */
export function BacktestResults({
  statistics,
  dailyResults,
  benchmark,
  benchmarkStatus,
  analytics,
  meta,
}: {
  statistics: BacktestStatistics
  dailyResults: DailyResult[]
  benchmark?: Benchmark | null
  benchmarkStatus?: string // 'loading' | '' | an error message
  analytics?: Analytics | null
  meta?: ReportMeta
}) {
  return (
    <div className="section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Results</h2>
        {meta && (
          <button className="no-print" style={{ fontSize: 13, padding: '4px 12px' }} onClick={() => window.print()}>
            📄 Export Report
          </button>
        )}
      </div>
      <BacktestCharts dailyResults={dailyResults} benchmark={benchmark?.daily_balances} />
      {benchmark ? (
        <BenchmarkCard benchmark={benchmark} />
      ) : benchmarkStatus === 'loading' ? (
        <p className="no-print" style={{ color: '#64748b', fontSize: 13 }}>Loading benchmark…</p>
      ) : benchmarkStatus ? (
        <p className="no-print" style={{ color: '#f59e0b', fontSize: 13 }}>
          Benchmark unavailable: {benchmarkStatus}
        </p>
      ) : null}
      <BacktestMetricsTable stats={statistics} />
      {analytics && <AnalyticsPanel analytics={analytics} />}
      {dailyResults.length > 2 && (
        <MonteCarloPanel dailyResults={dailyResults} tradePnls={analytics?.trade_pnls ?? []} />
      )}
      {meta && (
        <BacktestReport statistics={statistics} dailyResults={dailyResults} benchmark={benchmark ?? null} meta={meta} />
      )}
    </div>
  )
}
