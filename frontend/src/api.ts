import type { Account, BacktestResult, Direction, PortfolioBacktestResult, Position, SymbolInfo } from './types'

export const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(API + path)
  return res.json()
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

export function runBacktest(params: {
  symbol: string
  exchange: string
  start: string
  end: string
  strategy: string
  capital: number
}) {
  return postJSON<BacktestResult>('/backtest', { ...params, params: {} })
}

export function runPortfolioBacktest(params: {
  symbols: string[]
  exchange: string
  start: string
  end: string
  capital: number
}) {
  return postJSON<PortfolioBacktestResult>('/portfolio_backtest', { ...params, weights: {} })
}
