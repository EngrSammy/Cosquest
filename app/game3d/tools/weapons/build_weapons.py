"""Build the CosQuest default weapons as contract-2 Forge import packs (cq 234).

Headless Blender 4.2, CPU only:

  blender -b --factory-startup -noaudio --python build_weapons.py -- \
      --spec weapons.json --src <download dir> --out <dir> [--only slug,slug] [--no-thumbs]

For each weapon in weapons.json it writes <out>/packs/<slug>/:
  pack.json                 tools/forge_import.py's format (type weapon, stats with kind,
                            sockets grip/tip, bounds_m, material, source, licence)
  <slug>__lod0.glb          full mesh, texture embedded (one atlas per weapon)
  <slug>__lod1.glb          ~60 % of the triangles, texture at 512
  <slug>__lod2.glb          ~30 % of the triangles, texture at 256
  <slug>__lod{0,1,2}.usdz   the same, for iOS
  <slug>__thumb.png         512 px, transparent, Cycles CPU
and <out>/views/<slug>_contract.png, a side view in the contract frame
(tip up, edge/head/top to the left) to check the axes by eye.

The contract (costquest-backend docs/forge/CONTRACT.md, pivot "grip"): the
origin is where the hand closes, +Y (glTF) runs along the blade, haft or
barrel to the tip, +Z (glTF) is the cutting edge, the head of an axe or
hammer, the top of a gun, the face of a shield. The scene root is an empty
named "grip" at the origin, with the mesh and an empty named "tip" under it.
Sizes are real-world metres (length_m along the tip axis).
"""
import json
import math
import os
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    if name in argv:
        return argv[argv.index(name) + 1]
    return default


SPEC = json.load(open(arg("--spec")))
SRC = arg("--src")
OUT = arg("--out")
ONLY = set((arg("--only") or "").split(",")) - {""}
THUMBS = "--no-thumbs" not in argv


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_src(path):
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in bpy.context.scene.objects:
        o.select_set(o in meshes)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    # keep the world transform, drop the parents
    mw = ob.matrix_world.copy()
    ob.parent = None
    ob.matrix_world = mw
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(bpy.context.scene.objects):
        if o != ob:
            bpy.data.objects.remove(o, do_unlink=True)
    return ob


# ------------------------------------------------------------ the kit-bash hammer

def _uv_cell(bm, faces, cell, tex=1024, cells=(8, 4)):
    """Map faces into one 128x256 px cell of a KayKit palette (cell = (col, row) from the top
    left), keeping the cell's vertical gradient: a face's height runs down the cell."""
    uv = bm.loops.layers.uv.verify()
    cw, ch = 1.0 / cells[0], 1.0 / cells[1]
    u0 = cell[0] * cw + cw * 0.3
    u1 = cell[0] * cw + cw * 0.7
    v_top = 1.0 - cell[1] * ch - ch * 0.08
    v_bot = 1.0 - (cell[1] + 1) * ch + ch * 0.08
    zs = [v.co.z for f in faces for v in f.verts]
    zmin, zmax = min(zs), max(zs)
    for f in faces:
        for i, loop in enumerate(f.loops):
            k = 0.5 if zmax - zmin < 1e-6 else (loop.vert.co.z - zmin) / (zmax - zmin)
            loop[uv].uv = (u0 + (u1 - u0) * (i % 2), v_bot + (v_top - v_bot) * k)


