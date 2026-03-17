# === Antigravity Deck -- One-Command Setup (Windows PowerShell) ===
# Usage: irm https://raw.githubusercontent.com/tysonnbt/Antigravity-Deck/main/scripts/setup.ps1 | iex

$ErrorActionPreference = "Stop"
$REPO        = "https://github.com/tysonnbt/Antigravity-Deck.git"
$REPO_API    = "https://api.github.com/repos/tysonnbt/Antigravity-Deck"
$INSTALL_DIR = Join-Path $env:LOCALAPPDATA "AntigravityDeck"

# --- Resolve latest release tag ---
function Get-LatestTag {
    # Try GitHub API (no auth needed for public repos)
    try {
        $release = Invoke-RestMethod -Uri "$REPO_API/releases/latest" -TimeoutSec 10 2>$null
        if ($release.tag_name) { return $release.tag_name }
    } catch { }
    # Fallback: git ls-remote tags
    try {
        $tags = (git ls-remote --tags --sort=-v:refname $REPO 'v*' 2>$null)
        if ($tags) {
            $first = ($tags -split "`n")[0]
            $tag = ($first -replace '.*refs/tags/', '' -replace '\^{}', '').Trim()
            if ($tag) { return $tag }
        }
    } catch { }
    # Ultimate fallback
    return "main"
}

Write-Host ""
Write-Host "  Antigravity Deck -- One-Command Setup" -ForegroundColor Cyan
Write-Host "  ======================================" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Install location: $INSTALL_DIR" -ForegroundColor DarkGray
Write-Host ""

# --- Check prerequisites ---
$missing = @()

# Node.js
try {
    $nodeVer = (node --version 2>$null)
    $major = [int]($nodeVer -replace '^v(\d+).*', '$1')
    if ($major -lt 18) {
        Write-Host "  [!] Node.js $nodeVer found, but v18+ required" -ForegroundColor Yellow
        $missing += "Node.js 18+"
    }
    else {
        Write-Host "  [OK] Node.js $nodeVer" -ForegroundColor Green
    }
}
catch {
    Write-Host "  [X] Node.js not found" -ForegroundColor Red
    $missing += "Node.js 18+"
}

# Git
try {
    $gitVer = (git --version 2>$null)
    Write-Host "  [OK] $gitVer" -ForegroundColor Green
}
catch {
    Write-Host "  [X] Git not found" -ForegroundColor Red
    $missing += "Git"
}

# cloudflared (optional -- only needed for npm run online)
$cfFound = $false
try {
    cloudflared --version 2>$null | Out-Null
    $cfFound = $true
}
catch { }

if (-not $cfFound) {
    $cfPaths = @(
        "C:\Program Files (x86)\cloudflared\cloudflared.exe",
        "C:\Program Files\cloudflared\cloudflared.exe"
    )
    foreach ($p in $cfPaths) {
        if (Test-Path $p) {
            $cfFound = $true
            break
        }
    }
}

if ($cfFound) {
    Write-Host "  [OK] cloudflared" -ForegroundColor Green
}
else {
    Write-Host "  [!] cloudflared not found (optional, needed for remote access)" -ForegroundColor Yellow
}

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "  Missing prerequisites:" -ForegroundColor Red
    foreach ($m in $missing) {
        switch ($m) {
            "Node.js 18+" {
                Write-Host "    -> Install Node.js: https://nodejs.org/" -ForegroundColor Yellow
            }
            "Git" {
                Write-Host "    -> Install Git: https://git-scm.com/" -ForegroundColor Yellow
            }
        }
    }
    Write-Host ""
    Write-Host "  Install the missing tools and run this script again." -ForegroundColor Yellow
    Write-Host ""
    return
}

Write-Host ""

# === Detect scenario ===
$scenario = "fresh"       # fresh | up-to-date | updated
$updatedFiles = @()
$targetTag = Get-LatestTag

