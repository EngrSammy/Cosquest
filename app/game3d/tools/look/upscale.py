#!/usr/bin/env python3
"""upscale.py: 4x the head of a concept picture with Real-ESRGAN (anime 6B) for face.py (cq 239).

  python upscale.py <concept.png> <out.png> --weights RealESRGAN_x4plus_anime_6B.pth [--box x0 y0 x1 y1]

Needs torch + spandrel (CPU is enough: a 220x260 crop takes seconds). Writes <out>.png and
<out>.json ({"x0", "y0", "scale"}: concept px (x, y) -> upscaled ((x - x0 + 0.5) * scale - 0.5, ...)).
"""
import argparse
import json
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from spandrel import ModelLoader

ap = argparse.ArgumentParser()
ap.add_argument("concept")
ap.add_argument("out")
ap.add_argument("--weights", required=True)
ap.add_argument("--box", type=int, nargs=4, default=None)
a = ap.parse_args()

im = np.asarray(Image.open(a.concept).convert("RGB"))
if a.box:
    x0, y0, x1, y1 = a.box
else:
    g = im.mean(-1)
    fg = np.abs(g - np.median(g[:5])) > 25
    yy, xx = np.nonzero(fg)
    top = yy.min()
    cx = int(np.median(xx[yy < top + 40]))
    x0, y0, x1, y1 = (int(v) for v in (max(0, cx - 130), max(0, top - 10), min(im.shape[1], cx + 130), min(im.shape[0], top + 280)))
crop = im[y0:y1, x0:x1].astype(np.float32) / 255.0
model = ModelLoader().load_from_file(a.weights).eval()
torch.set_num_threads(8)
with torch.no_grad():
    t = torch.from_numpy(crop).permute(2, 0, 1)[None]
    out = model(t)[0].permute(1, 2, 0).clamp(0, 1).numpy()
Image.fromarray((out * 255 + 0.5).astype(np.uint8)).save(a.out)
Path(a.out).with_suffix(".json").write_text(json.dumps({"x0": x0, "y0": y0, "scale": out.shape[0] / crop.shape[0]}))
print(json.dumps({"out": a.out, "box": [x0, y0, x1, y1], "size": list(out.shape[:2])}))
