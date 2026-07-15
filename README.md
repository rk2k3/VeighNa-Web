# VeighNA Trading Platform

VeighNA-based algorithmic trading system with Alpaca paper trading, backtesting, and a web UI.

## Prerequisites

### 1. Install ta-lib system dependency
Mac:
    brew install ta-lib

Ubuntu:
    sudo apt-get install libta-lib-dev

### 2. Install Node.js
Required to build/run the frontend (v20+ recommended):
    brew install node

### 3. Alpaca account
- Sign up at alpaca.markets
- Create an API key/secret pair (paper trading is fine)

## Setup

    git clone your-repo
    cd VeighNa
    bash setup.sh

This will:
- Create a Python virtual environment
- Install all Python dependencies from requirements.txt
- Create .env from .env.example
- Install frontend npm dependencies (if Node.js is installed)

## Configuration

Fill in your credentials in .env:

    ALPACA_API_KEY=
    ALPACA_SECRET_KEY=

## Running

Activate venv first (required every new terminal session):
    source venv/bin/activate

Start the backend (FastAPI, port 8000):
    python backend/server.py

Then run the frontend — see Frontend section below.

## Frontend

The frontend is a Vite + React + TypeScript app in frontend/.

Development (hot reload, talks to API at http://localhost:8000):
    cd frontend
    npm install
    npm run dev

Production build (served by the FastAPI backend at http://localhost:8000/):
    cd frontend
    npm run build

The backend automatically serves frontend/dist/ at the root path if it exists.
Set VITE_API_URL in frontend/.env to point the dev server at a different backend host.

## Project Structure

VeighNa/
    setup.sh                    One-command setup script
    requirements.txt            pip dependencies (includes vnpy's custom package index)
    .env                        Local credentials (never commit)
    .env.example                Template for other developers
    Dockerfile                  Builds frontend + backend into one image
    backend/
        server.py               FastAPI app: wires routers + serves the frontend
        routers/                Thin HTTP endpoints (trading, backtest, strategies, dsl)
        services/               Business logic behind the routers
        gateways/
            alpaca_gateway.py    Alpaca gateway for vnpy
        datafeed/               Polygon market-data loader
        dsl/                    AI/DSL strategy schema
    frontend/                   Vite + React + TypeScript web UI
        src/
            pages/               One component per tab (Backtest, Portfolio, ...)
            components/
                backtest/        Backtest result/chart/param components
                portfolio/       Allocation, weights, symbols tables
                common/          Shared UI (StatCard, Tabs, AccountPanel, ...)
            hooks/               useWebSocket, useStrategySelection
            lib/                 Pure helpers (dates, weights, dsl, goals)
            api.ts               REST client for the FastAPI backend
            types.ts             Shared TypeScript types
    strategies/
        __init__.py
        cta/                    Single-symbol strategies (subclass CtaTemplate)
            double_ma_strategy.py, buy_and_hold_strategy.py, dsl_strategy.py, ...
        portfolio/              Multi-symbol strategies (subclass StrategyTemplate)
            portfolio_hold_strategy.py, portfolio_mvo_strategy.py, ...

## Architecture

    Vite Frontend
          REST + WebSocket
    FastAPI backend (backend/server.py, port 8000)
          internal
    VeighNA engine (headless)
          Alpaca gateway
    Alpaca API (paper trading)

## Known Limitations

- Alpaca paper trading account only — one account per running backend instance
- Not suitable for multi-user production as-is (single shared engine/account)
