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
  analytics?: Analytics | null
}

export interface PortfolioBacktestResult {
  statistics: BacktestStatistics
  daily_results: DailyResult[]
  weights: Record<string, number>
  detail?: string
  analytics?: Analytics | null
}

// --- Post-run analytics (computed server-side from daily results + fills) ---

export interface HistogramBin {
  x0: number
  x1: number
  count: number
}

export interface Analytics {
  monthly_returns: { year: number; month: number; return: number }[]
  drawdown_periods: {
    start: string
    trough: string
    recovery: string | null
    depth: number
    days: number
  }[]
  return_distribution: {
    bins: HistogramBin[]
    mean: number
    std: number
    skew: number
    kurtosis: number
    var_95: number
    cvar_95: number
    best: number
    worst: number
  } | null
  risk_ratios: { sortino: number | null; calmar: number | null } | null
  rolling_sharpe: { date: string; sharpe: number }[]
  trade_stats: {
    count: number
    win_rate: number
    profit_factor: number | null
    avg_win: number
    avg_loss: number
    expectancy: number
    best: number
    worst: number
    avg_holding_days: number
  } | null
  round_trips: {
    symbol: string
    direction: 'long' | 'short'
    entry_date: string
    exit_date: string
    entry_price: number
    exit_price: number
    volume: number
    pnl: number
    return_pct: number
    holding_days: number
  }[]
  trade_pnls: number[]
}

// --- Monte Carlo stress test ---

export interface MonteCarloBand {
  i: number
  date?: string
  p05: number
  p25: number
  p50: number
  p75: number
  p95: number
}

export interface MonteCarloResult {
  method: string
  n_sims: number
  seed: number
  capital: number
  x_axis: string
  bands: MonteCarloBand[]
  final_return_hist: HistogramBin[]
  stats: {
    median_final_return: number
    p05_final_return: number
    p95_final_return: number
    prob_loss: number
    median_max_drawdown: number
    p05_max_drawdown: number
    prob_dd_worse_20: number
  }
}

export interface SymbolInfo {
  symbol: string
  exchange: string
  count: number
}

// --- Benchmark comparison ---

export interface BenchmarkComparison {
  excess_return: number
  beta: number
  alpha: number
  correlation: number
  tracking_error: number
  information_ratio: number
  up_capture: number | null
  down_capture: number | null
}

export interface Benchmark {
  symbol: string
  daily_balances: { date: string; balance: number }[]
  statistics: { total_return: number; annual_return: number; sharpe_ratio: number; max_ddpercent: number }
  comparison: BenchmarkComparison | null
}

/** Metadata for a printable backtest report. */
export interface ReportMeta {
  title: string
  subtitle?: string
  period: { start: string; end: string }
  capital: number
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

export type PageName = 'builder' | 'ai' | 'portfolio' | 'backtest' | 'compare' | 'optimize' | 'paper'

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

/** Overfitting statistics: PBO (CSCV, search-level) + Deflated Sharpe Ratio. */
export interface Overfitting {
  pbo?: number | null
  deflated_sharpe?: number | null
  dsr_basis?: 'recommended' | 'peak' // which config DSR was evaluated on
  selected_sharpe_daily?: number
  expected_max_sharpe_daily?: number
  n_configs?: number
  n_obs?: number
  note?: string
}

export interface OptimizeResult {
  kind: 'stock' | 'portfolio'
  target: string
  seed: number
  param_names: string[]
  in_sample_period: { start: string; end: string }
  out_sample_period: { start: string; end: string }
  baseline: OptimizeRow | null
  recommendation: OptimizeRecommendation | null
  overfitting: Overfitting | null
  trials: OptimizeRow[]
}

// --- Walk-forward validation ---

export interface WalkForwardStep {
  train_period: { start: string; end: string }
  test_period: { start: string; end: string }
  params: Record<string, number>
  train_metric: number | null
  test_metrics: OptimizeMetrics
}

export interface WalkForwardResult {
  kind: 'stock' | 'portfolio'
  target: string
  seed: number
  period: { start: string; end: string }
  n_windows: number
  train_windows: number
  param_names: string[]
  steps: WalkForwardStep[]
  equity_curve: { date: string; equity: number }[]
  walk_forward_efficiency: number | null
  avg_test_metric: number | null
  windows_positive: number
}

// --- Saved optimization run history (audit trail) ---

export interface OptimizeRunSummary {
  id: string
  created_at: string
  type: 'optimization' | 'walk_forward'
  kind: string
  strategy_name: string
  target: string
  seed: number
  period: { start?: string; end?: string; split?: string }
  n_trials?: number
  recommended_params?: Record<string, number> | null
  pbo?: number | null
  deflated_sharpe?: number | null
  walk_forward_efficiency?: number | null
  avg_test_metric?: number | null
  n_windows?: number
}

export interface OptimizeRunRecord {
  id: string
  created_at: string
  type: 'optimization' | 'walk_forward'
  kind: 'stock' | 'portfolio'
  strategy_id: string
  strategy_name: string
  request: Record<string, unknown>
  result: OptimizeResult | WalkForwardResult
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
