from datetime import datetime
import json
import matplotlib.pyplot as plt
from vnpy.trader.constant import Interval
from vnpy_portfoliostrategy.backtesting import BacktestingEngine
from strategies.portfolio_hold_strategy import PortfolioHoldStrategy

vt_symbols = ["COPPER.NYMEX", "SILVER.NYMEX", "URANIUM.NYMEX", "NATGAS.NYMEX", "GOLD.NYMEX"]

engine = BacktestingEngine()

engine.set_parameters(
    vt_symbols=vt_symbols,
    interval=Interval.DAILY,
    start=datetime(2025, 5, 31),
    end=datetime(2026, 5, 31),
    rates={s: 0.0003 for s in vt_symbols},
    slippages={s: 0.01 for s in vt_symbols},
    sizes={s: 1 for s in vt_symbols},
    priceticks={s: 0.01 for s in vt_symbols},
    capital=100_000_000,
)

engine.add_strategy(PortfolioHoldStrategy, {
    "weights": {
        "COPPER.NYMEX": 0.20,
        "SILVER.NYMEX": 0.20,
        "URANIUM.NYMEX": 0.20,
        "NATGAS.NYMEX": 0.20,
        "GOLD.NYMEX": 0.20,
    }
})

engine.load_data()
engine.run_backtesting()

df_result = engine.calculate_result()
df_result.to_csv("results_portfolio_all5.csv")

statistics = engine.calculate_statistics(output=False)
with open("results_portfolio_all5_stats.json", "w") as f:
    json.dump(statistics, f, indent=2, default=str)

print("\n=== Portfolio (20% each: Copper, Silver, Uranium, Natural Gas, Gold) ===")
for key, value in statistics.items():
    print(f"{key}: {value}")

fig, axes = plt.subplots(3, 1, figsize=(12, 10))

axes[0].plot(df_result.index, df_result["balance"], color="#2E75B6")
axes[0].set_title("Portfolio Balance Curve (5 Commodities, Equal Weight)")
axes[0].set_ylabel("Balance ($)")
axes[0].grid(True, alpha=0.3)

axes[1].fill_between(df_result.index, df_result["drawdown"], 0, color="#C00000", alpha=0.5)
axes[1].set_title("Drawdown")
axes[1].set_ylabel("Drawdown ($)")
axes[1].grid(True, alpha=0.3)

axes[2].bar(df_result.index, df_result["net_pnl"], color="#548235")
axes[2].set_title("Daily Net PnL")
axes[2].set_ylabel("PnL ($)")
axes[2].grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig("results_portfolio_all5_chart.png", dpi=150)
print("\nChart saved to results_portfolio_all5_chart.png")
print("Results saved to results_portfolio_all5.csv and results_portfolio_all5_stats.json")
