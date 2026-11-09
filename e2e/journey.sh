#!/usr/bin/env bash
# Run one Maestro journey on the emulator and record it.
#
#   e2e/journey.sh maestro/01-signup-onboarding.yaml [label]
#
# Writes $VIDEOS/<label>.mp4 (screen + a silent audio track, so players treat
# it as a video and not a GIF), $OUT/<label>.maestro.log and Maestro's
# screenshots/debug output under $OUT/<label>/. Exit status is Maestro's.
#
# adb screenrecord stops after 3 minutes, so the phone records 170 s segments
# back to back and they are joined afterwards. REC_SIZE (e.g. 720x1560)
# records at that size, for screens the encoder refuses at full size.
# VIDEO_W (default 540) and VIDEO_CRF (default 30) set the joined video's
# width and quality (a showcase cut: VIDEO_W=720 VIDEO_CRF=20).
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
: "${ANDROID_HOME:=$HOME/cq-work/tools/android-sdk}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
: "${MAESTRO:=$HOME/cq-work/cx-journeys/tools/maestro/bin/maestro}"
: "${JAVA_HOME:=$HOME/cq-work/tools/jdk17}"
export JAVA_HOME MAESTRO_CLI_NO_ANALYTICS=1 MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
: "${OUT:=$here/out}"
: "${VIDEOS:=$OUT/videos}"
[ -n "${EMU_PORT:-}" ] && export ANDROID_SERIAL="emulator-$EMU_PORT"
flow="$1"
label="${2:-$(basename "$flow" .yaml)}"
mkdir -p "$OUT/$label" "$VIDEOS"

# The tunnels to this machine's backends go if adb reconnects; renew them
# now and every few seconds while the journey runs.
"$here/emu.sh" tunnels
# The phone's GPS also gets Trafalgar Square again each time (a phone outdoors
# keeps getting fixes; a lone fix at boot goes stale).
# GEO="<lng> <lat>" parks the phone somewhere else (the Forge proof walks it
# to a find); GEO_FILE names a file holding that, re-read every 5 s, so a
# flow's script can move the phone mid-journey.
: "${GEO:=-0.1278 51.5074}"
( while true; do sleep 5; "$here/emu.sh" tunnels >/dev/null 2>&1
    g="$GEO"; [ -n "${GEO_FILE:-}" ] && [ -s "$GEO_FILE" ] && g="$(cat "$GEO_FILE")"
    # shellcheck disable=SC2086
    adb emu geo fix $g >/dev/null 2>&1; done ) &
keeper=$!
adb shell rm -f "/sdcard/jr-$label-*.mp4" /sdcard/jr-stop >/dev/null 2>&1
[ "${REC:-1}" = 0 ] && adb shell touch /sdcard/jr-stop >/dev/null 2>&1
adb shell "i=0; while [ ! -f /sdcard/jr-stop ]; do screenrecord --time-limit 170 --bit-rate 4000000 ${REC_SIZE:+--size $REC_SIZE} /sdcard/jr-$label-\$(printf %02d \$i).mp4 || break; i=\$((i+1)); done" &
rec=$!
sleep 1

start=$(date +%s)
case "$flow" in
  # A driver script instead of a Maestro flow (cq 056): adb taps and
  # screenshots, for screens with a live 3D view, where Maestro's view
  # hierarchy dumps never settle on the software-rendered emulator. It gets
  # SHOTS (its screenshot folder) and MAESTRO (for any plain-UI part).
  *.sh) SHOTS="$OUT/$label" MAESTRO="$MAESTRO" bash "$here/$flow" > "$OUT/$label.maestro.log" 2>&1 ;;
  *) "$MAESTRO" test --format junit --output "$OUT/$label/report.xml" \
       --debug-output "$OUT/$label" --flatten-debug-output --test-output-dir "$OUT/$label" ${ANDROID_SERIAL:+--device "$ANDROID_SERIAL"} ${MAESTRO_ARGS:-} "$here/$flow" > "$OUT/$label.maestro.log" 2>&1 ;;
esac
status=$?
secs=$(( $(date +%s) - start ))

# Stop the recorder: tell the on-phone loop not to start another segment,
# then SIGINT the running screenrecord so it finishes the file, and wait for
# the loop to end (killing adb first would cut the file off unfinished).
adb shell touch /sdcard/jr-stop
adb shell 'for p in $(pidof screenrecord); do kill -INT $p; done' >/dev/null 2>&1
for _ in $(seq 1 20); do kill -0 "$rec" 2>/dev/null || break; sleep 1; done
kill "$rec" 2>/dev/null
kill "$keeper" 2>/dev/null
sleep 1
tmp="$OUT/$label/segments"
mkdir -p "$tmp"
for f in $(adb shell ls "/sdcard/jr-$label-*.mp4" 2>/dev/null | tr -d '\r'); do
  adb pull "$f" "$tmp/" >/dev/null && adb shell rm -f "$f"
done
ls "$tmp"/*.mp4 >/dev/null 2>&1 && {
  for f in "$tmp"/*.mp4; do echo "file '$f'"; done > "$tmp/list.txt"
  # Task 059: on a starved machine this join could spin for 20+ min; give up
  # after 5 (the segments are kept in $tmp.kept for a later encode).
  timeout -k 10 300 ffmpeg -loglevel error -y -f concat -safe 0 -i "$tmp/list.txt" \
    -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
    -map 0:v -map 1:a -c:v libx264 -preset veryfast -crf "${VIDEO_CRF:-30}" -vf "scale=${VIDEO_W:-540}:-2" \
    -c:a aac -shortest "$VIDEOS/$label.mp4"
  [ -s "$VIDEOS/$label.mp4" ] && rm -rf "$tmp" || mv "$tmp" "$tmp.kept"
}
result=$([ $status = 0 ] && echo PASS || echo FAIL)
echo "$label $result ${secs}s" | tee -a "$OUT/results.txt"
exit $status
