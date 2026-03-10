#!/usr/bin/env bash
# === Antigravity Deck — One-Command Setup (macOS / Linux) ===
# Usage: curl -sL https://raw.githubusercontent.com/tysonnbt/Antigravity-Deck/main/scripts/setup.sh | bash

set -e

REPO="https://github.com/tysonnbt/Antigravity-Deck.git"
DIR="Antigravity-Deck"

echo ""
echo "  🔮 Antigravity Deck — One-Command Setup"
echo "  ========================================"
echo ""

# --- Check prerequisites ---
missing=()

# Node.js
if command -v node &>/dev/null; then
    node_ver=$(node --version)
    major=$(echo "$node_ver" | sed 's/^v\([0-9]*\).*/\1/')
    if [ "$major" -lt 18 ]; then
        echo "  ⚠️  Node.js $node_ver found, but v18+ required"
        missing+=("Node.js 18+")
    else
        echo "  ✅ Node.js $node_ver"
    fi
else
    echo "  ❌ Node.js not found"
    missing+=("Node.js 18+")
fi

# Git
if command -v git &>/dev/null; then
    echo "  ✅ $(git --version)"
else
    echo "  ❌ Git not found"
    missing+=("Git")
fi

# cloudflared
cf_found=false
if command -v cloudflared &>/dev/null; then
    cf_found=true
elif [ -f /opt/homebrew/bin/cloudflared ]; then
    cf_found=true
elif [ -f /usr/local/bin/cloudflared ]; then
    cf_found=true
fi

if $cf_found; then
    echo "  ✅ cloudflared"
else
    echo "  ❌ cloudflared not found"
    missing+=("cloudflared")
fi

if [ ${#missing[@]} -gt 0 ]; then
    echo ""
    echo "  Missing prerequisites:"
    for m in "${missing[@]}"; do
        case "$m" in
            "Node.js 18+") echo "    → Install Node.js: https://nodejs.org/" ;;
            "Git")         echo "    → Install Git: https://git-scm.com/" ;;
            "cloudflared")
                if [[ "$(uname)" == "Darwin" ]]; then
                    echo "    → Install: brew install cloudflared"
                else
                    echo "    → Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
                fi
                ;;
        esac
    done
    echo ""
    echo "  Install the missing tools and run this script again."
    echo ""
    exit 1
fi

echo ""

# --- Clone or pull ---
if [ -d "$DIR/.git" ]; then
    echo "  📂 Found existing $DIR — pulling latest..."
    cd "$DIR"
    git pull --ff-only
else
    echo "  📥 Cloning $REPO..."
    git clone "$REPO" "$DIR"
    cd "$DIR"
fi

# --- Install dependencies ---
echo ""
echo "  📦 Installing backend dependencies..."
npm install

echo ""
echo "  📦 Installing frontend dependencies..."
npm install --prefix frontend

# --- Create settings.json if missing ---
if [ ! -f "settings.json" ]; then
    cp settings.sample.json settings.json
    echo "  📝 Created settings.json from sample"
fi

# --- Start online ---
echo ""
echo "  🚀 Starting Antigravity Deck online..."
echo "  (Cloudflare Tunnel + auto-generated auth key + QR code)"
echo ""

npm run online
