"""The Times Square screens (day1-world, ART-DIRECTION 4.7): one 1024 px atlas of 4 x 4 made-up ads and
colour panels, drawn here (our own art, CC0): flat shapes, gradients and generic words only, no real
brand, product, logo or person. The brightest texel stays near 0.85 so the screens never clip to white
(art direction 8: < 1 % of pixels at luma >= 0.98), and nothing is pure black (#000).

    python3 app/game3d/tools/world/make_screens.py   # writes app/game3d/art/world/misc/screens.png

Text is set in DejaVu Sans Bold (Bitstream Vera / DejaVu licence: free to use and embed), rasterised
into the texture.
"""
import math
import pathlib
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

CELL = 256
N = 4
OUT = pathlib.Path(__file__).resolve().parents[2] / "art/world/misc/screens.png"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
INK = (34, 38, 58)          # the darkest ink: deep slate, never #000
CREAM = (222, 214, 196)     # the lightest: ~0.85


def font(px):
    return ImageFont.truetype(FONT, px)


def grad(d, box, c0, c1, vertical=True):
    x0, y0, x1, y1 = box
    n = (y1 - y0) if vertical else (x1 - x0)
    for i in range(n):
        t = i / max(1, n - 1)
        c = tuple(int(a + (b - a) * t) for a, b in zip(c0, c1))
        if vertical:
            d.line([(x0, y0 + i), (x1, y0 + i)], fill=c)
        else:
            d.line([(x0 + i, y0), (x0 + i, y1)], fill=c)


def text(d, xy, s, px, fill, anchor="mm"):
    d.text(xy, s, font=font(px), fill=fill, anchor=anchor)


