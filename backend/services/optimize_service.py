"""Parameter optimization, robustness and validation for saved strategies.

Given a saved strategy (single-stock DSL or portfolio), search its tunable
parameters and report the results with enough rigour to be defensible:

- **Reproducible** — the Optuna sampler is seeded, so the same request gives the
  same result, and every run is persisted (see ``optimize_run_service``).
- **In-sample / out-of-sample** — parameters are chosen on an in-sample window
  and checked on a held-out window that never influenced the choice.
- **Walk-forward** — rolling (train, test) windows produce a stitched
  out-of-sample equity curve and a walk-forward efficiency number.
- **Overfitting statistics** — the Probability of Backtest Overfitting (PBO, via
  CSCV) and the Deflated Sharpe Ratio quantify how much the winning result is
  likely a product of multiple testing rather than genuine edge.
"""

import copy
import math
from datetime import datetime, timedelta
from itertools import combinations

import numpy as np
import optuna
from scipy.stats import kurtosis, norm, skew

from services import (
    backtest_service,
    optimize_run_service,
    saved_portfolio_service,
    saved_stock_service,
)

optuna.logging.set_verbosity(optuna.logging.WARNING)

DEFAULT_CAPITAL = 100000
DEFAULT_TRIALS = 20
MAX_TRIALS = 200
DEFAULT_SEED = 42
TARGETS = ("sharpe_ratio", "total_return", "annual_return")

# Recommendation tuning.
MIN_TRADES = 10       # below this an in-sample metric is too noisy to trust

# Walk-forward defaults.
DEFAULT_WF_WINDOWS = 4    # number of out-of-sample test folds
DEFAULT_WF_TRAIN = 3      # training blocks preceding each test fold
MIN_WF_BLOCK_DAYS = 5     # a block shorter than this isn't worth backtesting


# --- metric parsing -------------------------------------------------------

def _num(stats: dict, key: str) -> float:
    try:
        return round(float(stats.get(key, 0.0)), 4)
    except (TypeError, ValueError):
        return 0.0


def _metrics(stats: dict) -> dict:
    return {
        "sharpe_ratio": _num(stats, "sharpe_ratio"),
        "total_return": _num(stats, "total_return"),
        "annual_return": _num(stats, "annual_return"),
        "max_ddpercent": _num(stats, "max_ddpercent"),
        "total_trade_count": _num(stats, "total_trade_count"),
    }


def _round(v):
    return round(v, 4) if isinstance(v, float) else v


def _coerce(knob: dict, value):
    return int(round(float(value))) if knob["type"] == "int" else float(value)


def _sweep_values(knob: dict, steps: int) -> list:
    """Evenly spaced values across a knob's range (deduped ints for int knobs)."""
    lo, hi = knob["low"], knob["high"]
    if knob["type"] == "int":
        lo, hi = int(round(lo)), int(round(hi))
        if hi <= lo:
            return [lo]
        return sorted({int(round(lo + (hi - lo) * i / (steps - 1))) for i in range(steps)})
    return [lo + (hi - lo) * i / (steps - 1) for i in range(steps)]


def _returns_from_daily(daily: list[dict]) -> list[float]:
    """Per-day simple returns from a backtest's daily balance series."""
    bals = [float(r.get("balance", 0.0) or 0.0) for r in daily]
    out = []
    for i in range(1, len(bals)):
        prev = bals[i - 1]
        out.append((bals[i] - prev) / prev if prev else 0.0)
    return out


def _date_str(v) -> str:
    try:
        return str(v)[:10]
    except Exception:
        return ""


# --- single-stock (DSL) parameter space -----------------------------------

