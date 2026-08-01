#!/bin/bash
# Double-click this file in Finder to install (if needed), update, and run Image Express.
cd "$(dirname "$0")"

# Clear the download-quarantine flag from this folder. Files unpacked from a
# downloaded .zip are quarantined, and macOS blocks quarantined scripts that
# carry no Developer ID signature. Reaching this line means the user already
# chose to run this file, so the remaining copies should not stop them again.
if [ "$(uname -s)" = "Darwin" ] && command -v xattr >/dev/null 2>&1; then
    xattr -dr com.apple.quarantine . 2>/dev/null || true
    chmod +x ./*.command 2>/dev/null || true
fi

if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] Node.js is not installed."
    if [ -f "./install.command" ]; then
        echo "Running install.command to set everything up..."
        bash "./install.command"
        exit $?
    fi
    echo "Please install Node.js 24 from https://nodejs.org/ and double-click this file again."
    echo "Or run install.command instead to set everything up from scratch."
    read -r -p "Press Enter to close..."
    exit 1
fi

if [ ! -f "./package.json" ]; then
    echo "[ERROR] package.json not found. This folder does not look like an Image Express install."
    echo "Run install.command first, or clone the repository again."
    read -r -p "Press Enter to close..."
    exit 1
fi

if [ ! -d "./node_modules" ]; then
    echo "[LAUNCH] First run — installing dependencies..."
    node ./scripts/ensure-deps.mjs --force || {
        echo "Dependency install failed. See messages above."
        read -r -p "Press Enter to close..."
        exit 1
    }
fi

node scripts/launch.mjs
code=$?
echo
if [ "$code" -ne 0 ]; then
    echo "Launcher exited with code $code."
    echo "Tip: run 'npm run update' to refresh code and libraries, then try again."
fi
read -r -p "Press Enter to close this window..."
exit "$code"
