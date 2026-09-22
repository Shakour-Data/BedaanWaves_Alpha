#!/usr/bin/env bash
# BedaanWaves — Full Auto-Refresh Pipeline
# Fetches ALL latest real data (OHLCV + fundamentals + macro + news),
# then re-runs the V2 scoring engine + per-symbol coefficient training.
# This script is designed to be run periodically (every 2 hours).
#
# Per spec §4.5: ingestion is a Python job; scoring + training are TypeScript
# (orchestrator.ts) which now invokes scripts/ml/train.py internally when
# sufficient samples exist. The orchestrator is the single source of truth
# for both scoring and coefficient training, so the refresh script delegates
# to it rather than calling train.py directly.
set -e
cd "$(dirname "$0")/.."

LOG="logs/bedaan-refresh.log"
mkdir -p logs

echo "[$(date)] === Starting BedaanWaves auto-refresh ===" | tee -a "$LOG"

# Step 1: Fetch latest OHLCV + fundamentals (Python, full universe, resumable)
echo "[$(date)] [1/3] Fetching latest OHLCV + fundamentals via Python ingestion..." | tee -a "$LOG"
python3 scripts/ingestion/ingest_real_data.py \
  --full-universe \
  --output-dir src/lib/scoring/seed \
  --batch-size 50 \
  >> "$LOG" 2>&1 || {
    echo "[$(date)] WARNING: OHLCV fetch failed, continuing with existing data" | tee -a "$LOG"
}

# Step 2: Fetch latest real news (z-ai web-search)
echo "[$(date)] [2/3] Fetching latest real news via web-search..." | tee -a "$LOG"
python3 scripts/fetch_real_news.py >> "$LOG" 2>&1 || {
  echo "[$(date)] WARNING: news fetch failed, continuing with existing news" | tee -a "$LOG"
}

# Step 3: Re-score + re-train via the TypeScript orchestrator.
# The orchestrator (seed/orchestrator.ts) is the single entry point for
# scoring and coefficient training. It serializes training samples to
# artifacts/training_samples.json, invokes scripts/ml/train.py, and loads
# the resulting per-symbol, per-level coefficients. Falls back to the
# TypeScript |corr| learner when the Python trainer is unavailable.
echo "[$(date)] [3/3] Re-scoring + re-training coefficients via orchestrator..." | tee -a "$LOG"
npx tsx scripts/run-orchestrator.ts >> "$LOG" 2>&1 || {
  echo "[$(date)] ERROR: orchestrator (scoring + training) failed!" | tee -a "$LOG"
  exit 1
}

# Record last-refresh timestamp
date -u +"%Y-%m-%dT%H:%M:%SZ" > logs/bedaan-last-refresh.txt

echo "[$(date)] === Auto-refresh complete ===" | tee -a "$LOG"
echo "---" | tee -a "$LOG"