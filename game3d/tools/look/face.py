"""face.py: paint a cast character's face from its concept picture (cq 239).

The cast models were lifted by TRELLIS.2 from an A-pose concept (cq 060's pose/<key>/concept.png).
The lift's texture is a sample of a 1024^3 voxel colour volume, so eyes, brows and mouths come
out as smudges; the concept draws them cleanly at ~100 px a head. This projects the concept's
face onto the front-facing texels of the model's head, and only there (cq 057 found that a
whole-body projection smears; a face is small and nearly flat to the camera).

Registration is by landmarks (faces.json, per character): eye centres, nose tip and mouth centre
read off two gridded crops that this script writes when a character has none yet:
  - the model's head seen from the front (+Z, orthographic), its own texels splatted, on a
    millimetre grid: x = mm right of the head's centre line, y = mm below the model's top;
  - the concept's head crop on its pixel grid.
Automatic registration (silhouette IoU, masked NCC, ECC on gradients) was tried first and
locked onto shoulders and crowns: the lift changes head proportions by up to ~20 %.

A similarity (rotation, uniform scale, shift) fitted to the landmarks maps model mm to concept
px; every head texel that the front camera sees gets the concept colour with weight
smoothstep(n.z, 0.35, 0.75) x a fade outside the face ellipse around the landmarks
(`radius` x the eye distance). Colours are blended in Lab; the concept's low-frequency level
is shifted part of the way to the model's around the face border so the join does not show.
"""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


def texel_points(mesh: dict, S: int):
    """3D position and normal of every covered texel (barycentric in UV space)."""
    uv, idx, P = mesh["uv"], mesh["idx"], mesh["pos"]
    N = mesh.get("nrm")
    tri = np.full((S, S), -1, np.int32)
    SH = 4
    pts = np.round(uv[idx] * S * (1 << SH) - 0.5 * (1 << SH)).astype(np.int32)
    for k in range(len(idx)):
        cv2.fillConvexPoly(tri, pts[k], k, lineType=cv2.LINE_8, shift=SH)
    ys, xs = np.nonzero(tri >= 0)
    t = tri[ys, xs]
    a, b, c = uv[idx[t, 0]] * S - 0.5, uv[idx[t, 1]] * S - 0.5, uv[idx[t, 2]] * S - 0.5
    p = np.stack([xs, ys], -1).astype(np.float64)
    v0, v1, v2 = b - a, c - a, p - a
    d00, d01, d11 = (v0 * v0).sum(1), (v0 * v1).sum(1), (v1 * v1).sum(1)
    d20, d21 = (v2 * v0).sum(1), (v2 * v1).sum(1)
    den = d00 * d11 - d01 * d01
    den[np.abs(den) < 1e-12] = 1e-12
    w1 = (d11 * d20 - d01 * d21) / den
    w2 = (d00 * d21 - d01 * d20) / den
    W = np.clip(np.stack([1 - w1 - w2, w1, w2], -1), 0, 1)
    W /= W.sum(1, keepdims=True)
    pos = (P[idx[t]] * W[..., None]).sum(1)
    if N is not None:
        nr = (N[idx[t]] * W[..., None]).sum(1)
    else:
        nr = np.cross(P[idx[t, 1]] - P[idx[t, 0]], P[idx[t, 2]] - P[idx[t, 0]])
    nr /= np.linalg.norm(nr, axis=1, keepdims=True) + 1e-12
    return ys, xs, pos, nr


def head_frame(P: np.ndarray, top_band: float = 0.08):
    """the millimetre frame of the landmark grid: x right of the head's centre line, y down from the top"""
    ymax = P[:, 1].max()
    top = P[P[:, 1] > ymax - top_band]
    return float(np.median(top[:, 0])), float(ymax)


def to_mm(Q: np.ndarray, xh: float, ymax: float) -> np.ndarray:
    return np.stack([(Q[:, 0] - xh) * 1000.0, (ymax - Q[:, 1]) * 1000.0], -1)


