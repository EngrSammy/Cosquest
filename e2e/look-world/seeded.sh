#!/usr/bin/env bash
# seeded.sh <tag> <game3d dir>: cq 019's seeded review fights (lat_cfg, idle_cfg, f1hoof_cfg) plus the Trafalgar
# place fight (lat_place), headless at --fixed-fps 30. Writes CQRESULT without load_ms and the judge log beside it,
# then runs the judge test (rules id f3d-1-21d2cde61ab2). Compare two tags with: diff <tagA>_* <tagB>_*.
R=${RIG:-$HOME/cq-work/look-world-rig}
G=${GODOT:-$R/bin/godotr}
L=$R/seeded; mkdir -p $L
tag=$1; P=$(readlink -f $2)
for c in lat_cfg idle_cfg f1hoof_cfg lat_place; do
  (cd $P && timeout 900 $G --headless --path . --fixed-fps 30 -- --autotest --config=$R/cap/$c.json 2>&1 | grep -E "^CQRESULT" > $L/${tag}_$c.raw)
  python3 - "$L/${tag}_$c.raw" > $L/${tag}_$c.log <<'PY'
import json, sys
p = sys.argv[1]
l = open(p).read().strip()
if not l:
    print(""); sys.exit()
r = json.loads(l[len("CQRESULT "):]); j = r.pop("judge", None); r.pop("load_ms", None)
json.dump(j, open(p[:-4] + ".judge.json", "w"), sort_keys=True)
print("CQRESULT " + json.dumps(r, sort_keys=True, separators=(",", ":")))
PY
  echo "$tag $c: $(cut -c1-160 $L/${tag}_$c.log)"
done
(cd $P && timeout 900 $G --headless --path . --fixed-fps 30 -s res://tests/judge_test.gd 2>&1 | grep -E "^CQTEST" > $L/${tag}_judge_test.log)
cat $L/${tag}_judge_test.log
