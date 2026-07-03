from datetime import datetime
import json
import matplotlib.pyplot as plt
from vnpy_ctastrategy.backtesting import BacktestingEngine
from vnpy_ctastrategy.strategies.buy_and_hold_strategy import BuyAndHoldStrategy

symbols = ["COPPER.NYMEX", "SILVER.NYMEX", "NATGAS.NYMEX", "URANIUM.NYMEX", "GOLD.NYMEX", "RAREEARTH.NYMEX"]
all_stats = {}

for vt_symbol in symbols:
    name = vt_symbol.split(".")[0]
    print(f"\n=== Backtesting {vt_symbol} ===")

    engine = BacktestingEngine()
    engine.set_parameters(
        vt_symbol=vt_symbol,
        interval="d",
        start=datetime(2025, 5, 31),
        end=datetime(2026, 5, 31),
        rate=0.0003,
        slippage=0.01,
        size=1,
        pricetick=0.01,
        capital=1_000_000,
    )

    engine.add_strategy(BuyAndHoldStrategy, {})
    engine.load_data()
    engine.run_backtesting()

    df_result = engine.calculate_result()
    df_result.to_csv(f"results_{name}.csv")

    statistics = engine.calculate_statistics(output=False)
    all_stats[vt_symbol] = statistics

    for key, value in statistics.items():
        print(f"{key}: {value}")

    fig, axes = plt.subplots(3, 1, figsize=(12, 10))
    axes[0].plot(df_result.index, df_result["balance"], color="#2E75B6")
    axes[0].set_title(f"{name} Balance Curve")
    axes[0].set_ylabel("Balance ($)")
    axes[0].grid(True, alpha=0.3)

    axes[1].fill_between(df_result.index, df_result["drawdown"], 0, color="#C00000", alpha=0.5)
    axes[1].set_title(f"{name} Drawdown")
    axes[1].set_ylabel("Drawdown ($)")
    axes[1].grid(True, alpha=0.3)

    axes[2].bar(df_result.index, df_result["net_pnl"], color="#548235")
    axes[2].set_title(f"{name} Daily Net PnL")
    axes[2].set_ylabel("PnL ($)")
    axes[2].grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(f"results_{name}_chart.png", dpi=150)
    plt.close(fig)
    print(f"Chart saved to results_{name}_chart.png")

with open("results_individual_stats.json", "w") as f:
    json.dump(all_stats, f, indent=2, default=str)

print("\nAll results saved!")
