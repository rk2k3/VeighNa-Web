"""WebSocket fan-out: pushes live ticks and position pings to browsers.

The market-data handlers subscribe to the same event bus that vnpy's own OMS
listens on, and re-broadcast events to every connected browser.
"""

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from vnpy.event import Event
from vnpy.trader.event import EVENT_TICK, EVENT_POSITION

from engine import event_engine

router = APIRouter()

ws_clients: list[WebSocket] = []


async def broadcast(data: dict) -> None:
    for ws in ws_clients.copy():
        try:
            await ws.send_json(data)
        except Exception:
            ws_clients.remove(ws)


def register_market_data_handlers() -> None:
    # vnpy fires these handlers on the event engine's own thread, which has no
    # asyncio loop — so schedule the broadcast onto the server's loop thread-safely.
    loop = asyncio.get_running_loop()

    def on_tick(event: Event) -> None:
        tick = event.data
        asyncio.run_coroutine_threadsafe(broadcast({
            "type": "tick",
            "symbol": tick.vt_symbol,
            "price": tick.last_price,
            "bid": tick.bid_price_1,
            "ask": tick.ask_price_1,
            "time": str(tick.datetime),
        }), loop)

    def on_position(event: Event) -> None:
        asyncio.run_coroutine_threadsafe(broadcast({"type": "position"}), loop)

    event_engine.register(EVENT_TICK, on_tick)
    event_engine.register(EVENT_POSITION, on_position)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    ws_clients.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in ws_clients:
            ws_clients.remove(websocket)
