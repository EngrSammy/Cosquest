#!/usr/bin/env bash
# rec_run.sh <out.mp4> <godot args...>: run Godot on this X display in real time and record the
# 720x1280 window with ffmpeg (x11grab, 30 fps). Meant to run inside xvfb-run.
out=$1; shift
ffmpeg -loglevel error -y -f x11grab -draw_mouse 0 -framerate 30 -video_size 720x1280 -i "$DISPLAY+0,0" -c:v libx264 -preset ultrafast -crf 22 -pix_fmt yuv420p "$out" &
rec=$!
/home/engineer/cq-work/019-game-depth-scope-and-build/bin/godotr "$@"
code=$?
kill -INT $rec; wait $rec 2>/dev/null
exit $code
