"""Shared measuring code for the rig tools (cq 014). It reuses cq 012's retarget and tear gate
unchanged (tools/anim/retarget.py: Retarget, Body, clip_frames), so a rig measured here gives
exactly the numbers build_all.py's gate gives.

  rc = RigCheck(target_glb, key, src_kaykit, src_ual)
  share, per_tri, worst_frame, G = rc.tear(clip)       # one clip, the gate's measure
  rc.where(per_tri)                                    # which bones / body regions stretch
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ANIM = os.path.join(HERE, "..", "anim")
sys.path.insert(0, ANIM)
from gltf import Glb  # noqa: E402
import retarget as RT  # noqa: E402

STRETCH = 2.5   # cq 060's measure: a triangle tears when an edge is stretched past 2.5x


class RigCheck:
    def __init__(self, target, key, src, src_ual="", every=3):
        self.cfg = json.load(open(os.path.join(ANIM, "clips.json")))
        rigs = json.load(open(os.path.join(ANIM, "rigs.json")))
        self.key = key
        self.every = every
        self.tgt = Glb(target)
        self.damp = {}
        for spec in self.cfg.get("damp", {}).get(key, []):
            for b in spec["bones"]:
                self.damp[b] = spec["f"]
        self.rts = {"kaykit": RT.Retarget(Glb(src), self.tgt, rigs["kaykit_to_mixamo"], self.damp)}
        self.anims = {"kaykit": self.rts["kaykit"].src.animations()}
        if src_ual:
            self.rts["ual"] = RT.Retarget(Glb(src_ual), self.tgt, rigs["ual_to_mixamo"], self.damp)
            self.anims["ual"] = self.rts["ual"].src.animations()
        self.body = RT.Body(self.tgt, self.rts["kaykit"])

    def frames(self, clip):
        cc = self.cfg["clips"][clip]
        lib = cc.get("lib", "kaykit")
        rt = self.rts[lib]
        out = RT.clip_frames(rt, self.cfg, cc, self.damp, self.anims[lib], {}, lib)
        return out[1], out[7]

    def checked(self, n):
        ks = list(range(0, n, max(1, self.every)))
        if (n - 1) not in ks:
            ks.append(n - 1)
        return ks

    def per_tri(self, G):
        b = self.body
        ln = b._edge_len(b.skin(G))
        s = np.where(b.ok, ln / np.maximum(b.rest_len, 1e-9), 1.0)
        return np.max(s.reshape(3, len(b.tris)), axis=0)

    def tear(self, clip, sim=None):
        """The gate's number for one clip (the worst checked frame), that frame's per-triangle
        stretch, its index and its globals. sim(Gs) -> Gs lets the secondary bones move."""
        n, Gs = self.frames(clip)
        if sim is not None:
            Gs = sim(Gs)
        best = (-1.0, None, 0, None)
        for k in self.checked(n):
            pt = self.per_tri(Gs[k])
            sh = float(np.mean(pt > STRETCH))
            if sh > best[0]:
                best = (sh, pt, k, Gs[k])
        return best

    def where(self, pt, top=8):
        """Dominant bone of each torn triangle, counted."""
        b = self.body
        bad = pt > STRETCH
        if not bad.any():
            return {}
        v0 = b.tris[bad, 0]
        dom = b.jnt[v0, np.argmax(b.wts[v0], 1)]
        names, cnt = np.unique(dom, return_counts=True)
        order = np.argsort(-cnt)[:top]
        return {self.rts["kaykit"].jnames[names[i]]: int(cnt[i]) for i in order}


from secondary import Secondary, find_chains  # noqa: E402,F401
