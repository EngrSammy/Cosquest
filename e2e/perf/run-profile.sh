#!/usr/bin/env bash
# One phone profile for docs/polish/BASELINE.md: the fit tour (recorded, with
# screenshots), then the measurements, each on a fresh perf world.
#
#   e2e/perf/run-profile.sh <run> <small|large|large-a11y|game-ref> [tour|measure|game]
#   (game: only the map, duel and quiz measurements; only:cold,feed: those)
#
# Writes $VIDEOS/<run>-tour-<profile>.mp4, $OUT/<run>-tour-<profile>/ (the
# screenshots) and $OUT/perf-<run>-<profile>.json.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
e2e="$here/.."
run="${1:?run}"; prof="${2:?profile}"; what="${3:-all}"
: "${MAESTRO:=$HOME/cq-work/cx-journeys/tools/maestro/bin/maestro}"
: "${JAVA_HOME:=$HOME/cq-work/tools/jdk17}"
export JAVA_HOME MAESTRO_CLI_NO_ANALYTICS=1
"$here/profile.sh" "$prof"
# The emulator's encoder refuses 1440x3120; record the tall screens at half size.
case "$prof" in large*) export REC_SIZE=720x1560 ;; esac
if [ "$what" = all ] || [ "$what" = tour ]; then
  SEED_PERF=1 "$e2e/reset.sh" >/dev/null
  MAESTRO_ARGS="-e USER=ada -e PASS=cosquest-dev-1 -e P=$prof" "$e2e/journey.sh" perf/flows/tour.yaml "$run-tour-$prof"
fi
if [ "$what" != tour ]; then
  SEED_PERF=1 "$e2e/reset.sh" >/dev/null
  "$e2e/emu.sh" tunnels
  "$MAESTRO" test ${ANDROID_SERIAL:+--device "$ANDROID_SERIAL"} -e USER=ada -e PASS=cosquest-dev-1 -e P="$prof" "$here/flows/signin.yaml" > "$OUT/$run-$prof-signin.log" 2>&1 \
    || { echo "signin failed ($OUT/$run-$prof-signin.log)"; exit 1; }
  if [ "$what" = game ]; then
    python3 "$here/measure.py" "$run-$prof" --only map,duel,quiz
  elif [ "${what#only:}" != "$what" ]; then
    python3 "$here/measure.py" "$run-$prof" --only "${what#only:}"
  else
    python3 "$here/measure.py" "$run-$prof"
  fi
fi
