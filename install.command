#!/bin/bash
# ============================================================================
#  Image Express one-file installer (macOS). Double-click me - that's all.
#  Downloads everything from GitHub (nothing bundled), and logs EVERY step
#  and error to ~/ImageExpress-setup.log - if anything breaks, send that
#  file to support.
# ============================================================================
LOGFILE="$HOME/ImageExpress-setup.log"
exec > >(tee -a "$LOGFILE") 2>&1
set -o pipefail

echo
echo "===== Image Express setup started: $(date) ====="
echo "Log file: $LOGFILE"
echo
echo "   |\\__/|    Image Express - Setup"
echo "  (  o.o  )   Your border collie will now herd the bits into place."
echo "   /|__|\\"
echo

fail() {
    echo
    echo "ERROR: $1"
    echo "Full log saved to: $LOGFILE - please send it to support."
    read -r -p "Press Enter to close"
    exit 1
}

REPO_URL="https://github.com/GeekatplayStudio/Image-Express.git"
INSTALL_DIR="$HOME/ImageExpress"

# If this file sits inside an existing checkout, install in place.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/package.json" ] && [ -f "$SCRIPT_DIR/next.config.ts" ]; then
    INSTALL_DIR="$SCRIPT_DIR"
fi

# Unattended mode (testing/CI): IMAGEEXPRESS_SETUP_AUTO=1 takes every default.
AUTO="${IMAGEEXPRESS_SETUP_AUTO:-0}"
[ -n "$IMAGEEXPRESS_SETUP_DIR" ] && INSTALL_DIR="$IMAGEEXPRESS_SETUP_DIR"
ask() { # ask "prompt" "default"
    if [ "$AUTO" = "1" ]; then echo "$1 [auto: '$2']" >&2; echo "$2"; return; fi
    read -r -p "$1: " REPLY_VAL; echo "${REPLY_VAL:-$2}"
}

CUSTOM_DIR="$(ask "Install folder [$INSTALL_DIR]" "")"
[ -n "$CUSTOM_DIR" ] && INSTALL_DIR="$CUSTOM_DIR"
echo "Install folder: $INSTALL_DIR"

echo "=== 1/7 Checking Git ==="
if ! command -v git >/dev/null 2>&1; then
    echo "Git not found - triggering the Apple command-line tools install..."
    xcode-select --install || true
    fail "Re-run this setup after the command-line tools finish installing."
fi
echo "OK: $(git --version)"

echo "=== 2/7 Checking Node.js (24 or newer) ==="
NODE_MAJOR="$(node -v 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/')"
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 24 ] 2>/dev/null; then
    # A good node may exist but be shadowed by a version manager - check common spots.
    CANDIDATES="/usr/local/bin/node /opt/homebrew/bin/node"
    CANDIDATES="$CANDIDATES $(ls -d "${NVM_DIR:-$HOME/.nvm}"/versions/node/*/bin/node 2>/dev/null | sort -Vr)"
    CANDIDATES="$CANDIDATES $(ls -d "$HOME"/.volta/tools/image/node/*/bin/node 2>/dev/null | sort -Vr)"
    CANDIDATES="$CANDIDATES $(ls -d "$HOME"/.local/share/fnm/node-versions/*/installation/bin/node 2>/dev/null | sort -Vr)"
    CANDIDATES="$CANDIDATES $(ls -d "$HOME"/.asdf/installs/nodejs/*/bin/node 2>/dev/null | sort -Vr)"
    CANDIDATES="$CANDIDATES $(ls -d /opt/homebrew/opt/node@*/bin/node /usr/local/opt/node@*/bin/node 2>/dev/null | sort -Vr)"
    for CAND in $CANDIDATES; do
        if [ -x "$CAND" ]; then
            CAND_MAJOR="$("$CAND" -v | sed 's/^v\([0-9]*\).*/\1/')"
            if [ "$CAND_MAJOR" -ge 24 ] 2>/dev/null; then
                export PATH="$(dirname "$CAND"):$PATH"
                echo "Using Node $("$CAND" -v) from $CAND (an older node was first on PATH)."
                NODE_MAJOR="$CAND_MAJOR"
                break
            fi
        fi
    done
fi
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 24 ] 2>/dev/null; then
    if command -v brew >/dev/null 2>&1; then
        echo "Installing Node.js 24 via Homebrew..."
        brew install node@24 && brew link --overwrite node@24 || fail "Homebrew could not install Node.js 24."
    else
        fail "Node.js 24+ is required. Install it from https://nodejs.org and re-run. (If you use nvm: 'nvm install 24 && nvm use 24'.)"
    fi
fi
echo "OK: node $(node -v), npm $(npm -v)"

echo "=== 3/7 Downloading Image Express from GitHub ==="
if [ -d "$INSTALL_DIR/.git" ]; then
    echo "Existing install found - updating..."
    git -C "$INSTALL_DIR" pull --ff-only || echo "WARN: update pull failed; continuing with the existing copy."
elif [ -f "$INSTALL_DIR/package.json" ]; then
    echo "App files already present (no git) - continuing with this copy."
else
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR" || fail "Download failed. Check your network connection."
fi
cd "$INSTALL_DIR" || fail "Could not enter $INSTALL_DIR"

echo "=== 4/7 Installing dependencies (longest step) ==="
# ensure-deps enforces the Node engine and prefers `npm ci` off the lockfile;
# fall back to a plain install only if it cannot complete.
node scripts/ensure-deps.mjs --force \
    || npm install --no-fund --no-audit \
    || fail "npm install failed - the log above shows the exact error."

echo "=== 5/7 Optional local AI engines (ComfyUI / Ollama) ==="
echo "Nothing large is downloaded unless you say yes; no AI models by default."
if [ "$AUTO" = "1" ]; then
    echo "[auto] skipping interactive AI installer"
else
    npm run install:super || echo "WARN: optional AI setup exited early - re-run later with: npm run install:super"
fi

echo "=== 5b/7 Verifying the installation ==="
npm run qa:install || echo "WARN: verification flagged missing components - if you skipped the optional ComfyUI install, that is expected."

echo "=== 6/7 Optional extras ==="
echo "Optional theme packs (animated dragons, aliens, border collies...) support"
echo "development: https://geekatplay.gumroad.com/"

echo "=== 7/7 Finishing up ==="
echo "Setup complete. Full log: $LOGFILE"
LAUNCH="$(ask "Launch Image Express now? [Y/n]" "n")"
if [ "$LAUNCH" != "n" ] && [ "$LAUNCH" != "N" ]; then
    open "$INSTALL_DIR/start.command" || bash "$INSTALL_DIR/start.command"
fi
echo "Woof! All done."
