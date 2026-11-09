"""Give an unrigged cast model a skeleton (cq 014; Hoof, whom cq 060's auto-rig rejected).

  $BLENDER_PY make_skeleton.py --key hoof --src <dir with lod0/1/2.glb> --out <dir> [--spec skeleton_spec.json]

Joints are placed from the mesh by scripted landmarks: each joint has a seed point in
skeleton_spec.json and is moved to the centroid of the mesh points within `r` of it (the
middle of the limb at that height), optionally offset. The skeleton is cq 060's
humanoid-mixamo layout (25 bones, the same names and parents as the rest of the cast), so
rigs.json, the clip retarget, attach.json's hand_r / hand_l and the fight code work
unchanged. Bones have identity rest rotations.

Writes lod0/1/2.glb with an Armature root, the joints, a skin and first weights: the nearest
bone segments (inverse distance), which fix_rig.py then cleans and rebuilds (legs, torso,
chains, harmonic fill) like every other cast rig. Positions, normals, UVs, indices and
textures are untouched.
"""
import argparse
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "anim"))
from gltf import Glb, write_glb  # noqa: E402

BONES = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "HeadTop_End",
         "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
         "RightShoulder", "RightArm", "RightForeArm", "RightHand",
         "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase", "LeftToe_End",
         "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase", "RightToe_End"]
PARENT = {"Hips": None, "Spine": "Hips", "Spine1": "Spine", "Spine2": "Spine1", "Neck": "Spine2", "Head": "Neck",
          "HeadTop_End": "Head", "LeftShoulder": "Spine2", "LeftArm": "LeftShoulder", "LeftForeArm": "LeftArm",
          "LeftHand": "LeftForeArm", "RightShoulder": "Spine2", "RightArm": "RightShoulder", "RightForeArm": "RightArm",
          "RightHand": "RightForeArm", "LeftUpLeg": "Hips", "LeftLeg": "LeftUpLeg", "LeftFoot": "LeftLeg",
          "LeftToeBase": "LeftFoot", "LeftToe_End": "LeftToeBase", "RightUpLeg": "Hips", "RightLeg": "RightUpLeg",
          "RightFoot": "RightLeg", "RightToeBase": "RightFoot", "RightToe_End": "RightToeBase"}


def place(P, spec):
    """Joint positions from the spec's landmarks: seed -> centroid of the points within r."""
    J = {}
    for b in BONES:
        s = spec["joints"][b]
        if "between" in s:
            a, c, u = s["between"]
            J[b] = J[a] + (J[c] - J[a]) * u if a in J and c in J else None
            continue
        seed = np.array(s["seed"], float)
        if s.get("r"):
            d = np.linalg.norm(P - seed, axis=1)
            sel = d < s["r"]
            if sel.sum() >= 5:
                c = P[sel].mean(0)
                keep = np.array(s.get("keep", [0, 0, 0]), bool)    # axes held at the seed
                seed = np.where(keep, seed, c)
        J[b] = seed + np.array(s.get("offset", [0, 0, 0]), float)
    for b in BONES:     # "between" joints whose ends came later
        s = spec["joints"][b]
        if "between" in s and J[b] is None:
            a, c, u = s["between"]
            J[b] = J[a] + (J[c] - J[a]) * u
    return J


def seg_dist(p, a, b):
    ab = b - a
    t = np.clip(((p - a) @ ab) / max(1e-12, ab @ ab), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)


CHILD = {"Hips": "Spine", "Spine": "Spine1", "Spine1": "Spine2", "Spine2": "Neck", "Neck": "Head", "Head": "HeadTop_End"}
for _s in ("Left", "Right"):
    CHILD.update({_s + "Shoulder": _s + "Arm", _s + "Arm": _s + "ForeArm", _s + "ForeArm": _s + "Hand",
                  _s + "UpLeg": _s + "Leg", _s + "Leg": _s + "Foot", _s + "Foot": _s + "ToeBase", _s + "ToeBase": _s + "Toe_End"})


