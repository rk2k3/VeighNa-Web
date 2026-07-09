"""Backtesting and market-data endpoints."""

from datetime import datetime

from fastapi import APIRouter, HTTPException

from vnpy.trader.constant import Exchange, Interval
from vnpy.trader.database import get_database

from datafeed.polygon_feed import ensure_bar_data
from schemas import BacktestReq, LoadDataReq, PortfolioBacktestReq
from services import backtest_service

router = APIRouter()


@router.get("/symbols")
def get_symbols():
    db = get_database()
    return [
        {
            "symbol": o.symbol,
            "exchange": o.exchange.value,
            "vt_symbol": f"{o.symbol}.{o.exchange.value}",
            "count": o.count,
        }
        for o in db.get_bar_overview()
    ]


@router.post("/load_data")
def load_data(req: LoadDataReq):
    try:
        count = ensure_bar_data(
            symbol=req.symbol,
            exchange=Exchange(req.exchange),
            interval=Interval.DAILY,
            start=datetime.fromisoformat(req.start),
            end=datetime.fromisoformat(req.end),
        )
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if count:
        return {"status": f"Loaded {count} bars for {req.symbol} from Polygon"}
    return {"status": f"{req.symbol} already cached in local database"}


@router.post("/backtest")
def run_backtest(req: BacktestReq):
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
