import { useEffect, useState } from 'react'
import { explainBacktest } from '../../api'
import { AiVerdictCard } from '../common/AiVerdictCard'
import type { Analytics, BacktestStatistics, Benchmark, DailyResult, ReportMeta } from '../../types'
import {
  DrawdownPeriods,
  MonthlyHeatmap,
  ReturnDistribution,
  RiskRatios,
  RollingSharpe,
  TradeStats,
} from './AnalyticsPanel'
import { DailyPnlChart, DrawdownChart, EquityChart } from './BacktestCharts'
import { BacktestMetricsTable } from './BacktestMetricsTable'
import { BacktestReport } from './BacktestReport'
import { BenchmarkCard } from './BenchmarkCard'
import { MonteCarloPanel } from './MonteCarloPanel'

type Tab = 'overview' | 'risk' | 'trades' | 'robustness'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'risk', label: 'Risk' },
  { id: 'trades', label: 'Trades' },
  { id: 'robustness', label: 'Robustness' },
]

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
  benchmarkStatus?: string
  analytics?: Analytics | null
  meta?: ReportMeta
}) {
  const [verdict, setVerdict] = useState('')
  const [verdictLoading, setVerdictLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')

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
      risk_ratios: analytics?.risk_ratios ?? null,
      benchmark: benchmark
        ? { symbol: benchmark.symbol, buy_and_hold_return_pct: benchmark.statistics.total_return, comparison: benchmark.comparison }
        : null,
      trade_stats: analytics?.trade_stats ?? null,
      worst_drawdown: analytics?.drawdown_periods?.[0] ?? null,
    })
      .then((r) => setVerdict(r.verdict))
      .catch(() => setVerdict(''))
      .finally(() => setVerdictLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statistics, benchmark, benchmarkStatus])

  const a = analytics

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

      {/* Always-visible AI verdict, then the tab bar. */}
      <AiVerdictCard loading={verdictLoading} text={verdict} />

      <div className="result-tabs no-print">
        {TABS.map((t) => (
          <button key={t.id} className={`result-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <EquityChart dailyResults={dailyResults} benchmark={benchmark?.daily_balances} />
          {benchmark && <BenchmarkCard benchmark={benchmark} />}
          {a && a.monthly_returns.length > 0 && (
            <div>
              <div style={{ color: '#94a3b8', fontSize: 13 }}>Monthly returns (%)</div>
              <MonthlyHeatmap rows={a.monthly_returns} />
            </div>
          )}
          <BacktestMetricsTable stats={statistics} />
        </div>
      )}

      {tab === 'risk' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {a && <RiskRatios analytics={a} benchmark={benchmark} />}
          <DrawdownChart dailyResults={dailyResults} />
          {a && a.drawdown_periods.length > 0 && <DrawdownPeriods periods={a.drawdown_periods} />}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {a?.return_distribution && <ReturnDistribution dist={a.return_distribution} />}
            {a && a.rolling_sharpe.length > 0 && <RollingSharpe data={a.rolling_sharpe} />}
          </div>
        </div>
      )}

      {tab === 'trades' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {a?.trade_stats ? <TradeStats ts={a.trade_stats} /> : (
            <div style={{ color: '#64748b', fontSize: 14 }}>No completed round-trip trades in this run.</div>
          )}
          <DailyPnlChart dailyResults={dailyResults} />
        </div>
      )}

      {tab === 'robustness' && dailyResults.length > 2 && (
        <MonteCarloPanel dailyResults={dailyResults} tradePnls={a?.trade_pnls ?? []} />
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
