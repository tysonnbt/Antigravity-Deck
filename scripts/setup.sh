#!/usr/bin/env bash
# === Antigravity Deck — One-Command Setup (macOS / Linux) ===
# Usage: curl -sL https://raw.githubusercontent.com/tysonnbt/Antigravity-Deck/main/scripts/setup.sh | bash

set -e

REPO="https://github.com/tysonnbt/Antigravity-Deck.git"
REPO_API="https://api.github.com/repos/tysonnbt/Antigravity-Deck"
INSTALL_DIR="$HOME/.antigravity-deck"

# --- Resolve latest release tag ---
get_latest_tag() {
    # Try GitHub API (no auth needed for public repos)
    local tag
    tag=$(curl -sL "$REPO_API/releases/latest" 2>/dev/null \
        | grep '"tag_name"' | head -1 \
        | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')
    if [ -n "$tag" ] && [ "$tag" != "" ]; then echo "$tag"; return; fi
    # Fallback: git ls-remote tags (sorted by version descending)
    tag=$(git ls-remote --tags --sort=-v:refname "$REPO" 'v*' 2>/dev/null \
        | head -1 | sed 's/.*refs\/tags\///' | sed 's/\^{}//')
    if [ -n "$tag" ]; then echo "$tag"; return; fi
    # Ultimate fallback: main branch
    echo "main"
}

echo ""
echo "  🔮 Antigravity Deck — One-Command Setup"
echo "  ========================================"
echo ""
echo "  Install location: $INSTALL_DIR"
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

TARGET_TAG=$(get_latest_tag)

if [ -d "$INSTALL_DIR/.git" ]; then
    cd "$INSTALL_DIR"

    # Save current commit hash before update
    hash_before=$(git rev-parse HEAD 2>/dev/null || echo "")
    current_tag=$(git describe --tags --exact-match HEAD 2>/dev/null || echo "")

    echo "  📂 Found existing install — checking for updates..."

    if git fetch origin --tags --quiet 2>/dev/null; then
        # Re-resolve after fetch in case new tags appeared
        TARGET_TAG=$(get_latest_tag)

        if [ "$current_tag" = "$TARGET_TAG" ]; then
            scenario="up-to-date"
            echo "  ✅ Already on latest release ($TARGET_TAG)"
        else
            if [ -n "$current_tag" ]; then
                echo "  📥 New release available: $current_tag → $TARGET_TAG"
            else
                echo "  📥 Switching to release $TARGET_TAG..."
            fi

            git -c advice.detachedHead=false checkout "$TARGET_TAG" --quiet 2>/dev/null

            hash_after=$(git rev-parse HEAD 2>/dev/null)

            # List changed files between old and new
            updated_files=$(git diff --name-only "$hash_before" "$hash_after" 2>/dev/null || echo "")
            scenario="updated"

            echo "  ✅ Updated to $TARGET_TAG"
        fi
    else
        echo "  ⚠️  Could not fetch updates (offline?) — continuing with current version"
        scenario="up-to-date"
    fi
else
    echo "  📥 First time setup — cloning repository..."
    mkdir -p "$INSTALL_DIR"
    git clone "$REPO" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    git -c advice.detachedHead=false checkout "$TARGET_TAG" --quiet 2>/dev/null
    echo "  ✅ Installed $TARGET_TAG"
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
        if [ ! -d "$INSTALL_DIR/node_modules" ]; then
            need_backend_deps=true
        fi
        if [ ! -d "$INSTALL_DIR/frontend/node_modules" ]; then
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


# === Launch ===
echo ""
echo "  Starting Antigravity Deck..."
echo ""

if $cf_found; then
    node start-tunnel.js --quiet --build
else
    node start-tunnel.js --local --build
fi
