#!/bin/bash
echo "Setting up VeighNA trading environment..."

# 1. Create venv
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip

# 2. Install everything from VeighNA's index
pip install \
    vnpy \
    vnpy_ib \
    vnpy_ctastrategy \
    vnpy_ctabacktester \
    vnpy_portfoliostrategy \
    vnpy_paperaccount \
    vnpy_sqlite \
    vnpy_polygon \
    vnpy_webtrader \
    yfinance \
    matplotlib \
    python-dotenv \
    --index-url https://pypi.vnpy.com/simple/ \
    --extra-index-url https://pypi.org/simple/

# 3. Install ibapi from vendor
pip install vendor/ibapi_pkg

# 4. Apply patches
python setup_patches.py

# 5. Copy .env
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env from .env.example"
fi

echo ""
echo "Setup complete!"
echo "Activate venv: source venv/bin/activate"
echo "GUI mode:      python run.py"
echo "Headless mode: python run_server.py"
