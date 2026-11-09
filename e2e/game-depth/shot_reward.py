#!/usr/bin/env python3
"""shot_reward.py <shot.json> <out_prefix> [--video] [--secs N] [--tap-at S]: the real reward screen (Expo
web, test build, /dev/reward) for a fight's result and verdict, at phone size (393x852 CSS px, 2x).
Writes <out>.png at the end; with --video, <out>.mp4 at 30 fps from the browser's screencast frames
(their own timestamps). --tap-at S presses the first button (e.g. "Nice!" on a level-up) after S s."""
import base64, glob, json, os, subprocess, sys, tempfile, time
from playwright.sync_api import sync_playwright

args = sys.argv[1:]
shot = json.load(open(args[0])); out = args[1]; video = "--video" in args
secs = float(args[args.index("--secs") + 1]) if "--secs" in args else 9.0
tap_at = float(args[args.index("--tap-at") + 1]) if "--tap-at" in args else None
d = base64.urlsafe_b64encode(json.dumps(shot, separators=(",", ":")).encode()).decode().rstrip("=")
url = f"http://localhost:8955/dev/reward?d={d}"
exe = glob.glob("/home/engineer/.cache/ms-playwright/chromium_headless_shell-1248/*/chrome-headless-shell")[0]
frames = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=exe)
    ctx = b.new_context(viewport={"width": 393, "height": 852}, device_scale_factor=2)
    pg = ctx.new_page()
    pg.goto("http://localhost:8955/dev/reward", timeout=600_000)   # warm the bundle (redirects home)
    pg.wait_for_timeout(1500)
    cdp = ctx.new_cdp_session(pg)
    if video:
        def on_frame(e):
            frames.append((e["metadata"]["timestamp"], base64.b64decode(e["data"])))
            cdp.send("Page.screencastFrameAck", {"sessionId": e["sessionId"]})
        cdp.on("Page.screencastFrame", on_frame)
    pg.goto(url, timeout=600_000)
    if video:
        cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 90, "maxWidth": 786, "maxHeight": 1704, "everyNthFrame": 1})
    t0 = time.time()
    tapped = False
    while time.time() - t0 < secs:
        pg.wait_for_timeout(100)
        if tap_at is not None and not tapped and time.time() - t0 >= tap_at:
            try:
                pg.get_by_text("Nice!", exact=True).click(timeout=2000, force=True)
            except Exception as e:  # nothing to tap: fine, the shot goes on
                print("tap skipped:", str(e).splitlines()[0])
            tapped = True
    t_stop = time.time()   # the screencast's timestamps are wall-clock seconds too
    if video:
        cdp.send("Page.stopScreencast")
    pg.screenshot(path=out + ".png")
    ctx.close()
    b.close()
if video and frames:
    tmp = tempfile.mkdtemp()
    lst = []
    for i, (ts, data) in enumerate(frames):
        f = f"{tmp}/f{i:05d}.jpg"
        open(f, "wb").write(data)
        # a still screen sends no frames: the last one holds until the capture stopped
        dur = (frames[i + 1][0] - ts) if i + 1 < len(frames) else max(0.5, t_stop - ts)
        lst.append(f"file '{f}'\nduration {max(dur, 0.001):.4f}")
    lst.append(f"file '{tmp}/f{len(frames) - 1:05d}.jpg'")
    open(f"{tmp}/list.txt", "w").write("\n".join(lst) + "\n")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", f"{tmp}/list.txt",
                    "-vf", "fps=30,scale=720:-2:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-crf", "20", out + ".mp4"], check=True)
    subprocess.run(["rm", "-rf", tmp])
print("ok", out, len(frames), "frames")
