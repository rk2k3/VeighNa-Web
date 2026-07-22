"""Backtest orchestration: fetch data, load the strategy, run the vnpy engine.

Kept out of the route handlers so the endpoints stay thin. Data is auto-loaded
from Polygon into vnpy's local database (cached ranges skip the network);
ensure_bar_data raises RuntimeError on failure, which callers surface as HTTP 400.
"""

from datetime import datetime

from vnpy.trader.constant import Exchange, Interval
from vnpy_ctastrategy.backtesting import BacktestingEngine
from vnpy_portfoliostrategy.backtesting import BacktestingEngine as PortfolioBacktestingEngine

from datafeed.polygon_feed import ensure_bar_data
from services import analytics_service, strategy_loader_service

RATE = 0.0003
SLIPPAGE = 0.01
SIZE = 1
PRICETICK = 0.01


def _exchange(name: str) -> Exchange:
    try:
        return Exchange(name)
    except ValueError:
        raise RuntimeError(f"Unknown exchange '{name}'")


def _split_symbol(entry: str, default_exchange: str) -> tuple[str, str]:
    """Parse 'AAPL' or 'AAPL.NASDAQ' into (symbol, exchange)."""
    entry = entry.strip()
    if "." in entry:
        sym, ex = entry.rsplit(".", 1)
        return sym, ex
    return entry, default_exchange


def _serialize_trades(engine) -> list[dict]:
    return [
        {
            "symbol": t.symbol,
            "datetime": str(t.datetime),
            "direction": t.direction.name,   # LONG / SHORT
            "offset": t.offset.name,
            "price": float(t.price),
            "volume": float(t.volume),
        }
        for t in engine.get_all_trades()
    ]


def _format_result(engine) -> dict:
    # A run that never traded yields no daily curve (calculate_result returns
    # None); treat that as an empty result with zeroed stats rather than crashing.
    df = engine.calculate_result()
    stats = engine.calculate_statistics(output=False)
    daily = df.reset_index().to_dict(orient="records") if df is not None else []
    result = {
        "statistics": {k: str(v) for k, v in stats.items()},
        "daily_results": daily,
    }
    # Post-run analytics are additive: a failure here must not sink the backtest.
    try:
        result["analytics"] = analytics_service.compute(daily, _serialize_trades(engine))
    except Exception:
        result["analytics"] = None
    return result


def run_single_backtest(symbol: str, exchange: str, start: str, end: str,
                        strategy: str, capital: float, params: dict) -> dict:
    ex = _exchange(exchange)
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

    engine.add_strategy(strategy_loader_service.get_cta_strategy_class(strategy), params)
    engine.load_data()
    engine.run_backtesting()
    return _format_result(engine)


def run_portfolio_backtest(symbols: list[str], exchange: str, start: str, end: str,
                           capital: float, strategy: str, params: dict) -> dict:
    start_dt = datetime.fromisoformat(start)
    end_dt = datetime.fromisoformat(end)

    # Each entry may carry its own exchange ("SPY.ARCA"); otherwise use the default.
    pairs = [_split_symbol(s, exchange) for s in symbols]
    vt_symbols = [f"{sym}.{ex}" for sym, ex in pairs]

    for sym, ex in pairs:
        ensure_bar_data(symbol=sym, exchange=_exchange(ex), interval=Interval.DAILY, start=start_dt, end=end_dt)

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

    strategy_class = strategy_loader_service.get_portfolio_strategy_class(strategy)
    engine.add_strategy(strategy_class, params)
    engine.load_data()
    engine.run_backtesting()

    result = _format_result(engine)
    # Echo back the allocation (if this strategy uses one) for the UI table.
    result["weights"] = params.get("weights", {})
    return result
