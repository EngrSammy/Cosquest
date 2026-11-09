"""Retarget a CC0 combat clip library onto one cast character's skeleton (cq 012).

Run headless on the CPU with Blender 4.2's bundled Python (numpy):
  $BLENDER_PY retarget.py --src KayKit/Knight.glb --target cast/pose/armstrong/lod1.glb \
      --key armstrong --clips clips.json --rigs rigs.json --attach ../../data/attach.json \
      --weapons ../weapons/weapons.json --out ../../anim/armstrong.glb --report report.json

Why not Blender's importer/exporter: a glTF round trip through Blender re-orients every bone
(Blender bones point along +Y), so a library exported from Blender would not match the
original Forge GLB's node frames that the game loads. The maths here works on the glTF data
directly, so the clips land in the character's own bone frames, and a skeleton-only GLB is
written that Godot loads at run time with GLTFDocument (any LOD of the character: they share
the skeleton).

Method (per target bone b, per frame t, all in glTF world space):
  D(t)   = S_b(t) * S_b(rest)^-1          the source bone's world rotation since its rest
  A_b    = from_to(target rest dir, source rest dir)   rest-pose correction (A-pose vs T-pose)
  T_b(t) = D(t) * A_b * T_b(rest)        the target bone's world rotation
then local = parent(t)^-1 * T_b(t). The hips' translation is the source's, scaled by the
ratio of hip heights; horizontal root motion is stripped (a clip ends where it starts, the
fight moves the body), the in-place sway is kept.

It also measures every clip on the character's own mesh (numpy skinning):
  tear  share of triangles with an edge stretched past 2.5x (cq 060's measure and gate, 0.5 %)
  feet  how far a planted foot slides, and how far the feet sink below or float above the floor
  weapon (per class) how deep the held weapon goes into the body (capsules fitted to the
         mesh), and for two-handed classes how far the left hand is from the handle
and writes the per-clip contact frame (the frame the weapon tip moves fastest in the strike
window) so the game can line the clip up with its hitbox.
"""
import argparse
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gltf import (Glb, Pose, mat_to_q, q_from_to, qinv, qmul, qnorm, qrot, qslerp,  # noqa: E402
                  write_glb)

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "rig"))
from secondary import Secondary  # noqa: E402

FPS = 30.0


def gpos(G, i):
    return G[i][:3, 3].copy()


def grot(G, i):
    return mat_to_q(G[i][:3, :3])


