import yfinance as yf
import pandas as pd
from vnpy.trader.object import BarData, Exchange, Interval
from vnpy.trader.database import get_database

def load_yfinance_data(symbol, exchange, start, end):
    print(f"Downloading {symbol} data...")
    df = yf.download(symbol, start=start, end=end, auto_adjust=True)
    df.columns = [c[0].lower() if isinstance(c, tuple) else c.lower() for c in df.columns]

    database = get_database()
    bars = []

    for dt, row in df.iterrows():
        bar = BarData(
            symbol=symbol,
            exchange=exchange,
            datetime=pd.Timestamp(dt).to_pydatetime().replace(tzinfo=None),
            interval=Interval.DAILY,
            open_price=float(row["open"]),
            high_price=float(row["high"]),
            low_price=float(row["low"]),
            close_price=float(row["close"]),
            volume=float(row["volume"]),
            gateway_name="yfinance"
        )
        bars.append(bar)

    database.save_bar_data(bars)
    print(f"Saved {len(bars)} bars for {symbol}")

# Load whatever symbols you want
load_yfinance_data("AAPL", Exchange.NASDAQ, "2020-01-01", "2024-01-01")
load_yfinance_data("TSLA", Exchange.NASDAQ, "2020-01-01", "2024-01-01")
load_yfinance_data("SPY",  Exchange.NASDAQ, "2020-01-01", "2024-01-01")
