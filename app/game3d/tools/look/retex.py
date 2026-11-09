#!/usr/bin/env python3
"""retex.py: clean a cast character's textures in place on its own mesh and UVs (cq 239).

Only the two embedded images change (base colour JPEG, metallic-roughness PNG); every mesh,
skin, joint, weight, UV and animation byte is copied as it is, so cq 014's rigs, clips and
tear gate stay valid (tools/look/same_rig.py checks it).

Per LOD, on that LOD's own atlas:
1. UV islands: triangles that share a vertex index are one island (glTF splits vertices at
   UV seams); every texel gets its island id. No filter below reads across islands, so a
   neighbouring island's colour never bleeds in (cq 057's E2 failure).
2. Base colour: an island-aware, edge-preserving smoothing (iterated joint bilateral in Lab,
   radius 1 and 2) takes out the lift's voxel speckle and blotches but keeps the edges between
   materials (trim, emblems, eyes).
3. Optional soft pull toward the character's palette, k-means of the deck picture: a texel
   within `pull_de` of a palette colour moves `pull` of the way in a and b (chroma), less in L.
4. Metallic-roughness: the same island-aware smoothing on both channels; metal is pushed to
   clean 0 / 1 (no half-metal blotches that sparkle as specular noise); a texel whose base
   colour is skin, cloth-dark or saturated non-gold is not metal.
5. Face (optional, --face): see face.py.
6. Gutters: push-pull fill from each island's own border so mipmaps do not pull in black.

  python retex.py --glb in.glb --out out.glb --ref deck_front.png [--cfg cfg.json] [--debug dir]
"""
from __future__ import annotations

import argparse
import io
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import glbio  # noqa: E402

DEFAULT = {
    "smooth_iters": 4,       # bilateral passes (each: radius 1 then 2)
    "sigma_lab": 7.0,        # Lab distance at which a neighbour's weight falls to 1/e
    "pull": 0.0,             # palette pull in a, b (0 = off)
    "pull_l": 0.0,           # palette pull in L
    "pull_de": 18.0,         # only texels this close (Lab) to a palette colour
    "palette_k": 10,
    "metal_clean": True,
    "metal_sharp": 6.0,      # logistic slope of the 0/1 push
    "rough_min": 0.35,       # roughness floor for metal (no mirror-like patches)
    "rough_dielectric": 0.55,  # roughness floor for everything else
    "sat": 1.0,              # chroma gain after cleaning
    "contrast": 1.0,         # L contrast about the mean after cleaning
    "jpeg_q": 92,
}


