#!/bin/bash
# BedaanWaves — Auto-Refresh Background Loop
# Runs live price refresh every 15 minutes.
# Runs full data refresh every 2 hours.
# Also keeps the dev server alive (watchdog).
cd /home/z/my-project

PRICE_REFRESH_INTERVAL=900  # 15 minutes in seconds
FULL_REFRESH_INTERVAL=7200  # 2 hours in seconds
DEV_CHECK_INTERVAL=10  # check dev server every 10s

echo "[$(date)] === BedaanWaves auto-refresh + watchdog started ==="
echo "[$(date)] Price refresh interval: ${PRICE_REFRESH_INTERVAL}s (15 minutes)"
echo "[$(date)] Full refresh interval: ${FULL_REFRESH_INTERVAL}s (2 hours)"
echo "[$(date)] Dev server check interval: ${DEV_CHECK_INTERVAL}s"

LAST_PRICE_REFRESH=0
LAST_FULL_REFRESH=0

while true; do
  # 1. Watchdog: ensure dev server is alive
  if ! { pgrep -f "next-server" > /dev/null 2>&1 || pgrep -f "next dev" > /dev/null 2>&1; }; then
    echo "[$(date)] [watchdog] dev server not running, starting..."
    setsid bash -c 'exec bunx next dev -p 3000 -H 0.0.0.0' > /tmp/dev-start.log 2>&1 < /dev/null &
    disown
    sleep 8
    if { pgrep -f "next-server" > /dev/null 2>&1 || pgrep -f "next dev" > /dev/null 2>&1; }; then
      echo "[$(date)] [watchdog] dev server started (pid $( { pgrep -f 'next-server' || pgrep -f 'next dev'; } | head -1))"
    else
      echo "[$(date)] [watchdog] FAILED to start dev server"
    fi
  fi

  NOW=$(date +%s)

  # 2. Live price refresh every 15 minutes
  PRICE_ELAPSED=$((NOW - LAST_PRICE_REFRESH))
  if [ $PRICE_ELAPSED -ge $PRICE_REFRESH_INTERVAL ]; then
    echo "[$(date)] [price-refresh] starting live price refresh..."
    bash /home/z/my-project/scripts/refresh-prices.sh >> /tmp/bedaan-price-refresh.log 2>&1
    LAST_PRICE_REFRESH=$(date +%s)
  fi

  # 3. Full refresh every 2 hours
  FULL_ELAPSED=$((NOW - LAST_FULL_REFRESH))
  if [ $FULL_ELAPSED -ge $FULL_REFRESH_INTERVAL ]; then
    echo "[$(date)] [full-refresh] starting full data refresh..."
    bash /home/z/my-project/scripts/auto-refresh.sh >> /tmp/bedaan-refresh.log 2>&1
    LAST_FULL_REFRESH=$(date +%s)
  fi

  sleep $DEV_CHECK_INTERVAL
done
