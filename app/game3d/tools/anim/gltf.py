"""Minimal glTF 2.0 (GLB) reader/writer and transform maths for the animation tools (cq 012).

numpy only, so it runs under Blender 4.2's bundled Python (headless, CPU) or any Python 3
with numpy. Quaternions are [x, y, z, w] like glTF.
"""
import json
import struct

import numpy as np

COMP = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


# ------------------------------------------------------------------ quaternions

def qmul(a, b):
    ax, ay, az, aw = np.moveaxis(np.asarray(a, float), -1, 0)
    bx, by, bz, bw = np.moveaxis(np.asarray(b, float), -1, 0)
    return np.stack([aw * bx + ax * bw + ay * bz - az * by,
                     aw * by - ax * bz + ay * bw + az * bx,
                     aw * bz + ax * by - ay * bx + az * bw,
                     aw * bw - ax * bx - ay * by - az * bz], -1)


def qinv(q):
    q = np.asarray(q, float)
    return q * np.array([-1, -1, -1, 1.0])


def qnorm(q):
    q = np.asarray(q, float)
    return q / np.linalg.norm(q, axis=-1, keepdims=True)


def qrot(q, v):
    """Rotate vector(s) v by quaternion(s) q."""
    q = np.asarray(q, float)
    v = np.asarray(v, float)
    u = q[..., :3]
    w = q[..., 3:4]
    t = 2.0 * np.cross(u, v)
    return v + w * t + np.cross(u, t)


def qslerp(a, b, u):
    a = qnorm(a)
    b = qnorm(b)
    d = float(np.dot(a, b))
    if d < 0.0:
        b = -b
        d = -d
    if d > 0.9995:
        return qnorm(a + (b - a) * u)
    th = np.arccos(d)
    return (np.sin((1 - u) * th) * a + np.sin(u * th) * b) / np.sin(th)


def q_from_to(a, b):
    """The shortest rotation taking direction a to direction b."""
    a = np.asarray(a, float) / np.linalg.norm(a)
    b = np.asarray(b, float) / np.linalg.norm(b)
    c = np.cross(a, b)
    d = float(np.dot(a, b))
    if d < -0.999999:
        axis = np.cross(a, [1, 0, 0])
        if np.linalg.norm(axis) < 1e-6:
            axis = np.cross(a, [0, 1, 0])
        axis /= np.linalg.norm(axis)
        return np.array([axis[0], axis[1], axis[2], 0.0])
    q = np.array([c[0], c[1], c[2], 1.0 + d])
    return q / np.linalg.norm(q)


