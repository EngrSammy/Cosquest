#!/usr/bin/env bash
# The key screens on the emulator's current build: e2e/polish/shots.sh <run> [light|dark]
# Writes $OUT/<run>-shots/*.png (and a recording in $VIDEOS).
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
e2e="$here/.."
run="${1:?run}"; mode="${2:-light}"
[ -n "${EMU_PORT:-}" ] && export ANDROID_SERIAL="emulator-$EMU_PORT"
if [ "$mode" = dark ]; then adb shell cmd uimode night yes >/dev/null; else adb shell cmd uimode night no >/dev/null; fi
SEED_PERF=1 "$e2e/reset.sh" >/dev/null
MAESTRO_ARGS="-e USER=ada -e PASS=cosquest-dev-1 -e P=$run" "$e2e/journey.sh" polish/flows/${FLOW:-shots}.yaml "$run-shots"
status=$?
adb shell cmd uimode night no >/dev/null
exit $status
