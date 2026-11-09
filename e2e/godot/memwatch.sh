#!/usr/bin/env bash
# Sample the app's memory (PSS and RSS, MB) every INTERVAL s until killed or for SECS s (cq 061).
#   e2e/godot/memwatch.sh OUTFILE [SECS] [INTERVAL]
# Columns: unix time, total PSS MB, native heap PSS MB, graphics PSS MB, RSS MB.
set -uo pipefail
out="$1"; secs="${2:-600}"; iv="${3:-2}"
APP=com.dammy0227.cosquest
end=$(( $(date +%s) + secs ))
echo -e "t\tpss_mb\tnative_mb\tgfx_mb\trss_mb" > "$out"
while [ "$(date +%s)" -lt "$end" ]; do
  m=$(adb shell dumpsys meminfo $APP 2>/dev/null)
  pss=$(echo "$m" | awk '/TOTAL PSS:/ {print $3; exit} /^ +TOTAL +[0-9]/ {print $2; exit}')
  nat=$(echo "$m" | awk '/^ +Native Heap +[0-9]/ {print $3; exit}')
  gfx=$(echo "$m" | awk '/^ +Graphics: +[0-9]/ {print $2; exit}')
  rss=$(echo "$m" | awk '/TOTAL RSS:/ {print $6; exit}')
  printf "%s\t%.1f\t%.1f\t%.1f\t%.1f\n" "$(date +%s)" "$(( ${pss:-0} ))e-3" "$(( ${nat:-0} ))e-3" "$(( ${gfx:-0} ))e-3" "$(( ${rss:-0} ))e-3" >> "$out"
  sleep "$iv"
done