def q_to_mat(q):
    x, y, z, w = qnorm(q)
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def mat_to_q(m):
    m = np.asarray(m, float)[:3, :3]
    # orthonormalise (scale-free)
    u, _, vt = np.linalg.svd(m)
    m = u @ vt
    tr = m[0, 0] + m[1, 1] + m[2, 2]
    if tr > 0:
        s = np.sqrt(tr + 1.0) * 2
        q = [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, 0.25 * s]
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = np.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        q = [0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s]
    elif m[1, 1] > m[2, 2]:
        s = np.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        q = [(m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s]
    else:
        s = np.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
        q = [(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s, (m[1, 0] - m[0, 1]) / s]
    return qnorm(np.array(q))


def trs_mat(t, r, s):
    m = np.eye(4)
    m[:3, :3] = q_to_mat(r) * np.asarray(s, float)[None, :]
    m[:3, 3] = t
    return m


# ------------------------------------------------------------------ GLB

class Glb:
    def __init__(self, path):
        self.path = path
        b = open(path, "rb").read()
        self.bin = b""
        self.json = None
        off = 12
        if path.endswith(".gltf"):
            import os
            self.json = json.loads(b)
            uri = self.json["buffers"][0].get("uri", "")
            self.bin = open(os.path.join(os.path.dirname(path), uri), "rb").read()
            off = len(b)
        elif b[:4] != b"glTF":
            raise ValueError("not a GLB: " + path)
        while off < len(b):
            ln, kind = struct.unpack("<II", b[off:off + 8])
            chunk = b[off + 8:off + 8 + ln]
            if kind == 0x4E4F534A:
                self.json = json.loads(chunk)
            elif kind == 0x004E4942:
                self.bin = chunk
            off += 8 + ln
        j = self.json
        self.nodes = j["nodes"]
        self.names = [n.get("name", "node%d" % i) for i, n in enumerate(self.nodes)]
        self.parent = [-1] * len(self.nodes)
        for i, n in enumerate(self.nodes):
            for c in n.get("children", []):
                self.parent[c] = i

    def accessor(self, i):
        a = self.json["accessors"][i]
        n = NCOMP[a["type"]]
        dt = COMP[a["componentType"]]
        cnt = a["count"]
        if "bufferView" not in a:
            return np.zeros((cnt, n), dt)
        bv = self.json["bufferViews"][a["bufferView"]]
        off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        isz = np.dtype(dt).itemsize
        stride = bv.get("byteStride", n * isz)
        if stride == n * isz:
            arr = np.frombuffer(self.bin, dt, cnt * n, off).reshape(cnt, n)
        else:
            raw = np.frombuffer(self.bin, np.uint8, stride * (cnt - 1) + n * isz, off)
            arr = np.lib.stride_tricks.as_strided(raw, (cnt, n * isz), (stride, 1)).copy().view(dt).reshape(cnt, n)
        if a.get("normalized"):
            arr = arr.astype(float) / float(np.iinfo(dt).max)
        return arr.astype(float) if dt == np.float32 or a.get("normalized") else arr

    def node_trs(self, i):
        n = self.nodes[i]
        if "matrix" in n:
            m = np.array(n["matrix"], float).reshape(4, 4).T
            s = np.linalg.norm(m[:3, :3], axis=0)
            return m[:3, 3].copy(), mat_to_q(m[:3, :3] / s), s
        return (np.array(n.get("translation", [0, 0, 0]), float), qnorm(np.array(n.get("rotation", [0, 0, 0, 1]), float)),
                np.array(n.get("scale", [1, 1, 1]), float))

    def find(self, name):
        return self.names.index(name)

    def animations(self):
        out = {}
        for a in self.json.get("animations", []):
            chans = []
            end = 0.0
            for c in a["channels"]:
                s = a["samplers"][c["sampler"]]
                tin = self.accessor(s["input"])[:, 0].astype(float)
                vout = self.accessor(s["output"]).astype(float)
                interp = s.get("interpolation", "LINEAR")
                if interp == "CUBICSPLINE":
                    vout = vout.reshape(len(tin), 3, -1)[:, 1, :]
                chans.append((c["target"].get("node"), c["target"]["path"], tin, vout, interp))
                end = max(end, float(tin[-1]))
            out[a["name"]] = {"channels": chans, "length": end}
        return out


def sample_channel(tin, vout, interp, t, path):
    if t <= tin[0]:
        return vout[0]
    if t >= tin[-1]:
        return vout[-1]
    k = int(np.searchsorted(tin, t) - 1)
    if interp == "STEP":
        return vout[k]
    u = (t - tin[k]) / max(1e-9, tin[k + 1] - tin[k])
    if path == "rotation":
        return qslerp(vout[k], vout[k + 1], u)
    return vout[k] * (1 - u) + vout[k + 1] * u


class Pose:
    """Local TRS of every node of a GLB, optionally overridden by an animation at time t,
    and the resulting globals."""

    def __init__(self, glb):
        self.g = glb
        self.rest = [glb.node_trs(i) for i in range(len(glb.nodes))]
        # topological order (parents first)
        order = []
        seen = set()

        def visit(i):
            if i in seen:
                return
            if glb.parent[i] >= 0:
                visit(glb.parent[i])
            seen.add(i)
            order.append(i)
        for i in range(len(glb.nodes)):
            visit(i)
        self.order = order

    def locals_at(self, anim, t):
        loc = [list(x) for x in self.rest]
        if anim is not None:
            for node, path, tin, vout, interp in anim["channels"]:
                if node is None:
                    continue
                v = sample_channel(tin, vout, interp, t, path)
                if path == "translation":
                    loc[node][0] = v
                elif path == "rotation":
                    loc[node][1] = qnorm(v)
                elif path == "scale":
                    loc[node][2] = v
        return loc

    def globals_of(self, loc):
        G = [None] * len(loc)
        for i in self.order:
            m = trs_mat(*loc[i])
            p = self.g.parent[i]
            G[i] = m if p < 0 else G[p] @ m
        return G


def write_glb(path, gjson, binary):
    js = json.dumps(gjson, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    binary += b"\0" * ((4 - len(binary) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(binary)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A))
        f.write(js)
        f.write(struct.pack("<II", len(binary), 0x004E4942))
        f.write(binary)
