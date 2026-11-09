"""The seven regional facade trim sheets (ART-DIRECTION.md 4.3, tokens.json world.trim_sheet / world.regions).

One shared layout, so place.gd's UV generator serves every region: 1024 x 1280 px = 8 m x 10 m at 128 px/m.
Rows (metres from the top): ROWS below. Each row tiles horizontally at 8 m. Per sheet:
  <name>.png      albedo, sRGB. Tinted areas (ORM B) are a neutral grey of mean luma 0.8, the shader multiplies
                  them by the building's wall colour / 0.8. Everything else is in its final colour.
  <name>_orm.png  512 x 640 RGBA: R AO, G roughness (>= 0.6, glass 0.15), B tint mask, A glass (window panes)
  <name>_n.png    512 x 640 normal map, GL (+Y up), strength x0.5 (stylise.STYLISE)
Wall materials come from ambientCG photos through the shared stylise pass; the architecture (windows, frames,
cornices, shopfronts, grilles, signs) is drawn procedurally here.
"""
from __future__ import annotations

import os

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt

import stylise as S

PX = 128
W, H = 1024, 1280
ROWS = {"parapet_cornice": (0.0, 0.6), "roof_edge": (0.6, 1.0), "upper_bay": (1.0, 4.2), "string_course": (4.2, 4.5),
        "shopfront": (4.5, 8.5), "plinth": (8.5, 9.0), "blank_wall": (9.0, 10.0)}
ACG = "https://ambientcg.com/view?id="


def px(m: float) -> int:
    return int(round(m * PX))


def col3(c) -> np.ndarray:
    if isinstance(c, str):
        return S.hexc(c)
    return np.asarray(c, np.float32)


GLASS_LO = np.array([0.20, 0.25, 0.30], np.float32)
GLASS_HI = np.array([0.46, 0.54, 0.62], np.float32)


# ---------------------------------------------------------------- wall materials (neutral, mean 0.8)
def grain(src: str, aid: str, tile_px: int, contrast: float) -> np.ndarray:
    a = S.source(src, aid)
    a = S.stylise(a, size=(tile_px, tile_px))          # the shared pass at the sheet's texel density
    g = S.neutral(a, 0.8, contrast)
    return S.tile_to(g, W, H)


