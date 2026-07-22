"""Benchmark comparison: buy-and-hold of a reference symbol (default SPY).

Post-processing only — no strategy engine involved. We pull the benchmark's
daily closes (cached via Polygon like every other symbol), build a buy-and-hold
equity curve normalised to the same starting capital, and compare it to a
strategy's own equity curve: excess return, beta, alpha and correlation.
"""

from datetime import datetime

import numpy as np
from vnpy.trader.constant import Exchange, Interval
from vnpy.trader.database import get_database

from datafeed.polygon_feed import ensure_bar_data

ANNUAL_DAYS = 240  # match vnpy's annualisation so figures sit next to strategy stats


def _exchange(name: str) -> Exchange:
    try:
        return Exchange(name)
    except ValueError:
        raise RuntimeError(f"Unknown exchange '{name}'")


def _split(entry: str, default_exchange: str) -> tuple[str, str]:
    entry = entry.strip()
    if "." in entry:
        sym, ex = entry.rsplit(".", 1)
        return sym, ex
    return entry, default_exchange


def _num(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _curve_stats(balances: list[float]) -> dict:
    """Total/annual return %, Sharpe and max drawdown % from a balance series."""
    if len(balances) < 2:
        return {"total_return": 0.0, "annual_return": 0.0, "sharpe_ratio": 0.0, "max_ddpercent": 0.0}
    b = np.asarray(balances, dtype=float)
    rets = b[1:] / b[:-1] - 1
    total_return = (b[-1] / b[0] - 1) * 100
    n = len(rets)
    annual_return = total_return / n * ANNUAL_DAYS if n else 0.0
    sd = rets.std(ddof=1)
    sharpe = float(rets.mean() / sd * np.sqrt(ANNUAL_DAYS)) if sd > 0 else 0.0
    dd = (b / np.maximum.accumulate(b) - 1) * 100
    return {
        "total_return": round(float(total_return), 2),
        "annual_return": round(float(annual_return), 2),
        "sharpe_ratio": round(sharpe, 2),
        "max_ddpercent": round(float(dd.min()), 2),
    }


def _returns_by_date(curve: list[dict]) -> dict[str, float]:
    """Map date -> simple return (vs the previous point) for a {date, balance} list."""
    out: dict[str, float] = {}
    prev = None
    for p in curve:
        bal = _num(p.get("balance"))
        if bal is None:
            continue
        d = str(p.get("date"))[:10]
        if prev is not None and prev > 0:
            out[d] = bal / prev - 1
        prev = bal
    return out


def _compare(strategy_curve: list[dict], benchmark_curve: list[dict]) -> dict | None:
    s_ret = _returns_by_date(strategy_curve)
    b_ret = _returns_by_date(benchmark_curve)
    common = sorted(set(s_ret) & set(b_ret))
    if len(common) < 3:
        return None
    sr = np.array([s_ret[d] for d in common])
    br = np.array([b_ret[d] for d in common])
    var_b = float(br.var(ddof=1))
    beta = float(np.cov(sr, br, ddof=1)[0, 1] / var_b) if var_b > 0 else 0.0
    corr = float(np.corrcoef(sr, br)[0, 1]) if var_b > 0 and sr.var() > 0 else 0.0

    s_stats = _curve_stats([b for p in strategy_curve if (b := _num(p.get("balance"))) is not None])
    b_stats = _curve_stats([p["balance"] for p in benchmark_curve])
    return {
        "excess_return": round(float(s_stats["total_return"] - b_stats["total_return"]), 2),
        "beta": round(beta, 2),
        "alpha": round(float(s_stats["annual_return"] - beta * b_stats["annual_return"]), 2),
        "correlation": round(corr, 2),
    }


def run_benchmark(symbol: str, exchange: str, start: str, end: str, capital: float,
                  strategy_curve: list[dict] | None = None) -> dict:
    sym, ex = _split(symbol, exchange)
    ex_enum = _exchange(ex)
    start_dt = datetime.fromisoformat(start)
    end_dt = datetime.fromisoformat(end)

    ensure_bar_data(symbol=sym, exchange=ex_enum, interval=Interval.DAILY, start=start_dt, end=end_dt)
    bars = get_database().load_bar_data(sym, ex_enum, Interval.DAILY, start_dt, end_dt)
    if not bars:
        raise RuntimeError(f"No benchmark data available for {sym}.{ex}")

    bars = sorted(bars, key=lambda b: b.datetime)
    base = bars[0].close_price
    if not base:
        raise RuntimeError(f"Benchmark {sym}.{ex} has no valid starting price")

    daily = [
        {"date": bar.datetime.date().isoformat(), "balance": round(capital * bar.close_price / base, 2)}
        for bar in bars
    ]
    return {
        # Label with the plain ticker: the exchange here is only a data-cache key
        # (inherited from the request), not where the benchmark actually lists.
        "symbol": sym,
        "daily_balances": daily,
        "statistics": _curve_stats([p["balance"] for p in daily]),
        "comparison": _compare(strategy_curve, daily) if strategy_curve else None,
    }
