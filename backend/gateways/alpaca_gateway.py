import threading
import asyncio
from datetime import datetime

from alpaca.trading.client import TradingClient
from alpaca.trading.requests import LimitOrderRequest, MarketOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce
from alpaca.data.live import StockDataStream
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.requests import StockLatestQuoteRequest, StockBarsRequest
from alpaca.data.timeframe import TimeFrame, TimeFrameUnit

from vnpy.trader.gateway import BaseGateway
from vnpy.trader.object import (
    TickData, AccountData, ContractData, PositionData,
    OrderData, Exchange, Product, Direction, OrderType,
    Status, SubscribeRequest, OrderRequest, CancelRequest
)
from vnpy.event import EventEngine


class AlpacaGateway(BaseGateway):

    default_name = "ALPACA"
    default_setting = {
        "API Key": "",
        "Secret Key": "",
        "Paper Trading": True
    }
    exchanges = [Exchange.NASDAQ, Exchange.NYSE, Exchange.SMART]

    def __init__(self, event_engine: EventEngine, gateway_name: str):
        super().__init__(event_engine, gateway_name)
        self.trading_client = None
        self.data_stream = None
        self.data_client = None
        self.loop = None
        self.stream_thread = None
        self.subscribed: dict = {}

    def connect(self, setting: dict) -> None:
        api_key = setting["API Key"]
        secret_key = setting["Secret Key"]
        paper = setting.get("Paper Trading", True)

        # Trading client
        self.trading_client = TradingClient(
            api_key=api_key,
            secret_key=secret_key,
            paper=paper
        )

        # Historical/quote client
        self.data_client = StockHistoricalDataClient(
            api_key=api_key,
            secret_key=secret_key
        )

        # Live stream
        self.data_stream = StockDataStream(
            api_key=api_key,
            secret_key=secret_key
        )

        # Query initial account and positions
        self.query_account()
        self.query_position()

        # Start event loop for WebSocket stream
        self.loop = asyncio.new_event_loop()
        self.stream_thread = threading.Thread(
            target=self._run_loop,
            daemon=True
        )
        self.stream_thread.start()

        self.write_log("Alpaca gateway connected")

    def _run_loop(self) -> None:
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    def subscribe(self, req: SubscribeRequest) -> None:
        # Push contract info
        contract = ContractData(
            symbol=req.symbol,
            exchange=req.exchange,
            name=req.symbol,
            product=Product.EQUITY,
            size=1,
            pricetick=0.01,
            net_position=True,
            gateway_name=self.gateway_name
        )
        self.on_contract(contract)
        self.subscribed[req.vt_symbol] = req

        # Subscribe to real-time quotes
        async def on_quote(quote):
            tick = TickData(
                symbol=req.symbol,
                exchange=req.exchange,
                datetime=datetime.now(),
                name=req.symbol,
                bid_price_1=float(quote.bid_price),
                ask_price_1=float(quote.ask_price),
                bid_volume_1=float(quote.bid_size),
                ask_volume_1=float(quote.ask_size),
                last_price=float(quote.ask_price),
                gateway_name=self.gateway_name
            )
            self.on_tick(tick)

        self.data_stream.subscribe_quotes(on_quote, req.symbol)

        # Start stream if not running
        if not getattr(self.data_stream, '_running', False) and not getattr(self.data_stream, 'running', False):
            asyncio.run_coroutine_threadsafe(
                self.data_stream.run(),
                self.loop
            )

        self.write_log(f"Subscribed: {req.vt_symbol}")

    def send_order(self, req: OrderRequest) -> str:
        try:
            side = OrderSide.BUY if req.direction == Direction.LONG else OrderSide.SELL

            if req.type == OrderType.MARKET:
                order_data = MarketOrderRequest(
                    symbol=req.symbol,
                    qty=req.volume,
                    side=side,
                    time_in_force=TimeInForce.DAY
                )
            else:
                order_data = LimitOrderRequest(
                    symbol=req.symbol,
                    qty=req.volume,
                    side=side,
                    time_in_force=TimeInForce.DAY,
                    limit_price=req.price
                )

            order = self.trading_client.submit_order(order_data)
            orderid = str(order.id)

            order_out = req.create_order_data(orderid, self.gateway_name)
            order_out.status = Status.NOTTRADED
            self.on_order(order_out)

            return order_out.vt_orderid

        except Exception as e:
            self.write_log(f"Order failed: {e}")
            return ""

    def cancel_order(self, req: CancelRequest) -> None:
        try:
            self.trading_client.cancel_order_by_id(req.orderid)
        except Exception as e:
            self.write_log(f"Cancel failed: {e}")

    def query_account(self) -> None:
        try:
            account = self.trading_client.get_account()
            account_data = AccountData(
                accountid=str(account.id),
                balance=float(account.portfolio_value),
                frozen=float(account.initial_margin or 0),
                gateway_name=self.gateway_name
            )
            self.on_account(account_data)
        except Exception as e:
            self.write_log(f"Account query failed: {e}")

    def query_position(self) -> None:
        try:
            positions = self.trading_client.get_all_positions()
            for pos in positions:
                position = PositionData(
                    symbol=pos.symbol,
                    exchange=Exchange.SMART,
                    direction=Direction.NET,
                    volume=float(pos.qty),
                    price=float(pos.avg_entry_price),
                    pnl=float(pos.unrealized_pl),
                    gateway_name=self.gateway_name
                )
                self.on_position(position)
        except Exception as e:
            self.write_log(f"Position query failed: {e}")

    def query_history(self, req):
        from vnpy.trader.object import BarData
        from vnpy.trader.constant import Interval

        interval_map = {
            Interval.DAILY: TimeFrame.Day,
            Interval.HOUR: TimeFrame.Hour,
            Interval.MINUTE: TimeFrame.Minute,
        }

        timeframe = interval_map.get(req.interval, TimeFrame.Day)

        try:
            request = StockBarsRequest(
                symbol_or_symbols=req.symbol,
                timeframe=timeframe,
                start=req.start,
                end=req.end,
                feed="iex"  # free tier feed
            )
            bars_response = self.data_client.get_stock_bars(request)
            bars_df = bars_response.df

            if bars_df.empty:
                return []

            # Reset MultiIndex (symbol, timestamp) -> flat columns
            bars_df = bars_df.reset_index()

            bars = []
            for _, row in bars_df.iterrows():
                dt = row["timestamp"]
                if hasattr(dt, "to_pydatetime"):
                    dt = dt.to_pydatetime().replace(tzinfo=None)

                bar = BarData(
                    symbol=req.symbol,
                    exchange=req.exchange,
                    datetime=dt,
                    interval=req.interval,
                    open_price=float(row["open"]),
                    high_price=float(row["high"]),
                    low_price=float(row["low"]),
                    close_price=float(row["close"]),
                    volume=float(row["volume"]),
                    gateway_name=self.gateway_name
                )
                bars.append(bar)

            self.write_log(f"Loaded {len(bars)} bars for {req.symbol} from Alpaca IEX")
            return bars

        except Exception as e:
            self.write_log(f"History query failed: {e}")
            import traceback
            traceback.print_exc()
            return []
    def close(self):
        if self.data_stream:
            self.data_stream.stop()
        if self.loop:
            self.loop.call_soon_threadsafe(self.loop.stop)
