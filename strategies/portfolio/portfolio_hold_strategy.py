from typing import Dict
from vnpy_portfoliostrategy import StrategyTemplate, StrategyEngine
from vnpy.trader.object import BarData


class PortfolioHoldStrategy(StrategyTemplate):
    """Buy-and-hold portfolio strategy with weighted allocation"""

    author = "Test"

    weights: Dict[str, float] = {}

    parameters = ["weights"]
    variables = []

    def __init__(self, strategy_engine: StrategyEngine, strategy_name: str,
                 vt_symbols: list, setting: dict):
        super().__init__(strategy_engine, strategy_name, vt_symbols, setting)
        self.bought: Dict[str, bool] = {vt_symbol: False for vt_symbol in vt_symbols}

    def on_init(self):
        self.write_log("Strategy initializing")
        self.load_bars(1)

    def on_start(self):
        self.write_log("Strategy started")

    def on_stop(self):
        self.write_log("Strategy stopped")

    def on_bars(self, bars: Dict[str, BarData]):
        for vt_symbol, bar in bars.items():
            if self.bought.get(vt_symbol):
                continue

            weight = self.weights.get(vt_symbol, 0)
            if weight <= 0:
                continue

            capital_for_symbol = self.strategy_engine.capital * weight
            volume = int(capital_for_symbol / bar.close_price)

            if volume > 0:
                self.buy(vt_symbol, bar.close_price * 1.02, volume)
                self.bought[vt_symbol] = True
                self.write_log(f"Bought {volume} units of {vt_symbol} at {bar.close_price}")

        self.put_event()
