"""fight-anim (7 Nov 2026): numbers from a tools/anim_probe.gd capture.

  python3 probe_report.py <probe.jsonl> [--fps 30] [--json out.json]

Per fighter role and animator state:
  frames        visual frames spent in the state
  rate          the clip's playback rate (median, max): 1.0 = as authored
  slide         stance-foot sliding: the mean horizontal speed (m/s) of the lower foot while it is
                within 5 cm of that foot's lowest height, and the share of those frames sliding
                faster than 0.3 m/s
  pop           the largest per-frame bone rotation in the skeleton's own space (deg/frame, skin
                chains left out): p95 and the count of frames over 40 deg (a pose snap at 30 fps)
  turn          the whole body's rotation per frame (deg): the max and frames over 30 (a facing snap)
Transitions: every state change, how often, and the worst pop in the 3 frames after it.
"""
import argparse
import json
import math
from collections import defaultdict


def pct(xs, p):
    if not xs:
        return 0.0
    s = sorted(xs)
    return s[min(len(s) - 1, int(round(p / 100.0 * (len(s) - 1))))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("probe")
    ap.add_argument("--fps", type=float, default=30.0)
    ap.add_argument("--json", default="")
    ap.add_argument("--skip", type=int, default=10, help="leave out the first N frames (the models appear)")
    a = ap.parse_args()
    rows = defaultdict(list)
    for line in open(a.probe):
        line = line.strip()
        if line:
            r = json.loads(line)
            if r["fr"] > a.skip:
                rows[r["role"]].append(r)
    out = {}
    for role, rs in rows.items():
        st = defaultdict(lambda: {"frames": 0, "rates": [], "slide": [], "planted": 0, "slid": 0, "pops": [], "turns": []})
        trans = defaultdict(lambda: {"n": 0, "pop": 0.0})
        # each foot's lowest height above the fighter's root (the ground)
        low = {}
        for foot in ("LeftFoot", "RightFoot"):
            hs = [r[foot][1] - r["pos"][1] for r in rs if foot in r]
            low[foot] = pct(hs, 2) if hs else 0.0
        prev = None
        since = 99
        last_change = None
        for r in rs:
            s = r["st"]
            d = st[s]
            d["frames"] += 1
            d["rates"].append(r.get("rate", 0.0))
            pop = r.get("pop", 0.0)
            d["pops"].append(pop)
            d["turns"].append(r.get("turn", 0.0))
            if prev is not None and prev["st"] != s:
                last_change = (prev["st"], s)
                trans[last_change]["n"] += 1
                since = 0
            if last_change is not None and since < 3:
                trans[last_change]["pop"] = max(trans[last_change]["pop"], pop)
            since += 1
            if prev is not None:
                if "LeftFoot" in r and "RightFoot" in r and "LeftFoot" in prev:
                    # the stance foot: the lower of the two, when it is near the ground
                    hl = r["LeftFoot"][1] - r["pos"][1] - low["LeftFoot"]
                    hr = r["RightFoot"][1] - r["pos"][1] - low["RightFoot"]
                    foot = "LeftFoot" if hl <= hr else "RightFoot"
                    h = min(hl, hr)
                    if h < 0.05:
                            v = math.hypot(r[foot][0] - prev[foot][0], r[foot][2] - prev[foot][2]) * a.fps
                            if v < 20:  # a teleport (load) is not a slide
                                d["planted"] += 1
                                d["slide"].append(v)
                                if v > 0.3:
                                    d["slid"] += 1
            prev = r
        res = {}
        for s, d in sorted(st.items(), key=lambda kv: -kv[1]["frames"]):
            res[s] = {
                "frames": d["frames"],
                "rate_med": round(pct(d["rates"], 50), 2), "rate_max": round(max(d["rates"]) if d["rates"] else 0, 2),
                "slide_mean": round(sum(d["slide"]) / len(d["slide"]), 3) if d["slide"] else None,
                "slide_share": round(d["slid"] / d["planted"], 3) if d["planted"] else None,
                "pop_p95": round(pct(d["pops"], 95), 1), "pops_over_40": sum(1 for p in d["pops"] if p > 40),
                "turn_max": round(max(d["turns"]) if d["turns"] else 0, 1), "turns_over_30": sum(1 for p in d["turns"] if p > 30),
            }
        out[role] = {"states": res, "transitions": {"%s>%s" % k: {"n": v["n"], "pop": round(v["pop"], 1)} for k, v in sorted(trans.items(), key=lambda kv: -kv[1]["pop"])}}
        print("== %s (%d frames)" % (role, len(rs)))
        print("  %-14s %6s %6s %6s %8s %8s %7s %6s %7s %6s" % ("state", "frames", "rate", "rmax", "slide", "slid%", "pop95", ">40", "turnmx", "t>30"))
        for s, v in res.items():
            print("  %-14s %6d %6.2f %6.2f %8s %8s %7.1f %6d %7.1f %6d" % (s, v["frames"], v["rate_med"], v["rate_max"],
                  "-" if v["slide_mean"] is None else "%.3f" % v["slide_mean"],
                  "-" if v["slide_share"] is None else "%.0f%%" % (100 * v["slide_share"]), v["pop_p95"], v["pops_over_40"], v["turn_max"], v["turns_over_30"]))
        print("  transitions (worst pop in the 3 frames after):")
        for k, v in list(out[role]["transitions"].items())[:14]:
            print("    %-26s n=%-3d pop=%.1f" % (k, v["n"], v["pop"]))
    if a.json:
        json.dump(out, open(a.json, "w"), indent=1)


if __name__ == "__main__":
    main()
