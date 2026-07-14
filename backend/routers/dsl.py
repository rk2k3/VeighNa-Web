"""AI/DSL strategy endpoints: generate from natural language, and persist."""

from fastapi import APIRouter, HTTPException

from dsl.schema import DslStrategy
from schemas import GeneratePortfolioReq, GenerateStrategyReq
from services import dsl_service, saved_dsl_service

router = APIRouter()


@router.post("/generate_strategy")
def generate_strategy(req: GenerateStrategyReq):
    """Compile a plain-English idea into a validated DSL strategy (not saved)."""
    try:
        return {"dsl": dsl_service.generate_dsl(req.description, req.symbol, req.exchange)}
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/generate_portfolio_strategy")
def generate_portfolio_strategy(req: GeneratePortfolioReq):
    """Pick + tune a portfolio algorithm for the given goal and universe (not saved)."""
    try:
        return dsl_service.generate_portfolio_strategy(req.description, req.symbols, req.exchange)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/dsl_strategies")
def list_dsl_strategies():
    return saved_dsl_service.list_saved()


@router.post("/dsl_strategies")
def create_dsl_strategy(dsl: DslStrategy):
    """Save an (already validated) DSL strategy. Body is the DSL itself."""
    return saved_dsl_service.create_saved(dsl.model_dump())


@router.put("/dsl_strategies/{strategy_id}")
def update_dsl_strategy(strategy_id: str, dsl: DslStrategy):
    updated = saved_dsl_service.update_saved(strategy_id, dsl.model_dump())
    if updated is None:
        raise HTTPException(status_code=404, detail="DSL strategy not found")
    return updated


@router.delete("/dsl_strategies/{strategy_id}")
def delete_dsl_strategy(strategy_id: str):
    if not saved_dsl_service.delete_saved(strategy_id):
        raise HTTPException(status_code=404, detail="DSL strategy not found")
    return {"status": "deleted"}
