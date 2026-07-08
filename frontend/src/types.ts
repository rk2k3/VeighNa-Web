export interface Account {
  connected: boolean
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
  [key: string]: string | number | undefined
}

export interface DailyResult {
  date: string
  balance: number
  drawdown: number
  ddpercent: number
  net_pnl: number
  [key: string]: string | number | undefined
}

export interface BacktestResult {
  statistics: BacktestStatistics
  daily_results: DailyResult[]
}

export interface PortfolioBacktestResult {
  statistics: BacktestStatistics
  daily_results: DailyResult[]
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