def _dsl_knobs(dsl: dict) -> list[dict]:
    """Tunable numbers inside a DSL rule set — periods, thresholds, stops.

    The rule *structure* stays fixed; only the numbers move, each within a band
    derived from its current value.
    """
    knobs: list[dict] = []

    def consider_operand(op: dict, path: list, label: str):
        p = op.get("period")
        if isinstance(p, int) and p >= 1:
            knobs.append({
                "name": label, "path": path + ["period"], "current": p, "type": "int",
                "low": max(2, round(p * 0.5)), "high": max(3, round(p * 1.5)),
            })

    for rule_key in ("entry", "exit"):
        rule = dsl.get(rule_key) or {}
        for i, cond in enumerate(rule.get("conditions", [])):
            base = [rule_key, "conditions", i]
            # A single condition per rule reads better without the index.
            tag = rule_key if len(rule.get("conditions", [])) == 1 else f"{rule_key}[{i}]"
            left = cond.get("left")
            if isinstance(left, dict):
                consider_operand(left, base + ["left"], f"{tag} period")
            right = cond.get("right")
            if isinstance(right, dict):
                consider_operand(right, base + ["right"], f"{tag} right period")
            elif isinstance(right, (int, float)) and right != 0:
                v = float(right)
                lo, hi = sorted((v * 0.7, v * 1.3))
                knobs.append({
                    "name": f"{tag} threshold", "path": base + ["right"],
                    "current": v, "type": "float", "low": lo, "high": hi,
                })

    risk = dsl.get("risk") or {}
    for key in ("stop_loss_pct", "take_profit_pct"):
        v = risk.get(key)
        if isinstance(v, (int, float)) and v:
            knobs.append({
                "name": key, "path": ["risk", key], "current": float(v),
                "type": "float", "low": max(0.005, v * 0.5), "high": min(0.9, v * 1.5),
            })

    return knobs


def _set_path(d: dict, path: list, value) -> None:
    cur = d
    for key in path[:-1]:
        cur = cur[key]
    cur[path[-1]] = value


def _suggest_dsl(trial, base_dsl: dict, knobs: list[dict]) -> dict:
    tuned = copy.deepcopy(base_dsl)
    for k in knobs:
        if k["type"] == "int":
            v = trial.suggest_int(k["name"], k["low"], k["high"])
        else:
            v = trial.suggest_float(k["name"], k["low"], k["high"])
        _set_path(tuned, k["path"], v)
    return tuned


# --- portfolio parameter space --------------------------------------------

def _portfolio_knobs(base_params: dict, n_symbols: int) -> list[dict]:
    knobs: list[dict] = []
    if "est_win" in base_params:
        knobs.append({"name": "est_win", "current": base_params["est_win"], "type": "int", "low": 21, "high": 126})
    if "rebalance_days" in base_params:
        knobs.append({"name": "rebalance_days", "current": base_params["rebalance_days"], "type": "int", "low": 5, "high": 63})
    if "gamma" in base_params:
        knobs.append({"name": "gamma", "current": base_params["gamma"], "type": "float", "low": 1.0, "high": 10.0})
    if "w_max" in base_params:
        lo = min(max(1.0 / max(n_symbols, 1), 0.1), 0.99)
        knobs.append({"name": "w_max", "current": base_params["w_max"], "type": "float", "low": lo, "high": 1.0})
    return knobs


def _suggest_portfolio(trial, base_params: dict, knobs: list[dict]) -> dict:
    params = dict(base_params)  # carry any non-tuned params through unchanged
    for k in knobs:
        if k["type"] == "int":
            params[k["name"]] = trial.suggest_int(k["name"], k["low"], k["high"])
        else:
            params[k["name"]] = trial.suggest_float(k["name"], k["low"], k["high"])
    return params


# --- runner assembly (shared by all analyses) -----------------------------

def _runners(kind: str, base: dict):
    """Bundle the per-kind bits every analysis needs: the knob list, the base
    config, an Optuna ``suggest`` and a ``run_raw(cfg, start, end)`` backtest."""
    if kind == "stock":
        knobs = _dsl_knobs(base["dsl"])
        base_config = base["dsl"]

        def suggest(trial):
            return _suggest_dsl(trial, base["dsl"], knobs)

        def run_raw(cfg, start, end):
            return backtest_service.run_single_backtest(
                symbol=cfg["symbol"], exchange=cfg.get("exchange", "NASDAQ"),
                start=start, end=end, strategy="dsl_strategy",
                capital=DEFAULT_CAPITAL, params={"dsl": cfg},
            )
    else:
        knobs = _portfolio_knobs(base["params"], len(base["symbols"]))
        base_config = base["params"]

        def suggest(trial):
            return _suggest_portfolio(trial, base["params"], knobs)

        def run_raw(cfg, start, end):
            return backtest_service.run_portfolio_backtest(
                symbols=base["symbols"], exchange=base.get("exchange", "NASDAQ"),
                start=start, end=end, capital=base.get("capital", 100000),
                strategy=base["strategy"], params=cfg,
            )

    return knobs, base_config, suggest, run_raw


