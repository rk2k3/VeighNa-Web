"""Natural language -> validated strategy, via Google Gemini (free tier).

Two flavours:
- generate_dsl: a single-symbol rule-based strategy (the trading DSL), run by
  strategies/cta/dsl_strategy.py.
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


class BadPromptError(RuntimeError):
    """The user's description can't be turned into a strategy — they should rephrase.

    Subclasses RuntimeError so the routers surface it as an HTTP 400, same as any
    other generation failure; the message tells the user to try again.
    """


def _client() -> genai.Client:
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY is not set — add it to .env")
    return genai.Client(api_key=key)


def _retry_turn(contents: list, raw: str, reason: str) -> None:
    """Append the model's bad reply plus a correction request for the next attempt."""
    contents.append({"role": "model", "parts": [{"text": raw}]})
    contents.append({
        "role": "user",
        "parts": [{"text": f"That JSON was not usable:\n{reason}\n"
                           "Return ONLY corrected JSON that matches the required shape."}],
    })


def _generate_json(system: str, user: str, schema: Type[T]) -> T:
    """Ask Gemini for JSON, validate against `schema`, retry once on failure.

    The model may also refuse an unusable prompt by returning ``{"error": "..."}``
    (see the rejection instructions in each system prompt); we surface that as a
    BadPromptError so the user is asked to rephrase rather than being handed a
    strategy invented from nonsense.
    """
    client = _client()
    contents: list = [{"role": "user", "parts": [{"text": user}]}]

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
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            _retry_turn(contents, raw, str(e)[:500])
            continue

        # The model rejects prompts it can't turn into a strategy. This is a
        # definitive verdict on the input, so we do not retry.
        if isinstance(data, dict) and isinstance(data.get("error"), str) and data["error"].strip():
            raise BadPromptError(
                f"Couldn't build a strategy from that — {data['error'].strip()} "
                "Please rephrase with a clearer request and try again."
            )

        try:
            return schema.model_validate(data)
        except ValidationError as e:
            _retry_turn(contents, raw, str(e)[:500])

    raise RuntimeError("Could not produce a valid strategy from that description")


# --- Single-symbol DSL strategy ------------------------------------------

DSL_SYSTEM = """You translate a plain-English trading idea into a JSON strategy definition.

You do NOT write code. You return ONLY a JSON object. Every strategy is a single-symbol, \
long/short rule-based strategy evaluated on daily bars.

If the idea is empty, gibberish, not about trading, or too vague to become concrete \
entry/exit rules (e.g. "asdf", "hello", "make me rich", "buy some stocks"), do NOT invent \
a strategy — return ONLY {"error": "<short reason it can't be built>"} instead. A brief but \
genuine rule like "buy AAPL when RSI drops below 30" IS enough; only reject input you truly \
cannot interpret as a trading idea.

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


# --- Backtest verdict ------------------------------------------------------

VERDICT_SYSTEM = """You are a quantitative analyst writing a short verdict on a backtest \
for a client who may not be a quant.

You are given a JSON summary of the results. Write 3-5 plain-English sentences:
- Lead with the bottom line: did the strategy work, and is the result trustworthy?
- If benchmark data is present, say whether it beat buy-and-hold and by how much — this \
matters more than the raw return.
- Flag statistical weakness honestly: few trades (under ~30) make the metrics unreliable; \
say so plainly.
- Mention the dominant risk (worst drawdown, concentration of losses) if the data shows one.
- If trade statistics are present, you may cite win rate or profit factor when relevant.

Rules: use ONLY numbers present in the JSON — never invent or estimate figures. No headers, \
no bullet points, no disclaimers about past performance, no investment advice framing. \
Plain prose only. Round numbers sensibly (e.g. "31%" not "31.11%")."""


def _plain_text_verdict(system: str, context: dict) -> str:
    """One short plain-text paragraph from a JSON context. Not JSON-validated."""
    client = _client()
    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=[{"role": "user", "parts": [{"text": json.dumps(context)}]}],
            config=types.GenerateContentConfig(
                system_instruction=system,
                temperature=0.4,
            ),
        )
    except Exception as e:
        raise RuntimeError(f"Verdict generation failed: {e}")
    text = (response.text or "").strip()
    if not text:
        raise RuntimeError("Verdict generation returned no text")
    return text


def explain_backtest(context: dict) -> str:
    """One short paragraph interpreting a backtest result."""
    return _plain_text_verdict(VERDICT_SYSTEM, context)


OPTIMIZE_VERDICT_SYSTEM = """You are a quantitative analyst writing a short verdict on a \
parameter-optimization run (or a walk-forward validation run) for a client who may not be a quant.

You are given a JSON summary. Write 3-5 plain-English sentences ending in a clear \
recommendation: adopt the recommended parameters, treat them with caution, or don't trust \
this run.

How to judge an optimization payload:
- Compare the recommended parameters' out-of-sample result against the baseline (current \
parameters). Improvement that holds out-of-sample is the point; in-sample improvement alone \
is not evidence.
- pbo is the probability of backtest overfitting: under 0.2 is reassuring, around 0.5 is a \
coin flip, higher is worse than random.
- deflated_sharpe is the probability the recommended strategy's edge is real after \
accounting for how many parameter sets were tried: 0.95+ is the usual bar, below 0.5 is weak.
- The recommendation's reasons list plateau/robustness findings; a warning there matters.

