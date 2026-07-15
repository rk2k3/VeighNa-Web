import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from engine import connect_broker, main_engine
from ws import register_market_data_handlers, router as ws_router
from routers.trading import router as trading_router
from routers.market_data import router as market_data_router
from routers.backtest import router as backtest_router
from routers.ai import router as ai_router
from routers.saved_stock import router as saved_stock_router
from routers.saved_portfolio import router as saved_portfolio_router


@asynccontextmanager
async def lifespan(app):
    connect_broker()
    register_market_data_handlers()
    yield
    main_engine.close()


app = FastAPI(title="VeighNA API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

app.include_router(trading_router)
app.include_router(market_data_router)
app.include_router(backtest_router)
app.include_router(ai_router)
app.include_router(saved_stock_router)
app.include_router(saved_portfolio_router)
app.include_router(ws_router)

# Serve the built frontend when present (production), so one process can serve both.
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8100)
