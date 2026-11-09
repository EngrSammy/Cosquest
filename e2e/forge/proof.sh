#!/usr/bin/env bash
# The Forge drop-in proof (cq 056), recorded on the Android emulator with the
# app untouched between "nothing published" and "everything published":
#
#   source ~/cq-work/game-forge/rig/env.sh       # ports, AVD, OUT, BACKEND
#   e2e/forge/stack.sh up && e2e/emu.sh up <apk>
#   e2e/forge/proof.sh [run-label]
#
# 1. a new player; every Forge element unpublished -> f00-before (the map
#    with the switch on and nothing to show)
# 2. the fixture packs imported and published on the LOCAL backend
#    (stack.sh publish) while the app keeps running: no reinstall, no build
# 3. f01 avatar (idle / walk / celebrate, wear it), f02 a find on the map
#    (the phone is walked to the nearest live one), claim, equip, the bag,
#    f03 a duel with the equipped weapon, f04 a point dressed with a Forge
#    station and environment
# Videos (silent audio track) in $VIDEOS, screenshots in $OUT/<label>/.
# Steps 3+ are adb drivers (e2e/forge/drive/*.sh), not Maestro flows: over a
# live 3D view Maestro's hierarchy dumps never settle on the software GPU.
# The Maestro versions (flows/0[1-4]-*.yaml) are kept for a phone or a GPU emulator.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
e2e="$here/.."
run="${1:-proof}"
: "${OUT:?source the rig env first}"
GEO_FILE="$OUT/$run.geo"
export GEO_FILE
echo "-0.1278 51.5074" > "$GEO_FILE"
results="$OUT/results-$run.txt"
: > "$results"

journey() { # flow label [maestro args...]
  local flow="$1" label="$2"
  shift 2
  MAESTRO_ARGS="$*" "$e2e/journey.sh" "forge/flows/$flow" "$run-$label" | tail -1 | tee -a "$results"
}

"$here/stack.sh" reset
"$here/stack.sh" unpublish
journey 00-smoke.yaml f00-before

"$here/stack.sh" publish > "$OUT/$run-published.txt"
echo "published $(grep -c ' published$' "$OUT/$run-published.txt") elements" | tee -a "$results"

journey ../drive/f01-avatar.sh f01-avatar

# Walk the phone to the nearest live find (the spawn rules decide where).
drop=$(python3 "$here/nearest_drop.py" --base "http://127.0.0.1:${GAME_PORT:-8599}")
if [ -n "$drop" ]; then
  echo "${drop%%|*}" > "$GEO_FILE"
  rest="${drop#*|}"
  name="${rest%%|*}"
  echo "find: $name, ${rest#*|} (metres from Trafalgar Square | expires)" | tee -a "$results"
  sleep 6
  journey ../drive/f02-item.sh f02-item
else
  echo "f02-item SKIPPED: no live find within 1 km" | tee -a "$results"
fi

echo "-0.1278 51.5074" > "$GEO_FILE"
sleep 6
journey ../drive/f03-duel.sh f03-duel
journey ../drive/f04-station.sh f04-station
cat "$results"