def front_visible(P, idx, pos, xh, ymax, box):
    """texels not hidden from the front camera: z-buffer at 1 px = 1 mm over the head box"""
    x0, y0, x1, y1 = box
    Wd, Hd = x1 - x0, y1 - y0
    zid = np.full((Hd, Wd), -1, np.int32)
    q = to_mm(P, xh, ymax) - [x0, y0]
    tz = P[idx][:, :, 2].mean(1)
    qi = q[idx]
    tri_in = (qi[:, :, 0].max(1) >= 0) & (qi[:, :, 0].min(1) < Wd) & (qi[:, :, 1].max(1) >= 0) & (qi[:, :, 1].min(1) < Hd)
    SH = 2
    pts = np.round(qi * (1 << SH)).astype(np.int32)
    cand = np.nonzero(tri_in)[0]
    for k in cand[np.argsort(tz[cand])]:
        cv2.fillConvexPoly(zid, pts[k], int(k), lineType=cv2.LINE_8, shift=SH)
    z = np.full((Hd, Wd), -1e9, np.float32)
    ok = zid >= 0
    z[ok] = P[idx[zid[ok]]][:, :, 2].max(1)
    m = to_mm(pos, xh, ymax) - [x0, y0]
    mi = np.round(m).astype(int)
    inb = (mi[:, 0] >= 0) & (mi[:, 0] < Wd) & (mi[:, 1] >= 0) & (mi[:, 1] < Hd)
    vis = np.zeros(len(pos), bool)
    vis[inb] = pos[inb, 2] >= z[mi[inb, 1], mi[inb, 0]] - 0.015
    return vis, inb


def dump_grids(name: str, out: Path, model_rgb: np.ndarray, box_mm, con: np.ndarray, con_box, Z: int = 5):
    """gridded crops for reading landmarks: lines every 10 mm (model) / 10 px (concept), red every 50."""
    out.mkdir(parents=True, exist_ok=True)
    for tag, crop, box in [("model_mm", model_rgb, box_mm), ("concept_px", con[con_box[1]:con_box[3], con_box[0]:con_box[2]], con_box)]:
        x0, y0, x1, y1 = box
        im = Image.fromarray(crop).resize((crop.shape[1] * Z, crop.shape[0] * Z), Image.LANCZOS)
        d = ImageDraw.Draw(im)
        for v in range(int(np.ceil(x0 / 10) * 10), x1, 10):
            X = (v - x0) * Z
            d.line([(X, 0), (X, im.height)], fill=(255, 0, 0) if v % 50 == 0 else (0, 200, 0), width=1)
            d.text((X + 2, 2), str(v), fill=(255, 255, 0))
        for v in range(int(np.ceil(y0 / 10) * 10), y1, 10):
            Y = (v - y0) * Z
            d.line([(0, Y), (im.width, Y)], fill=(255, 0, 0) if v % 50 == 0 else (0, 200, 0), width=1)
            d.text((2, Y + 2), str(v), fill=(255, 255, 0))
        im.save(out / f"{name}_{tag}.png")


