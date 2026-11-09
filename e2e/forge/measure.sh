#!/usr/bin/env bash
# Sample the app's memory every 3 s while a flow runs (cq 056 Forge 3D
# measurements): e2e/forge/measure.sh <flow> <label>. Writes
# $OUT/<label>-mem.tsv (seconds, total PSS kB, graphics kB, native heap kB)
# and $OUT/<label>-fps.txt (the [forge-fps] lines from logcat).
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
flow="$1"; label="$2"
P=com.dammy0227.cosquest
adb logcat -c
( t0=$(date +%s); while true; do
    m=$(adb shell dumpsys meminfo $P 2>/dev/null)
    pss=$(echo "$m" | awk '/TOTAL PSS:/ {print $3}')
    gfx=$(echo "$m" | awk '/^ *Graphics:/ {print $2}')
    nat=$(echo "$m" | awk '/^ *Native Heap:/ {print $3}')
    echo -e "$(( $(date +%s) - t0 ))\t${pss:-}\t${gfx:-}\t${nat:-}"
    sleep 3; done ) > "$OUT/$label-mem.tsv" &
sampler=$!
"$here/../journey.sh" "forge/flows/$flow" "$label" | tail -1
kill $sampler
adb logcat -d | grep "forge-fps" > "$OUT/$label-fps.txt"
adb logcat -d | grep -E "lowmemorykiller: Kill '$P" >> "$OUT/$label-fps.txt" || true
