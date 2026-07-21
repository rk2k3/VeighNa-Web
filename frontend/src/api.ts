import type { Account, BacktestResult, Direction, Dsl, OptimizeResult, OptimizeRunRecord, OptimizeRunSummary, PortfolioBacktestResult, PortfolioChoice, Position, SavedStockStrategy, SavedPortfolioStrategy, SavedPortfolioStrategyInput, SensitivityResult, SymbolInfo, WalkForwardResult } from './types'

export const API = import.meta.env.VITE_API_URL ?? ''

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText
    try {
      const data = await res.json()
      if (data.detail) detail = String(data.detail)
    } catch {
      // non-JSON error body; keep statusText
    }
    throw new Error(detail)
  }
  return res.json()
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseResponse<T>(res)
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(API + path)
  return parseResponse<T>(res)
}

async function putJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(API + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseResponse<T>(res)
}

async function deleteJSON<T>(path: string): Promise<T> {
  const res = await fetch(API + path, { method: 'DELETE' })
  return parseResponse<T>(res)
}

export function fetchAccount() {
  return getJSON<Account>('/account')
}

export function fetchPositions() {
  return getJSON<Position[]>('/positions')
}

export function fetchSymbols() {
  return getJSON<SymbolInfo[]>('/symbols')
}

export function subscribeSymbol(symbol: string, exchange: string) {
  return postJSON<{ status: string }>('/subscribe', { symbol, exchange })
}

export function placeOrder(params: {
  symbol: string
  direction: Direction
  price: number
  volume: number
}) {
  return postJSON<{ vt_orderid: string }>('/order', { ...params, exchange: 'NASDAQ' })
}

export function runStockBacktest(params: {
  symbol: string
  exchange: string
  start: string
  end: string
  strategy: string
  capital: number
  params: Record<string, unknown>
}) {
  return postJSON<BacktestResult>('/stock_backtest', params)
}

export function runPortfolioBacktest(params: {
  symbols: string[]
  exchange: string
  start: string
  end: string
  capital: number
  strategy: string
  params: Record<string, unknown>
}) {
  return postJSON<PortfolioBacktestResult>('/portfolio_backtest', params)
}

export function runOptimization(params: {
  kind: 'stock' | 'portfolio'
  strategy_id: string
  start: string
  split: string
  end: string
  n_trials: number
  target: string
  seed: number
}) {
  return postJSON<OptimizeResult>('/optimize', params)
}

export function runWalkForward(params: {
  kind: 'stock' | 'portfolio'
  strategy_id: string
  start: string
  end: string
  n_windows: number
  train_windows: number
  n_trials: number
  target: string
  seed: number
}) {
  return postJSON<WalkForwardResult>('/optimize/walk_forward', params)
}

export function fetchOptimizeRuns() {
  return getJSON<OptimizeRunSummary[]>('/optimize/runs')
}

export function fetchOptimizeRun(id: string) {
  return getJSON<OptimizeRunRecord>(`/optimize/runs/${id}`)
}

export function deleteOptimizeRun(id: string) {
  return deleteJSON<{ status: string }>(`/optimize/runs/${id}`)
}

export function clearOptimizeRuns() {
  return deleteJSON<{ deleted: number }>('/optimize/runs')
}

export function runSensitivity(req: {
  kind: 'stock' | 'portfolio'
  strategy_id: string
  start: string
  split: string
  end: string
  params: Record<string, number>
  target: string
  steps?: number
}) {
  return postJSON<SensitivityResult>('/optimize/sensitivity', req)
}

// --- Saved portfolio strategies ---

export function fetchSavedPortfolioStrategies() {
  return getJSON<SavedPortfolioStrategy[]>('/saved_portfolio_strategies')
}

export function createSavedPortfolioStrategy(strategy: SavedPortfolioStrategyInput) {
  return postJSON<SavedPortfolioStrategy>('/saved_portfolio_strategies', strategy)
}

export function updateSavedPortfolioStrategy(id: string, strategy: SavedPortfolioStrategyInput) {
  return putJSON<SavedPortfolioStrategy>(`/saved_portfolio_strategies/${id}`, strategy)
}

export function deleteSavedPortfolioStrategy(id: string) {
  return deleteJSON<{ status: string }>(`/saved_portfolio_strategies/${id}`)
}

// --- AI generation ---

export function generateStockStrategy(params: {
  description: string
  symbol?: string
  exchange?: string
}) {
  return postJSON<{ dsl: Dsl }>('/generate_stock_strategy', params)
}

export function generatePortfolioStrategy(params: {
  description: string
  symbols: string[]
  exchange: string
}) {
  return postJSON<PortfolioChoice>('/generate_portfolio_strategy', params)
}

// --- Saved stock strategies ---

export function fetchSavedStockStrategies() {
  return getJSON<SavedStockStrategy[]>('/saved_stock_strategies')
}

export function createSavedStockStrategy(dsl: Dsl) {
  return postJSON<SavedStockStrategy>('/saved_stock_strategies', dsl)
}

export function updateSavedStockStrategy(id: string, dsl: Dsl) {
  return putJSON<SavedStockStrategy>(`/saved_stock_strategies/${id}`, dsl)
}

export function deleteSavedStockStrategy(id: string) {
  return deleteJSON<{ status: string }>(`/saved_stock_strategies/${id}`)
}