def model_front(lab, ys, xs, mm, sel, box):
    x0, y0, x1, y1 = box
    rgb = cv2.cvtColor(lab.astype(np.float32), cv2.COLOR_LAB2RGB)
    R = np.zeros((y1 - y0, x1 - x0, 3), np.float32)
    Rw = np.zeros((y1 - y0, x1 - x0), np.float32)
    q = np.round(mm[sel] - [x0, y0]).astype(int)
    np.add.at(R, (q[:, 1], q[:, 0]), rgb[ys[sel], xs[sel]])
    np.add.at(Rw, (q[:, 1], q[:, 0]), 1.0)
    R[Rw > 0] /= Rw[Rw > 0][:, None]
    R8 = np.clip(R * 255, 0, 255).astype(np.uint8)
    hole = ((Rw == 0) & (cv2.dilate((Rw > 0).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0)).astype(np.uint8)
    return cv2.inpaint(R8, hole, 2, cv2.INPAINT_TELEA)


def concept_head_box(con: np.ndarray, half: int = 90, h: int = 200):
    g = cv2.cvtColor(con, cv2.COLOR_RGB2GRAY).astype(int)
    fg = np.abs(g - np.median(g[:5])) > 25
    yy, xx = np.nonzero(fg)
    top = yy.min()
    cx = int(np.median(xx[yy < top + 40]))
    return (max(0, cx - half), max(0, top - 10), min(con.shape[1], cx + half), min(con.shape[0], top - 10 + h))


def paint_face(lab: np.ndarray, mesh: dict, S: int, concept_png: str, name: str, lm: dict | None,
               up: dict | None = None, debug: str | None = None):
    con = np.asarray(Image.open(concept_png).convert("RGB"))
    P = mesh["pos"]
    lm = lm or {}
    xh, ymax = head_frame(P, lm.get("top_band", 0.08))
    ys, xs, pos, nr = texel_points(mesh, S)
    mm = to_mm(pos, xh, ymax)
    box = tuple(lm.get("box", (-160, -20, 160, 300)))   # mm: the head and some of the shoulders
    vis, inb = front_visible(P, mesh["idx"], pos, xh, ymax, box)
    sel = vis & inb & (nr[:, 2] > 0.0)
    if debug:
        dump_grids(name, Path(debug), model_front(lab, ys, xs, mm, sel, box), box, con,
                   tuple(lm.get("concept_box", concept_head_box(con))))
    if "model" not in lm:
        return lab, {"skipped": "no landmarks (wrote the landmark sheets)"}
    A_m = np.array(lm["model"], np.float64)      # mm
    A_c = np.array(lm["concept"], np.float64)    # concept px
    if lm.get("affine", True):
        # least squares over all landmarks (RANSAC would drop a point as an outlier)
        X = np.c_[A_m, np.ones(len(A_m))]
        M = np.linalg.lstsq(X, A_c, rcond=None)[0].T
    else:
        M, _ = cv2.estimateAffinePartial2D(A_m.astype(np.float32), A_c.astype(np.float32), method=cv2.LMEDS)
    resid = np.linalg.norm(np.c_[A_m, np.ones(len(A_m))] @ M.T - A_c, axis=1)
    eye = np.linalg.norm(A_m[0] - A_m[1])
    ctr = A_m.mean(0) + np.array([0.0, lm.get("cy", 0.0)])
    rx, ry = lm.get("rx", 1.3 * eye), lm.get("ry", 1.55 * eye)
    e = np.sqrt(((mm[:, 0] - ctr[0]) / rx) ** 2 + ((mm[:, 1] - ctr[1]) / ry) ** 2)

    def sstep(x, a, b):
        x = np.clip((x - a) / (b - a), 0, 1)
        return x * x * (3 - 2 * x)
    w = sstep(nr[:, 2], lm.get("nz_lo", 0.3), lm.get("nz_hi", 0.7)) * (1.0 - sstep(e, 0.75, 1.0)) * sel * lm.get("strength", 1.0)
    hi = np.nonzero(w > 0.002)[0]
    uc = np.c_[mm[hi], np.ones(len(hi))] @ M.T     # concept px
    if up is not None:
        src, f = up["img"], up["scale"]
        sx = (uc[:, 0] - up["x0"] + 0.5) * f - 0.5
        sy = (uc[:, 1] - up["y0"] + 0.5) * f - 0.5
    else:
        src = con.astype(np.float32) / 255.0
        sx, sy = uc[:, 0], uc[:, 1]
    col = cv2.remap(src.astype(np.float32), sx.astype(np.float32).reshape(-1, 1), sy.astype(np.float32).reshape(-1, 1),
                    cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE).reshape(-1, 3)
    lab_c = cv2.cvtColor(np.clip(col, 0, 1).reshape(-1, 1, 3).astype(np.float32), cv2.COLOR_RGB2LAB).reshape(-1, 3)
    lab_o = lab[ys[hi], xs[hi]]
    ring = (e[hi] > 0.6) & (e[hi] < 1.0) & (w[hi] > 0.2)
    shift = np.zeros(3)
    if ring.sum() > 50:
        shift = np.median(lab_c[ring] - lab_o[ring], 0) * np.array([lm.get("match_l", 0.5), 0.5, 0.5])
    lab_c = lab_c - shift * sstep(e[hi], 0.3, 0.9)[:, None]
    out = lab.copy()
    out[ys[hi], xs[hi]] = lab_o + (lab_c - lab_o) * w[hi, None]
    if debug:
        dump_grids(name + "_after", Path(debug), model_front(out, ys, xs, mm, sel, box), box, con,
                   tuple(lm.get("concept_box", concept_head_box(con))))
    return out, {"landmark_resid_px": [round(float(r), 2) for r in resid],
                 "px_per_mm": round(float(np.sqrt(abs(np.linalg.det(M[:, :2])))), 3),
                 "painted_texels": int((w > 0.5).sum()), "border_shift_lab": [round(float(x), 1) for x in shift]}
