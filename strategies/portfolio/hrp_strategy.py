from typing import Dict, List

import numpy as np
from scipy.cluster.hierarchy import linkage
from scipy.spatial.distance import squareform

from vnpy_portfoliostrategy import StrategyTemplate, StrategyEngine
from vnpy.trader.object import BarData


def _cluster_var(cov: np.ndarray, items: List[int]) -> float:
    """Variance of the inverse-variance portfolio over a subset of assets."""
    sub = cov[np.ix_(items, items)]
    ivp = 1.0 / np.diag(sub)
    ivp /= ivp.sum()
    return float(ivp @ sub @ ivp)


def _quasi_diag(link: np.ndarray) -> List[int]:
    """Order the original assets so correlated ones sit next to each other."""
    link = link.astype(int)
    num_items = link.shape[0] + 1

    order = [int(link[-1, 0]), int(link[-1, 1])]
    while any(i >= num_items for i in order):
        expanded: List[int] = []
        for i in order:
            if i < num_items:
                expanded.append(i)
            else:
                row = link[i - num_items]
                expanded.append(int(row[0]))
                expanded.append(int(row[1]))
        order = expanded
    return order


def _recursive_bisection(cov: np.ndarray, sort_ix: List[int]) -> np.ndarray:
    """Split the sorted list in half repeatedly, allocating by inverse cluster variance."""
    weights = np.ones(cov.shape[0])
    clusters = [sort_ix]

    while clusters:
        next_clusters = []
        for cluster in clusters:
            if len(cluster) <= 1:
                continue

            split = len(cluster) // 2
            left = cluster[:split]
            right = cluster[split:]

            var_left = _cluster_var(cov, left)
            var_right = _cluster_var(cov, right)
            alpha = 1.0 - var_left / (var_left + var_right)

            for i in left:
                weights[i] *= alpha
            for i in right:
                weights[i] *= 1.0 - alpha

            next_clusters.append(left)
            next_clusters.append(right)

        clusters = next_clusters

    return weights


class PortfolioHrpStrategy(StrategyTemplate):
    """
    Hierarchical Risk Parity (HRP) Portfolio.

    Every rebalance_days bars, estimates the covariance/correlation over the
    trailing est_win days and allocates weights via López de Prado's HRP:

        1. turn correlations into a distance metric  d = sqrt((1 - corr) / 2)
        2. cluster the assets hierarchically (single linkage)
        3. quasi-diagonalize so similar assets are adjacent
        4. recursively bisect, splitting capital between clusters in inverse
           proportion to their variance

    No matrix inversion is required, which makes it robust out of sample — a
    modern diversification approach.

    Falls back to equal weights if there is insufficient history.
    """

    author = "Test"

    est_win: int = 30
    rebalance_days: int = 20

    parameters = [
        "est_win",
        "rebalance_days",
    ]

    variables = [
        "bar_count",
    ]

    def __init__(
        self,
        strategy_engine: StrategyEngine,
        strategy_name: str,
        vt_symbols: list,
        setting: dict,
    ):
        super().__init__(
            strategy_engine,
            strategy_name,
            vt_symbols,
            setting,
        )

        self.bar_count = 0

        self.closes: Dict[str, dict] = {
            vt_symbol: {}
            for vt_symbol in vt_symbols
        }

        self.last_date = None

    def on_init(self):
        self.write_log("Strategy initializing")
        self.load_bars(1)

    def on_start(self):
        self.write_log("Strategy started")

    def on_stop(self):
        self.write_log("Strategy stopped")

    def on_bars(self, bars: Dict[str, BarData]):
        bar_date = None

        for vt_symbol, bar in bars.items():
            bar_date = bar.datetime.date()
            self.closes[vt_symbol][bar_date] = bar.close_price

        if bar_date != self.last_date:

            self.last_date = bar_date

            if self.bar_count % max(self.rebalance_days, 1) == 0:

                weights = self._compute_weights()

                capital = self.strategy_engine.capital

                for vt_symbol, bar in bars.items():

                    weight = weights.get(vt_symbol, 0)

                    target = (
                        int(capital * weight / bar.close_price)
                        if weight > 0
                        else 0
                    )

                    self.set_target(vt_symbol, target)

                self.rebalance_portfolio(bars)

            self.bar_count += 1

        self.put_event()

    def _compute_weights(self) -> Dict[str, float]:

        n = len(self.vt_symbols)

        equal = {
            s: 1.0 / n
            for s in self.vt_symbols
        }

        # Clustering needs at least two assets.
        if n < 2:
            return equal

        needed = self.est_win + 1

        common_dates = set(self.closes[self.vt_symbols[0]])

        for s in self.vt_symbols[1:]:
            common_dates &= set(self.closes[s])

        if len(common_dates) < needed:
            self.write_log(
                "Insufficient history for HRP - using equal weights"
            )
            return equal

        window = sorted(common_dates)[-needed:]

        columns = []

        for s in self.vt_symbols:

            prices = np.asarray(
                [self.closes[s][d] for d in window],
                dtype=float,
            )

            returns = prices[1:] / prices[:-1] - 1.0

            columns.append(returns)

        returns = np.column_stack(columns)

        cov = np.atleast_2d(np.cov(returns, rowvar=False))
        corr = np.atleast_2d(np.corrcoef(returns, rowvar=False))

        # Numerical stabilization
        cov += np.eye(n) * 1e-10
        corr = np.nan_to_num(corr, nan=0.0)
        np.fill_diagonal(corr, 1.0)

        # Correlation distance, symmetrized with a zero diagonal for squareform.
        dist = np.sqrt(np.clip((1.0 - corr) / 2.0, 0.0, None))
        dist = (dist + dist.T) / 2.0
        np.fill_diagonal(dist, 0.0)

        link = linkage(squareform(dist, checks=False), method="single")
        sort_ix = _quasi_diag(link)

        weights = _recursive_bisection(cov, sort_ix)
        weights = np.clip(weights, 0.0, None)
        weights /= weights.sum()

        self.write_log(
            "HRP weights: "
            + ", ".join(
                f"{s}={w:.3f}"
                for s, w in zip(self.vt_symbols, weights)
            )
        )

        return dict(zip(self.vt_symbols, weights))