# ---------------------------------------------------------------- colour
def srgb_to_lab(rgb8: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(rgb8.astype(np.float32) / 255.0, cv2.COLOR_RGB2LAB)


def lab_to_srgb(lab: np.ndarray) -> np.ndarray:
    rgb = cv2.cvtColor(lab.astype(np.float32), cv2.COLOR_LAB2RGB)
    return np.clip(rgb * 255.0 + 0.5, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------- UV raster
def islands_of(idx: np.ndarray, nv: int) -> np.ndarray:
    parent = np.arange(nv)

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for t in idx:
        r0 = find(t[0])
        for v in t[1:]:
            r = find(v)
            if r != r0:
                parent[r] = r0
    roots = np.array([find(v) for v in range(nv)])
    _, comp = np.unique(roots, return_inverse=True)
    return comp[idx[:, 0]]


def raster_islands(uv: np.ndarray, idx: np.ndarray, tri_island: np.ndarray, size: int) -> np.ndarray:
    """island id + 1 per texel (0 = empty). Texel centres; glTF uv (0,0) is the image's top left."""
    img = np.zeros((size, size), np.int32)
    SH = 4
    pts = np.round(uv[idx] * size * (1 << SH) - 0.5 * (1 << SH)).astype(np.int32)
    for k in range(len(idx)):
        cv2.fillConvexPoly(img, pts[k], int(tri_island[k]) + 1, lineType=cv2.LINE_8, shift=SH)
    return img


# ---------------------------------------------------------------- filters
_OFFS = {1: [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]}
_OFFS[2] = [(2 * a, 2 * b) for a, b in _OFFS[1]]


def _shift(a: np.ndarray, dy: int, dx: int, fill=0) -> np.ndarray:
    out = np.full_like(a, fill)
    H, W = a.shape[:2]
    ys, yd = (slice(dy, H), slice(0, H - dy)) if dy >= 0 else (slice(0, H + dy), slice(-dy, H))
    xs, xd = (slice(dx, W), slice(0, W - dx)) if dx >= 0 else (slice(0, W + dx), slice(-dx, W))
    out[yd, xd] = a[ys, xs]
    return out


def island_bilateral(val: np.ndarray, guide: np.ndarray | None, isl: np.ndarray, iters: int, sigma: float) -> np.ndarray:
    """Iterated joint bilateral on `val` (H,W,C) guided by `guide` (H,W,G; None = by itself), never across islands."""
    v = val.astype(np.float32).copy()
    same_val = guide is None
    g = v if same_val else guide.astype(np.float32)
    inv = 1.0 / (2.0 * sigma * sigma)
    for _ in range(iters):
        for r in (1, 2):
            acc = v.copy()
            wsum = np.ones(v.shape[:2], np.float32)
            for dy, dx in _OFFS[r]:
                ni = _shift(isl, dy, dx)
                ok = (ni == isl) & (isl > 0)
                gn = _shift(g, dy, dx)
                d2 = ((gn - g) ** 2).sum(-1)
                w = np.exp(-d2 * inv) * ok
                acc += _shift(v, dy, dx) * w[..., None]
                wsum += w
            v = acc / wsum[..., None]
            if same_val:
                g = v
    return v


def push_pull(img: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Fill texels outside `mask` from the inside (pyramid push-pull)."""
    img = img.astype(np.float32)
    levels = []
    c, m = img * mask[..., None], mask.astype(np.float32)
    while min(c.shape[:2]) > 1:
        levels.append((c, m))
        h, w = c.shape[0] // 2, c.shape[1] // 2
        c = c[:2 * h, :2 * w].reshape(h, 2, w, 2, -1).sum((1, 3))
        m = m[:2 * h, :2 * w].reshape(h, 2, w, 2).sum((1, 3))
        nz = m > 0
        c[nz] /= m[nz][:, None]
        m = nz.astype(np.float32)
        c = c * m[..., None]
    filled = c
    for c, m in reversed(levels):
        up = cv2.resize(filled, (c.shape[1], c.shape[0]), interpolation=cv2.INTER_LINEAR)
        if up.ndim == 2:
            up = up[..., None]
        filled = np.where(m[..., None] > 0, c, up)
    return filled


# ---------------------------------------------------------------- palette
def deck_palette(ref_png: str, k: int) -> np.ndarray:
    im = Image.open(ref_png).convert("RGBA")
    a = np.asarray(im)
    fg = a[..., 3] > 200
    px = a[..., :3][fg]
    if len(px) > 60000:
        px = px[np.random.default_rng(0).choice(len(px), 60000, replace=False)]
    lab = srgb_to_lab(px.reshape(-1, 1, 3)).reshape(-1, 3)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.5)
    cv2.setRNGSeed(0)
    _, _, centres = cv2.kmeans(lab.astype(np.float32), k, None, crit, 3, cv2.KMEANS_PP_CENTERS)
    return centres


def palette_pull(lab: np.ndarray, pal: np.ndarray, pull: float, pull_l: float, de: float) -> np.ndarray:
    flat = lab.reshape(-1, 3)
    d = ((flat[:, None, :] - pal[None]) ** 2).sum(-1)
    j = d.argmin(1)
    dist = np.sqrt(d[np.arange(len(flat)), j])
    w = np.clip(1.0 - dist / de, 0.0, 1.0)
    tgt = pal[j]
    out = flat.copy()
    out[:, 1:] += (tgt[:, 1:] - flat[:, 1:]) * (w * pull)[:, None]
    out[:, 0] += (tgt[:, 0] - flat[:, 0]) * (w * pull_l)
    return out.reshape(lab.shape)


# ---------------------------------------------------------------- main
def process(glb: str, out: str, ref: str | None, cfg: dict, debug: str | None, face=None) -> dict:
    t0 = time.time()
    doc = glbio.Glb(glb)
    mesh = doc.mesh_arrays()
    base = np.asarray(Image.open(io.BytesIO(doc.image_bytes(0))).convert("RGB"))
    mr = np.asarray(Image.open(io.BytesIO(doc.image_bytes(1))).convert("RGB"))
    S = base.shape[0]
    tri_isl = islands_of(mesh["idx"], len(mesh["uv"]))
    isl = raster_islands(mesh["uv"], mesh["idx"], tri_isl, S)
    inside = isl > 0
    # 1px dilation of the islands so the texels the bilinear sample touches at the border are cleaned too
    isl_d = cv2.dilate(isl.astype(np.float32), np.ones((3, 3), np.uint8)).astype(np.int32)
    isl_d = np.where(inside, isl, isl_d)
    inside_d = isl_d > 0
    info = {"glb": glb, "size": S, "islands": int(tri_isl.max() + 1), "coverage": round(float(inside.mean()), 3)}

    lab = srgb_to_lab(base)
    if cfg["smooth_iters"] > 0:
        lab = island_bilateral(lab, None, isl_d, cfg["smooth_iters"], cfg["sigma_lab"])
    if face is not None:
        lab, finfo = face(lab, mesh, isl_d, S)
        info["face"] = finfo
    if ref and cfg["pull"] > 0:
        pal = deck_palette(ref, cfg["palette_k"])
        lab = palette_pull(lab, pal, cfg["pull"], cfg["pull_l"], cfg["pull_de"])
        info["palette"] = [[round(float(x), 1) for x in c] for c in pal]
    for rule in cfg.get("recolor", []):
        # a palette fix toward the deck: texels near a colour (Lab, within `radius` in a/b and
        # inside the L range) get their L, a, b scaled/shifted; soft at the edge of the radius
        ca, cb = rule["ab"]
        d = np.sqrt((lab[..., 1] - ca) ** 2 + (lab[..., 2] - cb) ** 2)
        wr = np.clip((rule["radius"] - d) / (0.35 * rule["radius"]), 0, 1)
        lo, hi = rule.get("L", [0, 100])
        wr *= np.clip((lab[..., 0] - lo) / 5.0, 0, 1) * np.clip((hi - lab[..., 0]) / 5.0, 0, 1)
        tgt = lab.copy()
        tgt[..., 0] = lab[..., 0] * rule.get("L_mul", 1.0) + rule.get("L_add", 0.0)
        tgt[..., 1] = (lab[..., 1] - ca) * rule.get("chroma_mul", 1.0) + rule.get("to_ab", [ca, cb])[0]
        tgt[..., 2] = (lab[..., 2] - cb) * rule.get("chroma_mul", 1.0) + rule.get("to_ab", [ca, cb])[1]
        if rule.get("exclude_bones") and "bone" in mesh:
            # e.g. Elvis's wings (cq 014's Wing_* chains): the deck's wings are cream, not robe
            bad_v = np.zeros(len(mesh["bone"]), bool)
            for pre in rule["exclude_bones"]:
                bad_v |= np.char.startswith(mesh["bone"].astype(str), pre)
            bad_t = bad_v[mesh["idx"]].any(1)
            ex = raster_islands(mesh["uv"], mesh["idx"], bad_t.astype(np.int64), S) == 2
            ex = cv2.dilate(ex.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
            wr = wr * ~ex
        lab = lab + (tgt - lab) * wr[..., None]
        info.setdefault("recolor_share", []).append(round(float((wr[inside] > 0.5).mean()), 3))
    if cfg["sat"] != 1.0:
        lab[..., 1:] *= cfg["sat"]
    if cfg["contrast"] != 1.0:
        m = lab[..., 0][inside].mean()
        lab[..., 0] = np.clip(m + (lab[..., 0] - m) * cfg["contrast"], 0, 100)
    rgb = lab_to_srgb(lab)

    mrf = mr.astype(np.float32) / 255.0
    if cfg["metal_clean"]:
        # the fight has no reflection environment: a metal texel shows almost only the sun's
        # highlight, so dark "metal" cloth renders black (Crystal-Z was 97 % metal). Metal stays
        # only where the base colour reads as gold/brass or bright silver; the rest is dielectric.
        L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
        chroma = np.sqrt(A * A + B * B)
        gold = np.clip((B - 10.0) / 10.0, 0, 1) * np.clip((L - 35.0) / 10.0, 0, 1)
        silver = np.clip((L - 62.0) / 10.0, 0, 1) * np.clip((18.0 - chroma) / 8.0, 0, 1)
        keep = np.maximum(gold, silver)
        g = np.concatenate([lab, mrf[..., 1:] * 40.0], -1)
        sm = island_bilateral(mrf, g, isl_d, 2, cfg["sigma_lab"] * 1.5)
        metal = np.clip(sm[..., 2] * keep, 0, 1)
        rough = np.where(metal > 0.5, np.maximum(sm[..., 1], cfg["rough_min"]), np.maximum(sm[..., 1], cfg["rough_dielectric"]))
        mrf = np.stack([mrf[..., 0], rough, metal], -1)
        info["metal_share_in"] = round(float((mr[..., 2][inside] > 127).mean()), 3)
        info["metal_share_out"] = round(float((metal[inside] > 0.5).mean()), 3)
    rgb_f = push_pull(rgb.astype(np.float32), inside_d)
    mr_f = push_pull(mrf, inside_d)
    rgb_o = np.clip(rgb_f + 0.5, 0, 255).astype(np.uint8)
    mr_o = np.clip(mr_f * 255.0 + 0.5, 0, 255).astype(np.uint8)

    b1 = io.BytesIO()
    Image.fromarray(rgb_o).save(b1, "JPEG", quality=cfg["jpeg_q"], subsampling=0, optimize=True)
    b2 = io.BytesIO()
    Image.fromarray(mr_o).save(b2, "PNG", optimize=True)
    doc.replace_images({0: b1.getvalue(), 1: b2.getvalue()})
    doc.save(out)
    info.update(bytes_in=Path(glb).stat().st_size, bytes_out=Path(out).stat().st_size, s=round(time.time() - t0, 1))
    if debug:
        d = Path(debug)
        d.mkdir(parents=True, exist_ok=True)
        Image.fromarray(rgb_o).save(d / "base.png")
        Image.fromarray(mr_o).save(d / "mr.png")
        Image.fromarray(base).save(d / "base_in.png")
    return info


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--glb", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--ref", default=None)
    ap.add_argument("--cfg", default=None, help="json overrides of DEFAULT")
    ap.add_argument("--debug", default=None)
    ap.add_argument("--concept", default=None, help="the A-pose concept the model was lifted from: paints the face")
    ap.add_argument("--up", default=None, help="upscale.py's head crop of the concept (png + json)")
    ap.add_argument("--faces", default=str(Path(__file__).resolve().parent / "faces.json"), help="face landmarks per character")
    ap.add_argument("--key", default=None, help="the character's key in faces.json")
    a = ap.parse_args()
    cfg = dict(DEFAULT)
    if a.cfg:
        c = json.loads(Path(a.cfg).read_text()) if a.cfg.endswith(".json") else json.loads(a.cfg)
        if "_default" in c:
            cfg.update(c["_default"])
            c = c.get(a.key, {}) if a.key else {}
        cfg.update({k: v for k, v in c.items() if not k.startswith("_")})
    face = None
    if a.concept:
        import face as face_mod
        lms = json.loads(Path(a.faces).read_text()) if a.faces and Path(a.faces).exists() else {}
        lm = lms.get(a.key, {}) if a.key else {}
        up = None
        if a.up and Path(a.up).exists():
            uj = json.loads(Path(a.up).with_suffix(".json").read_text())
            up = {"img": np.asarray(Image.open(a.up).convert("RGB")).astype(np.float32) / 255.0, **uj}
        face = lambda lab, mesh, isl, S: face_mod.paint_face(lab, mesh, S, a.concept, a.key or "face", lm, up, a.debug)
    print(json.dumps(process(a.glb, a.out, a.ref, cfg, a.debug, face)))


if __name__ == "__main__":
    main()
