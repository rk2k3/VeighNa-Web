"""Strategy files — list what's available in the strategies/ folder.

This is where the add/edit-strategy endpoints will live.
"""

import os

from fastapi import APIRouter

router = APIRouter()

STRATEGIES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "strategies"))


@router.get("/strategies")
def list_strategies():
    return [
        f[:-3]
        for f in os.listdir(STRATEGIES_DIR)
        if f.endswith(".py") and f != "__init__.py"
    ]
