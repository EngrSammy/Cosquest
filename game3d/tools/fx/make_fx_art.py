"""cq 013: builds the effect textures procedurally (self-made, CC0 like the rest of the project's vfx_ art).

  python make_fx_art.py <out dir>    (needs numpy + pillow; deterministic: fixed seed)

fx_atlas.png  1024x1024, a 4x4 grid of 256 px cells, white RGB + shape in alpha (tinted in the shader):
   0 glow      soft radial glow (halo cards, fake bloom)
   1 star4     four-ray flare with a hot core (impact flash)
   2 burst     eight-ray spiky burst (crit / heavy impact)
   3 sparkle   thin four-point twinkle (sparkle, coins, KO)
   4 streak    a long thin spark streak, along +V (velocity-aligned sparks, speed lines)
   5 ring      a thin soft ring (shock rings)
   6 puff      a soft noisy cloud (dust)
   7 scorch    a burnt blotch with a ragged edge (ground decals)
   8 crack     radial ground cracks (SPLIT landing, crits)
   9 swirl     a three-armed spiral (WHIRL ground swirl)
  10 lines     radial speed lines with an empty centre (CHARGE start, crit streaks)
  11 halo      a wide soft ring (glow around shock rings)
  12 plus      a soft plus / cross (RALLY heal motes)
  13 shard     a triangular glass shard (SHIELD shatter)
  14 flame     a rising teardrop tongue (RALLY column, beam wisps)
  15 dot       a small hard dot with a soft edge (generic particles)
fx_tile.png   256x256 tileable, channel packed:
   R streaky energy noise (scrolls along beams and arcs)
   G hex cell edges (SHIELD pattern)
   B per-hex random id (SHIELD shatter order)
   A smooth value noise (dissolves)
"""
import sys, os
import numpy as np
from PIL import Image

N = 256
rng = np.random.default_rng(13)
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
u = (xx + 0.5) / N * 2 - 1   # -1..1
v = (yy + 0.5) / N * 2 - 1
r = np.sqrt(u * u + v * v)
ang = np.arctan2(v, u)


