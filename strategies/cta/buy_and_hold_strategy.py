from vnpy_ctastrategy import (
    CtaTemplate,
    StopOrder,
    TickData,
    BarData,
    TradeData,
    OrderData,
    BarGenerator,
    ArrayManager,
)

class BuyAndHoldStrategy(CtaTemplate):
    author = "Test"

    parameters = []
    variables = []

    def __init__(self, cta_engine, strategy_name, vt_symbol, setting):
        super().__init__(cta_engine, strategy_name, vt_symbol, setting)
        self.bg = BarGenerator(self.on_bar)
        self.am = ArrayManager()
        self.bought = False

    def on_init(self):
        self.write_log("Strategy initializing")
        self.load_bar(1)

    def on_start(self):
        self.write_log("Strategy started")
        self.put_event()

    def on_stop(self):
        self.write_log("Strategy stopped")
        self.put_event()

    def on_tick(self, tick: TickData):
        self.bg.update_tick(tick)

    def on_bar(self, bar: BarData):
        self.am.update_bar(bar)

        if not self.bought and self.pos == 0:
            capital = self.cta_engine.capital
            volume = int(capital / bar.close_price)
            if volume > 0:
                self.buy(bar.close_price * 1.1, volume)
                self.bought = True

        self.put_event()

    def on_order(self, order: OrderData):
        pass

    def on_trade(self, trade: TradeData):
        self.put_event()

    def on_stop_order(self, stop_order: StopOrder):
        pass
