from typing import Dict, Optional

import numpy as np
from scipy.optimize import minimize

from vnpy_portfoliostrategy import StrategyTemplate, StrategyEngine
from vnpy.trader.object import BarData


class PortfolioMvoStrategy(StrategyTemplate):
    """A1 · MVO-Hist: mean-variance optimisation with historical inputs.

    Every rebalance_days bars, estimates the mean vector and covariance matrix
    of daily returns over the trailing est_win days and solves the
    quadratic-utility problem:

        max  w'mu - (gamma/2) * w' Sigma w
        s.t. sum(w) = 1,  0 <= w_i <= w_max

    Falls back to equal weights (and logs it) whenever there is not yet
    est_win days of history or the solver fails.

    Parameters
    ----------
    est_win : int
        Trailing days used to estimate mu and Sigma.
    gamma : float
        Risk aversion — how many units of expected return one unit of
        return variance costs the optimiser.
    w_max : float
        Per-asset weight cap (must satisfy n_assets * w_max >= 1).
    rebalance_days : int
        Number of bars between rebalances (also rebalances on the first bar).
    """

    author = "Test"

    est_win: int = 30
    gamma: float = 5.0
    w_max: float = 0.6
    rebalance_days: int = 20

    parameters = ["est_win", "gamma", "w_max", "rebalance_days"]
    variables = ["bar_count"]

    def __init__(self, strategy_engine: StrategyEngine, strategy_name: str,
                 vt_symbols: list, setting: dict):
        super().__init__(strategy_engine, strategy_name, vt_symbols, setting)
        self.bar_count = 0  # trading days seen
        # Close history keyed by calendar date so duplicate or split bar
        # timestamps in the database can't break alignment across symbols.
        self.closes: Dict[str, dict] = {vt_symbol: {} for vt_symbol in vt_symbols}
        self.last_date = None
        self.last_weights: Optional[np.ndarray] = None

    def on_init(self):
        self.write_log("Strategy initializing")
        self.load_bars(1)

    def on_start(self):
        self.write_log("Strategy started")

    def on_stop(self):
        self.write_log("Strategy stopped")

    def on_bars(self, bars: Dict[str, BarData]):
        bar_date = None
        for vt_symbol, bar in bars.items():
            bar_date = bar.datetime.date()
            self.closes[vt_symbol][bar_date] = bar.close_price

        # Count trading days, not on_bars calls — the engine can split one
        # day into several calls when stored bar timestamps differ.
        if bar_date != self.last_date:
            self.last_date = bar_date
            if self.bar_count % max(self.rebalance_days, 1) == 0:
                weights = self._compute_weights()
                capital = self.strategy_engine.capital
                for vt_symbol, bar in bars.items():
                    weight = weights.get(vt_symbol, 0)
                    target = int(capital * weight / bar.close_price) if weight > 0 else 0
                    self.set_target(vt_symbol, target)
                self.rebalance_portfolio(bars)
            self.bar_count += 1

        self.put_event()

    def _compute_weights(self) -> Dict[str, float]:
        n = len(self.vt_symbols)
        equal = {s: 1.0 / n for s in self.vt_symbols}

        # est_win returns require est_win + 1 aligned closes across all symbols.
        needed = self.est_win + 1
        common_dates = set(self.closes[self.vt_symbols[0]])
        for s in self.vt_symbols[1:]:
            common_dates &= set(self.closes[s])
        if len(common_dates) < needed:
            self.write_log("Insufficient history for MVO — using equal weights")
            return equal
        window = sorted(common_dates)[-needed:]

        columns = []
        for s in self.vt_symbols:
            prices = np.asarray([self.closes[s][d] for d in window])
            columns.append(prices[1:] / prices[:-1] - 1)
        returns = np.column_stack(columns)  # (est_win, n)

        mu = returns.mean(axis=0)
        sigma = np.cov(returns, rowvar=False)
        gamma = self.gamma

        def neg_utility(w: np.ndarray) -> float:
            return -(w @ mu - gamma / 2 * w @ sigma @ w)

        # Warm-start from last month's solution when available.
        x0 = self.last_weights if self.last_weights is not None else np.full(n, 1.0 / n)
        result = minimize(
            neg_utility,
            x0,
            method="SLSQP",
            bounds=[(0.0, self.w_max)] * n,
            constraints=[{"type": "eq", "fun": lambda w: w.sum() - 1.0}],
        )

        if not result.success:
            self.write_log(f"MVO solver failed ({result.message}) — using equal weights")
            return equal

        self.last_weights = result.x
        self.write_log(
            "MVO weights: "
            + ", ".join(f"{s}={w:.3f}" for s, w in zip(self.vt_symbols, result.x))
        )
        return dict(zip(self.vt_symbols, result.x))
