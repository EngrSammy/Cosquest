"""Ship the fixed cast rigs (cq 014) the way the cast reaches the game, without a Forge submission.

  $BLENDER_PY ship.py --rigs <dir with <key>/lod0..2.glb> --orig <key>=<cq 060 dir> ... [--packs <out dir>]

The cast reaches the game through the Forge catalogue (cq 056's cache hands Godot a file path);
the catalogue holds cq 060's files. Until the fixed rigs are published there, the game swaps
them in itself:
  - app/game3d/cast/<key>_lod<n>.glb: the fixed rigs, shipped as bytes in the pck
    (importer "keep", export filter cast/*.glb);
  - app/game3d/data/rig_fixes.json: sha256 of each cq 060 catalogue file -> its fixed rig.
    char_loader.gd rig_fix() checks a loaded path against it, so only those exact files are
    swapped (a newer Forge version of the character, rigged or not, loads as it is).
With --packs it also writes each fixed character as a contract-2 Forge pack (pack.json +
<name>__lod0..2.glb, textures embedded, + the thumbnail of the catalogue pack when given with
--thumbs) for a later local import with the backend's tools/forge_import.py.
"""
import argparse
import hashlib
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "anim"))
from gltf import Glb  # noqa: E402

NAMES = {"elvis": ("Elvis", "boss"), "crystalz": ("Crystal-Z", "hero"), "hoof": ("Hoof", "guardian"),
         "bobo": ("Bobo", "hero"), "armstrong": ("Armstrong", "hero")}


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rigs", required=True)
    ap.add_argument("--orig", nargs="+", required=True, help="key=dir of the cq 060 catalogue files")
    ap.add_argument("--packs", default="")
    ap.add_argument("--thumbs", default="", help="dir with cast_<key>/<key>__thumb.png (the catalogue packs)")
    a = ap.parse_args()
    os.makedirs(os.path.join(GAME, "cast"), exist_ok=True)
    fixes = {}
    for spec in a.orig:
        key, d = spec.split("=", 1)
        for lod in ("lod0", "lod1", "lod2"):
            src = os.path.join(a.rigs, key, lod + ".glb")
            orig = os.path.join(d, lod + ".glb")
            dst = os.path.join(GAME, "cast", "%s_%s.glb" % (key, lod))
            shutil.copyfile(src, dst)
            with open(dst + ".import", "w") as f:
                f.write('[remap]\n\nimporter="keep"\n')
            fixes[sha(orig)] = {"key": key, "lod": int(lod[-1]), "glb": "res://cast/%s_%s.glb" % (key, lod), "sha256": sha(dst),
                                "from": "cq 060 %s/%s.glb" % ("/".join(d.rstrip("/").split("/")[-2:]), lod)}
        if a.packs:
            name, role = NAMES.get(key, (key, "hero"))
            base = {}
            bp = os.path.join(a.thumbs, "cast_" + key, "pack.json") if a.thumbs else ""
            if bp and os.path.exists(bp):
                base = json.load(open(bp))          # the catalogue pack's name, role, rarity, realm, stats
                name, role = base.get("name", name), base.get("role", role)
            pd = os.path.join(a.packs, "cast_%s" % key)
            os.makedirs(pd, exist_ok=True)
            g = Glb(os.path.join(a.rigs, key, "lod0.glb"))
            prim = g.json["meshes"][0]["primitives"][0]
            acc = g.json["accessors"][prim["attributes"]["POSITION"]]
            lo, hi = acc.get("min"), acc.get("max")
            if lo is None:
                P = g.accessor(prim["attributes"]["POSITION"])
                lo, hi = P.min(0).tolist(), P.max(0).tolist()
            for lod in ("lod0", "lod1", "lod2"):
                shutil.copyfile(os.path.join(a.rigs, key, lod + ".glb"), os.path.join(pd, "%s__%s.glb" % (key, lod)))
            if a.thumbs and os.path.exists(os.path.join(a.thumbs, "cast_" + key, key + "__thumb.png")):
                shutil.copyfile(os.path.join(a.thumbs, "cast_" + key, key + "__thumb.png"), os.path.join(pd, key + "__thumb.png"))
            anims = [{"name": x["name"], "duration_s": round(max(float(Glb.accessor(g, s["input"]).max()) for s in x["samplers"]), 3),
                      "loop": x["name"] != "celebrate"} for x in g.json.get("animations", [])]
            pack = {"type": "character", "name": name, "role": role, "rarity": base.get("rarity", "epic"), "realm": base.get("realm"),
                    "bounds_m": [[round(float(v), 4) for v in lo], [round(float(v), 4) for v in hi]],
                    "rigged": True, "skeleton": "humanoid-mixamo", "animations": anims,
                    "material": {"base_colour": "jpeg", "normals": True, "occlusion": False, "normal_map": False},
                    **({k: base[k] for k in ("stats", "sockets", "element_id") if k in base}),
                    "source": "cq014 rig fix of the cq060 %s model (same mesh and textures; skeleton, weights and secondary chains by app/game3d/tools/rig)" % key}
            json.dump(pack, open(os.path.join(pd, "pack.json"), "w"), indent=1)
            with open(os.path.join(pd, "SHA256SUMS"), "w") as f:
                for fn in sorted(os.listdir(pd)):
                    if fn != "SHA256SUMS":
                        f.write("%s  %s\n" % (sha(os.path.join(pd, fn)), fn))
    out = {"_doc": "cq 014: the cast files cq 060 published to the Forge catalogue (sha256) -> the same model with the fixed rig, shipped in res://cast/ (char_loader.gd rig_fix). Written by tools/rig/ship.py; see docs/game3d/RIGS.md.",
           "files": dict(sorted(fixes.items(), key=lambda kv: (kv[1]["key"], kv[1]["lod"])))}
    json.dump(out, open(os.path.join(GAME, "data", "rig_fixes.json"), "w"), indent=1)
    print("SHIPPED", len(fixes), "files", "packs" if a.packs else "")


if __name__ == "__main__":
    main()
