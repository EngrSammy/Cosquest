#!/usr/bin/env bash
# Input-to-motion latency of the Godot fight on the emulator (cq 061).
#
#   e2e/godot/latency.sh [N] [label]    a fight must be on screen (cosquest://fight3d)
#
# For each of N rounds: (move) touch down beside the joystick, wait, then push it (one
# raw evdev packet written to the touchscreen; the phone's CLOCK_REALTIME read
# right before and after the write), release; then press Attack the same way.
# inject.c reads CLOCK_REALTIME right before its write() (the times count from
# there). Godot prints `CQLAT kind=move|attack t_in_unix t_out_unix engine_ms` for the
# first moved frame (RenderingServer.frame_post_draw). End-to-end latency here =
# Godot's t_out (frame drawn) - injection time; Android's input pipeline and
# Godot's own input handling are inside it. Add up to one vsync (16.7 ms) for
# the compositor to put the frame on the glass, which this does not see.
# Needs adb root (writes /dev/input/event2). Results: $OUT/latency-<label>.tsv
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
N="${1:-20}"; label="${2:-run}"
: "${OUT:=$here/../out}"
dev=/data/local/tmp/cqlat
tmp=$(mktemp -d); trap 'rm -rf $tmp' EXIT
python3 "$here/mkevents.py" "$tmp" >/dev/null
NDK="${NDK:-$HOME/cq-work/tools/android-sdk/ndk/27.2.12479018}"
"$NDK/toolchains/llvm/prebuilt/linux-x86_64/bin/x86_64-linux-android29-clang" -O2 -static -o "$tmp/inject" "$here/inject.c"
adb shell mkdir -p $dev; adb push "$tmp"/*.bin "$tmp/inject" $dev/ >/dev/null
adb logcat -c
# One shell on the phone for all rounds: no adb round trips between write and clock.
adb shell "cd $dev; i=0; while [ \$i -lt $N ]; do
  cat down.bin > /dev/input/event2; sleep 0.25
  echo INJ move \$i \$(./inject /dev/input/event2 move.bin)
  sleep 0.7; cat up.bin > /dev/input/event2; sleep 0.8
  echo INJ attack \$i \$(./inject /dev/input/event2 atk_down.bin)
  sleep 0.12; cat atk_up.bin > /dev/input/event2; sleep 0.9
  echo INJ press \$i \$(./inject /dev/input/event2 stick_tap.bin)
  sleep 0.6; cat up.bin > /dev/input/event2; sleep 0.8
  i=\$((i+1)); done" > "$tmp/inj.txt"
sleep 1
adb logcat -d | grep "CQLAT" | grep -v "src=bot" > "$tmp/lat.txt"
python3 - "$tmp/inj.txt" "$tmp/lat.txt" "$OUT/latency-$label.tsv" <<'PY'
import re, statistics, sys
inj = [l.split() for l in open(sys.argv[1]) if l.startswith("INJ")]
lat = []
for l in open(sys.argv[2]):
    m = dict(re.findall(r"(\w+)=([^\s]+)", l))
    if "t_in_unix" in m:
        lat.append((m["kind"], float(m["t_in_unix"]), float(m["t_out_unix"]), float(m["engine_ms"])))
rows = []
for kind, i, a, b in [(x[1], int(x[2]), float(x[3]), float(x[4])) for x in inj]:
    # the first Godot record of this kind whose input arrived after the write began
    want = "move" if kind == "press" else kind   # a press on the stick is a move record
    cand = [x for x in lat if x[0] == want and a <= x[1] < a + 1.0]
    if not cand:
        rows.append((kind, i, a, b, None, None, None)); continue
    k, tin, tout, eng = cand[0]
    rows.append((kind, i, a, b, (tin - a) * 1000, (tout - a) * 1000, eng))
with open(sys.argv[3], "w") as f:
    f.write("kind\ti\tinject_start\tinject_end\tdelivery_ms\tend_to_end_ms\tengine_ms\n")
    for r in rows:
        f.write("\t".join("" if v is None else (f"{v:.3f}" if isinstance(v, float) else str(v)) for v in r) + "\n")
for kind in ("move", "press", "attack"):
    e2e = [r[5] for r in rows if r[0] == kind and r[5] is not None]
    dl = [r[4] for r in rows if r[0] == kind and r[4] is not None]
    en = [r[6] for r in rows if r[0] == kind and r[6] is not None]
    miss = sum(1 for r in rows if r[0] == kind and r[5] is None)
    if e2e:
        q = statistics.quantiles(e2e, n=20) if len(e2e) > 1 else [e2e[0]] * 19
        print(f"{kind}: n={len(e2e)} missed={miss} end_to_end_ms p50={statistics.median(e2e):.1f} p95={q[18]:.1f} max={max(e2e):.1f}"
              f" | delivery_ms p50={statistics.median(dl):.1f} | engine_ms p50={statistics.median(en):.1f}"
              f" | write window p50={statistics.median([(r[3]-r[2])*1000 for r in rows if r[0]==kind]):.1f} ms")
    else:
        print(f"{kind}: no matches (missed={miss})")
PY
