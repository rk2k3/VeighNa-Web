/**
 * Deterministic questionnaire → strategy mapping.
 *
 * This is the single source of truth for the Strategy Builder. The user never
 * picks an algorithm directly: they choose a goal and answer questions, and
 * each answer maps to a concrete strategy parameter (or `capital`). There is
 * no recommendation logic — every mapping here is fixed.
 */

/** Module name of the mapped strategy in the backend `strategies/` folder. */
export type StrategyKey =
  | 'portfolio_mvo_strategy'
  | 'min_variance_strategy'
  | 'max_diversification_strategy'
  | 'inverse_volatility_strategy'

export interface QuestionOption {
  label: string
  value: number
}

export interface Question {
  /** The strategy param this answer maps to, or the special key `capital`. */
  param: string
  label: string
  help?: string
  kind: 'number' | 'select'
  /** For select questions. */
  options?: QuestionOption[]
  /** Default value: for `number`, the initial capital; for `select`, an option value. */
  default: number
}

export interface Goal {
  key: string
  emoji: string
  title: string
  description: string
  strategy: StrategyKey
  strategyLabel: string
  universeLabel: string
  symbols: string[]
  exchange: string
  questions: Question[]
}

// --- Reusable question definitions ---------------------------------------

const CAPITAL_QUESTION: Question = {
  param: 'capital',
  label: 'Initial Investment',
  help: 'How much capital to allocate to this strategy.',
  kind: 'number',
  default: 100000,
}

const MAX_ALLOCATION_QUESTION: Question = {
  param: 'w_max',
  label: 'Maximum Allocation Per Stock',
  help: 'Caps how much of the portfolio any single stock can hold.',
  kind: 'select',
  default: 0.3,
  options: [
    { label: '20%', value: 0.2 },
    { label: '30%', value: 0.3 },
    { label: '40%', value: 0.4 },
    { label: '60%', value: 0.6 },
  ],
}

const HISTORY_WINDOW_QUESTION: Question = {
  param: 'est_win',
  label: 'Historical Analysis Window',
  help: 'How much trailing history is used to estimate risk and returns.',
  kind: 'select',
  default: 42,
  options: [
    { label: '1 Month', value: 21 },
    { label: '2 Months', value: 42 },
    { label: '3 Months', value: 63 },
  ],
}

const REBALANCE_QUESTION: Question = {
  param: 'rebalance_days',
  label: 'Portfolio Rebalancing',
  help: 'How often the portfolio weights are recomputed.',
  kind: 'select',
  default: 21,
  options: [
    { label: 'Weekly', value: 5 },
    { label: 'Monthly', value: 21 },
    { label: 'Quarterly', value: 63 },
  ],
}

// --- The four investment goals -------------------------------------------

