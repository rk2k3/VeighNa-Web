"""Post-run backtest analytics.

Everything here is derived from the two things the vnpy engine already
produced — the daily results and the trade fills. Nothing re-runs a backtest.

The one piece of real reconstruction is pairing fills into round-trip trades:
fills are matched FIFO per symbol by *position sign* (a LONG fill first closes
any open short lots, then opens a long lot, and vice versa), so it works whether
or not a strategy sets vnpy's open/close offsets cleanly.
"""

import math
from collections import defaultdict, deque
from datetime import date

import numpy as np
from scipy.stats import kurtosis, skew

ANNUAL_DAYS = 240          # match vnpy's annualisation
ROLLING_WINDOW = 63        # ~one quarter of trading days
HISTOGRAM_BINS = 30
MAX_DRAWDOWN_PERIODS = 5


def _d(v) -> str:
    return str(v)[:10]


def _days_between(a: str, b: str) -> int:
    try:
        return (date.fromisoformat(b) - date.fromisoformat(a)).days
    except ValueError:
        return 0


def _balances(daily: list[dict]) -> list[tuple[str, float]]:
    out = []
    for r in daily:
        try:
            out.append((_d(r.get("date")), float(r.get("balance"))))
        except (TypeError, ValueError):
            continue
    return out


def _daily_returns(pts: list[tuple[str, float]]) -> tuple[list[str], np.ndarray]:
    dates, rets = [], []
    for i in range(1, len(pts)):
        prev = pts[i - 1][1]
        if prev:
            dates.append(pts[i][0])
            rets.append(pts[i][1] / prev - 1)
    return dates, np.asarray(rets, dtype=float)


# --- calendar & curve analytics -------------------------------------------

def monthly_returns(pts: list[tuple[str, float]]) -> list[dict]:
    """Month-over-month compounded return, from each month's closing balance."""
    if not pts:
        return []
    last_of_month: dict[str, float] = {}
    for d, b in pts:
        last_of_month[d[:7]] = b
    out = []
    prev = pts[0][1]
    for m in sorted(last_of_month):
        b = last_of_month[m]
        ret = (b / prev - 1) * 100 if prev else 0.0
        out.append({"year": int(m[:4]), "month": int(m[5:7]), "return": round(ret, 2)})
        prev = b
    return out


def drawdown_periods(pts: list[tuple[str, float]]) -> list[dict]:
    """The worst peak → trough → recovery stretches of the equity curve."""
    periods = []
    peak_val, peak_date = -math.inf, None
    trough_val, trough_date = math.inf, None
    in_dd = False
    for d, b in pts:
        if b >= peak_val:
            if in_dd and peak_val > 0:
                periods.append({
                    "start": peak_date, "trough": trough_date, "recovery": d,
                    "depth": round((trough_val / peak_val - 1) * 100, 2),
                    "days": _days_between(peak_date, d),
                })
                in_dd = False
            peak_val, peak_date = b, d
            trough_val = b
        else:
            in_dd = True
            if b < trough_val:
                trough_val, trough_date = b, d
    if in_dd and peak_val > 0:  # still underwater at the end
        periods.append({
            "start": peak_date, "trough": trough_date, "recovery": None,
            "depth": round((trough_val / peak_val - 1) * 100, 2),
            "days": _days_between(peak_date, pts[-1][0]),
        })
    periods.sort(key=lambda p: p["depth"])
    return periods[:MAX_DRAWDOWN_PERIODS]


def return_distribution(rets: np.ndarray) -> dict | None:
    if len(rets) < 5:
        return None
    pct = rets * 100
    counts, edges = np.histogram(pct, bins=HISTOGRAM_BINS)
    var_95 = float(np.percentile(pct, 5))
    tail = pct[pct <= var_95]  # the worst 5% of days
    return {
        "bins": [
            {"x0": round(float(edges[i]), 3), "x1": round(float(edges[i + 1]), 3), "count": int(c)}
            for i, c in enumerate(counts)
        ],
        "mean": round(float(pct.mean()), 3),
        "std": round(float(pct.std(ddof=1)), 3),
        "skew": round(float(skew(pct)), 2),
        "kurtosis": round(float(kurtosis(pct)), 2),  # excess
        "var_95": round(var_95, 3),
        "cvar_95": round(float(tail.mean()) if len(tail) else var_95, 3),  # avg loss beyond VaR
        "best": round(float(pct.max()), 3),
        "worst": round(float(pct.min()), 3),
    }


