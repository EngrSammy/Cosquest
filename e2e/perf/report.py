#!/usr/bin/env python3
"""The before/after table for docs/polish/BASELINE.md from $OUT/perf-<run>-<profile>.json.

    python3 e2e/perf/report.py [--before before] [--after after]

Prints Markdown: one table per profile (small, large, large-a11y), a row per
measurement, the before and after values side by side.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("OUT", os.path.join(HERE, "..", "out"))
PROFILES = [("small", "Small, 360x640 dp (720x1280 at 320 dpi)"),
            ("large", "Large, 411x891 dp (1440x3120 at 560 dpi), gesture nav, edge to edge"),
            ("large-a11y", "Large + font scale 1.3 + display size largest (720 dpi)"),
            ("game-ref", "Game reference, 1440x3120 at 420 dpi (the before build's map fits under the bitmap limit here)")]


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def load(run, prof):
    path = os.path.join(OUT, f"perf-{run}-{prof}.json")
    return json.load(open(path)) if os.path.exists(path) else None


def get(d, *path):
    for p in path:
        if not isinstance(d, dict) or p not in d:
            return None
        d = d[p]
    return d


ROWS = [
    ("Cold start to first feed post (ms, median of 3)", ("cold", "interactive_median_ms")),
    ("Cold start to first frame, Android TotalTime (ms)", ("cold", "displayed_median_ms")),
    ("Feed: UI jank % (12 flings down, 6 up)", ("feed", "janky_pct")),
    ("Feed: frame p90 (ms)", ("feed", "p90_ms")),
    ("Feed: JS fps", ("feed", "js_fps")),
    ("Feed: JS frames over 50 ms", ("feed", "js_long_frames")),
    ("Feed: PostCard renders while scrolling", ("feed", "renders_PostCard")),
    ("Chat 2k group: open, tap to messages (ms, median of 3)", ("chat", "open_median_ms")),
    ("Chat 2k group: UI jank % (10 flings up)", ("chat", "scroll", "janky_pct")),
    ("Chat 2k group: JS fps while scrolling", ("chat", "scroll", "js_fps")),
    ("Chat 2k group: Bubble renders while scrolling", ("chat", "scroll", "renders_Bubble")),
    ("Map, 20 GPS fixes in 20 s: GameRoot renders", ("map", "renders_GameRoot")),
    ("Map: PointMarker renders", ("map", "renders_PointMarker")),
    ("Map: JS fps", ("map", "js_fps")),
    ("Duel 15 s: UI jank %", ("duel", "janky_pct")),
    ("Duel: frame p90 (ms)", ("duel", "p90_ms")),
    ("Duel: JS fps", ("duel", "js_fps")),
    ("Duel: JS frames over 50 ms", ("duel", "js_long_frames")),
    ("Duel: DuelScreen renders", ("duel", "renders_DuelScreen")),
    ("Duel: arena renders (no counter in the before build)", ("duel", "renders_DuelArena")),
    ("Quiz 10 s: JS fps (gfxinfo does not see the quiz's frames)", ("quiz", "js_fps")),
    ("Quiz: Encounter renders", ("quiz", "renders_Encounter")),
]


def fmt(v):
    if v is None:
        return "-"
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v)


def main():
    before, after = arg("--before", "before"), arg("--after", "after")
    for prof, title in PROFILES:
        b, a = load(before, prof), load(after, prof)
        if not b and not a:
            continue
        print(f"### {title}\n")
        print(f"| Measurement | Before | After |\n|---|---|---|")
        for label, path in ROWS:
            bv, av = get(b, *path), get(a, *path)
            if bv is None and av is None:
                continue
            print(f"| {label} | {fmt(bv)} | {fmt(av)} |")
        notes = {}
        for run, d in ((before, b), (after, a)):
            for k in ("cold", "feed", "chat", "map", "duel", "quiz"):
                e = get(d, k, "error") if d else None
                if e:
                    msg = e.splitlines()[0][:140] if "maestro" not in e else "the flow could not start it (game state, see BASELINE.md)"
                    notes.setdefault((run, msg), []).append(k)
        for (run, msg), ks in notes.items():
            print(f"\nNot measured, {run} {', '.join(ks)}: {msg}")
        print()


if __name__ == "__main__":
    main()
