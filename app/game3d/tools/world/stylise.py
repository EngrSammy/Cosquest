"""The art direction's mandatory stylise pass (ART-DIRECTION.md 4.1, tokens.json world.stylise), shared by every
photo-sourced texture in app/game3d/art/world (make_world_art.py), plus the small array helpers the generators use.

    downscale to the target texel density -> median 3 px -> posterise 24 levels -> gaussian 2 px
    -> clamp HSV saturation <= 0.55 (paint/sign accents exempt) -> re-tint: mean-match to the token hex
    normal maps: strength x0.5; roughness >= 0.6 (glass and water excepted)

Every filter wraps round the edges, so a tileable source stays tileable. Arrays are float32 0..1, HxWx3 (sRGB).
"""
from __future__ import annotations

import glob
import os

import numpy as np
from PIL import Image, ImageFilter

STYLISE = {"median_px": 3, "posterise_levels": 24, "blur_px": 2, "max_hsv_saturation": 0.55,
           "normal_strength": 0.5, "min_roughness": 0.6}


# ---------------------------------------------------------------- io
def hexc(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], np.float32)


def load(path: str, mode: str = "RGB") -> np.ndarray:
    return np.asarray(Image.open(path).convert(mode), np.float32) / 255.0


def source(src_dir: str, asset_id: str, kind: str = "Color", mode: str = "RGB") -> np.ndarray:
    """An ambientCG map (1K JPG or PNG) from <src_dir>/<Id>/."""
    f = sorted(glob.glob(os.path.join(src_dir, asset_id, f"*_{kind}.*")))
    if not f:
        raise FileNotFoundError(f"{asset_id} {kind} in {src_dir}")
    return load(f[0], mode)