def first_weights(P, J):
    """Inverse-distance weights to the 4 nearest bone segments (fix_rig.py rebuilds them)."""
    D = []
    for b in BONES:
        a = J[b]
        if b in CHILD:
            c = J[CHILD[b]]
        elif b.endswith("Hand"):
            c = a + (a - J[b.replace("Hand", "ForeArm")]) * 0.5
        else:
            c = a + np.array([0, 0.02, 0])
        D.append(seg_dist(P, a, c))
    D = np.stack(D, 1)
    for b in ("HeadTop_End", "LeftToe_End", "RightToe_End"):
        D[:, BONES.index(b)] = 1e3      # end joints take no weight
    idx = np.argsort(D, 1)[:, :4]
    w = 1.0 / np.maximum(np.take_along_axis(D, idx, 1), 0.01) ** 4
    w /= w.sum(1, keepdims=True)
    q = np.floor(w * 255 + 0.5).astype(int)
    q[:, 0] += 255 - q.sum(1)
    return idx.astype(np.uint8), np.clip(q, 0, 255).astype(np.uint8)


def rig_glb(src, out, J):
    g = Glb(src)
    j = json.loads(json.dumps(g.json))
    if len(j["nodes"]) != 1 or "mesh" not in j["nodes"][0]:
        raise SystemExit("expected one mesh node: " + src)
    prim = j["meshes"][j["nodes"][0]["mesh"]]["primitives"][0]
    P = g.accessor(prim["attributes"]["POSITION"]).astype(float)
    binb = bytearray(g.bin)
    mesh_node = j["nodes"][0]
    nodes = []
    for b in BONES:
        p = PARENT[b]
        t = J[b] - (J[p] if p else np.zeros(3))
        nodes.append({"name": b, "translation": [float(v) for v in t]})
    for k, b in enumerate(BONES):
        ch = [BONES.index(c) for c in BONES if PARENT[c] == b]
        if ch:
            nodes[k]["children"] = ch
    mesh_node = dict(mesh_node)
    mesh_node["skin"] = 0
    nodes.append(mesh_node)                                      # 25: the mesh
    nodes.append({"name": "Armature", "children": [0, 25]})      # 26: the root, as cq 060's rigs
    j["nodes"] = nodes
    j["scenes"][0]["nodes"] = [26]

    def add(arr, ctype, typ, normalized=False):
        nonlocal binb
        while len(binb) % 4:
            binb.append(0)
        off = len(binb)
        binb.extend(arr.tobytes())
        j["bufferViews"].append({"buffer": 0, "byteOffset": off, "byteLength": arr.nbytes})
        acc = {"bufferView": len(j["bufferViews"]) - 1, "componentType": ctype, "count": int(arr.shape[0]), "type": typ}
        if normalized:
            acc["normalized"] = True
        j["accessors"].append(acc)
        return len(j["accessors"]) - 1

    ibm = np.stack([np.linalg.inv(np.block([[np.eye(3), J[b][:, None]], [np.zeros((1, 3)), np.ones((1, 1))]])).T.reshape(-1) for b in BONES]).astype(np.float32)
    ji, wi = first_weights(P, J)
    prim["attributes"]["JOINTS_0"] = add(np.ascontiguousarray(ji), 5121, "VEC4")
    prim["attributes"]["WEIGHTS_0"] = add(np.ascontiguousarray(wi), 5121, "VEC4", True)
    j["skins"] = [{"joints": list(range(25)), "inverseBindMatrices": add(ibm, 5126, "MAT4")}]
    j["buffers"][0]["byteLength"] = len(binb)
    j["asset"]["generator"] = (j["asset"].get("generator", "") + " + cosquest cq014 make_skeleton.py").strip()
    write_glb(out, j, bytes(binb))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", required=True)
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--spec", default=os.path.join(HERE, "skeleton_spec.json"))
    a = ap.parse_args()
    spec = json.load(open(a.spec))[a.key]
    os.makedirs(a.out, exist_ok=True)
    g0 = Glb(os.path.join(a.src, "lod0.glb"))
    prim = g0.json["meshes"][g0.json["nodes"][0]["mesh"]]["primitives"][0]
    P0 = g0.accessor(prim["attributes"]["POSITION"]).astype(float)
    J = place(P0, spec)
    for lod in ("lod0", "lod1", "lod2"):
        p = os.path.join(a.src, lod + ".glb")
        if os.path.exists(p):
            rig_glb(p, os.path.join(a.out, lod + ".glb"), J)
    json.dump({"key": a.key, "joints": {b: [round(float(v), 4) for v in J[b]] for b in BONES}}, open(os.path.join(a.out, "skeleton.json"), "w"), indent=1)
    print("SKELETON", a.key, "joints placed from", len(P0), "points")


if __name__ == "__main__":
    main()
