"""Rebuild a cast character's skin weights and add secondary bone chains (cq 014).

  $BLENDER_PY fix_rig.py --key elvis --src <cq 060 pose dir>/elvis --out <dir> [--spec rigspec.json]

Reads lod0/1/2.glb (cq 060's auto-rig: Mixamo-named 25-bone skeleton), writes the same three
files with:
  - the main skeleton unchanged (bone names, hierarchy, rest pose, bind matrices), so the clip
    libraries, rigs.json, the skeleton fingerprint and attach.json keep working;
  - new secondary chains (skirt / coat / wings / flames), a few bones each, parented to the hips
    or the spine; the retargeted clips never animate them, the game's secondary sim does
    (secondary_motion.gd, data/secondary.json);
  - new weights: max 4 influences, normalised, the legs weighted to the leg bones, the robe /
    coat / wings to their chains, stray weights (wrong side, far bones) removed, smoothed
    over the welded surface, identical on coincident vertices.
Nothing else changes: positions, normals, UVs, indices, materials and textures are the same
bytes (the new JOINTS_0 / WEIGHTS_0 overwrite the old ones in place, same size), so the rest
pose renders identically. LOD1 and LOD2 take LOD0's final weights by nearest-surface transfer,
then the same cleanup.

Runs on the CPU with numpy only (Blender 4.2's bundled Python).
"""
import argparse
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "anim"))
from gltf import Glb, Pose, write_glb  # noqa: E402

LEG = {s: ["%sUpLeg" % s, "%sLeg" % s, "%sFoot" % s, "%sToeBase" % s, "%sToe_End" % s] for s in ("Left", "Right")}
ARM = {s: ["%sShoulder" % s, "%sArm" % s, "%sForeArm" % s, "%sHand" % s] for s in ("Left", "Right")}
SEG_CHILD = {"Hips": "Spine", "Spine": "Spine1", "Spine1": "Spine2", "Spine2": "Neck", "Neck": "Head", "Head": "HeadTop_End"}
for _s in ("Left", "Right"):
    SEG_CHILD.update({"%sShoulder" % _s: "%sArm" % _s, "%sArm" % _s: "%sForeArm" % _s, "%sForeArm" % _s: "%sHand" % _s,
                      "%sUpLeg" % _s: "%sLeg" % _s, "%sLeg" % _s: "%sFoot" % _s, "%sFoot" % _s: "%sToeBase" % _s,
                      "%sToeBase" % _s: "%sToe_End" % _s})


# ------------------------------------------------------------------ mesh access

class Model:
    """One cq 060 GLB: rest positions, triangles, skin, joints' rest globals (all identity
    above the armature, checked)."""

    def __init__(self, path):
        self.path = path
        self.g = Glb(path)
        j = self.g.json
        self.mesh_node = [i for i, n in enumerate(self.g.nodes) if "mesh" in n][0]
        prims = j["meshes"][self.g.nodes[self.mesh_node]["mesh"]]["primitives"]
        if len(prims) != 1:
            raise SystemExit("expected one primitive, got %d" % len(prims))
        self.prim = prims[0]
        a = self.prim["attributes"]
        self.P = self.g.accessor(a["POSITION"]).astype(float)
        self.T = self.g.accessor(self.prim["indices"]).reshape(-1, 3).astype(int)
        self.skinned = "JOINTS_0" in a and bool(j.get("skins"))
        pose = Pose(self.g)
        self.G = pose.globals_of(pose.rest)
        if np.abs(self.G[self.mesh_node] - np.eye(4)).max() > 1e-6:
            raise SystemExit("mesh node is not at the origin")
        if self.skinned:
            self.joints = list(j["skins"][0]["joints"])
            self.jn = [self.g.names[x] for x in self.joints]
            self.J = self.g.accessor(a["JOINTS_0"]).astype(int)
            self.W = self.g.accessor(a["WEIGHTS_0"]).astype(float)
            self.W /= np.maximum(1e-9, self.W.sum(1, keepdims=True))
        # weld coincident vertices (UV seams): one weight per welded point
        key = np.round(self.P / 1e-5).astype(np.int64)
        _, self.weld = np.unique(key, axis=0, return_inverse=True)
        self.weld = self.weld.ravel()
        self.nw = int(self.weld.max()) + 1
        cnt = np.bincount(self.weld, minlength=self.nw).astype(float)
        self.Pw = np.zeros((self.nw, 3))
        np.add.at(self.Pw, self.weld, self.P)
        self.Pw /= cnt[:, None]
        e = np.concatenate([self.T[:, [0, 1]], self.T[:, [1, 2]], self.T[:, [2, 0]]])
        e = self.weld[e]
        e = e[e[:, 0] != e[:, 1]]
        e = np.unique(np.sort(e, 1), axis=0)
        self.edges = e

    def pos(self, name):
        return self.G[self.g.names.index(name)][:3, 3].copy()


