#!/usr/bin/env bash
# run.sh <out dir> <project dir> [jobs]: every spec in <out>/spec through the capture rig (capture.gd), on the
# CPU (xvfb + llvmpipe, Compatibility renderer, 720x1280, --fixed-fps 30), a few at a time.
OUT=$(readlink -f $1); P=$(readlink -f $2); J=${3:-5}
R=${RIG:-$HOME/cq-work/look-world-rig}
G=${GODOT:-$R/bin/godotr}
cd $OUT; : > logs/_done.txt
ls spec/*.json | xargs -P $J -I{} bash -c "n=\$(basename {} .json); LP_NUM_THREADS=4 timeout 1200 xvfb-run -a -s \"-screen 0 1080x2340x24\" nice -n 10 $G --path $P --rendering-driver opengl3 --resolution 720x1280 --fixed-fps 30 -- --capture=$OUT/{} > logs/\$n.log 2>&1; echo \"\$n exit=\$?\" >> logs/_done.txt"
echo ALLDONE >> logs/_done.txt
