#!/usr/bin/env bash
# Run every journey (or the ones named) on a clean world each, recorded.
#
#   e2e/run-all.sh before                 # all of maestro/[0-9]*.yaml
#   e2e/run-all.sh after 03-dms-groups 07-calls
#
# Results: $OUT/results-<run>.txt (one "label PASS|FAIL secs" per journey),
# videos in $VIDEOS (default $OUT/videos), Maestro output in $OUT/<label>/.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
: "${OUT:=$here/out}"
export OUT
run="${1:?run name, e.g. before or after}"; shift
if [ $# -gt 0 ]; then flows=("$@"); else flows=($(cd "$here/maestro" && ls [0-9]*.yaml | sed 's/\.yaml$//')); fi
results="$OUT/results-$run.txt"
: > "$results"
for f in "${flows[@]}"; do
  "$here/reset.sh" >/dev/null || { echo "$run-$f FAIL reset" | tee -a "$results"; continue; }
  line=$("$here/journey.sh" "maestro/$f.yaml" "$run-$f" | tail -1)
  echo "$line" | tee -a "$results"
done
echo "== $(grep -c PASS "$results") of ${#flows[@]} passed ($results)"