def _apply(kind: str, base: dict, knobs: list[dict], values: dict):
    """Build a runnable config by overlaying ``values`` (keyed by knob name)."""
    if kind == "stock":
        cfg = copy.deepcopy(base["dsl"])
        for k in knobs:
            if k["name"] in values:
                _set_path(cfg, k["path"], _coerce(k, values[k["name"]]))
        return cfg
    params = dict(base["params"])
    for k in knobs:
        if k["name"] in values:
            params[k["name"]] = _coerce(k, values[k["name"]])
    return params


def _search(runners, start: str, end: str, target: str, n_trials: int, seed: int,
            capture_returns: bool = False) -> list[dict]:
    """Seeded Optuna search over one window; returns trials ranked by ``target``.

    Each trial is scored purely on [start, end] — callers layer on out-of-sample
    evaluation. With ``capture_returns`` each trial also carries its per-day
    return series (used to compute overfitting statistics without extra runs).
    """
    knobs, base_config, suggest, run_raw = runners

    def objective(trial) -> float:
        cfg = suggest(trial)
        try:
            res = run_raw(cfg, start, end)
        except Exception:
            return -1e9
        m = _metrics(res["statistics"])
        trial.set_user_attr("m", m)
        trial.set_user_attr("p", {n: _round(v) for n, v in trial.params.items()})
        if capture_returns:
            trial.set_user_attr("r", _returns_from_daily(res["daily_results"]))
        return m.get(target, -1e9)

    study = optuna.create_study(direction="maximize",
                                sampler=optuna.samplers.TPESampler(seed=seed))
    study.optimize(objective, n_trials=n_trials)

    out = []
    for t in study.trials:
        if t.value is None or t.value <= -1e9:
            continue  # a trial whose backtest errored out
        row = {"params": t.user_attrs.get("p", {}), "in_sample": t.user_attrs.get("m", {})}
        if capture_returns:
            row["returns"] = t.user_attrs.get("r", [])
        out.append(row)
    out.sort(key=lambda r: r["in_sample"].get(target, -1e9), reverse=True)
    return out


# --- orchestration --------------------------------------------------------

def _load(kind: str, strategy_id: str) -> dict:
    if kind == "stock":
        for r in saved_stock_service.list_saved():
            if r["id"] == strategy_id:
                return r
    else:
        rec = saved_portfolio_service.get_saved(strategy_id)
        if rec:
            return rec
    raise RuntimeError("Saved strategy not found")


def _strategy_name(kind: str, base: dict) -> str:
    if kind == "stock":
        return (base.get("dsl") or {}).get("name") or "stock strategy"
    return base.get("name") or "portfolio strategy"


def _persist_run(run_type: str, kind: str, base: dict, strategy_id: str,
                 request: dict, result: dict) -> None:
    """Save an audit record of the run. Persistence must never break a response."""
    try:
        optimize_run_service.create_run({
            "type": run_type,
            "kind": kind,
            "strategy_id": strategy_id,
            "strategy_name": _strategy_name(kind, base),
            "request": request,
            "result": result,
        })
    except Exception:
        pass


def _validate(kind: str, target: str, start: str, split: str, end: str) -> None:
    if kind not in ("stock", "portfolio"):
        raise RuntimeError("kind must be 'stock' or 'portfolio'")
    if target not in TARGETS:
        raise RuntimeError(f"target must be one of {', '.join(TARGETS)}")
    try:
        s, m, e = (datetime.fromisoformat(x) for x in (start, split, end))
    except ValueError:
        raise RuntimeError("start, split and end must be ISO dates (YYYY-MM-DD)")
    if not (s < m < e):
        raise RuntimeError("Dates must satisfy start < split < end")


