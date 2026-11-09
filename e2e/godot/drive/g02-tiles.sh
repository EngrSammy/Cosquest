# cq 061 proof 2 (adb driver): the Godot fight with a public 3D Tileset streamed
# into the scene by the 3D Tiles for Godot GDExtension (cesium-native), built for
# Android. The tileset (CesiumGS 3d-tiles-samples TilesetWithDiscreteLOD, the
# "dragon", 3 LODs, no key) is served from this machine (game3d/tools/tiles-android/
# serve-tiles.sh on :8700, adb reverse). keep=1: one engine per app process
# (the extension cannot be re-initialised in a second engine instance).
source "$(dirname "$0")/../../forge/drive/lib.sh"
H="$(cd "$(dirname "$0")/.." && pwd)"
: "${TILES_PORT:=8700}"
adb reverse tcp:$TILES_PORT tcp:$TILES_PORT >/dev/null
tmp=$(mktemp -d); python3 "$H/mkevents.py" "$tmp" >/dev/null
adb shell mkdir -p /data/local/tmp/cqlat; adb push "$tmp"/*.bin /data/local/tmp/cqlat/ >/dev/null
url="http%3A%2F%2F127.0.0.1%3A$TILES_PORT%2Fdragon%2Ftileset.json"
adb logcat -c
link "cosquest://fight3d?mode=full\&keep=1\&tiles=$url\&tlat=40.04253061\&tlon=-75.61209431\&talt=503\&tground=0"
for i in 1 2 3 4 5 6; do sleep 3; shot "g02-1-open-$i"; done
adb shell "cd /data/local/tmp/cqlat; E=/dev/input/event2
  cat down.bin > \$E; sleep 0.1; cat left_push.bin > \$E; sleep 1.5; cat up.bin > \$E; sleep 0.3
  cat down.bin > \$E; sleep 0.1; cat up_push.bin > \$E; sleep 1.5; cat up.bin > \$E
  i=0; while [ \$i -lt 60 ]; do
    logcat -d -s godot -t 40 | grep -q 'CQ fight_end' && break
    if [ \$((i % 24)) = 3 ]; then cat skill_down.bin > \$E; sleep 0.1; cat up.bin > \$E; fi
    cat atk_down.bin > \$E; sleep 0.08; cat atk_up.bin > \$E; sleep 0.17; i=\$((i+1)); done" &
p=$!
for i in 1 2 3 4 5 6 7 8; do sleep 3; shot "g02-2-fight-$i"; done
wait $p
wait_s 20
shot g02-3-end
alive
