import { useCallback, useEffect, useState } from 'react'
import type { SavedPortfolioStrategy, SavedPortfolioStrategyInput } from '../types'

/**
 * Editable, autofilled-from-saved config for a portfolio backtest run.
 *
 * The fields (capital, symbols, params) seed from the selected saved strategy
 * but can be overridden for a one-off run without touching the saved copy.
 * `dirty` reports whether the current edits differ from the saved values, and
 * `buildInput` assembles a full payload for saving those edits.
 */
export function useSavedPortfolioConfig(selected: SavedPortfolioStrategy | undefined) {
  const [capital, setCapital] = useState('')
  const [symbolsText, setSymbolsText] = useState('')
  const [params, setParams] = useState<Record<string, string>>({})

  // Reset the editable fields to a strategy's saved values.
  const seed = useCallback((s: SavedPortfolioStrategy) => {
    setCapital(String(s.capital))
    setSymbolsText(s.symbols.join(', '))
    setParams(Object.fromEntries(Object.entries(s.params).map(([k, v]) => [k, String(v)])))
  }, [])

  // Autofill whenever the selected strategy changes (or is re-fetched).
  useEffect(() => {
    if (selected) seed(selected)
  }, [selected, seed])

  // Parse the editable fields into the concrete values used to run or save.
  const currentSymbols = useCallback(
    () => symbolsText.split(',').map((s) => s.trim()).filter(Boolean),
    [symbolsText],
  )

  const currentCapital = useCallback(
    () => parseFloat(capital) || (selected?.capital ?? 0),
    [capital, selected],
  )

  const currentParams = useCallback((): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const key of Object.keys(selected?.params ?? {})) {
      const n = parseFloat(params[key])
      out[key] = Number.isNaN(n) ? selected!.params[key] : n
    }
    return out
  }, [params, selected])

  // Whether the editable config differs from the selected strategy's saved values.
  const dirty =
    !!selected &&
    (currentSymbols().join(',') !== selected.symbols.join(',') ||
      currentCapital() !== selected.capital ||
      Object.keys(selected.params).some((k) => currentParams()[k] !== selected.params[k]))

  // Build a full saved-strategy payload from the current edits.
  const buildInput = useCallback(
    (name: string): SavedPortfolioStrategyInput => ({
      name,
      goal: selected!.goal,
      goal_label: selected!.goal_label,
      strategy: selected!.strategy,
      strategy_label: selected!.strategy_label,
      universe_label: selected!.universe_label,
      symbols: currentSymbols(),
      exchange: selected!.exchange,
      capital: currentCapital(),
      params: currentParams(),
    }),
    [selected, currentSymbols, currentCapital, currentParams],
  )

  return {
    capital,
    setCapital,
    symbolsText,
    setSymbolsText,
    params,
    setParams,
    seed,
    currentSymbols,
    currentCapital,
    currentParams,
    dirty,
    buildInput,
  }
}
