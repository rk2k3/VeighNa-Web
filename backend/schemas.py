"""Request models for the API, all in one place."""

from pydantic import BaseModel


class SubscribeReq(BaseModel):
    symbol: str
    exchange: str = "NASDAQ"


class OrderReq(BaseModel):
    symbol: str
    exchange: str = "NASDAQ"
    direction: str
    price: float
    volume: float


class BacktestReq(BaseModel):
    symbol: str
    exchange: str
    start: str
    end: str
    strategy: str
    capital: float
    params: dict = {}


class LoadDataReq(BaseModel):
    symbol: str
    exchange: str = "NASDAQ"
    start: str
    end: str


class PortfolioBacktestReq(BaseModel):
    symbols: list[str]
    exchange: str = "NASDAQ"
    start: str
    end: str
    capital: float = 100000
    strategy: str = "portfolio_hold_strategy"
    params: dict = {}  # strategy parameters, e.g. {"weights": {"AAPL.NASDAQ": 0.5}, ...}


class GenerateStrategyReq(BaseModel):
    """A natural-language trading idea to compile into the DSL."""

    description: str
    symbol: str | None = None
    exchange: str | None = None


class GeneratePortfolioReq(BaseModel):
    """A goal + universe to compile into a portfolio-strategy choice."""

    description: str
    symbols: list[str] = []
    exchange: str = "NASDAQ"


class OptimizeReq(BaseModel):
    """Parameter optimization over an in-sample / out-of-sample split."""

    kind: str            # "stock" | "portfolio"
    strategy_id: str     # id of the saved strategy to optimize
    start: str           # in-sample start (ISO date)
    split: str           # in-sample/out-of-sample boundary (ISO date)
    end: str             # out-of-sample end (ISO date)
    n_trials: int = 20
    target: str = "sharpe_ratio"
    seed: int = 42       # RNG seed — same seed + inputs reproduce the run


class BenchmarkReq(BaseModel):
    """Buy-and-hold benchmark over a window, optionally compared to a strategy curve."""

    symbol: str = "SPY"
    exchange: str = "NASDAQ"
    start: str
    end: str
    capital: float = 100000
    strategy_curve: list[dict] = []   # [{date, balance}, ...] for comparison metrics


class MonteCarloReq(BaseModel):
    """Resample a backtest's own results to show the range of outcomes."""

    strategy_curve: list[dict]        # [{date, balance}, ...] from the backtest
    method: str = "block"             # "bootstrap" | "block" | "trades"
    n_sims: int = 1000
    trade_pnls: list[float] = []      # round-trip P&Ls, required for method="trades"
    block_size: int = 10
    seed: int = 42


class WalkForwardReq(BaseModel):
    """Walk-forward validation over rolling (train, test) windows."""

    kind: str            # "stock" | "portfolio"
    strategy_id: str
    start: str           # ISO date
    end: str             # ISO date
    n_windows: int = 4   # number of out-of-sample test folds
    train_windows: int = 3   # training blocks preceding each test fold
    n_trials: int = 20
    target: str = "sharpe_ratio"
    seed: int = 42


class SensitivityReq(BaseModel):
    """Sweep each parameter around a candidate to check robustness (in-sample)."""

    kind: str            # "stock" | "portfolio"
    strategy_id: str
    start: str
    split: str
    end: str
    params: dict = {}    # the candidate's parameter values, keyed by knob name
    target: str = "sharpe_ratio"
    steps: int = 9


class SavedStrategyReq(BaseModel):
    """A user-created strategy produced by the Strategy Builder questionnaire.

    ``strategy`` is the module name in the strategies/ folder this config maps
    to; ``params`` holds the deterministically-derived strategy parameters.
    """

    name: str
    goal: str                 # goal key, e.g. "grow"
    goal_label: str           # human label, e.g. "Grow My Wealth"
    strategy: str             # mapped strategy module, e.g. "portfolio_mvo_strategy"
    strategy_label: str       # human label, e.g. "Mean-Variance Optimization (MVO)"
    universe_label: str       # e.g. "US Large-Cap Growth Stocks"
    symbols: list[str]
    exchange: str = "NASDAQ"
    capital: float = 100000
    params: dict = {}
