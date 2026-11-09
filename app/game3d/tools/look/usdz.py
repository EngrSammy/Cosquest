"""usdz.py: a USDZ beside every <name>__lod<n>.glb of a pack, for iOS (cq 239). Blender headless:

  blender -b --factory-startup --python usdz.py -- <pack dir> [<pack dir> ...]

The GLB is imported as it is (mesh, skin, textures) and exported with Blender's USD exporter,
textures packed in the .usdz. The pack's SHA256SUMS is rewritten.

A rigged model carries its idle clip (1 Nov 2026, "See it here" AR): Blender's USD exporter
writes only the armature's active action, so the idle action (else the first) is made active
and exported as a SkelAnimation over its own frame range. Before this the export had
export_animation=False and every USDZ on staging was a still bind pose with no clips
(RealityKit's availableAnimations was empty); with it RealityKit loads the clip and the app
plays it (SummonIsland.swift). One clip per file: USD binds one animation source per skeleton,
so walk and celebrate stay GLB-only (Filament) for now.

Works with Blender 4.2 (the farm) and 5.x (export_textures was renamed there)."""
import hashlib
import os
import sys

import bpy

#: The clip a USDZ carries, by preference.
CLIP = "idle"


def active_clip():
    """Makes the idle action (else the first) the armature's active one; its frame range, or None."""
    arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    if not arms or not bpy.data.actions:
        return None
    acts = sorted(bpy.data.actions, key=lambda a: a.name.lower())
    act = next((a for a in acts if a.name.lower().split("|")[-1].startswith(CLIP)), acts[0])
    arm = arms[0]
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = act
    start, end = (int(round(v)) for v in act.frame_range)
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = start, max(end, start + 1)
    return act.name


def export(out, animated):
    kw = dict(filepath=out, export_animation=animated, selected_objects_only=False)
    try:
        bpy.ops.wm.usd_export(export_textures=True, **kw)
    except TypeError:
        bpy.ops.wm.usd_export(**kw)


dirs = sys.argv[sys.argv.index("--") + 1:]
for d in dirs:
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".glb"):
            continue
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=os.path.join(d, fn))
        clip = active_clip()
        out = os.path.join(d, fn[:-4] + ".usdz")
        export(out, clip is not None)
        print("CQUSDZ", out, os.path.getsize(out), "clip=%s" % clip)
    with open(os.path.join(d, "SHA256SUMS"), "w") as f:
        for fn in sorted(os.listdir(d)):
            if fn != "SHA256SUMS":
                f.write("%s  %s\n" % (hashlib.sha256(open(os.path.join(d, fn), "rb").read()).hexdigest(), fn))
