<#
.SYNOPSIS
    BedaanWaves — Auto-refresh watchdog (runs every 5 min as SYSTEM).

.RESPONSIBILITIES
    1. Rotate oversized refresh logs (keep last 1 MB tail in place).
    2. Write a machine-readable health snapshot to .kilo/state/health.json.
    3. Restart the auto-refresh loop if it is not running.

.NOTES
    Runs under the local SYSTEM account via the scheduled task
    "BedaanWaves AutoRefresh Watchdog".
#>
param(
    [int]$MaxLogBytes = 10MB,
    [int]$TailKeepBytes = 1MB
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$stateDir = "$root\.kilo\state"
$null = New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
$stateDirFull = (Get-Item $stateDir).FullName
$logFile = "$stateDirFull\watchdog.log"
$healthFile = "$stateDirFull\health.json"

function Write-W {
    param([string]$Message)
    $msg = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    try { Add-Content -Path $logFile -Value $msg -ErrorAction SilentlyContinue }
    catch { Write-Host $msg }
}

# --- 1. Rotate oversized logs ---
foreach ($lf in @("$stateDirFull\refresh.log", "$stateDirFull\price-refresh.log")) {
    if (Test-Path $lf) {
        $info = Get-Item $lf
        if ($info.Length -gt $MaxLogBytes) {
            $archive = "$lf.$((Get-Date).ToString('yyyyMMdd-HHmmss')).bak"
            Rename-Item -LiteralPath $lf -NewName ([System.IO.Path]::GetFileName($archive)) -Force
            # Recreate a small tail from the archive so we don't lose all history.
            if (Test-Path $archive) {
                $tail = [System.IO.File]::ReadAllBytes($archive)
                if ($tail.Length -gt $TailKeepBytes) {
                    $keep = $tail[($tail.Length - $TailKeepBytes)..($tail.Length - 1)]
                } else { $keep = $tail }
                [System.IO.File]::WriteAllBytes($lf, $keep)
            }
            Write-W "Rotated $([System.IO.Path]::GetFileName($lf)) ($(($info.Length/1MB).ToString('0.0')) MB) -> $([System.IO.Path]::GetFileName($archive))"
        }
    }
}

# --- 2. Health snapshot ---
$loopRunning = $false
$loopCount = 0
foreach ($proc in Get-CimInstance Win32_Process -Filter "Name='powershell.exe'") {
    if ($proc.CommandLine -match 'start-auto-refresh\.ps1|auto-refresh-loop\.ps1') {
        $loopRunning = $true
        $loopCount++
    }
}

$lastFull = [System.IO.File]::ReadAllText("$stateDirFull\last-refresh.txt").Trim() -replace "`r`n|`n",''
$nowUtc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

# Orchestrator lock liveness
$orchLock = "$stateDirFull\orchestrator.lock"
$orchLocked = Test-Path $orchLock
$orchAge = if ($orchLocked) { ((Get-Date) - [System.IO.File]::GetLastWriteTimeUtc($orchLock)).TotalMinutes } else { $null }

$health = [ordered]@{
    checkedAt           = $nowUtc
    loopRunning         = $loopRunning
    loopProcessCount    = $loopCount
    lastFullRefreshUtc  = $lastFull
    orchestratorLock    = $orchLocked
    orchestratorLockAgeMinutes = $orchAge
    stateDir            = $stateDirFull
}
$health | ConvertTo-Json -Compress | Set-Content -Path $healthFile -Encoding utf8

Write-W "health: loopRunning=$loopRunning procCount=$loopCount orchLock=$orchLocked orchAge=$orchAge lastFull=$lastFull"

# --- 3. Restart loop if not running ---
if (-not $loopRunning) {
    Write-W "Auto-refresh loop not running; starting via start-auto-refresh.ps1"
    try {
        Start-Process -FilePath "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" `
            -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$root\scripts\start-auto-refresh.ps1`"" `
            -WindowStyle Hidden -ErrorAction Stop
        Write-W "Started auto-refresh supervisor"
    } catch {
        Write-W "Failed to start auto-refresh: $_"
    }
}
