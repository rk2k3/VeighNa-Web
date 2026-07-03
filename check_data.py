from vnpy.trader.database import get_database
from vnpy.trader.object import Exchange, Interval
from datetime import datetime

database = get_database()

bars = database.load_bar_data(
    symbol="AAPL",
    exchange=Exchange.NASDAQ,
    interval=Interval.DAILY,
    start=datetime(2020, 1, 1),
    end=datetime(2024, 1, 1),
)

print(f"Found {len(bars)} bars")
if bars:
    print("First bar:", bars[0])
    print("Last bar:", bars[-1])
