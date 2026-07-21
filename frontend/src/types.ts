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

export type PageName = 'builder' | 'ai' | 'portfolio' | 'backtest' | 'optimize' | 'paper'

// --- AI / DSL strategies ---

export interface DslOperand {
  indicator: 'CLOSE' | 'RSI' | 'SMA' | 'EMA' | 'ATR'
  period: number | null
}

export interface DslCondition {
  left: DslOperand
  operator: '<' | '>' | '<=' | '>=' | 'crosses_above' | 'crosses_below'
  right: number | DslOperand
}

export interface DslRule {
  conditions: DslCondition[]
  logic: 'AND' | 'OR'
}

export interface DslRisk {
  stop_loss_pct: number | null
  take_profit_pct: number | null
}

export interface Dsl {
  name: string
  symbol: string
  exchange: string
  direction: 'long' | 'short'
  entry: DslRule
  exit: DslRule
  risk: DslRisk
  position_pct: number
}

export interface SavedStockStrategy {
  id: string
  created_at: string
  dsl: Dsl
}

/** AI-chosen portfolio algorithm + tuned parameters (before the user saves it). */
export interface PortfolioChoice {
  name: string
  strategy: string
  strategy_label: string
  params: Record<string, number>
  rationale: string
}

/** A user-created strategy produced by the Strategy Builder questionnaire. */
export interface SavedPortfolioStrategy {
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
export type SavedPortfolioStrategyInput = Omit<SavedPortfolioStrategy, 'id' | 'created_at'>

export interface OptimizeMetrics {
  sharpe_ratio: number
  total_return: number
  annual_return: number
  max_ddpercent: number
  total_trade_count: number
}

export interface OptimizeRow {
  params: Record<string, number>
  in_sample: OptimizeMetrics
  out_sample: OptimizeMetrics
}

/** The auto-picked robust parameter set (selected in-sample only). */
export interface OptimizeRecommendation {
  index: number // row index into `trials` (the in-sample ranking)
  params: Record<string, number>
  in_sample: OptimizeMetrics
  out_sample: OptimizeMetrics
  robustness_score: number
  oos_pass: boolean
  reasons: string[]
}

export interface OptimizeResult {
  kind: 'stock' | 'portfolio'
  target: string
  param_names: string[]
  in_sample_period: { start: string; end: string }
  out_sample_period: { start: string; end: string }
  baseline: OptimizeRow | null
  recommendation: OptimizeRecommendation | null
  trials: OptimizeRow[]
}

export interface SensitivityPoint {
  value: number
  metric: number
}

export interface SensitivityCurve {
  name: string
  current: number
  points: SensitivityPoint[]
}

export interface SensitivityResult {
  target: string
  candidate: {
    params: Record<string, number>
    in_sample: OptimizeMetrics
    out_sample: OptimizeMetrics
  }
  curves: SensitivityCurve[]
}