def brick_wall(src: str, seed: int, course: int = 10, length: int = 32, mortar: int = 2):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W]
    row = yy // course
    off = (row % 2) * (length // 2)
    bid = (xx + off) // length
    tones = rng.normal(0.0, 0.07, (H // course + 2, W // length + 2)).astype(np.float32)
    t = tones[row, bid % (W // length)]
    m = ((yy % course) < mortar) | (((xx + off) % length) < mortar)
    g = grain(src, "Bricks085", 160, 0.55)[..., 0]
    v = np.where(m, 0.94, 0.76 + t) * (0.75 + 0.25 * g / 0.8)
    v = S.blur(v.astype(np.float32), 0.6)
    tint = np.where(m, 0.45, 1.0).astype(np.float32)
    h = np.where(m, -0.8, 0.0).astype(np.float32)
    return np.repeat(v[..., None], 3, -1), tint, h


def ashlar_wall(src: str, aid: str, seed: int, course_m: float, block_m: float, joint: int = 2, tone: float = 0.035,
                contrast: float = 0.5, chamfer: int = 0):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W]
    c = px(course_m)
    b = W // (2 ** int(round(np.log2(8.0 / block_m))))   # a block length that divides the 8 m repeat exactly (no seam)
    row = yy // c
    off = (row % 2) * (b // 2)
    bid = (xx + off) // b
    tones = rng.normal(0.0, tone, (H // c + 2, W // b + 2)).astype(np.float32)
    t = tones[row, bid % max(1, W // b)]
    dy = np.minimum(yy % c, c - 1 - yy % c)
    dx = np.minimum((xx + off) % b, b - 1 - (xx + off) % b)
    d = np.minimum(dy, dx)
    g = grain(src, aid, 256, contrast)[..., 0]
    v = (0.8 + t) * (g / 0.8)
    v = np.where(d < joint, v * 0.82, v)
    h = np.zeros((H, W), np.float32)
    if chamfer:
        h = np.clip(d / chamfer, 0, 1).astype(np.float32) * 1.5 - 1.5
    return np.repeat(v[..., None], 3, -1).astype(np.float32), np.where(d < joint, 0.6, 1.0).astype(np.float32), h


def render_wall(src: str, aid: str, seed: int, contrast: float = 0.6, streaks: float = 0.0):
    g = grain(src, aid, 512, contrast)
    lf = S.fnoise(H, W, 3.0, seed, 1, 10)[..., None] * 0.025
    v = g + lf
    if streaks > 0:   # rain streaks running down from ledges
        rng = np.random.default_rng(seed + 1)
        st = np.zeros((H, W), np.float32)
        for _ in range(70):
            x = int(rng.integers(0, W))
            y0 = int(rng.integers(0, H))
            L = int(rng.integers(60, 260))
            w = int(rng.integers(3, 9))
            st[y0:y0 + L, x:x + w] += np.linspace(1, 0, min(L, H - y0))[:, None] * rng.uniform(0.3, 1.0)
        st = S.blur(st, 3)
        v = v * (1 - streaks * np.clip(st, 0, 1))[..., None]
    v = v + (0.8 - S.luma(v).mean())
    return v.astype(np.float32), np.ones((H, W), np.float32), np.zeros((H, W), np.float32)


# ---------------------------------------------------------------- the sheet
class Sheet:
    def __init__(self, wall, seed: int = 0):
        self.alb, self.tint, self.hgt = wall[0].copy(), wall[1].copy(), wall[2].copy()
        self.wall = wall
        self.rough = np.full((H, W), 0.86, np.float32)
        self.glass = np.zeros((H, W), np.float32)
        self.noise = S.fnoise(H, W, 2.2, 900 + seed, 2, 80) * 0.5 + S.fnoise(H, W, 2.8, 901 + seed, 1, 12) * 0.5

    # -- core: paint a region (metres), masked, wrapping in x
    def paint(self, x0, y0, x1, y1, col=None, tint=0.0, rough=0.82, glass=0.0, h=None, bevel=0.0, mask=None,
              hadd=False, grain=0.035):
        X0, X1, Y0, Y1 = px(x0), px(x1), max(0, px(y0)), min(H, px(y1))
        if X1 <= X0 or Y1 <= Y0:
            return
        ys = np.arange(Y0, Y1)
        xs = np.arange(X0, X1) % W
        ym, xm = np.meshgrid((ys + 0.5) / PX, (np.arange(X0, X1) + 0.5) / PX, indexing="ij")
        m = np.ones(ym.shape, bool) if mask is None else mask(xm, ym)
        if not m.any():
            return
        idx = np.ix_(ys, xs)
        mf = m.astype(np.float32)
        if isinstance(col, tuple) and len(col) == 2 and col[0] == "wall" and isinstance(tint, float) and tint == 0.0:
            tint = "wall"   # the wall material keeps its tint mask
        if col is not None:
            if callable(col):
                c = col(xm, ym)
            elif isinstance(col, tuple) and len(col) == 2 and col[0] == "wall":   # the wall material, scaled
                c = self.wall[0][idx] * col[1]
            else:
                c = np.broadcast_to(col3(col), m.shape + (3,))
            if grain:
                c = c * (1.0 + grain * self.noise[idx])[..., None]
            self.alb[idx] = self.alb[idx] * (1 - mf[..., None]) + c * mf[..., None]
        if tint is not None:
            tv = self.wall[1][idx] if (isinstance(tint, str) and tint == "wall") else tint
            self.tint[idx] = self.tint[idx] * (1 - mf) + tv * mf
        self.rough[idx] = self.rough[idx] * (1 - mf) + rough * mf
        self.glass[idx] = self.glass[idx] * (1 - mf) + glass * mf
        if h is not None:
            if bevel > 0:
                d = distance_transform_edt(np.pad(m, 1))[1:-1, 1:-1]
                prof = np.clip(d / (bevel * PX), 0, 1)
                prof = prof * prof * (3 - 2 * prof)
            else:
                prof = mf
            hv = h * prof
            base = self.hgt[idx]
            self.hgt[idx] = np.where(m, base + hv if hadd else hv, base)

    def lines(self, segs, width_m, col, h=1.0, tint=0.0, rough=0.7, glass=0.0):
        """Thin strokes (metres) via a PIL mask: ladders, grilles, railings."""
        im = Image.new("L", (W * 2, H), 0)
        d = ImageDraw.Draw(im)
        for (a, b) in segs:
            for ox in (0, W):
                d.line([(a[0] * PX + ox, a[1] * PX), (b[0] * PX + ox, b[1] * PX)], fill=255, width=max(1, int(round(width_m * PX))))
        mm = np.asarray(im, np.float32) / 255.0
        mm = np.maximum(mm[:, :W], mm[:, W:])
        m = mm > 0.5
        c = col3(col)
        self.alb[m] = c * (1.0 + 0.03 * self.noise[m])[..., None]
        self.tint[m] = tint
        self.rough[m] = rough
        self.glass[m] = glass
        self.hgt[m] = h

    # -- building elements
    def band(self, y0, y1, col=("wall", 1.0), tint="wall", h=1.5, bevel=0.03, x0=0.0, x1=8.0, rough=0.82):
        self.paint(x0, y0, x1, y1, col=col, tint=tint, h=h, bevel=bevel, rough=rough)

    def moulding(self, y0, y1, profile, col, tint=0.0):
        """Horizontal moulding bands: profile = [(frac0, frac1, height, brightness)] top to bottom."""
        for f0, f1, hh, br in profile:
            c = col if not isinstance(col, str) or col == "wall" else col3(col) * br
            if isinstance(col, str) and col == "wall":
                c = ("wall", br)
            self.paint(0, y0 + (y1 - y0) * f0, 8, y0 + (y1 - y0) * f1, col=c, tint=tint, h=hh, bevel=0.015)

    def dentils(self, y0, y1, col, step=0.16, w=0.09, tint=0.0, h=2.5, br=1.0):
        n = int(round(8 / step))
        for i in range(n):
            x = i * 8 / n
            self.paint(x, y0, x + w, y1, col=("wall", br) if col == "wall" else col3(col) * br, tint=tint, h=h, bevel=0.012, hadd=False)

    def glass_col(self, x0, y0, x1, y1, tint_c=None, panes=1):
        def f(xm, ym):
            v = np.clip((ym - y0) / max(0.01, (y1 - y0)), 0, 1)[..., None]
            c = GLASS_HI * (1 - v) + GLASS_LO * v
            streak = (np.sin((xm - ym * 0.8) * 7.0) > 0.85)[..., None] * 0.06
            c = c + streak
            if tint_c is not None:
                c = c * 0.55 + col3(tint_c) * 0.45 * (1.2 - v * 0.5)
            return c
        return f

    def window(self, cx, top, w, hgt, frame="#F4F1EA", fw=0.07, bars=(2, 2), sash=True, arch=False,
               sill="#E3DACB", lintel=None, lintel_h=0.16, surround=None, sur_w=0.12, grille=None,
               reveal=0.07, louvres=False, glass_tint=None, hood=None):
        x0, x1, y0, y1 = cx - w / 2, cx + w / 2, top, top + hgt
        r = w / 2
        amask = None
        if arch:
            amask = lambda xm, ym: ~((ym < y0 + r) & (((xm - cx) ** 2 + (ym - (y0 + r)) ** 2) > r * r))
        if surround is not None:
            sm = None
            if arch:
                R = r + sur_w
                sm = lambda xm, ym: ~((ym < y0 + r) & (((xm - cx) ** 2 + (ym - (y0 + r)) ** 2) > R * R))
            self.paint(x0 - sur_w, y0 - sur_w, x1 + sur_w, y1, col=surround, h=1.8, bevel=0.04, mask=sm)
        if lintel is not None and not arch:
            self.paint(x0 - 0.1, y0 - lintel_h, x1 + 0.1, y0, col=lintel, h=2.2, bevel=0.03,
                       tint=(1.0 if isinstance(lintel, tuple) else 0.0))
        if hood is not None:   # a projecting hood moulding with its shadow
            self.paint(x0 - 0.22, y0 - 0.3, x1 + 0.22, y0 - 0.14, col=hood, h=3.5, bevel=0.03)
        # the opening: a dark reveal, then the glass, set back
        self.paint(x0, y0, x1, y1, col=(0.16, 0.16, 0.17), h=-4.0, bevel=0.02, mask=amask)
        gx0, gy0, gx1, gy1 = x0 + reveal, y0 + reveal, x1 - reveal, y1 - reveal * 0.6
        gmask = None
        if arch:
            rr = r - reveal
            gmask = lambda xm, ym: ~((ym < y0 + r) & (((xm - cx) ** 2 + (ym - (y0 + r)) ** 2) > rr * rr))
        self.paint(gx0, gy0, gx1, gy1, col=self.glass_col(gx0, gy0, gx1, gy1, glass_tint), rough=0.15, glass=1.0,
                   h=-3.4, mask=gmask, grain=0.01)
        if louvres:
            k = gy0 + 0.06
            while k < gy1 - 0.05:
                self.paint(gx0, k, gx1, k + 0.035, col=(0.62, 0.66, 0.68), rough=0.5, glass=0.0, h=-2.6, mask=gmask)
                k += 0.11
        # frame: outer ring + bars
        fr = col3(frame)

        def ring(xm, ym):
            inside = (xm > gx0 + fw) & (xm < gx1 - fw) & (ym > gy0 + fw) & (ym < gy1 - fw)
            if arch:
                rr2 = r - reveal - fw
                inside &= ~((ym < y0 + r) & (((xm - cx) ** 2 + (ym - (y0 + r)) ** 2) > rr2 * rr2))
                outer = ~((ym < y0 + r) & (((xm - cx) ** 2 + (ym - (y0 + r)) ** 2) > (r - reveal) ** 2))
                return outer & ~inside
            return ~inside
        self.paint(gx0, gy0, gx1, gy1, col=fr, h=-2.4, mask=ring, rough=0.7)
        nc, nr = bars
        bw = fw * 0.55
        for i in range(1, nc):
            x = gx0 + (gx1 - gx0) * i / nc
            self.paint(x - bw / 2, gy0, x + bw / 2, gy1, col=fr, h=-2.6, mask=gmask, rough=0.7)
        if sash:
            ymid = (gy0 + gy1) / 2 + (r * 0.5 if arch else 0)
            self.paint(gx0, ymid - fw * 0.6, gx1, ymid + fw * 0.6, col=fr, h=-2.2, rough=0.7)
            for half in ((gy0, ymid), (ymid, gy1)):
                for j in range(1, nr):
                    y = half[0] + (half[1] - half[0]) * j / nr
                    self.paint(gx0, y - bw / 2, gx1, y + bw / 2, col=fr, h=-2.6, mask=gmask, rough=0.7)
        else:
            for j in range(1, nr):
                y = gy0 + (gy1 - gy0) * j / nr
                self.paint(gx0, y - bw / 2, gx1, y + bw / 2, col=fr, h=-2.6, mask=gmask, rough=0.7)
        if grille is not None:
            gcol, step = grille
            segs = []
            x = gx0 + step / 2
            while x < gx1:
                segs.append(((x, gy0), (x, gy1)))
                x += step
            segs.append(((gx0, (gy0 + gy1) / 2), (gx1, (gy0 + gy1) / 2)))
            # a diamond motif in the middle (Lagos burglar-proof grille)
            mx_, my_ = (gx0 + gx1) / 2, (gy0 + gy1) / 2
            dw, dh = (gx1 - gx0) * 0.32, (gy1 - gy0) * 0.22
            segs += [((mx_ - dw, my_), (mx_, my_ - dh)), ((mx_, my_ - dh), (mx_ + dw, my_)),
                     ((mx_ + dw, my_), (mx_, my_ + dh)), ((mx_, my_ + dh), (mx_ - dw, my_))]
            segs += [((gx0, gy0 + 0.03), (gx1, gy0 + 0.03)), ((gx0, gy1 - 0.03), (gx1, gy1 - 0.03))]
            self.lines(segs, 0.028, gcol, h=1.0)
        if sill is not None:
            self.paint(x0 - 0.08, y1, x1 + 0.08, y1 + 0.09, col=sill, h=3.0, bevel=0.025,
                       tint=(1.0 if isinstance(sill, tuple) else 0.0))

    def pilaster(self, xc, w, y0, y1, col, tint=0.0, h=2.0, cap=True, base=True):
        self.paint(xc - w / 2, y0, xc + w / 2, y1, col=col, tint=tint, h=h, bevel=0.04)
        if cap:
            self.paint(xc - w / 2 - 0.05, y0, xc + w / 2 + 0.05, y0 + 0.14, col=col, tint=tint, h=h + 1, bevel=0.02)
        if base:
            self.paint(xc - w / 2 - 0.04, y1 - 0.2, xc + w / 2 + 0.04, y1, col=col, tint=tint, h=h + 0.8, bevel=0.02)

    def fascia(self, x0, x1, col, y0=4.58, y1=5.18, letters=None, h=2.4, seed=0):
        self.paint(x0, y0 - 0.06, x1, y0, col=col3(col) * 0.75, h=h + 1.2, bevel=0.01)
        self.paint(x0, y0, x1, y1, col=col, h=h, bevel=0.03, rough=0.6)
        self.paint(x0, y1, x1, y1 + 0.05, col=col3(col) * 0.65, h=h + 0.5)
        if letters:   # sign lettering as soft blocks (no words)
            rng = np.random.default_rng(seed)
            n = int(rng.integers(4, 8))
            span = (x1 - x0) * 0.7
            lw = span / n
            sx = x0 + ((x1 - x0) - span) / 2
            for i in range(n):
                hh = rng.uniform(0.22, 0.32)
                self.paint(sx + i * lw + lw * 0.12, (y0 + y1) / 2 - hh / 2, sx + (i + 1) * lw - lw * 0.12,
                           (y0 + y1) / 2 + hh / 2, col=letters, h=h + 0.6, rough=0.6)

    def shopfront_glazing(self, x0, x1, frame, y0=5.26, y1=8.12, mullions=2, transom=5.85, riser=None, glass_tint=None):
        self.paint(x0, y0, x1, y1, col=(0.14, 0.14, 0.15), h=-3.0, bevel=0.02)
        self.paint(x0 + 0.06, y0 + 0.06, x1 - 0.06, y1 - 0.04, col=self.glass_col(x0, y0, x1, y1, glass_tint), glass=1.0,
                   rough=0.15, h=-2.6, grain=0.01)
        fr = col3(frame)
        self.paint(x0, y0, x1, y0 + 0.07, col=fr, h=-1.5)
        self.paint(x0, y1 - 0.06, x1, y1, col=fr, h=-1.5)
        self.paint(x0, y0, x0 + 0.07, y1, col=fr, h=-1.5)
        self.paint(x1 - 0.07, y0, x1, y1, col=fr, h=-1.5)
        if transom:
            self.paint(x0, transom - 0.035, x1, transom + 0.035, col=fr, h=-1.5)
        for i in range(1, mullions + 1):
            x = x0 + (x1 - x0) * i / (mullions + 1)
            self.paint(x - 0.035, y0, x + 0.035, y1, col=fr, h=-1.5)
        if riser is not None:
            self.paint(x0, y1, x1, 8.5, col=riser, h=1.2, bevel=0.03)
            self.paint(x0 + 0.12, y1 + 0.09, x1 - 0.12, 8.5 - 0.08, col=col3(riser) * 0.86, h=0.4, bevel=0.02)

    def door(self, x0, x1, col, top=6.05, fan=True, frame="#F4F1EA", panels=True, glazed=False, arch=False):
        cx = (x0 + x1) / 2
        if fan:
            self.window(cx, top - 0.5, x1 - x0, 0.44, frame=frame, bars=(3, 1), sash=False, sill=None, reveal=0.05, arch=arch)
        self.paint(x0, top, x1, 8.5, col=(0.12, 0.12, 0.13), h=-4.0, bevel=0.02)
        self.paint(x0 + 0.06, top + 0.06, x1 - 0.06, 8.5, col=col, h=-2.8, bevel=0.02, rough=0.55)
        if glazed:
            self.paint(x0 + 0.14, top + 0.14, x1 - 0.14, top + 1.25, col=self.glass_col(x0, top, x1, top + 1.2), glass=1.0, rough=0.15, h=-3.4)
        elif panels:
            for py0, py1 in ((top + 0.18, top + 1.1), (top + 1.3, 8.5 - 0.22)):
                self.paint(x0 + 0.16, py0, x1 - 0.16, py1, col=col3(col) * 1.12, h=-2.2, bevel=0.03, rough=0.55)
        self.paint(cx + 0.22, top + 1.2, cx + 0.3, top + 1.3, col="#C9A64A", h=-1.8, rough=0.45)   # knob

    def shutter(self, x0, x1, y0=5.26, y1=8.5, col=(0.6, 0.62, 0.64), box=True):
        if box:
            self.paint(x0, y0 - 0.1, x1, y0 + 0.22, col=col3(col) * 0.85, h=1.0, bevel=0.02, rough=0.6)
        self.paint(x0 + 0.05, y0 + 0.22, x1 - 0.05, y1, col=col, h=-1.0, rough=0.6)
        yy = y0 + 0.22
        while yy < y1:
            self.paint(x0 + 0.05, yy, x1 - 0.05, yy + 0.025, col=col3(col) * 0.72, h=-1.8, rough=0.6)
            yy += 0.085
        self.paint(x0 + 0.05, y1 - 0.08, x1 - 0.05, y1, col=col3(col) * 0.6, h=-0.6, rough=0.6)

    def awning(self, x0, x1, y0, y1, a, b, scallop=True):
        def f(xm, ym):
            s = (np.floor((xm - x0) / 0.25) % 2)[..., None]
            v = np.clip((ym - y0) / (y1 - y0), 0, 1)[..., None]
            return (col3(a) * s + col3(b) * (1 - s)) * (1.05 - 0.25 * v)
        m = None
        if scallop:
            m = lambda xm, ym: ym < y1 - 0.08 + 0.08 * np.abs(np.sin((xm - x0) / 0.25 * np.pi))
        self.paint(x0, y0, x1, y1, col=f, h=3.0, bevel=0.04, mask=m, rough=0.75)
        self.paint(x0, y1 - 0.02, x1, y1 + 0.18, col=(0.1, 0.1, 0.11), h=-1.0, mask=lambda xm, ym: ym < y1 + 0.18 - (ym - y1) * 0.0, grain=0)

    # -- finish: AO, normal, baked light, maps
    def finish(self, name: str, out: str) -> None:
        h = self.hgt
        n = S.normal_from_height(h, 1.6, wrap_y=False)
        nn = n * 2 - 1
        cav = np.clip(S.blur(h, 5) - h, 0, None)
        hp = np.pad(h, ((8, 0), (0, 0)), mode="edge")[:-8]       # what stands 8 px (6 cm) above casts down
        drop = S.blur(np.clip(hp - h - 0.5, 0, None), 3)
        ao = np.clip(1.0 - cav * 0.07 - drop * 0.09, 0.35, 1.0).astype(np.float32)
        L = np.array([-0.35, 0.55, 0.76], np.float32)
        L /= np.linalg.norm(L)
        lit = (nn * L).sum(-1)
        shade = 1.0 + 0.55 * (lit - L[2])
        alb = self.alb * (shade * (0.55 + 0.45 * ao))[..., None]
        # tinted areas back to a mean luma of 0.8
        w = np.clip((self.tint - 0.5) * 2, 0, 1)
        lm = (S.luma(alb) * w).sum() / max(1.0, w.sum())
        alb = alb * (1 + (0.8 / lm - 1) * w)[..., None]
        alb = np.clip(alb, 0, 1)
        S.save(alb, os.path.join(out, f"{name}.png"))
        rough = S.roughness(self.rough, self.glass)
        orm = np.stack([ao, rough, self.tint, self.glass], -1)
        # per channel: PIL premultiplies RGBA when resizing, which would zero RGB wherever glass (A) is 0
        chans = [np.asarray(S.to_img(orm[..., i]).resize((W // 2, H // 2), Image.LANCZOS), np.float32) / 255 for i in range(4)]
        chans[1] = np.where(chans[3] < 0.5, np.maximum(chans[1], S.STYLISE["min_roughness"]), chans[1])   # AD: >= 0.6 off glass
        Image.merge("RGBA", [S.to_img(c) for c in chans]).save(os.path.join(out, f"{name}_orm.png"), optimize=True)
        nh = S.to_img(n).resize((W // 2, H // 2), Image.LANCZOS)
        a = np.asarray(nh, np.float32) / 255 * 2 - 1
        a /= np.linalg.norm(a, axis=-1, keepdims=True)
        S.save(a * 0.5 + 0.5, os.path.join(out, f"{name}_n.png"))


# ---------------------------------------------------------------- the seven sheets
TOK = {"frame": "#F4F1EA", "portland": "#E3DACB", "door_navy": "#23395B", "door_green": "#2F5D46", "door_red": "#A8332C",
       "cast_iron": "#2F3A44", "fire_escape": "#3B3F45", "awning_green": "#2F6A4F", "awning_red": "#A8332C",
       "mullion": "#8E98A3", "curtain": "#6F93AE", "wood": "#5A3F2E", "iron": "#2E2C2B", "terracotta": "#C0653E",
       "grille": "#3B3F45", "wa_concrete": "#B7B1A6", "wa_streak": "#8C857A", "tin_rust": "#A4613A", "red_brick": "#A65441"}


def sheet_uk_brick(src):
    s = Sheet(brick_wall(src, 1), 1)
    st = TOK["portland"]
    # parapet: brick with a stone coping and a stone band
    s.paint(0, 0.0, 8, 0.14, col=st, h=3.0, bevel=0.02)
    s.paint(0, 0.14, 8, 0.18, col=col3(st) * 0.7, h=2.0)
    s.paint(0, 0.48, 8, 0.6, col=st, h=2.2, bevel=0.02)
    # roof edge: a dentil course of header bricks
    s.dentils(0.68, 0.78, "wall", step=0.25, w=0.12, tint=1.0, h=2.0, br=0.9)
    s.band(0.84, 0.9, col=("wall", 0.85), h=1.0)
    # upper bay A: two 6-over-6 sashes with gauged brick flat arches
    for cx in (1.0, 3.0):
        s.window(cx, 1.45, 1.0, 1.95, bars=(3, 2), lintel=("wall", 0.78), lintel_h=0.2, sill=st)
    # B: a three-light sash with a stone surround and a window box
    s.window(6.0, 1.45, 2.3, 1.95, bars=(6, 2), surround=st, sur_w=0.1, sill=st)
    s.paint(5.0, 3.5, 7.0, 3.74, col="#2F5D46", h=3.0, bevel=0.02)
    s.paint(5.05, 3.38, 6.95, 3.52, col="#4F7A3A", h=3.5, bevel=0.03, grain=0.25)
    s.paint(0, 4.2, 8, 4.5, col=st, h=2.5, bevel=0.03)                       # string course
    # shopfront: painted timber, deep fascias, pilasters
    s.paint(0, 4.5, 8, 8.5, col=("wall", 1.0), tint="wall", h=0.0)
    for xc in (0.0, 4.0, 6.0, 8.0):
        s.pilaster(xc, 0.3, 4.5, 8.5, "#2B2E33")
    s.fascia(0.15, 3.85, TOK["door_navy"], letters="#E9DFC5", seed=1)
    s.shopfront_glazing(0.2, 3.8, "#2B2E33", mullions=2, riser="#2B2E33")
    s.fascia(4.15, 5.85, TOK["door_green"])
    s.door(4.5, 5.5, TOK["door_red"], frame=TOK["frame"])
    s.fascia(6.15, 7.85, "#5E1F28", letters="#E9C86A", seed=2)
    s.shutter(6.2, 7.8)
    s.paint(0, 8.5, 8, 9.0, col="#3A3A3E", h=1.2, bevel=0.03)                # plinth: painted stall base
    s.paint(0, 8.5, 8, 8.56, col=st, h=2.0)
    return s


def sheet_uk_stone(src):
    s = Sheet(ashlar_wall(src, "Concrete034", 2, 0.4, 0.9, 2, 0.03, 0.45), 2)
    st = ("wall", 1.0)
    # parapet: balustrade over a heavy cornice
    s.paint(0, 0.0, 8, 0.1, col=("wall", 1.05), tint="wall", h=3.0, bevel=0.02)
    s.paint(0, 0.1, 8, 0.46, col=(0.18, 0.18, 0.2), h=-3.0)
    for i in range(32):
        x = i * 0.25 + 0.125

        def bal(xm, ym, x=x):
            t = (ym - 0.1) / 0.36
            prof = 0.045 + 0.045 * np.sin(np.clip(t, 0, 1) * np.pi) ** 2 + 0.02 * (t > 0.85)
            return np.abs(xm - x) < prof
        s.paint(x - 0.1, 0.1, x + 0.1, 0.46, col=("wall", 1.0), tint="wall", h=2.0, bevel=0.03, mask=bal)
    s.paint(0, 0.46, 8, 0.6, col=("wall", 1.0), tint="wall", h=2.2, bevel=0.02)
    s.moulding(0.6, 1.0, [(0, 0.25, 4.5, 1.05), (0.25, 0.32, 3.0, 0.7), (0.32, 0.55, 3.5, 1.0), (0.55, 0.62, 2.2, 0.8), (0.62, 1.0, 0.5, 0.95)], "wall", tint=1.0)
    s.dentils(0.83, 0.92, "wall", step=0.16, w=0.09, tint=1.0, h=3.0, br=1.02)
    # upper bay A: tall windows with architraves and a flat hood (entablature)
    for cx in (1.0, 3.0):
        s.window(cx, 1.55, 1.05, 2.05, frame=TOK["frame"], bars=(2, 2), surround=("wall", 1.04), sur_w=0.12,
                 sill=("wall", 1.05), hood=("wall", 1.06))
    # B: an arched window with a balconette
    s.window(6.0, 1.45, 1.3, 2.15, frame=TOK["frame"], bars=(2, 2), arch=True, surround=("wall", 1.04), sur_w=0.14,
             sill=("wall", 1.05))
    s.paint(5.2, 3.55, 6.8, 3.62, col=TOK["iron"], h=3.0)
    s.lines([((5.2 + i * 0.1, 3.62), (5.2 + i * 0.1, 3.95)) for i in range(17)] + [((5.2, 3.62), (6.8, 3.62))], 0.02, TOK["iron"], h=3.0)
    s.moulding(4.2, 4.5, [(0, 0.3, 3.0, 1.05), (0.3, 0.7, 2.0, 0.92), (0.7, 1.0, 1.2, 0.85)], "wall", tint=1.0)
    # rusticated ground floor with columns and arched openings
    for k in range(10):
        y = 4.5 + 0.4 * (k + 1)
        if y < 8.5:
            s.paint(0, y - 0.05, 8, y, col=("wall", 0.62), tint="wall", h=-2.0)
    s.paint(0.25, 4.6, 3.75, 5.15, col=("wall", 1.04), tint="wall", h=2.0, bevel=0.02)   # entablature, incised letters
    for i in range(9):
        s.paint(0.7 + i * 0.3, 4.78, 0.88 + i * 0.3, 4.98, col=("wall", 0.55), tint="wall", h=0.8)
    s.shopfront_glazing(0.35, 3.65, "#30383B", y0=5.3, mullions=0, transom=5.9, riser="#30383B")
    for xc in (0.35, 2.0, 3.65):    # engaged columns
        def colf(xm, ym, xc=xc):
            t = np.clip(1 - np.abs(xm - xc) / 0.18, 0, 1)
            return np.repeat((0.62 + 0.25 * np.sqrt(t))[..., None], 3, -1) * col3("#E3DACB") / 0.8
        s.paint(xc - 0.18, 5.2, xc + 0.18, 8.5, col=colf, tint=0.0, h=3.0, bevel=0.08)
        s.paint(xc - 0.24, 5.15, xc + 0.24, 5.32, col="#E3DACB", h=3.5, bevel=0.02)
        s.paint(xc - 0.24, 8.3, xc + 0.24, 8.5, col="#D5CBB9", h=3.5, bevel=0.02)
    s.window(5.0, 5.45, 1.3, 0.62, frame=TOK["frame"], bars=(4, 1), sash=False, arch=True, sill=None, reveal=0.05, surround=("wall", 1.05), sur_w=0.14)
    s.door(4.4, 5.6, TOK["door_navy"], top=6.1, fan=False)
    s.paint(6.2, 5.3, 7.8, 8.5, col=("wall", 0.62), tint="wall", h=-1.0)
    s.shutter(6.25, 7.75, y0=5.5, col=(0.42, 0.45, 0.47))
    s.paint(0, 8.5, 8, 9.0, col="#6E6C6A", h=1.5, bevel=0.03)              # granite plinth
    return s


def sheet_us_brownstone(src):
    s = Sheet(ashlar_wall(src, "Concrete012", 3, 0.5, 1.2, 1, 0.02, 0.5), 3)
    cor = "#4A3F3A"
    # bracketed sheet-metal cornice
    s.paint(0, 0.0, 8, 0.12, col=cor, h=4.5, bevel=0.02)
    s.paint(0, 0.12, 8, 0.2, col=col3(cor) * 0.7, h=3.0)
    s.paint(0, 0.2, 8, 0.6, col=col3(cor) * 0.92, h=2.4, bevel=0.02)
    for i in range(10):
        x = i * 0.8 + 0.4
        s.paint(x - 0.09, 0.14, x + 0.09, 0.58, col=col3(cor) * 1.1, h=4.0, bevel=0.03,
                mask=lambda xm, ym, x=x: np.abs(xm - x) < 0.09 - 0.05 * np.clip((ym - 0.14) / 0.44, 0, 1))
    s.dentils(0.6, 0.7, cor, step=0.2, w=0.1, h=2.4, br=0.85)
    s.paint(0, 0.7, 8, 1.0, col=col3(cor) * 0.8, h=1.6, bevel=0.02)
    for i in range(8):
        s.paint(i + 0.12, 0.76, i + 0.88, 0.94, col=col3(cor) * 0.95, h=1.0, bevel=0.02)
    # A: two 1-over-1 sashes, projecting hoods, brownstone sills
    for cx in (1.0, 3.0):
        s.window(cx, 1.55, 0.95, 1.9, frame="#3B2E28", bars=(1, 1), sill=("wall", 0.75), hood=("wall", 0.7))
    # B: windows behind a fire escape
    for cx in (5.0, 7.0):
        s.window(cx, 1.55, 0.95, 1.9, frame="#3B2E28", bars=(1, 1), sill=("wall", 0.75), hood=("wall", 0.7))
    fe = TOK["fire_escape"]
    s.paint(4.1, 3.92, 7.9, 4.02, col=fe, h=5.0)
    segs = [((4.1 + i * 0.12, 3.35), (4.1 + i * 0.12, 3.92)) for i in range(32)] + [((4.1, 3.35), (7.9, 3.35)), ((4.1, 3.6), (7.9, 3.6))]
    segs += [((7.5, 3.92), (6.2, 1.3)), ((7.75, 3.92), (6.45, 1.3))]
    segs += [((6.2 + t * 1.3, 1.3 + t * 2.62), (6.45 + t * 1.3, 1.3 + t * 2.62)) for t in np.linspace(0.05, 0.95, 13)]
    s.lines(segs, 0.022, fe, h=5.0)
    s.paint(0, 4.2, 8, 4.5, col=("wall", 0.82), tint="wall", h=2.5, bevel=0.03)
    # cast-iron storefront with an awning
    ci = TOK["cast_iron"]
    s.paint(0, 4.5, 8, 8.5, col=ci, h=0.5)
    s.fascia(0.0, 8.0, ci, y0=4.52, y1=4.9, h=2.0)
    s.awning(0.2, 3.8, 4.95, 5.6, TOK["awning_green"], "#E9E2CF")
    s.shopfront_glazing(0.2, 3.8, ci, y0=5.7, mullions=1, transom=6.2, riser=ci)
    for xc in (0.0, 4.0, 6.0, 8.0):
        s.pilaster(xc, 0.26, 4.9, 8.5, "#384551")
    s.door(4.45, 5.55, "#3B2E28", top=6.0, frame="#3B2E28", glazed=True)
    s.awning(6.15, 7.85, 4.95, 5.5, TOK["awning_red"], "#E9E2CF")
    s.shutter(6.2, 7.8, y0=5.6, col=(0.5, 0.52, 0.54), box=False)
    s.paint(0, 8.5, 8, 9.0, col="#5C5654", h=1.5, bevel=0.03)
    return s


def sheet_us_modern(src):
    s = Sheet(render_wall(src, "Concrete034", 4, 0.45), 4)
    mu = TOK["mullion"]
    s.paint(0, 0.0, 8, 0.08, col=mu, h=3.0)                             # metal cap
    s.paint(0, 0.08, 8, 0.6, col=("wall", 1.0), tint="wall", h=2.0, bevel=0.02)
    for i in range(7):
        s.paint(i * 1.2 + 0.2, 0.18, i * 1.2 + 1.2, 0.5, col=("wall", 0.97), tint="wall", h=1.0, bevel=0.03)
    s.paint(0, 0.6, 8, 0.66, col=("wall", 0.7), tint="wall", h=-1.0)
    s.paint(0, 0.66, 8, 1.0, col=s.glass_col(0, 0.66, 8, 1.0, TOK["curtain"]), glass=0.0, rough=0.25, h=-1.0)

    def curtain(x0, x1, step, fin):
        s.paint(x0, 1.0, x1, 3.62, col=s.glass_col(x0, 1.0, x1, 3.62, TOK["curtain"]), glass=1.0, rough=0.15, h=-1.5, grain=0.0)
        rng = np.random.default_rng(int(x0 * 10))
        x = x0
        while x < x1 - 0.01:      # per-pane reflection variance
            s.paint(x, 1.0, x + step, 3.62, col=s.glass_col(x, 1.0, x + step, 3.62, TOK["curtain"]),
                    glass=1.0, rough=0.15, h=-1.5, grain=0.0)
            s.alb[px(1.0):px(3.62), px(x):px(x + step)] *= rng.uniform(0.9, 1.1)
            x += step
        x = x0
        while x <= x1 + 1e-3:
            s.paint(x - fin, 1.0, x + fin, 3.62, col=mu, h=1.5 if fin > 0.04 else 0.5, bevel=0.01, rough=0.4)
            x += step
        s.paint(x0, 2.25, x1, 2.29, col=mu, h=0.3, rough=0.4)
    curtain(0.0, 4.0, 1.0, 0.035)
    curtain(4.0, 8.0, 0.8, 0.06)
    s.paint(0, 3.62, 8, 3.66, col=mu, h=0.8, rough=0.4)
    s.paint(0, 3.66, 8, 4.2, col=("wall", 1.0), tint="wall", h=1.0, bevel=0.02)       # spandrel
    s.paint(0, 4.2, 8, 4.5, col=("wall", 0.92), tint="wall", h=2.5, bevel=0.02)
    # lobby band: tall glass, steel doors, a louvre panel
    s.paint(0, 4.5, 8, 4.72, col=mu, h=3.0, bevel=0.01, rough=0.4)
    s.shopfront_glazing(0.0, 4.0, mu, y0=4.72, y1=8.5, mullions=3, transom=None)
    s.shopfront_glazing(4.0, 6.0, "#5E666E", y0=4.72, y1=8.5, mullions=1, transom=6.0)
    s.paint(4.95, 6.0, 5.05, 8.5, col="#3A3F44", h=-0.5)
    s.paint(4.6, 6.9, 4.9, 6.96, col="#C9CDD1", h=-0.5, rough=0.3)
    s.paint(5.1, 6.9, 5.4, 6.96, col="#C9CDD1", h=-0.5, rough=0.3)
    s.paint(6.0, 4.72, 8.0, 8.5, col=("wall", 0.95), tint="wall", h=0.5)
    s.paint(6.2, 5.0, 7.8, 8.3, col="#7D858C", h=-1.0, rough=0.5)
    yy = 5.05
    while yy < 8.25:
        s.paint(6.22, yy, 7.78, yy + 0.05, col="#5A6168", h=-1.8, rough=0.5)
        yy += 0.12
    s.paint(0, 8.5, 8, 9.0, col="#3E4044", h=1.0, bevel=0.02, rough=0.6)
    # blank wall: formwork panel joints and tie holes
    for x in np.arange(0, 8, 1.2):
        s.paint(x, 9.0, x + 0.02, 10.0, col=("wall", 0.75), tint="wall", h=-0.8)
        for yv in (9.25, 9.75):
            for dx in (0.3, 0.9):
                s.paint(x + dx - 0.02, yv - 0.02, x + dx + 0.02, yv + 0.02, col=("wall", 0.6), tint="wall", h=-1.0)
    return s


def sheet_us_west(src):
    s = Sheet(render_wall(src, "Plaster001", 5, 0.5), 5)
    tc = TOK["terracotta"]
    s.paint(0, 0.0, 8, 0.14, col=("wall", 1.03), tint="wall", h=2.0, bevel=0.02)

    def tiles(xm, ym):
        t = (xm % 0.2) / 0.2
        roll = np.sqrt(np.clip(1 - (2 * t - 1) ** 2, 0, 1))
        v = np.clip((ym - 0.14) / 0.46, 0, 1)
        return (col3(tc) * (0.7 + 0.35 * roll[..., None]) * (1.05 - 0.15 * v[..., None]))
    s.paint(0, 0.14, 8, 0.56, col=tiles, h=3.0, rough=0.7)
    s.paint(0, 0.5, 8, 0.6, col=tiles, h=3.5, rough=0.7,
            mask=lambda xm, ym: ym < 0.5 + 0.1 * np.sqrt(np.clip(1 - (2 * ((xm % 0.2) / 0.2) - 1) ** 2, 0, 1)))
    s.paint(0, 0.6, 8, 0.66, col=(0.2, 0.17, 0.15), h=-1.0)
    for i in range(14):        # rafter tails
        x = i * 8 / 14 + 0.2
        s.paint(x, 0.6, x + 0.13, 0.86, col=TOK["wood"], h=3.0, bevel=0.02,
                mask=lambda xm, ym: ym < 0.86 - 0.08 * np.clip((xm % (8 / 14)) / 0.13, 0, 1))
    for cx in (1.0, 3.0):
        s.window(cx, 1.4, 1.0, 2.0, frame=TOK["wood"], fw=0.08, bars=(2, 3), sash=False, arch=True, sill=("wall", 0.95), reveal=0.09)
    s.window(6.0, 1.4, 1.2, 2.1, frame=TOK["wood"], fw=0.08, bars=(2, 3), sash=False, arch=True, sill=None, reveal=0.09,
             surround=("wall", 1.05), sur_w=0.16)
    ir = TOK["iron"]
    s.paint(5.15, 3.55, 6.85, 3.62, col=ir, h=4.0)
    segs = [((5.15 + i * 0.106, 3.62), (5.15 + i * 0.106, 4.0)) for i in range(17)] + [((5.15, 3.82), (6.85, 3.82))]
    s.lines(segs, 0.022, ir, h=4.0)
    s.paint(0, 4.2, 8, 4.5, col=("wall", 0.93), tint="wall", h=2.0, bevel=0.04)
    # shopfront: an arched glazing, a striped awning, an arched door, an iron gate
    s.awning(0.15, 3.85, 4.58, 5.2, tc, "#EFE5D0")
    s.window(2.0, 5.35, 3.4, 2.75, frame=TOK["wood"], fw=0.09, bars=(4, 2), sash=False, arch=False, sill=None, reveal=0.08)
    s.paint(0.3, 8.1, 3.7, 8.5, col=("wall", 0.85), tint="wall", h=1.0, bevel=0.03)
    s.paint(4.35, 5.25, 5.65, 8.5, col=("wall", 0.9), tint="wall", h=1.5, bevel=0.05,
            mask=lambda xm, ym: ~((ym < 5.25 + 0.65) & ((xm - 5.0) ** 2 + (ym - 5.9) ** 2 > 0.65 ** 2)))
    s.paint(4.47, 5.4, 5.53, 8.5, col=TOK["wood"], h=-2.5, bevel=0.02, rough=0.6,
            mask=lambda xm, ym: ~((ym < 5.4 + 0.53) & ((xm - 5.0) ** 2 + (ym - 5.93) ** 2 > 0.53 ** 2)))
    for y in np.arange(6.1, 8.4, 0.45):
        for x in (4.62, 5.0, 5.38):
            s.paint(x - 0.03, y - 0.03, x + 0.03, y + 0.03, col=(0.2, 0.19, 0.18), h=-1.5, rough=0.5)
    s.paint(6.15, 5.3, 7.85, 8.5, col=(0.14, 0.13, 0.13), h=-3.0)
    s.lines([((6.15 + i * 0.12, 5.3), (6.15 + i * 0.12, 8.5)) for i in range(15)] + [((6.15, 5.5), (7.85, 5.5)), ((6.15, 8.3), (7.85, 8.3))],
            0.025, ir, h=0.5)
    s.paint(0, 8.5, 8, 9.0, col="#9A5A3C", h=1.2, bevel=0.03)                # terracotta tile base
    for x in np.arange(0, 8, 0.25):
        s.paint(x, 8.5, x + 0.015, 9.0, col="#6E3E2A", h=0.6)
    return s


def sheet_wa_render(src):
    s = Sheet(render_wall(src, "PaintedPlaster017", 6, 0.55, streaks=0.18), 6)
    cc, sk = TOK["wa_concrete"], TOK["wa_streak"]

    def conc(xm, ym):
        st = (np.sin(xm * 47.0) * 0.5 + 0.5) * np.clip((ym % 3.2) / 3.2, 0, 1)
        return col3(cc) * (1 - st[..., None] * 0.25) + col3(sk) * st[..., None] * 0.25
    s.paint(0, 0.0, 8, 0.6, col=conc, h=1.5, bevel=0.03)
    s.lines([((x, 0.0), (x, 0.12)) for x in np.arange(0.15, 8, 0.6)], 0.02, "#5A3A2A", h=3.0)   # rebar stubs
    s.paint(0, 0.0, 8, 0.04, col=col3(cc) * 0.8, h=2.0)

    def tin(xm, ym):
        r = 0.75 + 0.25 * np.sin(xm / 0.076 * np.pi * 2)
        rust = 0.85 + 0.15 * np.sin(xm * 3.1 + ym * 9)
        return col3(TOK["tin_rust"]) * (r * rust)[..., None]
    s.paint(0, 0.6, 8, 0.9, col=tin, h=3.0, rough=0.7)
    s.paint(0, 0.9, 8, 1.0, col=(0.16, 0.13, 0.11), h=-1.0)
    for cx in (1.0, 3.0):
        s.window(cx, 1.6, 1.15, 1.45, frame="#C9CCCF", fw=0.05, bars=(2, 1), sash=False, sill=("wall", 0.9),
                 grille=(TOK["grille"], 0.12), louvres=True)
    s.window(5.4, 1.6, 1.15, 1.45, frame="#C9CCCF", fw=0.05, bars=(2, 1), sash=False, sill=("wall", 0.9),
             grille=(TOK["grille"], 0.12), louvres=True)
    # an AC unit with a drip stain, and a small balcony railing
    s.paint(6.55, 1.95, 7.55, 2.55, col="#E2E2DC", h=4.0, bevel=0.03, rough=0.6)
    for k in range(7):
        s.paint(6.62, 2.02 + k * 0.07, 7.48, 2.05 + k * 0.07, col="#A9ACAD", h=3.5, rough=0.6)
    s.paint(7.0, 2.55, 7.06, 3.9, col=("wall", 0.72), tint="wall", h=0.0, grain=0.1)
    # bare concrete frame: columns + floor beam
    for x0, x1 in ((7.85, 8.15), (3.85, 4.15)):
        s.paint(x0, 1.0, x1, 4.5, col=conc, h=2.5, bevel=0.03)
    s.paint(0, 3.9, 8, 4.5, col=conc, h=2.5, bevel=0.03)
    # shopfront: saturated signboards, grilled glazing, a painted steel door, a blue shutter
    s.paint(0, 4.5, 8, 8.5, col=("wall", 0.95), tint="wall", h=0.0)
    s.fascia(0.1, 3.9, "#D93840", y0=4.62, y1=5.32, letters="#FFE08A", seed=5)
    s.paint(0.3, 5.0, 0.75, 5.25, col="#2D6ED2", h=3.0)
    s.shopfront_glazing(0.25, 3.75, "#C9CCCF", y0=5.5, mullions=2, transom=None, riser=conc(np.zeros((1, 1)), np.zeros((1, 1)))[0, 0])
    s.lines([((0.25 + i * 0.14, 5.5), (0.25 + i * 0.14, 8.12)) for i in range(26)], 0.02, TOK["grille"], h=1.0)
    s.fascia(4.1, 5.9, "#2D6ED2", y0=4.62, y1=5.32, letters="#FFFFFF", seed=6)
    s.door(4.5, 5.5, "#2F5D8A", top=5.9, fan=False, panels=True)
    s.lines([((4.55 + i * 0.1, 5.95), (4.55 + i * 0.1, 7.0)) for i in range(10)], 0.02, TOK["grille"], h=-1.0)
    s.fascia(6.1, 7.9, "#F2C230", y0=4.62, y1=5.32, letters="#1C2B3A", seed=7)
    s.shutter(6.15, 7.85, y0=5.45, col=(0.36, 0.52, 0.66))

    def splash(xm, ym):
        v = np.clip((ym - 8.5) / 0.5, 0, 1)[..., None]
        return col3(cc) * (1 - v * 0.5) + col3("#B5643C") * v * 0.5
    s.paint(0, 8.5, 8, 9.0, col=splash, h=1.0, bevel=0.03)
    return s


def sheet_generic(src):
    s = Sheet(render_wall(src, "Plaster001", 7, 0.5), 7)
    br = brick_wall(src, 8)
    bc = col3(TOK["red_brick"]) / 0.8
    bm = lambda xm, ym: True  # noqa: E731

    def brick(xm, ym):
        iy = np.clip((ym * PX).astype(int), 0, H - 1)
        ix = (xm * PX).astype(int) % W
        return br[0][iy, ix] * bc
    s.paint(0, 0.0, 8, 0.12, col="#BDB8AF", h=2.5, bevel=0.02)
    s.paint(0, 0.12, 8, 0.6, col=("wall", 1.0), tint="wall", h=0.5)
    s.paint(0, 0.52, 8, 0.6, col="#BDB8AF", h=1.5, bevel=0.02)
    s.paint(0, 0.6, 8, 1.0, col=("wall", 0.98), tint="wall", h=0.0)
    for cx in (1.0, 3.0):
        s.window(cx, 1.5, 1.2, 1.8, frame="#E4E6E6", bars=(2, 1), sash=False, sill="#BDB8AF", reveal=0.08)
    s.window(6.0, 1.5, 2.2, 1.8, frame="#E4E6E6", bars=(3, 1), sash=False, sill="#BDB8AF", reveal=0.08)
    s.paint(0, 4.2, 8, 4.5, col="#BDB8AF", h=2.0, bevel=0.03)
    s.paint(0, 4.5, 8, 8.5, col=brick, tint=0.0, h=0.0, grain=0.0)
    s.fascia(0.15, 3.85, "#3D5A73", letters="#F2EEE3", seed=9)
    s.shopfront_glazing(0.25, 3.75, "#4A4F55", mullions=2, riser="#4A4F55")
    s.fascia(4.15, 5.85, "#4A4F55")
    s.door(4.5, 5.5, "#5E6670", frame="#E4E6E6", glazed=True)
    s.fascia(6.15, 7.85, "#7A2E2E", letters="#F2EEE3", seed=10)
    s.shutter(6.2, 7.8)
    s.paint(0, 8.5, 8, 9.0, col="#6E6B68", h=1.2, bevel=0.03)
    return s


SHEETS = {
    "trim_uk_brick": (sheet_uk_brick, ["Bricks085"], "UK brick: stock/red brick (tint), sash windows with white frames, gauged lintels, stone coping and string course, painted timber shopfront, deep fascias, roller shutter"),
    "trim_uk_stone": (sheet_uk_stone, ["Concrete034"], "UK stone: Portland ashlar (tint), balustrade + dentil cornice, architraves and hoods, arched window with balconette, rusticated ground floor with columns"),
    "trim_us_brownstone": (sheet_us_brownstone, ["Concrete012"], "US East brownstone: smooth brownstone (tint), bracketed metal cornice, hoods, fire escape, cast-iron storefront, striped awnings"),
    "trim_us_modern": (sheet_us_modern, ["Concrete034"], "US modern: curtain wall (#6F93AE glass, #8E98A3 mullions), concrete spandrels and parapet (tint only on concrete), lobby glazing, louvre panel"),
    "trim_us_west": (sheet_us_west, ["Plaster001"], "US West: stucco (tint), terracotta tile visor, rafter tails, arched dark-wood windows, iron balconette and gate, striped awning"),
    "trim_wa_render": (sheet_wa_render, ["PaintedPlaster017"], "West Africa: painted render with rain streaks (tint), bare concrete frame, rusted tin eave, burglar-proof grilles + louvres, AC unit, saturated signboards"),
    "trim_generic": (sheet_generic, ["Plaster001", "Bricks085"], "Generic: render upper floors (tint), brick ground floor (untinted #A65441), plain windows, fascias"),
}


def make_all(src: str, out: str) -> list[dict]:
    os.makedirs(out, exist_ok=True)
    creds = []
    for name, (fn, ids, what) in SHEETS.items():
        s = fn(src)
        s.finish(name, out)
        for suf, sz, d in (("", "1024x1280", "128 (8 x 10 m)"), ("_orm", "512x640", "64"), ("_n", "512x640", "64")):
            creds.append({"file": f"trims/{name}{suf}.png", "what": (what if suf == "" else {"_orm": "ORM: R AO, G roughness, B tint mask, A glass", "_n": "normal map (GL)"}[suf]),
                          "size": sz, "px_per_m": d, "sources": ids,
                          "process": "wall material: stylise pass then greyed to mean 0.8; architecture drawn procedurally (own work), baked bevel light + AO"})
        print(name, "ok")
    return creds
