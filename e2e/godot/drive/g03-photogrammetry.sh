# cq 061 proof 3 (adb driver): the Godot fight standing on real textured photogrammetry streamed as
# 3D Tiles (NASA-AMMOS 3DTilesSampleData msl-dingo-gap, Mars rover terrain, JPEG textures,
# 5,149 tiles; ext/tiles-serve/dingo_z.json is its tileset.json with gltfUpAxis "Z" and
# paths fixed), served from this machine (game3d/tools/tiles-android/
# serve-tiles.sh on :8700, adb reverse). keep=1: one engine per app process
# (the extension cannot be re-initialised in a second engine instance).
source "$(dirname "$0")/../../forge/drive/lib.sh"
H="$(cd "$(dirname "$0")/.." && pwd)"
: "${TILES_PORT:=8700}"
adb reverse tcp:$TILES_PORT tcp:$TILES_PORT >/dev/null
tmp=$(mktemp -d); python3 "$H/mkevents.py" "$tmp" >/dev/null
adb shell mkdir -p /data/local/tmp/cqlat; adb push "$tmp"/*.bin /data/local/tmp/cqlat/ >/dev/null
url="http%3A%2F%2F127.0.0.1%3A$TILES_PORT%2Fdingo_z.json"
adb logcat -c
link "cosquest://fight3d?mode=full\&keep=1\&tiles=$url\&tlat=0\&tlon=0\&talt=0\&tground=1\&tsse=16\&torigin=1\&trotx=180"
for i in 1 2 3 4 5 6; do sleep 3; shot "g03-1-open-$i"; done
adb shell "cd /data/local/tmp/cqlat; E=/dev/input/event2
  cat down.bin > \$E; sleep 0.1; cat left_push.bin > \$E; sleep 1.5; cat up.bin > \$E; sleep 0.3
  cat down.bin > \$E; sleep 0.1; cat up_push.bin > \$E; sleep 1.5; cat up.bin > \$E
  i=0; while [ \$i -lt 60 ]; do
    logcat -d -s godot -t 40 | grep -q 'CQ fight_end' && break
    if [ \$((i % 24)) = 3 ]; then cat skill_down.bin > \$E; sleep 0.1; cat up.bin > \$E; fi
    cat atk_down.bin > \$E; sleep 0.08; cat atk_up.bin > \$E; sleep 0.17; i=\$((i+1)); done" &
p=$!
for i in 1 2 3 4 5 6 7 8; do sleep 3; shot "g03-2-fight-$i"; done
wait $p
wait_s 20
shot g03-3-end
alive