class Retarget:
    def __init__(self, src, tgt, rig, damp=None):
        self.damp = damp or {}       # target bone -> share of the source's rotation it takes (robes: legs)
        self.damp_rel = False        # cq 016: damp relative to the hips (a clip's "damp_rel")
        self.src = src
        self.tgt = tgt
        self.sp = Pose(src)
        self.tp = Pose(tgt)
        self.rig = rig
        self.s_rest_G = self.sp.globals_of(self.sp.rest)
        self.t_rest_G = self.tp.globals_of(self.tp.rest)
        skin = tgt.json["skins"][0]
        self.joints = skin["joints"]
        self.jnames = [tgt.names[j] for j in self.joints]
        self.map = {}
        A = {}
        tn = tgt.names
        sn = src.names
        # bones in parent-first order so "inherit" can read the parent's correction
        for j in self.tp.order:
            name = tn[j]
            if name not in rig["bones"]:
                continue
            spec = rig["bones"][name]
            src_spec = spec["src"]
            if isinstance(src_spec, str):
                srcs = [(sn.index(src_spec), 1.0)]
            else:   # ["a", "b", u]: slerp between two source bones
                srcs = [(sn.index(src_spec[0]), 1.0 - src_spec[2]), (sn.index(src_spec[1]), src_spec[2])]
            d = spec.get("dir", "inherit")
            if d == "inherit":
                p = tgt.parent[j]
                a = A.get(p, np.array([0, 0, 0, 1.0]))
            elif d == "none":
                a = np.array([0, 0, 0, 1.0])
            else:
                tf, tt, sf, st = d
                tdir = gpos(self.t_rest_G, tn.index(tt)) - gpos(self.t_rest_G, tn.index(tf))
                sdir = gpos(self.s_rest_G, sn.index(st)) - gpos(self.s_rest_G, sn.index(sf))
                a = q_from_to(tdir, sdir)
            A[j] = a
            self.map[j] = srcs
        self.A = A
        self.t_hips = tn.index(rig["hips"][0])
        self.s_hips = sn.index(rig["hips"][1])
        th = gpos(self.t_rest_G, self.t_hips)[1]
        sh = gpos(self.s_rest_G, self.s_hips)[1]
        self.hip_scale = th / sh
        self.unmapped = [n for n in self.jnames if n not in rig["bones"]]

    def src_delta(self, Gs, srcs):
        qs = []
        for i, _w in srcs:
            qs.append(qmul(grot(Gs, i), qinv(grot(self.s_rest_G, i))))
        if len(qs) == 1:
            return qs[0]
        return qslerp(qs[0], qs[1], srcs[1][1])

    def frame(self, Gs, hips_off):
        """Target locals (list of [t, r, s]) for one source global pose."""
        tp = self.tp
        loc = [list(x) for x in tp.rest]
        G = [None] * len(loc)
        for i in tp.order:
            p = self.tgt.parent[i]
            if i in self.map:
                d = self.src_delta(Gs, self.map[i])
                f = self.damp.get(self.tgt.names[i])
                if f is not None:
                    if self.damp_rel and i != self.t_hips:
                        # cq 016: damp the bone's turn relative to the hips, not the world (a spin
                        # turns the hips a full circle; a world-damped leg or spine would twist
                        # against them and tear the robe)
                        dh = self.src_delta(Gs, self.map[self.t_hips])
                        d = qmul(dh, qslerp(np.array([0, 0, 0, 1.0]), qmul(qinv(dh), d), f))
                    else:
                        d = qslerp(np.array([0, 0, 0, 1.0]), d, f)
                want = qmul(qmul(d, self.A[i]), grot(self.t_rest_G, i))
                pr = np.array([0, 0, 0, 1.0]) if p < 0 else grot(G, p)
                loc[i][1] = qnorm(qmul(qinv(pr), want))
                if i == self.t_hips:
                    wpos = gpos(self.t_rest_G, i) + hips_off
                    inv = np.linalg.inv(G[p]) if p >= 0 else np.eye(4)
                    loc[i][0] = (inv @ np.append(wpos, 1.0))[:3]
            m = np.eye(4)
            from gltf import trs_mat
            m = trs_mat(*loc[i])
            G[i] = m if p < 0 else G[p] @ m
        return loc, G


def left_hand_ik(rt, loc, G, P, w):
    """Two-bone IK of the left arm so the left hand reaches P (world), blended by w (0..1).
    The elbow stays in the plane it was in; the hand turns with the forearm."""
    tn = rt.tgt.names
    ia, ie, ih = tn.index("LeftArm"), tn.index("LeftForeArm"), tn.index("LeftHand")
    S, E, H = gpos(G, ia), gpos(G, ie), gpos(G, ih)
    a = np.linalg.norm(E - S)
    b = np.linalg.norm(H - E)
    d = P - S
    c = float(np.clip(np.linalg.norm(d), abs(a - b) + 1e-3, a + b - 1e-3))
    u = d / max(1e-9, np.linalg.norm(d))
    Pc = S + u * c
    pole = (E - S) - u * float((E - S) @ u)
    if np.linalg.norm(pole) < 1e-6:
        pole = np.array([0, -1.0, 0]) - u * (-u[1])
    n = pole / np.linalg.norm(pole)
    ca = (a * a + c * c - b * b) / (2 * a * c)
    E2 = S + u * ca * a + n * np.sqrt(max(0.0, 1 - ca * ca)) * a
    ident = np.array([0, 0, 0, 1.0])
    R1 = qslerp(ident, q_from_to(E - S, E2 - S), w)
    E2w = S + qrot(R1, E - S)
    R2 = qslerp(ident, q_from_to(qrot(R1, H - E), Pc - E2w), w)
    world = {ia: qmul(R1, grot(G, ia)), ie: qmul(R2, qmul(R1, grot(G, ie))), ih: qmul(R2, qmul(R1, grot(G, ih)))}
    for i in (ia, ie, ih):
        p = rt.tgt.parent[i]
        pr = world.get(p, grot(G, p))
        loc[i][1] = qnorm(qmul(qinv(pr), world[i]))
        G = rt.tp.globals_of(loc)
    return loc, G


# ------------------------------------------------------------------ mesh checks

