"""AI strategy generation — compile a plain-English idea into a strategy (not saved)."""

from fastapi import APIRouter, HTTPException

from schemas import ExplainBacktestReq, GeneratePortfolioReq, GenerateStrategyReq
from services import ai_service

router = APIRouter()


@router.post("/generate_stock_strategy")
def generate_stock_strategy(req: GenerateStrategyReq):
    """Compile a plain-English idea into a validated single-stock DSL strategy."""
    try:
        return {"dsl": ai_service.generate_dsl(req.description, req.symbol, req.exchange)}
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/explain_backtest")
def explain_backtest(req: ExplainBacktestReq):
    """Short plain-English verdict on a backtest result."""
    try:
        return {"verdict": ai_service.explain_backtest(req.context)}
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/explain_optimization")
def explain_optimization(req: ExplainBacktestReq):
    """Short plain-English verdict on an optimization or walk-forward run."""
    try:
        return {"verdict": ai_service.explain_optimization(req.context)}
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/explain_montecarlo")
def explain_montecarlo(req: ExplainBacktestReq):
    """Short plain-English verdict on a Monte Carlo stress test."""
    try:
        return {"verdict": ai_service.explain_montecarlo(req.context)}
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/generate_portfolio_strategy")
def generate_portfolio_strategy(req: GeneratePortfolioReq):
    """Pick + tune a portfolio allocation algorithm for the given goal and universe."""
    try:
        return ai_service.generate_portfolio_strategy(req.description, req.symbols, req.exchange)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
