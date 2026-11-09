#!/usr/bin/env python3
"""The polish measurements on the current phone profile (docs/polish/BASELINE.md).

    python3 e2e/perf/measure.py <label> [--only cold,feed,chat,map,duel,quiz]

Needs: a test build with EXPO_PUBLIC_PERF_MARKS=1 installed and signed in as
ada on the SEED_PERF world (e2e/reset.sh with SEED_PERF=1, then
flows/signin.yaml), the game's first run done (flows/to-game.yaml), adb
pointed at the emulator (ANDROID_SERIAL / EMU_PORT), Maestro.
Writes $OUT/perf-<label>.json and prints a summary.

What is measured (the app logs the [perf] lines, utils/perfMarks.ts):
  cold   force-stop, launch; ms from the activity start to the first feed post
         on screen ("interactive"), and Android's "Displayed" (first frame).
  feed   12 flings down and 6 up the feed: UI-thread jank (dumpsys gfxinfo),
         JS frames, PostCard renders.
  chat   open the 2,000-message group 3 times (tap to messages on screen),
         then 10 flings up through its history: jank, JS frames, Bubble renders.
  map    20 s on the map with a GPS fix every second: GameRoot / PointMarker
         renders, JS frames.
  duel   15 s of a Guardian duel with a tap every 300 ms: jank, JS frames,
         DuelScreen renders.
  quiz   10 s of a blitz quiz with its clock running: jank, JS frames,
         Encounter renders.
"""
import json
import os
import re
import statistics
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = "com.dammy0227.cosquest"
ANDROID_HOME = os.environ.get("ANDROID_HOME", os.path.expanduser("~/cq-work/tools/android-sdk"))
ADB = os.path.join(ANDROID_HOME, "platform-tools", "adb")
MAESTRO = os.environ.get("MAESTRO", os.path.expanduser("~/cq-work/cx-journeys/tools/maestro/bin/maestro"))
OUT = os.environ.get("OUT", os.path.join(HERE, "..", "out"))
SERIAL = os.environ.get("ANDROID_SERIAL") or (f"emulator-{os.environ['EMU_PORT']}" if os.environ.get("EMU_PORT") else None)
if SERIAL:
    os.environ["ANDROID_SERIAL"] = SERIAL


def adb(*args, check=True):
    return subprocess.run([ADB, *args], capture_output=True, text=True, check=check).stdout


def shell(cmd):
    return adb("shell", cmd)


def maestro(flow, **env):
    args = [MAESTRO, "test"]
    if SERIAL:
        args += ["--device", SERIAL]
    for k, v in env.items():
        args += ["-e", f"{k}={v}"]
    args.append(os.path.join(HERE, "flows", flow))
    r = subprocess.run(args, capture_output=True, text=True,
                       env={**os.environ, "MAESTRO_CLI_NO_ANALYTICS": "1",
                            "JAVA_HOME": os.environ.get("JAVA_HOME", os.path.expanduser("~/cq-work/tools/jdk17"))})
    if r.returncode != 0:
        tail = "\n".join((r.stdout + r.stderr).strip().splitlines()[-6:])
        raise RuntimeError(f"maestro {flow} failed:\n{tail}")


def screen():
    m = re.findall(r"(\d+)x(\d+)", shell("wm size"))[-1]
    return int(m[0]), int(m[1])


def device_ms():
    return int(shell("date +%s%3N").strip())


def logcat_since(since_ms):
    """ReactNativeJS [perf] lines and ActivityManager lines after since_ms, as (epoch_ms, text)."""
    raw = adb("logcat", "-d", "-v", "epoch", "-s", "ReactNativeJS:*", "ActivityTaskManager:I", "ActivityManager:I")
    out = []
    for line in raw.splitlines():
        m = re.match(r"\s*(\d+)\.(\d+)\s+\d+\s+\d+\s+\w\s+(\S+)\s*:\s?(.*)", line)
        if not m:
            continue
        at = int(m.group(1)) * 1000 + int(m.group(2)[:3])
        if at >= since_ms:
            out.append((at, m.group(4)))
    return out


def renders_at(lines):
    last = {}
    for _, text in lines:
        if "[perf] renders " in text:
            last = json.loads(text.split("[perf] renders ", 1)[1])
    return last


def js_frames(lines):
    frames = long = 0
    worst = 0
    windows = 0
    for _, text in lines:
        m = re.search(r"\[perf\] js (\d+) (\d+) (\d+)", text)
        if m:
            windows += 1
            frames += int(m.group(1))
            long += int(m.group(2))
            worst = max(worst, int(m.group(3)))
    secs = windows * 2
    return {"js_fps": round(frames / secs, 1) if secs else None, "js_long_frames": long, "js_worst_ms": worst, "seconds": secs}


def gfx_reset():
    shell(f"dumpsys gfxinfo {PKG} reset")


def gfx():
    text = shell(f"dumpsys gfxinfo {PKG}")
    def num(pattern):
        m = re.search(pattern, text)
        return float(m.group(1)) if m else None
    return {
        "frames": num(r"Total frames rendered: (\d+)"),
        "janky_pct": num(r"Janky frames: \d+ \(([\d.]+)%\)"),
        "p50_ms": num(r"50th percentile: (\d+)ms"),
        "p90_ms": num(r"90th percentile: (\d+)ms"),
        "p99_ms": num(r"99th percentile: (\d+)ms"),
    }


