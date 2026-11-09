#!/usr/bin/env bash
# run.sh <out dir> <project dir>: every spec in <out>/spec through the capture rig (the env-audit run.sh)
export PATH=$HOME/bin:$PATH
G=/home/engineer/cq-work/016-game-quality-r3-polish/tools/godot451/Godot_v4.5.1-stable_linux.x86_64
OUT=$1; P=$2
cd $OUT; : > logs/_done.txt
for s in spec/*.json; do n=$(basename $s .json)
  timeout 900 xvfb-run -a -s "-screen 0 1080x2340x24" nice -n 10 $G --path $P --rendering-driver opengl3 --resolution 720x1280 --fixed-fps 30 -- --capture=$PWD/$s > logs/$n.log 2>&1
  echo "$n exit=$?" >> logs/_done.txt
done
echo ALLDONE >> logs/_done.txt