class Body:
    """The character's skinned mesh, for tear, foot and weapon checks."""

    def __init__(self, glb, rt):
        self.g = glb
        self.rt = rt
        skin = glb.json["skins"][0]
        self.ibm = glb.accessor(skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)
        pos, jnt, wts, tris = [], [], [], []
        base = 0
        for ni, n in enumerate(glb.nodes):
            if "mesh" not in n or n.get("skin") is None:
                continue
            for prim in glb.json["meshes"][n["mesh"]]["primitives"]:
                a = prim["attributes"]
                p = glb.accessor(a["POSITION"])
                pos.append(p)
                jnt.append(glb.accessor(a["JOINTS_0"]).astype(int))
                wts.append(glb.accessor(a["WEIGHTS_0"]).astype(float))
                idx = glb.accessor(prim["indices"]).reshape(-1, 3).astype(int) if "indices" in prim else np.arange(len(p)).reshape(-1, 3)
                tris.append(idx + base)
                base += len(p)
        self.pos = np.concatenate(pos)
        self.jnt = np.concatenate(jnt)
        self.wts = np.concatenate(wts)
        self.wts /= np.maximum(1e-9, self.wts.sum(1, keepdims=True))
        self.tris = np.concatenate(tris)
        e = np.concatenate([self.tris[:, [0, 1]], self.tris[:, [1, 2]], self.tris[:, [2, 0]]])
        self.edges_tri = e
        self.rest = self.skin(rt.t_rest_G)
        self.rest_len = self._edge_len(self.rest)
        ok = self.rest_len > 1e-5
        self.ok = ok

    def skin(self, G):
        J = np.stack([G[j] for j in self.rt.joints]) @ self.ibm
        out = np.zeros((len(self.pos), 3))
        ph = np.concatenate([self.pos, np.ones((len(self.pos), 1))], 1)
        for k in range(4):
            M = J[self.jnt[:, k]]
            out += self.wts[:, k:k + 1] * np.einsum("nij,nj->ni", M[:, :3, :], ph)
        return out

    def _edge_len(self, v):
        return np.linalg.norm(v[self.edges_tri[:, 0]] - v[self.edges_tri[:, 1]], axis=1)

    def tear(self, G):
        ln = self._edge_len(self.skin(G))
        # stretch only, as cq 060's rig gate measured it (its numbers reproduce to 0.04 %)
        s = np.where(self.ok, ln / np.maximum(self.rest_len, 1e-9), 1.0)
        nt = len(self.tris)
        per_tri = np.max(s.reshape(3, nt), axis=0)
        bad = per_tri > 2.5
        where = {}
        if bad.any():
            dom = self.jnt[self.tris[bad, 0], np.argmax(self.wts[self.tris[bad, 0]], 1)]
            for j, c in zip(*np.unique(dom, return_counts=True)):
                where[self.rt.jnames[j]] = int(c)
        return float(np.mean(bad)), float(np.percentile(per_tri, 99)), float(per_tri.max()), where

    def capsules(self, segs):
        """Fit a radius per body segment (two joint names) from the rest mesh."""
        out = []
        dom = self.jnt[np.arange(len(self.jnt)), np.argmax(self.wts, 1)]
        names = self.rt.jnames
        for a, b, bones in segs:
            ia = self.rt.tgt.names.index(a)
            ib = self.rt.tgt.names.index(b)
            sel = np.isin(dom, [names.index(x) for x in bones if x in names])
            pa = gpos(self.rt.t_rest_G, ia)
            pb = gpos(self.rt.t_rest_G, ib)
            d = seg_dist(self.rest[sel], pa, pb) if sel.any() else np.array([0.08])
            out.append((ia, ib, float(np.percentile(d, 60))))
        return out


def seg_dist(p, a, b):
    ab = b - a
    t = np.clip(((p - a) @ ab) / max(1e-9, ab @ ab), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)


BODY_SEGS = [("Hips", "Neck", ["Hips", "Spine", "Spine1", "Spine2"]),
             ("Neck", "HeadTop_End", ["Neck", "Head"]),
             ("LeftUpLeg", "LeftLeg", ["LeftUpLeg"]), ("RightUpLeg", "RightLeg", ["RightUpLeg"]),
             ("LeftLeg", "LeftFoot", ["LeftLeg"]), ("RightLeg", "RightFoot", ["RightLeg"])]


