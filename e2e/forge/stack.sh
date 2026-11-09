#!/usr/bin/env bash
# The Forge drop-in proof's local stack (cq 056), on its own ports so it can
# run beside other farm tasks:
#
#   e2e/forge/stack.sh up         chat backend (host 4320) + game backend (8599,
#                                 forge_world ON) + the Trafalgar test world
#   e2e/forge/stack.sh publish    import every fixture pack in $PACKS into the
#                                 LOCAL game backend and approve + publish it
#                                 (tools/forge_import.py, in-process); prints ids
#   e2e/forge/stack.sh unpublish  take them all out again (the "before" state)
#   e2e/forge/stack.sh reset      forget every player (a new player per run)
#   e2e/forge/stack.sh down       stop what `up` started
#
# The app build for it: GAME_SERVER=http://localhost:8599 (scripts/android-
# emulator-build.sh); the phone reaches 4120 (chat) and 8599 (game) through
# adb reverse: TUNNELS="4120:4320 8599:8599 7880:7880 7881:7881" e2e/emu.sh up.
#
# Env: RIG (state, env file, logs) [~/cq-work/game-forge/rig], BACKEND (a
# costquest-backend checkout on forge-world) [~/cq-work/game-forge/costquest-backend],
# VENV [$BACKEND/.venv], PACKS [/opt/cq/tasks/056-game-forge-in-world-v2/out/packs].
# $RIG/game.env holds local-only secrets and is never committed. Nothing here
# talks to staging or production.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
: "${RIG:=$HOME/cq-work/game-forge/rig}"
: "${BACKEND:=$HOME/cq-work/game-forge/costquest-backend}"
if [ -x "$BACKEND/.venv/bin/uvicorn" ]; then : "${VENV:=$BACKEND/.venv}"; else : "${VENV:=$HOME/cq-work/cx-journeys/game-backend/.venv}"; fi
: "${PACKS:=/opt/cq/tasks/056-game-forge-in-world-v2/out/packs}"
: "${PG:=cq056-pg}"
# Ports here (the APK still talks to 8599/4120 on the phone; adb reverse maps them)
: "${GAME_PORT:=8599}"
: "${CHAT_PORT:=4320}"
mkdir -p "$RIG/packcache" "$RIG/forge-import"

genv() {
  set -a
  # shellcheck disable=SC1091
  . "$RIG/game.env"
  set +a
  CQ_SSO_SEAL_KEY=$(cat "$RIG/.sso_seal_key")
  export CQ_SSO_SEAL_KEY
}

case "${1:-}" in
  up)
    docker ps --format '{{.Names}}' | grep -qx "$PG" || docker start "$PG" >/dev/null
    if [ -f "$RIG/chat.pid" ] && kill -0 "$(cat "$RIG/chat.pid")" 2>/dev/null; then
      echo "chat already up (pid $(cat "$RIG/chat.pid"))"
    else
      # cd first, on its own: `cd && nohup ... &` would background a subshell
      # (the pid file would name it, and it would hold this script's stdout).
      # From the repo root, so the command line says e2e/seed/ and e2e/reset.sh
      # recognises it as the rig's own chat backend and can restart it (cq 076).
      (cd "$here/../.."; PORT=$CHAT_PORT MEDIA_BASE_URL=http://localhost:4120 SEED_OUT="$RIG/chat-seed.json" \
        nohup node e2e/seed/chat-local.js > "$RIG/chat.log" 2>&1 < /dev/null & echo $! > "$RIG/chat.pid")
      for _ in $(seq 1 60); do grep -q "ready" "$RIG/chat.log" 2>/dev/null && break; sleep 1; done
      echo "chat backend on :$CHAT_PORT (pid $(cat "$RIG/chat.pid"))"
    fi
    if [ -f "$RIG/game.pid" ] && kill -0 "$(cat "$RIG/game.pid")" 2>/dev/null; then
      echo "game already up (pid $(cat "$RIG/game.pid"))"
    else
      genv
      (cd "$BACKEND"; nohup "$VENV/bin/uvicorn" app.main:app --host 127.0.0.1 --port $GAME_PORT --workers 1 \
        >> "$RIG/game.log" 2>&1 < /dev/null & echo $! > "$RIG/game.pid")
      for _ in $(seq 1 60); do curl -sf "http://127.0.0.1:$GAME_PORT/health" >/dev/null && break; sleep 0.5; done
      curl -sf -X POST -H "Authorization: Bearer $CQ_ADMIN_TOKEN" \
        "http://127.0.0.1:$GAME_PORT/v1/roam/testworld/seed?place=trafalgar&lat=51.5074&lng=-0.1278" > "$RIG/seed-testworld.json"
      echo "game backend on :$GAME_PORT (pid $(cat "$RIG/game.pid")), test world seeded"
    fi
    ;;
  publish)
    genv
    : > "$RIG/published.txt"
    for d in "$PACKS"/*/; do
      (cd "$BACKEND" && "$VENV/bin/python" -m tools.forge_import "$d" --approve --publish) | tee -a "$RIG/published.txt"
    done
    ;;
  unpublish)
    genv
    for id in $(curl -sf "http://127.0.0.1:$GAME_PORT/v1/catalogue?types=weapon,character,environment,station" |
      python3 -c 'import json,sys; [print(e["id"]) for e in json.load(sys.stdin)["elements"]]'); do
      curl -sf -X POST -H "Authorization: Bearer $CQ_ADMIN_TOKEN" -H "X-Admin-Actor: cq056-proof" \
        "http://127.0.0.1:$GAME_PORT/v1/admin/forge/elements/$id/unpublish" > /dev/null && echo "unpublished $id"
    done
    ;;
  reset)
    tables=$(docker exec "$PG" psql -U postgres -d "${RIG_DB:-${GAME_PG_DB:-costquest_rig}}" -At -c \
      "select string_agg(distinct table_name, ', ') from information_schema.columns where column_name='device_key' and table_schema='public'")
    docker exec "$PG" psql -U postgres -d "${RIG_DB:-${GAME_PG_DB:-costquest_rig}}" -q -c "TRUNCATE $tables CASCADE"
    echo "game players reset"
    ;;
  down)
    for p in game chat; do
      if [ -f "$RIG/$p.pid" ] && kill -0 "$(cat "$RIG/$p.pid")" 2>/dev/null; then kill "$(cat "$RIG/$p.pid")"; echo "stopped $p"; fi
      rm -f "$RIG/$p.pid"
    done
    ;;
  *) sed -n 2,24p "$0"; exit 2 ;;
esac
