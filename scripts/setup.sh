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

# cloudflared (optional — only needed for npm run online)
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
    echo "  ⚠️  cloudflared not found (optional — needed for remote access)"
fi

if [ ${#missing[@]} -gt 0 ]; then
    echo ""
    echo "  Missing prerequisites:"
    for m in "${missing[@]}"; do
        case "$m" in
            "Node.js 18+") echo "    → Install Node.js: https://nodejs.org/" ;;
            "Git")         echo "    → Install Git: https://git-scm.com/" ;;
        esac
    done
    echo ""
    echo "  Install the missing tools and run this script again."
    echo ""
    exit 1
fi

echo ""

# === Detect scenario ===
scenario="fresh"       # fresh | up-to-date | updated
updated_files=""

if [ -d "$DIR/.git" ]; then
    cd "$DIR"

    # Save current commit hash before pull
    hash_before=$(git rev-parse HEAD 2>/dev/null || echo "")

    echo "  📂 Found existing install — checking for updates..."

    if git fetch origin main --quiet 2>/dev/null; then
        local_hash=$(git rev-parse HEAD 2>/dev/null)
        remote_hash=$(git rev-parse "origin/main" 2>/dev/null)

        if [ "$local_hash" = "$remote_hash" ]; then
            scenario="up-to-date"
            echo "  ✅ Already up to date (${local_hash:0:7})"
        else
            # Count commits behind
            behind=$(git rev-list --count "HEAD..origin/main" 2>/dev/null || echo "?")
            echo "  📥 $behind new commit(s) available — pulling..."

            git pull --ff-only 2>/dev/null

            hash_after=$(git rev-parse HEAD 2>/dev/null)

            # List changed files between old and new
            updated_files=$(git diff --name-only "$hash_before" "$hash_after" 2>/dev/null || echo "")
            scenario="updated"

            echo "  ✅ Updated to ${hash_after:0:7}"
        fi
    else
        echo "  ⚠️  Could not fetch updates (offline?) — continuing with current version"
        scenario="up-to-date"
    fi
else
    echo "  📥 First time setup — cloning repository..."
    git clone "$REPO" "$DIR"
    cd "$DIR"
    echo "  ✅ Cloned successfully"
fi

# === Smart dependency install ===
need_backend_deps=false
need_frontend_deps=false

case "$scenario" in
    "fresh")
        need_backend_deps=true
        need_frontend_deps=true
        ;;
    "updated")
        # Only reinstall if package files changed
        if echo "$updated_files" | grep -qE "^package\.json$|^package-lock\.json$"; then
            need_backend_deps=true
        fi
        if echo "$updated_files" | grep -qE "^frontend/package\.json$|^frontend/package-lock\.json$"; then
            need_frontend_deps=true
        fi

        # Show what changed
        echo ""
        echo "  📋 Changes in this update:"

        be_count=$(echo "$updated_files" | grep -cvE "^frontend/|^scripts/|^docs/|^electron/|^$" || true)
        fe_count=$(echo "$updated_files" | grep -c "^frontend/" || true)
        el_count=$(echo "$updated_files" | grep -c "^electron/" || true)
        sc_count=$(echo "$updated_files" | grep -c "^scripts/" || true)
        doc_count=$(echo "$updated_files" | grep -c "^docs/" || true)

        [ "$be_count" -gt 0 ] 2>/dev/null && echo "    Backend: $be_count file(s)"
        [ "$fe_count" -gt 0 ] 2>/dev/null && echo "    Frontend: $fe_count file(s)"
        [ "$el_count" -gt 0 ] 2>/dev/null && echo "    Electron: $el_count file(s)"
        [ "$sc_count" -gt 0 ] 2>/dev/null && echo "    Scripts: $sc_count file(s)"
        [ "$doc_count" -gt 0 ] 2>/dev/null && echo "    Docs: $doc_count file(s)"
        ;;
    "up-to-date")
        # Check if node_modules exist (maybe user deleted them)
        if [ ! -d "node_modules" ]; then
            need_backend_deps=true
        fi
        if [ ! -d "frontend/node_modules" ]; then
            need_frontend_deps=true
        fi
        ;;
esac

echo ""

if $need_backend_deps; then
    echo "  📦 Installing backend dependencies..."
    npm install
else
    echo "  ✅ Backend dependencies — no changes"
fi

if $need_frontend_deps; then
    echo ""
    echo "  📦 Installing frontend dependencies..."
    npm install --prefix frontend
else
    echo "  ✅ Frontend dependencies — no changes"
fi

# --- Create settings.json if missing ---
if [ ! -f "settings.json" ]; then
    cp settings.sample.json settings.json
    echo "  📝 Created settings.json from sample"
fi

# === Summary ===
echo ""
echo "  ─────────────────────────────────────"
case "$scenario" in
    "fresh")      echo "  🎉 Fresh install complete!" ;;
    "updated")    echo "  🔄 Updated and ready!" ;;
    "up-to-date") echo "  ⚡ Already up to date!" ;;