def seg_dist(p, a, b):
    ab = b - a
    t = np.clip(((p - a) @ ab) / max(1e-12, ab @ ab), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1), t


def smooth(Wv, edges, iters, alpha, free):
    """Laplacian smoothing of per-point weight vectors over the welded surface; `free` points
    move, the rest are held."""
    i, j = edges[:, 0], edges[:, 1]
    deg = np.bincount(i, minlength=len(Wv)) + np.bincount(j, minlength=len(Wv))
    deg = np.maximum(deg, 1).astype(float)[:, None]
    for _ in range(iters):
        S = np.zeros_like(Wv)
        np.add.at(S, i, Wv[j])
        np.add.at(S, j, Wv[i])
        new = (1 - alpha) * Wv + alpha * S / deg
        Wv[free] = new[free]
    return Wv


class Graph:
    """Neighbour means over the welded surface (both edge directions, sorted for reduceat)."""

    def __init__(self, edges, n):
        s = np.concatenate([edges[:, 0], edges[:, 1]])
        d = np.concatenate([edges[:, 1], edges[:, 0]])
        o = np.argsort(s, kind="stable")
        self.s, self.d = s[o], d[o]
        self.n = n
        self.has = np.bincount(self.s, minlength=n) > 0
        self.starts = np.searchsorted(self.s, np.arange(n))[self.has]
        self.deg = np.bincount(self.s, minlength=n)[self.has].astype(float)[:, None]

    def mean(self, W):
        out = W.copy()
        out[self.has] = np.add.reduceat(W[self.d], self.starts, axis=0) / self.deg
        return out


def harmonic(W, graph, seed, iters):
    """Fill the non-seed points with the harmonic blend of the seeds' weights over the surface
    (Jacobi iterations; seeds held)."""
    free = ~seed
    for _ in range(iters):
        M = graph.mean(W)
        W[free] = M[free]
    return W


def top4(Wv):
    """Keep the 4 largest influences per point, normalised."""
    idx = np.argsort(-Wv, 1)[:, :4]
    w = np.take_along_axis(Wv, idx, 1)
    w = np.maximum(w, 0)
    w /= np.maximum(1e-12, w.sum(1, keepdims=True))
    return idx, w


def quantise(idx, w):
    """u8 weights that sum to exactly 255, influences sorted by weight, unused slots on the
    first joint with weight 0."""
    q = np.floor(w * 255 + 0.5).astype(int)
    d = 255 - q.sum(1)
    q[np.arange(len(q)), 0] += d     # the largest influence absorbs the rounding
    idx = np.where(q > 0, idx, idx[:, :1])
    return idx.astype(np.uint8), np.clip(q, 0, 255).astype(np.uint8)


# ------------------------------------------------------------------ the rig builder

