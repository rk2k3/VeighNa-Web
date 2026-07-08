import os
import asyncio
from datetime import datetime
from contextlib import asynccontextmanager
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from vnpy.event import EventEngine, Event
from vnpy.trader.engine import MainEngine
from vnpy.trader.object import (
    SubscribeRequest, OrderRequest,
    Exchange, Direction, OrderType, Offset
)
from vnpy.trader.event import EVENT_TICK, EVENT_POSITION
from vnpy_ctastrategy import CtaStrategyApp
from vnpy_ctabacktester import CtaBacktesterApp
from vnpy_portfoliostrategy import PortfolioStrategyApp
from gateways.alpaca_gateway import AlpacaGateway
from datafeed.polygon_feed import ensure_bar_data

event_engine = EventEngine()
main_engine = MainEngine(event_engine)
main_engine.add_gateway(AlpacaGateway)
main_engine.add_app(CtaStrategyApp)
main_engine.add_app(CtaBacktesterApp)
main_engine.add_app(PortfolioStrategyApp)

ws_clients = []

async def broadcast(data):
    for ws in ws_clients.copy():
        try:
            await ws.send_json(data)
        except:
            ws_clients.remove(ws)

@asynccontextmanager
async def lifespan(app):
    api_key = os.getenv("ALPACA_API_KEY", "")
    secret_key = os.getenv("ALPACA_SECRET_KEY", "")
    if api_key and secret_key:
        setting = {
            "API Key": api_key,
            "Secret Key": secret_key,
            "Paper Trading": True
        }
        main_engine.connect(setting, "ALPACA")
    else:
        main_engine.write_log("No broker credentials in .env — running in backtest-only mode")

    def on_tick(event):
        tick = event.data
        asyncio.create_task(broadcast({
            "type": "tick",
            "symbol": tick.vt_symbol,
            "price": tick.last_price,
            "bid": tick.bid_price_1,
            "ask": tick.ask_price_1,
            "time": str(tick.datetime)
        }))

    def on_position(event):
        asyncio.create_task(broadcast({"type": "position"}))

    event_engine.register(EVENT_TICK, on_tick)
    event_engine.register(EVENT_POSITION, on_position)
    yield
    main_engine.close()

