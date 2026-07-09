import { totalPercent } from '../lib/weights'

/** Per-symbol weight inputs (in %), with a running total and an equal-split reset. */
export function WeightsEditor({
  symbols,
  weights,
  onChange,
  onEqual,
}: {
  symbols: string[]
  weights: Record<string, string>
  onChange: (symbol: string, value: string) => void
  onEqual: () => void
}) {
  if (!symbols.length) return null
  const totalPct = totalPercent(symbols, weights)

  return (
    <div style={{ marginTop: 8 }}>
      <h3>
        Weights (%){' '}
        <button style={{ fontSize: 12, padding: '2px 8px' }} onClick={onEqual}>
          Equal
        </button>
      </h3>
      {symbols.map((s) => (
        <span key={s} style={{ display: 'inline-block', marginRight: 12, marginBottom: 8 }}>
          <label style={{ fontSize: 18, marginRight: 6 }}>{s}</label>
          <input
            style={{ width: 90 }}
            type="number"
            value={weights[s] ?? ''}
            onChange={(e) => onChange(s, e.target.value)}
          />
        </span>
      ))}
      <div className="status">
        Total: {totalPct.toFixed(1)}%
        {Math.abs(totalPct - 100) > 0.1 ? ' — will be normalized to 100%' : ''}
      </div>
    </div>
  )
}
