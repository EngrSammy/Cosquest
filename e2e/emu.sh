#!/usr/bin/env bash
# The Android emulator for the journeys (one at a time on the farm).
#
#   e2e/emu.sh up [apk]     boot the AVD headless, install the APK, tunnel the
#                           local backends, park the phone at Trafalgar Square
#   e2e/emu.sh install apk  reinstall the app
#   e2e/emu.sh down         stop the emulator this script started
#   e2e/emu.sh adb ...      adb against the journeys' emulator
#
# Env: ANDROID_HOME (SDK), AVD [cx054], EMU_MEM [3072], OUT (logs) [e2e/out],
#      EMU_GPU [swiftshader_indirect] (swangle_indirect: ANGLE, for Filament on GL),
#      EMU_PORT (console port, e.g. 5600: adb then only talks to emulator-5600,
#      for a farm where another task's emulator is on the same adb server)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
: "${ANDROID_HOME:=$HOME/cq-work/tools/android-sdk}"
export ANDROID_HOME ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
: "${AVD:=cx054}"
: "${EMU_MEM:=3072}"
: "${OUT:=$here/out}"
mkdir -p "$OUT"
port_arg=""
if [ -n "${EMU_PORT:-}" ]; then
  export ANDROID_SERIAL="emulator-$EMU_PORT"
  port_arg="-port $EMU_PORT"
fi
pidfile="$OUT/emulator.pid"
apk_default="$here/../app/android/app/build/outputs/apk/release/app-release.apk"

# Ports on this machine the app reaches as localhost on the phone.
#   4120 chat backend, 8399 game backend, 7880/7881 LiveKit signalling/TCP.
# TUNNELS maps phone ports to other ports here ("4120:4220 8399:8499 ...")
# when another run already holds 4120/8399 on this machine.
: "${TUNNELS:=4120:4120 8399:8399 7880:7880 7881:7881}"
tunnels() {
  for t in $TUNNELS; do adb reverse "tcp:${t%%:*}" "tcp:${t##*:}" >/dev/null; done
}

case "${1:-}" in
  up)
    apk="${2:-$apk_default}"
    if ! adb get-state >/dev/null 2>&1; then
      nohup sg kvm -c "$ANDROID_HOME/emulator/emulator -avd $AVD -no-window -no-audio -no-boot-anim \
        -gpu ${EMU_GPU:-swiftshader_indirect} -no-snapshot -memory $EMU_MEM -cores 4 $port_arg" > "$OUT/emulator.log" 2>&1 &
      echo $! > "$pidfile"
      echo "emulator launcher pid $(cat "$pidfile")"
    fi
    adb wait-for-device
    for _ in $(seq 1 120); do
      [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ] && break
      sleep 3
    done
    adb shell settings put system screen_off_timeout 1800000
    adb shell settings put global window_animation_scale 0
    adb shell settings put global transition_animation_scale 0
    adb shell settings put global animator_duration_scale 0
    adb emu geo fix -0.1278 51.5074 >/dev/null
    adb install -r -g "$apk" | tail -1
    tunnels
    # A photo in the gallery for the picture journeys (profile, chat media).
    if ! adb shell ls /sdcard/Pictures/selfie.png >/dev/null 2>&1; then
      node -e "process.stdout.write(require('$here/seed/media.js').avatarPng('#C5399A', '#2B2A5A', 800))" > "$OUT/selfie.png"
      adb push "$OUT/selfie.png" /sdcard/Pictures/selfie.png >/dev/null
      adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Pictures/selfie.png >/dev/null
    fi
    ;;
  install)
    adb install -r -g "${2:-$apk_default}" | tail -1
    tunnels
    ;;
  tunnels) tunnels ;;
  down)
    adb emu kill >/dev/null 2>&1 || true
    sleep 5
    if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then kill "$(cat "$pidfile")"; fi
    rm -f "$pidfile"
    ;;
  adb) shift; adb "$@" ;;
  *) sed -n 2,12p "$0"; exit 2 ;;
esac
