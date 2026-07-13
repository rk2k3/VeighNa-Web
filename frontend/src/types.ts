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

export interface StrategyParam {
  name: string
  default: unknown
  type: 'int' | 'float' | 'dict' | 'bool' | 'str'
}

export interface StrategyInfo {
  name: string
  class_name: string
  parameters: StrategyParam[]
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

export type PageName = 'builder' | 'portfolio' | 'backtest' | 'paper'

/** A user-created strategy produced by the Strategy Builder questionnaire. */
export interface SavedStrategy {
  id: string
  created_at: string
  name: string
  goal: string
  goal_label: string
  strategy: string
  strategy_label: string
  universe_label: string
  symbols: string[]
  exchange: string
  capital: number
  params: Record<string, number>
}

/** Fields sent when saving a strategy (server assigns id + created_at). */
export type SavedStrategyInput = Omit<SavedStrategy, 'id' | 'created_at'>
