#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed."
    if command -v apt-get &> /dev/null; then
        echo "  Install: sudo apt install -y nodejs npm"
    elif command -v brew &> /dev/null; then
        echo "  Install: brew install node"
    fi
    exit 1
fi

# Check npm
if ! command -v npm &> /dev/null; then
    echo "ERROR: npm is not installed."
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start dev server
echo ""
echo "Starting AmpleWeb dev server on http://localhost:5173"
echo "Press Ctrl+C to stop."
echo ""
node server.js
