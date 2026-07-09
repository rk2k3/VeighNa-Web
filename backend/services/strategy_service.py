"""Discover strategies and their parameters by introspection.

Works for both single-symbol CTA strategies (subclasses of CtaTemplate) and
multi-symbol portfolio strategies (subclasses of the portfolio StrategyTemplate).
Each strategy declares a `parameters` list; we read the default value of each to
infer its type for the UI.
"""

import importlib
import inspect
import os
import sys

from vnpy_ctastrategy import CtaTemplate
from vnpy_portfoliostrategy import StrategyTemplate as PortfolioTemplate

VEIGHNA_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
STRATEGIES_DIR = os.path.join(VEIGHNA_ROOT, "strategies")


def _ensure_importable() -> None:
    if VEIGHNA_ROOT not in sys.path:
        sys.path.insert(0, VEIGHNA_ROOT)


def _param_type(value) -> str:
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, int):
        return "int"
    if isinstance(value, float):
        return "float"
    if isinstance(value, dict):
        return "dict"
    return "str"


def _find_class(module, base):
    """Return the class in this module that subclasses `base`, if any."""
    for _, obj in inspect.getmembers(module, inspect.isclass):
        if issubclass(obj, base) and obj is not base and obj.__module__ == module.__name__:
            return obj
    return None


def _describe(name: str, cls) -> dict:
    params = [
        {"name": p, "default": getattr(cls, p, None), "type": _param_type(getattr(cls, p, None))}
        for p in getattr(cls, "parameters", [])
    ]
    return {"name": name, "class_name": cls.__name__, "parameters": params}


def _list_strategies(base) -> list[dict]:
    _ensure_importable()
    strategies = []
    for filename in sorted(os.listdir(STRATEGIES_DIR)):
        if not filename.endswith(".py") or filename == "__init__.py":
            continue
        name = filename[:-3]
        try:
            module = importlib.import_module(f"strategies.{name}")
        except Exception:
            continue
        cls = _find_class(module, base)
        if cls is not None:
            strategies.append(_describe(name, cls))
    return strategies


def _get_class(name: str, base, label: str):
    _ensure_importable()
    module = importlib.import_module(f"strategies.{name}")
    cls = _find_class(module, base)
    if cls is None:
        raise RuntimeError(f"'{name}' is not a {label} strategy")
    return cls


def list_cta_strategies() -> list[dict]:
    return _list_strategies(CtaTemplate)


def get_cta_strategy_class(name: str):
    return _get_class(name, CtaTemplate, "single-symbol")


def list_portfolio_strategies() -> list[dict]:
    return _list_strategies(PortfolioTemplate)


def get_portfolio_strategy_class(name: str):
    return _get_class(name, PortfolioTemplate, "portfolio")
