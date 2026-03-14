# === Antigravity Deck -- Uninstall (Windows PowerShell) ===
# Usage: irm https://raw.githubusercontent.com/tysonnbt/Antigravity-Deck/main/scripts/uninstall.ps1 | iex

$ErrorActionPreference = "SilentlyContinue"
$INSTALL_DIR = Join-Path $env:LOCALAPPDATA "AntigravityDeck"

Write-Host ""
Write-Host "  Antigravity Deck -- Uninstall" -ForegroundColor Cyan
Write-Host "  ==============================" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Install location: $INSTALL_DIR" -ForegroundColor DarkGray
Write-Host ""

if (-not (Test-Path $INSTALL_DIR)) {
    Write-Host "  [i] Nothing to uninstall — directory not found." -ForegroundColor Yellow
    Write-Host ""
    exit 0
}

# --- Kill processes with open handles inside the install dir ---
Write-Host "  [i] Checking for running processes..." -ForegroundColor Cyan

$killed = @()

# Method 1: Find node/antigravity processes whose command line references the install dir
$procs = Get-WmiObject Win32_Process -Filter "Name = 'node.exe'" 2>$null
foreach ($proc in $procs) {
    try {
        $cmdLine = $proc.CommandLine
        if ($cmdLine -and $cmdLine -like "*$INSTALL_DIR*") {
            Stop-Process -Id $proc.ProcessId -Force 2>$null
            $killed += $proc.ProcessId
            Write-Host "  [OK] Killed node.exe (PID $($proc.ProcessId))" -ForegroundColor Green
        }
    } catch { }
}

# Method 2: Also catch any child processes started from that dir
# (e.g. next-server, cloudflared spawned by start-tunnel.js)
$allProcs = @("node.exe", "next-server.exe", "cloudflared.exe")
foreach ($procName in $allProcs) {
    $procs2 = Get-WmiObject Win32_Process -Filter "Name = '$procName'" 2>$null
    foreach ($proc in $procs2) {
        try {
            $cmdLine = $proc.CommandLine
            if ($cmdLine -and $cmdLine -like "*AntigravityDeck*") {
                if ($killed -notcontains $proc.ProcessId) {
                    Stop-Process -Id $proc.ProcessId -Force 2>$null
                    $killed += $proc.ProcessId
                    Write-Host "  [OK] Killed $procName (PID $($proc.ProcessId))" -ForegroundColor Green
                }
            }
        } catch { }
    }
}

# Method 3: Use handle64/handle.exe (Sysinternals) if available — most thorough
$handleTool = $null
foreach ($path in @("handle64.exe", "handle.exe", "$env:SystemRoot\System32\handle64.exe")) {
    if (Get-Command $path -ErrorAction SilentlyContinue) {
        $handleTool = $path
        break
    }
}

if ($handleTool) {
    Write-Host "  [i] Scanning open file handles (Sysinternals)..." -ForegroundColor DarkGray
    $output = & $handleTool $INSTALL_DIR -accepteula 2>$null
    $handlePids = $output | Select-String "pid: (\d+)" | ForEach-Object {
        $_.Matches[0].Groups[1].Value
    } | Sort-Object -Unique
    foreach ($procPid in $handlePids) {
        try {
            Stop-Process -Id ([int]$procPid) -Force 2>$null
            Write-Host "  [OK] Killed PID $procPid (via handle scan)" -ForegroundColor Green
        } catch { }
    }
}

if ($killed.Count -gt 0) {
    Write-Host "  [i] Waiting for processes to exit..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 2
} else {
    Write-Host "  [OK] No running processes found" -ForegroundColor Green
}

Write-Host ""

# --- Delete the install directory ---
Write-Host "  [i] Removing $INSTALL_DIR ..." -ForegroundColor Cyan

try {
    Remove-Item -Recurse -Force $INSTALL_DIR -ErrorAction Stop
    Write-Host "  [OK] Antigravity Deck has been removed." -ForegroundColor Green
} catch {
    Write-Host "  [!] Standard removal failed. Trying robocopy trick..." -ForegroundColor Yellow

    # Robocopy trick: sync an empty dir over the install dir, then remove
    $emptyDir = Join-Path $env:TEMP "ag_empty_$([System.Guid]::NewGuid().ToString('N'))"
    New-Item -ItemType Directory -Path $emptyDir | Out-Null
    robocopy $emptyDir $INSTALL_DIR /MIR /NFL /NDL /NJH /NJS /NC /NS /NP 2>$null | Out-Null
    Remove-Item -Recurse -Force $emptyDir 2>$null
    Remove-Item -Recurse -Force $INSTALL_DIR 2>$null

    if (Test-Path $INSTALL_DIR) {
        Write-Host "  [!] Could not fully remove. Some files may still be locked." -ForegroundColor Red
        Write-Host "      Try closing all terminals, IDE windows, and rerun this script." -ForegroundColor Yellow
    } else {
        Write-Host "  [OK] Antigravity Deck has been removed." -ForegroundColor Green
    }
}

Write-Host ""
