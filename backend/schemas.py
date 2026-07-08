"""Request models for the API, all in one place."""

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


class LoadDataReq(BaseModel):
    symbol: str
    exchange: str = "NASDAQ"
    start: str
    end: str


class PortfolioBacktestReq(BaseModel):
    symbols: list[str]
    exchange: str = "NASDAQ"
    start: str
    end: str
    capital: float = 100000
    weights: dict = {}  # {"AAPL": 0.5, "MSFT": 0.5} — equal if empty
