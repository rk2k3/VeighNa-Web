#!/bin/bash
echo "Setting up VeighNA trading environment..."

# 1. Create venv
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Copy .env
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env from .env.example"
fi

# 4. Install frontend dependencies
if command -v npm >/dev/null 2>&1; then
    (cd frontend && npm install)
else
    echo "npm not found — install Node.js, then run: cd frontend && npm install"
fi

echo ""
echo "Setup complete!"
echo "Activate venv:  source venv/bin/activate"
echo "Run backend:    python backend/server.py"
echo "Run frontend:   cd frontend && npm run dev"
