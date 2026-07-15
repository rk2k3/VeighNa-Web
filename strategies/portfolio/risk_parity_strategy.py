from typing import Dict, Optional

import numpy as np
from scipy.optimize import minimize

from vnpy_portfoliostrategy import StrategyTemplate, StrategyEngine
from vnpy.trader.object import BarData


class PortfolioRiskParityStrategy(StrategyTemplate):
    """
    Risk Parity (Equal Risk Contribution) Portfolio.

    Every rebalance_days bars, estimates the covariance matrix over the
    trailing est_win days and solves for the weights under which every asset
    contributes the same amount to total portfolio risk:

        RC_i = w_i * (Sigma w)_i        (risk contribution of asset i)
        find w   s.t.   RC_i = RC_j for all i, j
                        sum(w) = 1, 0 <= w_i <= 1

    Solved by minimizing the dispersion of risk contributions. Unlike Inverse
    Volatility (which ignores correlations) this uses the full covariance
    matrix — the popular "all-weather" balanced-risk approach.

    Falls back to equal weights if there is insufficient history or the
    optimizer fails.
    """

    author = "Test"

    est_win: int = 30
    rebalance_days: int = 20

    parameters = [
        "est_win",
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
                "Insufficient history for Risk Parity - using equal weights"
            )
            return equal

        window = sorted(common_dates)[-needed:]

        columns = []

        for s in self.vt_symbols:

            prices = np.asarray(
                [self.closes[s][d] for d in window],
                dtype=float,
            )

            returns = prices[1:] / prices[:-1] - 1.0

            columns.append(returns)

        returns = np.column_stack(columns)

        sigma = np.atleast_2d(
            np.cov(returns, rowvar=False)
        )

        # Numerical stabilization
        sigma += np.eye(n) * 1e-10

        # Spinu / Maillard convex formulation of equal risk contribution:
        #   min  1/2 w' Sigma w - (1/n) * sum(log w_i),  w_i > 0
        # Its (normalized) minimizer satisfies w_i * (Sigma w)_i = const for all
        # i — i.e. every asset contributes the same risk. This objective is well
        # scaled (unlike minimizing the raw risk-contribution spread), so the
        # solver converges reliably.
        def objective(w: np.ndarray) -> float:
            return 0.5 * (w @ sigma @ w) - np.mean(np.log(w))

        def gradient(w: np.ndarray) -> np.ndarray:
            return sigma @ w - (1.0 / n) / w

        # Seed with inverse-volatility weights — close to the solution when
        # assets are uncorrelated.
        vol = np.sqrt(np.diag(sigma))
        vol = np.maximum(vol, 1e-10)
        inv_vol = 1.0 / vol
        x0 = (
            self.last_weights
            if self.last_weights is not None
            else inv_vol / inv_vol.sum()
        )

        result = minimize(
            objective,
            x0,
            jac=gradient,
            method="L-BFGS-B",
            bounds=[(1e-8, None)] * n,
            options={"ftol": 1e-14, "maxiter": 1000},
        )

        if not result.success:
            self.write_log(
                f"Risk Parity solver failed ({result.message}) - using equal weights"
            )
            return equal

        # The log-barrier objective is scale-free; normalize to a full allocation.
        weights = np.clip(result.x, 0.0, None)
        weights /= weights.sum()

        self.last_weights = weights

        self.write_log(
            "Risk Parity weights: "
            + ", ".join(
                f"{s}={w:.3f}"
                for s, w in zip(self.vt_symbols, weights)
            )
        )

        return dict(zip(self.vt_symbols, weights))
