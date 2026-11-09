"""Build every cast character's clip library and the game's clip data (cq 012).

  $BLENDER_PY build_all.py --src <KayKit Knight.glb> --cast <dir with pose/<key>/lod1.glb + rig.json>
      [--keys armstrong,bobo] [--gate 0.005]

Writes (relative to app/game3d):
  anim/<key>.glb           skeleton-only clip library per rigged character (retarget.py)
  data/anim_clips.json     clip per state per weapon set, frames and contact frames, per
                           character: library, skeleton fingerprint, status, tear numbers
  data/attach.json         characters.<key>.clip_grips.<class>: the hand matrix that holds a
                           weapon the way the source clips do (only this key is touched)
and tools/anim/reports/<key>.json with every clip's checks.
"""
import argparse
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.abspath(os.path.join(HERE, "..", ".."))
CAST = ["armstrong", "bobo", "catboy", "crystalz", "elvis", "hoof", "nebulx", "vanessa"]
FP_BONES = ["Hips", "RightHand", "LeftFoot"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--src_ual", default="")
    ap.add_argument("--cast", required=True)
    ap.add_argument("--keys", default=",".join(CAST))
    ap.add_argument("--gate", type=float, default=0.005)
    ap.add_argument("--lod", default="lod1.glb")
    a = ap.parse_args()
    cfg = json.load(open(os.path.join(HERE, "clips.json")))
    data_path = os.path.join(GAME, "data", "anim_clips.json")
    data = json.load(open(data_path)) if os.path.exists(data_path) else {}
    attach_path = os.path.join(GAME, "data", "attach.json")
    attach = json.load(open(attach_path))
    chars = data.get("characters", {})
    os.makedirs(os.path.join(HERE, "reports"), exist_ok=True)
    clip_meta = {}
    for key in a.keys.split(","):
        rigp = os.path.join(a.cast, "pose", key, "rig.json")
        rig = json.load(open(rigp)) if os.path.exists(rigp) else {}
        if not rig.get("rigged"):
            chars[key] = {"status": "procedural", "why": "no skeleton: cq 060's auto-rig rejected this model (%s)" % rig.get("reason", "no rig.json"),
                          "fallback": "body motion only (lunge, hop, spin, lean) from fighter.gd"}
            print("SKIP", key, chars[key]["why"])
            continue
        rep_path = os.path.join(HERE, "reports", key + ".json")
        out = os.path.join(GAME, "anim", key + ".glb")
        cmd = [sys.executable, os.path.join(HERE, "retarget.py"), "--src", a.src,
               "--target", os.path.join(a.cast, "pose", key, a.lod), "--key", key,
               "--clips", os.path.join(HERE, "clips.json"), "--rigs", os.path.join(HERE, "rigs.json"),
               "--attach", attach_path, "--weapons", os.path.join(GAME, "tools", "weapons", "weapons.json"),
               "--out", out, "--report", rep_path] + (["--src_ual", a.src_ual] if a.src_ual else [])
        r = subprocess.run(cmd, capture_output=True, text=True)
        # ship the bytes as they are (GLTFDocument reads them at run time), not as an imported scene
        with open(out + ".import", "w") as f:
            f.write('[remap]\n\nimporter="keep"\n')
        if r.returncode != 0:
            print(r.stdout[-2000:], r.stderr[-4000:])
            raise SystemExit("retarget failed for " + key)
        rep = json.load(open(rep_path))
        # the gate holds on every LOD the app may load: the worst tear of LOD0, 1 and 2
        for lod in ("lod0.glb", "lod2.glb"):
            lp = os.path.join(a.cast, "pose", key, lod)
            if lod == a.lod or not os.path.exists(lp):
                continue
            c2 = list(cmd)
            c2[c2.index("--target") + 1] = lp
            c2[c2.index("--out") + 1] = out + ".lodcheck.glb"
            c2[c2.index("--report") + 1] = rep_path + ".lod.json"
            r3 = subprocess.run(c2, capture_output=True, text=True)
            if r3.returncode != 0:
                raise SystemExit("lod check failed for %s %s: %s" % (key, lod, r3.stderr[-2000:]))
            lr = json.load(open(rep_path + ".lod.json"))
            for cn, v in lr["clips"].items():
                cur = rep["clips"][cn]
                cur.setdefault("tear_by_lod", {})[lod[:4]] = v["tear_share"]
                if v["tear_share"] > cur["tear_share"]:
                    cur["tear_share"] = v["tear_share"]
                    cur["tear_worst_lod"] = lod[:4]
            os.remove(rep_path + ".lod.json")
            os.remove(out + ".lodcheck.glb")
        json.dump(rep, open(rep_path, "w"), indent=1)
        torn = sorted(c for c, v in rep["clips"].items() if v["tear_share"] > a.gate)
        worst = max(v["tear_share"] for v in rep["clips"].values())
        for c, v in rep["clips"].items():
            m = clip_meta.setdefault(c, {"frames": v["frames"], "fps": v["fps"], "contact": [], "src": v["src"], "speed": []})
            if v["contact"] is not None:
                m["contact"].append(v["contact"])
            if v.get("ground_speed_mps"):
                m["speed"].append(v["ground_speed_mps"] / rep["fingerprint"]["Hips"][1])
        # per weapon set and state: the first clip (the set's, then its alternates) under the gate
        pick = {}
        for sname, sset in cfg["sets"].items():
            pick[sname] = {}
            for st, e in sset.items():
                got = ""
                for cand in [e["clip"]] + e.get("alt", []):
                    v = rep["clips"].get(cand)
                    if v is not None and v["tear_share"] <= cfg.get("gate_by_state", {}).get(st, a.gate):
                        got = cand
                        break
                pick[sname][st] = got
        chars[key] = {"status": "clips", "library": "res://anim/%s.glb" % key, "pick": pick,
                      "source_lod": a.lod, "fingerprint": {b: rep["fingerprint"][b] for b in FP_BONES},
                      "tear_worst": round(worst, 4), "clips_over_gate": torn,
                      "hip_scale": round(rep["hip_scale"], 3)}
        # a rig that tears in a core state of its own weapon set falls back to the procedural
        # motion for this character only (the brief's rule); the gate is cq 060's
        own_cls = cfg.get("default_class", {}).get(key) or attach["weapons"].get(attach["characters"].get(key, {}).get("default_weapon") or "", {}).get("grip", "sword")
        own_set = cfg["class_set"].get(own_cls, "blade")
        missing = [st for st in cfg["core_states"] if not pick[own_set].get(st)]
        if missing:
            chars[key] = {"status": "procedural", "why": "rig tears: no clip under the gate for %s with its %s (%s set); worst clip stretches %.1f %% of triangles past 2.5x" % (", ".join(missing), own_cls, own_set, worst * 100),
                          "fallback": "its own cq 060 idle/walk/celebrate and the procedural poses and body motion", "tear_worst": round(worst, 4)}
            os.remove(out)
            os.remove(out + ".import")
            print("TEARS", key, missing)
            continue
        # the library ships only the clips this character plays
        used = sorted({v for sp in pick.values() for v in sp.values() if v})
        r2 = subprocess.run(cmd[:-2] + [rep_path + ".pruned.json", "--only", ",".join(used)] if not a.src_ual else
                            cmd[:cmd.index("--report") + 1] + [rep_path + ".pruned.json"] + cmd[cmd.index("--report") + 2:] + ["--only", ",".join(used)],
                            capture_output=True, text=True)
        if r2.returncode != 0:
            raise SystemExit("prune failed for %s: %s" % (key, r2.stderr[-2000:]))
        os.remove(rep_path + ".pruned.json")
        chars[key]["clips_in_library"] = len(used)
        if key in cfg.get("default_class", {}):
            chars[key]["default_class"] = cfg["default_class"][key]
        ch = attach["characters"].setdefault(key, {})
        ch["clip_grips"] = rep["grips"]
        print("OK", key, "worst tear %.4f" % worst, "over gate:", len(torn), "bytes", os.path.getsize(out))
    clips_out = data.get("clips", {})
    for c, m in clip_meta.items():
        cs = sorted(m["contact"])
        clips_out[c] = {"src": m["src"], "lib": cfg["clips"][c].get("lib", "kaykit"), "frames": m["frames"], "fps": m["fps"]}
        if cfg["clips"][c].get("ground_speed_per_hip"):
            clips_out[c]["ground_speed_per_hip"] = cfg["clips"][c]["ground_speed_per_hip"]
        elif m["speed"]:
            # metres per second of the planted foot per metre of hip height (a character's own
            # speed is this times its hip height)
            clips_out[c]["ground_speed_per_hip"] = round(sorted(m["speed"])[len(m["speed"]) // 2], 3)
        override = cfg["clips"][c].get("contact")
        if override is not None:
            clips_out[c]["contact"] = override
        elif cs:
            clips_out[c]["contact"] = cs[len(cs) // 2]
        for k in ("in", "out", "spin"):   # cq 016: spin = the clip turns the body itself (no procedural spin on top)
            if k in cfg["clips"][c]:
                clips_out[c][k] = cfg["clips"][c][k]
    data = {
        "_doc": "Combat clips for the cast (cq 012), generated by app/game3d/tools/anim/build_all.py; see docs/game3d/ANIMATIONS.md. sets: per weapon set, the clip each CombatAnimator state plays (optional in/out frames trim it). clips: frames at fps, and contact = the frame the weapon strikes; the game time-warps the clip so that frame lands on the hitbox's moment. characters: the clip library per cast character, the skeleton fingerprint that recognises its model, the tear check; status procedural = no clips, the procedural motion stands in.",
        "source": "KayKit Adventurers 1.0 (Kay Lousberg, CC0 1.0), https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0",
        "gate_tear_share": a.gate,
        "class_set": cfg["class_set"],
        "sets": cfg["sets"],
        "clips": dict(sorted(clips_out.items())),
        "characters": dict(sorted(chars.items())),
    }
    json.dump(data, open(data_path, "w"), indent=1)
    json.dump(attach, open(attach_path, "w"), indent=1)
    print("WROTE", data_path, attach_path)


if __name__ == "__main__":
    main()
