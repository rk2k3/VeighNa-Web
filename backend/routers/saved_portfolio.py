"""CRUD for saved (user-created) portfolio strategies."""

from fastapi import APIRouter, HTTPException

from schemas import SavedStrategyReq
from services import saved_portfolio_service

router = APIRouter()


@router.get("/saved_portfolio_strategies")
def list_saved_portfolio_strategies():
    """User-created portfolio strategies built via the questionnaire or AI."""
    return saved_portfolio_service.list_saved()


@router.post("/saved_portfolio_strategies")
def create_saved_portfolio_strategy(req: SavedStrategyReq):
    return saved_portfolio_service.create_saved(req.model_dump())


@router.put("/saved_portfolio_strategies/{strategy_id}")
def update_saved_portfolio_strategy(strategy_id: str, req: SavedStrategyReq):
    updated = saved_portfolio_service.update_saved(strategy_id, req.model_dump())
    if updated is None:
        raise HTTPException(status_code=404, detail="Saved portfolio strategy not found")
    return updated


@router.delete("/saved_portfolio_strategies/{strategy_id}")
def delete_saved_portfolio_strategy(strategy_id: str):
    if not saved_portfolio_service.delete_saved(strategy_id):
        raise HTTPException(status_code=404, detail="Saved portfolio strategy not found")
    return {"status": "deleted"}
