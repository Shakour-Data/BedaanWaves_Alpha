#!/bin/bash
# BedaanWaves — Auto-Refresh Background Loop
# Runs the full data refresh pipeline every 2 hours.
# Also keeps the dev server alive (watchdog).
cd /home/z/my-project

REFRESH_INTERVAL=7200  # 2 hours in seconds
DEV_CHECK_INTERVAL=10  # check dev server every 10s

echo "[$(date)] === BedaanWaves auto-refresh + watchdog started ==="
echo "[$(date)] Refresh interval: ${REFRESH_INTERVAL}s (2 hours)"
echo "[$(date)] Dev server check interval: ${DEV_CHECK_INTERVAL}s"

LAST_REFRESH=0

while true; do
  # 1. Watchdog: ensure dev server is alive
  # Note: Next.js renames the process from "next dev" to "next-server" after boot,
  # so we check for either name.
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

  # 2. Auto-refresh: run full data pipeline every 2 hours
  NOW=$(date +%s)
  ELAPSED=$((NOW - LAST_REFRESH))
  if [ $ELAPSED -ge $REFRESH_INTERVAL ]; then
    echo "[$(date)] [refresh] starting auto-refresh (last was ${ELAPSED}s ago)..."
    bash /home/z/my-project/scripts/auto-refresh.sh >> /tmp/bedaan-refresh.log 2>&1
    LAST_REFRESH=$(date +%s)
    echo "[$(date)] [refresh] complete. Next in ${REFRESH_INTERVAL}s."
  fi

  sleep $DEV_CHECK_INTERVAL
done
