#!/bin/bash
# Watchdog: keep the Next.js dev server alive, restart if it dies.
cd /home/z/my-project
while true; do
  if ! pgrep -f "next dev" > /dev/null 2>&1; then
    echo "[$(date)] dev server not running, starting..."
    nohup setsid bash -c 'exec bunx next dev -p 3000 -H 0.0.0.0' > /tmp/dev-start.log 2>&1 < /dev/null &
    disown
    sleep 8
    if pgrep -f "next dev" > /dev/null 2>&1; then
      echo "[$(date)] dev server started (pid $(pgrep -f 'next dev' | head -1))"
    else
      echo "[$(date)] FAILED to start dev server"
    fi
  fi
  sleep 5
done
