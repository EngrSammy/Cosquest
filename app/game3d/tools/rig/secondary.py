"""The secondary motion's numpy twin (cq 014): the same maths as secondary_motion.gd, used by
the tear gate (tools/anim/retarget.py) and the rig tools, so a robe, coat, skirt or wing chain
is measured the way the game moves it. Parameters: app/game3d/data/secondary.json."""
import json
import os
import re
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "anim"))
from gltf import mat_to_q, q_from_to, q_to_mat, qinv, qmul, qslerp  # noqa: E402

CHAIN_RE = re.compile(r"^(Robe|Coat|Skirt|Wing|Flame)(.*)_(\d+|end)$")
SEC_JSON = os.path.join(HERE, "..", "..", "data", "secondary.json")


def find_chains(names):
    """{base: [node indices in order, end last]} from bone names like Robe3_0 .. Robe3_2, Robe3_end."""
    out = {}
    for i, n in enumerate(names):
        m = CHAIN_RE.match(n)
        if m:
            out.setdefault(m.group(1) + m.group(2), {})[m.group(3)] = i
    chains = {}
    for base, d in out.items():
        ks = sorted(int(k) for k in d if k != "end")
        if not ks or "end" not in d:
            continue
        chains[base] = [d[str(k)] for k in ks] + [d["end"]]
    return chains


def seg_closest(p, a, b):
    ab = b - a
    t = min(1.0, max(0.0, float((p - a) @ ab) / max(1e-12, float(ab @ ab))))
    return a + t * ab


def push_out(p, caps, jr):
    """p moved out of every leg capsule (radius + the joint's radius)."""
    for a, b, r in caps:
        c = seg_closest(p, a, b)
        d = p - c
        dn = float(np.linalg.norm(d))
        if dn < r + jr and dn > 1e-9:
            p = c + d / dn * (r + jr)
    return p


