"""Monte Carlo stress test of a backtest result.

Resamples the realised backtest — never re-runs it — to show the *range* of
outcomes consistent with the strategy's own returns, instead of the single
path that happened to occur:

- ``bootstrap``: i.i.d. resample of daily returns. Simple, but destroys serial
  structure (momentum, volatility clustering).
- ``block``: circular block bootstrap of daily returns — samples runs of
  consecutive days, preserving short-term structure. The default.
- ``trades``: replay the strategy's completed round-trip P&Ls in random order.
  Isolates sequence risk: "same trades, unlucky ordering".

Output is a fan of equity paths summarised as percentile bands, plus the
distribution of final returns and max drawdowns across simulations.
"""

import numpy as np

DEFAULT_SIMS = 1000
MAX_SIMS = 5000
DEFAULT_BLOCK = 10
PERCENTILES = (5, 25, 50, 75, 95)
HISTOGRAM_BINS = 30


def _num(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _curve_returns(curve: list[dict]) -> tuple[list[str], np.ndarray, float]:
    """Dates, daily returns and starting capital from a {date, balance} curve."""
    pts = [(str(p.get("date"))[:10], b) for p in curve if (b := _num(p.get("balance"))) is not None]
    if len(pts) < 3:
        raise RuntimeError("Strategy curve is too short for Monte Carlo analysis.")
    dates = [d for d, _ in pts[1:]]
    bals = np.array([b for _, b in pts], dtype=float)
    if (bals[:-1] <= 0).any():
        raise RuntimeError("Strategy curve contains non-positive balances.")
    return dates, bals[1:] / bals[:-1] - 1, float(bals[0])


def _equity_paths(method: str, rets: np.ndarray, trade_pnls: list[float],
                  capital: float, n_sims: int, block: int, rng) -> np.ndarray:
    if method == "trades":
        pnls = np.asarray(trade_pnls, dtype=float)
        if len(pnls) < 5:
            raise RuntimeError("Not enough completed trades for a trade-shuffle analysis (need 5+).")
        shuffled = rng.permuted(np.tile(pnls, (n_sims, 1)), axis=1)
        return capital + np.cumsum(shuffled, axis=1)

    t = len(rets)
    if method == "bootstrap":
        idx = rng.integers(0, t, size=(n_sims, t))
    elif method == "block":
        n_blocks = -(-t // block)  # ceil
        starts = rng.integers(0, t, size=(n_sims, n_blocks))
        idx = (starts[:, :, None] + np.arange(block)[None, None, :]) % t  # circular
        idx = idx.reshape(n_sims, n_blocks * block)[:, :t]
    else:
        raise RuntimeError("method must be 'bootstrap', 'block' or 'trades'")
    return capital * np.cumprod(1 + rets[idx], axis=1)


def run_monte_carlo(strategy_curve: list[dict], method: str = "block",
                    n_sims: int = DEFAULT_SIMS, trade_pnls: list[float] | None = None,
                    block_size: int = DEFAULT_BLOCK, seed: int = 42) -> dict:
    n_sims = max(100, min(int(n_sims), MAX_SIMS))
    block_size = max(2, min(int(block_size), 63))
    rng = np.random.default_rng(int(seed))

    dates, rets, capital = _curve_returns(strategy_curve)
    equity = _equity_paths(method, rets, trade_pnls or [], capital, n_sims, block_size, rng)

    bands_matrix = np.percentile(equity, PERCENTILES, axis=0)  # (5, T)
    n_steps = equity.shape[1]
    # Daily methods walk the real calendar; the trade shuffle walks trade numbers.
    step_dates = dates if method != "trades" and len(dates) == n_steps else None

    bands = []
    for i in range(n_steps):
        row = {"i": i, "p05": round(float(bands_matrix[0, i]), 2),
               "p25": round(float(bands_matrix[1, i]), 2),
               "p50": round(float(bands_matrix[2, i]), 2),
               "p75": round(float(bands_matrix[3, i]), 2),
               "p95": round(float(bands_matrix[4, i]), 2)}
        if step_dates:
            row["date"] = step_dates[i]
        bands.append(row)

    final_ret = (equity[:, -1] / capital - 1) * 100
    dd = equity / np.maximum.accumulate(equity, axis=1) - 1
    max_dd = dd.min(axis=1) * 100

    counts, edges = np.histogram(final_ret, bins=HISTOGRAM_BINS)
    return {
        "method": method,
        "n_sims": n_sims,
        "seed": int(seed),
        "capital": capital,
        "x_axis": "date" if step_dates else "trade #",
        "bands": bands,
        "final_return_hist": [
            {"x0": round(float(edges[i]), 2), "x1": round(float(edges[i + 1]), 2), "count": int(c)}
            for i, c in enumerate(counts)
        ],
        "stats": {
            "median_final_return": round(float(np.median(final_ret)), 2),
            "p05_final_return": round(float(np.percentile(final_ret, 5)), 2),
            "p95_final_return": round(float(np.percentile(final_ret, 95)), 2),
            "prob_loss": round(float((final_ret < 0).mean()) * 100, 1),
            "median_max_drawdown": round(float(np.median(max_dd)), 2),
            "p05_max_drawdown": round(float(np.percentile(max_dd, 5)), 2),
            "prob_dd_worse_20": round(float((max_dd <= -20).mean()) * 100, 1),
        },
    }