# ------------------------------------------------------------------ main

def grip_rotation(rt, slot_name, slot_local_q, weapon_native_q, hand_name):
    """The weapon root's rotation in the target hand bone's space such that the weapon's world
    orientation in every frame equals the source's (the source holds it in `slot_name` with
    `slot_local_q`, the weapon's own frame being `weapon_native_q` in the slot's).
    W(t) = S_slot(t) * L = D_hand(t) * S_slot(rest) * L and T_hand(t) = D_hand(t) * A * T(rest),
    so the hand-space rotation is (A * T(rest))^-1 * S_slot(rest) * L, the same every frame."""
    tn = rt.tgt.names
    th = tn.index(hand_name)
    s_slot = grot(rt.s_rest_G, rt.src.names.index(slot_name))
    W = qmul(qmul(s_slot, slot_local_q), weapon_native_q)
    return qmul(qinv(qmul(rt.A[th], grot(rt.t_rest_G, th))), W)


def native_q(tip_b, edge_b):
    """The rotation from the pack frame (+Y tip, +Z edge) to the source model's own glTF frame,
    given weapons.json's tip/edge in Blender axes (Z up)."""
    def b2g(v):
        return np.array([v[0], v[2], -v[1]], float)
    y = b2g(tip_b)
    z = b2g(edge_b)
    x = np.cross(y, z)
    m = np.stack([x, y, z], 1)
    return mat_to_q(m)


def staff_upright(rt, loc, G, grip, su):
    """cq 016: a staff-hold clip (clips.json "staff_up"): the right forearm and hand turn so the
    staff in the hand (the grip's +Y, the orb end) stands up beside the body, a little forward and
    out, instead of hanging orb-down the way the source holds its two-handed sword. The forearm
    takes a share of the turn so the wrist does not break."""
    tn = rt.tgt.names
    ih, ie = tn.index("RightHand"), tn.index("RightForeArm")
    ihip = rt.t_hips
    gm = np.array(grip["matrix"], float).reshape(4, 4).T
    axis_h = gm[:3, :3] @ np.array([0, 1.0, 0])
    dq = qmul(grot(G, ihip), qinv(grot(rt.t_rest_G, ihip)))
    fwd = qrot(dq, [0, 0, 1.0])
    fwd = np.array([fwd[0], 0.0, fwd[2]])
    fwd = fwd / max(1e-9, np.linalg.norm(fwd))
    right = np.cross(fwd, [0, 1.0, 0])
    want = np.array([0, 1.0, 0]) + fwd * su.get("fwd", 0.25) + right * su.get("out", 0.12)
    want = want / np.linalg.norm(want)
    ident = np.array([0, 0, 0, 1.0])
    for i, share in ((ie, su.get("forearm", 0.35)), (ih, 1.0)):
        cur = qrot(grot(G, ih), axis_h)
        q = qslerp(ident, q_from_to(cur, want), share * su.get("w", 1.0))
        p = rt.tgt.parent[i]
        loc[i][1] = qnorm(qmul(qinv(grot(G, p)), qmul(q, grot(G, i))))
        G = rt.tp.globals_of(loc)
    return loc, G


