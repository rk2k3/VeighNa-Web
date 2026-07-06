# VeighNA Trading Platform

VeighNA-based algorithmic trading system with IB gateway, backtesting, and web API integration.

## Prerequisites

### 1. Install ta-lib system dependency
Mac:
    brew install ta-lib

Ubuntu:
    sudo apt-get install libta-lib-dev

### 2. Install TWS or IB Gateway
- Download from ibkr.com
- Log into your IBKR paper trading account
- Enable API: Edit > Global Configuration > API > Settings > Enable ActiveX and Socket Clients
- Set port to 7497 (TWS paper) or 4002 (IB Gateway paper)

## Setup

    git clone your-repo
    cd VeighNa
    bash setup.sh

This will:
- Create a Python virtual environment
- Install all dependencies including ibapi (vendored at 10.45.1)
- Apply all patches to vnpy_ib, vnpy_paperaccount and vnpy_polygon
- Create .env from .env.example

## Configuration

Fill in your credentials in .env:

    IB_HOST=127.0.0.1
    IB_PORT=7497
    IB_CLIENT_ID=1
    IB_ACCOUNT=
    WEBTRADER_HOST=0.0.0.0
    WEBTRADER_PORT=8000
    WEBTRADER_USERNAME=admin
    WEBTRADER_PASSWORD=password

Port reference:
- TWS paper trading: 7497
- TWS live trading: 7496
- IB Gateway paper: 4002
- IB Gateway live: 4001

## Running

Activate venv first (required every new terminal session):
    source venv/bin/activate

GUI mode (local testing with full VeighNA interface):
    python run.py

Headless mode (for web integration / production):
    python run_server.py

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
    run.py                      GUI mode, local testing only
    run_server.py               Headless mode, integration/production
    config.py                   All settings via environment variables
    setup.sh                    One-command setup script
    setup_patches.py            All translation and bug fixes
    requirements.txt            pip dependencies (ibapi excluded, vendored)
    .env                        Local credentials (never commit)
    .env.example                Template for other developers
    Dockerfile                  For future containerization
    frontend/                   Vite + React + TypeScript web UI
        src/
            components/          Page and shared UI components
            hooks/               useWebSocket, etc.
            api.ts               REST client for the FastAPI backend
            types.ts             Shared TypeScript types
    vendor/
        ibapi_pkg/              Vendored ibapi 10.45.1
    load_commodities.py         Download commodity data via yfinance
    backtest_individual.py      Individual commodity backtests
    backtest_portfolio.py       3-asset portfolio backtest 40/30/30
    backtest_portfolio_all5.py  5-asset equal weight portfolio backtest
    strategies/
        __init__.py
        double_ma_strategy.py
        buy_and_hold_strategy.py
        testing_strategy.py
        portfolio_hold_strategy.py

## Architecture

    Vite Frontend (web platform)
          REST + WebSocket
    vnpy_webtrader (FastAPI, port 8000)
          internal
    VeighNA engine (headless)
          localhost:7497
    TWS / IB Gateway (same machine)
          IBKR servers

## Known Limitations

- Paper trading API only provides delayed market data (15 min)
- CTP gateway (Chinese futures) not supported on Mac, requires Windows/Linux
- One TWS session per IBKR account, not suitable for multi-user production
- For multi-user production, consider replacing IB gateway with Alpaca API

## Patches Applied

All patches in setup_patches.py, applied automatically during setup:
- vnpy_ib: English translations, error() signature fix for ibapi 10.45.1+,
  delayed tick codes, TIF fix, reqMarketDataType for delayed data
- vnpy_paperaccount: English translations
- vnpy_polygon: timezone-aware datetime fix
