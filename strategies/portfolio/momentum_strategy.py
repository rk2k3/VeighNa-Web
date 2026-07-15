from typing import Dict

import numpy as np

from vnpy_portfoliostrategy import StrategyTemplate, StrategyEngine
from vnpy.trader.object import BarData


class PortfolioMomentumStrategy(StrategyTemplate):
    """
    Momentum (Relative Strength) Portfolio.

    Every rebalance_days bars, measures each asset's trailing total return
    over the last est_win days and tilts the allocation toward the recent
    winners:

        w_i ∝ max(r_i, 0)

    Negative-momentum assets are dropped (weight 0), the remaining weights are
    capped at w_max and normalized to sum to 1. The only return/trend-driven
    allocator here — everything else is risk-based.

    Falls back to equal weights if there is insufficient history or no asset
    has positive momentum.
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
                "Insufficient history for Momentum - using equal weights"
            )
            return equal

        window = sorted(common_dates)[-needed:]

        # Trailing total return of each asset over the window.
        momentum = np.asarray(
            [
                self.closes[s][window[-1]] / self.closes[s][window[0]] - 1.0
                for s in self.vt_symbols
            ],
            dtype=float,
        )

        # Keep only positive momentum; if nothing qualifies, equal weight.
        scores = np.maximum(momentum, 0.0)

        if scores.sum() <= 0:
            self.write_log(
                "No positive momentum - using equal weights"
            )
            return equal

        weights = scores / scores.sum()

        # Cap concentration and renormalize.
        weights = np.clip(weights, 0.0, self.w_max)
        weights /= weights.sum()

        self.write_log(
            "Momentum weights: "
            + ", ".join(
                f"{s}={w:.3f}"
                for s, w in zip(self.vt_symbols, weights)
            )
        )

        return dict(zip(self.vt_symbols, weights))
