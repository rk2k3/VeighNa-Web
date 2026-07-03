import site
import os

sp = site.getsitepackages()[0]

patches = [
    (f"{sp}/vnpy_ib/ib_gateway.py", [
        ('"TWS地址"', '"Host"'),
        ('"TWS端口"', '"Port"'),
        ('"客户号"', '"Client ID"'),
        ('"交易账户"', '"Trading Account"'),
        ('msg: str = f"信息通知，代码：{errorCode}，内容: {errorString}"',
         'msg: str = f"Notice, code: {errorCode}, message: {errorString}"'),
        ('    86: "open_interest"\n}',
         '    86: "open_interest",\n    66: "bid_volume_1",\n    67: "ask_price_1",\n    68: "last_price",\n    69: "bid_price_1",\n    70: "ask_volume_1",\n    71: "last_volume",\n    72: "high_price",\n    73: "low_price",\n    74: "volume",\n    75: "pre_close",\n    76: "open_price"\n}'),
        ('        ib_order.orderRef = datetime.now().strftime("%Y-%m-%d %H:%M:%S")',
         '        ib_order.orderRef = datetime.now().strftime("%Y-%m-%d %H:%M:%S")\n        ib_order.tif = "DAY"'),
        ('        self.client.reqMktData(self.reqid, ib_contract, "", False, False, [])',
         '        self.client.reqMarketDataType(3)\n        self.client.reqMktData(self.reqid, ib_contract, "", False, False, [])'),
    ]),
    (f"{sp}/vnpy_paperaccount/ui/widget.py", [
        ('Paper Trading持仓盈亏的计算频率', 'PnL calculation interval'),
        ('模拟交易', 'Paper Trading'),
        ('市价委托和停止委托的成交滑点', 'Slippage for market/stop orders'),
        ('下单后立即使用当前盘口撮合', 'Instant fill on order submission'),
        ('清空所有持仓', 'Clear all positions'),
        (' 秒', ' sec'),
        (' 跳', ' tick'),
    ]),
    (f"{sp}/vnpy_paperaccount/__init__.py", [
        ('display_name: str = "模拟交易"', 'display_name: str = "Paper Trading"'),
    ]),
    (f"{sp}/vnpy_polygon/polygon_datafeed.py", [
        ('dt: datetime = datetime.fromtimestamp(agg.timestamp / 1000)',
         'dt: datetime = datetime.fromtimestamp(agg.timestamp / 1000).replace(tzinfo=DB_TZ)'),
        ('start: datetime = req.start',
         'start: datetime = req.start.replace(tzinfo=DB_TZ) if req.start.tzinfo is None else req.start'),
        ('end: datetime = req.end',
         'end: datetime = req.end.replace(tzinfo=DB_TZ) if req.end.tzinfo is None else req.end'),
    ]),
]

for filepath, replacements in patches:
    if not os.path.exists(filepath):
        print(f"Skipping (not found): {filepath}")
        continue
    with open(filepath, 'r') as f:
        content = f.read()
    for old, new in replacements:
        content = content.replace(old, new)
    with open(filepath, 'w') as f:
        f.write(content)
    print(f"Patched: {filepath}")

print("All patches applied!")
