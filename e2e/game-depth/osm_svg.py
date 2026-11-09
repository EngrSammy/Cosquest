#!/usr/bin/env python3
"""osm_svg.py <ground.json> <x> <z> <yaw_deg> <half_w_m> <out.svg>: the ground drawn flat (roads, squares,
water, green, buildings, landmarks), centred on (x, z), turned as place.gd turns it (the fight's forward
up), for a side-by-side with the game's overhead view."""
import json, math, sys
g = json.load(open(sys.argv[1])); cx, cz, yaw, half = map(float, sys.argv[2:6]); out = sys.argv[6]
W, H = 720, 1280
s = W / (2 * half)
cy, sy = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
def P(p):
    x, z = p[0] - cx, -(p[1] - cz)            # north flip, as place.gd
    rx, rz = x * cy - z * sy, x * sy + z * cy   # Vector2.rotated(yaw)
    return f"{W/2 + rx*s:.1f},{H/2 + rz*s:.1f}"
def poly(pts, fill, stroke="none", sw=0):
    return f'<polygon points="{" ".join(P(p) for p in pts)}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'
el = [f'<rect width="{W}" height="{H}" fill="#e9e4dc"/>']
for a in g.get("paved", []): el.append(poly(a["p"], "#d9d2c8"))
for a in g.get("green", []): el.append(poly(a["p"], "#a9c99a"))
for r in g.get("roads", []):
    if r["k"] in ("path", "rail"): continue
    el.append(f'<polyline points="{" ".join(P(p) for p in r["p"])}" fill="none" stroke="#9a96a0" stroke-width="{r["w"]*s:.1f}" stroke-linecap="round"/>')
for a in g.get("water", []): el.append(poly(a["p"], "#7fb2e0"))
for b in g.get("buildings", []): el.append(poly(b["p"], "#b9a48c", "#7d6a55", 1))
for m in g.get("landmarks", []):
    c = P([m["x"], m["z"]]).split(",")
    r = max(2.5, m["r"] * s if m["kind"] in ("monument", "fountain") and m["r"] > 0 else {"column": 3.0, "statue": 2.0}.get(m["kind"], 2.5) * s)
    col = {"fountain": "#3d7fc4", "statue": "#333", "column": "#555", "monument": "#888"}.get(m["kind"], "#555")
    el.append(f'<circle cx="{c[0]}" cy="{c[1]}" r="{r:.1f}" fill="{col}" fill-opacity="{0.35 if m["kind"]=="monument" else 1}"/>')
el.append(f'<rect x="{W/2-5.6*s:.1f}" y="{H/2-9*s:.1f}" width="{11.2*s:.1f}" height="{18*s:.1f}" fill="none" stroke="#e0533d" stroke-width="3" stroke-dasharray="8 6"/>')
el.append(f'<text x="16" y="{H-24}" font-family="DejaVu Sans" font-size="20" fill="#444">© OpenStreetMap contributors</text>')
open(out, "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}">' + "".join(el) + "</svg>")
