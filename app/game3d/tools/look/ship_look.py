#!/usr/bin/env python3
"""Ship the cast's cleaned textures (cq 239) the way cq 014 shipped its rigs, without a Forge
submission, and write each character as a contract-2 Forge pack for Subomi's approval.

  python ship_look.py --looks <retex out dir: <key>/lod0..2.glb> --orig <key>=<cq 060 catalogue dir> ...
                      [--packs <out dir> --base <dir with cast_<key>/pack.json + <key>__thumb.png>]

- the metallic-roughness image is re-encoded as JPEG (q92, 4:4:4): the cleaned map has no fine
  detail, and it was the bigger half of every file as a PNG (APK size);
- smooth shading normals (normals.py, crease 55 deg): the lift's split normals shaded as facets;
- app/game3d/cast/<key>_lod<n>.glb: the new files (cq 014's fixed rig + the new textures for
  Armstrong, Bobo, Crystal-Z, Elvis, Hoof; cq 060's own rig + the new textures for Cat-Boy,
  Nebul-X and Vanessa);
- app/game3d/data/rig_fixes.json: sha256 of each cq 060 catalogue file -> its new file
  (char_loader.gd rig_fix: only those exact files are swapped; a newer Forge version loads as it is).
"""
import argparse
import hashlib
import io
import json
import os
import shutil
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
import glbio  # noqa: E402
import normals  # noqa: E402

RIGGED_014 = {"armstrong", "bobo", "crystalz", "elvis", "hoof"}


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def mr_to_jpeg(src, dst, q=92):
    g = glbio.Glb(src)
    data = g.image_bytes(1)
    if data[:4] == b"\x89PNG":
        im = Image.open(io.BytesIO(data)).convert("RGB")
        b = io.BytesIO()
        im.save(b, "JPEG", quality=q, subsampling=0, optimize=True)
        g.replace_images({1: b.getvalue()})
        g.json["images"][1]["mimeType"] = "image/jpeg"
    g.save(dst)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--looks", required=True)
    ap.add_argument("--orig", nargs="+", required=True)
    ap.add_argument("--packs", default="")
    ap.add_argument("--base", default="")
    ap.add_argument("--crease", type=float, default=55.0, help="normals.py smoothing (0 = keep the lift's normals)")
    a = ap.parse_args()
    fx_path = os.path.join(GAME, "data", "rig_fixes.json")
    old = json.load(open(fx_path))["files"]
    fixes = {}
    for spec in a.orig:
        key, d = spec.split("=", 1)
        for lod in range(3):
            orig = os.path.join(d, "lod%d.glb" % lod)
            dst = os.path.join(GAME, "cast", "%s_lod%d.glb" % (key, lod))
            mr_to_jpeg(os.path.join(a.looks, key, "lod%d.glb" % lod), dst)
            if a.crease > 0:
                normals.apply(dst, dst, a.crease)
            with open(dst + ".import", "w") as f:
                f.write('[remap]\n\nimporter="keep"\n')
            s = sha(orig)
            prev = old.get(s, {})
            fixes[s] = {"key": key, "lod": lod, "glb": "res://cast/%s_lod%d.glb" % (key, lod), "sha256": sha(dst),
                        "from": prev.get("from", "cq 060 %s/lod%d.glb" % ("/".join(d.rstrip("/").split("/")[-2:]), lod)),
                        "look": "cq 239 textures (tools/look)" + (" on cq 014's rig" if key in RIGGED_014 else " on cq 060's rig")}
        if a.packs:
            write_pack(key, a.packs, a.base)
    out = {"_doc": "cq 014 + cq 239: the cast files cq 060 published to the Forge catalogue (sha256) -> the same model with "
                   "cq 014's fixed rig (Armstrong, Bobo, Crystal-Z, Elvis, Hoof) and cq 239's cleaned textures and painted "
                   "faces (all 8), shipped in res://cast/ (char_loader.gd rig_fix). Written by tools/rig/ship.py, then "
                   "tools/look/ship_look.py; see docs/game3d/RIGS.md and CHARACTERS.md.",
           "files": dict(sorted(fixes.items(), key=lambda kv: (kv[1]["key"], kv[1]["lod"])))}
    json.dump(out, open(fx_path, "w"), indent=1)
    print("SHIPPED", len(fixes), "files", "packs" if a.packs else "")


def write_pack(key, packs, base_dir):
    bp = os.path.join(base_dir, "cast_" + key)
    base = json.load(open(os.path.join(bp, "pack.json")))
    pd = os.path.join(packs, "cast_" + key)
    os.makedirs(pd, exist_ok=True)
    for lod in range(3):
        shutil.copyfile(os.path.join(GAME, "cast", "%s_lod%d.glb" % (key, lod)), os.path.join(pd, "%s__lod%d.glb" % (key, lod)))
    th = os.path.join(bp, key + "__thumb.png")
    if os.path.exists(th):
        shutil.copyfile(th, os.path.join(pd, key + "__thumb.png"))
    g = glbio.Glb(os.path.join(pd, "%s__lod0.glb" % key))
    anims = []
    for x in g.json.get("animations", []):
        dur = max(float(g.accessor(s["input"]).max()) for s in x["samplers"])
        anims.append({"name": x["name"], "duration_s": round(dur, 3), "loop": x["name"] != "celebrate"})
    pack = dict(base)
    pack.update({"rigged": True, "skeleton": "humanoid-mixamo", "animations": anims or base.get("animations", []),
                 "material": {"base_colour": "jpeg", "metallic_roughness": "jpeg", "normals": True, "occlusion": False, "normal_map": False},
                 "source": "cq239 look pass on the cq060 %s model: same meshes, UVs%s; cleaned base colour, face painted from "
                           "the concept, metal only where gold/silver (app/game3d/tools/look)" %
                           (key, ", skeleton and weights as cq014's rig fix" if key in RIGGED_014 else " and cq060's rig")})
    json.dump(pack, open(os.path.join(pd, "pack.json"), "w"), indent=1)
    with open(os.path.join(pd, "SHA256SUMS"), "w") as f:
        for fn in sorted(os.listdir(pd)):
            if fn != "SHA256SUMS":
                f.write("%s  %s\n" % (sha(os.path.join(pd, fn)), fn))


if __name__ == "__main__":
    main()