def _part(name, make, cell, at, bevel=0.0, rot_x=0.0):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    make(bm)
    if rot_x:
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector((0, 0, 0)), matrix=Matrix.Rotation(math.radians(rot_x), 3, "X"))
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector(at))
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect="EDGES", profile=0.5)
    _uv_cell(bm, list(bm.faces), cell)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def kitbash_hammer(texture_path):
    """A two-handed warhammer in the KayKit look: a leather-wrapped haft, a steel head with a
    flat striking face (+Y, the contract's edge side after the export) and a spike behind,
    gold bands and pommel. Units are metres; the grip is at the origin."""
    cyl = lambda r, d, seg=10: (lambda bm: bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=d))
    cone = lambda r1, r2, d, seg=8: (lambda bm: bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=d))
    box = lambda x, y, z: (lambda bm: bmesh.ops.scale(bm, vec=Vector((x, y, z)), verts=bmesh.ops.create_cube(bm, size=1.0)["verts"]))
    STEEL, DARK, GOLD, LEATHER, WOOD = (3, 0), (4, 0), (4, 1), (5, 0), (6, 1)
    parts = [
        _part("haft", cyl(0.022, 0.86), WOOD, (0, 0, 0.30)),
        _part("wrap", cyl(0.026, 0.26), LEATHER, (0, 0, 0.0)),
        _part("pommel", cone(0.04, 0.025, 0.06), GOLD, (0, 0, -0.16)),
        _part("band_low", cyl(0.03, 0.03), GOLD, (0, 0, 0.15)),
        _part("band_high", cyl(0.032, 0.04), GOLD, (0, 0, 0.66)),
        _part("head", box(0.13, 0.30, 0.15), STEEL, (0, 0.02, 0.78), bevel=0.012),
        _part("face", box(0.15, 0.04, 0.17), DARK, (0, 0.19, 0.78), bevel=0.008),
        _part("spike", cone(0.05, 0.004, 0.16), STEEL, (0, -0.20, 0.78), rot_x=90),
        _part("collar", box(0.15, 0.09, 0.04), GOLD, (0, 0.02, 0.69), bevel=0.006),
        _part("crown", cone(0.03, 0.006, 0.09), GOLD, (0, 0.02, 0.90)),
    ]
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = "forge_warhammer"
    mat = bpy.data.materials.new("knight_texture")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    img = bpy.data.images.load(texture_path)
    tn = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tn.image = img
    tn.interpolation = "Closest"
    mat.node_tree.links.new(tn.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.55
    bsdf.inputs["Metallic"].default_value = 0.0
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    bpy.ops.object.shade_flat()
    return ob


# ------------------------------------------------------------ to the contract frame

def contract_matrix(tip, edge):
    """Rotation taking the source's tip axis to Blender +Z and its edge axis to Blender -Y
    (glTF +Y and +Z after the exporter's Y-up conversion)."""
    t = Vector(tip).normalized()
    e = Vector(edge).normalized()
    e = (e - t * e.dot(t)).normalized()
    src = Matrix((t.cross(-e), -e, t)).transposed()     # columns: x, y, z of the source frame
    dst = Matrix(((1, 0, 0), (0, 1, 0), (0, 0, 1)))
    # src columns are where the target x (= y cross z), y (= -edge) and z (= tip) live in the source
    return (dst @ src.inverted()).to_4x4()


def bounds(ob):
    vs = [ob.matrix_world @ v.co for v in ob.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    return lo, hi


def to_contract(ob, w):
    R = contract_matrix(w["tip"], w["edge"])
    ob.data.transform(R)
    lo, hi = bounds(ob)
    g = w["grip_at"]
    if g == "auto-rear-bottom":
        # a gun: the hand closes on the pistol grip, just behind the middle, under the body
        grip = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z + 0.30 * (hi.z - lo.z)))
        grip.y = lo.y + 0.6 * (hi.y - lo.y)
        grip.z = lo.z + 0.32 * (hi.z - lo.z)
    else:
        grip = R @ Vector(g)
    ob.data.transform(Matrix.Translation(-grip))
    lo, hi = bounds(ob)
    s = w["length_m"] / max(1e-6, hi.z - lo.z)
    ob.data.transform(Matrix.Scale(s, 4))
    # girth < 1 slims the cross-section (a chunky toy gun into a rifle); the
    # texture is a flat palette atlas, so the colours do not stretch.
    gth = float(w.get("girth", 1.0))
    if gth != 1.0:
        ob.data.transform(Matrix.Diagonal((gth, gth, 1.0, 1.0)))
    ob.data.update()
    return s


