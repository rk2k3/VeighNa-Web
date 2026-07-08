"""Live/paper trading endpoints — proxy requests to the broker gateway."""

from fastapi import APIRouter

from vnpy.trader.constant import Direction, Exchange, Offset, OrderType
from vnpy.trader.object import OrderRequest, SubscribeRequest

from engine import GATEWAY_NAME, main_engine
from schemas import OrderReq, SubscribeReq

router = APIRouter()


@router.post("/subscribe")
def subscribe(req: SubscribeReq):
    sub = SubscribeRequest(symbol=req.symbol, exchange=Exchange(req.exchange))
    main_engine.subscribe(sub, GATEWAY_NAME)
    return {"status": f"subscribed to {req.symbol}"}


@router.post("/order")
def place_order(req: OrderReq):
    order_req = OrderRequest(
        symbol=req.symbol,
        exchange=Exchange(req.exchange),
        direction=Direction(req.direction),
        type=OrderType.LIMIT,
        volume=req.volume,
        price=req.price,
        offset=Offset.OPEN,
    )
    vt_orderid = main_engine.send_order(order_req, GATEWAY_NAME)
    return {"vt_orderid": vt_orderid}


@router.get("/positions")
def get_positions():
    gateway = main_engine.get_gateway(GATEWAY_NAME)
    if gateway:
        gateway.query_position()
    return [
        {
            "symbol": p.vt_symbol,
            "volume": p.volume,
            "price": p.price,
            "pnl": p.pnl,
            "direction": p.direction.value,
        }
        for p in main_engine.get_all_positions()
        if p.volume != 0
    ]


@router.get("/account")
def get_account():
    gateway = main_engine.get_gateway(GATEWAY_NAME)
    if gateway:
        gateway.query_account()
    accounts = main_engine.get_all_accounts()
    if accounts:
        return {"connected": True, "balance": float(accounts[0].balance), "frozen": float(accounts[0].frozen)}
    # No account data means the broker gateway never authenticated (backtest-only mode)
    return {"connected": False, "balance": 0, "frozen": 0}
