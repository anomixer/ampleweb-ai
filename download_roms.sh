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

# Dragon32 Patch
DRAGON32="public/roms/dragon32.zip"
echo "🐉 Checking Dragon32 ROM patch..."
# Always try to patch if we can, or at least ensure it exists
mkdir -p temp_dragon_patch
if [ -f "$DRAGON32" ]; then
    unzip -o "$DRAGON32" -d temp_dragon_patch
fi

echo "📥 Fetching MDK version for missing files..."
curl -L -o mdk_dragon.zip https://mdk.cab/download/split/dragon32.zip
if [ -f "mdk_dragon.zip" ]; then
    unzip -o mdk_dragon.zip -d temp_dragon_patch
    rm mdk_dragon.zip
    
    # Create a fresh zip
    rm -f "$DRAGON32"
    cd temp_dragon_patch && zip -r "../$DRAGON32" . && cd ..
    echo "✅ Fixed: dragon32.zip patched and updated."
    echo "📦 Final ZIP content verification:"
    unzip -l "$DRAGON32"
else
    echo "⚠️ Warning: Could not download MDK version for Dragon32 patch."
fi
rm -rf temp_dragon_patch

echo "✨ Script execution finished."
