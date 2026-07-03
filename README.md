# VeighNA Trading Setup

## Prerequisites (manual steps before running setup.sh)

### 1. Install ta-lib system dependency
**Mac:**
```bash
brew install ta-lib
```
**Ubuntu:**
```bash
sudo apt-get install libta-lib-dev
```

### 2. Download TWS API from IBKR
- Go to https://www.interactivebrokers.com/en/trading/tws-api.php
- Download the latest TWS API
- Extract to ~/IBJts

### 3. Install TWS or IB Gateway
- Download from ibkr.com
- Log into your paper trading account

## Setup

```bash
git clone your-repo
cd trader
bash setup.sh
```

## Running

```bash
source venv/bin/activate

# GUI mode (local testing)
python run.py

# Headless mode (integration/production)
python run_server.py
```

## Environment Variables
Copy .env.example to .env and fill in:
- IB_PORT: 7497 for TWS, 4002 for IB Gateway
- IB_ACCOUNT: your IBKR account number (optional)
