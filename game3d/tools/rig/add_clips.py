"""Embed clips from a character's clip library in its own GLB (cq 014), so a rig made here (Hoof)
carries idle / walk / celebrate like cq 060's rigs: the Forge's publish check wants an idle clip in
a rigged character, and a viewer without the game's clip libraries can still play them.

  $BLENDER_PY add_clips.py --lib anim/hoof.glb --glb <rig lod0.glb> [--glb ...] \
      --map idle=2H_Melee_Idle walk=Walking_B celebrate=Cheer

Channels are matched to the GLB's nodes by bone name; nothing else in the file changes."""
import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "anim"))
from gltf import Glb, write_glb  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lib", required=True)
    ap.add_argument("--glb", nargs="+", required=True)
    ap.add_argument("--map", nargs="+", required=True)
    a = ap.parse_args()
    lib = Glb(a.lib)
    want = dict(x.split("=", 1) for x in a.map)
    src = {an["name"]: an for an in lib.json.get("animations", [])}
    for path in a.glb:
        g = Glb(path)
        j = json.loads(json.dumps(g.json))
        binb = bytearray(g.bin)
        by_name = {g.names[i]: i for i in range(len(g.nodes))}
        anims = [x for x in j.get("animations", []) if x["name"] not in want]

        def add(arr, typ, minmax=False):
            arr = np.ascontiguousarray(arr, dtype=np.float32)
            while len(binb) % 4:
                binb.append(0)
            off = len(binb)
            binb.extend(arr.tobytes())
            j["bufferViews"].append({"buffer": 0, "byteOffset": off, "byteLength": arr.nbytes})
            acc = {"bufferView": len(j["bufferViews"]) - 1, "componentType": 5126, "count": int(arr.shape[0]), "type": typ}
            if minmax:
                acc["min"] = [float(arr.min())]
                acc["max"] = [float(arr.max())]
            j["accessors"].append(acc)
            return len(j["accessors"]) - 1

        for name, clip in want.items():
            an = src[clip]
            samplers, channels = [], []
            for c in an["channels"]:
                s = an["samplers"][c["sampler"]]
                node = by_name[lib.names[c["target"]["node"]]]
                tin = lib.accessor(s["input"])
                out = lib.accessor(s["output"])
                samplers.append({"input": add(tin, "SCALAR", True), "output": add(out, "VEC4" if out.shape[1] == 4 else "VEC3"),
                                 "interpolation": s.get("interpolation", "LINEAR")})
                channels.append({"sampler": len(samplers) - 1, "target": {"node": node, "path": c["target"]["path"]}})
            anims.append({"name": name, "samplers": samplers, "channels": channels})
        j["animations"] = anims
        j["buffers"][0]["byteLength"] = len(binb)
        write_glb(path, j, bytes(binb))
        print("CLIPS", path, sorted(want))


if __name__ == "__main__":
    main()