def window(seconds_or_fn, counter_names):
    """Run an action, return gfxinfo + JS frames + render deltas over it."""
    log_from = device_ms()
    time.sleep(2.2)  # one renders line before
    before = renders_at(logcat_since(log_from - 60_000))
    gfx_reset()
    t0 = device_ms()
    if callable(seconds_or_fn):
        seconds_or_fn()
    else:
        time.sleep(seconds_or_fn)
    t1 = device_ms()
    g = gfx()
    time.sleep(2.2)
    lines = logcat_since(t0)
    after = renders_at(logcat_since(log_from - 60_000))
    inside = [l for l in lines if l[0] <= t1 + 2100]
    res = {**g, **js_frames(inside), "window_s": round((t1 - t0) / 1000, 1)}
    for name in counter_names:
        if name in after or name in before:  # not every build has every counter
            res[f"renders_{name}"] = after.get(name, 0) - before.get(name, 0)
    return res


def fling(n, up=False):
    w, h = screen()
    x = w // 2
    a, b = int(h * 0.72), int(h * 0.28)
    for _ in range(n):
        if up:
            shell(f"input swipe {x} {b} {x} {a} 120")
        else:
            shell(f"input swipe {x} {a} {x} {b} 120")
        time.sleep(0.6)


def cold(runs=3):
    out = []
    for _ in range(runs):
        shell(f"am force-stop {PKG}")
        time.sleep(1.5)
        adb("logcat", "-c")
        t0 = device_ms()
        launched = shell(f"am start -W -n {PKG}/.MainActivity")
        start = displayed = interactive = None
        m = re.search(r"TotalTime: (\d+)", launched)
        if m:
            displayed = int(m.group(1))  # Android's own launch time (first frame)
        until = time.time() + 60
        while time.time() < until and interactive is None:
            time.sleep(0.5)
            for at, text in logcat_since(t0 - 1000):
                if start is None and "START u0" in text and PKG in text:
                    start = at
                m = re.search(r"Displayed " + re.escape(PKG) + r"/\S+(?: for user \d+)?: \+(?:(\d+)s)?(\d+)ms", text)
                if m and displayed is None:
                    displayed = int(m.group(1) or 0) * 1000 + int(m.group(2))
                m = re.search(r"\[perf\] mark interactive (\d+)", text)
                if m:
                    interactive = int(m.group(1))
        base = start or t0
        out.append({"displayed_ms": displayed, "interactive_ms": (interactive - base) if interactive else None})
        time.sleep(3)
    vals = [r["interactive_ms"] for r in out if r["interactive_ms"]]
    disp = [r["displayed_ms"] for r in out if r["displayed_ms"]]
    return {"runs": out, "interactive_median_ms": statistics.median(vals) if vals else None,
            "displayed_median_ms": statistics.median(disp) if disp else None}


def chat():
    t0 = device_ms()
    maestro("chat-open.yaml")
    spans = [int(m.group(1)) for _, text in logcat_since(t0)
             for m in [re.search(r"\[perf\] span chat-open (\d+)", text)] if m]
    res = {"open_ms": spans, "open_median_ms": statistics.median(spans) if spans else None}
    res["scroll"] = window(lambda: fling(10, up=True), ["Bubble", "ChatScreen"])
    return res


def map_idle():
    def gps():
        for i in range(20):
            lng = -0.1278 + (i % 4) * 0.00003
            adb("emu", "geo", "fix", f"{lng:.6f}", "51.5074", check=False)
            time.sleep(1)
    return window(gps, ["GameRoot", "PointMarker"])


def duel():
    maestro("duel-start.yaml")
    w, h = screen()

    def taps():
        end = time.time() + 15
        while time.time() < end:
            shell(f"input tap {int(w * 0.55)} {int(h * 0.45)}")
            time.sleep(0.3)
    res = window(taps, ["DuelScreen", "DuelArena", "GameRoot"])
    maestro("back-to-map.yaml")
    return res


def quiz():
    maestro("quiz-start.yaml")
    res = window(10, ["Encounter", "GameRoot"])
    maestro("back-to-map.yaml")
    return res


def feed():
    time.sleep(4)
    res = window(lambda: (fling(12), fling(6, up=True)), ["PostCard", "Feeds"])
    fling(10, up=True)  # back to the top, where the Chats pill is
    return res


def main():
    label = sys.argv[1]
    only = None
    if "--only" in sys.argv:
        only = set(sys.argv[sys.argv.index("--only") + 1].split(","))
    want = lambda k: only is None or k in only
    w, h = screen()
    result = {"label": label, "screen": f"{w}x{h}", "density": shell("wm density").strip().splitlines()[-1],
              "font_scale": shell("settings get system font_scale").strip(), "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    path = os.path.join(OUT, f"perf-{label}.json")
    if os.path.exists(path):
        result = {**json.load(open(path)), **result}

    def step(name, fn):
        if not want(name):
            return
        print(f"== {name}", flush=True)
        try:
            result[name] = fn()
        except Exception as e:  # keep going; record what failed
            result[name] = {"error": str(e)}
        print(json.dumps(result[name]), flush=True)
        json.dump(result, open(path, "w"), indent=2)

    step("cold", cold)       # ends on the feed
    step("feed", feed)
    step("chat", chat)
    if want("map") or want("duel") or want("quiz"):
        try:
            maestro("to-game.yaml")
        except Exception as e:
            print(f"to-game: {e}")
    step("map", map_idle)
    step("duel", duel)
    step("quiz", quiz)
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
