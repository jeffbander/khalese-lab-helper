#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Khalese Lab Helper — EurekaClaw Backend Launcher
# Starts the EurekaClaw Python server on port 8781
# ─────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
EUREKACLAW_DIR="${PROJECT_ROOT}/../eurekaclaw"

echo "🧬 Khalese Lab Helper — Backend Launcher"
echo "   In Runx-1 We Trust"
echo ""

# Check if eurekaclaw directory exists
if [ ! -d "$EUREKACLAW_DIR" ]; then
    echo "📦 EurekaClaw not found. Cloning..."
    git clone https://github.com/eurekaclaw/eurekaclaw.git "$EUREKACLAW_DIR"
fi

cd "$EUREKACLAW_DIR"

# Check if .env exists
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "⚠️  Created .env from .env.example"
        echo "   Please add your ANTHROPIC_API_KEY to: $EUREKACLAW_DIR/.env"
    fi
fi

# Check for API key
if [ -f ".env" ] && ! grep -q "ANTHROPIC_API_KEY=sk-" .env 2>/dev/null; then
    echo ""
    echo "⚠️  WARNING: ANTHROPIC_API_KEY not set in .env"
    echo "   The research pipeline requires a valid API key."
    echo "   Add it to: $EUREKACLAW_DIR/.env"
    echo ""
fi

# Check if virtual env exists, create if not
if [ ! -d ".venv" ]; then
    echo "🐍 Creating Python virtual environment..."
    python3 -m venv .venv
fi

source .venv/bin/activate

# Install if needed
if ! python -c "import eurekaclaw" 2>/dev/null; then
    echo "📦 Installing EurekaClaw..."
    pip install -e "." 2>&1 | tail -3
fi

# Start the UI server on port 8781
echo ""
echo "🚀 Starting EurekaClaw backend on port 8781..."
echo "   API: http://localhost:8781/api/runs"
echo ""
python -m eurekaclaw.ui.server --port 8781
