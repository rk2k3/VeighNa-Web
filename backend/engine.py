"""
vnpy engine singletons and broker connection.

Creating MainEngine here (at import time) starts the event engine and, as a
side effect of vnpy's constructor, changes the working directory to ~/.vntrader.
Everything else in the app therefore resolves paths from __file__, never cwd.
"""

import os

from vnpy.event import EventEngine
from vnpy.trader.engine import MainEngine
from vnpy_ctastrategy import CtaStrategyApp
from vnpy_ctabacktester import CtaBacktesterApp
from vnpy_portfoliostrategy import PortfolioStrategyApp

from gateways.alpaca_gateway import AlpacaGateway

GATEWAY_NAME = "ALPACA"

event_engine = EventEngine()
main_engine = MainEngine(event_engine)
main_engine.add_gateway(AlpacaGateway)
main_engine.add_app(CtaStrategyApp)
main_engine.add_app(CtaBacktesterApp)
main_engine.add_app(PortfolioStrategyApp)


def connect_broker() -> bool:
    """Connect the Alpaca gateway if credentials are present.

    Returns True when a connection was attempted, False in backtest-only mode.
    """
    api_key = os.getenv("ALPACA_API_KEY", "")
    secret_key = os.getenv("ALPACA_SECRET_KEY", "")
    if api_key and secret_key:
        main_engine.connect(
            {"API Key": api_key, "Secret Key": secret_key, "Paper Trading": True},
            GATEWAY_NAME,
        )
        return True
    main_engine.write_log("No broker credentials in .env — running in backtest-only mode")
    return False
