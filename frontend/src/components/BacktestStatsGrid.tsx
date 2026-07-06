import type { BacktestStatistics } from '../types'
import { StatCard } from './StatCard'

export function BacktestStatsGrid({ stats }: { stats: BacktestStatistics }) {
  const totalReturn = parseFloat(String(stats.total_return))
  return (
    <>
      <StatCard label="Total Return" value={totalReturn.toFixed(2) + '%'} colorClass={totalReturn >= 0 ? 'green' : 'red'} />
      <StatCard label="Annual Return" value={parseFloat(String(stats.annual_return)).toFixed(2) + '%'} />
      <StatCard label="Sharpe Ratio" value={parseFloat(String(stats.sharpe_ratio)).toFixed(2)} />
      <StatCard label="Max Drawdown" value={parseFloat(String(stats.max_ddpercent)).toFixed(2) + '%'} colorClass="red" />
      <StatCard label="Total Trades" value={String(stats.total_trade_count)} />
      <StatCard label="End Balance" value={'$' + parseFloat(String(stats.end_balance)).toLocaleString()} />
    </>
  )
}
