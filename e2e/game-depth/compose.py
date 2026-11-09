#!/usr/bin/env python3
"""compose.py <out_dir>: the captioned recordings (720x1280, 30 fps, H.264) from the e2e run in out_dir:
the fight (Godot's movie writer) then the reward screen (Expo web), each with plain captions."""
import os, subprocess, sys, tempfile
O = sys.argv[1]
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
T = tempfile.mkdtemp()


def caption_filters(caps):
    out = []
    for i, (a, b, text) in enumerate(caps):
        tf = f"{T}/cap{len(os.listdir(T))}_{i}.txt"
        open(tf, "w").write(text)
        out.append(f"drawtext=fontfile={FONT}:textfile={tf}:fontsize=30:fontcolor=white:line_spacing=10:"
                   f"box=1:boxcolor=black@0.62:boxborderw=18:x=(w-text_w)/2:y=h-text_h-150:enable='between(t,{a},{b})'")
    return out


def clip(src, out, start, dur, caps, reward=False):
    vf = []
    if reward:   # the phone-shaped reward screen, fitted into the fight's 720x1280 frame
        vf.append("scale=-2:1280,pad=720:1280:(ow-iw)/2:0:color=0x0b2a1e")
    vf.append("fps=30,format=yuv420p")
    vf += caption_filters(caps)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(start), "-t", str(dur), "-i", src,
                    "-vf", ",".join(vf), "-an", "-c:v", "libx264", "-crf", "20", "-preset", "medium", out], check=True)


def hold(src, out, dur, caps, reward=False):
    """A clip padded with its own last frame, so a short screen recording lasts dur seconds."""
    pad = f"tpad=stop_mode=clone:stop_duration={dur}"
    vf = ["scale=-2:1280,pad=720:1280:(ow-iw)/2:0:color=0x0b2a1e" if reward else "null", pad, "fps=30,format=yuv420p"]
    vf += caption_filters(caps)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-vf", ",".join(vf), "-t", str(dur), "-an",
                    "-c:v", "libx264", "-crf", "20", out], check=True)


def join(parts, out):
    lst = f"{T}/{os.path.basename(out)}.txt"
    open(lst, "w").write("".join(f"file '{p}'\n" for p in parts))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", out], check=True)


def dur(f):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f],
                                capture_output=True, text=True).stdout)


fb, fw, ff = f"{O}/before_fight.avi", f"{O}/win_fight.avi", f"{O}/forged_fight.avi"
db, dw, df = dur(fb), dur(fw), dur(ff)
# BEFORE (the build before this work): the end of the fight, then the practice reward
clip(fb, f"{T}/b1.mp4", db - 9, 9, [(0, 9, "Before: a 3D fight at a Quest Point")])
hold(f"{O}/reward_before.mp4", f"{T}/b2.mp4", 8, [(0, 8, "Before: the fight pays nothing.\nThe reward screen says Practice.")], reward=True)
join([f"{T}/b1.mp4", f"{T}/b2.mp4"], f"{O}/../xp-before.mp4")
# AFTER: the whole fight, then the server's pay and the level-up
clip(fw, f"{T}/a1.mp4", 0, dw, [(0, 7, "After: the game server starts the fight\nand gives it the seed to fight on"),
                               (7, 16, "The fight records every hit,\nskill and heal as it happens"),
                               (16, dw, "Guardian down.\nThe record goes to the game server.")])
hold(f"{O}/reward_after.mp4", f"{T}/a2.mp4", 13, [(0, 2.7, "The server checked every hit and paid"),
                                                 (2.7, 8.7, "+160 XP: level 2"),
                                                 (8.7, 13, "The level bar has moved, with a new card\nand the point held for your faction")], reward=True)
join([f"{T}/a1.mp4", f"{T}/a2.mp4"], f"{O}/../xp-after.mp4")
# FORGED: a lost fight reported as a win
clip(ff, f"{T}/f1.mp4", df - 7, 7, [(0, 7, "Another player loses a fight,\nthen sends it to the server as a win")])
hold(f"{O}/reward_forged.mp4", f"{T}/f2.mp4", 7, [(0, 7, "The server does not believe it:\nthe fight is held and pays nothing")], reward=True)
join([f"{T}/f1.mp4", f"{T}/f2.mp4"], f"{O}/../xp-forged-held.mp4")
join([f"{O}/../xp-before.mp4", f"{O}/../xp-after.mp4", f"{O}/../xp-forged-held.mp4"], f"{O}/../xp-before-after.mp4")
subprocess.run(["rm", "-rf", T])
for n in ("xp-before", "xp-after", "xp-forged-held", "xp-before-after"):
    print(n, round(dur(f"{O}/../{n}.mp4"), 1), "s")
