# VeighNA Trading Platform

A web-based algorithmic trading platform built on the [VeighNA](https://www.vnpy.com/) engine.
It provides strategy building, historical backtesting, parameter optimization, AI-assisted
strategy generation, and Alpaca paper trading — all from a single React web UI backed by a
FastAPI service.

## Features

The UI is organized into six tabs:

| Tab | What it does |
| --- | --- |
| **Strategy Builder** | Guided questionnaire that turns an investment goal + universe into a ready-to-run portfolio strategy with sensible default parameters. |
| **AI Strategy Builder** | Describe a trading idea in plain English; Google Gemini compiles it into a validated single-stock DSL strategy (or picks a portfolio algorithm). |
| **Portfolio Backtest** | Backtest multi-symbol allocation strategies (MVO, HRP, risk parity, min-variance, momentum, and more). |
| **Stock Backtest** | Backtest a single-symbol DSL strategy over a date range with full statistics and equity/drawdown charts. |
| **Optimize** | Search a saved strategy's parameters (Optuna) over an in-sample / out-of-sample split, analyze robustness (plateau vs. curve-fit), and get an automated robust parameter recommendation. |
| **Paper Trading** | Connect to an Alpaca paper account for live quotes, positions, and order entry over WebSocket. |

## Tech Stack

- **Backend:** Python 3.12, FastAPI, VeighNA (`vnpy`, `vnpy_ctastrategy`, `vnpy_portfoliostrategy`, `vnpy_ctabacktester`), SQLite storage (`vnpy_sqlite`)
- **Optimization:** Optuna
- **Market data:** Polygon
- **Broker:** Alpaca (paper trading) via a custom VeighNA gateway
- **AI:** Google Gemini (`google-genai`)
- **Frontend:** Vite + React + TypeScript, Recharts

## Prerequisites

**1. TA-Lib (C library)** — required by VeighNA's indicator engine.

```bash
# macOS
brew install ta-lib

# Ubuntu / Debian
sudo apt-get install libta-lib-dev
```

**2. Node.js** (v20+) — to build and run the frontend.

```bash
brew install node
```

**3. API keys**

- **Alpaca** — sign up at [alpaca.markets](https://alpaca.markets) and create an API key/secret (paper trading is fine).
- **Polygon** — an API key from [polygon.io](https://polygon.io) for historical market data.
- **Google Gemini** — an API key from [Google AI Studio](https://aistudio.google.com) for AI strategy generation.

## Setup

```bash
git clone <your-repo>
cd VeighNa-Web
bash setup.sh
```

`setup.sh` will:

- Create a Python virtual environment in `venv/`
- Install Python dependencies from `requirements.txt` (uses VeighNA's custom package index)
- Create `.env` from `.env.example`
- Install frontend npm dependencies (if Node.js is present)

## Configuration

Fill in your credentials in `.env`:

```dotenv
ALPACA_API_KEY=
ALPACA_SECRET_KEY=
POLYGON_API_KEY=
GEMINI_API_KEY=
```

## Running

Activate the virtual environment (required in every new terminal session):

```bash
source venv/bin/activate
```

Start the backend (FastAPI, **port 8100**):

```bash
python backend/server.py
```

Then start the frontend (see below).

## Frontend

The frontend is a Vite + React + TypeScript app in `frontend/`.

**Development** (hot reload, talks to the API at `http://localhost:8100`):

```bash
cd frontend
npm install
npm run dev
```

**Production build** (served by the FastAPI backend at `http://localhost:8100/`):

```bash
cd frontend
npm run build
```

The backend automatically serves `frontend/dist/` at the root path when it exists, so one
process can serve both API and UI. Set `VITE_API_URL` in `frontend/.env` to point the dev
server at a different backend host.

## Project Structure

```
VeighNa-Web/
├── setup.sh                One-command setup script
├── requirements.txt        Python dependencies (includes VeighNA's package index)
├── .env / .env.example     Credentials (never commit .env)
├── Dockerfile              Builds frontend + backend into one image
├── backend/
│   ├── server.py           FastAPI app: wires routers, serves the frontend
│   ├── engine.py           VeighNA engine setup + broker connection
│   ├── ws.py               WebSocket endpoint for live market data
│   ├── schemas.py          Pydantic request models
│   ├── routers/            HTTP endpoints (trading, market_data, backtest,
│   │                       optimize, ai, saved_stock, saved_portfolio)
│   ├── services/           Business logic behind the routers
│   ├── gateways/           alpaca_gateway.py — Alpaca gateway for VeighNA
│   ├── datafeed/           polygon_feed.py — Polygon market-data loader
│   ├── dsl/                schema.py — AI/DSL strategy schema + validation
│   └── data/               Local SQLite market-data store
├── frontend/               Vite + React + TypeScript web UI
│   └── src/
│       ├── pages/          One component per tab
│       ├── components/      backtest/, portfolio/, common/ UI building blocks
│       ├── hooks/           useWebSocket, useStrategySelection
│       ├── lib/             Pure helpers (dates, weights, dsl, goals)
│       ├── api.ts           REST client for the FastAPI backend
│       └── types.ts         Shared TypeScript types
└── strategies/
    ├── cta/                Single-symbol strategies (subclass CtaTemplate)
    │   └── dsl_strategy.py     AI DSL interpreter (the single-symbol strategy)
    └── portfolio/          Multi-symbol strategies (subclass StrategyTemplate)
        ├── portfolio_hold_strategy.py     portfolio_rebalance_strategy.py
        ├── portfolio_mvo_strategy.py      hrp_strategy.py
        ├── risk_parity_strategy.py        min_variance_strategy.py
        ├── max_diversification_strategy.py inverse_volatility_strategy.py
        ├── equal_weight_strategy.py       momentum_strategy.py
        └── ...
```

## Architecture

```
      React Frontend (Vite)
              │  REST + WebSocket
      FastAPI backend (backend/server.py, port 8100)
              │  internal
      VeighNA engine (headless)
         ├── Alpaca gateway  ──►  Alpaca API (paper trading)
         └── Polygon datafeed ─►  Polygon (historical data)
```

## Known Limitations

- Single shared VeighNA engine and Alpaca account per running backend instance — not
  multi-tenant as-is.
- Paper trading only; no live-money broker integration.
</content>
</invoke>
