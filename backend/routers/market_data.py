"""Market-data endpoints — the local bar database (list cached symbols, load history)."""

from datetime import datetime

from fastapi import APIRouter, HTTPException

from vnpy.trader.constant import Exchange, Interval
from vnpy.trader.database import get_database

from datafeed.polygon_feed import ensure_bar_data
from schemas import LoadDataReq

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
