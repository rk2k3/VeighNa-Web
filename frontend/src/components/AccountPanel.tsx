import type { Account } from '../types'
import { StatCard } from './StatCard'

interface AccountPanelProps {
  account: Account | null
  error: boolean
  connected: boolean
}

export function AccountPanel({ account, error, connected }: AccountPanelProps) {
  return (
    <div className="section">
      <h2>Account</h2>
      <div>
        {error ? (
          'Failed to load account'
        ) : account === null ? (
          'Loading...'
        ) : (
          <>
            <StatCard
              label="Portfolio Value"
              value={'$' + account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            />
            <StatCard
              label="Frozen"
              value={'$' + account.frozen.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            />
          </>
        )}
      </div>
      <div className="status" style={{ color: connected ? '#69f0ae' : '#ef5350' }}>
        {connected ? 'Connected to VeighNA server' : 'Disconnected'}
      </div>
    </div>
  )
}
