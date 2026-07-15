from typing import Dict

import numpy as np

from vnpy_portfoliostrategy import StrategyTemplate, StrategyEngine
from vnpy.trader.object import BarData


class PortfolioInverseVolatilityStrategy(StrategyTemplate):
    """
    Inverse Volatility Portfolio.

    Every rebalance_days bars, estimates each asset's historical volatility
    over the trailing est_win days and allocates weights proportional to

        w_i ∝ 1 / σ_i

    The weights are then normalized so that

        Σ w_i = 1

    Lower-volatility assets receive larger portfolio weights.

    Falls back to equal weights if there is insufficient history.
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
                "Insufficient history for Inverse Volatility - using equal weights"
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

        # Historical volatility
        vol = returns.std(axis=0, ddof=1)

        # Avoid divide-by-zero
        vol = np.maximum(vol, 1e-10)

        # Inverse volatility allocation
        weights = 1.0 / vol

        # Normalize
        weights /= weights.sum()

        self.write_log(
            "Inverse Volatility weights: "
            + ", ".join(
                f"{s}={w:.3f}"
                for s, w in zip(self.vt_symbols, weights)
            )
        )

        return dict(zip(self.vt_symbols, weights))