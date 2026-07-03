from dotenv import load_dotenv
load_dotenv()

from vnpy.event import EventEngine
from vnpy.trader.engine import MainEngine
from vnpy_ib import IbGateway
from vnpy_ctastrategy import CtaStrategyApp
from vnpy_webtrader import WebTraderApp

from config import IB_HOST, IB_PORT, IB_CLIENT_ID, IB_ACCOUNT
import time

def main():
    event_engine = EventEngine()
    main_engine = MainEngine(event_engine)

    main_engine.add_gateway(IbGateway)
    main_engine.add_app(CtaStrategyApp)
    main_engine.add_app(WebTraderApp)

    setting = {
        "Host": IB_HOST,
        "Port": IB_PORT,
        "Client ID": IB_CLIENT_ID,
        "Trading Account": IB_ACCOUNT,
    }
    main_engine.connect(setting, "IB")
    print(f"VeighNA started, connecting to IB on {IB_HOST}:{IB_PORT}")

    while True:
        time.sleep(1)

if __name__ == "__main__":
    main()
