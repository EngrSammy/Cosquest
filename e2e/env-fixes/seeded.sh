#!/usr/bin/env bash
# seeded.sh <tag> <game3d dir>: the cq 019 seeded review fights (e2e/game-depth/seeded.sh: lat_cfg, idle_cfg,
# f1hoof_cfg) plus the Trafalgar place fight (lat_place), headless at --fixed-fps 30; CQRESULT without
# load_ms and the judge log (kept beside it), then the judge test (rules id pinned f3d-1-21d2cde61ab2)
W=/home/engineer/cq-work/019-game-depth-scope-and-build
export PATH=$W/bin:$PATH
L=/home/engineer/cq-work/env-fixes-1-4/seeded; mkdir -p $L
tag=$1; P=$2
for c in lat_cfg idle_cfg f1hoof_cfg lat_place; do
  (cd $P && timeout 900 capped 2500M godotr --headless --path . --fixed-fps 30 -- --autotest --config=$W/cap/$c.json 2>&1 | grep -E "^CQRESULT" > $L/${tag}_$c.raw)
  python3 -c "
import json,sys
l=open(sys.argv[1]).read().strip()
if not l: print(\"\"); sys.exit()
r=json.loads(l[len(\"CQRESULT \"):]); j=r.pop(\"judge\",None); r.pop(\"load_ms\",None)
json.dump(j,open(sys.argv[1][:-4]+\".judge.json\",\"w\"),sort_keys=True)
print(\"CQRESULT \"+json.dumps(r,sort_keys=True,separators=(\",\",\":\")))" $L/${tag}_$c.raw > $L/${tag}_$c.log
  echo "$tag $c: $(cut -c1-300 $L/${tag}_$c.log)"
done
(cd $P && timeout 900 godotr --headless --path . --fixed-fps 30 -s res://tests/judge_test.gd 2>&1 | grep -E "^CQTEST" > $L/${tag}_judge_test.log)
cat $L/${tag}_judge_test.log
