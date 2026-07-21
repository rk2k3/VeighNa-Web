"""Parameter optimization for saved strategies, via Optuna.

Given a saved strategy (single-stock DSL or portfolio), search its tunable
parameters over an in-sample window and report how each trial also does on a
held-out out-of-sample window — so curve-fit results are visible at a glance.
Nothing is written back; the caller just gets a ranked table.

Kept as a single in-sample/out-of-sample split for now. Walk-forward would wrap
the same objective/knob machinery in a loop over rolling (train, test) windows.
"""

import copy
from datetime import datetime

import optuna

from services import backtest_service, saved_portfolio_service, saved_stock_service

optuna.logging.set_verbosity(optuna.logging.WARNING)

DEFAULT_CAPITAL = 100000
DEFAULT_TRIALS = 20
MAX_TRIALS = 200
TARGETS = ("sharpe_ratio", "total_return", "annual_return")

# Recommendation tuning.
MIN_TRADES = 10       # below this an in-sample metric is too noisy to trust


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


# --- backtest wrappers ----------------------------------------------------

def _run_stock(dsl: dict, start: str, end: str) -> dict:
    res = backtest_service.run_single_backtest(
        symbol=dsl["symbol"], exchange=dsl.get("exchange", "NASDAQ"),
        start=start, end=end, strategy="dsl_strategy",
        capital=DEFAULT_CAPITAL, params={"dsl": dsl},
    )
    return _metrics(res["statistics"])


def _run_portfolio(saved: dict, params: dict, start: str, end: str) -> dict:
    res = backtest_service.run_portfolio_backtest(
        symbols=saved["symbols"], exchange=saved.get("exchange", "NASDAQ"),
        start=start, end=end, capital=saved.get("capital", 100000),
        strategy=saved["strategy"], params=params,
    )
    return _metrics(res["statistics"])


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

    def norm(row) -> list[float]:
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

    coords = [norm(t) for t in trials]
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
    oos_v = chosen["out_sample"].get(target, 0.0)
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
        "out_sample": chosen["out_sample"],
        "robustness_score": _round(best["robustness"]),
        "oos_pass": oos_pass,
        "reasons": reasons,
    }


def run_optimization(kind: str, strategy_id: str, start: str, end: str, split: str,
                     n_trials: int = DEFAULT_TRIALS, target: str = "sharpe_ratio") -> dict:
    _validate(kind, target, start, split, end)
    base = _load(kind, strategy_id)
    n_trials = max(1, min(int(n_trials), MAX_TRIALS))

    if kind == "stock":
        knobs = _dsl_knobs(base["dsl"])
        base_config = base["dsl"]
        suggest = lambda t: _suggest_dsl(t, base["dsl"], knobs)  # noqa: E731
        run_in = lambda cfg: _run_stock(cfg, start, split)       # noqa: E731
        run_out = lambda cfg: _run_stock(cfg, split, end)        # noqa: E731
    else:
        knobs = _portfolio_knobs(base["params"], len(base["symbols"]))
        base_config = base["params"]
        suggest = lambda t: _suggest_portfolio(t, base["params"], knobs)  # noqa: E731
        run_in = lambda cfg: _run_portfolio(base, cfg, start, split)      # noqa: E731
        run_out = lambda cfg: _run_portfolio(base, cfg, split, end)       # noqa: E731

    if not knobs:
        raise RuntimeError("This strategy has no tunable parameters to optimize.")

    def objective(trial) -> float:
        cfg = suggest(trial)
        try:
            ins, outs = run_in(cfg), run_out(cfg)
        except Exception:
            return -1e9
        trial.set_user_attr("in_sample", ins)
        trial.set_user_attr("out_sample", outs)
        return ins.get(target, -1e9)

    study = optuna.create_study(direction="maximize")
    study.optimize(objective, n_trials=n_trials)

    trials = []
    for t in study.trials:
        if t.value is None or t.value <= -1e9:
            continue  # a trial whose backtest errored out
        trials.append({
            "params": {name: _round(v) for name, v in t.params.items()},
            "in_sample": t.user_attrs.get("in_sample", {}),
            "out_sample": t.user_attrs.get("out_sample", {}),
        })
    trials.sort(key=lambda r: r["in_sample"].get(target, -1e9), reverse=True)

    # The strategy's current (unoptimized) params over the same two windows,
    # so the user can see whether optimizing actually helped.
    try:
        baseline = {
            "params": {k["name"]: _round(k["current"]) for k in knobs},
            "in_sample": run_in(base_config),
            "out_sample": run_out(base_config),
        }
    except Exception:
        baseline = None

    return {
        "kind": kind,
        "target": target,
        "param_names": [k["name"] for k in knobs],
        "in_sample_period": {"start": start, "end": split},
        "out_sample_period": {"start": split, "end": end},
        "baseline": baseline,
        "recommendation": _recommend(trials, knobs, target),
        "trials": trials,
    }


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

    if kind == "stock":
        knobs = _dsl_knobs(base["dsl"])
    else:
        knobs = _portfolio_knobs(base["params"], len(base["symbols"]))
    if not knobs:
        raise RuntimeError("This strategy has no tunable parameters to analyze.")

    def build_cfg(overrides: dict):
        vals = {**candidate, **overrides}
        if kind == "stock":
            cfg = copy.deepcopy(base["dsl"])
            for k in knobs:
                if k["name"] in vals:
                    _set_path(cfg, k["path"], _coerce(k, vals[k["name"]]))
            return cfg
        params = dict(base["params"])
        for k in knobs:
            if k["name"] in vals:
                params[k["name"]] = _coerce(k, vals[k["name"]])
        return params

    def run_in(cfg):
        return _run_stock(cfg, start, split) if kind == "stock" else _run_portfolio(base, cfg, start, split)

    def run_out(cfg):
        return _run_stock(cfg, split, end) if kind == "stock" else _run_portfolio(base, cfg, split, end)

    cand_cfg = build_cfg({})
    cand_in, cand_out = run_in(cand_cfg), run_out(cand_cfg)

    curves = []
    for k in knobs:
        points = []
        for v in _sweep_values(k, steps):
            try:
                metric = run_in(build_cfg({k["name"]: v})).get(target, 0.0)
            except Exception:
                metric = 0.0
            points.append({"value": _round(v), "metric": metric})
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
