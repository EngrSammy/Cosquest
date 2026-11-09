"""Minimal GLB reader/writer for the cast files (cq 239): mesh arrays out, embedded images
replaced. Every bufferView that is not an image keeps its bytes; the images move to the end
of the BIN chunk."""
from __future__ import annotations

import json
import struct

import numpy as np

_CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}
_NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


class Glb:
    def __init__(self, path: str):
        b = open(path, "rb").read()
        n = struct.unpack("<I", b[12:16])[0]
        self.json = json.loads(b[20:20 + n])
        off = 20 + n
        bl = struct.unpack("<I", b[off:off + 4])[0]
        self.bin = b[off + 8:off + 8 + bl]

    def view_bytes(self, k: int) -> bytes:
        bv = self.json["bufferViews"][k]
        o = bv.get("byteOffset", 0)
        return self.bin[o:o + bv["byteLength"]]

    def image_bytes(self, i: int) -> bytes:
        return self.view_bytes(self.json["images"][i]["bufferView"])

    def accessor(self, i: int) -> np.ndarray:
        a = self.json["accessors"][i]
        bv = self.json["bufferViews"][a["bufferView"]]
        dt = np.dtype(_CT[a["componentType"]])
        nc = _NC[a["type"]]
        off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        stride = bv.get("byteStride", 0) or dt.itemsize * nc
        if stride == dt.itemsize * nc:
            arr = np.frombuffer(self.bin, dtype=dt, count=a["count"] * nc, offset=off).reshape(a["count"], nc)
        else:
            raw = np.frombuffer(self.bin, dtype=np.uint8, count=stride * (a["count"] - 1) + dt.itemsize * nc, offset=off)
            arr = np.lib.stride_tricks.as_strided(raw, (a["count"], dt.itemsize * nc), (stride, 1)).copy().view(dt).reshape(a["count"], nc)
        if a.get("normalized") and dt != np.float32:
            arr = arr.astype(np.float32) / np.iinfo(dt).max
        return arr

    def set_accessor(self, i: int, arr: np.ndarray) -> None:
        """overwrite a tightly packed accessor's bytes in place (same count, type and size)"""
        a = self.json["accessors"][i]
        bv = self.json["bufferViews"][a["bufferView"]]
        dt = np.dtype(_CT[a["componentType"]])
        nc = _NC[a["type"]]
        assert not bv.get("byteStride") or bv["byteStride"] == dt.itemsize * nc
        data = np.ascontiguousarray(arr, dtype=dt).reshape(a["count"], nc).tobytes()
        off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        b = bytearray(self.bin)
        b[off:off + len(data)] = data
        self.bin = bytes(b)
        if "min" in a:
            a["min"] = arr.min(0).tolist()
            a["max"] = arr.max(0).tolist()

    def mesh_arrays(self) -> dict:
        """positions (rest, metres, glTF space: +Y up, the character faces +Z), normals, uv, triangles"""
        pr = self.json["meshes"][0]["primitives"][0]
        at = pr["attributes"]
        m = {"pos": self.accessor(at["POSITION"]).astype(np.float64),
             "uv": self.accessor(at["TEXCOORD_0"]).astype(np.float64),
             "idx": self.accessor(pr["indices"]).reshape(-1, 3).astype(np.int64)}
        if "NORMAL" in at:
            m["nrm"] = self.accessor(at["NORMAL"]).astype(np.float64)
        if "JOINTS_0" in at and self.json.get("skins"):
            j = self.accessor(at["JOINTS_0"]).astype(np.int64)
            w = self.accessor(at["WEIGHTS_0"]).astype(np.float64)
            names = [self.json["nodes"][n].get("name", "") for n in self.json["skins"][0]["joints"]]
            m["bone"] = np.array([names[j[i, np.argmax(w[i])]] for i in range(len(j))])
        return m

    def replace_images(self, new: dict) -> None:
        j = self.json
        img_views = {im["bufferView"] for im in j["images"]}
        out = bytearray()
        newoff = {}
        order = sorted(range(len(j["bufferViews"])), key=lambda k: j["bufferViews"][k].get("byteOffset", 0))
        for k in order:
            if k in img_views:
                continue
            while len(out) % 4:
                out.append(0)
            newoff[k] = len(out)
            out += self.view_bytes(k)
        for i, im in enumerate(j["images"]):
            k = im["bufferView"]
            data = new.get(i, self.view_bytes(k))
            while len(out) % 4:
                out.append(0)
            newoff[k] = len(out)
            out += data
            j["bufferViews"][k]["byteLength"] = len(data)
        for k, o in newoff.items():
            j["bufferViews"][k]["byteOffset"] = o
        while len(out) % 4:
            out.append(0)
        j["buffers"][0]["byteLength"] = len(out)
        self.bin = bytes(out)

    def save(self, path: str) -> None:
        js = json.dumps(self.json, separators=(",", ":")).encode()
        js += b" " * ((4 - len(js) % 4) % 4)
        total = 12 + 8 + len(js) + 8 + len(self.bin)
        with open(path, "wb") as f:
            f.write(struct.pack("<III", 0x46546C67, 2, total))
            f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
            f.write(struct.pack("<II", len(self.bin), 0x004E4942) + self.bin)
