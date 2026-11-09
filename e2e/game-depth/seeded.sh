#!/usr/bin/env bash
# seeded.sh <tag> <tree...>: the three seeded headless fights (--fixed-fps 30); CQRESULT per tree,
# load_ms and the judge log stripped (the fight's own numbers only), the judge log kept beside it
W=/home/engineer/cq-work/019-game-depth-scope-and-build
export PATH=$W/bin:$PATH
L=$W/logs/seeded; mkdir -p $L
tag=$1; shift
for p in "$@"; do
  for c in lat_cfg idle_cfg f1hoof_cfg; do
    (cd $W/$p/app/game3d && timeout 900 capped 2500M godotr --headless --path . --fixed-fps 30 -- --autotest --config=$W/cap/$c.json 2>&1 | grep -E "^CQRESULT" > $L/${tag}_${p}_$c.raw)
    python3 -c '
import json,sys
l=open(sys.argv[1]).read().strip()
if not l: print(""); sys.exit()
r=json.loads(l[len("CQRESULT "):]); r.pop("load_ms",None); r.pop("judge",None)
print("CQRESULT "+json.dumps(r,sort_keys=True,separators=(",",":")))' $L/${tag}_${p}_$c.raw > $L/${tag}_${p}_$c.log
    echo "$p $c: $(cut -c1-400 $L/${tag}_${p}_$c.log)"
  done
done
