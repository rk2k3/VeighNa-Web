#!/bin/bash
echo "Setting up VeighNA trading environment..."

# 1. Create venv
python3 -m venv venv

# 2. Activate venv inside this script
source venv/bin/activate

# 3. Install pip packages
pip install --upgrade pip
pip install -r requirements.txt

# 4. Install ibapi from vendor folder (pinned to working version 10.45.1)
echo "Installing ibapi from vendor..."
pip install vendor/ibapi_pkg

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