export const GOALS: Goal[] = [
  {
    key: 'grow',
    emoji: '🚀',
    title: 'Grow My Wealth',
    description:
      'Maximize long-term portfolio growth by accepting an appropriate level of risk.',
    strategy: 'portfolio_mvo_strategy',
    strategyLabel: 'Mean-Variance Optimization (MVO)',
    universeLabel: 'US Large-Cap Growth Stocks',
    symbols: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'AVGO', 'TSLA'],
    exchange: 'NASDAQ',
    questions: [
      CAPITAL_QUESTION,
      {
        param: 'gamma',
        label: 'Desired Growth Style',
        help: 'Higher risk aversion (Conservative) trades growth for stability.',
        kind: 'select',
        default: 5,
        options: [
          { label: 'Aggressive', value: 2 },
          { label: 'Balanced', value: 5 },
          { label: 'Conservative', value: 10 },
        ],
      },
      MAX_ALLOCATION_QUESTION,
      HISTORY_WINDOW_QUESTION,
      REBALANCE_QUESTION,
    ],
  },
  {
    key: 'protect',
    emoji: '🛡',
    title: 'Protect My Capital',
    description: 'Prioritize preserving your capital and minimizing potential losses.',
    strategy: 'min_variance_strategy',
    strategyLabel: 'Minimum Variance',
    universeLabel: 'US Defensive Stocks',
    symbols: ['JNJ', 'PG', 'KO', 'PEP', 'WMT', 'MCD', 'DUK', 'SO'],
    exchange: 'NYSE',
    questions: [
      CAPITAL_QUESTION,
      MAX_ALLOCATION_QUESTION,
      HISTORY_WINDOW_QUESTION,
      REBALANCE_QUESTION,
    ],
  },
  {
    key: 'diversify',
    emoji: '🌍',
    title: 'Diversify My Investments',
    description:
      'Spread investments across different companies and sectors to reduce concentration risk.',
    strategy: 'max_diversification_strategy',
    strategyLabel: 'Maximum Diversification',
    universeLabel: 'Global Blue Chip Stocks',
    // US-listed ADRs of the global blue chips (Nestlé, Novo Nordisk, BHP,
    // TSMC): the foreign primary listings (NESN.SW, NOVO-B.CO, BHP.AX) aren't
    // served by the Polygon US feed and their exchange codes aren't valid, so
    // the ADRs are used to keep the basket globally diversified but tradable.
    symbols: ['AAPL', 'JPM', 'XOM', 'JNJ', 'TSM', 'NSRGY', 'NVO', 'BHP'],
    exchange: 'NYSE',
    questions: [
      CAPITAL_QUESTION,
      {
        // Diversification Level maps to the per-stock allocation cap (w_max):
        // tighter caps force wider spreading.
        param: 'w_max',
        label: 'Diversification Level',
        help: 'Higher diversification caps each stock at a smaller share.',
        kind: 'select',
        default: 0.3,
        options: [
          { label: 'Moderate', value: 0.4 },
          { label: 'High', value: 0.3 },
          { label: 'Maximum', value: 0.2 },
        ],
      },
      HISTORY_WINDOW_QUESTION,
      REBALANCE_QUESTION,
    ],
  },
  {
    key: 'passive',
    emoji: '⚖',
    title: 'Stable Passive Investing',
    description: 'Build a stable portfolio requiring minimal management over time.',
    strategy: 'inverse_volatility_strategy',
    strategyLabel: 'Inverse Volatility',
    universeLabel: 'US Broad Market ETFs',
    symbols: ['SPY', 'QQQ', 'VTI', 'SCHD', 'VNQ'],
    exchange: 'ARCA',
    questions: [
      CAPITAL_QUESTION,
      HISTORY_WINDOW_QUESTION,
      {
        param: 'rebalance_days',
        label: 'Portfolio Rebalancing',
        help: 'How often the portfolio weights are recomputed.',
        kind: 'select',
        default: 21,
        options: [
          { label: 'Monthly', value: 21 },
          { label: 'Quarterly', value: 63 },
        ],
      },
    ],
  },
]

export function goalByKey(key: string): Goal | undefined {
  return GOALS.find((g) => g.key === key)
}

/** Seed answers with each question's default value, keyed by param. */
export function defaultAnswers(goal: Goal): Record<string, number> {
  const answers: Record<string, number> = {}
  for (const q of goal.questions) answers[q.param] = q.default
  return answers
}

/**
 * Split answers into the capital and the strategy parameter object that the
 * mapped strategy expects. `capital` is handled separately by the backtest
 * engine, so it is not part of `params`.
 */
export function buildStrategyConfig(goal: Goal, answers: Record<string, number>) {
  const params: Record<string, number> = {}
  let capital = CAPITAL_QUESTION.default
  for (const q of goal.questions) {
    const value = answers[q.param] ?? q.default
    if (q.param === 'capital') capital = value
    else params[q.param] = value
  }
  return { capital, params }
}

/** Human-readable label for an answered option (used on the review page). */
export function answerLabel(question: Question, value: number): string {
  if (question.kind === 'number') return String(value)
  const opt = question.options?.find((o) => o.value === value)
  return opt ? opt.label : String(value)
}