def cell(k):
    im = Image.new("RGB", (CELL, CELL), INK)
    d = ImageDraw.Draw(im)
    c = CELL // 2
    r = random.Random(k * 97 + 5)
    if k == 0:    # summer sale: an orange sky, a sun
        grad(d, (0, 0, CELL, CELL), (214, 96, 40), (210, 170, 70))
        d.ellipse((c - 60, 40, c + 60, 160), fill=(222, 200, 120))
        text(d, (c, 190), "SUMMER", 44, CREAM)
        text(d, (c, 230), "SALE", 36, INK)
    elif k == 1:  # live tonight: magenta, stars
        grad(d, (0, 0, CELL, CELL), (120, 30, 110), (200, 50, 120))
        for _ in range(26):
            x, y, s = r.randint(8, 248), r.randint(8, 248), r.randint(2, 5)
            d.ellipse((x - s, y - s, x + s, y + s), fill=(222, 190, 120))
        text(d, (c, 105), "LIVE", 70, CREAM)
        text(d, (c, 170), "TONIGHT", 36, (222, 190, 120))
    elif k == 2:  # the game itself
        grad(d, (0, 0, CELL, CELL), (30, 60, 120), (60, 140, 170))
        d.polygon([(c, 30), (c + 14, 150), (c, 165), (c - 14, 150)], fill=(200, 205, 214))
        d.rectangle((c - 40, 150, c + 40, 162), fill=(205, 160, 70))
        d.rectangle((c - 7, 162, c + 7, 196), fill=(120, 80, 50))
        text(d, (c, 226), "COSQUEST", 38, CREAM)
    elif k == 3:  # a city skyline at dusk
        grad(d, (0, 0, CELL, CELL), (60, 70, 150), (220, 130, 90))
        x = 0
        while x < CELL:
            w, h = r.randint(16, 40), r.randint(60, 170)
            d.rectangle((x, CELL - h, x + w, CELL), fill=(44, 46, 80))
            for wy in range(CELL - h + 8, CELL - 6, 12):
                for wx in range(x + 4, x + w - 4, 9):
                    if r.random() < 0.5:
                        d.rectangle((wx, wy, wx + 3, wy + 5), fill=(220, 190, 120))
            x += w + 2
        text(d, (c, 50), "NEW YORK", 40, CREAM)
    elif k == 4:  # open all hours: teal
        d.rectangle((0, 0, CELL, CELL), fill=(30, 140, 140))
        d.rounded_rectangle((24, 60, CELL - 24, 196), 18, outline=CREAM, width=8)
        text(d, (c, 112), "OPEN", 62, CREAM)
        text(d, (c, 166), "24 HOURS", 32, (210, 220, 150))
    elif k == 5:  # the big show: red stripes
        for i in range(0, CELL, 32):
            d.rectangle((i, 0, i + 16, CELL), fill=(190, 40, 46))
            d.rectangle((i + 16, 0, i + 32, CELL), fill=(150, 30, 40))
        d.ellipse((c - 90, c - 90, c + 90, c + 90), fill=(222, 196, 90))
        text(d, (c, c - 18), "THE BIG", 34, INK)
        text(d, (c, c + 26), "SHOW", 52, INK)
    elif k == 6:  # colour bars
        cols = [(214, 70, 60), (220, 160, 50), (90, 170, 80), (50, 140, 190), (120, 80, 170), (210, 90, 150)]
        w = CELL // len(cols)
        for i, col in enumerate(cols):
            d.rectangle((i * w, 0, (i + 1) * w, CELL), fill=col)
    elif k == 7:  # fresh: green, fruit circles
        grad(d, (0, 0, CELL, CELL), (60, 150, 70), (150, 200, 80))
        for i, col in enumerate([(220, 120, 50), (210, 60, 60), (222, 200, 80)]):
            x = 60 + i * 68
            d.ellipse((x - 34, 64, x + 34, 132), fill=col)
            d.ellipse((x - 10, 74, x + 2, 86), fill=CREAM)
        text(d, (c, 190), "FRESH", 58, CREAM)
    elif k == 8:  # play now: yellow
        d.rectangle((0, 0, CELL, CELL), fill=(222, 190, 50))
        d.polygon([(c - 46, 50), (c + 56, 110), (c - 46, 170)], fill=INK)
        text(d, (c, 212), "PLAY NOW", 38, INK)
    elif k == 9:  # hello: violet, a big speech bubble
        grad(d, (0, 0, CELL, CELL), (90, 60, 170), (150, 90, 200), vertical=False)
        d.rounded_rectangle((30, 50, CELL - 30, 170), 40, fill=CREAM)
        d.polygon([(70, 165), (110, 165), (60, 210)], fill=CREAM)
        text(d, (c, 112), "HELLO!", 50, (90, 60, 170))
    elif k == 10:  # diagonal stripes
        for i in range(-CELL, CELL * 2, 36):
            d.polygon([(i, 0), (i + 18, 0), (i + 18 - CELL, CELL), (i - CELL, CELL)], fill=(220, 120, 60))
        d.rectangle((0, 90, CELL, 166), fill=INK)
        text(d, (c, 128), "50% OFF", 50, (222, 200, 120))
    elif k == 11:  # now showing: film frames
        d.rectangle((0, 0, CELL, CELL), fill=(70, 50, 90))
        for y in (20, 216):
            d.rectangle((0, y, CELL, y + 20), fill=(44, 40, 60))
            for x in range(6, CELL, 22):
                d.rectangle((x, y + 5, x + 10, y + 15), fill=(200, 190, 170))
        text(d, (c, 100), "NOW", 54, (222, 190, 120))
        text(d, (c, 158), "SHOWING", 40, CREAM)
    elif k == 12:  # music fest: sound waves
        grad(d, (0, 0, CELL, CELL), (30, 40, 90), (200, 60, 110))
        for i in range(24):
            h = int(20 + 70 * abs(math.sin(i * 0.7 + 0.4)))
            x = 12 + i * 10
            d.rectangle((x, 120 - h, x + 6, 120 + h // 3), fill=(90, 220, 200) if i % 3 else (222, 200, 110))
        text(d, (c, 200), "MUSIC FEST", 36, CREAM)
    elif k == 13:  # tickets
        d.rectangle((0, 0, CELL, CELL), fill=(40, 120, 200))
        d.rounded_rectangle((28, 70, CELL - 28, 186), 12, fill=(222, 200, 110))
        d.ellipse((14, 112, 42, 144), fill=(40, 120, 200))
        d.ellipse((CELL - 42, 112, CELL - 14, 144), fill=(40, 120, 200))
        text(d, (c, 128), "TICKETS", 40, INK)
    elif k == 14:  # three bubbles on a warm panel
        grad(d, (0, 0, CELL, CELL), (210, 80, 70), (220, 150, 70), vertical=False)
        for i, col in enumerate([(60, 150, 170), (222, 200, 110), (120, 80, 170)]):
            x, y, rr = 70 + i * 58, 100 + (i % 2) * 50, 52
            d.ellipse((x - rr, y - rr, x + rr, y + rr), fill=col)
        text(d, (c, 222), "POP", 40, CREAM)
    else:         # coffee-ish warm panel
        grad(d, (0, 0, CELL, CELL), (120, 70, 50), (200, 140, 90))
        d.ellipse((c - 50, 50, c + 50, 150), fill=CREAM)
        d.ellipse((c - 38, 62, c + 38, 138), fill=(120, 70, 50))
        text(d, (c, 196), "GOOD", 44, CREAM)
        text(d, (c, 236), "MORNING", 28, CREAM)
    # a soft LED feel: a faint pixel grid and the edges darkened
    px = im.load()
    for y in range(0, CELL, 4):
        for x in range(CELL):
            p = px[x, y]
            px[x, y] = tuple(int(v * 0.88) for v in p)
    return im.filter(ImageFilter.GaussianBlur(0.6))


def main():
    atlas = Image.new("RGB", (CELL * N, CELL * N), INK)
    for k in range(N * N):
        atlas.paste(cell(k), ((k % N) * CELL, (k // N) * CELL))
    # clamp: brightest channel 0.87, darkest 0.08
    atlas = atlas.point(lambda v: max(20, min(222, v)))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT)
    print(OUT, atlas.size)


if __name__ == "__main__":
    main()
