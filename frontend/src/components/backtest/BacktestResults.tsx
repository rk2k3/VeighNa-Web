import type { BacktestStatistics, DailyResult } from '../../types'
import { BacktestCharts } from './BacktestCharts'
import { BacktestMetricsTable } from './BacktestMetricsTable'

/** The "Results" section shared by the single and portfolio backtest pages. */
export function BacktestResults({
  statistics,
  dailyResults,
}: {
  statistics: BacktestStatistics
  dailyResults: DailyResult[]
}) {
  return (
    <div className="section">
      <h2>Results</h2>
      <BacktestCharts dailyResults={dailyResults} />
      <BacktestMetricsTable stats={statistics} />
    </div>
  )
}
