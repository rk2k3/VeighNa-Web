"""Generic interpreter strategy for the trading DSL.

This single strategy runs *every* AI-generated strategy: the rules are passed in
as data (the ``dsl`` parameter, a plain dict matching backend/dsl/schema.py) and
evaluated each bar against vnpy indicators. No per-strategy Python is ever
generated or executed — the DSL is interpreted, not compiled.

Deliberately self-contained (operates on the raw dict, no pydantic import) so it
stays importable by the strategy-discovery service. The backend validates the
DSL before it ever reaches here.
"""

from typing import Optional

import numpy as np

from vnpy_ctastrategy import (
    CtaTemplate,
    StopOrder,
    TickData,
    BarData,
    TradeData,
    OrderData,
    ArrayManager,
)
from vnpy.trader.constant import Offset


def _max_period(dsl: dict) -> int:
    """Largest lookback referenced anywhere in the rules (for history sizing)."""
    periods = [1]
    for rule_key in ("entry", "exit"):
        rule = dsl.get(rule_key) or {}
        for cond in rule.get("conditions", []):
            for side in (cond.get("left"), cond.get("right")):
                if isinstance(side, dict) and side.get("period"):
                    periods.append(int(side["period"]))
    return max(periods)


class DslStrategy(CtaTemplate):
    """Interprets a DSL rule set (entry/exit conditions + stop-loss/take-profit)."""

    author = "AI"

    # A dict-typed parameter: the whole strategy definition rides in here.
    dsl: dict = {}

    parameters = ["dsl"]
    variables = ["entry_price"]

    def __init__(self, cta_engine, strategy_name, vt_symbol, setting):
        super().__init__(cta_engine, strategy_name, vt_symbol, setting)

        max_period = _max_period(self.dsl)
        # Warm up just enough for the largest indicator to stabilize (recursive
        # ones like RSI/ATR/EMA need a buffer beyond their period) plus 2 bars for
        # crossover look-back. A small floor keeps very short strategies sane
        # without burning a big slice of a 1-year backtest on warmup.
        size = max(max_period + 20, 40)
        self.am = ArrayManager(size=size)
        self._warmup = size

        self.direction: str = self.dsl.get("direction", "long")
        self.position_pct: float = float(self.dsl.get("position_pct", 1.0))
        risk = self.dsl.get("risk") or {}
        self.stop_loss_pct: Optional[float] = risk.get("stop_loss_pct")
        self.take_profit_pct: Optional[float] = risk.get("take_profit_pct")

        self.entry_price: float = 0.0

    def on_init(self):
        self.write_log("DSL strategy initializing")
        self.load_bar(self._warmup)

    def on_start(self):
        self.write_log("DSL strategy started")
        self.put_event()

    def on_stop(self):
        self.write_log("DSL strategy stopped")
        self.put_event()

    def on_tick(self, tick: TickData):
        pass

    # --- Indicator/condition evaluation -----------------------------------

    def _operand_array(self, operand: dict) -> Optional[np.ndarray]:
        """Resolve an operand (indicator + period) to a value array."""
        ind = operand.get("indicator")
        period = operand.get("period")

        if ind == "CLOSE":
            return self.am.close
        if period is None:
            return None
        if ind == "RSI":
            return self.am.rsi(period, array=True)
        if ind == "SMA":
            return self.am.sma(period, array=True)
        if ind == "EMA":
            return self.am.ema(period, array=True)
        if ind == "ATR":
            return self.am.atr(period, array=True)
        return None

    def _condition_true(self, cond: dict) -> bool:
        left = self._operand_array(cond.get("left", {}))
        if left is None or len(left) < 2:
            return False

        right = cond.get("right")
        if isinstance(right, dict):
            right_arr = self._operand_array(right)
            if right_arr is None or len(right_arr) < 2:
                return False
            r_now, r_prev = right_arr[-1], right_arr[-2]
        else:
            r_now = r_prev = float(right)

        l_now, l_prev = left[-1], left[-2]
        if not all(np.isfinite(v) for v in (l_now, l_prev, r_now, r_prev)):
            return False

        op = cond.get("operator")
        if op == "<":
            return l_now < r_now
        if op == ">":
            return l_now > r_now
        if op == "<=":
            return l_now <= r_now
        if op == ">=":
            return l_now >= r_now
        if op == "crosses_above":
            return l_prev <= r_prev and l_now > r_now
        if op == "crosses_below":
            return l_prev >= r_prev and l_now < r_now
        return False

    def _rule_triggered(self, rule: dict) -> bool:
        conditions = rule.get("conditions", [])
        if not conditions:
            return False
        results = [self._condition_true(c) for c in conditions]
        return all(results) if rule.get("logic", "AND") == "AND" else any(results)

    def _stop_hit(self, price: float) -> bool:
        if not self.entry_price:
            return False
        if self.direction == "long":
            if self.stop_loss_pct and price <= self.entry_price * (1 - self.stop_loss_pct):
                return True
            if self.take_profit_pct and price >= self.entry_price * (1 + self.take_profit_pct):
                return True
        else:  # short
            if self.stop_loss_pct and price >= self.entry_price * (1 + self.stop_loss_pct):
                return True
            if self.take_profit_pct and price <= self.entry_price * (1 - self.take_profit_pct):
                return True
        return False

    def _volume(self, price: float) -> int:
        capital = getattr(self.cta_engine, "capital", 100000)
        return max(int(capital * self.position_pct / price), 1)

    # --- Bar handling ------------------------------------------------------

    def on_bar(self, bar: BarData):
        am = self.am
        am.update_bar(bar)
        if not am.inited:
            return

        price = bar.close_price
        entry = self.dsl.get("entry") or {}
        exit_rule = self.dsl.get("exit") or {}

        if self.pos == 0:
            if self._rule_triggered(entry):
                volume = self._volume(price)
                if self.direction == "long":
                    self.buy(price, volume)
                else:
                    self.short(price, volume)
        elif self.pos > 0:  # long open
            if self._stop_hit(price) or self._rule_triggered(exit_rule):
                self.sell(price, abs(self.pos))
        elif self.pos < 0:  # short open
            if self._stop_hit(price) or self._rule_triggered(exit_rule):
                self.cover(price, abs(self.pos))

        self.put_event()

    def on_order(self, order: OrderData):
        pass

    def on_trade(self, trade: TradeData):
        # Remember the fill price of the opening trade for stop-loss/take-profit.
        if trade.offset == Offset.OPEN:
            self.entry_price = trade.price
        else:
            self.entry_price = 0.0
        self.put_event()

    def on_stop_order(self, stop_order: StopOrder):
        pass
