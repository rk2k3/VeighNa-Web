#!/bin/bash
echo "Setting up VeighNA trading environment..."

# 1. Create venv
python3 -m venv venv

# 2. Activate venv inside this script
source venv/bin/activate

# 3. Install pip packages
pip install --upgrade pip
pip install -r requirements.txt

# 4. Install ibapi manually
IBAPI_PATH="${IBAPI_PATH:-$HOME/IBJts/source/pythonclient}"

if [ -d "$IBAPI_PATH" ]; then
    echo "Installing ibapi from $IBAPI_PATH..."
    cd "$IBAPI_PATH"
    sudo chmod -R 755 .
    pip install .
    cd -
else
    echo "WARNING: ibapi not found at $IBAPI_PATH"
    echo "Please download TWS API from IBKR and set IBAPI_PATH:"
    echo "export IBAPI_PATH=/path/to/IBJts/source/pythonclient"
    echo "Then re-run this script"
fi

# 5. Apply patches
python setup_patches.py

# 6. Copy .env if it doesn't exist
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env from .env.example — please fill in your credentials"
fi

echo ""
echo "Setup complete!"
echo "IMPORTANT: Activate venv in your terminal before running:"
echo "  source venv/bin/activate"
echo ""
echo "Then run with:"
echo "  python run.py        # GUI mode"
echo "  python run_server.py # Headless mode"
