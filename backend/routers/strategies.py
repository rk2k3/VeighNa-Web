"""Strategy files — list what's available in the strategies/ folder.

This is where the add/edit-strategy endpoints will live.
"""

from fastapi import APIRouter, HTTPException

from schemas import SavedStrategyReq
from services import saved_strategy_service, strategy_service

router = APIRouter()


@router.get("/strategies")
def list_strategies():
    """Single-symbol (CTA) strategies with their parameters and defaults."""
    return strategy_service.list_cta_strategies()


@router.get("/portfolio_strategies")
def list_portfolio_strategies():
    """Portfolio strategies with their parameters and defaults."""
    return strategy_service.list_portfolio_strategies()


# --- Saved (user-created) strategies -------------------------------------

@router.get("/saved_strategies")
def list_saved_strategies():
    """User-created strategies built via the questionnaire."""
    return saved_strategy_service.list_saved()


@router.post("/saved_strategies")
def create_saved_strategy(req: SavedStrategyReq):
    return saved_strategy_service.create_saved(req.model_dump())


@router.put("/saved_strategies/{strategy_id}")
def update_saved_strategy(strategy_id: str, req: SavedStrategyReq):
    updated = saved_strategy_service.update_saved(strategy_id, req.model_dump())
    if updated is None:
        raise HTTPException(status_code=404, detail="Saved strategy not found")
    return updated


@router.delete("/saved_strategies/{strategy_id}")
def delete_saved_strategy(strategy_id: str):
    if not saved_strategy_service.delete_saved(strategy_id):
        raise HTTPException(status_code=404, detail="Saved strategy not found")
    return {"status": "deleted"}