app = FastAPI(title="VeighNA API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

from pydantic import BaseModel

class SubscribeReq(BaseModel):
    symbol: str
    exchange: str = "NASDAQ"

class OrderReq(BaseModel):
    symbol: str
    exchange: str = "NASDAQ"
    direction: str
    price: float
    volume: float

class BacktestReq(BaseModel):
    symbol: str
    exchange: str
    start: str
    end: str
    strategy: str
    capital: float
    params: dict = {}

@app.post("/subscribe")
def subscribe(req: SubscribeReq):
    sub = SubscribeRequest(symbol=req.symbol, exchange=Exchange(req.exchange))
    main_engine.subscribe(sub, "ALPACA")
    return {"status": f"subscribed to {req.symbol}"}

@app.post("/order")
def place_order(req: OrderReq):
    order_req = OrderRequest(
        symbol=req.symbol, exchange=Exchange(req.exchange),
        direction=Direction(req.direction), type=OrderType.LIMIT,
        volume=req.volume, price=req.price, offset=Offset.OPEN
    )
    vt_orderid = main_engine.send_order(order_req, "ALPACA")
    return {"vt_orderid": vt_orderid}

@app.get("/positions")
def get_positions():
    gateway = main_engine.get_gateway("ALPACA")
    if gateway:
        gateway.query_position()
    return [
        {"symbol": p.vt_symbol, "volume": p.volume, "price": p.price, "pnl": p.pnl, "direction": p.direction.value}
        for p in main_engine.get_all_positions() if p.volume != 0
    ]

@app.get("/account")
def get_account():
    gateway = main_engine.get_gateway("ALPACA")
    if gateway:
        gateway.query_account()
    accounts = main_engine.get_all_accounts()
    if accounts:
        return {"connected": True, "balance": float(accounts[0].balance), "frozen": float(accounts[0].frozen)}
    # No account data means the broker gateway never authenticated (backtest-only mode)
    return {"connected": False, "balance": 0, "frozen": 0}

@app.get("/strategies")
def get_strategies():
    strategies_dir = os.path.join(os.path.dirname(__file__), "..", "strategies")
    if not os.path.exists(strategies_dir):
        strategies_dir = "strategies"
    return [f.replace(".py", "") for f in os.listdir(strategies_dir) if f.endswith(".py") and f != "__init__.py"]

@app.get("/symbols")
def get_symbols():
    from vnpy.trader.database import get_database
    db = get_database()
    overview = db.get_bar_overview()
    return [{"symbol": o.symbol, "exchange": o.exchange.value, "vt_symbol": f"{o.symbol}.{o.exchange.value}", "count": o.count} for o in overview]


class LoadDataReq(BaseModel):
    symbol: str
    exchange: str = "NASDAQ"
    start: str
    end: str

@app.post("/load_data")
def load_data(req: LoadDataReq):
    from vnpy.trader.constant import Interval

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


class PortfolioBacktestReq(BaseModel):
    symbols: list[str]
    exchange: str = "NASDAQ"
    start: str
    end: str
    capital: float = 100000
    weights: dict = {}  # {"AAPL": 0.5, "MSFT": 0.5} — equal if empty

@app.post("/portfolio_backtest")
def run_portfolio_backtest(req: PortfolioBacktestReq):
    import sys
    from vnpy_portfoliostrategy.backtesting import BacktestingEngine as PortfolioBacktestingEngine
    from vnpy.trader.constant import Interval
    from vnpy.trader.object import HistoryRequest
    from vnpy.trader.database import get_database

    veighna_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    if veighna_root not in sys.path:
        sys.path.insert(0, veighna_root)

    vt_symbols = [f"{s}.{req.exchange}" for s in req.symbols]

    # Auto-load any missing data from Polygon (cached ranges skip the network)
    try:
        for symbol in req.symbols:
            ensure_bar_data(
                symbol=symbol,
                exchange=Exchange(req.exchange),
                interval=Interval.DAILY,
                start=datetime.fromisoformat(req.start),
                end=datetime.fromisoformat(req.end),
            )
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Calculate weights — equal if not specified
    if not req.weights:
        weight = 1.0 / len(req.symbols)
        weights = {f"{s}.{req.exchange}": weight for s in req.symbols}
    else:
        weights = {f"{s}.{req.exchange}": w for s, w in req.weights.items()}

    engine = PortfolioBacktestingEngine()
    engine.set_parameters(
        vt_symbols=vt_symbols,
        interval=Interval.DAILY,
        start=datetime.fromisoformat(req.start),
        end=datetime.fromisoformat(req.end),
        rates={s: 0.0003 for s in vt_symbols},
        slippages={s: 0.01 for s in vt_symbols},
        sizes={s: 1 for s in vt_symbols},
        priceticks={s: 0.01 for s in vt_symbols},
        capital=req.capital
    )

    from strategies.portfolio_hold_strategy import PortfolioHoldStrategy
    engine.add_strategy(PortfolioHoldStrategy, {"weights": weights})
    engine.load_data()
    engine.run_backtesting()

    df = engine.calculate_result()
    stats = engine.calculate_statistics(output=False)

    return {
        "statistics": {k: str(v) for k, v in stats.items()},
        "daily_results": df.reset_index().to_dict(orient="records"),
        "weights": weights
    }

@app.post("/backtest")
def run_backtest(req: BacktestReq):
    import importlib, sys
    from vnpy_ctastrategy.backtesting import BacktestingEngine
    from vnpy.trader.constant import Interval
    from vnpy.trader.object import HistoryRequest
    from vnpy.trader.database import get_database
    # Add VeighNa root to path so 'import strategies.xxx' works
    veighna_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    sys.path.insert(0, veighna_root)

    # Auto-load any missing data from Polygon (cached ranges skip the network)
    try:
        ensure_bar_data(
            symbol=req.symbol,
            exchange=Exchange(req.exchange),
            interval=Interval.DAILY,
            start=datetime.fromisoformat(req.start),
            end=datetime.fromisoformat(req.end),
        )
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))

    engine = BacktestingEngine()
    engine.set_parameters(
        vt_symbol=f"{req.symbol}.{req.exchange}",
        interval=Interval.DAILY,
        start=datetime.fromisoformat(req.start),
        end=datetime.fromisoformat(req.end),
        rate=0.0003, slippage=0.01, size=1, pricetick=0.01, capital=req.capital
    )
    mod = importlib.import_module(f"strategies.{req.strategy}")
    class_name = "".join(w.capitalize() for w in req.strategy.split("_"))
    engine.add_strategy(getattr(mod, class_name), req.params)
    engine.load_data()
    engine.run_backtesting()
    df = engine.calculate_result()
    stats = engine.calculate_statistics(output=False)
    return {"statistics": {k: str(v) for k, v in stats.items()}, "daily_results": df.reset_index().to_dict(orient="records")}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    ws_clients.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in ws_clients:
            ws_clients.remove(websocket)

frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8100)
