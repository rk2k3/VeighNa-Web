from typing import Dict

from vnpy_portfoliostrategy import StrategyTemplate, StrategyEngine
from vnpy.trader.object import BarData


class PortfolioEqualWeightStrategy(StrategyTemplate):
    """
    Equal Weight (1/N) Portfolio.

    Every rebalance_days bars, allocates the same weight to every asset

        w_i = 1 / n

    and rebalances back to that split. The classic naive-diversification
    baseline: it requires no estimation and is famously hard to beat out of
    sample.
    """

    author = "Test"

    rebalance_days: int = 20

    parameters = [
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

        weights = {
            s: 1.0 / n
            for s in self.vt_symbols
        }

        self.write_log(
            "Equal Weight weights: "
            + ", ".join(
                f"{s}={w:.3f}"
                for s, w in weights.items()
            )
        )

        return weights
