"""Persistence for saved AI/DSL strategies.

Same flat-JSON approach as saved_strategy_service, but a separate file: these are
single-symbol rule-based strategies (interpreted by strategies/cta/dsl_strategy.py),
distinct from the portfolio strategies produced by the questionnaire.
"""

import json
import os
import uuid
from datetime import datetime, timezone
from threading import Lock

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
STORE_PATH = os.path.join(DATA_DIR, "saved_dsl_strategies.json")

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
        json.dump(items, f, indent=2)


def list_saved() -> list[dict]:
    with _lock:
        return _read_all()


def create_saved(dsl: dict) -> dict:
    record = {
        "id": uuid.uuid4().hex,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dsl": dsl,
    }
    with _lock:
        items = _read_all()
        items.append(record)
        _write_all(items)
    return record


def update_saved(strategy_id: str, dsl: dict) -> dict | None:
    """Replace the DSL of an existing record, preserving its id and created_at."""
    with _lock:
        items = _read_all()
        for i, item in enumerate(items):
            if item["id"] == strategy_id:
                items[i] = {**item, "dsl": dsl}
                _write_all(items)
                return items[i]
    return None


def delete_saved(strategy_id: str) -> bool:
    with _lock:
        items = _read_all()
        remaining = [i for i in items if i["id"] != strategy_id]
        if len(remaining) == len(items):
            return False
        _write_all(remaining)
    return True