def risk_ratios(pts: list[tuple[str, float]], rets: np.ndarray) -> dict | None:
    """Downside-aware ratios institutions expect alongside Sharpe.

    Sortino uses downside deviation only (upside volatility isn't risk); Calmar
    is annualised return over the worst drawdown (return per unit of pain).
    """
    if len(rets) < 5 or len(pts) < 2:
        return None
    bals = np.array([b for _, b in pts], dtype=float)
    annual_return = (bals[-1] / bals[0] - 1) / len(rets) * ANNUAL_DAYS
    max_dd = abs(float((bals / np.maximum.accumulate(bals) - 1).min()))
    downside = rets[rets < 0]
    dstd = float(downside.std(ddof=1)) if len(downside) > 1 else 0.0
    return {
        "sortino": round(float(rets.mean() / dstd * math.sqrt(ANNUAL_DAYS)), 2) if dstd > 0 else None,
        "calmar": round(float(annual_return / max_dd), 2) if max_dd > 0 else None,
    }


def rolling_sharpe(dates: list[str], rets: np.ndarray, window: int = ROLLING_WINDOW) -> list[dict]:
    if len(rets) < window + 1:
        return []
    out = []
    for i in range(window, len(rets) + 1):
        w = rets[i - window:i]
        sd = w.std(ddof=1)
        sr = float(w.mean() / sd * math.sqrt(ANNUAL_DAYS)) if sd > 0 else 0.0
        out.append({"date": dates[i - 1], "sharpe": round(sr, 3)})
    return out


# --- trade round trips -----------------------------------------------------

def round_trips(trades: list[dict]) -> list[dict]:
    """Pair fills into completed round-trip trades, FIFO per symbol.

    Matching is by position sign, not vnpy offsets: an opposite-direction fill
    closes the oldest open lot first; any remainder opens a new lot.
    """
    lots: dict[str, deque] = defaultdict(deque)  # symbol -> [sign, price, volume, datetime]
    trips = []
    for t in sorted(trades, key=lambda x: x["datetime"]):
        sign = 1 if t["direction"] == "LONG" else -1
        vol = float(t["volume"])
        q = lots[t["symbol"]]
        while vol > 1e-9 and q and q[0][0] != sign:
            lot = q[0]
            take = min(vol, lot[2])
            pnl = (float(t["price"]) - lot[1]) * take * lot[0]
            entry_d, exit_d = _d(lot[3]), _d(t["datetime"])
            trips.append({
                "symbol": t["symbol"],
                "direction": "long" if lot[0] == 1 else "short",
                "entry_date": entry_d,
                "exit_date": exit_d,
                "entry_price": round(lot[1], 4),
                "exit_price": round(float(t["price"]), 4),
                "volume": round(take, 4),
                "pnl": round(pnl, 2),
                "return_pct": round((float(t["price"]) / lot[1] - 1) * 100 * lot[0], 2) if lot[1] else 0.0,
                "holding_days": _days_between(entry_d, exit_d),
            })
            lot[2] -= take
            vol -= take
            if lot[2] <= 1e-9:
                q.popleft()
        if vol > 1e-9:
            q.append([sign, float(t["price"]), vol, t["datetime"]])
    return trips


def trade_stats(trips: list[dict]) -> dict | None:
    if not trips:
        return None
    pnls = [t["pnl"] for t in trips]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]
    gross_win = sum(wins)
    gross_loss = abs(sum(losses))
    return {
        "count": len(trips),
        "win_rate": round(len(wins) / len(trips) * 100, 1),
        "profit_factor": round(gross_win / gross_loss, 2) if gross_loss > 0 else None,
        "avg_win": round(gross_win / len(wins), 2) if wins else 0.0,
        "avg_loss": round(-gross_loss / len(losses), 2) if losses else 0.0,
        "expectancy": round(sum(pnls) / len(trips), 2),
        "best": round(max(pnls), 2),
        "worst": round(min(pnls), 2),
        "avg_holding_days": round(sum(t["holding_days"] for t in trips) / len(trips), 1),
    }


# --- entry point -----------------------------------------------------------

def compute(daily: list[dict], trades: list[dict]) -> dict:
    pts = _balances(daily)
    dates, rets = _daily_returns(pts)
    trips = round_trips(trades)
    return {
        "monthly_returns": monthly_returns(pts),
        "drawdown_periods": drawdown_periods(pts),
        "return_distribution": return_distribution(rets),
        "risk_ratios": risk_ratios(pts, rets),
        "rolling_sharpe": rolling_sharpe(dates, rets),
        "trade_stats": trade_stats(trips),
        "round_trips": trips[-200:],  # cap the payload; newest are most relevant
        "trade_pnls": [t["pnl"] for t in trips],  # feeds the Monte Carlo trade shuffle
    }
