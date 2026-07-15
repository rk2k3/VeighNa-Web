import type { BacktestStatistics } from '../../types'

const LABELS: Record<string, string> = {
  start_date: 'Start Date',
  end_date: 'End Date',
  total_days: 'Total Days',
  profit_days: 'Profit Days',
  loss_days: 'Loss Days',
  capital: 'Starting Capital',
  end_balance: 'End Balance',
  max_drawdown: 'Max Drawdown',
  max_ddpercent: 'Max Drawdown %',
  max_drawdown_duration: 'Max Drawdown Duration',
  total_net_pnl: 'Total Net P&L',
  daily_net_pnl: 'Daily Net P&L',
  total_commission: 'Total Commission',
  daily_commission: 'Daily Commission',
  total_slippage: 'Total Slippage',
  daily_slippage: 'Daily Slippage',
  total_turnover: 'Total Turnover',
  daily_turnover: 'Daily Turnover',
  total_trade_count: 'Total Trades',
  daily_trade_count: 'Daily Trades',
  total_return: 'Total Return %',
  annual_return: 'Annual Return %',
  daily_return: 'Daily Return %',
  return_std: 'Return Std Dev',
  sharpe_ratio: 'Sharpe Ratio',
  return_drawdown_ratio: 'Return / Drawdown',
}

function prettifyKey(key: string) {
  return LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatValue(value: string | number | undefined) {
  if (value === undefined || value === null) return '-'
  const num = Number(value)
  if (Number.isNaN(num)) return String(value)
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

export function BacktestMetricsTable({ stats }: { stats: BacktestStatistics }) {
  const entries = Object.entries(stats)
  return (
    <div style={{ marginTop: 20 }}>
      <h3>Full Metrics</h3>
      <table>
        <tbody>
          {entries.map(([key, value]) => (
            <tr key={key}>
              <td style={{ color: '#94a3b8' }}>{prettifyKey(key)}</td>
              <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', Menlo, monospace" }}>
                {formatValue(value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
