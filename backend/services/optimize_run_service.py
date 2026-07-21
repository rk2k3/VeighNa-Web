"""Persistence for optimization & walk-forward runs — the audit trail.

Every optimization/walk-forward run is saved here with its full request
(including the RNG seed) and result, so a run is reproducible and reviewable
after the fact. Same flat-JSON approach as the saved-strategy stores.
"""

import json
import os
import uuid
from datetime import datetime, timezone
from threading import Lock

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
STORE_PATH = os.path.join(DATA_DIR, "optimize_runs.json")

MAX_RUNS = 200  # keep the store bounded; drop the oldest beyond this

_lock = Lock()


def _read_all() -> list[dict]:
    if not os.path.exists(STORE_PATH):
        return []
    with open(STORE_PATH, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []


def _write_all(items: list[dict]) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(STORE_PATH, "w", encoding="utf-8") as f:
        json.dump(items, f, indent=2, default=str)


def _summary(rec: dict) -> dict:
    """Light projection for the history list — no heavy trials/curve payloads."""
    req = rec.get("request", {})
    res = rec.get("result", {})
    out = {
        "id": rec.get("id"),
        "created_at": rec.get("created_at"),
        "type": rec.get("type"),
        "kind": rec.get("kind"),
        "strategy_name": rec.get("strategy_name"),
        "target": req.get("target"),
        "seed": req.get("seed"),
        "period": {
            "start": req.get("start"),
            "end": req.get("end"),
            "split": req.get("split"),
        },
    }
    if rec.get("type") == "walk_forward":
        out["walk_forward_efficiency"] = res.get("walk_forward_efficiency")
        out["avg_test_metric"] = res.get("avg_test_metric")
        out["n_windows"] = res.get("n_windows")
    else:
        rec_pick = res.get("recommendation") or {}
        over = res.get("overfitting") or {}
        out["n_trials"] = req.get("n_trials")
        out["recommended_params"] = rec_pick.get("params")
        out["pbo"] = over.get("pbo")
        out["deflated_sharpe"] = over.get("deflated_sharpe")
    return out


def create_run(record: dict) -> dict:
    saved = {
        "id": uuid.uuid4().hex,
        "created_at": datetime.now(timezone.utc).isoformat(),
        **record,
    }
    with _lock:
        items = _read_all()
        items.append(saved)
        if len(items) > MAX_RUNS:
            items = items[-MAX_RUNS:]
        _write_all(items)
    return saved


def list_runs() -> list[dict]:
    """Newest-first summaries."""
    with _lock:
        items = _read_all()
    return [_summary(r) for r in reversed(items)]


def get_run(run_id: str) -> dict | None:
    with _lock:
        for r in _read_all():
            if r.get("id") == run_id:
                return r
    return None


def delete_run(run_id: str) -> bool:
    with _lock:
        items = _read_all()
        remaining = [r for r in items if r.get("id") != run_id]
        if len(remaining) == len(items):
            return False
        _write_all(remaining)
    return True


def clear_runs() -> int:
    """Delete every run; returns how many were removed."""
    with _lock:
        n = len(_read_all())
        _write_all([])
    return n
