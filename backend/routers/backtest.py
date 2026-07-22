"""Backtest execution — run a saved stock or portfolio strategy over a date range."""

from fastapi import APIRouter, HTTPException

from schemas import BacktestReq, BenchmarkReq, MonteCarloReq, PortfolioBacktestReq
from services import backtest_service, benchmark_service, montecarlo_service

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


@router.post("/montecarlo")
def run_monte_carlo(req: MonteCarloReq):
    try:
        return montecarlo_service.run_monte_carlo(
            strategy_curve=req.strategy_curve,
            method=req.method,
            n_sims=req.n_sims,
            trade_pnls=req.trade_pnls,
            block_size=req.block_size,
            seed=req.seed,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/benchmark")
def run_benchmark(req: BenchmarkReq):
    try:
        return benchmark_service.run_benchmark(
            symbol=req.symbol,
            exchange=req.exchange,
            start=req.start,
            end=req.end,
            capital=req.capital,
            strategy_curve=req.strategy_curve,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