def recolour(ob, w):
    """Move faces from one palette swatch to another on the same atlas (Kenney's
    colormap is a grid of flat swatches, 16 across and 4 down in glTF UV space,
    v = 0 at the top). `recolour`: [{"from": [col, row], "to": [col, row]}]."""
    swaps = {tuple(r["from"]): tuple(r["to"]) for r in w.get("recolour", [])}
    if not swaps:
        return
    uv = ob.data.uv_layers.active.data
    moved = 0
    for poly in ob.data.polygons:
        us = [uv[i].uv for i in poly.loop_indices]
        cu = sum(p.x for p in us) / len(us)
        cv = 1.0 - sum(p.y for p in us) / len(us)          # Blender's v is flipped
        key = (int(cu * 16), int(cv * 4))
        if key not in swaps:
            continue
        to = swaps[key]
        du, dv = (to[0] - key[0]) / 16.0, (to[1] - key[1]) / 4.0
        for p in us:
            p.x += du
            p.y -= dv
        moved += 1
    print(f"recolour {w['slug']}: {moved} faces")


def decimated_copy(ob, ratio, name):
    c = ob.copy()
    c.data = ob.data.copy()
    c.name = name
    bpy.context.scene.collection.objects.link(c)
    if ratio < 1.0:
        m = c.modifiers.new("dec", "DECIMATE")
        m.ratio = ratio
        m.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = c
        for o in bpy.context.scene.objects:
            o.select_set(o == c)
        bpy.ops.object.modifier_apply(modifier="dec")
    return c


def export(ob, slug, path, tex_size):
    """One GLB: root empty 'grip' (origin) > mesh + empty 'tip'. Texture resized to tex_size."""
    for o in list(bpy.context.scene.objects):
        if o.type == "EMPTY":
            bpy.data.objects.remove(o, do_unlink=True)
    root = bpy.data.objects.new("grip", None)
    bpy.context.scene.collection.objects.link(root)
    lo, hi = bounds(ob)
    tip = bpy.data.objects.new("tip", None)
    tip.location = (0, 0, hi.z)
    bpy.context.scene.collection.objects.link(tip)
    tip.parent = root
    ob.parent = root
    ob.name = slug
    imgs = {n.image for m in ob.data.materials if m and m.use_nodes for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image}
    saved = {}
    for im in imgs:
        saved[im.name] = tuple(im.size)
        if im.size[0] > tex_size:
            im.scale(tex_size, tex_size)
    for o in bpy.context.scene.objects:
        o.select_set(o in (root, tip, ob))
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True,
                              export_image_format="AUTO", export_yup=True, export_apply=True,
                              export_texcoords=True, export_normals=True, export_materials="EXPORT",
                              export_extras=False, export_animations=False)
    # USDZ beside it for iOS's native views (the pack check warns without one)
    try:
        bpy.ops.wm.usd_export(filepath=path[:-4] + ".usdz", selected_objects_only=True, export_textures=True,
                              export_materials=True, export_animation=False, generate_preview_surface=True)
    except Exception as e:  # an older Blender: the GLB is enough (iOS falls back to it)
        print("USDZ skipped:", e)
    ob.parent = None
    return lo, hi


