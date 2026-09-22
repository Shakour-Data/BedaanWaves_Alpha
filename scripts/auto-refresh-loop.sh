#!/bin/bash
# BedaanWaves — Auto-Refresh Background Loop
# Runs live price refresh every 15 minutes.
# Runs full data refresh every 2 hours.
# Portable: uses project directory, not hard-coded paths.
set -e
cd "$(dirname "$0")/.."

PRICE_REFRESH_INTERVAL=900    # 15 minutes in seconds
FULL_REFRESH_INTERVAL=7200    # 2 hours in seconds
DEV_CHECK_INTERVAL=30         # check every 30s

STATE_DIR=".kilo/state"
mkdir -p "${STATE_DIR}"

echo "[$(date)] === BedaanWaves auto-refresh + watchdog started ==="
echo "[$(date)] Price refresh interval: ${PRICE_REFRESH_INTERVAL}s (15 min)"
echo "[$(date)] Full refresh interval: ${FULL_REFRESH_INTERVAL}s (2 hrs)"

LAST_PRICE_REFRESH=0
LAST_FULL_REFRESH=0

while true; do
    NOW=$(date +%s)

    # Live price refresh every 15 minutes
    PRICE_ELAPSED=$((NOW - LAST_PRICE_REFRESH))
    if [ "$PRICE_ELAPSED" -ge "$PRICE_REFRESH_INTERVAL" ]; then
        echo "[$(date)] [price-refresh] starting..."
        python3 scripts/fetch_live_prices.py >> "${STATE_DIR}/price-refresh.log" 2>&1 || {
            echo "[$(date)] [price-refresh] FAILED" >> "${STATE_DIR}/price-refresh.log"
        }
        LAST_PRICE_REFRESH=$NOW
    fi

    # Full refresh every 2 hours
    FULL_ELAPSED=$((NOW - LAST_FULL_REFRESH))
    if [ "$FULL_ELAPSED" -ge "$FULL_REFRESH_INTERVAL" ]; then
        echo "[$(date)] [full-refresh] starting..."
        bash scripts/auto-refresh.sh >> "${STATE_DIR}/refresh.log" 2>&1 || {
            echo "[$(date)] [full-refresh] FAILED" >> "${STATE_DIR}/refresh.log"
        }
        LAST_FULL_REFRESH=$NOW
    fi

    sleep "$DEV_CHECK_INTERVAL"
done
