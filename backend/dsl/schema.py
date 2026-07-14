"""The trading DSL — a structured, deterministic description of a rule-based
single-symbol strategy.

An LLM produces one of these (never Python), a validator checks it, and the
generic interpreter strategy (`strategies/dsl_strategy.py`) executes it bar by
bar. Keeping the vocabulary small and closed (enumerated indicators/operators)
is what makes the mapping deterministic and safe: nothing outside this schema
can ever reach the backtest engine.
"""

from typing import Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator

# --- Portfolio strategy selection (AI picks the algorithm + parameters) ---

PortfolioStrategyKey = Literal[
    "portfolio_mvo_strategy",
    "min_variance_strategy",
    "max_diversification_strategy",
    "inverse_volatility_strategy",
]


class PortfolioChoice(BaseModel):
    """The AI's choice of portfolio algorithm and its parameters.

    The user supplies the universe (symbols/exchange) and capital separately;
    the model only picks the strategy and tunes the knobs to the stated goal.
    """

    name: str = Field(description="Short descriptive name for the strategy.")
    strategy: PortfolioStrategyKey
    est_win: int = Field(ge=5, le=252, description="Trailing days used to estimate risk/returns.")
    w_max: float = Field(gt=0, le=1, description="Max weight per asset (ignored for inverse volatility).")
    rebalance_days: int = Field(ge=1, le=252, description="Bars between rebalances.")
    # Optional because non-MVO strategies legitimately return null here.
    gamma: Optional[float] = Field(default=5.0, description="Risk aversion (MVO only).")
    rationale: str = Field(description="One or two sentences explaining the choice.")

# The indicators the interpreter knows how to compute from vnpy's ArrayManager.
Indicator = Literal["CLOSE", "RSI", "SMA", "EMA", "ATR"]

# CLOSE takes no period; the rest do. Comparison + crossover operators.
Operator = Literal["<", ">", "<=", ">=", "crosses_above", "crosses_below"]


class Operand(BaseModel):
    """One side of a comparison: an indicator (with a lookback period)."""

    indicator: Indicator
    period: Optional[int] = Field(
        default=None,
        description="Lookback window in bars. Required for all indicators except CLOSE.",
    )

    @field_validator("period")
    @classmethod
    def _period_range(cls, v):
        if v is not None and not (1 <= v <= 400):
            raise ValueError("period must be between 1 and 400 bars")
        return v


class Condition(BaseModel):
    """`left <operator> right`, where right is a constant or another indicator."""

    left: Operand
    operator: Operator
    right: Union[float, Operand] = Field(
        description="A constant number (e.g. 30 for 'RSI < 30') or another indicator "
        "(e.g. SMA(30) for a moving-average crossover)."
    )


class Rule(BaseModel):
    """A set of conditions combined with AND/OR."""

    conditions: list[Condition] = Field(min_length=1, max_length=6)
    logic: Literal["AND", "OR"] = "AND"


class Risk(BaseModel):
    """Optional exit guards, as fractions (0.08 == 8%)."""

    stop_loss_pct: Optional[float] = None
    take_profit_pct: Optional[float] = None

    @field_validator("stop_loss_pct", "take_profit_pct")
    @classmethod
    def _fraction(cls, v):
        if v is not None and not (0 < v < 1):
            raise ValueError("stop_loss_pct / take_profit_pct must be a fraction in (0, 1)")
        return v


class DslStrategy(BaseModel):
    """A complete, backtestable rule-based strategy."""

    name: str = Field(description="Short human-readable strategy name.")
    symbol: str = Field(description="Ticker symbol, e.g. AAPL.")
    exchange: str = "NASDAQ"
    direction: Literal["long", "short"] = "long"
    entry: Rule
    exit: Rule
    risk: Risk = Field(default_factory=Risk)
    position_pct: float = Field(
        default=1.0, description="Fraction of capital to deploy per entry (0-1]."
    )

    @field_validator("position_pct")
    @classmethod
    def _pos_fraction(cls, v):
        if not (0 < v <= 1):
            raise ValueError("position_pct must be in (0, 1]")
        return v
