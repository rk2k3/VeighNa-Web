from dotenv import load_dotenv
load_dotenv()

from vnpy.event import EventEngine
from vnpy.trader.engine import MainEngine
from vnpy.trader.ui import MainWindow, create_qapp

from vnpy_ib import IbGateway
from vnpy_ctastrategy import CtaStrategyApp
from vnpy_ctabacktester import CtaBacktesterApp
from vnpy_portfoliostrategy import PortfolioStrategyApp
from vnpy_paperaccount import PaperAccountApp

from config import IB_HOST, IB_PORT, IB_CLIENT_ID, IB_ACCOUNT

def main():
    qapp = create_qapp()
    event_engine = EventEngine()
    main_engine = MainEngine(event_engine)

    main_engine.add_gateway(IbGateway)
    main_engine.add_app(CtaStrategyApp)
    main_engine.add_app(CtaBacktesterApp)
    main_engine.add_app(PortfolioStrategyApp)
    main_engine.add_app(PaperAccountApp)

    main_window = MainWindow(main_engine, event_engine)
    main_window.showMaximized()

    setting = {
        "Host": IB_HOST,
        "Port": IB_PORT,
        "Client ID": IB_CLIENT_ID,
        "Trading Account": IB_ACCOUNT,
    }
    main_engine.connect(setting, "IB")

    qapp.exec()

if __name__ == "__main__":
    main()
