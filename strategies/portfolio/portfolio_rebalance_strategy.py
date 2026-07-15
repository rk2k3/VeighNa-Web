from typing import Dict

from vnpy_portfoliostrategy import StrategyTemplate, StrategyEngine
from vnpy.trader.object import BarData


class PortfolioRebalanceStrategy(StrategyTemplate):
    """Periodically rebalances the portfolio back to target weights.

    Parameters
    ----------
    weights : dict
        Target allocation per vt_symbol, e.g. {"AAPL.NASDAQ": 0.6, "MSFT.NASDAQ": 0.4}.
    rebalance_days : int
        Number of bars between rebalances (also rebalances on the first bar).
    """

    author = "Test"

    weights: Dict[str, float] = {}
    rebalance_days: int = 20

    parameters = ["weights", "rebalance_days"]
    variables = ["bar_count"]

    def __init__(self, strategy_engine: StrategyEngine, strategy_name: str,
                 vt_symbols: list, setting: dict):
        super().__init__(strategy_engine, strategy_name, vt_symbols, setting)
        self.bar_count = 0

    def on_init(self):
        self.write_log("Strategy initializing")
        self.load_bars(1)

    def on_start(self):
        self.write_log("Strategy started")

    def on_stop(self):
        self.write_log("Strategy stopped")

    def on_bars(self, bars: Dict[str, BarData]):
        # Rebalance on the first bar and every rebalance_days bars thereafter.
        if self.bar_count % max(self.rebalance_days, 1) == 0:
            capital = self.strategy_engine.capital
            for vt_symbol, bar in bars.items():
                weight = self.weights.get(vt_symbol, 0)
                target = int(capital * weight / bar.close_price) if weight > 0 else 0
                self.set_target(vt_symbol, target)
            self.rebalance_portfolio(bars)

        self.bar_count += 1
        self.put_event()
