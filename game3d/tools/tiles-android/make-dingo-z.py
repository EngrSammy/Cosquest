#!/usr/bin/env python3
"""Serve-ready copy of the NASA Dingo Gap photogrammetry tileset (cq 061).

NASA-AMMOS/3DTilesSampleData msl-dingo-gap declares "gltfUpAxis": "z" (lower
case), which cesium-native does not read as Z, so the terrain stood on its side.
This writes <serve>/dingo_z.json: the same tileset with "Z" and every content
path prefixed with dingo/ (the symlink serve-tiles.sh serves). Used by
e2e/godot/drive/g03-photogrammetry.sh with the plugin's True Origin mode and the
tileset node turned 180 degrees about X (torigin=1, trotx=180).

  make-dingo-z.py [serve_dir]   (default ~/cq-work/game-godot/ext/tiles-serve)
"""
import json
import os
import sys

serve = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/cq-work/game-godot/ext/tiles-serve")
src = os.path.join(serve, "dingo", "0528_0260184_to_s64o256_tileset.json")
t = json.load(open(src))
t["asset"]["gltfUpAxis"] = "Z"
count = 0


def fix(node):
    global count
    c = node.get("content")
    if c:
        key = "uri" if "uri" in c else "url"
        c[key] = "dingo/" + c[key]
        count += 1
    for ch in node.get("children", []):
        fix(ch)


fix(t["root"])
with open(os.path.join(serve, "dingo_z.json"), "w") as f:
    json.dump(t, f)
print(f"wrote {serve}/dingo_z.json ({count} tiles)")
