#!/usr/bin/env python3
"""corpus.py <tree> <out.jsonl> <n_per>: seeded headless bot fights (--fixed-fps 30) with the judge log,
for the server judge's tests: hero/ally/boss from the three review configs, plus capsules, plus short
rounds (timeouts) and the idle bot (losses)."""
import json, subprocess, sys, os, tempfile
W = "/home/engineer/cq-work/019-game-depth-scope-and-build"
tree, out, n = sys.argv[1], sys.argv[2], int(sys.argv[3])
fps_mode = sys.argv[4] if len(sys.argv) > 4 else ""   # "fps" = the frame-rate plans only
base = {c: json.load(open(f"{W}/cap/{c}.json")) for c in ("lat_cfg", "f1hoof_cfg", "idle_cfg")}
caps = dict(base["lat_cfg"]); [caps.pop(k, None) for k in ("hero_glb", "ally_glb", "enemy_glb", "hero_weapon", "enemy_weapon", "hero_key", "ally_key", "enemy_key")]
plans = []
for s in range(1, n + 1):
    plans.append(("lat", dict(base["lat_cfg"], seed=1000 + s)))
    plans.append(("hoof", dict(base["f1hoof_cfg"], seed=2000 + s)))
    plans.append(("caps", dict(caps, seed=3000 + s)))
    if s % 2 == 0:
        plans.append(("short", dict(base["lat_cfg"], seed=4000 + s, duration_s=12)))
    if s % 4 == 0:
        plans.append(("idle", dict(base["idle_cfg"], seed=5000 + s, bot="idle", autoplay=True)))
if fps_mode == "fps":
    plans = []
    for s_ in range(1, n + 1):
        plans.append(("fps15", dict(base["lat_cfg"], seed=6000 + s_), "15"))
        plans.append(("fps60", dict(base["f1hoof_cfg"], seed=7000 + s_), "60"))
        plans.append(("free", dict(caps, seed=8000 + s_), ""))
else:
    plans = [(a, b, "30") for a, b in plans]
done = 0
with open(out, "a") as f:
    for name, cfg, fps in plans:
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as t:
            json.dump(cfg, t)
        try:
            args = ["--fixed-fps", fps] if fps else []
            p = subprocess.run([f"{W}/bin/godotr", "--headless", "--path", ".", *args, "--", "--autotest", f"--config={t.name}"],
                               cwd=f"{W}/{tree}/app/game3d", capture_output=True, text=True, timeout=300)
        finally:
            os.unlink(t.name)
        line = next((l for l in p.stdout.splitlines() if l.startswith("CQRESULT ")), None)
        if not line:
            print("no result", name, cfg["seed"], file=sys.stderr); continue
        r = json.loads(line[len("CQRESULT "):]); r.pop("load_ms", None)
        f.write(json.dumps({"plan": name, "fps": fps or "free", "seed": cfg["seed"], "duration_s": cfg.get("duration_s", 45), "result": r}, separators=(",", ":")) + "\n")
        done += 1
print("fights", done)
