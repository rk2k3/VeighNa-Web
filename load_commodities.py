import yfinance as yf
import pandas as pd
from vnpy.trader.object import BarData, Exchange, Interval
from vnpy.trader.database import get_database

def load_yfinance_data(symbol, vt_symbol_name, start, end):
    print(f"Downloading {symbol} data...")
    df = yf.download(symbol, start=start, end=end, auto_adjust=True)
    df.columns = [c[0].lower() if isinstance(c, tuple) else c.lower() for c in df.columns]

    database = get_database()
    bars = []

    for dt, row in df.iterrows():
        bar = BarData(
            symbol=vt_symbol_name,
            exchange=Exchange.NYMEX,
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
    print(f"Saved {len(bars)} bars for {vt_symbol_name}")


if __name__ == "__main__":
    load_yfinance_data("HG=F", "COPPER",  "2018-01-01", "2026-05-31")
    load_yfinance_data("SI=F", "SILVER",  "2018-01-01", "2026-05-31")
    load_yfinance_data("URA",  "URANIUM", "2018-01-01", "2026-05-31")
    load_yfinance_data("NG=F", "NATGAS",  "2018-01-01", "2026-05-31")
    load_yfinance_data("GC=F", "GOLD",    "2018-01-01", "2026-05-31")
    load_yfinance_data("REMX", "RAREEARTH", "2018-01-01", "2026-05-31")
