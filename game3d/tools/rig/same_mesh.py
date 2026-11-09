"""same_mesh.py <original.glb> <fixed.glb>: the proof that a rig fix (cq 014) leaves the look
alone. Compares the bytes of every attribute but the skin (POSITION, NORMAL, TEXCOORD_*,
indices), the materials, samplers, textures and images, and skins the fixed rig at its rest
pose to check every vertex lands where the original's mesh has it. Prints SAME or DIFFERENT."""
import hashlib
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "anim"))
from gltf import Glb, Pose  # noqa: E402


def view_bytes(g, acc_i):
    a = g.json["accessors"][acc_i]
    bv = g.json["bufferViews"][a["bufferView"]]
    o = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    return g.bin[o:o + bv["byteLength"] - a.get("byteOffset", 0)]


def digest(g):
    out = {}
    prim_nodes = [n for n in g.nodes if "mesh" in n]
    for pi, pr in enumerate(g.json["meshes"][prim_nodes[0]["mesh"]]["primitives"]):
        for k, v in sorted(pr["attributes"].items()):
            if k.startswith("JOINTS") or k.startswith("WEIGHTS"):
                continue
            out["prim%d.%s" % (pi, k)] = hashlib.sha256(g.accessor(v).tobytes()).hexdigest()
        out["prim%d.indices" % pi] = hashlib.sha256(g.accessor(pr["indices"]).tobytes()).hexdigest()
        out["prim%d.material" % pi] = json.dumps(g.json["materials"][pr["material"]], sort_keys=True)
    for k in ("textures", "samplers"):
        out[k] = json.dumps(g.json.get(k), sort_keys=True)
    for i, im in enumerate(g.json.get("images", [])):
        bv = g.json["bufferViews"][im["bufferView"]]
        out["image%d" % i] = hashlib.sha256(g.bin[bv.get("byteOffset", 0):bv.get("byteOffset", 0) + bv["byteLength"]]).hexdigest()
    return out


a, b = Glb(sys.argv[1]), Glb(sys.argv[2])
da, db = digest(a), digest(b)
diff = [k for k in sorted(set(da) | set(db)) if da.get(k) != db.get(k)]
# the fixed rig skinned at rest = the mesh as stored (bind pose = rest pose)
pr = b.json["meshes"][[n for n in b.nodes if "mesh" in n][0]["mesh"]]["primitives"][0]
P = b.accessor(pr["attributes"]["POSITION"])
Jn = b.accessor(pr["attributes"]["JOINTS_0"]).astype(int)
Wt = b.accessor(pr["attributes"]["WEIGHTS_0"]).astype(float)
Wt /= Wt.sum(1, keepdims=True)
sk = b.json["skins"][0]
ibm = b.accessor(sk["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)
pose = Pose(b)
G = pose.globals_of(pose.rest)
M = np.stack([G[j] for j in sk["joints"]]) @ ibm
ph = np.concatenate([P, np.ones((len(P), 1))], 1)
out = np.zeros_like(P)
for k in range(4):
    out += Wt[:, k:k + 1] * np.einsum("nij,nj->ni", M[Jn[:, k]][:, :3, :], ph)
err = float(np.abs(out - P).max())
inf = int((Wt > 1e-6).sum(1).max())
print("%s %s vs %s: %d attribute/material/texture/image digests compared, differing: %s; rest-pose skinning max error %.2e m; max influences %d; weights sum to 1: %s" % (
    "SAME" if not diff and err < 1e-4 else "DIFFERENT", sys.argv[1], sys.argv[2], len(da), diff or "none", err, inf,
    bool(np.allclose(b.accessor(pr["attributes"]["WEIGHTS_0"]).sum(1), 1.0, atol=1e-6))))
