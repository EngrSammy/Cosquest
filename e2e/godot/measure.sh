#!/usr/bin/env bash
# Cost of the Godot fight on the emulator (cq 061): app memory (PSS) and Godot's
# frame times per scene, each from a fresh app process.
#
#   e2e/godot/measure.sh [label]     (source the rig env; app installed, signed in)
#
# Scenes: map (no Godot), arena (Godot, arena only), chars (+ 3 Forge characters),
# full (the fight with FX), tiles (full + the 3D Tiles dragon, TILES_PORT served).
# Per scene: open, wait SETTLE s, sample PSS every 2 s for SAMPLE s; Godot's
# CQPERF lines (fps, frame-time percentiles) over the same window.
# Writes $OUT/measure-<label>.tsv and prints a summary.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
label="${1:-run}"; : "${SETTLE:=15}"; : "${SAMPLE:=20}"; : "${TILES_PORT:=8700}"
APP=com.dammy0227.cosquest
out="$OUT/measure-$label.tsv"
echo -e "scene\tpss_mb_median\tpss_mb_max\tnative_mb\tgfx_mb\tfps_median\tft_p50_ms\tft_p95_ms\tft_p99_ms\tdraws" > "$out"
tiles="http%3A%2F%2F127.0.0.1%3A$TILES_PORT%2Fdragon%2Ftileset.json\&tlat=40.04253061\&tlon=-75.61209431\&talt=503\&tground=0"
adb reverse tcp:$TILES_PORT tcp:$TILES_PORT >/dev/null
for scene in map arena chars full tiles; do
  adb shell am force-stop $APP; sleep 2
  adb shell monkey -p $APP 1 >/dev/null 2>&1; sleep 20
  "$here/../emu.sh" tunnels >/dev/null 2>&1
  adb logcat -c
  case $scene in
    map) adb shell am start -a android.intent.action.VIEW -d "cosquest://play" $APP >/dev/null ;;
    tiles) adb shell am start -a android.intent.action.VIEW -d "cosquest://fight3d?mode=full\&tiles=$tiles" $APP >/dev/null ;;
    *) adb shell am start -a android.intent.action.VIEW -d "cosquest://fight3d?mode=$scene" $APP >/dev/null ;;
  esac
  sleep "$SETTLE"
  "$here/memwatch.sh" "$OUT/mem-$label-$scene.tsv" "$SAMPLE" 2
  adb logcat -d | grep CQPERF > "$OUT/perf-$label-$scene.txt"
  adb exec-out screencap -p > "$OUT/measure-$label-$scene.png"
  python3 - "$OUT/mem-$label-$scene.tsv" "$OUT/perf-$label-$scene.txt" "$scene" >> "$out" <<'PY'
import re, statistics, sys
rows = [l.split("\t") for l in open(sys.argv[1]).read().splitlines()[1:] if l.strip()]
pss = [float(r[1]) for r in rows if float(r[1]) > 0]
nat = [float(r[2]) for r in rows]; gfx = [float(r[3]) for r in rows]
perf = [dict(re.findall(r"(\w+)=([\d.]+)", l)) for l in open(sys.argv[2])]
perf = perf[-8:]
def med(k): 
    v = [float(p[k]) for p in perf if k in p]
    return f"{statistics.median(v):.1f}" if v else "-"
print("\t".join([sys.argv[3], f"{statistics.median(pss):.0f}" if pss else "-", f"{max(pss):.0f}" if pss else "-",
                 f"{statistics.median(nat):.0f}" if nat else "-", f"{statistics.median(gfx):.0f}" if gfx else "-",
                 med("fps"), med("ft_p50"), med("ft_p95"), med("ft_p99"), med("draws")]))
PY
  tail -1 "$out"
done
adb shell am force-stop $APP
column -t "$out"