class Secondary:
    """Drives the chain bones over a clip's frames with the game's secondary sim: a spring
    toward a target (the chain hanging from its parent, swung by the thighs for robes and
    coats), length constraints, leg capsules and an angle limit. Fixed 1/60 s steps."""

    def __init__(self, glb, rest_G, cfg=None):
        self.g = glb
        self.cfg = cfg or json.load(open(SEC_JSON))
        self.chains = find_chains(glb.names)
        n = glb.names
        self.ih = n.index("Hips")
        self.legs = [(n.index(a), n.index(b), r) for a, b, r in (
            ("LeftUpLeg", "LeftLeg", "r_thigh"), ("LeftLeg", "LeftFoot", "r_shin"),
            ("RightUpLeg", "RightLeg", "r_thigh"), ("RightLeg", "RightFoot", "r_shin"))]
        self.il, self.ir = n.index("LeftUpLeg"), n.index("RightUpLeg")
        self.rest = rest_G
        hips = rest_G[self.ih][:3, 3]
        self.spec = {}
        legs_r = dict(self.cfg["legs"])
        legs_r.update(self.cfg.get("characters", {}).get("_any", {}))
        self.legs_r = legs_r
        for base, idx in self.chains.items():
            grp = self.cfg["groups"][self.cfg["prefixes"][CHAIN_RE.match(n[idx[0]]).group(1)]]
            tip = rest_G[idx[-1]][:3, 3]
            # which side the chain hangs on: +1 the character's left (+x), -1 the right
            lat = float(np.clip((tip[0] - hips[0]) / 0.12, -1, 1))
            f = grp["follow"]
            wl = f * float(np.clip(0.5 + 0.5 * lat, 0, 1))
            wr = f * float(np.clip(0.5 - 0.5 * lat, 0, 1))
            L = [float(np.linalg.norm(rest_G[idx[k + 1]][:3, 3] - rest_G[idx[k]][:3, 3])) for k in range(len(idx) - 1)]
            self.spec[base] = {"idx": idx, "grp": grp, "wl": wl, "wr": wr, "len": L}

    def delta(self, G, i):
        return mat_to_q(G[i][:3, :3] @ self.rest[i][:3, :3].T)

    def run(self, Gs, fps=30.0, preroll=20):
        step = self.cfg["step_s"]
        sub = max(1, int(round(1.0 / fps / step)))
        out = [[x.copy() for x in G] for G in Gs]
        state = {}
        seq = [0] * preroll + list(range(len(Gs)))
        yaw0 = None
        spin_w = 0.0
        for si, k in enumerate(seq):
            G = Gs[k]
            dh = self.delta(G, self.ih)
            dl = qmul(self.delta(G, self.il), qinv(dh))
            dr = qmul(self.delta(G, self.ir), qinv(dh))
            caps = [(G[a][:3, 3], G[b][:3, 3], self.legs_r[r]) for a, b, r in self.legs]
            # cq 016, spin-aware (secondary_motion.gd): the hips' turn since the last frame carries
            # the chains round; the turn rate flares them out
            hf = q_to_mat(dh) @ np.array([0, 0, 1.0])
            yaw = float(np.arctan2(hf[0], hf[2]))
            dyaw = 0.0 if yaw0 is None else float((yaw - yaw0 + np.pi) % (2 * np.pi) - np.pi)
            yaw0 = yaw
            spin_w += 0.5 * (abs(dyaw) * fps - spin_w)
            hips_o = G[self.ih][:3, 3]
            cy, sy = np.cos(dyaw), np.sin(dyaw)
            carry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
            for base, s in self.spec.items():
                idx = s["idx"]
                T = np.array([G[i][:3, 3] for i in idx])
                qf = qmul(qslerp(np.array([0, 0, 0, 1.0]), dl, s["wl"]), qslerp(np.array([0, 0, 0, 1.0]), dr, s["wr"]))
                Rf = q_to_mat(qf)
                grp = s["grp"]
                if grp.get("spin_carry"):
                    flare = min(np.radians(grp.get("flare_max_deg", 0.0)), np.radians(grp.get("flare_deg_per_rad_s", 0.0)) * spin_w)
                    r = np.array([T[0][0] - hips_o[0], 0.0, T[0][2] - hips_o[2]])
                    if flare > 0.001 and float(r @ r) > 1e-8:
                        ax = np.cross([0, -1.0, 0], r / np.linalg.norm(r))
                        ax = ax / np.linalg.norm(ax)
                        Rf = q_to_mat(np.append(ax * np.sin(flare / 2), np.cos(flare / 2))) @ Rf
                    if base in state and dyaw != 0.0:
                        state[base] = [hips_o + (x - hips_o) @ carry.T for x in state[base]]
                T = T[0] + (T - T[0]) @ Rf.T
                if s["grp"]["legs"]:
                    # the targets themselves outside the legs: the spring then has a point at
                    # rest it can reach (no fight between spring and collision, no jitter)
                    for j in range(1, len(T)):
                        T[j] = push_out(T[j], caps, s["grp"]["joint_r"])
                if base not in state:
                    state[base] = [T.copy(), T.copy()]
                p, pp = state[base]
                for _ in range(sub):
                    p, pp = self.step(p, pp, T, s, caps), p
                state[base] = [p, pp]
                if si >= preroll:
                    Go = out[k]
                    for j in range(len(idx) - 1):
                        R = Rf @ G[idx[j]][:3, :3]
                        q = q_from_to(T[j + 1] - T[j], p[j + 1] - p[j])
                        M = np.eye(4)
                        M[:3, :3] = q_to_mat(q) @ R
                        M[:3, 3] = p[j]
                        Go[idx[j]] = M
                    M = Go[idx[-2]].copy()
                    M[:3, 3] = p[-1]
                    Go[idx[-1]] = M
        return out

    def step(self, p, pp, T, s, caps):
        grp = s["grp"]
        L = s["len"]
        n = len(p)
        q = p.copy()
        q[0] = T[0]
        v = (p[1:] - pp[1:]) * (1.0 - grp["damping"])
        q[1:] = p[1:] + v + (T[1:] - p[1:]) * grp["stiffness"]
        cosmax = np.cos(np.radians(grp["max_deg"]))
        jr = grp["joint_r"]
        for j in range(1, n):
            if grp["legs"]:
                q[j] = push_out(q[j], caps, jr)
            d = q[j] - q[j - 1]
            dn = max(1e-9, float(np.linalg.norm(d)))
            u = d / dn
            t = T[j] - T[j - 1]
            t = t / max(1e-9, float(np.linalg.norm(t)))
            c = float(u @ t)
            if c < cosmax:
                # turn back toward the target direction, to the limit
                w = u - t * c
                w = w / max(1e-9, float(np.linalg.norm(w)))
                u = t * cosmax + w * np.sqrt(1 - cosmax * cosmax)
            q[j] = q[j - 1] + u * L[j - 1]
        return q
