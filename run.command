#!/bin/bash
# Double-click this file in Finder to install (if needed), update, and run Image Express.
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] Node.js is not installed."
    echo "Please install Node.js 24 from https://nodejs.org/ and double-click this file again."
    read -p "Press Enter to close..."
    exit 1
fi

node scripts/launch.mjs
echo
read -p "Press Enter to close this window..."
