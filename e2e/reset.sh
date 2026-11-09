#!/usr/bin/env bash
# A clean world before a journey: restart the local chat backend (a fresh
# seed, new user ids), forget every player in the local game DB, and make sure
# the peer server is up.
#
# Env: OUT [e2e/out] (pid files, logs), GAME_PG [cx054-game-pg],
#      GAME_PG_USER [costquest], GAME_PG_DB [the user's own] (cq 056's rig:
#      cq056-pg, postgres, costquest_rig), CHAT_PORT [4120] (the port here; the phone still uses 4120 via adb reverse)
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
: "${OUT:=$here/out}"
: "${GAME_PG:=cx054-game-pg}"
: "${GAME_PG_USER:=costquest}"
GAME_PG_DB_ARG=${GAME_PG_DB:+-d $GAME_PG_DB}
: "${CHAT_PORT:=4120}"
export PORT="$CHAT_PORT" CHAT_API="http://localhost:$CHAT_PORT" MEDIA_BASE_URL="${MEDIA_BASE_URL:-http://localhost:4120}"
mkdir -p "$OUT"

# The node process listening on a port, if it is one of ours (e2e/seed).
ours_on() {
  local pid
  pid=$(ss -ltnp 2>/dev/null | grep "127.0.0.1:$1 " | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
  [ -n "$pid" ] && tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -q "e2e/seed/" && echo "$pid"
}

restart() { # name script log port
  local pidf="$OUT/$1.pid" pid
  for pid in $( [ -f "$pidf" ] && cat "$pidf") $(ours_on "$4"); do
    kill "$pid" 2>/dev/null
  done
  # wait for the old one to let go of its port before the new one binds it
  for _ in $(seq 1 40); do ss -ltn | grep -q "127.0.0.1:$4 " || break; sleep 0.5; done
  (cd "$here/.." || exit 1; nohup node "$2" > "$3" 2>&1 &)
  for _ in $(seq 1 60); do pid=$(ours_on "$4") && break; sleep 0.5; done
  echo "${pid:-}" > "$pidf"
}

rm -f "$here/seed/.peer-state.json"
# The phone's network on (J16 turns it off; a failed run would leave it off,
# and the setting survives an emulator restart).
adb shell svc wifi enable >/dev/null 2>&1
adb shell svc data enable >/dev/null 2>&1
# Twice if need be: right after a call journey the old backend can take a
# while to let go (live sockets), and the first start then fails.
for attempt in 1 2; do
  restart chat-local e2e/seed/chat-local.js "$OUT/chat-local.log" "$CHAT_PORT"
  # 180 s: on a loaded machine the seed alone can take over a minute.
  for _ in $(seq 1 180); do grep -q "\[chat-local\] ready\|failed" "$OUT/chat-local.log" 2>/dev/null && break; sleep 1; done
  grep -q "\[chat-local\] ready" "$OUT/chat-local.log" && break
  cp "$OUT/chat-local.log" "$OUT/chat-local.failed-$attempt.log"
  sleep 5
done
grep -q "\[chat-local\] ready" "$OUT/chat-local.log" || { echo "chat backend did not start, see $OUT/chat-local.log" >&2; exit 1; }

if ! curl -s -m 2 -o /dev/null -X POST http://127.0.0.1:4130/run; then
  restart peer-server e2e/seed/peer-server.js "$OUT/peer-server.log" 4130
  sleep 1
fi

if docker ps --format '{{.Names}}' | grep -qx "$GAME_PG"; then
  tables=$(docker exec "$GAME_PG" psql -U "$GAME_PG_USER" $GAME_PG_DB_ARG -At -c \
    "select string_agg(distinct table_name, ', ') from information_schema.columns where column_name='device_key' and table_schema='public'")
  [ -n "$tables" ] && docker exec "$GAME_PG" psql -U "$GAME_PG_USER" $GAME_PG_DB_ARG -q -c "TRUNCATE $tables CASCADE" 2>/dev/null
fi
echo "reset: chat seeded, game players cleared"
