#!/usr/bin/env bash
# lat.sh <cfg.json> <label>: one real-time autoplay fight (no fixed fps) on llvmpipe with one raster
# thread (cq 016's measurement); keeps CQPERF/CQRESULT in logs/lat/lat_<label>.log
W=/home/engineer/cq-work/019-game-depth-scope-and-build
export PATH=$W/bin:$PATH LP_NUM_THREADS=1
mkdir -p $W/logs/lat
out=$W/logs/lat/lat_$2.log
echo "uptime: $(uptime)" > "$out"
cd $W/${TREE:-app}/app/game3d && timeout 900 nice -n 5 xvfb-run -a -s "-screen 0 1080x2340x24" godotr --path . --rendering-driver opengl3 --resolution 720x1280 -- --autotest --config=$1 >> "$out" 2>&1
grep -E "^CQRESULT" "$out" | cut -c1-120