class Builder:
    def __init__(self, m, spec):
        self.m = m
        self.spec = spec
        self.bones = list(m.jn)                  # skin joint order: the 25 main bones first
        self.pos = {b: m.pos(b) for b in self.bones}
        self.orig = {b: p.copy() for b, p in self.pos.items()}
        self.chains = []                         # {name, group, parent, joints: [xyz], nb, y0, y1}

    # --- the main skeleton: legs and spine centred on the mesh (cq 060 put one hip joint on
    # the centre line and the hips 8 cm to one side); arms, hands, neck, head and feet stay
    def recentre(self):
        sp = self.spec.get("recentre")
        if not sp:
            return {}
        p = self.pos
        xc = (p["LeftFoot"][0] + p["RightFoot"][0]) / 2
        hw = sp["hip_half_width"]
        moved = {}
        hips = p["Hips"].copy()
        hips[0] = xc
        moved["Hips"] = hips
        for s, sgn in (("Left", 1), ("Right", -1)):
            up = p["%sUpLeg" % s].copy()
            up[0] = xc + sgn * self.spec.get("left_sign", 1) * hw
            foot = p["%sFoot" % s]
            kn = p["%sLeg" % s].copy()
            u = (up[1] - kn[1]) / max(1e-6, up[1] - foot[1])
            kn[0] = up[0] + (foot[0] - up[0]) * u
            moved["%sUpLeg" % s] = up
            moved["%sLeg" % s] = kn
        neck = p["Neck"]
        for b in ("Spine", "Spine1", "Spine2"):
            q = p[b].copy()
            u = (q[1] - hips[1]) / max(1e-6, neck[1] - hips[1])
            q[0] = hips[0] + (neck[0] - hips[0]) * u
            moved[b] = q
        # an elbow cq 060 misplaced (forearm vs upper arm far from human proportions) takes the
        # other side's elbow, mirrored about the shoulders; the hands do not move
        def ratio(s):
            return np.linalg.norm(p["%sHand" % s] - p["%sForeArm" % s]) / max(1e-6, np.linalg.norm(p["%sForeArm" % s] - p["%sArm" % s]))
        lo, hi = sp.get("arm_ratio", [0.6, 1.6])
        for bad, good in (("Left", "Right"), ("Right", "Left")):
            if not (lo <= ratio(bad) <= hi) and lo <= ratio(good) <= hi:
                off = p["%sForeArm" % good] - p["%sArm" % good]
                off[0] = -off[0]
                moved["%sForeArm" % bad] = p["%sArm" % bad] + off
        for b, q in moved.items():
            p[b] = q
        return {b: [round(float(v), 4) for v in q] for b, q in moved.items()}

    def junctions(self, P):
        """Points in the bands where differently moving parts meet (armpits, neck, arm to
        robe/coat): no seeds there, the harmonic fill blends across."""
        sp = self.spec
        free = np.zeros(len(P), bool)
        ab = sp.get("armpit_band")
        if ab:
            d_up = self.dist_to(["LeftArm", "RightArm"], P).min(1)
            free |= (d_up > ab[0]) & (d_up < ab[1])
        if sp.get("neck_band"):
            free |= self.dist_to(["Neck"], P).min(1) < sp["neck_band"]
        if sp.get("skirt") or sp.get("wings"):
            d_arm = self.dist_to(ARM["Left"][1:] + ARM["Right"][1:], P).min(1)
            free |= (d_arm > sp.get("r_arm", 0.08)) & (d_arm < sp.get("junction", 0.14))
        return free

    # --- segments of the main bones
    def seg(self, b):
        a = self.pos[b]
        c = SEG_CHILD.get(b)
        if c is None:
            if b.endswith("Hand"):
                fa = self.pos[b.replace("Hand", "ForeArm")]
                return a, a + (a - fa) * 0.5
            return a, a + np.array([0, 0.02, 0])
        return a, self.pos[c]

    def dist_to(self, names, P):
        return np.stack([seg_dist(P, *self.seg(b))[0] for b in names], 1)

    def classify(self):
        m, sp = self.m, self.spec
        P = m.Pw
        hips = self.pos["Hips"]
        self.y_waist = hips[1] + sp.get("waist_above", 0.04)
        legs = {s: self.dist_to(LEG[s][:4], P).min(1) for s in LEG}
        d_leg = np.minimum(legs["Left"], legs["Right"])
        self.leg_side = np.where(legs["Left"] <= legs["Right"], "Left", "Right")
        y_hip = self.pos["LeftUpLeg"][1]
        y_ank = self.pos["LeftFoot"][1]
        u = np.clip((P[:, 1] - y_ank) / max(1e-6, y_hip - y_ank), 0, 1)
        self.r_leg = sp["r_ankle"] + (sp["r_thigh"] - sp["r_ankle"]) * u
        self.d_arm = self.dist_to(ARM["Left"][1:] + ARM["Right"][1:], P).min(1)
        self.d_head = self.dist_to(["Neck", "Head"], P).min(1)
        arm = self.d_arm < sp.get("r_arm", 0.08)
        part = np.full(len(P), "body", dtype=object)
        lower = (P[:, 1] < self.y_waist) & ~arm
        part[lower] = "leg"
        if sp.get("skirt"):
            sk = sp["skirt"]
            cand = lower & (P[:, 1] > sk.get("hem_min_y", 0.0)) & (d_leg > self.r_leg + sk.get("leg_margin", 0.02))
            part[cand] = "skirt"
        if sp.get("wings"):
            wg = sp["wings"]
            # behind the back: the spine's depth at that height minus the back's half depth
            sb = ("Hips", "Spine", "Spine1", "Spine2", "Neck")
            sy = np.array([self.pos[b][1] for b in sb])
            sz = np.array([self.pos[b][2] for b in sb])
            zb = np.interp(P[:, 1], sy, sz) - wg["back"]
            cand = (P[:, 2] < zb) & (P[:, 1] > wg.get("min_y", 0.0)) & ~arm & (d_leg > self.r_leg + 0.01)
            # the wings' lower ends hang fused with the back of the robe: below this they move
            # with the robe's chains, above it with the wing chains
            low = P[:, 1] < self.y_waist + wg.get("above_waist", 0.15)
            part[cand & ~low] = "wing"
            # between the robe and the wings: no seeds, the fill blends the two
            self.free_band = cand & low & (P[:, 1] >= self.y_waist)
            if sp.get("skirt"):
                part[cand & low & (P[:, 1] < self.y_waist)] = "skirt"
        self.part = part
        self.d_leg = d_leg
        return part

    # --- chains: hanging bone chains fitted to a set of points by height
    def fit_chain(self, name, group, parent, pts, nb, y_top=None, shrink=0.9, center=None):
        y0 = float(np.max(pts[:, 1])) if y_top is None else y_top
        y1 = float(np.percentile(pts[:, 1], 1.0))
        js = []
        c = center if center is not None else np.median(pts, 0)
        for k in range(nb + 1):
            y = y0 + (y1 - y0) * k / nb
            band = np.abs(pts[:, 1] - y) < max(0.03, (y0 - y1) / (2 * nb))
            q = pts[band] if band.sum() >= 5 else pts[np.argsort(np.abs(pts[:, 1] - y))[:5]]
            xz = np.median(q[:, [0, 2]], 0)
            # just inside the surface, toward the part's centre line
            xz = c[[0, 2]] + (xz - c[[0, 2]]) * shrink
            js.append(np.array([xz[0], y, xz[1]]))
        ch = {"name": name, "group": group, "parent": parent, "joints": js, "y0": y0, "y1": y1, "nb": nb}
        self.chains.append(ch)
        return ch

    def chain_weights(self, ch, P):
        """Hat weights along a chain by height: [parent, bone 0 .. bone nb-1] per point."""
        nb = ch["nb"]
        f = (ch["y0"] - P[:, 1]) / max(1e-6, ch["y0"] - ch["y1"]) * nb
        f = np.clip(f, -0.5, nb - 0.5)
        cs = np.arange(-1, nb) + 0.5      # parent's hat at -0.5, bone k's at k + 0.5
        w = np.maximum(0.0, 1.0 - np.abs(f[:, None] - cs[None, :]))
        w /= np.maximum(1e-9, w.sum(1, keepdims=True))
        return w

    def build(self):
        m, sp = self.m, self.spec
        P = m.Pw
        self.moved = self.recentre()
        part = self.classify()
        nbm = len(self.bones)
        # 1. cq 060's weights (welded mean) with stray influences removed: a bone far from the
        # point (past max(12 cm, 2.5x the nearest bone)), a limb of the other side, a leg bone
        # above the waist
        W0 = np.zeros((m.nw, nbm))
        Wv = np.zeros((len(m.P), nbm))
        np.put_along_axis(Wv, m.J, m.W, 1)
        np.add.at(W0, m.weld, Wv)
        W0 /= np.maximum(1e-9, W0.sum(1, keepdims=True))
        D = self.dist_to(self.bones, P)
        near = D.min(1, keepdims=True)
        far = D > np.maximum(sp.get("far_min", 0.12), sp.get("far_k", 2.5) * near)
        x = P[:, 0] - self.pos["Hips"][0]
        side = np.array([1 if b.startswith("Left") else (-1 if b.startswith("Right") else 0) for b in self.bones])
        lsign = sp.get("left_sign", 1)       # +x is the character's left in cq 060's frame
        wrong = ((side[None, :] * lsign) * np.sign(x)[:, None] < 0) & (np.abs(x)[:, None] > sp.get("mid_band", 0.06))
        legb = np.array([b in LEG["Left"] + LEG["Right"] for b in self.bones])
        above = (P[:, 1] > self.y_waist + 0.05)[:, None] & legb[None, :]
        drop = (far | wrong | above) & (W0 > 0)
        self.stray = int(drop.any(1).sum())
        W0[drop] = 0
        empty = W0.sum(1) < 1e-6
        W0[empty, np.argmin(D[empty], 1)] = 1.0
        W0 /= W0.sum(1, keepdims=True)
        # the torso: weighted along the spine by height (cq 060 put parts of the upper back on
        # the lowest spine bone); the arms, hands and head keep their cleaned weights
        if sp.get("torso", True):
            sb = ["Hips", "Spine", "Spine1", "Spine2"]
            hy = np.array([self.pos[b][1] for b in sb])
            torso = (part == "body") & (self.d_arm > sp.get("r_arm", 0.08)) & (self.d_head > sp.get("r_head", 0.1)) & (P[:, 1] >= self.y_waist) \
                & (P[:, 1] < self.pos["Neck"][1])
            f = np.interp(P[torso, 1], hy, np.arange(len(sb), dtype=float))
            w = np.maximum(0.0, 1.0 - np.abs(f[:, None] - np.arange(len(sb))[None, :]))
            w /= w.sum(1, keepdims=True)
            cols = [self.bones.index(b) for b in sb]
            keep_sh = W0[torso][:, [self.bones.index(b) for b in ("LeftShoulder", "RightShoulder")]]
            W0[torso] = 0
            W0[np.ix_(torso, cols)] = w * (1 - keep_sh.sum(1, keepdims=True))
            W0[np.ix_(torso, [self.bones.index(b) for b in ("LeftShoulder", "RightShoulder")])] = keep_sh
        seed = np.zeros(m.nw, bool)
        # upper body and arms: the cleaned weights are seeds
        upper = (part == "body") & ((P[:, 1] > self.y_waist + sp.get("upper_band", 0.06)) | (self.d_arm < sp.get("r_arm", 0.08)))
        seed |= upper & ~getattr(self, "free_band", np.zeros(m.nw, bool))
        # around the upper arms (armpits, shoulders, sleeves fused to the body): no seeds, the
        # fill blends the arm into the torso so a raised arm stretches a band, not a seam
        nb_r = sp.get("neck_band")
        if nb_r:
            # the neck: head and torso blend over the fill, not at a seam
            seed &= ~(self.dist_to(["Neck"], P).min(1) < nb_r)
        ab = sp.get("armpit_band")
        if ab:
            d_up = self.dist_to(["LeftArm", "RightArm"], P).min(1)
            seed &= ~((d_up > ab[0]) & (d_up < ab[1]))
        # 2. the legs: envelope weights over that side's leg chain and the hips, seeded in the
        # leg's core (r_seed), the rest of the lower body is filled
        r_seed = self.r_leg * sp.get("seed_k", 0.9)
        legs = (part == "leg")
        for s in ("Left", "Right"):
            sel = legs & (self.leg_side == s)
            names = ["Hips"] + LEG[s][:4]
            cols = [self.bones.index(b) for b in names]
            d = D[np.ix_(sel, cols)].copy()
            # the foot and toes only below the ankle joint (the front of the ankle lies next to
            # the heel-to-toe segment and would be dragged when the toes point)
            above_ankle = np.maximum(0.0, P[sel, 1] - (self.pos["%sFoot" % s][1] + sp.get("ankle_band", 0.02)))
            d[:, 3] += above_ankle * sp.get("ankle_k", 4.0)
            d[:, 4] += above_ankle * sp.get("ankle_k", 4.0)
            w = 1.0 / np.maximum(d, 0.015) ** sp.get("leg_power", 4)
            w /= w.sum(1, keepdims=True)
            W0[sel] = 0
            W0[np.ix_(sel, cols)] = w
        seed |= legs & (self.d_leg < r_seed)
        # 3. chains, as new bones after the main ones
        Wc = []
        names = list(self.bones)
        if sp.get("skirt"):
            sk = sp["skirt"]
            K = sk["chains"]
            c = (self.pos["LeftUpLeg"] + self.pos["RightUpLeg"]) / 2
            sel = part == "skirt"
            ang = np.arctan2(P[:, 0] - c[0], P[:, 2] - c[2])       # 0 = front (+z), +pi/2 = the character's left
            th = np.arange(K) * 2 * np.pi / K
            for k in range(K):
                dk = np.angle(np.exp(1j * (ang - th[k])))
                inside = sel & (np.abs(dk) < np.pi / K * 1.25)
                pts = P[inside]
                if len(pts) < 10:
                    continue
                self.fit_chain("%s%d" % (sk.get("prefix", "Skirt"), k), sk.get("group", "skirt"), "Hips", pts, sk.get("bones", 3),
                               y_top=self.y_waist, shrink=sk.get("shrink", 0.9), center=c)
                self.chains[-1]["theta"] = float(th[k])
            sk_chains = [ch for ch in self.chains if ch["group"] == sk.get("group", "skirt")]
            thc = np.array([ch["theta"] for ch in sk_chains])
            for ch in sk_chains:
                names += ["%s_%d" % (ch["name"], b) for b in range(ch["nb"])]
            Wsk = np.zeros((m.nw, sum(ch["nb"] for ch in sk_chains)))
            hip_w = np.zeros(m.nw)
            idx = np.where(sel)[0]
            da = np.angle(np.exp(1j * (ang[idx, None] - thc[None, :])))
            order = np.argsort(np.abs(da), 1)[:, :2]
            a0 = np.abs(np.take_along_axis(da, order[:, :1], 1))[:, 0]
            a1 = np.abs(np.take_along_axis(da, order[:, 1:2], 1))[:, 0]
            u = a0 / np.maximum(1e-9, a0 + a1)
            offs = np.cumsum([0] + [ch["nb"] for ch in sk_chains])
            for slot, wgt in ((0, 1 - u), (1, u)):
                for ci, ch in enumerate(sk_chains):
                    r = order[:, slot] == ci
                    if not r.any():
                        continue
                    cw = self.chain_weights(ch, P[idx[r]])
                    hip_w[idx[r]] += wgt[r] * cw[:, 0]
                    Wsk[idx[r], offs[ci]:offs[ci + 1]] += wgt[r, None] * cw[:, 1:]
            Wc.append(Wsk)
            W0[sel] = 0
            W0[sel, self.bones.index("Hips")] = hip_w[sel]
            # the skirt is seeded where it hangs free of the legs
            seed |= sel & (self.d_leg > self.r_leg + sk.get("free_margin", 0.06)) & (self.d_arm > sp.get("junction", 0.14))
        if sp.get("wings"):
            wg = sp["wings"]
            sel_all = part == "wing"
            for s, sgn in (("L", 1), ("R", -1)):
                sel = sel_all & (np.sign(P[:, 0] - self.pos["Hips"][0]) * sp.get("left_sign", 1) == sgn)
                pts = P[sel]
                if len(pts) < 10:
                    continue
                ch = self.fit_chain("%s_%s" % (wg.get("prefix", "Wing"), s), wg.get("group", "wing"), wg.get("root", "Spine2"), pts,
                                    wg.get("bones", 3), y_top=float(self.pos[wg.get("root", "Spine2")][1]) + wg.get("root_dy", 0.0),
                                    shrink=wg.get("shrink", 0.95))
                names += ["%s_%d" % (ch["name"], b) for b in range(ch["nb"])]
                cw = self.chain_weights(ch, P[sel])
                Wsel = np.zeros((m.nw, ch["nb"]))
                Wsel[sel] = cw[:, 1:]
                Wc.append(Wsel)
                W0[sel] = 0
                W0[sel, self.bones.index(ch["parent"])] = cw[:, 0]
                seed |= sel & (self.d_arm > sp.get("junction", 0.14)) & (self.d_head > sp.get("junction", 0.14))
        Wall = np.concatenate([W0] + Wc, 1) if Wc else W0.copy()
        # 4. fill the gaps between the seeds harmonically over the welded surface (the parts'
        # borders become smooth blends), then a light smoothing everywhere but the hands/head
        g = Graph(m.edges, m.nw)
        Wall = harmonic(Wall, g, seed, sp.get("fill_iters", 300))
        keep = np.array([b in ("Head", "HeadTop_End", "LeftHand", "RightHand") for b in names])
        held = (Wall[:, keep].sum(1) > 0.6) & (part == "body")
        for _ in range(sp.get("smooth_iters", 3)):
            M = g.mean(Wall)
            a = sp.get("smooth_alpha", 0.5)
            Wall[~held] = (1 - a) * Wall[~held] + a * M[~held]
        self.seed = seed
        self.names = names
        self.Wall = Wall
        return names, Wall


