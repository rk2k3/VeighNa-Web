"""CRUD for saved single-stock (DSL) strategies."""

from fastapi import APIRouter, HTTPException

from dsl.schema import DslStrategy
from services import saved_stock_service

router = APIRouter()


@router.get("/saved_stock_strategies")
def list_saved_stock_strategies():
    return saved_stock_service.list_saved()


@router.post("/saved_stock_strategies")
def create_saved_stock_strategy(dsl: DslStrategy):
    """Save an (already validated) DSL strategy. Body is the DSL itself."""
    return saved_stock_service.create_saved(dsl.model_dump())


@router.put("/saved_stock_strategies/{strategy_id}")
def update_saved_stock_strategy(strategy_id: str, dsl: DslStrategy):
    updated = saved_stock_service.update_saved(strategy_id, dsl.model_dump())
    if updated is None:
        raise HTTPException(status_code=404, detail="Saved stock strategy not found")
    return updated


@router.delete("/saved_stock_strategies/{strategy_id}")
def delete_saved_stock_strategy(strategy_id: str):
    if not saved_stock_service.delete_saved(strategy_id):
        raise HTTPException(status_code=404, detail="Saved stock strategy not found")
    return {"status": "deleted"}
