export interface Account {
  balance: number
  frozen: number
}

export interface Position {
  symbol: string
  direction: string
  volume: number
  price: number
  pnl: number
}

export interface BacktestStatistics {
  total_return: string | number
  annual_return: string | number
  sharpe_ratio: string | number
  max_ddpercent: string | number
  total_trade_count: number
  end_balance: string | number
}

export interface BacktestResult {
  statistics: BacktestStatistics
}

export interface PortfolioBacktestResult {
  statistics: BacktestStatistics
  weights: Record<string, number>
  detail?: string
}

export interface SymbolInfo {
  symbol: string
  exchange: string
  count: number
}

export interface TickMessage {
  type: 'tick'
  symbol: string
  price: number
  bid: number
  ask: number
}

export interface PositionMessage {
  type: 'position'
}

export type WsMessage = TickMessage | PositionMessage

export type Direction = 'Long' | 'Short'

export type PageName = 'backtest' | 'paper' | 'portfolio'