# ------------------------------------------------------------------ writing

def write_model(m, names, chains, Wpoints, out, moved=None):
    """The source GLB with the main joints `moved` (name -> new rest position; rotations kept),
    the chain bones added and the new weights; all other bytes kept."""
    from gltf import mat_to_q
    g = m.g
    j = json.loads(json.dumps(g.json))
    binb = bytearray(g.bin)
    nodes = j["nodes"]
    name_to_node = {g.names[i]: i for i in range(len(g.nodes))}
    Gn_all = [x.copy() for x in m.G]
    for b, p in (moved or {}).items():
        Gn_all[name_to_node[b]][:3, 3] = p
    if moved:
        for i in Pose(g).order:
            par = g.parent[i]
            if par < 0 or (g.names[i] not in moved and g.names[par] not in moved):
                continue
            L = np.linalg.inv(Gn_all[par]) @ Gn_all[i]
            nodes[i]["translation"] = [float(v) for v in L[:3, 3]]
    new_joints = list(m.joints)
    ibm_rows = []
    for ch in chains:
        parent = name_to_node[ch["parent"]]
        Gp = Gn_all[parent]
        prev = parent
        prevG = Gp
        for k, p in enumerate(ch["joints"]):
            nm = "%s_%d" % (ch["name"], k) if k < ch["nb"] else "%s_end" % ch["name"]
            # the chain bone's global rotation is identity: local = parent^-1 at the joint
            Gn = np.eye(4)
            Gn[:3, 3] = p
            L = np.linalg.inv(prevG) @ Gn
            node = {"name": nm, "translation": [float(v) for v in L[:3, 3]], "rotation": [float(v) for v in mat_to_q(L[:3, :3])]}
            nodes.append(node)
            ni = len(nodes) - 1
            nodes[prev].setdefault("children", []).append(ni)
            name_to_node[nm] = ni
            new_joints.append(ni)
            ibm_rows.append(np.linalg.inv(Gn))
            prev, prevG = ni, Gn
    # inverse bind matrices: the old ones, then the chain bones'
    old_ibm = g.accessor(j["skins"][0]["inverseBindMatrices"]).reshape(-1, 16).copy()
    for k, ni in enumerate(m.joints):
        if moved and g.names[ni] in moved or (moved and g.names[g.parent[ni]] in moved):
            old_ibm[k] = np.linalg.inv(Gn_all[ni]).T.reshape(-1)
    ibm = np.concatenate([old_ibm] + ([np.array([r.T.reshape(-1) for r in ibm_rows])] if ibm_rows else []), 0).astype(np.float32)
    while len(binb) % 4:
        binb.append(0)
    off = len(binb)
    binb.extend(ibm.tobytes())
    j["bufferViews"].append({"buffer": 0, "byteOffset": off, "byteLength": ibm.nbytes})
    j["accessors"].append({"bufferView": len(j["bufferViews"]) - 1, "componentType": 5126, "count": len(ibm), "type": "MAT4"})
    j["skins"][0]["inverseBindMatrices"] = len(j["accessors"]) - 1
    j["skins"][0]["joints"] = new_joints
    j["buffers"][0]["byteLength"] = len(binb)
    # names[] (builder order) -> skin joint index
    jidx = {nm: k for k, nm in enumerate([j["nodes"][x]["name"] for x in new_joints])}
    col = np.array([jidx[n] for n in names])
    idx, w = top4(Wpoints)
    qi, qw = quantise(col[idx], w)
    for attr, arr in (("JOINTS_0", qi), ("WEIGHTS_0", qw)):
        acc = j["accessors"][m.prim["attributes"][attr]]
        if acc["componentType"] != 5121 or acc["type"] != "VEC4":
            raise SystemExit("%s is not u8 VEC4" % attr)
        bv = j["bufferViews"][acc["bufferView"]]
        if bv.get("byteStride", 4) != 4:
            raise SystemExit("interleaved %s" % attr)
        o = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
        binb[o:o + arr.nbytes] = arr.tobytes()
    j["asset"]["generator"] = (j["asset"].get("generator", "") + " + cosquest cq014 fix_rig.py").strip()
    write_glb(out, j, bytes(binb))


