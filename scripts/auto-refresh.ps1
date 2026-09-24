<#
.SYNOPSIS
    BedaanWaves — Full Auto-Refresh Pipeline (PowerShell port of auto-refresh.sh)

.DESCRIPTION
    Fetches latest OHLCV + fundamentals + macro + news via Python ingestion,
    then re-runs the V2 scoring engine via the TypeScript orchestrator.
    
    - If no seed data exists in DB: uses --force (full 60-day scoring + training)
    - If seed data exists: uses --incremental (scores only latest day, no retraining)

.DESCRIPTION
    Replaces scripts/auto-refresh.sh for Windows. Fixes:
    - python3 → python
    - Correct argparse flags for ingest_real_data.py (--resume, --batch-size)
    - Supports --incremental for periodic refresh without full retrain
#>

param(
    [switch]$Force
)

Set-Location "$PSScriptRoot/.."

$LOG = "logs/bedaan-refresh.log"
$null = New-Item -ItemType Directory -Force -Path "logs" | Out-Null

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"[$timestamp] === Starting BedaanWaves auto-refresh (PowerShell) ===" | Tee-Object -FilePath $LOG -Append

# Step 1: Fetch latest real news (fast, web search)
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"[$timestamp] [1/3] Fetching latest real news..." | Tee-Object -FilePath $LOG -Append
try {
    python scripts/fetch_real_news.py 2>&1 | Tee-Object -FilePath $LOG -Append
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$ts] News fetch completed" | Tee-Object -FilePath $LOG -Append
} catch {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$ts] WARNING: news fetch failed, continuing with existing news: $_" | Tee-Object -FilePath $LOG -Append
}

# Step 1.5: Fetch latest OHLCV + fundamentals (Python ingestion, resumable)
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"[$timestamp] [1.5/3] Fetching latest OHLCV + fundamentals via Python ingestion..." | Tee-Object -FilePath $LOG -Append
try {
    python scripts/ingestion/ingest_real_data.py --resume --batch-size 50 2>&1 | Tee-Object -FilePath $LOG -Append
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$ts] OHLCV ingestion completed" | Tee-Object -FilePath $LOG -Append
} catch {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$ts] WARNING: OHLCV fetch failed, continuing with existing data: $_" | Tee-Object -FilePath $LOG -Append
}

# Step 2: Check if we need full or incremental scoring
$needsFull = $Force
if (-not $needsFull) {
    $checkOutput = npx tsx scripts/check_db.ts 2>$null
    $snapshotCount = 0
    # Join array output into single string for regex matching (PowerShell captures
    # multi-line output as an array, which breaks -match/$matches)
    $checkText = @($checkOutput) -join "`n"
    if ($checkText -match 'Snapshots:\s*(\d+)') {
        $snapshotCount = [int]$matches[1]
    }
    if ($snapshotCount -eq 0) { $needsFull = $true }
}

# Step 3: Re-score via orchestrator
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
if ($needsFull) {
    "[$timestamp] [3/3] Running FULL orchestrator (force mode, 60-day scoring + training)..." | Tee-Object -FilePath $LOG -Append
    $orchArgs = "--force"
} else {
    "[$timestamp] [3/3] Running INCREMENTAL orchestrator (latest day only)..." | Tee-Object -FilePath $LOG -Append
    $orchArgs = "--incremental"
}
$orchestratorFailed = $false
try {
    $ErrorActionPreference = "Stop"
    npx tsx scripts/run-orchestrator.ts $orchArgs 2>&1 | Tee-Object -FilePath $LOG -Append
    $ErrorActionPreference = "Continue"
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$ts] Orchestrator completed" | Tee-Object -FilePath $LOG -Append
} catch {
    $ErrorActionPreference = "Continue"
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$timestamp] ERROR: orchestrator failed: $_" | Tee-Object -FilePath $LOG -Append
    $orchestratorFailed = $true
}

# Record last-refresh timestamp
$now = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$null = New-Item -ItemType Directory -Force -Path ".kilo/state" | Out-Null
Set-Content -Path ".kilo/state/last-refresh.txt" -Value $now
Set-Content -Path "logs/bedaan-last-refresh.txt" -Value $now

$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
if ($orchestratorFailed) {
    "[$ts] === Auto-refresh FAILED (orchestrator error) ===" | Tee-Object -FilePath $LOG -Append
    exit 1
}
"[$timestamp] === Auto-refresh complete ===" | Tee-Object -FilePath $LOG -Append
"---" | Tee-Object -FilePath $LOG -Append
