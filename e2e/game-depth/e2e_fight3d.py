#!/usr/bin/env python3
"""e2e_fight3d.py <out_dir> [--movie]: the judged 3D fight on the local test stack (cq 019).
A signed test device takes a faction, picks a Quest Point near the test spot, asks /v1/duel/start for a
3D fight, Godot fights on the server's seed (the review cast, the autoplay bot; with --movie under xvfb,
recorded with Godot's movie writer at 30 fps), and /v1/duel/finish gets the fight's record, built as
the app's finishFrom3D does. Then the same again with the result forged (a loss sent as a win).
Writes run.json and shot_*.json (for shot_reward.py) to out_dir."""
import json, os, subprocess, sys, tempfile, time
sys.path.insert(0, "/home/engineer/cq-work/019-game-depth-scope-and-build/backend")
import httpx
from app import roam_fight3d as f3
from tests.test_roam import Device

W = "/home/engineer/cq-work/019-game-depth-scope-and-build"
SERVER = "http://127.0.0.1:55420"
SPOT = (51.4620, -0.0150)
out = sys.argv[1]; movie = "--movie" in sys.argv
os.makedirs(out, exist_ok=True)
c = httpx.Client(base_url=SERVER, timeout=60)


def me(dev):
    return c.get("/v1/roam/me", params={"device_key": dev.key}).json()


def fight(cfg, movie_path=None):
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as t:
        json.dump(cfg, t)
    if movie_path:
        cmd = ["xvfb-run", "-a", "-s", "-screen 0 1080x2340x24", f"{W}/bin/godotr", "--path", ".", "--rendering-driver", "opengl3",
               "--resolution", "720x1280", "--fixed-fps", "30", "--write-movie", movie_path, "--", "--autotest", f"--config={t.name}"]
    else:
        cmd = [f"{W}/bin/godotr", "--headless", "--path", ".", "--fixed-fps", "30", "--", "--autotest", f"--config={t.name}"]
    p = subprocess.run(cmd, cwd=f"{W}/app/app/game3d", capture_output=True, text=True, timeout=1800)
    os.unlink(t.name)
    line = next(l for l in p.stdout.splitlines() if l.startswith("CQRESULT "))
    r = json.loads(line[len("CQRESULT "):]); r.pop("load_ms", None)
    return r


def play(dev, point, cfg_name, tag, forge=False):
    before = me(dev)["standing"]
    t0 = time.time()
    s = dev.call(c, "POST", "/v1/duel/start", {"mode": "point", "target": point["id"], "lat": point["lat"], "lng": point["lng"],
                                                "accuracy_m": 5, "fight3d": True})
    assert s.status_code == 200, s.text
    start = s.json()
    assert start["setup"]["kind"] == "fight3d", start["setup"]
    cfg = json.load(open(f"{W}/cap/{cfg_name}.json"))
    cfg.update(seed=f3.fight_seed(start["seed"]), point_name=point["name"], autoplay=True)
    if cfg_name == "idle_cfg":
        cfg["bot"] = "idle"
    r = fight(cfg, f"{out}/{tag}_fight.avi" if movie else None)
    sent = json.loads(json.dumps(r))
    if forge:   # a loss sent as a win: the Guardian "down", the hero standing
        sent.update(outcome="win", enemy_hp_left=0, hero_hp_left=max(1, sent["hero_hp_left"]))
    # the judge refuses a fight reported faster than real time; a headless fight runs faster
    # than real time, so wait out the fight's own length before reporting (the phone fights live)
    wait = r["time_s"] * 0.85 - (time.time() - t0)
    if wait > 0:
        time.sleep(wait)
    body = f3.finish_fields(sent)
    v = dev.call(c, "POST", "/v1/duel/finish", {"duel_id": start["duel_id"], **body})
    assert v.status_code == 200, v.text
    outcome = v.json()
    after = me(dev)["standing"]
    print(f"{tag}: fight {r['outcome']} in {r['time_s']} s, sent {sent['outcome']}; server {outcome['status']}, "
          f"xp {((outcome.get('reward') or {}).get('xp'))}; level {before['level']} xp {before['xp']} -> level {after['level']} xp {after['xp']}")
    point_card = {"name": point["name"], "realm": point.get("realm") or ""}
    json.dump({"fight": r, "point": point_card, "before": before}, open(f"{out}/shot_{tag}_practice.json", "w"))
    json.dump({"fight": sent, "point": point_card, "before": before, "outcome": outcome}, open(f"{out}/shot_{tag}_judged.json", "w"))
    return {"start": {k: start[k] for k in ("duel_id", "seed", "setup")}, "fight": r, "sent_outcome": sent["outcome"],
            "verdict": outcome, "before": before, "after": after}


dev = Device()
assert dev.call(c, "PUT", "/v1/roam/faction", {"faction": "gaming"}).status_code == 200
pts = [p for p in c.get("/v1/roam/points", params={"lat": SPOT[0], "lng": SPOT[1]}).json()["points"] if p["source"] == "signal"]
run = {"win": play(dev, pts[0], "lat_cfg", "win")}
cheat = Device()
assert cheat.call(c, "PUT", "/v1/roam/faction", {"faction": "dc"}).status_code == 200
run["forged"] = play(cheat, pts[1], "idle_cfg", "forged", forge=True)
json.dump(run, open(f"{out}/run.json", "w"), indent=1)