def transfer(m_src, W_src_pts, m_dst, k=4):
    """Weights for m_dst's welded points from the nearest welded points of m_src (inverse
    distance over the k nearest), chunked numpy."""
    out = np.zeros((m_dst.nw, W_src_pts.shape[1]))
    S = m_src.Pw
    s2 = (S * S).sum(1)
    for a in range(0, m_dst.nw, 512):
        Q = m_dst.Pw[a:a + 512]
        d2 = (Q * Q).sum(1)[:, None] - 2 * Q @ S.T + s2[None, :]
        nn = np.argpartition(d2, k, 1)[:, :k]
        dd = np.sqrt(np.maximum(np.take_along_axis(d2, nn, 1), 0))
        w = 1.0 / np.maximum(dd, 1e-4) ** 2
        w /= w.sum(1, keepdims=True)
        out[a:a + 512] = np.einsum("nk,nkb->nb", w, W_src_pts[nn])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", required=True)
    ap.add_argument("--src", required=True, help="dir with lod0.glb lod1.glb lod2.glb (cq 060 pose model)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--spec", default=os.path.join(HERE, "rigspec.json"))
    ap.add_argument("--init_weights", default="", help="n x 25 float weights for lod0 (heat_weights.py) instead of the GLB's")
    a = ap.parse_args()
    spec = json.load(open(a.spec))[a.key]
    os.makedirs(a.out, exist_ok=True)
    m0 = Model(os.path.join(a.src, "lod0.glb"))
    if a.init_weights:
        Wi = np.load(a.init_weights).astype(float)
        ok = Wi.sum(1) > 1e-6
        idx = np.argsort(-Wi, 1)[:, :4]
        w = np.take_along_axis(Wi, idx, 1)
        w /= np.maximum(1e-9, w.sum(1, keepdims=True))
        m0.J[ok] = idx[ok]
        m0.W[ok] = w[ok]
        print("initial weights: bone heat for %d of %d vertices, the rest nearest bones" % (ok.sum(), len(ok)))
    b = Builder(m0, spec)
    names, Wall = b.build()
    idx, w = top4(Wall)
    Wc = np.zeros_like(Wall)
    np.put_along_axis(Wc, idx, w, 1)
    report = {"key": a.key, "joints_moved": b.moved, "joints_before": {k: [round(float(v), 4) for v in b.orig[k]] for k in b.moved},
              "bones_added": [], "stray_points_cleaned": b.stray, "seeded_points": int(b.seed.sum()), "points": int(m0.nw),
              "parts": {p: int((b.part == p).sum()) for p in ("body", "leg", "skirt", "wing")}, "lods": {}}
    for ch in b.chains:
        report["bones_added"].append({"chain": ch["name"], "group": ch["group"], "parent": ch["parent"], "bones": ch["nb"],
                                      "joints": [[round(float(v), 4) for v in p] for p in ch["joints"]]})
    for lod in ("lod0", "lod1", "lod2"):
        p = os.path.join(a.src, lod + ".glb")
        if not os.path.exists(p):
            continue
        m = m0 if lod == "lod0" else Model(p)
        if lod == "lod0":
            Wp = Wc
        else:
            Wp = transfer(m0, Wc, m)
            # the junction bands again, on this LOD's own (coarser) surface: its large triangles
            # bridge arm and torso, so the blend is refilled over them
            free = b.junctions(m.Pw)
            g = Graph(m.edges, m.nw)
            Wp = harmonic(Wp, g, ~free, spec.get("lod_fill_iters", 150))
            Wp = smooth(Wp, m.edges, 2, 0.5, np.ones(m.nw, bool))
        Wv = Wp[m.weld]
        write_model(m, names, b.chains, Wv, os.path.join(a.out, lod + ".glb"), b.moved)
        report["lods"][lod] = {"verts": len(m.P), "welded": m.nw}
    json.dump(report, open(os.path.join(a.out, "fix_report.json"), "w"), indent=1)
    np.save(os.path.join(a.out, "_part_lod0.npy"), b.part[m0.weld].astype("U5"))
    print("FIXED", a.key, json.dumps(report["parts"]), "chains", [c["name"] for c in b.chains], "stray", b.stray)


if __name__ == "__main__":
    main()