def _recommend(trials: list[dict], knobs: list[dict], target: str) -> dict | None:
    """Pick a robust parameter set from the trials using IN-SAMPLE data only.

    We deliberately do not choose by the raw in-sample peak (the classic
    curve-fit trap) nor by the out-of-sample score (that would quietly turn the
    held-out window into a second optimizer). Instead we reward a parameter set
    that sits on a *plateau* — whose nearest neighbours in parameter space also
    score well — and that traded often enough to be meaningful. Out-of-sample is
    then reported as an after-the-fact validation gate, never as a selector.
    """
    if not trials:
        return None

    ranges = {k["name"]: (k["low"], k["high"]) for k in knobs}
    names = [k["name"] for k in knobs]

    def norm_coords(row) -> list[float]:
        """Trial's params mapped into [0, 1] per knob range, so distances compare."""
        coords = []
        for n in names:
            lo, hi = ranges[n]
            span = hi - lo
            v = row["params"].get(n, lo)
            coords.append((v - lo) / span if span else 0.0)
        return coords

    def dist(a: list[float], b: list[float]) -> float:
        return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5

    coords = [norm_coords(t) for t in trials]
    vals = [t["in_sample"].get(target, 0.0) for t in trials]

    # Adaptive kernel bandwidth = median spacing between trials, so the notion of
    # "nearby" scales with how densely the search sampled the space (and with the
    # number of parameters), instead of a hand-picked radius.
    pd = sorted(d for i in range(len(coords)) for j in range(i + 1, len(coords))
                if (d := dist(coords[i], coords[j])) > 0)
    bw = pd[len(pd) // 2] if pd else 1.0

    scored = []
    for i, t in enumerate(trials):
        self_val = vals[i]
        # Distance-weighted mean of the *other* trials: how good is the region
        # around this set. Far trials count for almost nothing, so an isolated
        # spike is judged by its (weak) immediate surroundings, not by distant
        # high scorers that merely happen to be its 3 nearest on a sparse grid.
        wsum = nsum = 0.0
        for j in range(len(trials)):
            if j == i:
                continue
            w = 2.718281828 ** (-((dist(coords[i], coords[j]) / bw) ** 2))
            wsum += w
            nsum += w * vals[j]
        neigh = nsum / wsum if wsum else self_val
        # A set must be good AND sit in a good region — the weaker of the two.
        robustness = min(self_val, neigh)
        scored.append({
            "index": i, "self": self_val, "neigh": neigh, "robustness": robustness,
            "trades": int(t["in_sample"].get("total_trade_count", 0)),
        })

    # Prefer trials that traded enough; fall back to all if none clear the bar.
    eligible = [s for s in scored if s["trades"] >= MIN_TRADES] or scored
    best = max(eligible, key=lambda s: s["robustness"])
    chosen = trials[best["index"]]

    reasons: list[str] = []

    # Plateau vs isolated spike: how far the neighbourhood falls below this set's
    # own score, relative to its scale.
    self_val = best["self"]
    scale = abs(self_val) if abs(self_val) > 1e-9 else 1.0
    rel_gap = max(0.0, (self_val - best["neigh"]) / scale)
    if rel_gap <= 0.15:
        reasons.append("Sits on a plateau — its nearest neighbours score almost as well, so "
                       "small parameter changes won't break it.")
    elif rel_gap <= 0.35:
        reasons.append("Reasonably stable — neighbouring parameter sets score a little lower "
                       "but there's no cliff nearby.")
    else:
        reasons.append("⚠ Somewhat isolated peak — nearby parameter sets score much lower, so "
                       "this may be curve-fit; sanity-check it before trusting it.")

    # Trade count.
    tr = best["trades"]
    if tr >= MIN_TRADES:
        reasons.append(f"{tr} trades in-sample — enough for the metric to mean something.")
    else:
        reasons.append(f"⚠ Only {tr} trades in-sample — too few to be statistically reliable.")

    # Out-of-sample validation gate (reported after the choice, not used to make it).
    is_v = chosen["in_sample"].get(target, 0.0)
    oos_v = chosen.get("out_sample", {}).get(target, 0.0)
    oos_pass = oos_v >= 0.5 * is_v if is_v > 0 else oos_v >= is_v
    if oos_pass:
        reasons.append(f"Holds up out-of-sample ({oos_v:.2f} vs {is_v:.2f} in-sample).")
    else:
        reasons.append(f"⚠ Weakens out-of-sample ({oos_v:.2f} vs {is_v:.2f} in-sample) — "
                       "validate before relying on it.")

    return {
        "index": best["index"],
        "params": chosen["params"],
        "in_sample": chosen["in_sample"],
        "out_sample": chosen.get("out_sample", {}),
        "robustness_score": _round(best["robustness"]),
        "oos_pass": oos_pass,
        "reasons": reasons,
    }


# --- overfitting statistics (PBO via CSCV, Deflated Sharpe Ratio) ----------

def _daily_sharpe(returns: np.ndarray) -> float:
    sd = returns.std(ddof=1)
    return float(returns.mean() / sd) if sd > 0 else float("-inf")


def _deflated_sharpe(returns_matrix: list[list[float]], chosen_idx: int | None = None) -> dict | None:
    """Deflated Sharpe Ratio (Bailey & López de Prado, 2014).

    Discounts the *selected* strategy's Sharpe by the Sharpe you'd expect to see
    as the maximum of N random trials, then returns the probability its true
    Sharpe is still positive. The deflation term always reflects the full search
    (N trials, their Sharpe variance); what varies is which config we call the
    "selected" one:

    - ``chosen_idx`` given → evaluate the **recommended** config, so DSR describes
      the strategy you'd actually deploy (consistent with walk-forward).
    - otherwise → fall back to the in-sample **peak**, the classic worst-case.

    All Sharpes are per-observation (daily), computed from the return series so
    they're on the same footing as the deflation term.
    """
    sr_list, valid = [], []  # valid: (index, daily_sharpe, returns_array)
    for i, r in enumerate(returns_matrix):
        if not r or len(r) < 3:
            continue
        a = np.asarray(r, dtype=float)
        s = _daily_sharpe(a)
        if not math.isfinite(s):
            continue
        sr_list.append(s)
        valid.append((i, s, a))

    n = len(sr_list)
    if n < 2:
        return None
    var_sr = float(np.var(sr_list, ddof=1))
    if var_sr <= 0:
        return None

    # Selected strategy: the recommended config if we have a valid one, else the peak.
    sel = next(((s, a) for (i, s, a) in valid if i == chosen_idx), None) if chosen_idx is not None else None
    basis = "recommended" if sel is not None else "peak"
    sel_sr, sel_r = sel if sel is not None else max(valid, key=lambda x: x[1])[1:]

    gamma = 0.5772156649015329  # Euler–Mascheroni
    # Expected maximum Sharpe of n independent trials with true SR = 0.
    sr0 = math.sqrt(var_sr) * (
        (1 - gamma) * norm.ppf(1 - 1.0 / n) + gamma * norm.ppf(1 - 1.0 / (n * math.e))
    )

    t = len(sel_r)
    sk = float(skew(sel_r))
    ku = float(kurtosis(sel_r, fisher=False))  # non-excess kurtosis
    denom = 1 - sk * sel_sr + ((ku - 1) / 4) * sel_sr ** 2
    if denom <= 0 or t < 3:
        return None
    dsr = float(norm.cdf(((sel_sr - sr0) * math.sqrt(t - 1)) / math.sqrt(denom)))
    return {
        "deflated_sharpe": round(dsr, 4),
        "dsr_basis": basis,
        "selected_sharpe_daily": round(sel_sr, 4),
        "expected_max_sharpe_daily": round(float(sr0), 4),
        "n_configs": n,
        "n_obs": t,
    }


def _pbo(returns_matrix: list[list[float]]) -> float | None:
    """Probability of Backtest Overfitting via Combinatorially Symmetric CV.

    Split the return history into S blocks; for every way of choosing S/2 blocks
    as the training set, find the config that looks best in-sample and see where
    it ranks out-of-sample. PBO is the fraction of splits where the in-sample
    winner lands below the out-of-sample median — i.e. selection didn't
    generalise.
    """
    rets = [r for r in returns_matrix if r and len(r) >= 4]
    if len(rets) < 2:
        return None
    t = min(len(r) for r in rets)
    if t < 4:
        return None
    m = np.array([r[:t] for r in rets], dtype=float).T  # (T, N)
    n = m.shape[1]

    s = min(10, t)
    if s % 2:
        s -= 1
    if s < 4 or t < s:
        return None

    bounds = [round(i * t / s) for i in range(s + 1)]
    groups = [list(range(bounds[i], bounds[i + 1])) for i in range(s)]

    def sharpe(rows) -> np.ndarray:
        sub = m[rows]
        mu = sub.mean(axis=0)
        sd = sub.std(axis=0, ddof=1)
        with np.errstate(divide="ignore", invalid="ignore"):
            return np.where(sd > 0, mu / sd, -np.inf)

    lambdas = []
    for combo in combinations(range(s), s // 2):
        train_rows = [i for g in combo for i in groups[g]]
        test_rows = [i for g in range(s) if g not in combo for i in groups[g]]
        tr, te = sharpe(train_rows), sharpe(test_rows)
        n_star = int(np.argmax(tr))
        rank = int(np.argsort(np.argsort(te))[n_star]) + 1  # 1 = worst … N = best
        omega = min(max(rank / (n + 1), 1e-6), 1 - 1e-6)
        lambdas.append(math.log(omega / (1 - omega)))

    if not lambdas:
        return None
    return round(sum(1 for x in lambdas if x <= 0) / len(lambdas), 4)


def _overfitting_stats(returns_matrix: list[list[float]], chosen_idx: int | None = None) -> dict:
    # DSR describes the *recommended* config; PBO stays a property of the
    # in-sample-argmax selection rule (the search's inherent overfitting risk).
    dsr = _deflated_sharpe(returns_matrix, chosen_idx)
    pbo = _pbo(returns_matrix)
    if dsr is None and pbo is None:
        return {"note": "Not enough trials or price history to assess overfitting."}
    out = {"pbo": pbo}
    if dsr:
        out.update(dsr)
    return out


# --- public: parameter optimization ---------------------------------------

def run_optimization(kind: str, strategy_id: str, start: str, end: str, split: str,
                     n_trials: int = DEFAULT_TRIALS, target: str = "sharpe_ratio",
                     seed: int = DEFAULT_SEED) -> dict:
    _validate(kind, target, start, split, end)
    base = _load(kind, strategy_id)
    n_trials = max(1, min(int(n_trials), MAX_TRIALS))
    seed = int(seed)

    runners = _runners(kind, base)
    knobs, base_config, suggest, run_raw = runners
    if not knobs:
        raise RuntimeError("This strategy has no tunable parameters to optimize.")

    trials = _search(runners, start, split, target, n_trials, seed, capture_returns=True)
    for t in trials:
        cfg = _apply(kind, base, knobs, t["params"])
        try:
            t["out_sample"] = _metrics(run_raw(cfg, split, end)["statistics"])
        except Exception:
            t["out_sample"] = {}
    returns_matrix = [t.pop("returns", []) for t in trials]

    recommendation = _recommend(trials, knobs, target)
    overfitting = _overfitting_stats(
        returns_matrix, recommendation["index"] if recommendation else None
    )

    # The strategy's current (unoptimized) params over the same two windows.
    try:
        baseline = {
            "params": {k["name"]: _round(k["current"]) for k in knobs},
            "in_sample": _metrics(run_raw(base_config, start, split)["statistics"]),
            "out_sample": _metrics(run_raw(base_config, split, end)["statistics"]),
        }
    except Exception:
        baseline = None

    result = {
        "kind": kind,
        "target": target,
        "seed": seed,
        "param_names": [k["name"] for k in knobs],
        "in_sample_period": {"start": start, "end": split},
        "out_sample_period": {"start": split, "end": end},
        "baseline": baseline,
        "recommendation": recommendation,
        "overfitting": overfitting,
        "trials": trials,
    }
    _persist_run("optimization", kind, base, strategy_id,
                 {"start": start, "split": split, "end": end,
                  "n_trials": n_trials, "target": target, "seed": seed},
                 result)
    return result


# --- public: apply recommended parameters ----------------------------------

def apply_params(kind: str, strategy_id: str, params: dict) -> dict:
    """Write a set of knob values (keyed by knob name) back into the saved strategy.

    The knob-name → config mapping (DSL paths / portfolio param keys) lives here,
    not in the frontend, so this is the only safe way to persist a recommendation.
    Values are coerced to each knob's type; unknown names are ignored.
    """
    if kind not in ("stock", "portfolio"):
        raise RuntimeError("kind must be 'stock' or 'portfolio'")
    if not params:
        raise RuntimeError("No parameters to apply")
    base = _load(kind, strategy_id)
    knobs, _, _, _ = _runners(kind, base)
    if not knobs:
        raise RuntimeError("This strategy has no tunable parameters.")

    cfg = _apply(kind, base, knobs, params)
    if kind == "stock":
        updated = saved_stock_service.update_saved(strategy_id, cfg)
    else:
        updated = saved_portfolio_service.update_saved(strategy_id, {"params": cfg})
    if updated is None:
        raise RuntimeError("Saved strategy not found")
    return updated


# --- public: walk-forward validation --------------------------------------

def _wf_windows(start: str, end: str, n_windows: int, train_windows: int) -> list[tuple]:
    """Rolling (train, test) windows tiling the range into equal blocks.

    The timeline is cut into ``n_windows + train_windows`` equal blocks. Each
    step trains on ``train_windows`` consecutive blocks and tests on the block
    immediately after, then slides forward one block — so the test blocks are
    contiguous and together cover the back of the range up to ``end``.
    """
    s = datetime.fromisoformat(start)
    e = datetime.fromisoformat(end)
    total = (e - s).days
    blocks = n_windows + train_windows
    if blocks <= 0 or total / blocks < MIN_WF_BLOCK_DAYS:
        return []
    block = total / blocks

    def d(x: float) -> str:
        return (s + timedelta(days=round(x * block))).date().isoformat()

    windows = []
    for i in range(n_windows):
        windows.append((d(i), d(i + train_windows), d(i + train_windows), d(i + train_windows + 1)))
    # Pin the final test end exactly to `end` (rounding can drift a day).
    tr_s, tr_e, te_s, _ = windows[-1]
    windows[-1] = (tr_s, tr_e, te_s, e.date().isoformat())
    return windows


def _walk_forward_efficiency(steps: list[dict], target: str) -> float | None:
    trains = [s["train_metric"] for s in steps if s.get("train_metric") is not None]
    tests = [s["test_metrics"].get(target) for s in steps
             if s.get("test_metrics", {}).get(target) is not None]
    if not trains or not tests:
        return None
    mean_train = sum(trains) / len(trains)
    if mean_train == 0:
        return None
    return round((sum(tests) / len(tests)) / mean_train, 4)


def run_walk_forward(kind: str, strategy_id: str, start: str, end: str,
                     n_windows: int = DEFAULT_WF_WINDOWS, train_windows: int = DEFAULT_WF_TRAIN,
                     n_trials: int = DEFAULT_TRIALS, target: str = "sharpe_ratio",
                     seed: int = DEFAULT_SEED) -> dict:
    if kind not in ("stock", "portfolio"):
        raise RuntimeError("kind must be 'stock' or 'portfolio'")
    if target not in TARGETS:
        raise RuntimeError(f"target must be one of {', '.join(TARGETS)}")
    try:
        s, e = datetime.fromisoformat(start), datetime.fromisoformat(end)
    except ValueError:
        raise RuntimeError("start and end must be ISO dates (YYYY-MM-DD)")
    if s >= e:
        raise RuntimeError("start must be before end")

    n_windows = max(2, min(int(n_windows), 12))
    train_windows = max(1, min(int(train_windows), 6))
    windows = _wf_windows(start, end, n_windows, train_windows)
    if not windows:
        raise RuntimeError("Date range is too short for that many walk-forward windows.")

    base = _load(kind, strategy_id)
    n_trials = max(1, min(int(n_trials), MAX_TRIALS))
    seed = int(seed)
    runners = _runners(kind, base)
    knobs, base_config, suggest, run_raw = runners
    if not knobs:
        raise RuntimeError("This strategy has no tunable parameters to optimize.")

    steps, equity, running = [], [], 1.0
    for tr_s, tr_e, te_s, te_e in windows:
        trials = _search(runners, tr_s, tr_e, target, n_trials, seed)
        rec = _recommend(trials, knobs, target)
        chosen = rec["params"] if rec else (trials[0]["params"] if trials else {})
        train_metric = (rec["in_sample"].get(target) if rec
                        else (trials[0]["in_sample"].get(target) if trials else None))

        cfg = _apply(kind, base, knobs, chosen)
        try:
            test_res = run_raw(cfg, te_s, te_e)
            test_metrics = _metrics(test_res["statistics"])
            daily = test_res["daily_results"]
        except Exception:
            test_metrics, daily = {}, []

        # Chain this test window's daily returns onto the running OOS equity.
        for row, r in zip(daily[1:], _returns_from_daily(daily)):
            running *= (1 + r)
            equity.append({"date": _date_str(row.get("date")), "equity": round(running, 6)})

        steps.append({
            "train_period": {"start": tr_s, "end": tr_e},
            "test_period": {"start": te_s, "end": te_e},
            "params": chosen,
            "train_metric": _round(train_metric) if train_metric is not None else None,
            "test_metrics": test_metrics,
        })

    test_vals = [s["test_metrics"].get(target, 0.0) for s in steps]
    result = {
        "kind": kind,
        "target": target,
        "seed": seed,
        "period": {"start": start, "end": end},
        "n_windows": len(windows),
        "train_windows": train_windows,
        "param_names": [k["name"] for k in knobs],
        "steps": steps,
        "equity_curve": equity,
        "walk_forward_efficiency": _walk_forward_efficiency(steps, target),
        "avg_test_metric": round(sum(test_vals) / len(test_vals), 4) if test_vals else None,
        "windows_positive": sum(1 for v in test_vals if v > 0),
    }
    _persist_run("walk_forward", kind, base, strategy_id,
                 {"start": start, "end": end, "n_windows": n_windows,
                  "train_windows": train_windows, "n_trials": n_trials,
                  "target": target, "seed": seed},
                 result)
    return result


# --- public: parameter sensitivity ----------------------------------------

def run_sensitivity(kind: str, strategy_id: str, start: str, end: str, split: str,
                    candidate: dict, target: str = "sharpe_ratio", steps: int = 9) -> dict:
    """Sweep each parameter around a chosen candidate to reveal plateau vs spike.

    Purely an in-sample analysis (the out-of-sample window must not influence how
    you *pick* parameters). For each knob we vary it across its range while the
    others stay at the candidate's values, and record the in-sample metric — a
    flat curve means robust, a sharp peak means fragile. The candidate's own
    in-/out-of-sample numbers are returned too, as its final verdict.
    """
    _validate(kind, target, start, split, end)
    base = _load(kind, strategy_id)
    steps = max(3, min(int(steps), 21))
    runners = _runners(kind, base)
    knobs, base_config, suggest, run_raw = runners
    if not knobs:
        raise RuntimeError("This strategy has no tunable parameters to analyze.")

    def metric_in(values: dict) -> float:
        try:
            return _metrics(run_raw(_apply(kind, base, knobs, values), start, split)["statistics"]).get(target, 0.0)
        except Exception:
            return 0.0

    def window(values: dict, a: str, b: str) -> dict:
        return _metrics(run_raw(_apply(kind, base, knobs, values), a, b)["statistics"])

    cand_in, cand_out = window(candidate, start, split), window(candidate, split, end)

    curves = []
    for k in knobs:
        points = [{"value": _round(v), "metric": metric_in({**candidate, k["name"]: v})}
                  for v in _sweep_values(k, steps)]
        current = _round(_coerce(k, candidate.get(k["name"], k["current"])))
        curves.append({"name": k["name"], "current": current, "points": points})

    return {
        "target": target,
        "candidate": {
            "params": {k["name"]: _round(_coerce(k, candidate.get(k["name"], k["current"]))) for k in knobs},
            "in_sample": cand_in,
            "out_sample": cand_out,
        },
        "curves": curves,
    }
