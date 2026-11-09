#!/usr/bin/env python3
"""Build the drop-in proof's fixture packs (cq 056) in the import format of
costquest-backend tools/forge_import.py: one directory per element holding
pack.json + <slug>__lod{0,1,2}.glb [+ .usdz] [+ <slug>__thumb.png].

Sources (all already on the farm; nothing is generated or lifted here):
  - Forge quality task 057's finished benchmark lifts (FORGE_OUTPUT.md format):
    weapons and environment props from runs/final3, rigged characters
    (idle/walk/celebrate) from runs/rigtest;
  - the four textured stations published on staging, fetched once through the
    public catalogue (staging-src/).

  python3 e2e/forge/make_packs.py <out_dir> [--q057 DIR] [--staging DIR]
"""
import argparse
import json
import pathlib
import shutil

ap = argparse.ArgumentParser()
ap.add_argument("out")
ap.add_argument("--q057", default="/home/engineer/cq-work/costquest/forge-quality/runs")
ap.add_argument("--staging", default="/opt/cq/tasks/056-game-forge-in-world-v2/out/staging-src")
a = ap.parse_args()
OUT, Q, S = pathlib.Path(a.out), pathlib.Path(a.q057), pathlib.Path(a.staging)

# slug, type, display name, rarity, role/stats, source dir, rigged source dir
PACKS = [
    ("katana", "weapon", "Moonlit Katana", "epic", {"stats": {"damage": 18, "range_m": 3.0, "cooldown_s": 3.0, "kind": "blade"}}, Q / "final3/katana_r1", None),
    ("throwing_axe", "weapon", "Storm Throwing Axe", "rare", {"stats": {"damage": 16, "range_m": 4.0, "cooldown_s": 3.5, "kind": "axe"}}, Q / "final3/throwing_axe_r2", None),
    ("star_shield", "weapon", "Star Gauntlet Shield", "legendary", {"stats": {"damage": 12, "range_m": 1.5, "cooldown_s": 3.0, "kind": "gauntlet"}}, Q / "final3/star_shield_r2", None),
    ("street_kid", "character", "Street Kid", "rare", {"role": "hero"}, Q / "final3/street_kid_r1", Q / "rigtest/street_kid_r1"),
    ("armstrong", "character", "Armstrong the Hunter", "epic", {"role": "hero"}, Q / "final3/armstrong", Q / "rigtest/armstrong"),
    ("knight_woman", "character", "Iron Knight", "epic", {"role": "guardian"}, Q / "final3/knight_woman_r1", Q / "rigtest/knight_woman_r1"),
    ("old_samurai", "character", "Old Samurai", "legendary", {"role": "boss"}, Q / "final3/old_samurai_r1", Q / "rigtest/old_samurai_r1"),
    ("ramen_stall", "environment", "Night Ramen Stall", "common", {"stats": {"placement": "backdrop", "radius_m": 8}}, Q / "final3/ramen_stall_r1", None),
    ("stone_well", "environment", "Mossy Stone Well", "common", {"stats": {"placement": "ground", "radius_m": 6}}, Q / "final3/stone_well_r1", None),
]
STATIONS = ["celestial_compass_monument", "chronicle_spire", "chronicle_pillar", "ethereal_waypoint_pillar"]


def bounds_of(src: pathlib.Path):
    for name in ("optimize.json", "finish.json"):
        p = src / name
        if p.is_file():
            b = json.loads(p.read_text()).get("bounds_m")
            if b:
                return b
    return None


OUT.mkdir(parents=True, exist_ok=True)
for slug, etype, name, rarity, extra, src, rig in PACKS:
    d = OUT / slug
    if d.exists():
        shutil.rmtree(d)
    d.mkdir()
    glb_dir = rig or src
    for lod in (0, 1, 2):
        shutil.copy(glb_dir / f"lod{lod}.glb", d / f"{slug}__lod{lod}.glb")
    thumb = src / "views_lod0" / "view_045.png"
    if thumb.is_file():
        shutil.copy(thumb, d / f"{slug}__thumb.png")
    pack = {"type": etype, "name": name, "rarity": rarity, "realm": None,
            "bounds_m": bounds_of(src), "rigged": False, "animations": [], "skeleton": None,
            "material": {"base_colour": "jpeg", "normals": True, "occlusion": False, "normal_map": False},
            "source": f"cq057 {src.name}" + (" (rigged)" if rig else "")}
    pack.update({k: v for k, v in extra.items()})
    if rig:
        r = json.loads((rig / "rig.json").read_text())
        pack.update(rigged=bool(r.get("rigged")), skeleton=r.get("skeleton"),
                    animations=[{k: c[k] for k in ("name", "duration_s", "loop")} for c in r.get("animations", [])])
    (d / "pack.json").write_text(json.dumps(pack, indent=1))
    print(slug, etype, sorted(p.name for p in d.iterdir()))

for slug in STATIONS:
    src = S / slug
    if not src.is_dir():
        print("missing staging station", slug)
        continue
    d = OUT / f"station_{slug}"
    if d.exists():
        shutil.rmtree(d)
    d.mkdir()
    e = json.loads((src / "catalogue-entry.json").read_text())
    for f in src.iterdir():
        if f.name != "catalogue-entry.json":
            shutil.copy(f, d / f.name)
    pack = {"type": "station", "name": e["name"], "rarity": e.get("rarity") or "common", "realm": e.get("realm"),
            "bounds_m": e.get("bounds_m"), "rigged": False, "animations": [], "skeleton": None,
            "stats": {k: v for k, v in (e.get("stats") or {}).items() if k in ("place_kind", "motif")},
            "source": f"staging station {e['id']} v{e['version']}"}
    (d / "pack.json").write_text(json.dumps(pack, indent=1))
    print(d.name, sorted(p.name for p in d.iterdir()))
