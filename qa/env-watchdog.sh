#!/bin/bash
# env-watchdog — the sandbox repeatedly truncates /home/z/my-project/.env
# down to just DATABASE_URL, which silently downgrades the app to local
# SQLite (data divergence!). This loop restores the master copy and
# restarts the dev server whenever the Turso lines go missing.
MASTER=/home/z/my-project/qa/env.master
TARGET=/home/z/my-project/.env
LOG=/home/z/my-project/qa/watchdog.log

while true; do
  if ! grep -q "TURSO_AUTH_TOKEN" "$TARGET" 2>/dev/null; then
    cp "$MASTER" "$TARGET"
    echo "$(date '+%F %T') .env was wiped — restored from master, restarting dev server" >> "$LOG"
    pkill -f "next dev" 2>/dev/null
    sleep 2
    (cd /home/z/my-project && setsid bash -c 'exec bun run dev 2>&1 | tee dev.log' > /dev/null 2>&1 < /dev/null &)
    sleep 10
    echo "$(date '+%F %T') dev server restarted" >> "$LOG"
  fi
  sleep 30
done
