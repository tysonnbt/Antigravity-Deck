# === Antigravity Deck — One-Command Setup (Windows PowerShell) ===
# Usage: irm https://raw.githubusercontent.com/tysonnbt/Antigravity-Deck/main/scripts/setup.ps1 | iex

$ErrorActionPreference = "Stop"
$REPO = "https://github.com/tysonnbt/Antigravity-Deck.git"
$DIR  = "Antigravity-Deck"

Write-Host ""
Write-Host "  🔮 Antigravity Deck — One-Command Setup" -ForegroundColor Cyan
Write-Host "  ========================================" -ForegroundColor DarkGray
Write-Host ""

# --- Check prerequisites ---
$missing = @()

# Node.js
try {
    $nodeVer = (node --version 2>$null)
    $major = [int]($nodeVer -replace '^v(\d+).*', '$1')
    if ($major -lt 18) {
        Write-Host "  ⚠️  Node.js $nodeVer found, but v18+ required" -ForegroundColor Yellow
        $missing += "Node.js 18+"
    } else {
        Write-Host "  ✅ Node.js $nodeVer" -ForegroundColor Green
    }
} catch {
    Write-Host "  ❌ Node.js not found" -ForegroundColor Red
    $missing += "Node.js 18+"
}

# Git
try {
    $gitVer = (git --version 2>$null)
    Write-Host "  ✅ $gitVer" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Git not found" -ForegroundColor Red
    $missing += "Git"
}

# cloudflared
$cfFound = $false
try {
    cloudflared --version 2>$null | Out-Null
    $cfFound = $true
} catch {}
if (-not $cfFound) {
    # Check common install paths
    $cfPaths = @(
        "C:\Program Files (x86)\cloudflared\cloudflared.exe",
        "C:\Program Files\cloudflared\cloudflared.exe"
    )
    foreach ($p in $cfPaths) {
        if (Test-Path $p) { $cfFound = $true; break }
    }
}
if ($cfFound) {
    Write-Host "  ✅ cloudflared" -ForegroundColor Green
} else {
    Write-Host "  ❌ cloudflared not found" -ForegroundColor Red
    $missing += "cloudflared"
}

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "  Missing prerequisites:" -ForegroundColor Red
    foreach ($m in $missing) {
        switch ($m) {
            "Node.js 18+" { Write-Host "    → Install Node.js: https://nodejs.org/" -ForegroundColor Yellow }
            "Git"         { Write-Host "    → Install Git: https://git-scm.com/" -ForegroundColor Yellow }
            "cloudflared" { Write-Host "    → Install: winget install cloudflare.cloudflared" -ForegroundColor Yellow }
        }
    }
    Write-Host ""
    Write-Host "  Install the missing tools and run this script again." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host ""

# --- Clone or pull ---
if (Test-Path "$DIR\.git") {
    Write-Host "  📂 Found existing $DIR — pulling latest..." -ForegroundColor Cyan
    Push-Location $DIR
    git pull --ff-only
    Pop-Location
} else {
    Write-Host "  📥 Cloning $REPO..." -ForegroundColor Cyan
    git clone $REPO $DIR
}

Push-Location $DIR

# --- Install dependencies ---
Write-Host ""
Write-Host "  📦 Installing backend dependencies..." -ForegroundColor Cyan
npm install

Write-Host ""
Write-Host "  📦 Installing frontend dependencies..." -ForegroundColor Cyan
npm install --prefix frontend

# --- Create settings.json if missing ---
if (-not (Test-Path "settings.json")) {
    Copy-Item "settings.sample.json" "settings.json"
    Write-Host "  📝 Created settings.json from sample" -ForegroundColor Green
}

# --- Start online ---
Write-Host ""
Write-Host "  🚀 Starting Antigravity Deck online..." -ForegroundColor Green
Write-Host "  (Cloudflare Tunnel + auto-generated auth key + QR code)" -ForegroundColor DarkGray
Write-Host ""

npm run online
