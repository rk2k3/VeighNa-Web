"""Strategy files — list what's available in the strategies/ folder.

This is where the add/edit-strategy endpoints will live.
"""

from fastapi import APIRouter

from services import strategy_service

router = APIRouter()


@router.get("/strategies")
def list_strategies():
    """Single-symbol (CTA) strategies with their parameters and defaults."""
    return strategy_service.list_cta_strategies()


@router.get("/portfolio_strategies")
def list_portfolio_strategies():
    """Portfolio strategies with their parameters and defaults."""
    return strategy_service.list_portfolio_strategies()
