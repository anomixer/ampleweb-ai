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

# Check ROMs
ROM_DIR="public/roms"
if [ ! -d "$ROM_DIR" ] || [ -z "$(ls -A "$ROM_DIR" 2>/dev/null | grep -E '\.zip$')" ]; then
    echo ""
    echo "[!] ROMs not found in $ROM_DIR."
    if command -v pwsh &> /dev/null; then
        echo "Launching ROM Downloader (pwsh)..."
        pwsh -ExecutionPolicy Bypass -File download_roms.ps1
    else
        echo "Launching ROM Downloader (python fallback)..."
        # Fallback to direct python call if pwsh is missing
        python3 rom_manager_cli.py --plist public/resources/roms.plist --dest public/roms
    fi
fi

# Start dev server
node server.js
