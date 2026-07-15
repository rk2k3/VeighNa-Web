import type { SymbolInfo } from '../../types'

interface SymbolsTableProps {
  symbols: SymbolInfo[] | null
  onLoad: () => void
}

export function SymbolsTable({ symbols, onLoad }: SymbolsTableProps) {
  return (
    <div className="section">
      <h2>Available Symbols in Database</h2>
      <button onClick={onLoad}>Load Symbols</button>
      <table style={{ marginTop: 8 }}>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Exchange</th>
            <th>Bar Count</th>
          </tr>
        </thead>
        <tbody>
          {symbols === null ? (
            <tr>
              <td colSpan={3} style={{ textAlign: 'center', color: '#888' }}>
                Click Load Symbols
              </td>
            </tr>
          ) : symbols.length === 0 ? (
            <tr>
              <td colSpan={3} style={{ textAlign: 'center', color: '#888' }}>
                No symbols in database
              </td>
            </tr>
          ) : (
            symbols.map((s) => (
              <tr key={s.symbol + s.exchange}>
                <td>{s.symbol}</td>
                <td>{s.exchange}</td>
                <td>{s.count}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
