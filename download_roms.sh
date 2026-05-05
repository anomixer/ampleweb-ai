#!/bin/bash
# AmpleWeb ROM Downloader Helper for Linux/CI
# This script installs dependencies and runs the multi-threaded downloader.

echo "🚀 Installing dependencies..."
pip3 install requests

echo "📥 Starting ROM downloads..."
# Run the python downloader
# --plist: source list
# --dest: destination directory
# --threads: concurrent downloads
python3 rom_manager_cli.py --plist public/resources/roms.plist --dest public/roms/ --threads 50

echo "✅ ROM download step complete."

# --- ROM Patches & Fixes ---
echo "🔧 Applying ROM patches..."
DEST_DIR="public/roms"
A2C="$DEST_DIR/apple2c.zip"
TK3K="$DEST_DIR/tk3000.zip"

if [ -f "$A2C" ]; then
    if [ ! -f "$TK3K" ]; then
        cp "$A2C" "$TK3K"
        echo "Fixed: Copied apple2c.zip to tk3000.zip (Source fix for CallApple)"
    else
        echo "tk3000.zip already exists, skipping patch."
    fi
fi

echo "✨ Script execution finished."
