from typing import Dict, Optional

import numpy as np
from scipy.optimize import minimize

from vnpy_portfoliostrategy import StrategyTemplate, StrategyEngine
from vnpy.trader.object import BarData


class PortfolioMaxDiversificationStrategy(StrategyTemplate):
    """
    Maximum Decorrelation (Maximum Diversification) Portfolio.

    Every rebalance_days bars, estimates the covariance matrix over the
    trailing est_win days and computes the weights that maximize the
    diversification ratio

        DR(w) = (w' * sigma) / sqrt(w' * Sigma * w)

    where

        sigma = vector of asset volatilities
        Sigma = covariance matrix

    Subject to

        sum(w) = 1
        0 <= w_i <= w_max

    Falls back to equal weights if there is insufficient history or the
    optimizer fails.
    """

    author = "Test"

    est_win: int = 30
    w_max: float = 0.6
    rebalance_days: int = 20

    parameters = [
        "est_win",
        "w_max",
        "rebalance_days",
    ]

    variables = [
        "bar_count",
    ]

    def __init__(
        self,
        strategy_engine: StrategyEngine,
        strategy_name: str,
        vt_symbols: list,
        setting: dict,
    ):
        super().__init__(
            strategy_engine,
            strategy_name,
            vt_symbols,
            setting,
        )

        self.bar_count = 0

        self.closes: Dict[str, dict] = {
            vt_symbol: {}
            for vt_symbol in vt_symbols
        }

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

        if bar_date != self.last_date:

            self.last_date = bar_date

            if self.bar_count % max(self.rebalance_days, 1) == 0:

                weights = self._compute_weights()

                capital = self.strategy_engine.capital

                for vt_symbol, bar in bars.items():

                    weight = weights.get(vt_symbol, 0)

                    target = (
                        int(capital * weight / bar.close_price)
                        if weight > 0
                        else 0
                    )

                    self.set_target(vt_symbol, target)

                self.rebalance_portfolio(bars)

            self.bar_count += 1

        self.put_event()

    def _compute_weights(self) -> Dict[str, float]:

        n = len(self.vt_symbols)

        equal = {
            s: 1.0 / n
            for s in self.vt_symbols
        }

        needed = self.est_win + 1

        common_dates = set(self.closes[self.vt_symbols[0]])

        for s in self.vt_symbols[1:]:
            common_dates &= set(self.closes[s])

        if len(common_dates) < needed:
            self.write_log(
                "Insufficient history for MaxDecorr - using equal weights"
            )
            return equal

        window = sorted(common_dates)[-needed:]

        columns = []

        for s in self.vt_symbols:

            prices = np.asarray(
                [self.closes[s][d] for d in window],
                dtype=float
            )

            returns = prices[1:] / prices[:-1] - 1.0

            columns.append(returns)

        returns = np.column_stack(columns)

        # Covariance matrix
        sigma = np.atleast_2d(
            np.cov(returns, rowvar=False)
        )

        # Numerical stabilization
        sigma += np.eye(n) * 1e-10

        # Asset volatilities
        vol = np.sqrt(np.diag(sigma))

        def negative_diversification_ratio(w: np.ndarray) -> float:

            portfolio_vol = np.sqrt(w @ sigma @ w)

            if portfolio_vol <= 1e-12:
                return 1e12

            diversification_ratio = (w @ vol) / portfolio_vol

            return -diversification_ratio

        x0 = (
            self.last_weights
            if self.last_weights is not None
            else np.full(n, 1.0 / n)
        )

        result = minimize(
            negative_diversification_ratio,
            x0,
            method="SLSQP",
            bounds=[(0.0, self.w_max)] * n,
            constraints=[
                {
                    "type": "eq",
                    "fun": lambda w: np.sum(w) - 1.0,
                }
            ],
            options={
                "ftol": 1e-9,
                "maxiter": 500,
            },
        )

        if not result.success:

            self.write_log(
                f"MaxDecorr solver failed ({result.message}) "
                "- using equal weights"
            )

            return equal

        weights = np.clip(result.x, 0.0, self.w_max)

        weights /= weights.sum()

        self.last_weights = weights

        self.write_log(
            "MaxDecorr weights: "
            + ", ".join(
                f"{s}={w:.3f}"
                for s, w in zip(self.vt_symbols, weights)
            )
        )

        return dict(zip(self.vt_symbols, weights))