import { useEffect, useState } from 'react'
import { explainBacktest } from '../../api'
import { AiVerdictCard } from '../common/AiVerdictCard'
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
  const [verdict, setVerdict] = useState('')
  const [verdictLoading, setVerdictLoading] = useState(false)

  // Ask the AI for a plain-English verdict once the benchmark has settled, so
  // the market comparison makes it into the summary. Failures hide the card.
  useEffect(() => {
    if (benchmarkStatus === 'loading') return
    setVerdict('')
    setVerdictLoading(true)
    explainBacktest({
      strategy: meta?.title,
      period: meta?.period,
      statistics: {
        total_return_pct: statistics.total_return,
        annual_return_pct: statistics.annual_return,
        sharpe_ratio: statistics.sharpe_ratio,
        max_drawdown_pct: statistics.max_ddpercent,
        total_trades: statistics.total_trade_count,
      },
      benchmark: benchmark
        ? {
            symbol: benchmark.symbol,
            buy_and_hold_return_pct: benchmark.statistics.total_return,
            comparison: benchmark.comparison,
          }
        : null,
      trade_stats: analytics?.trade_stats ?? null,
      worst_drawdown: analytics?.drawdown_periods?.[0] ?? null,
    })
      .then((r) => setVerdict(r.verdict))
      .catch(() => setVerdict(''))
      .finally(() => setVerdictLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statistics, benchmark, benchmarkStatus])

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
      <AiVerdictCard loading={verdictLoading} text={verdict} />
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
        <BacktestReport
          statistics={statistics}
          dailyResults={dailyResults}
          benchmark={benchmark ?? null}
          meta={meta}
          verdict={verdict}
        />
      )}
    </div>
  )
}
