import { useEffect, useState } from 'react'
import type { StrategyInfo } from '../types'
import { seedParamValues } from '../components/backtest/ParamInputs'

/**
 * Loads the available strategies from a fetcher, tracks the selected one,
 * and keeps the scalar parameter inputs seeded with the selection's defaults.
 * Shared by the single-symbol and portfolio backtest pages.
 */
export function useStrategySelection(fetcher: () => Promise<StrategyInfo[]>) {
  const [strategies, setStrategies] = useState<StrategyInfo[]>([])
  const [strategy, setStrategy] = useState('')
  const [paramValues, setParamValues] = useState<Record<string, string>>({})

  const selected = strategies.find((s) => s.name === strategy)

  useEffect(() => {
    fetcher()
      .then((list) => {
        setStrategies(list)
        if (list.length) setStrategy(list[0].name)
      })
      .catch(() => setStrategies([]))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setParamValues(seedParamValues(selected))
  }, [strategy, strategies]) // eslint-disable-line react-hooks/exhaustive-deps

  return { strategies, strategy, setStrategy, selected, paramValues, setParamValues }
}
