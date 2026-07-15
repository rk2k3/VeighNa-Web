import type { Account } from '../../types'
import { StatCard } from './StatCard'

interface AccountPanelProps {
  account: Account | null
  error: boolean
  connected: boolean
}

export function AccountPanel({ account, error, connected }: AccountPanelProps) {
  const brokerConnected = connected && !error && account?.connected === true

  let statusText: string
  let statusColor: string
  if (!connected) {
    statusText = 'Disconnected'
    statusColor = '#f43f5e'
  } else if (!brokerConnected) {
    statusText = 'Not connected to broker (backtesting only)'
    statusColor = '#f59e0b'
  } else {
    statusText = 'Connected to broker account'
    statusColor = '#10b981'
  }

  return (
    <div className="section">
      <h2>Account</h2>
      {brokerConnected && account && (
        <div>
          <StatCard
            label="Portfolio Value"
            value={'$' + account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          />
          <StatCard
            label="Frozen"
            value={'$' + account.frozen.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          />
        </div>
      )}
      <div className="status" style={{ color: statusColor }}>
        {statusText}
      </div>
    </div>
  )
}
