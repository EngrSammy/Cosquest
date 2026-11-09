"""Blender automatic weights (bone heat) for a skeleton from make_skeleton.py (cq 014).

  blender -b --factory-startup --python heat_weights.py -- <rigged lod0.glb> <out.npy>

Imports the GLB, builds an armature with the same joints (each bone from its joint to its
child), parents the mesh with automatic weights and writes, per glTF vertex (matched by
position), the 25 bones' weights as a float32 array (n x 25). Prints HEAT_OK, or HEAT_FAILED
with Blender's message when bone heat cannot solve (then fix_rig.py keeps the envelope
weights)."""
import sys

import bpy
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree

argv = sys.argv[sys.argv.index("--") + 1:]
src, out = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
mesh = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
arm_imp = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
# joint world positions from the imported armature (Blender Z-up)
names = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "HeadTop_End",
         "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "RightShoulder", "RightArm", "RightForeArm", "RightHand",
         "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase", "LeftToe_End", "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase", "RightToe_End"]
child = {"Hips": "Spine", "Spine": "Spine1", "Spine1": "Spine2", "Spine2": "Neck", "Neck": "Head", "Head": "HeadTop_End"}
for s in ("Left", "Right"):
    child.update({s + "Shoulder": s + "Arm", s + "Arm": s + "ForeArm", s + "ForeArm": s + "Hand",
                  s + "UpLeg": s + "Leg", s + "Leg": s + "Foot", s + "Foot": s + "ToeBase", s + "ToeBase": s + "Toe_End"})
parent = {}
for p, c in child.items():
    parent[c] = p
parent.update({"LeftShoulder": "Spine2", "RightShoulder": "Spine2", "LeftUpLeg": "Hips", "RightUpLeg": "Hips"})
A = arm_imp[0]
heads = {}
for b in A.data.bones:
    heads[b.name] = A.matrix_world @ b.head_local
# a clean armature with bones joint -> child joint (heat needs real bone segments)
for o in list(bpy.context.scene.objects):
    if o.type == "ARMATURE":
        bpy.data.objects.remove(o, do_unlink=True)
mesh.parent = None
mesh.modifiers.clear()
mesh.vertex_groups.clear()
ad = bpy.data.armatures.new("Heat")
ao = bpy.data.objects.new("Heat", ad)
bpy.context.scene.collection.objects.link(ao)
bpy.context.view_layer.objects.active = ao
bpy.ops.object.mode_set(mode="EDIT")
eb = {}
for n in names:
    if n.endswith("_End"):
        continue
    b = ad.edit_bones.new(n)
    h = heads[n]
    if n in child:
        t = heads[child[n]]
    else:   # hands: along the forearm
        f = heads[n.replace("Hand", "ForeArm")]
        t = h + (h - f) * 0.5
    if (t - h).length < 1e-3:
        t = h + Vector((0, 0, 0.02))
    b.head, b.tail = h, t
    eb[n] = b
for n, b in eb.items():
    if n in parent and parent[n] in eb:
        b.parent = eb[parent[n]]
bpy.ops.object.mode_set(mode="OBJECT")
# bone heat needs a connected surface: weld the UV-seam duplicates first (weights are mapped
# back to the glTF vertices by position, so the weld does not change the shipped mesh)
bpy.ops.object.select_all(action="DESELECT")
mesh.select_set(True)
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.remove_doubles(threshold=1e-4)
bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.object.select_all(action="DESELECT")
mesh.select_set(True)
ao.select_set(True)
bpy.context.view_layer.objects.active = ao
msg = []
try:
    r = bpy.ops.object.parent_set(type="ARMATURE_AUTO")
except Exception as e:  # noqa: BLE001
    msg.append(str(e))
groups = {g.index: g.name for g in mesh.vertex_groups}
me = mesh.data
W = np.zeros((len(me.vertices), len(names)), np.float32)
for v in me.vertices:
    for gw in v.groups:
        n = groups.get(gw.group)
        if n in names:
            W[v.index, names.index(n)] = gw.weight
empty = int((W.sum(1) < 1e-6).sum())
# back to glTF vertex order by position (glTF y-up: (x, y, z) = Blender (x, z, -y))
import struct, json  # noqa: E401,E402
b = open(src, "rb").read()
ln = struct.unpack("<I", b[12:16])[0]
j = json.loads(b[20:20 + ln])
binb = b[20 + ln + 8:]
prim = j["meshes"][0]["primitives"][0]
acc = j["accessors"][prim["attributes"]["POSITION"]]
bv = j["bufferViews"][acc["bufferView"]]
P = np.frombuffer(binb, np.float32, acc["count"] * 3, bv.get("byteOffset", 0) + acc.get("byteOffset", 0)).reshape(-1, 3)
kd = KDTree(len(me.vertices))
for v in me.vertices:
    co = mesh.matrix_world @ v.co
    kd.insert((co.x, co.z, -co.y), v.index)
kd.balance()
out_w = np.zeros((len(P), len(names)), np.float32)
dmax = 0.0
for i, p in enumerate(P):
    co, idx, d = kd.find((float(p[0]), float(p[1]), float(p[2])))
    out_w[i] = W[idx]
    dmax = max(dmax, d)
np.save(out, out_w)
print("HEAT_%s verts=%d unweighted=%d match_max_m=%.6f %s" % ("OK" if empty < 0.02 * len(me.vertices) else "FAILED", len(P), empty, dmax, " ".join(msg)))
