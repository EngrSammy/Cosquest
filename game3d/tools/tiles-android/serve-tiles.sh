#!/usr/bin/env bash
# Serve the public sample 3D Tilesets over plain HTTP for the Android emulator.
#   serve-tiles.sh [port]     (default: first free port in 8700-8799)
# Then on the host: adb reverse tcp:PORT tcp:PORT
# and in the app use http://127.0.0.1:PORT/<tileset>.json
# Serve dir layout ($SERVE_DIR, symlinks into the clones under ext/):
#   dingo_georef.json  wrapper placing NASA JPL Dingo Gap photogrammetry at lat 40.0425306, lon -75.6120943, h 0
#   dingo/             NASA-AMMOS/3DTilesSampleData msl-dingo-gap (textured JPEG, KHR_materials_unlit, 5149 b3dm, 180 MB)
#   dragon/tileset.json  CesiumGS/3d-tiles-samples 1.0/TilesetWithDiscreteLOD (untextured, 3 LODs)
set -euo pipefail
SERVE_DIR="${SERVE_DIR:-$HOME/cq-work/game-godot/ext/tiles-serve}"
PORT="${1:-}"
if [ -z "$PORT" ]; then
  for p in $(seq 8700 8799); do
    if ! ss -ltn "( sport = :$p )" | grep -q LISTEN; then PORT=$p; break; fi
  done
fi
[ -n "$PORT" ] || { echo "no free port in 8700-8799" >&2; exit 1; }
echo "serving $SERVE_DIR on 127.0.0.1:$PORT"
echo "  adb reverse tcp:$PORT tcp:$PORT"
echo "  http://127.0.0.1:$PORT/dingo_georef.json"
echo "  http://127.0.0.1:$PORT/dragon/tileset.json"
exec python3 -I -m http.server "$PORT" --bind 127.0.0.1 --directory "$SERVE_DIR"
