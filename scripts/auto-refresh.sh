#!/usr/bin/env bash
# BedaanWaves — Full Auto-Refresh Pipeline
# Fetches ALL latest real data (OHLCV + fundamentals + macro + news),
# then re-runs the V2 scoring engine + per-symbol coefficient training.
# This script is designed to be run periodically (every 2 hours).
set -e
cd "$(dirname "$0")/.."

LOG="logs/bedaan-refresh.log"
mkdir -p logs
echo "[$(date)] === Starting BedaanWaves auto-refresh ===" | tee -a "$LOG"

# Step 1: Fetch latest OHLCV + fundamentals (yfinance)
echo "[$(date)] [1/4] Fetching latest OHLCV + fundamentals via yfinance..." | tee -a "$LOG"
timeout 480 python3 scripts/fetch_real_data.py >> "$LOG" 2>&1 || {
    echo "[$(date)] WARNING: OHLCV fetch failed, continuing with existing data" | tee -a "$LOG"
}

# Step 2: Fetch latest market macro (Node.js — cross-platform)
echo "[$(date)] [2/4] Fetching latest market macro (Node.js)..." | tee -a "$LOG"
timeout 180 node scripts/fetch_macro_node.cjs >> "$LOG" 2>&1 || {
    echo "[$(date)] WARNING: macro fetch failed, continuing with existing data" | tee -a "$LOG"
}

# Step 2b: Fetch international economic indicators
echo "[$(date)] [2b/4] Fetching international economic indicators..." | tee -a "$LOG"
timeout 180 node scripts/fetch_intl_econ.cjs >> "$LOG" 2>&1 || {
    echo "[$(date)] WARNING: intl econ fetch failed, continuing" | tee -a "$LOG"
}

# Step 2c: Add source attribution to economic releases
echo "[$(date)] [2c/4] Adding source attribution..." | tee -a "$LOG"
node scripts/add_sources.cjs >> "$LOG" 2>&1 || true

# Step 3: Fetch latest real news (z-ai web-search)
echo "[$(date)] [3/5] Fetching latest real news via web-search..." | tee -a "$LOG"
timeout 180 python3 scripts/fetch_real_news.py >> "$LOG" 2>&1 || {
    echo "[$(date)] WARNING: news fetch failed, continuing with existing news" | tee -a "$LOG"
}

# Step 4: Re-run V2 scoring engine + per-symbol coefficient training
echo "[$(date)] [4/5] Re-scoring + re-training coefficients..." | tee -a "$LOG"
timeout 300 npx tsx scripts/seed.ts >> "$LOG" 2>&1 || {
    echo "[$(date)] ERROR: re-scoring failed!" | tee -a "$LOG"
    exit 1
}

# Record last-refresh timestamp
date -u +"%Y-%m-%dT%H:%M:%SZ" > logs/bedaan-last-refresh.txt

echo "[$(date)] === Auto-refresh complete ===" | tee -a "$LOG"
echo "---" | tee -a "$LOG"