def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def tile_noise(n, cells, seed, octaves=4):
    """tileable value noise in 0..1 (n x n)"""
    g = np.random.default_rng(seed)
    out = np.zeros((n, n), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        c = cells * (2 ** o)
        lat = g.random((c, c)).astype(np.float32)
        x = np.arange(n) / n * c
        x0 = np.floor(x).astype(int) % c
        x1 = (x0 + 1) % c
        f = x - np.floor(x)
        f = f * f * (3 - 2 * f)
        a = lat[x0][:, x0] * (1 - f)[None, :] + lat[x0][:, x1] * f[None, :]
        b = lat[x1][:, x0] * (1 - f)[None, :] + lat[x1][:, x1] * f[None, :]
        out += amp * (a * (1 - f)[:, None] + b * f[:, None])
        tot += amp
        amp *= 0.5
    return out / tot


def cell_glow():
    return np.exp(-(r * r) / 0.16) * ss(1.0, 0.85, r)


def cell_star4():
    ray = lambda a, b: np.exp(-np.abs(a) / 0.025) * np.clip(1 - np.abs(b), 0, 1) ** 2
    s = np.maximum(ray(u, v), ray(v, u))
    d = np.exp(-np.abs(u + v) / 0.04) * np.clip(1 - r / 0.6, 0, 1) ** 2 * 0.5
    d2 = np.exp(-np.abs(u - v) / 0.04) * np.clip(1 - r / 0.6, 0, 1) ** 2 * 0.5
    core = np.exp(-(r * r) / 0.02)
    halo = np.exp(-(r * r) / 0.12) * 0.45
    return np.clip(np.maximum.reduce([s, d, d2]) + core + halo, 0, 1) * ss(1.0, 0.9, r)


def cell_burst():
    n_rays = 8
    k = np.cos(ang * n_rays / 2) ** 2
    jag = 0.55 + 0.45 * np.cos(ang * 3 + 1.3) ** 2
    spike = ss(0.95 * jag * (0.35 + 0.65 * k ** 6), 0.0, r)
    core = np.exp(-(r * r) / 0.05)
    return np.clip(spike * 0.85 + core, 0, 1) * ss(1.0, 0.9, r)


def cell_sparkle():
    ray = lambda a, b: np.clip(1 - np.abs(b), 0, 1) ** 3 * ss(0.06, 0.0, np.abs(a) * (1.4 - np.abs(b)))
    s = np.maximum(ray(u, v), ray(v, u))
    core = np.exp(-(r * r) / 0.01)
    return np.clip(s + core + np.exp(-(r * r) / 0.08) * 0.3, 0, 1) * ss(1.0, 0.9, r)


def cell_streak():
    w = 0.09 * (1 - np.abs(v)) ** 0.7
    s = np.exp(-(u * u) / np.maximum(w * w, 1e-4) * 2.5) * ss(1.0, 0.6, np.abs(v)) * (0.6 + 0.4 * (-v * 0.5 + 0.5))
    return np.clip(s * 1.2, 0, 1)


def cell_ring():
    return np.exp(-((r - 0.82) ** 2) / 0.0025) * ss(1.0, 0.95, r) + np.exp(-((r - 0.78) ** 2) / 0.02) * 0.35


def cell_puff():
    n = tile_noise(N, 4, 3, 4)
    base = np.exp(-(r * r) / 0.3)
    return np.clip(base * (0.55 + 0.9 * (n - 0.5)) * 1.3, 0, 1) * ss(1.0, 0.75, r)


def cell_scorch():
    n = tile_noise(N, 5, 5, 5)
    edge = 0.7 + 0.25 * (n - 0.5) * 2
    a = ss(edge, edge - 0.35, r) * (0.75 + 0.25 * n)
    return np.clip(a, 0, 1) * ss(1.0, 0.92, r)


def cell_crack():
    img = np.zeros((N, N), np.float32)
    g = np.random.default_rng(8)
    def line(x0, y0, x1, y1, w):
        d = np.hypot(x1 - x0, y1 - y0) + 1e-6
        t = np.clip(((u - x0) * (x1 - x0) + (v - y0) * (y1 - y0)) / (d * d), 0, 1)
        px, py = x0 + t * (x1 - x0), y0 + t * (y1 - y0)
        dist = np.hypot(u - px, v - py)
        return np.exp(-(dist * dist) / (w * w))
    def branch(x, y, a, length, w, depth):
        nonlocal img
        steps = 4
        for i in range(steps):
            a2 = a + g.normal(0, 0.35)
            nx, ny = x + np.cos(a2) * length / steps, y + np.sin(a2) * length / steps
            img = np.maximum(img, line(x, y, nx, ny, w * (1 - i * 0.18)))
            if depth > 0 and g.random() < 0.45:
                branch(nx, ny, a2 + g.choice([-1, 1]) * g.uniform(0.5, 1.0), length * 0.5, w * 0.7, depth - 1)
            x, y, a = nx, ny, a2
    for k in range(7):
        branch(0, 0, k * np.pi * 2 / 7 + g.normal(0, 0.2), g.uniform(0.6, 0.9), 0.022, 2)
    return np.clip(img * 1.1, 0, 1) * ss(1.0, 0.85, r) + np.exp(-(r * r) / 0.01) * 0.6


def cell_swirl():
    arms = 3
    s = np.cos(arms * ang + r * 7.0) ** 8
    return np.clip(s * ss(0.15, 0.4, r) * ss(1.0, 0.75, r) * (0.4 + 0.6 * r), 0, 1)


def cell_lines():
    n = 28
    g = np.random.default_rng(10)
    phase = g.random(n) * 2 * np.pi
    k = (ang / (2 * np.pi) * n) % 1.0
    idx = (np.floor(ang / (2 * np.pi) * n) % n).astype(int)
    width = 0.08 + 0.12 * g.random(n)[idx]
    inner = 0.35 + 0.3 * g.random(n)[idx]
    s = ss(width, 0.0, np.abs(k - 0.5)) * ss(inner, inner + 0.15, r) * ss(1.0, 0.8, r)
    return np.clip(s, 0, 1)


def cell_halo():
    return np.exp(-((r - 0.68) ** 2) / 0.03) * ss(1.0, 0.85, r)


def cell_plus():
    bar = lambda a, b: ss(0.16, 0.08, np.abs(a)) * ss(0.62, 0.5, np.abs(b))
    p = np.maximum(bar(u, v), bar(v, u))
    return np.clip(p + np.exp(-(r * r) / 0.2) * 0.35, 0, 1)


def cell_shard():
    # a thin triangle pointing up
    y = (v + 1) / 2   # 0 top .. 1 bottom
    half = 0.05 + 0.35 * y
    tri = ss(half, half - 0.04, np.abs(u + 0.1 * (1 - y))) * ss(0.02, 0.06, y) * ss(0.98, 0.9, y)
    return np.clip(tri * (0.6 + 0.4 * (1 - y)) + tri * ss(0.04, 0.0, np.abs(u - half + 0.04)) * 0.5, 0, 1)


def cell_flame():
    y = (v + 1) / 2
    w = 0.42 * np.sin(np.clip(y, 0, 1) * np.pi) ** 0.8 * (0.3 + 0.7 * y)
    return np.clip(ss(w, w * 0.2, np.abs(u)) * ss(0.0, 0.3, y) * ss(1.0, 0.85, y), 0, 1)


def cell_dot():
    return ss(0.85, 0.5, r)


cells = [cell_glow, cell_star4, cell_burst, cell_sparkle, cell_streak, cell_ring, cell_puff, cell_scorch,
         cell_crack, cell_swirl, cell_lines, cell_halo, cell_plus, cell_shard, cell_flame, cell_dot]


def main(out):
    os.makedirs(out, exist_ok=True)
    atlas = np.zeros((1024, 1024, 4), np.uint8)
    for i, f in enumerate(cells):
        a = np.clip(f(), 0, 1)
        a[:2, :] = 0; a[-2:, :] = 0; a[:, :2] = 0; a[:, -2:] = 0   # padding against mip bleed
        cy, cx = divmod(i, 4)
        atlas[cy * N:(cy + 1) * N, cx * N:(cx + 1) * N, :3] = 255
        atlas[cy * N:(cy + 1) * N, cx * N:(cx + 1) * N, 3] = (a * 255 + 0.5).astype(np.uint8)
    Image.fromarray(atlas, "RGBA").save(os.path.join(out, "fx_atlas.png"), optimize=True)
    # tileable channel-packed texture
    T = 256
    t = np.zeros((T, T, 4), np.float32)
    # R: energy streaks: fine noise across (v), stretched 8:1 along u (it scrolls along beams and arcs)
    fine = tile_noise(T, 32, 24, 3)
    xs = np.arange(T) / 8.0
    st_ = np.stack([np.interp(xs, np.arange(T + 1), np.append(row, row[0])) for row in fine])
    t[..., 0] = np.clip((st_ - 0.45) * 3.0, 0, 1) ** 1.3
    # G/B: hex cells (8 x 8, rows offset by half a cell), tileable at 256
    H = 8
    sz = T / H
    px = np.arange(T)[None, :].repeat(T, 0).astype(np.float32)
    py = np.arange(T)[:, None].repeat(T, 1).astype(np.float32)
    best = np.full((T, T), 1e9, np.float32); second = np.full((T, T), 1e9, np.float32); ids = np.zeros((T, T), np.float32)
    idr = np.random.default_rng(25).random((H, H)).astype(np.float32)
    for row in range(H):
        for col in range(H):
            cx = (col + (0.5 if row % 2 else 0.0)) * sz
            cy = (row + 0.5) * sz
            for ox in (-T, 0, T):
                for oy in (-T, 0, T):
                    d = np.hypot(px - cx - ox, (py - cy - oy) * 1.15)
                    closer = d < best
                    second = np.where(closer, best, np.minimum(second, d))
                    best = np.where(closer, d, best)
                    ids = np.where(closer, idr[row][col], ids)
    edge = second - best
    t[..., 1] = ss(3.0, 0.0, edge)
    t[..., 2] = ids
    t[..., 3] = tile_noise(T, 4, 26, 4)
    Image.fromarray((np.clip(t, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(os.path.join(out, "fx_tile.png"), optimize=True)
    print("wrote", out)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
