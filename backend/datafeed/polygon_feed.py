"""
Historical bar data from Polygon.io.

Backtesting data source, independent of any broker gateway.
Bars are fetched once and cached in vnpy's local database;
ensure_bar_data() skips the network entirely when the range is already stored.
"""

import os
import time
from datetime import datetime, timedelta, timezone

import requests

from vnpy.trader.constant import Exchange, Interval
from vnpy.trader.database import get_database
from vnpy.trader.object import BarData, HistoryRequest

BASE_URL = "https://api.polygon.io"
GATEWAY_NAME = "POLYGON"

TIMESPAN_MAP = {
    Interval.DAILY: "day",
    Interval.HOUR: "hour",
    Interval.MINUTE: "minute",
}

# Free tier allows 5 requests/minute; wait out a 429 instead of failing.
RATE_LIMIT_WAIT = 15
MAX_RETRIES = 4

# A cached range whose last bar is within this many days of the requested end
# still counts as covering it (weekends/holidays mean the final bars don't
# land exactly on the requested end date).
END_TOLERANCE = timedelta(days=5)

# Likewise on the start side: the requested start often lands on a weekend or
# holiday, and Polygon's daily timestamps are offset by a few hours, so the
# first stored bar can sit just after the requested start. Without this, a DB
# that holds exactly the requested range never satisfies the coverage check and
# re-downloads on every run.
START_TOLERANCE = timedelta(days=5)


def query_history(req: HistoryRequest) -> list[BarData]:
    api_key = os.getenv("POLYGON_API_KEY", "")
    if not api_key:
        raise RuntimeError("POLYGON_API_KEY is not set — add it to .env")

    timespan = TIMESPAN_MAP.get(req.interval, "day")
    url = (
        f"{BASE_URL}/v2/aggs/ticker/{req.symbol}/range/1/{timespan}/"
        f"{req.start.date().isoformat()}/{req.end.date().isoformat()}"
    )
    params: dict = {"adjusted": "true", "sort": "asc", "limit": 50000, "apiKey": api_key}

    bars: list[BarData] = []
    while url:
        data = _get_with_retry(url, params)
        for row in data.get("results", []):
            dt = datetime.fromtimestamp(row["t"] / 1000, tz=timezone.utc).replace(tzinfo=None)
            bars.append(BarData(
                symbol=req.symbol,
                exchange=req.exchange,
                datetime=dt,
                interval=req.interval,
                open_price=float(row["o"]),
                high_price=float(row["h"]),
                low_price=float(row["l"]),
                close_price=float(row["c"]),
                volume=float(row.get("v", 0)),
                gateway_name=GATEWAY_NAME,
            ))
        # Results over the 50k row limit paginate via next_url (already fully
        # qualified except for the key).
        url = data.get("next_url")
        params = {"apiKey": api_key}

    return bars


def _get_with_retry(url: str, params: dict) -> dict:
    for attempt in range(MAX_RETRIES):
        resp = requests.get(url, params=params, timeout=30)
        if resp.status_code == 429:
            if attempt < MAX_RETRIES - 1:
                time.sleep(RATE_LIMIT_WAIT)
            continue
        if not resp.ok:
            try:
                message = resp.json().get("message", resp.text)
            except ValueError:
                message = resp.text
            raise RuntimeError(f"Polygon ({resp.status_code}): {message}")
        return resp.json()
    raise RuntimeError("Polygon rate limit hit — retries exhausted, try again shortly")


def ensure_bar_data(symbol: str, exchange: Exchange, interval: Interval,
                    start: datetime, end: datetime) -> int:
    """
    Guarantee bars for the range exist in vnpy's local database,
    fetching from Polygon only when missing.
    Returns the number of bars downloaded (0 = served from cache).
    """
    db = get_database()

    for overview in db.get_bar_overview():
        if (
            overview.symbol == symbol
            and overview.exchange == exchange
            and overview.interval == interval
            and overview.start <= start + START_TOLERANCE
            and overview.end >= end - END_TOLERANCE
        ):
            return 0

    req = HistoryRequest(symbol=symbol, exchange=exchange, start=start, end=end, interval=interval)
    bars = query_history(req)
    if bars:
        db.save_bar_data(bars)
    return len(bars)
