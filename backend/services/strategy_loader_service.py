"""Resolve a strategy's module name to its runnable class.

A saved strategy only stores its algorithm as a string (e.g. its ``strategy``
field is ``"portfolio_mvo_strategy"``). Before the backtest engine can run it,
that name has to be turned into the actual Python class. This module does that
lookup by importing ``strategies/<subdir>/<name>.py`` and returning the class
inside it that subclasses the expected vnpy template.
"""

import importlib
import inspect
import os
import sys

from vnpy_ctastrategy import CtaTemplate
from vnpy_portfoliostrategy import StrategyTemplate as PortfolioTemplate

VEIGHNA_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _ensure_importable() -> None:
    if VEIGHNA_ROOT not in sys.path:
        sys.path.insert(0, VEIGHNA_ROOT)


def _find_class(module, base):
    """Return the class in this module that subclasses `base`, if any."""
    for _, obj in inspect.getmembers(module, inspect.isclass):
        if issubclass(obj, base) and obj is not base and obj.__module__ == module.__name__:
            return obj
    return None


def _get_class(subdir: str, name: str, base, label: str):
    _ensure_importable()
    module = importlib.import_module(f"strategies.{subdir}.{name}")
    cls = _find_class(module, base)
    if cls is None:
        raise RuntimeError(f"'{name}' is not a {label} strategy")
    return cls


def get_cta_strategy_class(name: str):
    return _get_class("cta", name, CtaTemplate, "single-symbol")


def get_portfolio_strategy_class(name: str):
    return _get_class("portfolio", name, PortfolioTemplate, "portfolio")
