"""Checks of the secondary motion on a fixed rig (cq 014), with the game's sim (secondary.py):

  $BLENDER_PY secondary_check.py --glb <rig lod1.glb> --key elvis [--out report.json]

  through_legs  share of the chain-driven vertices (robe, coat, skirt, wings) inside the leg
                capsules (thigh r_thigh, shin r_shin, less 1 cm), worst frame per clip, with the
                sim and with the chains rigid (as the clips alone would move them)
  rest_jitter   the rest pose held 3 s: how far the chain joints still move per frame after 0.5 s
  hit_stop      Hit_A with a 0.15 s freeze at its contact frame: the largest lag of a joint from
                its target during and after the freeze, against the same clip without it
  dodge_settle  Dodge_Forward then its last frame held: seconds until every joint is within
                1 cm of its target
"""
import argparse
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from rigcheck import RigCheck  # noqa: E402
from secondary import Secondary, seg_closest  # noqa: E402

W = os.path.expanduser(os.environ.get("CQ_RIG_WORK", "~/cq-work/cosquest-quality-rigs"))


def chain_speed(sec, Gsim):
    """Per frame, the largest frame-to-frame move of a chain joint (m)."""
    out = [0.0]
    for A, B in zip(Gsim[:-1], Gsim[1:]):
        m = 0.0
        for s in sec.spec.values():
            for i in s["idx"][1:]:
                m = max(m, float(np.linalg.norm(B[i][:3, 3] - A[i][:3, 3])))
        out.append(m)
    return np.array(out)


