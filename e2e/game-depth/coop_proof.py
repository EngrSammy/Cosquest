#!/usr/bin/env python3
"""coop_proof.py <out_dir> [--drop-b S]: two players in one 3D fight on the local test stack (cq 019).
Two signed test devices join one co-op room; player A's fight runs under xvfb and is recorded (Godot's
movie writer, 30 fps), player B's runs headless in real time; both are the autoplay bot. With --drop-b,
B's fight is stopped S seconds in (the disconnect case). Writes a.log, b.log, summary.json."""
import json, os, subprocess, sys, tempfile, time
sys.path.insert(0, "/home/engineer/cq-work/019-game-depth-scope-and-build/backend")
import httpx
from tests.test_roam import Device

W = "/home/engineer/cq-work/019-game-depth-scope-and-build"
M = "/home/engineer/cq-work/016-game-quality-r3-polish/models/pose"
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
drop = float(sys.argv[sys.argv.index("--drop-b") + 1]) if "--drop-b" in sys.argv else None
c = httpx.Client(base_url="http://127.0.0.1:55420", timeout=30)
room = f"proof-{int(time.time())}"
a, b = Device(), Device()
ja = a.call(c, "POST", "/v1/coop3d/join", {"room": room, "name": "Armstrong", "squad": 2}).json()
jb = b.call(c, "POST", "/v1/coop3d/join", {"room": room, "name": "Crystal-Z", "squad": 2}).json()
url = "ws://127.0.0.1:55420/v1/coop3d/ws"
base = json.load(open(f"{W}/cap/lat_cfg.json"))
# max_fps 30: the recording's fixed 1/30 s frames, no faster than the wall (the server refuses a fight that runs ahead of real time)
cfg_a = dict(base, seed=1001, players_text="2/2", point_name="Co-op test", max_fps=30,
             coop={"url": url, "ticket": ja["ticket"], "peer_glb": f"{M}/crystalz/lod1.glb", "peer_name": "Crystal-Z", "peer_key": "crystalz"})
cfg_b = dict(base, seed=2002, players_text="2/2", point_name="Co-op test", hero_glb=f"{M}/crystalz/lod1.glb", hero_name="Crystal-Z",
             hero_key="crystalz", hero_weapon={"glb": f"{W}/app/app/assets/weapons/arcane_staff.glb", "class": "staff"},
             coop={"url": url, "ticket": jb["ticket"], "peer_glb": f"{M}/armstrong/lod1.glb", "peer_name": "Armstrong", "peer_key": "armstrong"})
files = []
for cfg in (cfg_a, cfg_b):
    t = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False); json.dump(cfg, t); t.close(); files.append(t.name)
g = f"{W}/bin/godotr"
# A in real time (a phone does not run ahead of the clock), its screen recorded as it draws
pa = subprocess.Popen(["xvfb-run", "-a", "-s", "-screen 0 720x1280x24", f"{W}/bin/rec_run.sh", f"{out}/a_fight.mp4", "--path", ".",
                       "--rendering-driver", "opengl3", "--resolution", "720x1280", "--position", "0,0", "--", "--autotest", f"--config={files[0]}"],
                      cwd=f"{W}/app/app/game3d", stdout=open(f"{out}/a.log", "w"), stderr=subprocess.STDOUT)
pb = subprocess.Popen([g, "--headless", "--path", ".", "--max-fps", "60", "--", "--autotest", f"--config={files[1]}"],
                      cwd=f"{W}/app/app/game3d", stdout=open(f"{out}/b.log", "w"), stderr=subprocess.STDOUT)
t0 = time.time()
if drop:
    while time.time() - t0 < drop and pb.poll() is None:
        time.sleep(0.5)
    if pb.poll() is None:
        pb.kill()   # the process this script started: B's phone goes away mid-fight
pa.wait(timeout=600); pb.wait(timeout=600)
for f in files: os.unlink(f)
def grab(fn):
    lines = open(fn).read().splitlines()
    res = next((json.loads(l[9:]) for l in lines if l.startswith("CQRESULT ")), None)
    if res: res.pop("judge", None)
    return {"result": res, "coop": [l for l in lines if l.startswith("CQ coop")]}
s = {"room": room, "drop_b": drop, "a": grab(f"{out}/a.log"), "b": grab(f"{out}/b.log"), "wall_s": round(time.time() - t0, 1)}
json.dump(s, open(f"{out}/summary.json", "w"), indent=1)
for k in ("a", "b"):
    r = s[k]["result"] or {}
    print(k, r.get("outcome"), r.get("time_s"), "dealt", r.get("damage_dealt"), "coop", json.dumps(r.get("coop"))[:300])
    for l in s[k]["coop"][-3:]: print("  ", l[:200])
