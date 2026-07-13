"""Persistence for user-created ("saved") strategies.

These are distinct from the algorithm implementations in the top-level
``strategies/`` folder. A saved strategy is a questionnaire result: a named,
reusable configuration that *links* to one of those algorithms via its
``strategy`` field (the strategy module name) and carries the concrete
universe, capital, and parameters produced by the deterministic mapping.

Stored as a flat JSON file so the whole thing survives a restart without
needing a database. Single shared instance, matching the rest of the app.
"""

import json
import os
import uuid
from datetime import datetime, timezone
from threading import Lock

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
STORE_PATH = os.path.join(DATA_DIR, "saved_strategies.json")

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


def get_saved(strategy_id: str) -> dict | None:
    with _lock:
        for item in _read_all():
            if item["id"] == strategy_id:
                return item
    return None


def create_saved(payload: dict) -> dict:
    """Persist a new saved strategy, assigning an id and created_at."""
    record = {
        "id": uuid.uuid4().hex,
        "created_at": datetime.now(timezone.utc).isoformat(),
        **payload,
    }
    with _lock:
        items = _read_all()
        items.append(record)
        _write_all(items)
    return record


def update_saved(strategy_id: str, payload: dict) -> dict | None:
    """Overwrite an existing saved strategy, preserving its id and created_at."""
    with _lock:
        items = _read_all()
        for i, item in enumerate(items):
            if item["id"] == strategy_id:
                items[i] = {
                    **item,
                    **payload,
                    "id": strategy_id,
                    "created_at": item["created_at"],
                }
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