if (Test-Path "$INSTALL_DIR\.git") {
    Push-Location $INSTALL_DIR

    # Save current commit hash before update
    $hashBefore = (git rev-parse HEAD 2>$null)
    $currentTag = (git describe --tags --exact-match HEAD 2>$null)

    Write-Host "  [i] Found existing install -- checking for updates..." -ForegroundColor Cyan
    try {
        git fetch origin --tags --quiet 2>$null

        # Re-resolve after fetch in case new tags appeared
        $targetTag = Get-LatestTag

        if ($currentTag -eq $targetTag) {
            $scenario = "up-to-date"
            Write-Host "  [OK] Already on latest release ($targetTag)" -ForegroundColor Green
        }
        else {
            if ($currentTag) {
                Write-Host "  [i] New release available: $currentTag -> $targetTag" -ForegroundColor Yellow
            } else {
                Write-Host "  [i] Switching to release $targetTag..." -ForegroundColor Yellow
            }

            $ErrorActionPreference = "Continue"
            git -c advice.detachedHead=false checkout $targetTag --quiet 2>$null
            $ErrorActionPreference = "Stop"

            $hashAfter = (git rev-parse HEAD 2>$null)

            # List changed files between old and new
            try {
                $updatedFiles = @(git diff --name-only $hashBefore $hashAfter 2>$null)
            } catch {
                $updatedFiles = @()
            }
            $scenario = "updated"

            Write-Host "  [OK] Updated to $targetTag" -ForegroundColor Green
        }
    }
    catch {
        Write-Host "  [!] Could not fetch updates (offline?) -- continuing with current version" -ForegroundColor Yellow
        $scenario = "up-to-date"
    }

    Pop-Location
}
else {
    Write-Host "  [i] First time setup -- cloning repository..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path $INSTALL_DIR | Out-Null
    git clone $REPO $INSTALL_DIR
    Push-Location $INSTALL_DIR
    git -c advice.detachedHead=false checkout $targetTag --quiet 2>$null
    Pop-Location
    Write-Host "  [OK] Installed $targetTag" -ForegroundColor Green
}

Push-Location $INSTALL_DIR

# === Smart dependency install ===
$needBackendDeps  = $false
$needFrontendDeps = $false

switch ($scenario) {
    "fresh" {
        # Fresh install -- always install everything
        $needBackendDeps  = $true
        $needFrontendDeps = $true
    }
    "updated" {
        # Only reinstall if package files changed
        if ($updatedFiles -contains "package.json" -or $updatedFiles -contains "package-lock.json") {
            $needBackendDeps = $true
        }
        $frontendPkgChanged = $updatedFiles | Where-Object {
            $_ -like "frontend/package.json" -or $_ -like "frontend/package-lock.json"
        }
        if ($frontendPkgChanged) {
            $needFrontendDeps = $true
        }

        # Show what changed
        Write-Host ""
        Write-Host "  Changes in this update:" -ForegroundColor Cyan

        $beFiles  = @($updatedFiles | Where-Object { $_ -notlike "frontend/*" -and $_ -notlike "scripts/*" -and $_ -notlike "docs/*" -and $_ -notlike "electron/*" })
        $feFiles  = @($updatedFiles | Where-Object { $_ -like "frontend/*" })
        $elFiles  = @($updatedFiles | Where-Object { $_ -like "electron/*" })
        $scFiles  = @($updatedFiles | Where-Object { $_ -like "scripts/*" })
        $docFiles = @($updatedFiles | Where-Object { $_ -like "docs/*" })

        if ($beFiles.Count -gt 0)  { Write-Host "    Backend:  $($beFiles.Count) file(s)" -ForegroundColor DarkGray }
        if ($feFiles.Count -gt 0)  { Write-Host "    Frontend: $($feFiles.Count) file(s)" -ForegroundColor DarkGray }
        if ($elFiles.Count -gt 0)  { Write-Host "    Electron: $($elFiles.Count) file(s)" -ForegroundColor DarkGray }
        if ($scFiles.Count -gt 0)  { Write-Host "    Scripts:  $($scFiles.Count) file(s)" -ForegroundColor DarkGray }
        if ($docFiles.Count -gt 0) { Write-Host "    Docs:     $($docFiles.Count) file(s)" -ForegroundColor DarkGray }
    }
    "up-to-date" {
        # Check if node_modules exist (maybe user deleted them)
        if (-not (Test-Path "node_modules")) {
            $needBackendDeps = $true
        }
        if (-not (Test-Path "frontend/node_modules")) {
            $needFrontendDeps = $true
        }
    }
}

Write-Host ""

if ($needBackendDeps) {
    Write-Host "  [i] Installing backend dependencies..." -ForegroundColor Cyan
    npm install
}
else {
    Write-Host "  [OK] Backend dependencies -- no changes" -ForegroundColor Green
}

if ($needFrontendDeps) {
    Write-Host ""
    Write-Host "  [i] Installing frontend dependencies..." -ForegroundColor Cyan
    npm install --prefix frontend
}
else {
    Write-Host "  [OK] Frontend dependencies -- no changes" -ForegroundColor Green
}

# --- Create settings.json if missing ---
if (-not (Test-Path "settings.json")) {
    Copy-Item "settings.sample.json" "settings.json"
    Write-Host "  [OK] Created settings.json from sample" -ForegroundColor Green
}

# === Launch ===
Write-Host ""
Write-Host "  Starting Antigravity Deck..." -ForegroundColor Green
Write-Host ""

if ($cfFound) {
    node start-tunnel.js --quiet --build
} else {
    node start-tunnel.js --local --build
}
