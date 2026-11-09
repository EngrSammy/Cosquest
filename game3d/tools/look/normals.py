#!/usr/bin/env python3
"""normals.py: smooth shading normals for a cast GLB, in place (cq 239).

The lift's meshes carry split normals at most corners (Armstrong LOD1: 74 % of vertices more
than 15 deg off the smooth normal at their position), so faces, hoodies and capes shade as flat
facets: the "blocky" look. This recomputes every vertex normal as the area-weighted average of
the faces around its position (UV-seam duplicates are welded by position) whose normal is within
`crease` degrees of the corner's own face, so real creases (blade edges, armour plates) stay
sharp and everything else is smooth. Only the NORMAL accessor's bytes change (same size, same
place): positions, UVs, skin, weights and clips are untouched.

  python normals.py in.glb out.glb [--crease 60]
"""
import argparse
import json

import numpy as np

import glbio


def smooth_normals(P, idx, crease_deg=60.0):
    v0, v1, v2 = P[idx[:, 0]], P[idx[:, 1]], P[idx[:, 2]]
    fn = np.cross(v1 - v0, v2 - v0)                       # area-weighted
    fu = fn / (np.linalg.norm(fn, axis=1, keepdims=True) + 1e-20)
    key = np.round(P * 1e5).astype(np.int64)
    _, grp = np.unique(key, axis=0, return_inverse=True)
    grp = grp.ravel()
    corners_t = np.repeat(np.arange(len(idx)), 3)
    corners_v = idx.ravel()
    corners_g = grp[corners_v]
    order = np.argsort(corners_g, kind="stable")
    cg = corners_g[order]
    starts = np.r_[0, np.nonzero(np.diff(cg))[0] + 1, len(cg)]
    cos_c = np.cos(np.radians(crease_deg))
    corner_n = np.zeros((len(corners_t), 3))
    for a, b in zip(starts[:-1], starts[1:]):
        cs = order[a:b]
        ts = corners_t[cs]
        U = fu[ts]
        Wn = fn[ts]
        # unique faces in the fan (a face can touch the position once)
        sim = U @ U.T >= cos_c
        corner_n[cs] = sim.astype(np.float64) @ Wn
    N = np.zeros_like(P)
    np.add.at(N, corners_v, corner_n)
    bad = np.linalg.norm(N, axis=1) < 1e-20
    N[bad] = 0.0
    N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-20
    N[bad] = [0, 1, 0]
    return N


def apply(src, dst, crease):
    g = glbio.Glb(src)
    m = g.mesh_arrays()
    pr = g.json["meshes"][0]["primitives"][0]
    ai = pr["attributes"]["NORMAL"]
    old = m["nrm"]
    N = smooth_normals(m["pos"], m["idx"], crease)
    # keep the orientation of the original where it is flipped relative (two-sided sheets)
    flip = (N * old).sum(1) < 0
    N[flip] *= -1
    g.set_accessor(ai, N.astype(np.float32))
    g.save(dst)
    dev = np.degrees(np.arccos(np.clip((N * old).sum(1), -1, 1)))
    return {"in": src, "out": dst, "crease": crease, "changed_gt15deg": round(float((dev > 15).mean()), 3), "flipped_kept": int(flip.sum())}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--crease", type=float, default=60.0)
    a = ap.parse_args()
    print(json.dumps(apply(a.src, a.dst, a.crease)))