esac
echo "  ─────────────────────────────────────"
echo ""

# === Launch ===
if ! $cf_found; then
    echo "  Starting Antigravity Deck locally..."
    echo "  Open http://localhost:3000 in your browser"
    if [[ "$(uname)" == "Darwin" ]]; then
        echo "  (Install cloudflared for remote access: brew install cloudflared)"
    else
        echo "  (Install cloudflared for remote access: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)"
    fi
    echo ""
    npm run dev
    exit 0
fi

# --- Online mode: run silently, show only the clean result ---

# Kill any existing processes on online ports (prevents key mismatch with stale sessions)
echo ""
for port in 9807 9808; do
    pids=""
    # Try lsof first (macOS + most Linux), fall back to fuser (some Linux)
    if command -v lsof &>/dev/null; then
        pids=$(lsof -ti ":$port" 2>/dev/null)
    elif command -v fuser &>/dev/null; then
        pids=$(fuser "$port/tcp" 2>/dev/null | tr -s ' ')
    fi
    if [ -n "$pids" ]; then
        for p in $pids; do
            echo "  [!] Killing stale process on port $port (PID $p)"
            kill -9 "$p" 2>/dev/null
        done
        sleep 1
    fi
done

# Remove old tunnel info so we can detect the new one
rm -f .tunnel-info.txt

# Start node start-tunnel.js in background — all output goes to log file
node start-tunnel.js > .tunnel-setup.log 2>&1 &
NODE_PID=$!

echo ""
echo "  Setting up Cloudflare tunnels..."
echo ""

# Spinner while waiting for .tunnel-info.txt
timeout_secs=180
elapsed=0
while [ ! -f ".tunnel-info.txt" ] && kill -0 $NODE_PID 2>/dev/null && [ $elapsed -lt $timeout_secs ]; do
    dots=$(( (elapsed / 2) % 5 + 1 ))
    printf "\r  Starting%-5s" "$(printf '.%.0s' $(seq 1 $dots))"
    sleep 2
    elapsed=$((elapsed + 2))
done

echo ""

# Check if process died
if ! kill -0 $NODE_PID 2>/dev/null; then
    echo ""
    echo "  [X] Failed to start. Check .tunnel-setup.log for details"
    echo ""
    exit 1
fi

# Check timeout
if [ ! -f ".tunnel-info.txt" ]; then
    echo ""
    echo "  [X] Timed out waiting for tunnel. Check .tunnel-setup.log"
    echo ""
    kill $NODE_PID 2>/dev/null
    exit 1
fi

# === Read tunnel info and display cleanly ===
fe_url=$(grep "^Frontend:" .tunnel-info.txt | sed 's/^Frontend: *//')
be_url=$(grep "^Backend:" .tunnel-info.txt | sed 's/^Backend: *//')
auth_key=$(grep "^Auth Key:" .tunnel-info.txt | sed 's/^Auth Key: *//')
qr_url=$(grep "^QR URL:" .tunnel-info.txt | sed 's/^QR URL: *//')
local_fe=$(grep "^Local FE:" .tunnel-info.txt | sed 's/^Local FE: *//')

clear
echo ""
echo "  ============================================================"
echo "  🌐 READY! Open this URL on any device:"
echo "  👉 $fe_url"
echo "  🔑 Key: $auth_key"
echo "  ============================================================"
echo "  Backend API: $be_url"
echo "  Local:       $local_fe"
echo "  ============================================================"
echo ""

# Generate QR code using qrcode-terminal (already installed as dependency)
if [ -n "$qr_url" ] && [ "$qr_url" != "N/A" ]; then
    echo "  📱 Scan this QR code to open (auto-login):"
    echo ""
    node -e "require('qrcode-terminal').generate('$qr_url',{small:true},q=>console.log(q.split('\n').map(l=>'    '+l).join('\n')))" 2>/dev/null || true
    echo ""
    echo "  🔗 $qr_url"
fi

echo ""
echo "  Press Ctrl+C to stop"
echo ""

# Cleanup function — kills node process group + any remaining port listeners
cleanup() {
    echo ""
    echo "  Shutting down..."

    # Kill the entire process group (node + all children: backend, frontend, cloudflared)
    kill -- -$NODE_PID 2>/dev/null || kill $NODE_PID 2>/dev/null

    # Kill anything still on the online ports
    for port in 9807 9808; do
        if command -v lsof &>/dev/null; then
            lsof -ti ":$port" 2>/dev/null | xargs kill -9 2>/dev/null
        elif command -v fuser &>/dev/null; then
            fuser -k "$port/tcp" 2>/dev/null
        fi
    done

    # Kill orphaned cloudflared processes
    pkill -f "cloudflared.*tunnel.*localhost" 2>/dev/null

    echo "  All processes stopped."
    echo ""
    exit 0
}

# Register cleanup for Ctrl+C, terminal close, etc.
trap cleanup INT TERM HUP EXIT

# Keep script alive — wait for node process
wait $NODE_PID
