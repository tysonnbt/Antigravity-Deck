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
    Write-Host "  [i] Nothing to uninstall -- directory not found." -ForegroundColor Yellow
    Write-Host ""
    return
}

# --- Kill processes with open handles inside the install dir ---
Write-Host "  [i] Checking for running processes..." -ForegroundColor Cyan

$killed = @()

# Method 1: Find node processes whose command line references the install dir
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

# Method 2: Kill child processes (next-server, cloudflared) referencing install dir
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

# Method 3: Sysinternals handle.exe if available
$handleTool = $null
foreach ($path in @("handle64.exe", "handle.exe")) {
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

# --- Make sure this shell is not CWD inside the install dir ---
if ((Get-Location).Path -like "$INSTALL_DIR*") {
    Set-Location $env:TEMP
}

# --- Delete the install directory ---
Write-Host "  [i] Removing $INSTALL_DIR ..." -ForegroundColor Cyan

# Attempt 1: cmd /c rd -- bypasses PowerShell file locks
$rdArgs = '/c rd /s /q "' + $INSTALL_DIR + '"'
Start-Process "cmd.exe" -ArgumentList $rdArgs -Wait -WindowStyle Hidden
Start-Sleep -Seconds 1

if (-not (Test-Path $INSTALL_DIR)) {
    Write-Host "  [OK] Antigravity Deck has been removed." -ForegroundColor Green
    Write-Host ""
    return
}

# Attempt 2: robocopy mirror + rd
Write-Host "  [!] Trying robocopy mirror..." -ForegroundColor Yellow
$emptyDir = Join-Path $env:TEMP ("ag_empty_" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $emptyDir | Out-Null
$roboArgs = '"' + $emptyDir + '" "' + $INSTALL_DIR + '" /MIR /NFL /NDL /NJH /NJS /NC /NS /NP'
Start-Process "robocopy.exe" -ArgumentList $roboArgs -Wait -WindowStyle Hidden
Remove-Item -Recurse -Force $emptyDir -ErrorAction SilentlyContinue
$rdArgs2 = '/c rd /s /q "' + $INSTALL_DIR + '"'
Start-Process "cmd.exe" -ArgumentList $rdArgs2 -Wait -WindowStyle Hidden
Start-Sleep -Seconds 1

if (-not (Test-Path $INSTALL_DIR)) {
    Write-Host "  [OK] Antigravity Deck has been removed." -ForegroundColor Green
    Write-Host ""
    return
}

# Attempt 3: Schedule deletion on next reboot via registry
Write-Host "  [!] Files still locked -- scheduling deletion on next reboot..." -ForegroundColor Yellow
try {
    $regPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager"
    $existing = (Get-ItemProperty -Path $regPath -Name "PendingFileRenameOperations" -ErrorAction SilentlyContinue).PendingFileRenameOperations
    $newEntry = "\??\$INSTALL_DIR", ""
    if ($existing) { $newEntry = $existing + $newEntry }
    Set-ItemProperty -Path $regPath -Name "PendingFileRenameOperations" -Value $newEntry -ErrorAction Stop
    Write-Host "  [OK] Scheduled. The folder will be deleted automatically on next reboot." -ForegroundColor Green
    Write-Host "       Please restart your PC to complete uninstall." -ForegroundColor DarkGray
} catch {
    Write-Host "  [!] Could not schedule reboot deletion (run as Administrator to enable this)." -ForegroundColor Red
    Write-Host "      Manual fix: close all Explorer windows and terminals, then run:" -ForegroundColor Yellow
    $manualCmd = 'cmd /c rd /s /q "' + $INSTALL_DIR + '"'
    Write-Host "      $manualCmd" -ForegroundColor White
}

Write-Host ""
