#!/usr/bin/env python3
"""same_rig.py <before.glb> <after.glb> ...pairs: proof that a look pass changed only the images (cq 239).

Every bufferView that is not an image must hold the same bytes, and the glTF JSON must be the
same except the images' bufferView offsets/lengths, their mimeType and the buffer's length.
So meshes, UVs, normals, skins, joints, weights, inverse binds, nodes and clips are identical,
and cq 014's tear gate result carries over unchanged. --allow-normals: the NORMAL accessor may
differ too (tools/look/normals.py; shading only, the tear gate measures positions). Exit 1 on any
other difference."""
import copy
import json
import sys

import glbio


def strip(j):
    j = copy.deepcopy(j)
    iv = {im["bufferView"] for im in j.get("images", [])}
    for k, bv in enumerate(j["bufferViews"]):
        bv.pop("byteOffset", None)
        if k in iv:
            bv.pop("byteLength", None)
    for im in j.get("images", []):
        im.pop("mimeType", None)
    for b in j["buffers"]:
        b.pop("byteLength", None)
    return j


def same(a, b, allow_normals=False):
    A, B = glbio.Glb(a), glbio.Glb(b)
    skip = set()
    if allow_normals:
        for m in A.json["meshes"]:
            for pr in m["primitives"]:
                if "NORMAL" in pr["attributes"]:
                    acc = pr["attributes"]["NORMAL"]
                    skip.add(A.json["accessors"][acc]["bufferView"])
                    for J in (A.json, B.json):
                        J["accessors"][acc].pop("min", None)
                        J["accessors"][acc].pop("max", None)
    if strip(A.json) != strip(B.json):
        return False, "json differs"
    iv = {im["bufferView"] for im in A.json.get("images", [])}
    for k in range(len(A.json["bufferViews"])):
        if k in iv or k in skip:
            continue
        if A.view_bytes(k) != B.view_bytes(k):
            return False, "bufferView %d differs" % k
    n = len(A.json["bufferViews"]) - len(iv) - len(skip)
    return True, "%d non-image bufferViews identical" % n


if __name__ == "__main__":
    ok = True
    args = sys.argv[1:]
    allow = "--allow-normals" in args
    args = [x for x in args if x != "--allow-normals"]
    for a, b in zip(args[::2], args[1::2]):
        r, why = same(a, b, allow)
        ok &= r
        print(json.dumps({"before": a, "after": b, "same_rig": r, "why": why}))
    sys.exit(0 if ok else 1)
