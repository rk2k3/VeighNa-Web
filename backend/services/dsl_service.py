"""Natural language -> validated strategy, via Google Gemini (free tier).

Two flavours:
- generate_dsl: a single-symbol rule-based strategy (the trading DSL), run by
  strategies/dsl_strategy.py.
- generate_portfolio_strategy: picks one of the portfolio allocation algorithms
  and tunes its parameters to the user's goal.

The model never writes Python — it returns JSON, which we validate with pydantic
and, if needed, ask it to repair once. We validate the shape ourselves (rather
than relying on the provider to enforce a schema), which keeps this portable.
"""

import json
import os
from typing import Type, TypeVar

from google import genai
from google.genai import types
from pydantic import BaseModel, ValidationError

from dsl.schema import DslStrategy, PortfolioChoice

MODEL = "gemini-flash-lite-latest"

T = TypeVar("T", bound=BaseModel)


def _client() -> genai.Client:
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY is not set — add it to .env")
    return genai.Client(api_key=key)


def _generate_json(system: str, user: str, schema: Type[T]) -> T:
    """Ask Gemini for JSON, validate against `schema`, retry once on failure."""
    client = _client()
    contents: list = [{"role": "user", "parts": [{"text": user}]}]

    last_error = ""
    for _ in range(2):
        try:
            response = client.models.generate_content(
                model=MODEL,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    response_mime_type="application/json",
                    temperature=0.3,
                ),
            )
        except Exception as e:
            raise RuntimeError(f"Strategy generation failed: {e}")

        raw = response.text or ""
        try:
            return schema.model_validate(json.loads(raw))
        except (json.JSONDecodeError, ValidationError) as e:
            last_error = str(e)[:500]
            contents.append({"role": "model", "parts": [{"text": raw}]})
            contents.append({
                "role": "user",
                "parts": [{"text": f"That JSON failed validation:\n{last_error}\n"
                                   "Return ONLY corrected JSON that matches the required shape."}],
            })

    raise RuntimeError("Could not produce a valid strategy from that description")


# --- Single-symbol DSL strategy ------------------------------------------

DSL_SYSTEM = """You translate a plain-English trading idea into a JSON strategy definition.

You do NOT write code. You return ONLY a JSON object. Every strategy is a single-symbol, \
long/short rule-based strategy evaluated on daily bars.

Vocabulary:
- Indicators: "CLOSE" (current price, no period), "RSI", "SMA", "EMA", "ATR" (each needs \
an integer "period" in bars).
- A condition compares a left indicator to a right side. "right" is EITHER a number \
(e.g. 30 for "RSI below 30") OR another indicator object (for a moving-average crossover).
- Operators: "<", ">", "<=", ">=", "crosses_above", "crosses_below".
- entry.conditions open the position; exit.conditions close it. Combine with "logic": \
"AND" or "OR".
- risk.stop_loss_pct / risk.take_profit_pct are fractions (0.08 = 8%); use null if not \
mentioned.
- "direction" is "long" or "short". "position_pct" is the fraction of capital per trade.

Guidance: "RSI oversold" ~ below 30, "overbought" ~ above 70. "Golden cross" = fast SMA \
crosses_above slow SMA. If no exit is given, mirror the entry and add a stop-loss.

Exact JSON shape (threshold example):
{
  "name": "RSI Mean Reversion",
  "symbol": "AAPL",
  "exchange": "NASDAQ",
  "direction": "long",
  "entry": {"conditions": [{"left": {"indicator": "RSI", "period": 14}, "operator": "<", "right": 30}], "logic": "AND"},
  "exit":  {"conditions": [{"left": {"indicator": "RSI", "period": 14}, "operator": ">", "right": 70}], "logic": "AND"},
  "risk": {"stop_loss_pct": 0.08, "take_profit_pct": null},
  "position_pct": 1.0
}
Crossover condition example (note "right" is an indicator object):
{"left": {"indicator": "SMA", "period": 50}, "operator": "crosses_above", "right": {"indicator": "SMA", "period": 200}}"""


