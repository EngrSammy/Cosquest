#!/usr/bin/env python3
"""The cq 234 fixture packs, in costquest-backend tools/forge_import.py's format:

  - the eight cast characters from cq 060 (NOT Commando, Blade, Killua, P-Mon):
    the rigged A-pose set (idle/walk/celebrate) for the seven that rig, Hoof's
    static deck-pose model; roles: Hoof the Guardian, Elvis the boss, the rest
    heroes (wearable); the deck picture as the thumbnail;
  - the nine default weapons (build_weapons.py's packs, copied as they are);
  - optionally the untextured placeholder Ember Blade v1 (staging's, fetched
    once by cq 056) to prove it is hidden: --placeholder.

  python3 e2e/forge/make_cast_packs.py <out_dir> --models <cq060 models dir copy>
      --weapons <build_weapons out>/packs [--placeholder <staging-src/ember_blade>]
"""
import argparse
import json
import pathlib
import shutil
import struct
import subprocess

ap = argparse.ArgumentParser()
ap.add_argument("out")
ap.add_argument("--models", required=True, help="dir with pose/<slug>/ and deck/<slug>/ (lod0-2.glb, rig.json, concept.png)")
ap.add_argument("--weapons", required=True, help="build_weapons.py's <out>/packs")
ap.add_argument("--placeholder", default=None, help="staging-src/ember_blade (catalogue-entry.json + lods)")
a = ap.parse_args()
OUT, M, W = pathlib.Path(a.out), pathlib.Path(a.models), pathlib.Path(a.weapons)

# slug, display name, role, set
CAST = [
    ("armstrong", "Armstrong", "hero", "pose"),
    ("bobo", "Bobo", "hero", "pose"),
    ("catboy", "Cat-Boy", "hero", "pose"),
    ("crystalz", "Crystal-Z", "hero", "pose"),
    ("nebulx", "Nebul-X", "hero", "pose"),
    ("vanessa", "Vanessa", "hero", "pose"),
    ("elvis", "Elvis", "boss", "pose"),
    ("hoof", "Hoof", "guardian", "deck"),
]


def glb_bounds(p: pathlib.Path):
    """[[min],[max]] of every POSITION accessor (glTF space, metres)."""
    b = p.read_bytes()
    n = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20:20 + n])
    lo, hi = [1e9] * 3, [-1e9] * 3
    for m in j.get("meshes", []):
        for prim in m["primitives"]:
            acc = j["accessors"][prim["attributes"]["POSITION"]]
            lo = [min(x, y) for x, y in zip(lo, acc["min"])]
            hi = [max(x, y) for x, y in zip(hi, acc["max"])]
    return [[round(x, 4) for x in lo], [round(x, 4) for x in hi]]


OUT.mkdir(parents=True, exist_ok=True)
for slug, name, role, kind in CAST:
    src = M / kind / slug
    d = OUT / f"cast_{slug}"
    if d.exists():
        shutil.rmtree(d)
    d.mkdir()
    for lod in (0, 1, 2):
        shutil.copy(src / f"lod{lod}.glb", d / f"{slug}__lod{lod}.glb")
    if (src / "concept.png").is_file():
        subprocess.run(["convert", str(src / "concept.png"), "-resize", "512x512", str(d / f"{slug}__thumb.png")], check=True)
    rig = json.loads((src / "rig.json").read_text()) if (src / "rig.json").is_file() else {}
    rigged = bool(rig.get("rigged")) and kind == "pose"
    pack = {
        "type": "character", "name": name, "role": role, "rarity": "epic" if role != "hero" else "rare", "realm": None,
        "bounds_m": glb_bounds(src / "lod0.glb"),
        "rigged": rigged, "skeleton": rig.get("skeleton") if rigged else None,
        "animations": [{k: c[k] for k in ("name", "duration_s", "loop")} for c in rig.get("animations", [])] if rigged else [],
        "material": {"base_colour": "jpeg", "normals": True, "occlusion": False, "normal_map": False},
        "source": f"cq060 {kind} set {slug} (deck character; weapons in hand per app/game3d/data/attach.json)",
    }
    (d / "pack.json").write_text(json.dumps(pack, indent=1))
    print(d.name, role, "rigged" if rigged else "static")

for w in sorted(W.iterdir()):
    if (w / "pack.json").is_file():
        d = OUT / f"weapon_{w.name}"
        if d.exists():
            shutil.rmtree(d)
        shutil.copytree(w, d)
        print(d.name)

if a.placeholder:
    src = pathlib.Path(a.placeholder)
    e = json.loads((src / "catalogue-entry.json").read_text())
    d = OUT / "placeholder_ember_blade"
    if d.exists():
        shutil.rmtree(d)
    d.mkdir()
    for f in src.iterdir():
        if f.suffix in (".glb", ".usdz", ".png"):
            shutil.copy(f, d / f.name)
    pack = {"type": "weapon", "name": e["name"], "rarity": e.get("rarity") or "rare", "realm": e.get("realm"),
            "bounds_m": e["bounds_m"], "stats": {k: v for k, v in (e.get("stats") or {}).items() if k in ("damage", "range_m", "cooldown_s")},
            "sockets": e.get("sockets"), "rigged": False, "animations": [], "skeleton": None,
            "source": f"staging Ember Blade {e['id']} v{e['version']} (the untextured placeholder, to prove it is hidden)"}
    (d / "pack.json").write_text(json.dumps(pack, indent=1))
    print(d.name, "placeholder")
