#!/usr/bin/env python3
"""e2e_trafalgar.py <out_dir>: the whole thing at one real place, on the local test stack (cq 019).
A signed test device at Trafalgar Square takes the nearest duel point, the server starts a judged 3D
fight, Godot fights it in the real place (the Overpass ground, the point where the server put it) on the
server's seed, recorded in real time (x11grab), and the server judges and pays. Writes run.json,
fight.mp4 and shot_judged.json (for shot_reward.py)."""
import json, math, os, subprocess, sys, tempfile, time
sys.path.insert(0, "/home/engineer/cq-work/019-game-depth-scope-and-build/backend")
import httpx
from app import roam_fight3d as f3
from tests.test_roam import Device

W = "/home/engineer/cq-work/019-game-depth-scope-and-build"
GROUND = f"{W}/osm/trafalgar_ground.json"
O = (51.5080, -0.1280)                       # the ground's origin
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
c = httpx.Client(base_url="http://127.0.0.1:55420", timeout=60)
dev = Device()
assert dev.call(c, "PUT", "/v1/roam/faction", {"faction": "marvel"}).status_code == 200
pts = [p for p in c.get("/v1/roam/points", params={"lat": O[0], "lng": O[1]}).json()["points"] if p.get("challenge") == "duel" and p["source"] != "raid"]
def local(p):
    return ((p["lng"] - O[1]) * 111320 * math.cos(math.radians(O[0])), (p["lat"] - O[0]) * 111320)
pt = min(pts, key=lambda p: math.hypot(*local(p)))
at = [round(v, 1) for v in local(pt)]
before = c.get("/v1/roam/me", params={"device_key": dev.key}).json()["standing"]
t0 = time.time()
s = dev.call(c, "POST", "/v1/duel/start", {"mode": "point", "target": pt["id"], "lat": pt["lat"], "lng": pt["lng"], "accuracy_m": 5, "fight3d": True})
assert s.status_code == 200, s.text
start = s.json(); assert start["setup"]["kind"] == "fight3d"
cfg = json.load(open(f"{W}/cap/lat_cfg.json"))
cfg.update(seed=f3.fight_seed(start["seed"]), point_name=pt["name"], autoplay=True, arena="place", ground_json=GROUND, place_at=at,
           enemy_name=start["setup"].get("guardian_name") or "Guardian")
with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as t:
    json.dump(cfg, t)
p = subprocess.run(["xvfb-run", "-a", "-s", "-screen 0 720x1280x24", f"{W}/bin/rec_run.sh", f"{out}/fight.mp4", "--path", ".", "--rendering-driver", "opengl3",
                    "--resolution", "720x1280", "--position", "0,0", "--", "--autotest", f"--config={t.name}"],
                   cwd=f"{W}/app/app/game3d", capture_output=True, text=True, timeout=900)
os.unlink(t.name)
line = next(l for l in p.stdout.splitlines() if l.startswith("CQRESULT "))
r = json.loads(line[9:]); r.pop("load_ms", None)
v = dev.call(c, "POST", "/v1/duel/finish", {"duel_id": start["duel_id"], **f3.finish_fields(r)})
assert v.status_code == 200, v.text
outcome = v.json()
after = c.get("/v1/roam/me", params={"device_key": dev.key}).json()["standing"]
json.dump({"fight": r, "point": {"name": pt["name"], "realm": pt.get("realm") or ""}, "before": before, "outcome": outcome}, open(f"{out}/shot_judged.json", "w"))
json.dump({"point": pt, "at": at, "wall_s": round(time.time() - t0, 1), "fight": {k: r[k] for k in ("outcome", "time_s", "damage_dealt", "hits")},
           "verdict": outcome["status"], "reward": outcome.get("reward"), "before": before, "after": after,
           "place": next((l for l in p.stdout.splitlines() if l.startswith("CQ place")), "")}, open(f"{out}/run.json", "w"), indent=1)
print(pt["name"], at, "fight", r["outcome"], r["time_s"], "server", outcome["status"], "xp", (outcome.get("reward") or {}).get("xp"), "level", before["level"], "->", after["level"])
