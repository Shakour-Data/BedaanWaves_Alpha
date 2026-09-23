<#
.SYNOPSIS
    BedaanWaves — Auto-Refresh Background Loop (PowerShell port of auto-refresh-loop.sh)

.DESCRIPTION
    Runs live price refresh every 15 minutes.
    Runs full data refresh every 2 hours.
    Portable: uses project directory, not hard-coded paths.

    Replaces scripts/auto-refresh-loop.sh for Windows environments
    where bash is unavailable.
#>

param(
    [int]$PriceRefreshMinutes = 15,
    [int]$FullRefreshHours = 2,
    [int]$CheckIntervalSeconds = 30,
    [int]$InitialDelayHours = 0
)

Set-Location "$PSScriptRoot/.."

$STATE_DIR = ".kilo/state"
$null = New-Item -ItemType Directory -Force -Path $STATE_DIR | Out-Null

$PRICE_REFRESH_INTERVAL = $PriceRefreshMinutes * 60
$FULL_REFRESH_INTERVAL = $FullRefreshHours * 3600

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"[$timestamp] === BedaanWaves auto-refresh + watchdog started ==="
"[$timestamp] Price refresh interval: ${PRICE_REFRESH_INTERVAL}s ($PriceRefreshMinutes min)"
"[$timestamp] Full refresh interval: ${FULL_REFRESH_INTERVAL}s ($FullRefreshHours hrs)"
"[$timestamp] Check interval: ${CheckIntervalSeconds}s"

$LAST_PRICE_REFRESH = [double]0
$LAST_FULL_REFRESH = [double]0

if ($InitialDelayHours -gt 0) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$ts] Initial delay: $InitialDelayHours hours (waiting for initial orchestrator run)"
    $LAST_FULL_REFRESH = [double](Get-Date -UFormat %s)
}

function Write-Log {
    param([string]$Message, [string]$File = "$STATE_DIR/refresh.log")
    $msg = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    try {
        Add-Content -Path $File -Value $msg -ErrorAction SilentlyContinue
    } catch {
        # Fallback to console output
        Write-Host $msg
    }
}

while ($true) {
    $NOW = [double](Get-Date -UFormat %s)

    # Live price refresh every 15 minutes
    $PRICE_ELAPSED = $NOW - $LAST_PRICE_REFRESH
    if ($PRICE_ELAPSED -ge $PRICE_REFRESH_INTERVAL) {
        $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Write-Log "[price-refresh] starting..."
        try {
            python scripts/fetch_live_prices.py 2>&1 | Out-String | Add-Content -Path "$STATE_DIR/price-refresh.log" -ErrorAction SilentlyContinue
            Write-Log "[price-refresh] completed"
        } catch {
            Write-Log "[price-refresh] FAILED: $_"
        }
        $LAST_PRICE_REFRESH = $NOW
    }

    # Full refresh every 2 hours
    $FULL_ELAPSED = $NOW - $LAST_FULL_REFRESH
    if ($FULL_ELAPSED -ge $FULL_REFRESH_INTERVAL) {
        # Check if orchestrator is running (lock file)
        $orchestratorLock = ".kilo/state/orchestrator.lock"
        if (Test-Path $orchestratorLock) {
            Write-Log "[full-refresh] Skipped (orchestrator lock exists)"
        } else {
            Write-Log "[full-refresh] starting..."
            try {
                & "$PSScriptRoot/auto-refresh.ps1" 2>&1 | Out-String | Add-Content -Path "$STATE_DIR/refresh.log" -ErrorAction SilentlyContinue
                Write-Log "[full-refresh] completed"
            } catch {
                Write-Log "[full-refresh] FAILED: $_"
            }
        }
        $LAST_FULL_REFRESH = $NOW
    }

    Start-Sleep -Seconds $CheckIntervalSeconds
}
