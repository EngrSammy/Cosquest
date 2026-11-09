#!/usr/bin/env python3
"""compose_place.py <out_dir>: the place recordings (720x1280, 30 fps, plain captions)."""
import os, subprocess, sys, tempfile
O = sys.argv[1]
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
T = tempfile.mkdtemp()
n = [0]


def caps(cs, y="h-text_h-150"):
    out = []
    for a, b, text in cs:
        n[0] += 1
        tf = f"{T}/c{n[0]}.txt"
        open(tf, "w").write(text)
        out.append(f"drawtext=fontfile={FONT}:textfile={tf}:fontsize=30:fontcolor=white:line_spacing=10:box=1:"
                   f"boxcolor=black@0.62:boxborderw=18:x=(w-text_w)/2:y={y}:enable='between(t,{a},{b})'")
    return out


def clip(src, out, start, dur, cs):
    vf = ",".join(["fps=30,format=yuv420p"] + caps(cs))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(start), "-t", str(dur), "-i", src, "-vf", vf, "-an",
                    "-c:v", "libx264", "-crf", "20", out], check=True)


def join(parts, out):
    lst = f"{T}/{os.path.basename(out)}.txt"
    open(lst, "w").write("".join(f"file '{p}'\n" for p in parts))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", out], check=True)


clip(f"{O}/../run2/before_fight.avi", f"{T}/b.mp4", 2, 8, [(0, 8, "Before: every 3D fight is in the same\nstreet, wherever the Quest Point is")])
clip(f"{O}/trafalgar_fight.avi", f"{T}/a.mp4", 0, 15, [(0, 3.6, "After: the fight happens where\nthe point is"),
                                                       (3.6, 9, "Built from OpenStreetMap: the column,\nits lions, the fountains, the square"),
                                                       (9, 15, "The fight itself is the same:\nthe same moves, rules and numbers")])
join([f"{T}/b.mp4"], f"{O}/../place-before.mp4")
join([f"{T}/a.mp4"], f"{O}/../place-after.mp4")
join([f"{T}/b.mp4", f"{T}/a.mp4"], f"{O}/../place-before-after.mp4")
# the layout check: the real map beside the game seen from above
lay = ("[0]scale=720:1280,drawtext=fontfile=%s:text='The real map (OpenStreetMap)':fontsize=34:fontcolor=white:box=1:boxcolor=black@0.62:boxborderw=14:x=(w-text_w)/2:y=40[a];"
       "[1]scale=720:1280,drawtext=fontfile=%s:text='The game, seen from above':fontsize=34:fontcolor=white:box=1:boxcolor=black@0.62:boxborderw=14:x=(w-text_w)/2:y=1170[b];"
       "[a][b]hstack=2") % (FONT, FONT)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", f"{O}/trafalgar_osm.png", "-i", f"{O}/trafalgar_overhead.png",
                "-filter_complex", lay, f"{O}/../place-layout-check.png"], check=True)
subprocess.run(["rm", "-rf", T])
print("ok")
