import type { Account, BacktestResult, Direction, PortfolioBacktestResult, Position, SavedStrategy, SavedStrategyInput, StrategyInfo, SymbolInfo } from './types'

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

export function fetchStrategies() {
  return getJSON<StrategyInfo[]>('/strategies')
}

export function runBacktest(params: {
  symbol: string
  exchange: string
  start: string
  end: string
  strategy: string
  capital: number
  params: Record<string, unknown>
}) {
  return postJSON<BacktestResult>('/backtest', params)
}

export function fetchPortfolioStrategies() {
  return getJSON<StrategyInfo[]>('/portfolio_strategies')
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

export function fetchSavedStrategies() {
  return getJSON<SavedStrategy[]>('/saved_strategies')
}

export function createSavedStrategy(strategy: SavedStrategyInput) {
  return postJSON<SavedStrategy>('/saved_strategies', strategy)
}

export function updateSavedStrategy(id: string, strategy: SavedStrategyInput) {
  return putJSON<SavedStrategy>(`/saved_strategies/${id}`, strategy)
}

export function deleteSavedStrategy(id: string) {
  return deleteJSON<{ status: string }>(`/saved_strategies/${id}`)
}
