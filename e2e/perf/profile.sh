#!/usr/bin/env bash
# Phone profiles for the polish measurements, on the 1440x3120 (560 dpi)
# emulator (AVD cx058, gesture navigation, edge to edge):
#
#   e2e/perf/profile.sh small        720x1280 at 320 dpi = 360x640 dp (~5")
#   e2e/perf/profile.sh large        1440x3120 at 560 dpi = 411x891 dp, tall 20:9
#   e2e/perf/profile.sh large-a11y   large + font scale 1.3 + display size
#                                    "Largest" (720 dpi = 320x693 dp, the top
#                                    step Settings offers on this screen)
#   e2e/perf/profile.sh game-ref     1440x3120 at 420 dpi = 549x1189 dp: the game's
#                                    before/after reference (the old map
#                                    crashed above ~450 dpi, see mapRaster.ts)
#   e2e/perf/profile.sh show
set -euo pipefail
: "${ANDROID_HOME:=$HOME/cq-work/tools/android-sdk}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
[ -n "${EMU_PORT:-}" ] && export ANDROID_SERIAL="emulator-$EMU_PORT"
gesture() { adb shell cmd overlay enable-exclusive --category com.android.internal.systemui.navbar.gestural >/dev/null 2>&1 || true; }
case "${1:-show}" in
  small)      adb shell wm size 720x1280; adb shell wm density 320; adb shell settings put system font_scale 1.0; gesture ;;
  large)      adb shell wm size reset;    adb shell wm density reset; adb shell settings put system font_scale 1.0; gesture ;;
  large-a11y) adb shell wm size reset;    adb shell wm density 720;   adb shell settings put system font_scale 1.3; gesture ;;
  game-ref)   adb shell wm size reset;    adb shell wm density 420;   adb shell settings put system font_scale 1.0; gesture ;;
  show) ;;
  *) sed -n 2,15p "$0"; exit 2 ;;
esac
echo "$(adb shell wm size | tail -1 | tr -d '\r'), $(adb shell wm density | tail -1 | tr -d '\r'), font_scale $(adb shell settings get system font_scale | tr -d '\r')"
