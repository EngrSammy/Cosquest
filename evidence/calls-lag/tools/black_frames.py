# Share of video frames (5 fps samples of a 20 s screen recording) where the
# orbit area holds a big patch of pure black (a video circle with no picture).
import glob, os, subprocess, sys, tempfile
from PIL import Image
mp4 = sys.argv[1]
tmp = tempfile.mkdtemp(prefix="black-")
subprocess.run(["ffmpeg", "-loglevel", "error", "-threads", "2", "-i", mp4, "-vf", "fps=5,scale=360:-2", f"{tmp}/f%04d.png"], check=True)
frames = sorted(glob.glob(f"{tmp}/f*.png"))
bad = 0
for f in frames:
    im = Image.open(f).convert("RGB")
    w, h = im.size
    box = im.crop((0, int(h * 0.27), w, int(h * 0.69)))
    px = box.getdata()
    black = sum(1 for r, g, b in px if r < 14 and g < 14 and b < 14)
    if black > 0.004 * len(px):
        bad += 1
for f in frames: os.remove(f)
os.rmdir(tmp)
print(f"{os.path.basename(os.path.dirname(mp4))}: {bad}/{len(frames)} frames with a black circle ({100*bad/max(1,len(frames)):.0f}%)")
