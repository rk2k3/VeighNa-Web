"""Backtest orchestration: fetch data, load the strategy, run the vnpy engine.

Kept out of the route handlers so the endpoints stay thin. Data is auto-loaded
from Polygon into vnpy's local database (cached ranges skip the network);
ensure_bar_data raises RuntimeError on failure, which callers surface as HTTP 400.
"""

import importlib
import os
import sys
from datetime import datetime

from vnpy.trader.constant import Exchange, Interval
from vnpy_ctastrategy.backtesting import BacktestingEngine
from vnpy_portfoliostrategy.backtesting import BacktestingEngine as PortfolioBacktestingEngine

from datafeed.polygon_feed import ensure_bar_data

# Repo root — added to sys.path so `import strategies.xxx` resolves.
VEIGHNA_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

RATE = 0.0003
SLIPPAGE = 0.01
SIZE = 1
PRICETICK = 0.01


def _ensure_strategies_importable() -> None:
    if VEIGHNA_ROOT not in sys.path:
        sys.path.insert(0, VEIGHNA_ROOT)


def _format_result(engine) -> dict:
    df = engine.calculate_result()
    stats = engine.calculate_statistics(output=False)
    return {
        "statistics": {k: str(v) for k, v in stats.items()},
        "daily_results": df.reset_index().to_dict(orient="records"),
    }


def run_single_backtest(symbol: str, exchange: str, start: str, end: str,
                        strategy: str, capital: float, params: dict) -> dict:
    _ensure_strategies_importable()
    ex = Exchange(exchange)
    start_dt = datetime.fromisoformat(start)
    end_dt = datetime.fromisoformat(end)

    ensure_bar_data(symbol=symbol, exchange=ex, interval=Interval.DAILY, start=start_dt, end=end_dt)

    engine = BacktestingEngine()
    engine.set_parameters(
        vt_symbol=f"{symbol}.{exchange}",
        interval=Interval.DAILY,
        start=start_dt,
        end=end_dt,
        rate=RATE,
        slippage=SLIPPAGE,
        size=SIZE,
        pricetick=PRICETICK,
        capital=capital,
    )

    mod = importlib.import_module(f"strategies.{strategy}")
    class_name = "".join(w.capitalize() for w in strategy.split("_"))
    engine.add_strategy(getattr(mod, class_name), params)
    engine.load_data()
    engine.run_backtesting()
    return _format_result(engine)


def run_portfolio_backtest(symbols: list[str], exchange: str, start: str, end: str,
                           capital: float, weights: dict) -> dict:
    _ensure_strategies_importable()
    ex = Exchange(exchange)
    start_dt = datetime.fromisoformat(start)
    end_dt = datetime.fromisoformat(end)
    vt_symbols = [f"{s}.{exchange}" for s in symbols]

    for symbol in symbols:
        ensure_bar_data(symbol=symbol, exchange=ex, interval=Interval.DAILY, start=start_dt, end=end_dt)

    if not weights:
        weight = 1.0 / len(symbols)
        weight_map = {f"{s}.{exchange}": weight for s in symbols}
    else:
        weight_map = {f"{s}.{exchange}": w for s, w in weights.items()}

    engine = PortfolioBacktestingEngine()
    engine.set_parameters(
        vt_symbols=vt_symbols,
        interval=Interval.DAILY,
        start=start_dt,
        end=end_dt,
        rates={s: RATE for s in vt_symbols},
        slippages={s: SLIPPAGE for s in vt_symbols},
        sizes={s: SIZE for s in vt_symbols},
        priceticks={s: PRICETICK for s in vt_symbols},
        capital=capital,
    )

    # Imported here (not at module top) so it resolves after sys.path is set.
    from strategies.portfolio_hold_strategy import PortfolioHoldStrategy
    engine.add_strategy(PortfolioHoldStrategy, {"weights": weight_map})
    engine.load_data()
    engine.run_backtesting()

    result = _format_result(engine)
    result["weights"] = weight_map
    return result