def to_img(a: np.ndarray) -> Image.Image:
    return Image.fromarray((np.clip(a, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8))


def save(a: np.ndarray, path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    to_img(a).save(path, optimize=True)


# ---------------------------------------------------------------- wrap-safe filters
def _pad(a: np.ndarray, p: int) -> np.ndarray:
    return np.pad(a, ((p, p), (p, p)) + ((0, 0),) * (a.ndim - 2), mode="wrap")


def wrap_filter(a: np.ndarray, fn, pad: int = 16) -> np.ndarray:
    """Apply a PIL filter to a tileable array without seams (pads with its own wrap)."""
    p = _pad(a, pad)
    r = np.asarray(fn(to_img(p)), np.float32) / 255.0
    return r[pad:-pad, pad:-pad]


def resize_wrap(a: np.ndarray, w: int, h: int) -> np.ndarray:
    """Resize a tileable texture to w x h keeping it tileable (LANCZOS over a wrapped border)."""
    H, W = a.shape[:2]
    if (W, H) == (w, h):
        return a.copy()
    pw, ph = W // 16, H // 16
    p = np.pad(a, ((ph, ph), (pw, pw)) + ((0, 0),) * (a.ndim - 2), mode="wrap")
    sx, sy = w / W, h / H
    im = to_img(p).resize((int(round(p.shape[1] * sx)), int(round(p.shape[0] * sy))), Image.LANCZOS)
    r = np.asarray(im, np.float32) / 255.0
    cx, cy = int(round(pw * sx)), int(round(ph * sy))
    return r[cy:cy + h, cx:cx + w]


def tile_to(a: np.ndarray, w: int, h: int) -> np.ndarray:
    """Repeat a tile to fill w x h."""
    ry, rx = -(-h // a.shape[0]), -(-w // a.shape[1])
    return np.tile(a, (ry, rx) + (1,) * (a.ndim - 2))[:h, :w]


def blur(a: np.ndarray, r: float) -> np.ndarray:
    if r <= 0:
        return a
    from scipy.ndimage import gaussian_filter
    sig = (r, r) + (0,) * (a.ndim - 2)
    return gaussian_filter(a, sig, mode="wrap").astype(np.float32)


# ---------------------------------------------------------------- colour
def luma(a: np.ndarray) -> np.ndarray:
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def clamp_saturation(a: np.ndarray, max_sat: float) -> np.ndarray:
    mx = a.max(-1, keepdims=True)
    mn = a.min(-1, keepdims=True)
    s = (mx - mn) / np.maximum(mx, 1e-5)
    k = np.where(s > max_sat, max_sat / np.maximum(s, 1e-5), 1.0)
    return (mx - (mx - a) * k).astype(np.float32)


def mean_match(a: np.ndarray, target: np.ndarray, weight: np.ndarray | None = None, iters: int = 4) -> np.ndarray:
    """Multiply-match the (weighted) mean colour to `target` (the region / ground token)."""
    a = a.copy()
    for _ in range(iters):
        if weight is None:
            m = a.reshape(-1, 3).mean(0)
        else:
            w = weight.reshape(-1, 1)
            m = (a.reshape(-1, 3) * w).sum(0) / max(1e-5, w.sum())
        a = np.clip(a * (target / np.maximum(m, 1e-4)), 0.0, 1.0)
    return a.astype(np.float32)


def neutral(a: np.ndarray, mean: float = 0.8, contrast: float = 1.0) -> np.ndarray:
    """A grey of the texture's luma, its mean set to `mean` (the trim sheets' tinted areas), contrast scaled."""
    l = luma(a)
    l = (l - l.mean()) * contrast
    g = np.clip(l + mean, 0.0, 1.0)
    g = g + (mean - g.mean())
    return np.repeat(g[..., None], 3, -1).astype(np.float32)


# ---------------------------------------------------------------- the pass
def stylise(a: np.ndarray, size: tuple[int, int] | None = None, target: str | np.ndarray | None = None,
            max_sat: float | None = None, accent: bool = False, extra_soften: float = 0.0) -> np.ndarray:
    """The art direction's stylise pass. size=(w, h) is the target texel density's pixel size; target the token hex
    the mean is matched to; accent=True exempts paint/sign accents from the saturation clamp."""
    S = STYLISE
    a = a[..., :3].astype(np.float32)
    if size is not None:
        a = resize_wrap(a, size[0], size[1])
    a = wrap_filter(a, lambda im: im.filter(ImageFilter.MedianFilter(S["median_px"])))
    lv = S["posterise_levels"] - 1
    a = np.round(a * lv) / lv
    a = wrap_filter(a, lambda im: im.filter(ImageFilter.GaussianBlur(S["blur_px"])))
    if extra_soften > 0:
        a = blur(a, extra_soften)
    if not accent:
        a = clamp_saturation(a, S["max_hsv_saturation"] if max_sat is None else max_sat)
    if target is not None:
        a = mean_match(a, hexc(target) if isinstance(target, str) else target)
    return a.astype(np.float32)


def roughness(r: np.ndarray, glass: np.ndarray | None = None) -> np.ndarray:
    r = np.maximum(r, STYLISE["min_roughness"])
    if glass is not None:
        r = r * (1.0 - glass) + 0.15 * glass
    return r


def normal_from_height(h: np.ndarray, k: float = 1.0, wrap_y: bool = True) -> np.ndarray:
    """A GL normal map (+Y up, 0..1 encoded) from a height field, at the art direction's strength (x0.5)."""
    k = k * STYLISE["normal_strength"]
    if wrap_y:
        dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    else:
        hp = np.pad(h, ((1, 1), (0, 0)), mode="edge")
        dy = (hp[2:] - hp[:-2]) * 0.5
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    n = np.stack([-dx * k, dy * k, np.ones_like(h)], -1)   # image y runs down: +dh/dy_img is GL +Y
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return (n * 0.5 + 0.5).astype(np.float32)


# ---------------------------------------------------------------- tileable noise
def fnoise(h: int, w: int | None = None, beta: float = 2.0, seed: int = 0, fmin: float = 1.0,
           fmax: float | None = None) -> np.ndarray:
    """Periodic 1/f^beta noise (FFT), zero mean, unit std: tiles by construction."""
    w = w or h
    rng = np.random.default_rng(seed)
    fy = np.fft.fftfreq(h)[:, None] * h
    fx = np.fft.fftfreq(w)[None, :] * w
    f = np.sqrt(fx ** 2 + fy ** 2)
    f[0, 0] = 1.0
    amp = f ** (-beta / 2.0)
    amp[f < fmin] = 0.0
    if fmax is not None:
        amp[f > fmax] = 0.0
    ph = rng.standard_normal((h, w)) + 1j * rng.standard_normal((h, w))
    r = np.real(np.fft.ifft2(amp * ph))
    return ((r - r.mean()) / max(1e-6, r.std())).astype(np.float32)