def chain_lag(sec, Gs, Gsim):
    """Per frame, the largest distance of a chain joint from its rigid target (m)."""
    out = []
    for G, Gs_ in zip(Gs, Gsim):
        m = 0.0
        for s in sec.spec.values():
            for i in s["idx"][1:]:
                m = max(m, float(np.linalg.norm(Gs_[i][:3, 3] - G[i][:3, 3])))
        out.append(m)
    return np.array(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--glb", required=True)
    ap.add_argument("--key", required=True)
    ap.add_argument("--src", default=W + "/dl/kaykit_adv_chars/Knight.glb")
    ap.add_argument("--src_ual", default=W + "/dl/ual1_godot/AnimationLibrary_Godot_Standard.gltf")
    ap.add_argument("--clips", default="2H_Melee_Idle,Walking_B,Running_B,1H_Melee_Attack_Slice_Diagonal,2H_Melee_Attack_Chop,Hit_A,Dodge_Forward,Death_A")
    ap.add_argument("--out", default="")
    a = ap.parse_args()
    rc = RigCheck(a.glb, a.key, a.src, a.src_ual)
    rt = rc.rts["kaykit"]
    sec = Secondary(rc.tgt, rt.t_rest_G)
    if not sec.chains:
        raise SystemExit("no secondary chains on " + a.glb)
    b = rc.body
    # vertices the chains drive (at least half their weight on chain bones)
    chain_j = set()
    for s in sec.spec.values():
        chain_j.update(s["idx"])
    jn = np.array([rt.joints.index(j) if j in rt.joints else -1 for j in sorted(chain_j)])
    on_chain = np.isin(b.jnt, jn[jn >= 0])
    driven = (b.wts * on_chain).sum(1) >= 0.5
    n = rc.tgt.names
    caps_def = [(n.index(x), n.index(y), sec.legs_r[r] - 0.01) for x, y, r in (
        ("LeftUpLeg", "LeftLeg", "r_thigh"), ("LeftLeg", "LeftFoot", "r_shin"),
        ("RightUpLeg", "RightLeg", "r_thigh"), ("RightLeg", "RightFoot", "r_shin"))]

    # cq 016: the fighters' vertex shader pushes cloth vertices out of the leg capsules (char_lit.gdshader,
    # radius secondary.json "cloth_push"); its twin, to measure what the game draws
    push_r = dict(sec.cfg.get("cloth_push", {}))
    caps_push = [(n.index(x), n.index(y), push_r.get(r, sec.legs_r[r] + 0.015)) for x, y, r in (
        ("LeftUpLeg", "LeftLeg", "r_thigh"), ("LeftLeg", "LeftFoot", "r_shin"),
        ("RightUpLeg", "RightLeg", "r_thigh"), ("RightLeg", "RightFoot", "r_shin"))]
    cw_all = (b.wts * on_chain).sum(1)
    k_push = np.clip((cw_all - 0.02) / 0.48, 0, 1)
    k_push = k_push * k_push * (3 - 2 * k_push)

    def gpu_push(G, V):
        sel = cw_all > 0.02
        P = V[sel].copy()
        for ia, ib, r in caps_push:
            pa, pb = G[ia][:3, 3], G[ib][:3, 3]
            ab = pb - pa
            t = np.clip(((P - pa) @ ab) / max(1e-12, ab @ ab), 0, 1)
            c = pa + t[:, None] * ab
            d = P - c
            dn = np.linalg.norm(d, axis=1)
            m = (dn < r) & (dn > 1e-5)
            P[m] = c[m] + d[m] * (r / dn[m])[:, None]
        out = V.copy()
        out[sel] = V[sel] + (P - V[sel]) * k_push[sel][:, None]
        return out

    def inside(G, push=False):
        V = b.skin(G)
        if push:
            V = gpu_push(G, V)
        V = V[driven]
        hit = np.zeros(len(V), bool)
        for ia, ib, r in caps_def:
            pa, pb = G[ia][:3, 3], G[ib][:3, 3]
            ab = pb - pa
            t = np.clip(((V - pa) @ ab) / max(1e-12, ab @ ab), 0, 1)
            d = np.linalg.norm(V - (pa + t[:, None] * ab), axis=1)
            hit |= d < r
        return float(hit.mean())

    rep = {"key": a.key, "glb": a.glb, "chains": sorted(sec.chains), "driven_vertices": int(driven.sum()), "through_legs": {}}
    for c in a.clips.split(","):
        nfr, Gs = rc.frames(c)
        Gsim = sec.run(Gs)
        ks = rc.checked(nfr)
        rep["through_legs"][c] = {"sim": round(max(inside(Gsim[k]) for k in ks) * 100, 3),
                                  "sim_gpu_push": round(max(inside(Gsim[k], True) for k in ks) * 100, 3),
                                  "rigid": round(max(inside(Gs[k]) for k in ks) * 100, 3),
                                  "max_lag_m": round(float(chain_lag(sec, Gs, Gsim).max()), 3)}
        print("through legs %-32s sim %.3f %% sim+gpu push %.3f %% rigid %.3f %% (of %d driven vertices), max lag %.3f m" % (
            c, rep["through_legs"][c]["sim"], rep["through_legs"][c]["sim_gpu_push"], rep["through_legs"][c]["rigid"], driven.sum(), rep["through_legs"][c]["max_lag_m"]))
    # the rest pose held 3 s: the joints must come to a stop (no jitter)
    G0 = rt.t_rest_G
    Gs = [G0] * 90
    sp = chain_speed(sec, sec.run(Gs, preroll=0))
    rep["rest_jitter_m_per_frame"] = round(float(sp[15:].max()), 6)
    rep["rest_through_legs"] = round(inside(sec.run(Gs, preroll=0)[-1]) * 100, 3)
    print("rest: joints move at most %.6f m per frame after 0.5 s; %.3f %% of driven vertices touch the legs at rest (the mesh's own contact)" % (
        rep["rest_jitter_m_per_frame"], rep["rest_through_legs"]))
    # hit-stop: Hit_A frozen 0.15 s a third of the way in
    nfr, Gs = rc.frames("Hit_A")
    k0 = nfr // 3
    frozen = Gs[:k0] + [Gs[k0]] * 5 + Gs[k0:]
    sf = chain_speed(sec, sec.run(frozen))
    sn = chain_speed(sec, sec.run(Gs))
    rep["hit_stop"] = {"max_joint_move_per_frame_with_freeze_m": round(float(sf.max()), 4), "without_m": round(float(sn.max()), 4),
                       "during_freeze_m": round(float(sf[k0 + 1:k0 + 5].max()), 4)}
    print("hit-stop: joints move at most %.4f m per frame with a 0.15 s freeze (%.4f during it), %.4f without" % (sf.max(), sf[k0 + 1:k0 + 5].max(), sn.max()))
    # settle after a dodge: the last frame held, until the joints stop (under 1 mm a frame)
    nfr, Gs = rc.frames("Dodge_Forward")
    seq = Gs + [Gs[-1]] * 60
    sp = chain_speed(sec, sec.run(seq))[nfr:]
    settle = next((i for i in range(len(sp)) if sp[i:].max() < 0.001), None)
    rep["dodge_settle_s"] = round(settle / 30.0, 2) if settle is not None else None
    print("dodge: the chains come to rest (under 1 mm a frame) %s s after the clip ends" % rep["dodge_settle_s"])
    if a.out:
        json.dump(rep, open(a.out, "w"), indent=1)


if __name__ == "__main__":
    main()