How to judge a walk_forward payload:
- walk_forward_efficiency is out-of-sample performance as a share of in-sample: above ~0.5 \
is healthy, near zero or negative means the optimization was fitting noise.
- windows_positive out of n_windows shows consistency across time.

Rules: use ONLY numbers present in the JSON — never invent figures. No headers, no bullet \
points, no disclaimers. Plain prose. Round numbers sensibly and express probabilities as \
percentages."""


def explain_optimization(context: dict) -> str:
    """One short paragraph interpreting an optimization or walk-forward run."""
    return _plain_text_verdict(OPTIMIZE_VERDICT_SYSTEM, context)


MONTECARLO_VERDICT_SYSTEM = """You are a quantitative analyst writing a short verdict on a \
Monte Carlo stress test of a trading strategy, for a client who may not be a quant.

The simulation resampled the strategy's own backtest results many times to show the range \
of outcomes it could have produced. You are given a JSON summary. Write 3-5 plain-English \
sentences:
- Lead with the bottom line: is this strategy robust to luck, or was the backtest result \
flattering?
- If actual_total_return_pct is present, compare it to the simulated distribution \
(median_final_return, p05/p95): near or below the median means the realized result is \
typical or conservative; near the 95th percentile means the backtest was a lucky draw and \
expectations should be tempered.
- Interpret the risk numbers: prob_loss is the share of simulations that ended below the \
starting capital — describe it as "ending at a loss" or "below the starting capital", NEVER \
as "total loss". median_max_drawdown and prob_dd_worse_20 (share of simulations whose worst \
drawdown exceeded 20%) describe drawdown risk. High drawdown probabilities matter even when \
the median return looks good.
- The method matters: "trades" only shuffles trade order (sequence risk); "block" and \
"bootstrap" resample daily returns.

Rules: use ONLY numbers present in the JSON — never invent figures. No headers, no bullet \
points, no disclaimers. Plain prose. Round numbers sensibly."""


def explain_montecarlo(context: dict) -> str:
    """One short paragraph interpreting a Monte Carlo stress test."""
    return _plain_text_verdict(MONTECARLO_VERDICT_SYSTEM, context)


# --- Portfolio strategy selection ----------------------------------------

STRATEGY_LABELS = {
    "portfolio_mvo_strategy": "Mean-Variance Optimization (MVO)",
    "min_variance_strategy": "Minimum Variance",
    "max_diversification_strategy": "Maximum Diversification",
    "inverse_volatility_strategy": "Inverse Volatility",
    "equal_weight_strategy": "Equal Weight (1/N)",
    "risk_parity_strategy": "Risk Parity (Equal Risk Contribution)",
    "momentum_strategy": "Momentum (Relative Strength)",
    "hrp_strategy": "Hierarchical Risk Parity (HRP)",
}

PORTFOLIO_SYSTEM = """You choose and tune a portfolio-allocation strategy for a set of stocks the user provides.

You do NOT write code. You return ONLY a JSON object. You pick ONE algorithm and set its \
parameters. The user already chose the universe (the symbols); you only decide how to \
allocate across them.

If the goal is empty, gibberish, not about investing, or impossible to read as any \
investment preference (e.g. "asdf", "banana", "hello"), do NOT invent a strategy — return \
ONLY {"error": "<short reason it can't be built>"} instead. A brief but genuine preference \
like "grow aggressively" or "keep it safe" IS enough; only reject input you truly cannot \
interpret as an investment goal.

If the user explicitly names an algorithm (e.g. "use risk parity", "equal weight", "HRP", \
"mean-variance optimization", "momentum"), you MUST select that exact algorithm and only \
tune its parameters. Otherwise, choose the algorithm that best fits the goal they describe.

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
- "equal_weight_strategy" (Equal Weight, 1/N): give every stock the same weight. A simple, \
robust baseline. For "simple", "baseline", "no strong view", "treat all equally". Ignores \
w_max and est_win.
- "risk_parity_strategy" (Risk Parity / Equal Risk Contribution): each stock contributes \
equally to total risk, using correlations (a smarter inverse volatility). For "balanced \
risk", "all-weather", "equal risk". Ignores w_max.
- "momentum_strategy" (Momentum / Relative Strength): tilt toward recent winners by trailing \
return; drops losers. For "trend", "momentum", "winners", "growth with trend". Uses w_max to \
cap concentration.
- "hrp_strategy" (Hierarchical Risk Parity): cluster correlated stocks and split risk across \
clusters; robust out-of-sample. For "robust diversification", "clustered", "stable \
diversification". Ignores w_max.

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
    if choice.strategy == "equal_weight_strategy":
        return {"rebalance_days": choice.rebalance_days}
    if choice.strategy in (
        "inverse_volatility_strategy",
        "risk_parity_strategy",
        "hrp_strategy",
    ):
        return {"est_win": choice.est_win, "rebalance_days": choice.rebalance_days}
    # min_variance, max_diversification, momentum
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
