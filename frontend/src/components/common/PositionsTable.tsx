import type { Position } from '../../types'

interface PositionsTableProps {
  positions: Position[]
  onRefresh: () => void
}

export function PositionsTable({ positions, onRefresh }: PositionsTableProps) {
  return (
    <div className="section">
      <h2>Positions</h2>
      <button style={{ marginBottom: 8 }} onClick={onRefresh}>
        Refresh
      </button>
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Direction</th>
            <th>Volume</th>
            <th>Avg Price</th>
            <th>PnL</th>
          </tr>
        </thead>
        <tbody>
          {positions.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ textAlign: 'center', color: '#888' }}>
                No positions
              </td>
            </tr>
          ) : (
            positions.map((p, i) => (
              <tr key={p.symbol + i}>
                <td>{p.symbol}</td>
                <td>{p.direction}</td>
                <td>{p.volume}</td>
                <td>${p.price.toFixed(2)}</td>
                <td className={p.pnl >= 0 ? 'green' : 'red'}>${p.pnl.toFixed(2)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
