#!/usr/bin/env bash
# === Antigravity Deck — Uninstall (macOS / Linux) ===
# Usage: curl -sL https://raw.githubusercontent.com/tysonnbt/Antigravity-Deck/main/scripts/uninstall.sh | bash

INSTALL_DIR="$HOME/.antigravity-deck"

echo ""
echo "  🗑️  Antigravity Deck — Uninstall"
echo "  ================================="
echo ""
echo "  Install location: $INSTALL_DIR"
echo ""

if [ ! -d "$INSTALL_DIR" ]; then
    echo "  ℹ️  Nothing to uninstall — directory not found."
    echo ""
    exit 0
fi

# --- Kill processes with open handles inside the install dir ---
echo "  🔍 Checking for running processes..."

killed=0

# Find node processes whose command line references the install dir
if command -v pgrep &>/dev/null; then
    # pgrep -f matches full command line
    pids=$(pgrep -f "$INSTALL_DIR" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        for pid in $pids; do
            proc_name=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")
            kill -9 "$pid" 2>/dev/null && {
                echo "  ✅ Killed $proc_name (PID $pid)"
                killed=$((killed + 1))
            }
        done
    fi
fi

# macOS: use lsof to find any process with open files inside the dir
if command -v lsof &>/dev/null; then
    lsof_pids=$(lsof +D "$INSTALL_DIR" 2>/dev/null | awk 'NR>1 {print $2}' | sort -u || true)
    if [ -n "$lsof_pids" ]; then
        for pid in $lsof_pids; do
            proc_name=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")
            kill -9 "$pid" 2>/dev/null && {
                echo "  ✅ Killed $proc_name (PID $pid) [lsof]"
                killed=$((killed + 1))
            }
        done
    fi
fi

# Linux: use fuser to find processes with files open in the dir
if command -v fuser &>/dev/null; then
    fuser_pids=$(fuser -m "$INSTALL_DIR" 2>/dev/null || true)
    if [ -n "$fuser_pids" ]; then
        for pid in $fuser_pids; do
            proc_name=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")
            kill -9 "$pid" 2>/dev/null && {
                echo "  ✅ Killed $proc_name (PID $pid) [fuser]"
                killed=$((killed + 1))
            }
        done
    fi
fi

if [ "$killed" -eq 0 ]; then
    echo "  ✅ No running processes found"
else
    echo "  ⏳ Waiting for processes to exit..."
    sleep 2
fi

echo ""

# --- Delete the install directory ---
echo "  🗑️  Removing $INSTALL_DIR ..."

if rm -rf "$INSTALL_DIR" 2>/dev/null; then
    echo "  ✅ Antigravity Deck has been removed."
else
    # Try sudo if regular rm failed (unlikely on home dir, but just in case)
    echo "  ⚠️  Standard removal failed — retrying with elevated permissions..."
    sudo rm -rf "$INSTALL_DIR" 2>/dev/null && \
        echo "  ✅ Antigravity Deck has been removed." || \
        echo "  ❌ Could not remove directory. Please close all related processes and try again."
fi

echo ""
