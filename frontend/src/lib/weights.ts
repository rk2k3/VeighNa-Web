// Symbol / weight helpers shared by the portfolio form.

export function parseSymbols(input: string): string[] {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

// "AAPL" -> "AAPL.NASDAQ" using the default; "SPY.ARCA" is left as-is.
export function toVtSymbol(entry: string, defaultExchange: string): string {
  const t = entry.trim()
  return t.includes('.') ? t : `${t}.${defaultExchange}`
}

export function totalPercent(symbols: string[], pctValues: Record<string, string>): number {
  return symbols.reduce((sum, s) => sum + (parseFloat(pctValues[s]) || 0), 0)
}

export function equalPercents(symbols: string[]): Record<string, string> {
  const equal = symbols.length ? 100 / symbols.length : 0
  return Object.fromEntries(symbols.map((s) => [s, equal.toFixed(2)]))
}

// Normalize entered percentages into fractions summing to 1, keyed by vt_symbol.
export function normalizeWeights(
  symbols: string[],
  pctValues: Record<string, string>,
  defaultExchange: string,
): Record<string, number> {
  const pcts = symbols.map((s) => parseFloat(pctValues[s]) || 0)
  const total = pcts.reduce((a, b) => a + b, 0)
  const out: Record<string, number> = {}
  symbols.forEach((s, i) => {
    out[toVtSymbol(s, defaultExchange)] = total > 0 ? pcts[i] / total : 1 / symbols.length
  })
  return out
}
