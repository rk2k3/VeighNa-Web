import yfinance as yf
import pandas as pd
from datetime import datetime
from vnpy.trader.object import BarData, Exchange, Interval
from vnpy.trader.database import get_database
from vnpy_ctastrategy.backtesting import BacktestingEngine
from strategies.double_ma_strategy import DoubleMaStrategy

# ── 1. Download data from yfinance ──────────────────────────
print("Downloading AAPL data...")
df = yf.download("AAPL", start="2020-01-01", end="2024-01-01", auto_adjust=True)
df.columns = [c[0].lower() if isinstance(c, tuple) else c.lower() for c in df.columns]

# ── 2. Save to VeighNa database ─────────────────────────────
database = get_database()
bars = []

for dt, row in df.iterrows():
    bar = BarData(
        symbol="AAPL",
        exchange=Exchange.NASDAQ,
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
print(f"Saved {len(bars)} bars to database")

# ── 3. Run backtest ──────────────────────────────────────────
engine = BacktestingEngine()
engine.set_parameters(
    vt_symbol="AAPL.NASDAQ",
    interval=Interval.DAILY,
    start=datetime(2020, 1, 1),
    end=datetime(2024, 1, 1),
    rate=0.0003,
    slippage=0.1,
    size=1,
    pricetick=0.01,
    capital=100_000,
)

engine.add_strategy(DoubleMaStrategy, {
    "fast_window": 10,
    "slow_window": 30
})

engine.load_data()
engine.run_backtesting()
df_result = engine.calculate_result()
engine.calculate_statistics()
