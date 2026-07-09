/** Table of resulting portfolio weights, as fractions keyed by vt_symbol. */
export function AllocationTable({ weights }: { weights: Record<string, number> }) {
  return (
    <>
      <h3>Allocation</h3>
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Weight</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(weights).map(([sym, w]) => (
            <tr key={sym}>
              <td>{sym}</td>
              <td>{(w * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