def generate_dsl(description: str, symbol: str | None = None,
                 exchange: str | None = None) -> dict:
    user = f"Trading idea:\n{description.strip()}"
    if symbol:
        user += f"\n\nUse this exact symbol: {symbol}"

    strategy = _generate_json(DSL_SYSTEM, user, DslStrategy)
    if symbol:
        strategy.symbol = symbol
    if exchange:
        strategy.exchange = exchange
    return strategy.model_dump()


# --- Portfolio strategy selection ----------------------------------------

STRATEGY_LABELS = {
    "portfolio_mvo_strategy": "Mean-Variance Optimization (MVO)",
    "min_variance_strategy": "Minimum Variance",
    "max_diversification_strategy": "Maximum Diversification",
    "inverse_volatility_strategy": "Inverse Volatility",
}

PORTFOLIO_SYSTEM = """You choose and tune a portfolio-allocation strategy for a set of stocks the user provides.

You do NOT write code. You return ONLY a JSON object. You pick ONE algorithm and set its \
parameters to match the user's goal. The user already chose the universe (the symbols); \
you only decide how to allocate across them.

Algorithms and when to use each (the "strategy" field must be one of these exact strings):
- "portfolio_mvo_strategy" (Mean-Variance Optimization): maximize risk-adjusted growth. \
For "grow", "maximize returns", "aggressive". Uses gamma (risk aversion): ~2 aggressive, \
~5 balanced, ~10 conservative.
- "min_variance_strategy" (Minimum Variance): minimize volatility. For "protect capital", \
"low risk", "defensive", "preserve".
- "max_diversification_strategy" (Maximum Diversification): spread risk. For "diversify", \
"reduce concentration".
- "inverse_volatility_strategy" (Inverse Volatility): weight stable assets more, minimal \
management. For "stable", "passive", "simple". Ignores w_max.

Parameters:
- "est_win": trailing days. 1 month = 21, 2 months = 42, 3 months = 63.
- "w_max": max weight per stock (0-1). Tighter (0.2-0.3) = more diversified; looser \
(0.4-0.6) = concentrated. Must satisfy n_symbols * w_max >= 1.
- "rebalance_days": 5 weekly, 21 monthly, 63 quarterly.
- "gamma": risk aversion, meaningful only for MVO.

Exact JSON shape:
{"name": "Aggressive Growth", "strategy": "portfolio_mvo_strategy", "est_win": 63, \
"w_max": 0.3, "rebalance_days": 21, "gamma": 2, "rationale": "one sentence explaining the choice"}"""


def _portfolio_params(choice: PortfolioChoice) -> dict:
    """Assemble the parameter dict each strategy actually declares."""
    if choice.strategy == "portfolio_mvo_strategy":
        gamma = choice.gamma if (choice.gamma and choice.gamma > 0) else 5.0
        return {
            "est_win": choice.est_win,
            "gamma": gamma,
            "w_max": choice.w_max,
            "rebalance_days": choice.rebalance_days,
        }
    if choice.strategy == "inverse_volatility_strategy":
        return {"est_win": choice.est_win, "rebalance_days": choice.rebalance_days}
    return {
        "est_win": choice.est_win,
        "w_max": choice.w_max,
        "rebalance_days": choice.rebalance_days,
    }


def generate_portfolio_strategy(description: str, symbols: list[str],
                                exchange: str = "NASDAQ") -> dict:
    universe = ", ".join(symbols) if symbols else "(none provided)"
    user = (
        f"Goal:\n{description.strip()}\n\n"
        f"Universe ({len(symbols)} symbols): {universe}\n"
        f"Choose the best algorithm and parameters. Remember n_symbols * w_max >= 1."
    )
    choice = _generate_json(PORTFOLIO_SYSTEM, user, PortfolioChoice)
    return {
        "name": choice.name,
        "strategy": choice.strategy,
        "strategy_label": STRATEGY_LABELS[choice.strategy],
        "params": _portfolio_params(choice),
        "rationale": choice.rationale,
    }
