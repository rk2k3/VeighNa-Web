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
from routers.backtest import router as backtest_router
from routers.strategies import router as strategies_router
from routers.dsl import router as dsl_router


@asynccontextmanager
async def lifespan(app):
    connect_broker()
    register_market_data_handlers()
    yield
    main_engine.close()


app = FastAPI(title="VeighNA API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

app.include_router(trading_router)
app.include_router(backtest_router)
app.include_router(strategies_router)
app.include_router(dsl_router)
app.include_router(ws_router)

# Serve the built frontend when present (production), so one process can serve both.
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8100)
