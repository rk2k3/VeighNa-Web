"""Backtest execution — run a saved stock or portfolio strategy over a date range."""

from fastapi import APIRouter, HTTPException

from schemas import BacktestReq, PortfolioBacktestReq
from services import backtest_service

router = APIRouter()


@router.post("/stock_backtest")
def run_stock_backtest(req: BacktestReq):
    try:
        return backtest_service.run_single_backtest(
            symbol=req.symbol,
            exchange=req.exchange,
            start=req.start,
            end=req.end,
            strategy=req.strategy,
            capital=req.capital,
            params=req.params,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/portfolio_backtest")
def run_portfolio_backtest(req: PortfolioBacktestReq):
    try:
        return backtest_service.run_portfolio_backtest(
            symbols=req.symbols,
            exchange=req.exchange,
            start=req.start,
            end=req.end,
            capital=req.capital,
            strategy=req.strategy,
            params=req.params,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