def thumb(ob, path, size=512):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 24
    sc.cycles.use_denoising = False
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    if sc.world is None:
        sc.world = bpy.data.worlds.new("w")
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.9, 0.92, 1.0, 1)
    bg.inputs[1].default_value = 0.45
    lo, hi = bounds(ob)
    c = (lo + hi) / 2
    r = max((hi - lo).length / 2, 0.05)
    for o in list(sc.objects):
        if o.type in ("CAMERA", "LIGHT"):
            bpy.data.objects.remove(o, do_unlink=True)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    cam.data.lens = 50
    d = r / math.tan(math.radians(39.6) / 2) * 1.1
    # three-quarter view from the edge side, slightly above; the long axis tilted across the frame
    dirv = Vector((-0.55, -0.75, 0.35)).normalized()
    cam.location = c + dirv * d
    cam.rotation_euler = (-dirv).to_track_quat("-Z", "Y").to_euler()
    cam.rotation_euler.rotate_axis("Z", math.radians(-35))
    sc.camera = cam
    key = bpy.data.objects.new("key", bpy.data.lights.new("key", "SUN"))
    key.data.energy = 4.5
    key.rotation_euler = (math.radians(50), math.radians(-20), math.radians(-40))
    sc.collection.objects.link(key)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def contract_view(ob, path, size=384):
    """Orthographic side view in the contract frame: tip up, edge to the left."""
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.color_type = "TEXTURE"
    sc.display.shading.light = "STUDIO"
    sc.render.film_transparent = False
    sc.render.resolution_x = sc.render.resolution_y = size
    for o in list(sc.objects):
        if o.type in ("CAMERA", "LIGHT"):
            bpy.data.objects.remove(o, do_unlink=True)
    lo, hi = bounds(ob)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = max(hi.z - lo.z, hi.y - lo.y) * 1.25 + 0.1
    cam.location = (3.0, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2)
    cam.rotation_euler = (math.radians(90), 0, math.radians(90))   # looking along -X, Z up, -Y to the left
    sc.camera = cam
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    os.makedirs(os.path.join(OUT, "packs"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "views"), exist_ok=True)
    report = []
    for w in SPEC["weapons"]:
        slug = w["slug"]
        if ONLY and slug not in ONLY:
            continue
        reset()
        if w["src"].startswith("kitbash:"):
            ob = kitbash_hammer(os.path.join(SRC, w["texture"]))
        else:
            ob = import_src(os.path.join(SRC, w["src"]))
        s = to_contract(ob, w)
        recolour(ob, w)
        d = os.path.join(OUT, "packs", slug)
        os.makedirs(d, exist_ok=True)
        tris = {}
        lods = [(0, 1.0, 1024), (1, 0.6, 512), (2, 0.3, 256)]
        bmin = bmax = None
        for lod, ratio, tex in lods:
            c = decimated_copy(ob, ratio, f"{slug}_lod{lod}")
            c.data.calc_loop_triangles()
            tris[lod] = len(c.data.loop_triangles)
            lo, hi = export(c, slug, os.path.join(d, f"{slug}__lod{lod}.glb"), tex)
            if lod == 0:
                bmin, bmax = lo, hi
            bpy.data.objects.remove(c, do_unlink=True)
        if THUMBS:
            thumb(ob, os.path.join(d, f"{slug}__thumb.png"))
        contract_view(ob, os.path.join(OUT, "views", f"{slug}_contract.png"))
        # Blender (x, y, z) -> glTF (x, z, -y)
        gl_lo = [round(bmin.x, 4), round(bmin.z, 4), round(-bmax.y, 4)]
        gl_hi = [round(bmax.x, 4), round(bmax.z, 4), round(-bmin.y, 4)]
        pack = {
            "type": "weapon", "name": w["name"], "rarity": w["rarity"], "realm": None,
            "stats": dict(w["stats"], kind=w["kind"]),
            "sockets": {"grip": [0.0, 0.0, 0.0], "tip": [0.0, round(bmax.z, 4), 0.0]},
            "bounds_m": [gl_lo, gl_hi],
            "rigged": False, "animations": [], "skeleton": None,
            "material": {"base_colour": "png", "normals": True, "occlusion": False, "normal_map": False},
            "brief": f"{w['name']}: CosQuest default weapon, hand pose class '{w['grip']}' (app/game3d/data/attach.json).",
            "source": f"cq234 {w['src']} ({w['licence']}, {w['author']}, {w['url']})",
        }
        json.dump(pack, open(os.path.join(d, "pack.json"), "w"), indent=1)
        report.append({"slug": slug, "grip": w["grip"], "kind": w["kind"], "scale": round(s, 4), "tris": tris,
                       "bounds_m": [gl_lo, gl_hi]})
        print("WEAPON", json.dumps(report[-1]))
    json.dump(report, open(os.path.join(OUT, "build_report.json"), "w"), indent=1)


main()
