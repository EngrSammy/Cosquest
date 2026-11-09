# blender -b -P fbx2glb.py -- <out_dir> <fbx> [<fbx> ...]: each FBX to a GLB with its texture embedded
import bpy, sys, os
argv = sys.argv[sys.argv.index("--") + 1:]
out = argv[0]
os.makedirs(out, exist_ok=True)
for src in argv[1:]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=src)
    tex = os.path.join(os.path.dirname(src), "Textures", "colormap.png")
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        nt = m.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        has_img = any(n.type == "TEX_IMAGE" and n.image for n in nt.nodes)
        if bsdf is not None and not has_img and os.path.exists(tex):
            img = bpy.data.images.load(tex, check_existing=True)
            n = nt.nodes.new("ShaderNodeTexImage")
            n.image = img
            n.interpolation = "Closest"
            nt.links.new(n.outputs["Color"], bsdf.inputs["Base Color"])
    name = os.path.splitext(os.path.basename(src))[0]
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, name + ".glb"), export_format="GLB", export_apply=True)
    print("CONVERTED", name)