def clip_frames(rt, cfg, cc, damp, anims_lib, grips, lib):
    """The target pose of every frame of one clip (cq 012's retarget, unchanged; shared with
    tools/rig so the rig tools measure exactly what the gate measures). Returns
    (times, n, length, mode, off, raw_end, frames, Gs_t, ikw)."""
    tgt = rt.tgt
    t_rhand = tgt.names.index("RightHand")
    # a clip may damp the legs harder (wide stances, spins), on top of the character's own
    rt.damp = dict(damp)
    rt.damp_rel = bool(cc.get("damp_rel", False))
    for b in cc.get("damp_legs", {}).get("bones", []):
        rt.damp[b] = min(rt.damp.get(b, 1.0), cc["damp_legs"]["f"])
    src = rt.src
    rig = rt.rig
    an = anims_lib[cc["src"]]
    length = an["length"]
    n = max(2, int(round(length * FPS)) + 1)
    times = np.linspace(0.0, length, n)
    if cc.get("range"):
        # a held pose cut from a clip (frames at 30 fps), ping-ponged into a seamless loop
        f0, f1 = cc["range"]
        seg = np.arange(f0, f1 + 1) / FPS
        src_times = np.concatenate([seg, seg[-2:0:-1]]) if cc.get("pingpong") else seg
        n = len(src_times) + (1 if cc.get("pingpong") else 0)
        if cc.get("pingpong"):
            src_times = np.append(src_times, seg[0])
        times = src_times
    # source hips path (world), for root-motion stripping
    sG = []
    for t in times:
        sG.append(rt.sp.globals_of(rt.sp.locals_at(an, t)))
    hip = np.array([gpos(G, rt.s_hips) for G in sG]) - gpos(rt.s_rest_G, rt.s_hips)
    off = hip * rt.hip_scale
    raw_end = off[-1].copy()
    drift = np.outer(times / max(1e-6, length), off[-1] - off[0]) + off[0]
    mode = cc.get("root", "inplace")
    if mode == "inplace":
        off[:, 0] -= drift[:, 0]
        off[:, 2] -= drift[:, 2]
    elif mode == "zero":
        off[:, 0] = 0.0
        off[:, 2] = 0.0
    off[:, 1] += float(cc.get("lift", 0.0))
    frames = []
    Gs_t = []
    ikw = []
    s_feet = [src.names.index(x) for x in rig["feet"][1]]
    t_feet = [tgt.names.index(x) for x in rig["feet"][0]]
    s_floor = min(gpos(rt.s_rest_G, i)[1] for i in s_feet)
    t_floor = min(gpos(rt.t_rest_G, i)[1] for i in t_feet)
    for k, t in enumerate(times):
        loc, G = rt.frame(sG[k], off[k])
        if cc.get("ground", True):
            # the lowest foot sits where the source's lowest foot does (scaled): no sinking
            # into the floor or floating from the different leg proportions
            want = (min(gpos(sG[k], i)[1] for i in s_feet) - s_floor) * rt.hip_scale
            got = min(gpos(G, i)[1] for i in t_feet) - t_floor
            off[k][1] += want - got
            loc, G = rt.frame(sG[k], off[k])
        su = cc.get("staff_up")
        if su and "staff" in grips:
            loc, G = staff_upright(rt, loc, G, grips["staff"], su)
        ik = cc.get("lhand_ik")
        if ik and ik["class"] in grips and lib == "kaykit":
            # where the source's left hand is along its own weapon (both hands on it?)
            h = cfg["holds"][ik["class"]]
            Ls = qmul(np.array(h["slot_rot"], float), native_q(h["ref_tip"], h["ref_edge"]))
            slot = sG[k][src.names.index("handslot.r")]
            ax = qrot(qmul(mat_to_q(slot[:3, :3]), Ls), [0, 1, 0])
            lh = gpos(sG[k], src.names.index("handslot.l")) - slot[:3, 3]
            dperp = float(np.linalg.norm(lh - ax * float(lh @ ax)))
            w = float(np.clip((ik.get("d_off", 0.36) - dperp) / 0.12, 0.0, 1.0))
            ikw.append(w)
            if w > 0.0:
                gm = np.array(grips[ik["class"]]["matrix"], float).reshape(4, 4).T
                Wm = G[t_rhand] @ gm
                P = (Wm @ np.array([0, ik.get("s", 0.25), 0, 1.0]))[:3]
                loc, G = left_hand_ik(rt, loc, G, P, w)
        frames.append(loc)
        Gs_t.append(G)
    return times, n, length, mode, off, raw_end, frames, Gs_t, ikw


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--src_ual", default="")
    ap.add_argument("--target", required=True)
    ap.add_argument("--key", required=True)
    ap.add_argument("--clips", required=True)
    ap.add_argument("--rigs", required=True)
    ap.add_argument("--attach", required=True)
    ap.add_argument("--weapons", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--report", required=True)
    ap.add_argument("--grips_out", default="")
    ap.add_argument("--only", default="")
    ap.add_argument("--check_every", type=int, default=3)
    a = ap.parse_args()

    rigs = json.load(open(a.rigs))
    cfg = json.load(open(a.clips))
    attach = json.load(open(a.attach))
    weapons = json.load(open(a.weapons))["weapons"]
    src = Glb(a.src)
    tgt = Glb(a.target)
    rig = rigs["kaykit_to_mixamo"]
    damp = {}
    for spec in cfg.get("damp", {}).get(a.key, []):
        for b in spec["bones"]:
            damp[b] = spec["f"]
    rt = Retarget(src, tgt, rig, damp)
    rts = {"kaykit": rt}
    if a.src_ual:
        rts["ual"] = Retarget(Glb(a.src_ual), tgt, rigs["ual_to_mixamo"], damp)
    body = Body(tgt, rt)
    # secondary chains (cq 014): measured as the game moves them; none on cq 060's own rigs
    sec = Secondary(tgt, rt.t_rest_G)
    sec = sec if sec.chains else None
    caps = body.capsules(BODY_SEGS)
    anims = {"kaykit": src.animations()}
    if "ual" in rts:
        anims["ual"] = rts["ual"].src.animations()
    ch = attach["characters"].get(a.key, {})

    # per class: the grip (hand-space matrix) that matches the source's hold
    grips = {}
    cls_len = {}
    for w in weapons:
        cls = w["grip"]
        cls_len.setdefault(cls, w["length_m"])
        hold = cfg["holds"].get(cls)
        if hold is None or cls in grips:
            continue
        slot_q = np.array(hold["slot_rot"], float)
        # every pack is in the same frame (+Y tip, +Z edge), so it is held the way the
        # source holds its own reference weapon (the KayKit sword, or crossbow for guns)
        nq = native_q(hold["ref_tip"], hold["ref_edge"])
        extra = np.array(hold.get("extra_rot", [0, 0, 0, 1]), float)
        hand = "RightHand" if hold["slot"].endswith(".r") else "LeftHand"
        gq = qmul(grip_rotation(rt, hold["slot"], slot_q, nq, hand), extra)
        old = (ch.get("grips", {}) or {}).get(cls, {})
        m = np.eye(4)
        from gltf import q_to_mat
        m[:3, :3] = q_to_mat(gq)
        if old.get("matrix"):
            om = np.array(old["matrix"], float).reshape(4, 4).T
            if not old.get("bone"):
                # a grip made for the static model (cq 010, Hoof before cq 014's rig): its
                # palm point is in model space, the hand bone's rest frame takes it
                om = np.linalg.inv(rt.t_rest_G[tgt.names.index(hand)]) @ om
            m[:3, 3] = om[:3, 3]
        m[:3, 3] += np.array(hold.get("offset", [0, 0, 0]), float)
        grips[cls] = {"bone": hand, "matrix": [round(float(x), 6) for x in m.T.reshape(-1)]}

    lib_anims = []
    report = {"key": a.key, "target": a.target, "source": a.src, "hip_scale": rt.hip_scale, "damp": damp,
              "unmapped": rt.unmapped, "capsules": [(rt.tgt.names[i], rt.tgt.names[j], round(r, 3)) for i, j, r in caps],
              "clips": {}}
    clip_names = sorted(cfg["clips"].keys())
    if a.only:
        clip_names = [c for c in clip_names if c in a.only.split(",")]
    t_lfoot = tgt.names.index("LeftToeBase")
    t_rfoot = tgt.names.index("RightToeBase")
    t_lhand = tgt.names.index("LeftHand")
    t_rhand = tgt.names.index("RightHand")
    floor_rest = min(gpos(rt.t_rest_G, t_lfoot)[1], gpos(rt.t_rest_G, t_rfoot)[1])
    for cname in clip_names:
        cc = cfg["clips"][cname]
        lib = cc.get("lib", "kaykit")
        if lib not in rts:
            continue
        rt = rts[lib]
        times, n, length, mode, off, raw_end, frames, Gs_t, ikw = clip_frames(rt, cfg, cc, damp, anims[lib], grips, lib)
        # --- checks
        feet_low = []
        for G in Gs_t:
            feet_low.append(min(gpos(G, t_lfoot)[1], gpos(G, t_rfoot)[1]) - floor_rest)
        feet_low = np.array(feet_low)
        # a loop's ground speed: the lower foot's backward speed while it carries the body
        gs = []
        for fi in (t_lfoot, t_rfoot):
            pf = np.array([gpos(G, fi) for G in Gs_t])
            down = pf[:, 1] - pf[:, 1].min() < 0.02
            for k in range(1, n):
                if down[k] and down[k - 1]:
                    gs.append(float(np.linalg.norm((pf[k] - pf[k - 1])[[0, 2]])) * FPS)
        gs = gs or [0.0]
        ground_speed = float(np.median(gs)) if cc.get("loop") else 0.0
        slide = 0.0
        for fi in (t_lfoot, t_rfoot):
            p = np.array([gpos(G, fi) for G in Gs_t])
            planted = p[:, 1] - floor_rest < 0.03
            for k in range(1, len(p)):
                if planted[k] and planted[k - 1]:
                    slide = max(slide, float(np.linalg.norm((p[k] - p[k - 1])[[0, 2]])) * FPS)
        tears = []
        tears_rigid = []
        Gs_chk = sec.run(Gs_t, FPS) if sec is not None else Gs_t
        ks = list(range(0, n, max(1, a.check_every)))
        if (n - 1) not in ks:
            ks.append(n - 1)
        for k in ks:
            tears.append(body.tear(Gs_chk[k]))
            if sec is not None:
                tears_rigid.append(body.tear(Gs_t[k])[0])
        tear_share = max(x[0] for x in tears)
        tear_p99 = max(x[1] for x in tears)
        tear_where = max(tears, key=lambda x: x[0])[3]
        # weapon checks for the classes this clip is used by
        wchk = {}
        for cls in sorted(grips):
            if cls not in grips:
                continue
            gm = np.array(grips[cls]["matrix"], float).reshape(4, 4).T
            hb = tgt.names.index(grips[cls]["bone"])
            L = cls_len.get(cls, 0.9)
            pen_max = 0.0
            pen_frames = 0
            lh_d = []
            for k in range(n):
                W = Gs_t[k][hb] @ gm
                pts = np.array([(W @ np.array([0, y, 0, 1.0]))[:3] for y in np.linspace(0.18, L, 9)])
                pen = 0.0
                for ia, ib, r in caps:
                    d = seg_dist(pts, gpos(Gs_t[k], ia), gpos(Gs_t[k], ib))
                    pen = max(pen, float(np.max(r - d)))
                pen_max = max(pen_max, pen)
                if pen > 0.03:
                    pen_frames += 1
                shaft = [(W @ np.array([0, y, 0, 1.0]))[:3] for y in (-0.1, 0.45)]
                lh = gpos(Gs_t[k], t_lhand)
                lh_d.append(float(seg_dist(lh[None], shaft[0], shaft[1])[0]))
            wchk[cls] = {"pen_max_m": round(pen_max, 3), "pen_frames": pen_frames, "frames": n,
                         "lhand_to_shaft_m_p50": round(float(np.median(lh_d)), 3)}
        # contact frame: the tip of a 1 m stick in the right hand moves fastest inside the strike window
        contact = cc.get("contact")
        if contact is None and cc.get("strike"):
            gm = np.array(grips.get(cc.get("contact_class", "sword"), {"matrix": list(np.eye(4).reshape(-1))})["matrix"], float).reshape(4, 4).T
            tip = np.array([(G[t_rhand] @ gm @ np.array([0, 0.9, 0, 1.0]))[:3] for G in Gs_t])
            v = np.linalg.norm(np.diff(tip, axis=0), axis=1) * FPS
            lo, hi = cc.get("strike_window", [0.0, 1.0])
            k0 = int(lo * (n - 1))
            k1 = max(k0 + 1, int(hi * (n - 1)))
            contact = int(np.argmax(v[k0:k1]) + k0 + 1)
        report["clips"][cname] = {
            "src": cc["src"], "frames": n, "fps": FPS, "length_s": round(length, 3), "contact": contact,
            "root": mode, "root_end_raw_m": [round(float(x), 3) for x in raw_end],
            "sway_max_m": round(float(np.max(np.linalg.norm(off[:, [0, 2]], axis=1))), 3),
            "feet_min_m": round(float(feet_low.min()), 3), "feet_max_m": round(float(feet_low.max()), 3),
            "planted_slide_mps": round(slide, 3), "ground_speed_mps": round(ground_speed, 3),
            "tear_share": round(tear_share, 5), "tear_p99": round(tear_p99, 3), "tears": tear_share > 0.005,
            "tear_where": tear_where, "tear_share_chains_rigid": round(max(tears_rigid), 5) if tears_rigid else None,
            "lhand_ik_frames": int(sum(1 for x in ikw if x > 0.5)),
            "weapon": wchk}
        lib_anims.append((cname, np.arange(len(frames)) / FPS if cc.get("range") else times, frames))
        print("CLIP %-22s n=%3d tear=%.4f %s p99=%.2f feet=[%.3f,%.3f] slide=%.2f contact=%s weapon=%s" % (
            cname, n, tear_share, json.dumps(tear_where), tear_p99, feet_low.min(), feet_low.max(), slide, contact,
            json.dumps({k: (v["pen_max_m"], v["pen_frames"], v["lhand_to_shaft_m_p50"]) for k, v in wchk.items()})), flush=True)
    report["grips"] = grips
    report["fingerprint"] = {b: [round(float(x), 4) for x in gpos(rt.t_rest_G, tgt.names.index(b))] for b in ("Hips", "RightHand", "LeftFoot")}
    write_library(tgt, rt, lib_anims, a.out)
    json.dump(report, open(a.report, "w"), indent=1)
    if a.grips_out:
        json.dump(grips, open(a.grips_out, "w"), indent=1)
    print("WROTE", a.out, os.path.getsize(a.out), "bytes;", len(lib_anims), "clips")


def write_library(tgt, rt, anims, out):
    """A skeleton-only GLB: the target's joint nodes (same names, same rest) and a skin, plus
    one animation per clip (rotation of every mapped joint, translation of the hips)."""
    keep = set()
    for j in rt.joints:
        i = j
        while i >= 0:
            keep.add(i)
            i = tgt.parent[i]
    order = sorted(keep)
    remap = {old: k for k, old in enumerate(order)}
    nodes = []
    for old in order:
        n = tgt.nodes[old]
        t, r, s = tgt.node_trs(old)
        nn = {"name": tgt.names[old], "translation": [float(x) for x in t], "rotation": [float(x) for x in r]}
        if np.abs(s - 1).max() > 1e-6:
            nn["scale"] = [float(x) for x in s]
        ch = [remap[c] for c in n.get("children", []) if c in keep]
        if ch:
            nn["children"] = ch
        nodes.append(nn)
    roots = [remap[o] for o in order if tgt.parent[o] < 0 or tgt.parent[o] not in keep]
    blob = bytearray()
    views = []
    accs = []

    def add(arr, typ, minmax=False):
        arr = np.ascontiguousarray(arr, dtype=np.float32)
        while len(blob) % 4:
            blob.append(0)
        off = len(blob)
        blob.extend(arr.tobytes())
        views.append({"buffer": 0, "byteOffset": off, "byteLength": arr.nbytes})
        acc = {"bufferView": len(views) - 1, "componentType": 5126, "count": int(arr.shape[0]), "type": typ}
        if minmax:
            acc["min"] = [float(arr.min())]
            acc["max"] = [float(arr.max())]
        accs.append(acc)
        return len(accs) - 1

    ibm = tgt.accessor(tgt.json["skins"][0]["inverseBindMatrices"])
    ibm_acc = add(ibm.reshape(-1, 16), "MAT4")
    animations = []
    mapped = sorted(rt.map.keys())
    for name, times, frames in anims:
        tin = add(times.reshape(-1, 1), "SCALAR", True)
        samplers = []
        channels = []
        for j in mapped:
            q = np.array([f[j][1] for f in frames])
            # keep the quaternion sign continuous (no flips between frames)
            for k in range(1, len(q)):
                if np.dot(q[k], q[k - 1]) < 0:
                    q[k] = -q[k]
            samplers.append({"input": tin, "output": add(q, "VEC4"), "interpolation": "LINEAR"})
            channels.append({"sampler": len(samplers) - 1, "target": {"node": remap[j], "path": "rotation"}})
        hp = np.array([f[rt.t_hips][0] for f in frames])
        samplers.append({"input": tin, "output": add(hp, "VEC3"), "interpolation": "LINEAR"})
        channels.append({"sampler": len(samplers) - 1, "target": {"node": remap[rt.t_hips], "path": "translation"}})
        animations.append({"name": name, "samplers": samplers, "channels": channels})
    gj = {"asset": {"version": "2.0", "generator": "cosquest cq012 retarget.py"},
          "scene": 0, "scenes": [{"nodes": roots}], "nodes": nodes,
          "skins": [{"joints": [remap[j] for j in rt.joints], "inverseBindMatrices": ibm_acc}],
          "animations": animations, "accessors": accs, "bufferViews": views,
          "buffers": [{"byteLength": len(blob)}]}
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    write_glb(out, gj, bytes(blob))


if __name__ == "__main__":
    main()
