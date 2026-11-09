extends RefCounted
## look-world: the street furniture, roof clutter, trees and birds of the real places (and the street),
## built procedurally at load (no model files): chunky, bevel-soft shapes at real metre scale (art
## direction 4.6, 4.8), so every prop reads as its type at half screen size and nothing is toy-scale.
##
##   build(kind, variant) -> ArrayMesh   origin at the base centre, front (+z) towards the road
##   info(kind) -> {"h": m, "r": m, "light_at": Vector3 (lamps, beacons, signals)}
##   species(climate) -> tree kinds for a climate (tokens world.foliage)
##
## Each surface is named with its material class (surface_get_name): "paint" (vertex-colour albedo:
## painted iron, wood, plastic), "stone", "foliage", "bark", "glow" (lamp glass, lenses, beacons) and
## "glass" (glazing). Vertex colour RGB is the final albedo with its ambient occlusion baked in (darker
## near the ground and underneath, lighter on top, dark canopy cores). Foliage and palm fronds carry the
## wind-sway weight in vertex colour ALPHA (0 at the branch, 1 at the tips); the bird's wings carry the
## flap weight in alpha (the shader flaps by sign(x)). World colours are held at HSV saturation <= 0.55
## (tokens world max) except the accents (phone and post box red, hydrant, beacon, signal lenses).
## Own work, CC0 1.0. Colours: art-direction tokens.json world.foliage / regions / props.

const SAT_MAX: float = 0.55

const FOLIAGE: Dictionary = {
	"temperate_maritime": {"canopy": ["#A2C25E", "#6E9A45", "#3F6B3A"], "trunk": "#9C9478"},
	"humid_continental": {"canopy": ["#B4CC5E", "#7FA645", "#46703A"], "trunk": "#6B5A4A"},
	"mediterranean": {"canopy": ["#8FAE52", "#5C843B", "#34572E"], "trunk": "#7A6450", "bloom": "#9B7FD4"},
	"tropical": {"canopy": ["#9CC955", "#4F8D3C", "#2C5A2C"], "trunk": "#8A6A4B", "bloom": "#E2552E"},
}
const SPECIES: Dictionary = {
	"temperate_maritime": ["tree_london_plane", "tree_lime", "tree_oak"],
	"humid_continental": ["tree_honey_locust", "tree_pin_oak", "tree_callery_pear"],
	"mediterranean": ["tree_coast_live_oak", "tree_italian_cypress", "tree_washingtonia_palm", "tree_jacaranda"],
	"tropical": ["tree_coconut_palm", "tree_indian_almond", "tree_neem", "tree_flame_tree", "tree_banana"],
}
## species -> [climate, canonical height m, crown radius m]
const TREES: Dictionary = {
	"london_plane": ["temperate_maritime", 14.0, 5.5], "lime": ["temperate_maritime", 12.0, 3.6],
	"oak": ["temperate_maritime", 11.0, 5.6], "honey_locust": ["humid_continental", 11.0, 4.6],
	"pin_oak": ["humid_continental", 13.0, 4.0], "callery_pear": ["humid_continental", 9.0, 2.8],
	"coast_live_oak": ["mediterranean", 10.0, 5.8], "italian_cypress": ["mediterranean", 12.0, 1.0],
	"washingtonia_palm": ["mediterranean", 16.0, 2.4], "jacaranda": ["mediterranean", 9.0, 4.6],
	"coconut_palm": ["tropical", 13.0, 4.2], "indian_almond": ["tropical", 10.0, 5.0],
	"neem": ["tropical", 11.0, 4.6], "flame_tree": ["tropical", 9.0, 5.8], "banana": ["tropical", 4.0, 2.2],
}
const PROPS: Dictionary = {
	"lamp_uk": {"h": 5.0, "r": 0.3, "light_at": Vector3(0, 4.33, 1.0)},
	"lamp_us": {"h": 7.6, "r": 0.25, "light_at": Vector3(0, 7.27, 2.45)},
	"lamp_lagos": {"h": 6.4, "r": 0.15, "light_at": Vector3(0, 5.55, 0.95)},
	"bench": {"h": 0.9, "r": 0.95},
	"bin": {"h": 1.05, "r": 0.3},
	"bollard": {"h": 1.0, "r": 0.12},
	"traffic_light_uk": {"h": 3.35, "r": 0.3, "light_at": Vector3(0, 3.03, 0.24)},
	"traffic_light_us": {"h": 6.3, "r": 0.3, "light_at": Vector3(0.2, 5.55, 3.6)},
	"planter": {"h": 1.4, "r": 0.7},
	"phone_box_uk": {"h": 2.55, "r": 0.5},
	"post_box_uk": {"h": 1.55, "r": 0.3},
	"hydrant_us": {"h": 0.82, "r": 0.2},
	"belisha": {"h": 2.85, "r": 0.2, "light_at": Vector3(0, 2.65, 0)},
	"bus_stop": {"h": 2.65, "r": 1.7},
	"ac_unit": {"h": 0.95, "r": 0.7},
	"vent": {"h": 0.85, "r": 0.3},
	"water_tank_us": {"h": 5.95, "r": 1.35},
	"chimney_uk": {"h": 1.95, "r": 0.85},
	"dish": {"h": 1.25, "r": 0.45},
	"water_tank_lagos": {"h": 2.4, "r": 0.6},
	"roof_plant": {"h": 2.5, "r": 2.4},
	"bird": {"h": 0.12, "r": 0.33},
}


static func species(climate: String) -> Array[String]:
	var out: Array[String] = []
	for s: String in SPECIES.get(climate, SPECIES["temperate_maritime"]):
		out.append(s)
	return out


static func info(kind: String) -> Dictionary:
	if PROPS.has(kind):
		return (PROPS[kind] as Dictionary).duplicate()
	var sp: String = kind.trim_prefix("tree_")
	if TREES.has(sp):
		var t: Array = TREES[sp]
		return {"h": float(t[1]), "r": float(t[2]), "climate": str(t[0])}
	return {"h": 1.0, "r": 0.5}


static func build(kind: String, variant: int = 0) -> ArrayMesh:
	var b := MB.new()
	if kind.begins_with("tree_"):
		_tree(b, kind.trim_prefix("tree_"), variant)
	else:
		match kind:
			"lamp_uk": _lamp_uk(b)
			"lamp_us": _lamp_us(b)
			"lamp_lagos": _lamp_lagos(b)
			"bench": _bench(b)
			"bin": _bin(b)
			"bollard": _bollard(b)
			"traffic_light_uk": _tl_uk(b)
			"traffic_light_us": _tl_us(b)
			"planter": _planter(b, variant)
			"phone_box_uk": _phone_box(b)
			"post_box_uk": _post_box(b)
			"hydrant_us": _hydrant(b)
			"belisha": _belisha(b)
			"bus_stop": _bus_stop(b)
			"ac_unit": _ac_unit(b)
			"vent": _vent(b)
			"water_tank_us": _tank_us(b)
			"chimney_uk": _chimney(b, variant)
			"dish": _dish(b)
			"water_tank_lagos": _tank_lagos(b)
			"roof_plant": _roof_plant(b)
			"bird": _bird(b)
			_:
				b.box("paint", Vector3(0, 0.5, 0), Vector3(1, 1, 1), c("#B9B2A6"))
	return b.commit()


# ------------------------------------------------------------------ colours

## A token hex as a Color, held at the world's saturation cap unless it is an accent.
static func c(hex: String, accent: bool = false) -> Color:
	var col := Color.html(hex)
	if not accent and col.s > SAT_MAX:
		col = Color.from_hsv(col.h, SAT_MAX, col.v)
	return col


# ------------------------------------------------------------------ the mesh builder

class MB:
	var s: Dictionary = {}               # class -> [verts, normals, colours]
	var xf: Transform3D = Transform3D.IDENTITY
	var shade: bool = true               # bake the prop AO (ground contact, under/over sides)
	var ground_ao: float = 0.35          # metres of contact darkening above y = 0

	func _a(cls: String) -> Array:
		if not s.has(cls):
			s[cls] = [[], [], []]
		return s[cls]

	## One triangle. Positions and normals are local (xf applied here). `ref` is the outward
	## direction the face should look along; the winding is fixed so its front faces that way
	## (Godot draws clockwise triangles as front faces).
	func tri(cls: String, p: Array, n: Array, col: Array, ref: Vector3) -> void:
		var w: Array = []
		var wn: Array = []
		for i in 3:
			w.append(xf * (p[i] as Vector3))
			wn.append((xf.basis * (n[i] as Vector3)).normalized())
		var r: Vector3 = (xf.basis * ref).normalized()
		var order: Array = [0, 1, 2]
		if ((w[1] - w[0]) as Vector3).cross(w[2] - w[0]).dot(r) > 0.0:
			order = [0, 2, 1]
		var a: Array = _a(cls)
		for i: int in order:
			var cc: Color = col[i]
			if shade and cls != "foliage" and cls != "glow":
				cc = _ao(cc, w[i], wn[i])
			(a[0] as Array).append(w[i])
			(a[1] as Array).append(wn[i])
			(a[2] as Array).append(cc)

	func _ao(col: Color, p: Vector3, n: Vector3) -> Color:
		var k: float = 1.0 + 0.09 * n.y
		k *= lerpf(0.68, 1.0, clampf(p.y / ground_ao, 0.0, 1.0)) if ground_ao > 0.0 else 1.0
		return Color(col.r * k, col.g * k, col.b * k, col.a)

	func quad(cls: String, p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, col: Color, n: Vector3 = Vector3.ZERO) -> void:
		var nn: Vector3 = n if n != Vector3.ZERO else (p1 - p0).cross(p3 - p0).normalized()
		tri(cls, [p0, p1, p2], [nn, nn, nn], [col, col, col], nn)
		tri(cls, [p0, p2, p3], [nn, nn, nn], [col, col, col], nn)

	## A box, flat shaded. `rot` turns it about its centre.
	func box(cls: String, ctr: Vector3, size: Vector3, col: Color, rot: Basis = Basis()) -> void:
		var h: Vector3 = size * 0.5
		var ax: Array = [Vector3(1, 0, 0), Vector3(0, 1, 0), Vector3(0, 0, 1)]
		for i in 3:
			for sg: float in [-1.0, 1.0]:
				var nrm: Vector3 = ax[i] * sg
				var u: Vector3 = ax[(i + 1) % 3]
				var v: Vector3 = ax[(i + 2) % 3]
				var cnt: Vector3 = nrm * h[i]
				var uu: Vector3 = u * h[(i + 1) % 3]
				var vv: Vector3 = v * h[(i + 2) % 3]
				var q: Array = [cnt - uu - vv, cnt + uu - vv, cnt + uu + vv, cnt - uu + vv]
				var n2: Vector3 = rot * nrm
				var pts: Array = []
				for p: Vector3 in q:
					pts.append(ctr + rot * p)
				tri(cls, [pts[0], pts[1], pts[2]], [n2, n2, n2], [col, col, col], n2)
				tri(cls, [pts[0], pts[2], pts[3]], [n2, n2, n2], [col, col, col], n2)

	## A surface of revolution about the y axis through `o`: prof is [Vector2(radius, y), ...] bottom
	## to top. Smooth round, faceted along the profile. `col` is a Color or an Array (one per band).
	func lathe(cls: String, prof: Array, seg: int, col: Variant, o: Vector3 = Vector3.ZERO, a0: float = 0.0, rot: Basis = Basis()) -> void:
		for k in prof.size() - 1:
			var p0: Vector2 = prof[k]
			var p1: Vector2 = prof[k + 1]
			var cc: Color = (col as Array)[mini(k, (col as Array).size() - 1)] if col is Array else col
			var d: Vector2 = p1 - p0
			if d.length() < 0.0001:
				continue
			var pn: Vector2 = Vector2(d.y, -d.x).normalized()   # outward in (r, y)
			for i in seg:
				var t0: float = a0 + TAU * i / seg
				var t1: float = a0 + TAU * (i + 1) / seg
				var e0 := Vector3(cos(t0), 0, sin(t0))
				var e1 := Vector3(cos(t1), 0, sin(t1))
				var v00: Vector3 = o + rot * (e0 * p0.x + Vector3(0, p0.y, 0))
				var v01: Vector3 = o + rot * (e1 * p0.x + Vector3(0, p0.y, 0))
				var v10: Vector3 = o + rot * (e0 * p1.x + Vector3(0, p1.y, 0))
				var v11: Vector3 = o + rot * (e1 * p1.x + Vector3(0, p1.y, 0))
				var n0: Vector3 = rot * (e0 * pn.x + Vector3(0, pn.y, 0)).normalized()
				var n1: Vector3 = rot * (e1 * pn.x + Vector3(0, pn.y, 0)).normalized()
				var ref: Vector3 = (n0 + n1).normalized()
				if p0.x > 0.0001:
					tri(cls, [v00, v01, v11], [n0, n1, n1], [cc, cc, cc], ref)
				if p1.x > 0.0001:
					tri(cls, [v00, v11, v10], [n0, n1, n0], [cc, cc, cc], ref)

	## A tube along a path (radius per point), smooth round, open ends.
	func tube(cls: String, pts: Array, radii: Array, seg: int, col: Variant) -> void:
		var frames: Array = []
		var prev_side: Vector3 = Vector3.RIGHT
		for i in pts.size():
			var t: Vector3
			if i == 0:
				t = (pts[1] - pts[0])
			elif i == pts.size() - 1:
				t = (pts[i] - pts[i - 1])
			else:
				t = (pts[i + 1] - pts[i - 1])
			t = t.normalized()
			var side: Vector3 = prev_side - t * prev_side.dot(t)
			if side.length() < 0.01:
				side = Vector3.FORWARD - t * Vector3.FORWARD.dot(t)
			side = side.normalized()
			prev_side = side
			frames.append([side, t.cross(side).normalized()])
		for i in pts.size() - 1:
			var cc: Color = (col as Array)[mini(i, (col as Array).size() - 1)] if col is Array else col
			for j in seg:
				var a0: float = TAU * j / seg
				var a1: float = TAU * (j + 1) / seg
				var nA0: Vector3 = frames[i][0] * cos(a0) + frames[i][1] * sin(a0)
				var nA1: Vector3 = frames[i][0] * cos(a1) + frames[i][1] * sin(a1)
				var nB0: Vector3 = frames[i + 1][0] * cos(a0) + frames[i + 1][1] * sin(a0)
				var nB1: Vector3 = frames[i + 1][0] * cos(a1) + frames[i + 1][1] * sin(a1)
				var vA0: Vector3 = pts[i] + nA0 * float(radii[i])
				var vA1: Vector3 = pts[i] + nA1 * float(radii[i])
				var vB0: Vector3 = pts[i + 1] + nB0 * float(radii[i + 1])
				var vB1: Vector3 = pts[i + 1] + nB1 * float(radii[i + 1])
				var ref: Vector3 = (nA0 + nA1 + nB0 + nB1).normalized()
				tri(cls, [vA0, vA1, vB1], [nA0, nA1, nB1], [cc, cc, cc], ref)
				tri(cls, [vA0, vB1, vB0], [nA0, nB1, nB0], [cc, cc, cc], ref)

	## A closed cylinder between two points (caps optional).
	func cyl(cls: String, a: Vector3, b: Vector3, r0: float, r1: float, seg: int, col: Color, caps: bool = true) -> void:
		tube(cls, [a, b], [r0, r1], seg, col)
		if caps:
			var ax: Vector3 = (b - a).normalized()
			var side: Vector3 = (Vector3.RIGHT - ax * Vector3.RIGHT.dot(ax))
			if side.length() < 0.01:
				side = Vector3.FORWARD - ax * Vector3.FORWARD.dot(ax)
			side = side.normalized()
			var up: Vector3 = ax.cross(side)
			for e: Array in [[a, r0, -ax], [b, r1, ax]]:
				var ctr: Vector3 = e[0]
				var nn: Vector3 = e[2]
				for j in seg:
					var t0: float = TAU * j / seg
					var t1: float = TAU * (j + 1) / seg
					var p0: Vector3 = ctr + (side * cos(t0) + up * sin(t0)) * float(e[1])
					var p1: Vector3 = ctr + (side * cos(t1) + up * sin(t1)) * float(e[1])
					tri(cls, [ctr, p0, p1], [nn, nn, nn], [col, col, col], nn)

	## A lumpy icosphere (sub 0: 20 triangles, 1: 80) for canopy clumps and shrubs. colfn(pos, nrm)
	## -> Color (alpha = wind weight). Normals bend towards `soft_ctr` so many clumps shade as one mass.
	func blob(cls: String, ctr: Vector3, rad: Vector3, sub: int, rng: RandomNumberGenerator, colfn: Callable, soft_ctr: Variant = null) -> void:
		var tris: Array = WP.ico(sub)
		var jit: Dictionary = {}
		for t: Array in tris:
			var p: Array = []
			var n: Array = []
			var cs: Array = []
			for v: Vector3 in t:
				var key: Vector3i = Vector3i(roundi(v.x * 1000), roundi(v.y * 1000), roundi(v.z * 1000))
				if not jit.has(key):
					jit[key] = rng.randf_range(0.86, 1.1)
				var pp: Vector3 = ctr + Vector3(v.x * rad.x, v.y * rad.y, v.z * rad.z) * float(jit[key])
				var nn: Vector3 = Vector3(v.x / rad.x, v.y / rad.y, v.z / rad.z).normalized()
				if soft_ctr != null:
					nn = (nn + ((pp - (soft_ctr as Vector3)).normalized())).normalized()
				p.append(pp)
				n.append(nn)
				cs.append(colfn.call(pp, nn))
			var face: Vector3 = (Vector3(t[0]) + Vector3(t[1]) + Vector3(t[2])).normalized()
			tri(cls, p, n, cs, Vector3(face.x / rad.x, face.y / rad.y, face.z / rad.z).normalized())

	## A strip along a path, both faces, with a fold (V section) so it reads solid: pts, side
	## vectors (half width included) and a droop for the fold. colfn(t along 0..1, side -1|1) -> Color.
	func strip(cls: String, pts: Array, sides: Array, fold: float, colfn: Callable) -> void:
		for i in pts.size() - 1:
			var t0: float = float(i) / (pts.size() - 1)
			var t1: float = float(i + 1) / (pts.size() - 1)
			for sg: float in [-1.0, 1.0]:
				var a: Vector3 = pts[i]
				var b2: Vector3 = pts[i + 1]
				var a2: Vector3 = a + sides[i] * sg + Vector3(0, -fold * (sides[i] as Vector3).length(), 0)
				var b3: Vector3 = b2 + sides[i + 1] * sg + Vector3(0, -fold * (sides[i + 1] as Vector3).length(), 0)
				var up: Vector3 = (b2 - a).cross(a2 - a).normalized()
				if up.y < 0.0:
					up = -up
				var ca: Color = colfn.call(t0, sg)
				var cb: Color = colfn.call(t1, sg)
				for face: float in [1.0, -1.0]:
					var nn: Vector3 = up * face
					var dark: float = 1.0 if face > 0.0 else 0.78
					var c0 := Color(ca.r * dark, ca.g * dark, ca.b * dark, ca.a)
					var c1 := Color(cb.r * dark, cb.g * dark, cb.b * dark, cb.a)
					tri(cls, [a, b2, b3], [nn, nn, nn], [c0, c1, c1], nn)
					tri(cls, [a, b3, a2], [nn, nn, nn], [c0, c1, c0], nn)

	func commit() -> ArrayMesh:
		var am := ArrayMesh.new()
		for cls: String in ["paint", "stone", "bark", "foliage", "glass", "glow"]:
			if not s.has(cls):
				continue
			var a: Array = s[cls]
			var arr: Array = []
			arr.resize(Mesh.ARRAY_MAX)
			arr[Mesh.ARRAY_VERTEX] = PackedVector3Array(a[0])
			arr[Mesh.ARRAY_NORMAL] = PackedVector3Array(a[1])
			arr[Mesh.ARRAY_COLOR] = PackedColorArray(a[2])
			am.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
			am.surface_set_name(am.get_surface_count() - 1, cls)
		return am


## Shared geometry helpers (static, cached).
class WP:
	static var _ico: Dictionary = {}

	static func ico(sub: int) -> Array:
		if _ico.has(sub):
			return _ico[sub]
		var t: float = (1.0 + sqrt(5.0)) / 2.0
		var v: Array = [Vector3(-1, t, 0), Vector3(1, t, 0), Vector3(-1, -t, 0), Vector3(1, -t, 0),
			Vector3(0, -1, t), Vector3(0, 1, t), Vector3(0, -1, -t), Vector3(0, 1, -t),
			Vector3(t, 0, -1), Vector3(t, 0, 1), Vector3(-t, 0, -1), Vector3(-t, 0, 1)]
		for i in v.size():
			v[i] = (v[i] as Vector3).normalized()
		var f: Array = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4],
			[11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
			[4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]]
		var tris: Array = []
		for fc: Array in f:
			tris.append([v[fc[0]], v[fc[1]], v[fc[2]]])
		for _s in sub:
			var nt: Array = []
			for tr: Array in tris:
				var a: Vector3 = tr[0]
				var b: Vector3 = tr[1]
				var cc: Vector3 = tr[2]
				var ab: Vector3 = ((a + b) * 0.5).normalized()
				var bc: Vector3 = ((b + cc) * 0.5).normalized()
				var ca: Vector3 = ((cc + a) * 0.5).normalized()
				nt.append([a, ab, ca])
				nt.append([ab, b, bc])
				nt.append([ca, bc, cc])
				nt.append([ab, bc, ca])
			tris = nt
		_ico[sub] = tris
		return tris


# ------------------------------------------------------------------ street furniture

static func _lamp_uk(b: MB) -> void:
	var iron: Color = c("#26332E")
	var gold: Color = c("#9C8452")
	b.lathe("paint", [Vector2(0.25, 0), Vector2(0.25, 0.14), Vector2(0.2, 0.2), Vector2(0.19, 0.5), Vector2(0.13, 0.62), Vector2(0.095, 0.72)], 8, iron, Vector3.ZERO, PI / 8)
	b.cyl("paint", Vector3(0, 0.72, 0), Vector3(0, 3.85, 0), 0.085, 0.068, 8, iron, false)
	b.lathe("paint", [Vector2(0.068, 3.8), Vector2(0.12, 3.86), Vector2(0.12, 3.95), Vector2(0.07, 4.02)], 8, [iron, gold, iron])
	# the swan neck, sweeping up and over towards the road, the lantern hanging from its end
	var neck: Array = [Vector3(0, 4.0, 0), Vector3(0, 4.38, 0.04), Vector3(0, 4.7, 0.22), Vector3(0, 4.88, 0.5),
		Vector3(0, 4.88, 0.78), Vector3(0, 4.78, 0.98)]
	b.tube("paint", neck, [0.055, 0.05, 0.045, 0.042, 0.04, 0.035], 6, iron)
	b.lathe("paint", [Vector2(0.0, 4.98), Vector2(0.05, 4.93), Vector2(0.0, 4.84)], 6, gold, Vector3(0, 0.0, 0))   # finial ball at the top of the post
	var lo := Vector3(0, 0, 1.0)
	b.cyl("paint", lo + Vector3(0, 4.62, 0), lo + Vector3(0, 4.8, 0), 0.025, 0.025, 4, iron, false)
	b.lathe("paint", [Vector2(0.04, 4.66), Vector2(0.25, 4.53), Vector2(0.25, 4.5)], 4, iron, lo, PI / 4)
	b.lathe("glow", [Vector2(0.21, 4.5), Vector2(0.14, 4.17)], 4, Color(1.0, 0.86, 0.6), lo, PI / 4)
	b.lathe("paint", [Vector2(0.15, 4.18), Vector2(0.15, 4.14), Vector2(0.06, 4.06), Vector2(0.0, 4.02)], 4, iron, lo, PI / 4)
	# the frame's corner bars over the glass
	for i in 4:
		var a: float = PI / 4 + TAU * i / 4
		var d := Vector3(cos(a), 0, sin(a))
		b.cyl("paint", lo + d * 0.215 + Vector3(0, 4.5, 0), lo + d * 0.145 + Vector3(0, 4.17, 0), 0.014, 0.014, 4, iron, false)


static func _lamp_us(b: MB) -> void:
	var steel: Color = c("#9EA3A6")
	b.lathe("paint", [Vector2(0.2, 0), Vector2(0.2, 0.42), Vector2(0.16, 0.48), Vector2(0.13, 0.52)], 8, c("#8E9396"))
	b.cyl("paint", Vector3(0, 0.5, 0), Vector3(0, 7.0, 0), 0.12, 0.07, 8, steel, false)
	b.tube("paint", [Vector3(0, 6.85, 0), Vector3(0, 7.25, 0.3), Vector3(0, 7.45, 1.0), Vector3(0, 7.42, 2.1)],
		[0.07, 0.055, 0.05, 0.045], 6, steel)
	b.lathe("paint", [Vector2(0.075, 7.0), Vector2(0.08, 7.08), Vector2(0.0, 7.12)], 8, steel)
	# the cobra head: a long flattened housing, the lens under it
	var hb := Basis(Vector3.RIGHT, deg_to_rad(-4.0))
	b.box("paint", Vector3(0, 7.38, 2.45), Vector3(0.36, 0.16, 0.85), c("#B3B6B5"), hb)
	b.box("paint", Vector3(0, 7.46, 2.38), Vector3(0.26, 0.06, 0.6), c("#A5A9AA"), hb)
	b.box("glow", Vector3(0, 7.29, 2.48), Vector3(0.26, 0.04, 0.56), Color(1.0, 0.9, 0.72), hb)


static func _lamp_lagos(b: MB) -> void:
	var galv: Color = c("#A7ADB2")
	b.box("paint", Vector3(0, 0.15, 0), Vector3(0.45, 0.3, 0.45), c("#B7B1A6"))
	b.cyl("paint", Vector3(0, 0.3, 0), Vector3(0, 6.0, 0), 0.075, 0.055, 6, galv, false)
	b.box("paint", Vector3(0, 3.0, -0.12), Vector3(0.28, 0.42, 0.16), c("#DCDAD2"))   # the battery box
	b.tube("paint", [Vector3(0, 5.5, 0), Vector3(0, 5.65, 0.4), Vector3(0, 5.65, 0.8)], [0.035, 0.035, 0.03], 5, galv)
	b.box("paint", Vector3(0, 5.62, 0.98), Vector3(0.2, 0.07, 0.48), c("#C8CBCC"))
	b.box("glow", Vector3(0, 5.575, 0.98), Vector3(0.16, 0.02, 0.4), Color(0.95, 0.97, 1.0))
	# the solar panel on its bracket, tilted to the sky
	b.cyl("paint", Vector3(0, 6.0, 0), Vector3(0, 6.15, 0), 0.03, 0.03, 4, galv, false)
	var tilt := Basis(Vector3.RIGHT, deg_to_rad(24.0))
	b.box("paint", Vector3(0, 6.2, 0), Vector3(0.8, 0.04, 1.05), c("#C9CCCE"), tilt)
	b.box("paint", Vector3(0, 6.225, 0), Vector3(0.74, 0.02, 0.99), c("#2A3A58"), tilt)


static func _bench(b: MB) -> void:
	var wood: Color = c("#8A6A4B")
	var iron: Color = c("#2A2B2D")
	for sx: float in [-0.78, 0.78]:
		b.box("paint", Vector3(sx, 0.22, 0.2), Vector3(0.07, 0.44, 0.07), iron)
		b.box("paint", Vector3(sx, 0.43, -0.23), Vector3(0.07, 0.86, 0.07), iron, Basis(Vector3.RIGHT, deg_to_rad(-10)))
		b.box("paint", Vector3(sx, 0.43, -0.01), Vector3(0.07, 0.06, 0.5), iron)
		b.box("paint", Vector3(sx, 0.64, 0.05), Vector3(0.08, 0.05, 0.42), iron)
		b.box("paint", Vector3(sx, 0.54, 0.23), Vector3(0.06, 0.2, 0.06), iron)
	for z: float in [0.17, 0.04, -0.09]:
		b.box("paint", Vector3(0, 0.47, z), Vector3(1.8, 0.045, 0.11), wood)
	for y: float in [0.62, 0.77]:
		b.box("paint", Vector3(0, y, -0.26 - (y - 0.62) * 0.18), Vector3(1.8, 0.11, 0.035), wood, Basis(Vector3.RIGHT, deg_to_rad(-10)))


static func _bin(b: MB) -> void:
	var blk: Color = c("#2A2B2D")
	b.lathe("paint", [Vector2(0.24, 0), Vector2(0.27, 0.04), Vector2(0.27, 0.7), Vector2(0.285, 0.72), Vector2(0.285, 0.8),
		Vector2(0.27, 0.82), Vector2(0.27, 0.88), Vector2(0.295, 0.9), Vector2(0.295, 0.96), Vector2(0.2, 1.03), Vector2(0.0, 1.05)], 10,
		[blk, blk, blk, c("#B8962E"), blk, blk, blk, blk, blk, blk])
	b.box("paint", Vector3(0, 0.92, 0.27), Vector3(0.26, 0.05, 0.06), c("#101012"))


static func _bollard(b: MB) -> void:
	b.lathe("paint", [Vector2(0.13, 0), Vector2(0.13, 0.05), Vector2(0.095, 0.14), Vector2(0.08, 0.74), Vector2(0.1, 0.77),
		Vector2(0.1, 0.83), Vector2(0.08, 0.86), Vector2(0.065, 0.94), Vector2(0.035, 0.99), Vector2(0.0, 1.0)], 8, c("#232426"))


static func _tl_uk(b: MB) -> void:
	var blk: Color = c("#2E3033")
	b.lathe("paint", [Vector2(0.12, 0), Vector2(0.12, 0.1), Vector2(0.075, 0.16)], 8, blk)
	b.cyl("paint", Vector3(0, 0.15, 0), Vector3(0, 3.3, 0), 0.068, 0.062, 8, blk, true)
	b.box("paint", Vector3(0, 1.1, 0.1), Vector3(0.15, 0.24, 0.1), c("#C9B23A"))   # the push button
	b.box("paint", Vector3(0, 2.75, -0.03), Vector3(0.58, 1.22, 0.02), c("#E6E3DA"))   # backboard's white border
	b.box("paint", Vector3(0, 2.75, -0.015), Vector3(0.52, 1.16, 0.025), blk)
	b.box("paint", Vector3(0, 2.75, 0.11), Vector3(0.32, 0.96, 0.22), blk)
	var lens: Array = [[3.03, Color(1.0, 0.24, 0.16)], [2.75, Color(0.36, 0.24, 0.08)], [2.47, Color(0.08, 0.3, 0.16)]]
	for l: Array in lens:
		var y: float = l[0]
		b.lathe("glow", [Vector2(0.095, 0.0), Vector2(0.0, 0.015)], 8, l[1], Vector3(0, y, 0.222), 0.0, Basis(Vector3.RIGHT, PI / 2))
		b.box("paint", Vector3(0, y + 0.11, 0.29), Vector3(0.24, 0.02, 0.15), blk)


static func _tl_us(b: MB) -> void:
	var grey: Color = c("#8C9094")
	var yel: Color = c("#E0B12A", true)
	b.lathe("paint", [Vector2(0.24, 0), Vector2(0.24, 0.25), Vector2(0.15, 0.32)], 8, grey)
	b.cyl("paint", Vector3(0, 0.3, 0), Vector3(0, 6.3, 0), 0.14, 0.1, 8, grey, true)
	b.tube("paint", [Vector3(0, 5.85, 0), Vector3(0, 6.0, 1.5), Vector3(0, 6.1, 3.5), Vector3(0, 6.15, 5.6)], [0.09, 0.075, 0.06, 0.05], 6, grey)
	for zz: float in [3.6, 5.3]:
		b.cyl("paint", Vector3(0, 6.05, zz), Vector3(0, 6.12 if zz > 4.0 else 6.08, zz), 0.03, 0.03, 4, grey, false)
		b.box("paint", Vector3(0.0, 5.55, zz), Vector3(0.3, 1.0, 0.34), yel)
		var ys: Array = [[5.85, Color(1.0, 0.24, 0.16)], [5.55, Color(0.36, 0.24, 0.08)], [5.25, Color(0.08, 0.3, 0.16)]]
		for l: Array in ys:
			b.lathe("glow", [Vector2(0.1, 0.0), Vector2(0.0, 0.015)], 8, l[1], Vector3(0.152, float(l[0]), zz), 0.0, Basis(Vector3.FORWARD, -PI / 2))
			b.box("paint", Vector3(0.24, float(l[0]) + 0.11, zz), Vector3(0.16, 0.02, 0.24), yel)
	# a walk signal on the pole
	b.box("paint", Vector3(0.14, 2.9, 0), Vector3(0.22, 0.36, 0.3), yel)
	b.box("glow", Vector3(0.255, 2.9, 0), Vector3(0.01, 0.28, 0.22), Color(0.9, 0.42, 0.18))


static func _planter(b: MB, variant: int) -> void:
	var stone: Color = c("#B9B2A6")
	b.box("stone", Vector3(0, 0.27, 0), Vector3(1.2, 0.54, 1.2), stone)
	b.box("stone", Vector3(0, 0.57, 0), Vector3(1.32, 0.08, 1.32), c("#C9C2B6"))
	b.box("paint", Vector3(0, 0.615, 0), Vector3(1.12, 0.02, 1.12), c("#4A3E32"))
	var rng := RandomNumberGenerator.new()
	rng.seed = 7171 + variant
	var pal: Array = (FOLIAGE["temperate_maritime"] as Dictionary)["canopy"]
	var L: Color = c(pal[0])
	var M: Color = c(pal[1])
	var S: Color = c(pal[2])
	var ctr := Vector3(0, 0.95, 0)
	for k in 4:
		var a: float = TAU * k / 4 + rng.randf_range(-0.4, 0.4)
		var p: Vector3 = ctr + Vector3(cos(a) * 0.25, rng.randf_range(-0.05, 0.12), sin(a) * 0.25)
		b.blob("foliage", p, Vector3(0.36, 0.32, 0.36), 0, rng, func(pp: Vector3, nn: Vector3) -> Color:
			return _canopy_col(pp, nn, ctr, 0.55, S, M, L, 0.0, clampf((pp.y - 0.62) / 0.6, 0.0, 1.0) * 0.4), ctr)


static func _phone_box(b: MB) -> void:
	var red: Color = c("#B32020", true)
	var glass: Color = c("#2C3540")
	b.box("paint", Vector3(0, 0.06, 0), Vector3(1.0, 0.12, 1.0), red.darkened(0.15))
	b.box("paint", Vector3(0, 1.12, 0), Vector3(0.9, 2.0, 0.9), red)
	for i in 4:
		var rot := Basis(Vector3.UP, PI / 2 * i)
		# the panes: 3 x 6, the red glazing bars between them
		for cx in 3:
			for ry in 6:
				var x0: float = -0.3 + cx * 0.2 + 0.015
				var y0: float = 0.35 + ry * 0.24 + 0.015
				var p0: Vector3 = rot * Vector3(x0, y0, 0.452)
				var p1: Vector3 = rot * Vector3(x0 + 0.17, y0, 0.452)
				var p2: Vector3 = rot * Vector3(x0 + 0.17, y0 + 0.21, 0.452)
				var p3: Vector3 = rot * Vector3(x0, y0 + 0.21, 0.452)
				b.quad("glass", p0, p1, p2, p3, glass, rot * Vector3(0, 0, 1))
		# the TELEPHONE sign band
		b.quad("paint", rot * Vector3(-0.3, 1.94, 0.456), rot * Vector3(0.3, 1.94, 0.456), rot * Vector3(0.3, 2.06, 0.456), rot * Vector3(-0.3, 2.06, 0.456), c("#ECEAE2"), rot * Vector3(0, 0, 1))
	b.box("paint", Vector3(0, 2.16, 0), Vector3(0.98, 0.08, 0.98), red)
	b.lathe("paint", [Vector2(0.67, 2.2), Vector2(0.62, 2.32), Vector2(0.46, 2.44), Vector2(0.0, 2.5)], 4, red, Vector3.ZERO, PI / 4)
	b.box("paint", Vector3(0, 2.51, 0), Vector3(0.16, 0.06, 0.16), red.darkened(0.1))


static func _post_box(b: MB) -> void:
	var red: Color = c("#B32020", true)
	var blk: Color = c("#1E1F21")
	b.lathe("paint", [Vector2(0.31, 0), Vector2(0.31, 0.07), Vector2(0.27, 0.12)], 10, blk)
	b.lathe("paint", [Vector2(0.26, 0.12), Vector2(0.26, 1.25), Vector2(0.3, 1.3), Vector2(0.3, 1.37), Vector2(0.25, 1.43), Vector2(0.15, 1.51), Vector2(0.0, 1.55)], 10, red)
	b.box("paint", Vector3(0, 1.16, 0.255), Vector3(0.24, 0.035, 0.04), c("#101012"))
	b.box("paint", Vector3(0, 0.9, 0.255), Vector3(0.16, 0.12, 0.03), c("#E9E6DE"))


static func _hydrant(b: MB) -> void:
	var red: Color = c("#B3261E", true)
	b.lathe("paint", [Vector2(0.16, 0), Vector2(0.16, 0.05), Vector2(0.115, 0.09), Vector2(0.11, 0.55), Vector2(0.145, 0.58),
		Vector2(0.145, 0.63), Vector2(0.12, 0.66), Vector2(0.075, 0.76), Vector2(0.0, 0.79)], 8, red)
	b.cyl("paint", Vector3(0, 0.78, 0), Vector3(0, 0.83, 0), 0.03, 0.03, 5, c("#C9C7C0"))
	for sx: float in [-1.0, 1.0]:
		b.cyl("paint", Vector3(sx * 0.1, 0.42, 0), Vector3(sx * 0.2, 0.42, 0), 0.05, 0.05, 6, red)
	b.cyl("paint", Vector3(0, 0.38, 0.1), Vector3(0, 0.38, 0.21), 0.07, 0.07, 6, red)
	b.cyl("paint", Vector3(0, 0.38, 0.21), Vector3(0, 0.38, 0.23), 0.045, 0.045, 5, c("#C9C7C0"))


static func _belisha(b: MB) -> void:
	var blk: Color = c("#1E1F21")
	var wht: Color = c("#E9E6DE")
	b.lathe("paint", [Vector2(0.12, 0), Vector2(0.12, 0.08), Vector2(0.06, 0.14)], 8, blk)
	var bands: int = 7
	for i in bands:
		var y0: float = 0.12 + i * 0.335
		b.cyl("paint", Vector3(0, y0, 0), Vector3(0, y0 + 0.335, 0), 0.055, 0.055, 8, blk if i % 2 == 0 else wht, false)
	b.cyl("paint", Vector3(0, 2.46, 0), Vector3(0, 2.5, 0), 0.07, 0.07, 8, blk)
	b.blob("glow", Vector3(0, 2.66, 0), Vector3(0.19, 0.19, 0.19), 1, RandomNumberGenerator.new(), func(_p: Vector3, _n: Vector3) -> Color:
		return c("#F7A21B", true))


static func _bus_stop(b: MB) -> void:
	var frame: Color = c("#4A4E52")
	var glass: Color = c("#5E6E78")
	for p: Vector3 in [Vector3(-1.5, 0, -0.62), Vector3(1.5, 0, -0.62), Vector3(-1.5, 0, 0.55), Vector3(1.5, 0, 0.55)]:
		b.cyl("paint", p, p + Vector3(0, 2.5, 0), 0.05, 0.05, 6, frame, false)
	b.box("paint", Vector3(0, 2.55, -0.04), Vector3(3.3, 0.12, 1.55), frame)
	b.box("paint", Vector3(0, 2.62, 0.68), Vector3(1.4, 0.18, 0.04), c("#E8E2D2"))   # the stop's name plate
	b.box("glass", Vector3(0, 1.3, -0.62), Vector3(2.96, 2.0, 0.03), glass)
	b.box("glass", Vector3(-1.5, 1.3, -0.04), Vector3(0.03, 2.0, 1.1), glass)
	b.box("paint", Vector3(1.5, 1.25, -0.04), Vector3(0.16, 1.9, 1.15), c("#E8E2D2"))   # the advert panel's case
	b.box("paint", Vector3(0, 0.48, -0.42), Vector3(2.0, 0.05, 0.36), c("#8E9396"))
	for sx: float in [-0.8, 0.8]:
		b.box("paint", Vector3(sx, 0.24, -0.42), Vector3(0.05, 0.48, 0.3), frame)


# ------------------------------------------------------------------ roof clutter

static func _ac_unit(b: MB) -> void:
	b.ground_ao = 0.15
	var body: Color = c("#C8C9C6")
	b.box("paint", Vector3(0, 0.05, 0), Vector3(1.25, 0.1, 0.95), c("#5A5D60"))
	b.box("paint", Vector3(0, 0.5, 0), Vector3(1.2, 0.8, 0.9), body)
	b.lathe("paint", [Vector2(0.36, 0.9), Vector2(0.36, 0.93), Vector2(0.0, 0.93)], 10, c("#3A3C3F"), Vector3(0.12, 0, 0))
	b.box("paint", Vector3(0.12, 0.935, 0), Vector3(0.68, 0.01, 0.05), c("#6A6D70"))
	b.box("paint", Vector3(0.12, 0.935, 0), Vector3(0.05, 0.01, 0.68), c("#6A6D70"))
	for i in 5:
		b.box("paint", Vector3(0, 0.25 + i * 0.12, 0.452), Vector3(1.0, 0.03, 0.01), c("#8E9092"))


static func _vent(b: MB) -> void:
	b.ground_ao = 0.12
	b.lathe("paint", [Vector2(0.2, 0), Vector2(0.2, 0.05), Vector2(0.12, 0.08), Vector2(0.12, 0.6), Vector2(0.3, 0.66),
		Vector2(0.28, 0.75), Vector2(0.0, 0.85)], 8, c("#A7ADB2"))


static func _tank_us(b: MB) -> void:
	var steel: Color = c("#3B3F45")
	var wood: Color = c("#8A6A4B")
	b.ground_ao = 0.2
	for p: Vector2 in [Vector2(-0.85, -0.85), Vector2(0.85, -0.85), Vector2(-0.85, 0.85), Vector2(0.85, 0.85)]:
		b.box("paint", Vector3(p.x, 1.2, p.y), Vector3(0.12, 2.4, 0.12), steel)
	b.box("paint", Vector3(0, 2.44, 0), Vector3(2.3, 0.1, 2.3), steel)
	b.lathe("paint", [Vector2(1.18, 2.49), Vector2(1.24, 3.0), Vector2(1.24, 4.6), Vector2(1.18, 5.0)], 8, wood, Vector3.ZERO, PI / 8)
	for y: float in [3.1, 3.85, 4.6]:
		b.lathe("paint", [Vector2(1.26, y), Vector2(1.26, y + 0.07)], 8, c("#4A4038"), Vector3.ZERO, PI / 8)
	b.lathe("paint", [Vector2(1.32, 4.98), Vector2(1.3, 5.08), Vector2(0.0, 5.85)], 8, c("#4E4C4F"), Vector3.ZERO, PI / 8)
	b.lathe("paint", [Vector2(0.0, 5.82), Vector2(0.07, 5.88), Vector2(0.0, 5.95)], 4, c("#4E4C4F"))


static func _chimney(b: MB, variant: int) -> void:
	b.ground_ao = 0.2
	var n: int = 3 + variant % 2
	var w: float = 0.42 * n + 0.2
	b.box("stone", Vector3(0, 0.7, 0), Vector3(w, 1.4, 0.62), c("#A65441") if variant % 3 != 1 else c("#B98B62"))
	b.box("stone", Vector3(0, 1.45, 0), Vector3(w + 0.1, 0.1, 0.72), c("#E3DACB"))
	for i in n:
		var x: float = -w * 0.5 + 0.31 + i * 0.42
		b.lathe("paint", [Vector2(0.12, 1.5), Vector2(0.14, 1.82), Vector2(0.105, 1.88), Vector2(0.12, 1.95)], 6, c("#B0643E"), Vector3(x, 0, 0))


static func _dish(b: MB) -> void:
	var w: Color = c("#D9D8D3")
	b.ground_ao = 0.1
	b.box("paint", Vector3(0, 0.03, 0), Vector3(0.3, 0.06, 0.3), c("#6A6D70"))
	b.cyl("paint", Vector3(0, 0.06, 0), Vector3(0, 0.8, 0), 0.03, 0.03, 5, c("#8E9396"), false)
	var tilt := Basis(Vector3.RIGHT, deg_to_rad(60.0))
	b.lathe("paint", [Vector2(0.0, 0.0), Vector2(0.18, 0.025), Vector2(0.36, 0.1), Vector2(0.4, 0.125)], 10, w, Vector3(0, 0.85, 0.02), 0.0, tilt)
	b.tube("paint", [Vector3(0, 0.82, 0.05), Vector3(0, 0.92, 0.32), Vector3(0, 1.08, 0.42)], [0.012, 0.012, 0.012], 4, c("#8E9396"))
	b.box("paint", Vector3(0, 1.1, 0.43), Vector3(0.06, 0.06, 0.08), c("#6A6D70"))


static func _tank_lagos(b: MB) -> void:
	var steel: Color = c("#5A5D60")
	b.ground_ao = 0.15
	for p: Vector2 in [Vector2(-0.4, -0.4), Vector2(0.4, -0.4), Vector2(-0.4, 0.4), Vector2(0.4, 0.4)]:
		b.box("paint", Vector3(p.x, 0.45, p.y), Vector3(0.06, 0.9, 0.06), steel)
	b.box("paint", Vector3(0, 0.92, 0), Vector3(1.0, 0.05, 1.0), steel)
	var blue: Color = c("#2F5D8A")
	b.lathe("paint", [Vector2(0.52, 0.95), Vector2(0.57, 1.02), Vector2(0.57, 1.36), Vector2(0.53, 1.42), Vector2(0.57, 1.48),
		Vector2(0.57, 1.95), Vector2(0.44, 2.15), Vector2(0.14, 2.25), Vector2(0.0, 2.3)], 8, blue)
	b.cyl("paint", Vector3(0, 2.24, 0), Vector3(0, 2.36, 0), 0.15, 0.15, 6, blue.darkened(0.2), false)


static func _roof_plant(b: MB) -> void:
	var g: Color = c("#8C8F94")
	b.ground_ao = 0.3
	b.box("paint", Vector3(0, 0.1, 0), Vector3(4.1, 0.2, 2.5), c("#5E6166"))
	b.box("paint", Vector3(0, 1.2, 0), Vector3(4.0, 2.0, 2.4), g)
	for sz: float in [-1.0, 1.0]:
		for i in 3:
			b.box("paint", Vector3(-1.25 + i * 1.25, 1.2, sz * 1.205), Vector3(0.95, 1.4, 0.02), c("#6F7277"))
	for x: float in [-1.0, 1.0]:
		b.lathe("paint", [Vector2(0.62, 2.2), Vector2(0.62, 2.42), Vector2(0.55, 2.45), Vector2(0.0, 2.45)], 8, c("#5A5D60"), Vector3(x, 0, 0))
	b.tube("paint", [Vector3(2.0, 1.6, 0.6), Vector3(2.4, 1.6, 0.6), Vector3(2.45, 0.3, 0.6)], [0.12, 0.12, 0.12], 6, c("#A7ADB2"))


static func _bird(b: MB) -> void:
	b.shade = false
	var body: Color = c("#8A8C94")
	var head: Color = c("#6E7178")
	var wing: Color = c("#7A7D85")
	var tip: Color = c("#3E4046")
	var nose := Vector3(0, 0.03, 0.17)
	var tail := Vector3(0, 0.035, -0.15)
	var ring: Array = [Vector3(0, 0.075, 0.02), Vector3(0.055, 0.03, 0.02), Vector3(0, -0.02, 0.02), Vector3(-0.055, 0.03, 0.02)]
	for i in 4:
		var a: Vector3 = ring[i]
		var bb: Vector3 = ring[(i + 1) % 4]
		var out: Vector3 = ((a + bb) * 0.5 - Vector3(0, 0.03, 0.02)).normalized()
		var on: Vector3 = (out + Vector3(0, 0, 0.6)).normalized()
		var ot: Vector3 = (out + Vector3(0, 0, -0.6)).normalized()
		b.tri("paint", [nose, a, bb], [on, on, on], [head, body, body], on)
		b.tri("paint", [tail, a, bb], [ot, ot, ot], [body, body, body], ot)
	# the tail fan, both faces
	var t0 := Vector3(-0.05, 0.035, -0.2)
	var t1 := Vector3(0.05, 0.035, -0.2)
	b.tri("paint", [tail, t0, t1], [Vector3.UP, Vector3.UP, Vector3.UP], [tip, tip, tip], Vector3.UP)
	b.tri("paint", [tail, t0, t1], [Vector3.DOWN, Vector3.DOWN, Vector3.DOWN], [tip, tip, tip], Vector3.DOWN)
	# the wings: root (weight 0.1) to tip (weight 1), both faces
	for sx: float in [-1.0, 1.0]:
		var r0 := Vector3(sx * 0.04, 0.05, 0.06)
		var r1 := Vector3(sx * 0.04, 0.05, -0.07)
		var m := Vector3(sx * 0.19, 0.055, -0.02)
		var tp := Vector3(sx * 0.33, 0.05, -0.08)
		var wr := Color(wing.r, wing.g, wing.b, 0.1)
		var wm := Color(wing.r, wing.g, wing.b, 0.55)
		var wt := Color(tip.r, tip.g, tip.b, 1.0)
		for nn: Vector3 in [Vector3.UP, Vector3.DOWN]:
			b.tri("paint", [r0, r1, m], [nn, nn, nn], [wr, wr, wm], nn)
			b.tri("paint", [m, r1, tp], [nn, nn, nn], [wm, wr, wt], nn)


# ------------------------------------------------------------------ trees

## A canopy colour: shadow (core, underside) -> mid -> light (top, rim), biased by the variant.
static func _canopy_col(p: Vector3, n: Vector3, ctr: Vector3, rad: float, S: Color, M: Color, L: Color, bias: float, wind: float) -> Color:
	var rim: float = clampf((p - ctr).length() / maxf(0.01, rad), 0.0, 1.2)
	var f: float = 0.45 * (n.y * 0.5 + 0.5) + 0.45 * smoothstep(0.3, 1.0, rim) + 0.1 * clampf(n.dot(Vector3(-0.5, 0.6, 0.62).normalized()), 0.0, 1.0) + bias
	f = clampf(f, 0.0, 1.0)
	var col: Color = S.lerp(M, f * 2.0) if f < 0.5 else M.lerp(L, (f - 0.5) * 2.0)
	col.a = wind
	return col


static func _tree(b: MB, sp: String, variant: int) -> void:
	b.shade = false
	var t: Array = TREES.get(sp, TREES["london_plane"])
	var fol: Dictionary = FOLIAGE[str(t[0])]
	var pal: Array = fol["canopy"]
	var L: Color = c(pal[0])
	var M: Color = c(pal[1])
	var S: Color = c(pal[2])
	var bark: Color = c(fol["trunk"])
	var bloom: Color = c(str(fol.get("bloom", "#000000")), true)
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(sp) + variant * 7919
	var bias: float = [0.0, 0.12, -0.12, 0.06, -0.06, 0.18][variant % 6]
	var h: float = float(t[1])
	var R: float = float(t[2])
	match sp:
		"italian_cypress":
			_cypress(b, h, R, S, M, L, bark, bias, rng)
		"washingtonia_palm":
			_washingtonia(b, h, S, M, L, bark, bias, rng)
		"coconut_palm":
			_coconut(b, h, S, M, L, bark, bias, rng)
		"banana":
			_banana(b, h, S, M, L, bark, bias, rng)
		_:
			_broadleaf(b, sp, h, R, S, M, L, bark, bloom, bias, rng)


## The broadleaf species: a trunk (with forks), and a crown of clumped lumpy spheres placed by a
## species shape. Normals bend towards the crown centre so the clumps shade as one mass.
static func _broadleaf(b: MB, sp: String, h: float, R: float, S: Color, M: Color, L: Color, bark: Color, bloom: Color, bias: float, rng: RandomNumberGenerator) -> void:
	# per species: trunk height share, crown centre share, crown vertical radius share, clumps, shape
	var shp: Array = {
		"london_plane": [0.36, 0.64, 0.33, 7, "round"], "lime": [0.22, 0.58, 0.4, 7, "oval"],
		"oak": [0.25, 0.6, 0.3, 8, "spread"], "honey_locust": [0.38, 0.68, 0.27, 9, "airy"],
		"pin_oak": [0.18, 0.55, 0.42, 8, "cone"], "callery_pear": [0.2, 0.58, 0.4, 6, "oval"],
		"coast_live_oak": [0.22, 0.6, 0.28, 8, "dome"], "jacaranda": [0.4, 0.72, 0.24, 8, "umbrella"],
		"indian_almond": [0.3, 0.6, 0.3, 9, "tiers"], "neem": [0.3, 0.63, 0.33, 7, "round"],
		"flame_tree": [0.42, 0.76, 0.2, 8, "umbrella"],
	}[sp]
	var trunk_h: float = h * float(shp[0])
	var cy: float = h * float(shp[1])
	var ry: float = h * float(shp[2])
	var n: int = int(shp[3])
	var mode: String = shp[4]
	var lean := Vector3(rng.randf_range(-0.25, 0.25), 0, rng.randf_range(-0.25, 0.25))
	if sp == "coast_live_oak":
		lean *= 4.0
	var top := Vector3(0, trunk_h, 0) + lean
	var tr: float = clampf(h * 0.028, 0.18, 0.42)
	var bark_dark: Color = bark.darkened(0.25)
	var bark_cols: Array = [bark_dark, bark, bark.darkened(0.08), bark.lightened(0.06)] if sp == "london_plane" else [bark_dark, bark, bark]
	b.tube("bark", [Vector3(0, -0.1, 0), Vector3(0, trunk_h * 0.5, 0) + lean * 0.4, top], [tr * 1.25, tr, tr * 0.85], 6, bark_cols)
	var ctr := Vector3(lean.x, cy, lean.z)
	# clump centres by shape
	var pts: Array = []
	for i in n:
		var a: float = TAU * (float(i) / n) + rng.randf_range(-0.35, 0.35)
		var u: float = rng.randf_range(-1.0, 1.0)
		var p: Vector3
		match mode:
			"oval", "round":
				var rr: float = sqrt(1.0 - u * u) * 0.62
				p = Vector3(cos(a) * R * rr, u * ry * 0.5, sin(a) * R * rr)
			"spread", "dome":
				p = Vector3(cos(a) * R * rng.randf_range(0.45, 0.75), rng.randf_range(-0.35, 0.45) * ry, sin(a) * R * rng.randf_range(0.45, 0.75))
			"airy":
				p = Vector3(cos(a) * R * rng.randf_range(0.35, 0.8), rng.randf_range(-0.5, 0.7) * ry, sin(a) * R * rng.randf_range(0.35, 0.8))
			"cone":
				var k: float = float(i) / max(1, n - 1)
				var rr2: float = (1.0 - k) * 0.75 + 0.1
				p = Vector3(cos(a * 2.3) * R * rr2, (k * 2.0 - 1.0) * ry * 0.62, sin(a * 2.3) * R * rr2)
			"umbrella":
				p = Vector3(cos(a) * R * rng.randf_range(0.4, 0.8), rng.randf_range(-0.2, 0.35) * ry, sin(a) * R * rng.randf_range(0.4, 0.8))
			"tiers":
				var tier: int = i % 3
				var tr2: float = R * (1.0 - tier * 0.26)
				p = Vector3(cos(a) * tr2 * 0.62, (tier - 1) * ry * 0.85, sin(a) * tr2 * 0.62)
			_:
				p = Vector3(cos(a) * R * 0.6, u * ry * 0.5, sin(a) * R * 0.6)
		pts.append(ctr + p)
	# branches to a few clumps (visible in the open crowns)
	var nb: int = 4 if mode in ["airy", "umbrella", "spread", "dome", "tiers"] else 2
	for i in nb:
		var tgt: Vector3 = pts[(i * 3) % pts.size()]
		var mid: Vector3 = top.lerp(tgt, 0.5) + Vector3(0, 0.6, 0)
		b.tube("bark", [top - Vector3(0, 0.3, 0), mid, tgt.lerp(mid, 0.25)], [tr * 0.7, tr * 0.45, tr * 0.25], 4, bark)
	if mode in ["cone", "oval"]:
		b.tube("bark", [top, ctr + Vector3(0, ry * 0.6, 0)], [tr * 0.7, tr * 0.25], 4, bark)
	var crown_r: float = maxf(R, ry)
	var base_y: float = cy - ry
	var sub_big: int = 1
	# a core clump fills the middle
	var core_sz: Vector3 = Vector3(R * 0.62, ry * 0.72, R * 0.62)
	if mode == "umbrella" or mode == "tiers":
		core_sz = Vector3(R * 0.55, ry * 0.6, R * 0.55)
	var is_bloom: bool = sp in ["jacaranda", "flame_tree"]
	var colf := func(pp: Vector3, nn: Vector3) -> Color:
		var w: float = clampf((pp - top).length() / (crown_r * 1.1), 0.0, 1.0)
		var col: Color = _canopy_col(pp, nn, ctr, crown_r, S, M, L, bias, w)
		if is_bloom:
			# bloom on the sunlit outer canopy, broken up by a cheap spatial hash
			var hsh: float = fposmod(sin(pp.x * 3.1 + pp.z * 2.3 + pp.y * 1.7) * 43758.5, 1.0)
			var bf: float = smoothstep(0.35, 0.9, nn.y * 0.5 + 0.5) * (0.55 if hsh > 0.35 else 0.15)
			var shade_k: float = 0.5 + 0.32 * (nn.y * 0.5 + 0.5)
			col = Color(col.r, col.g, col.b).lerp(Color(bloom.r * shade_k, bloom.g * shade_k, bloom.b * shade_k), bf)
			col.a = w
		return col
	b.blob("foliage", ctr, core_sz, sub_big, rng, colf, ctr)
	for i in pts.size():
		var p: Vector3 = pts[i]
		var sz: float = rng.randf_range(0.36, 0.5) * R
		var sy: float = sz * (0.62 if mode in ["umbrella", "tiers", "spread", "dome"] else 0.85)
		if mode == "cone":
			sz *= 1.0 - 0.45 * clampf((p.y - base_y) / (2.0 * ry), 0.0, 1.0)
			sy = sz * 0.8
		var sub: int = 1 if i < 4 else 0
		if mode == "airy":
			sz *= 0.75
			sy *= 0.75
		b.blob("foliage", p, Vector3(sz, sy, sz * rng.randf_range(0.85, 1.1)), sub, rng, colf, ctr)


static func _cypress(b: MB, h: float, R: float, S: Color, M: Color, L: Color, bark: Color, bias: float, rng: RandomNumberGenerator) -> void:
	b.tube("bark", [Vector3(0, -0.1, 0), Vector3(0, 1.2, 0)], [0.16, 0.13], 5, bark)
	var seg: int = 9
	var rings: int = 9
	var prof: Array = []
	for i in rings + 1:
		var t: float = float(i) / rings
		var r: float = R * (sin(pow(t, 0.62) * PI) * 0.95 + 0.05) * (1.0 - t * 0.25)
		if i == rings:
			r = 0.0
		prof.append(Vector2(r, 0.8 + t * (h - 0.8)))
	var ctr := Vector3(0, h * 0.5, 0)
	for k in rings:
		var p0: Vector2 = prof[k]
		var p1: Vector2 = prof[k + 1]
		for i in seg:
			var j0: float = rng.randf_range(0.85, 1.12)
			var a0: float = TAU * i / seg + k * 0.35
			var a1: float = TAU * (i + 1) / seg + k * 0.35
			var e0 := Vector3(cos(a0), 0, sin(a0))
			var e1 := Vector3(cos(a1), 0, sin(a1))
			var v00: Vector3 = e0 * p0.x * j0 + Vector3(0, p0.y, 0)
			var v01: Vector3 = e1 * p0.x * j0 + Vector3(0, p0.y, 0)
			var v10: Vector3 = e0 * p1.x + Vector3(0, p1.y, 0)
			var v11: Vector3 = e1 * p1.x + Vector3(0, p1.y, 0)
			var slope: float = (p0.x - p1.x) / maxf(0.01, p1.y - p0.y)
			var n0: Vector3 = (e0 + Vector3(0, slope, 0)).normalized()
			var n1: Vector3 = (e1 + Vector3(0, slope, 0)).normalized()
			var cs: Array = []
			for q: Array in [[v00, n0], [v01, n1], [v11, n1], [v10, n0]]:
				var pp: Vector3 = q[0]
				var rr: float = Vector2(pp.x, pp.z).length() / maxf(0.01, R)
				var f: float = clampf(0.3 + 0.35 * rr + 0.3 * (pp.y / h) + 0.12 * (q[1] as Vector3).dot(Vector3(-0.5, 0.3, 0.6).normalized()) + bias, 0.0, 1.0)
				var col: Color = S.lerp(M, f * 2.0) if f < 0.5 else M.lerp(L, (f - 0.5) * 2.0)
				col.a = clampf(pp.y / h, 0.0, 1.0) * 0.6
				cs.append(col)
			var ref: Vector3 = (n0 + n1).normalized()
			if p0.x > 0.001:
				b.tri("foliage", [v00, v01, v11], [n0, n1, n1], [cs[0], cs[1], cs[2]], ref)
			if p1.x > 0.001:
				b.tri("foliage", [v00, v11, v10], [n0, n1, n0], [cs[0], cs[2], cs[3]], ref)


## A ringed palm trunk along a gentle curve.
static func _palm_trunk(b: MB, h: float, bend: Vector3, r0: float, r1: float, bark: Color) -> Array:
	var pts: Array = []
	var radii: Array = []
	var cols: Array = []
	var nseg: int = 9
	for i in nseg + 1:
		var t: float = float(i) / nseg
		pts.append(Vector3(0, t * h, 0) + bend * (t * t))
		radii.append(lerpf(r0, r1, t) * (1.08 if i % 2 == 0 else 0.96))
		cols.append(bark.darkened(0.18) if i % 2 == 0 else bark.lightened(0.05))
	b.tube("bark", pts, radii, 6, cols)
	return [pts[nseg], (pts[nseg] - pts[nseg - 1]).normalized()]


static func _coconut(b: MB, h: float, S: Color, M: Color, L: Color, bark: Color, bias: float, rng: RandomNumberGenerator) -> void:
	var bend := Vector3(rng.randf_range(0.8, 1.8), 0, rng.randf_range(-0.6, 0.6))
	var top: Array = _palm_trunk(b, h, bend, 0.24, 0.16, bark)
	var crown: Vector3 = top[0]
	b.blob("bark", crown + Vector3(0, -0.15, 0), Vector3(0.38, 0.32, 0.38), 0, rng, func(_p: Vector3, _n: Vector3) -> Color:
		return c("#6B5A3A"), crown)
	var nf: int = 9
	for i in nf:
		var a: float = TAU * i / nf + rng.randf_range(-0.2, 0.2)
		var d := Vector3(cos(a), 0, sin(a))
		var up0: float = rng.randf_range(0.5, 1.1)
		var length: float = rng.randf_range(3.6, 4.4)
		var pts: Array = []
		var sides: Array = []
		var k: int = 5
		for j in k + 1:
			var t: float = float(j) / k
			# an arch: up and out, then drooping
			var y: float = up0 * t * 1.6 - t * t * (up0 * 1.6 + 1.4)
			pts.append(crown + d * (t * length) + Vector3(0, y, 0))
			var w: float = sin(PI * clampf(t * 0.95 + 0.05, 0.0, 1.0)) * 0.6 + 0.05
			sides.append(d.cross(Vector3.UP).normalized() * w)
		var jb: float = bias + rng.randf_range(-0.08, 0.08)
		b.strip("foliage", pts, sides, 0.45, func(t: float, _sg: float) -> Color:
			var f: float = clampf(0.4 + 0.35 * t + jb, 0.0, 1.0)
			var col: Color = S.lerp(M, f * 2.0) if f < 0.5 else M.lerp(L, (f - 0.5) * 2.0)
			col.a = t
			return col)


static func _washingtonia(b: MB, h: float, S: Color, M: Color, L: Color, bark: Color, bias: float, rng: RandomNumberGenerator) -> void:
	var bend := Vector3(rng.randf_range(-0.3, 0.3), 0, rng.randf_range(-0.3, 0.3))
	var top: Array = _palm_trunk(b, h - 1.0, bend, 0.32, 0.22, bark)
	var crown: Vector3 = top[0]
	# the skirt of dead fronds under the head
	b.lathe("bark", [Vector2(0.24, -1.9), Vector2(0.62, -0.9), Vector2(0.72, -0.1), Vector2(0.4, 0.15)], 7, [c("#8C7A5A"), c("#9C8A66"), c("#A89670")], crown)
	var nf: int = 15
	for i in nf:
		var a: float = TAU * i / nf + rng.randf_range(-0.15, 0.15)
		var d := Vector3(cos(a), 0, sin(a))
		var side: Vector3 = d.cross(Vector3.UP).normalized()
		var tilt: float = [1.2, 0.5, -0.2, -0.8][i % 4] + rng.randf_range(-0.2, 0.2)
		var base: Vector3 = crown + Vector3(0, 0.25, 0)
		var stem: Vector3 = base + d * 0.7 + Vector3(0, tilt * 0.6, 0)
		# a fan: wedges out from the end of its stalk, cupped, both faces
		var wedges: int = 5
		var fr: float = rng.randf_range(1.9, 2.3)
		var jb: float = bias + rng.randf_range(-0.08, 0.08)
		for w in wedges:
			var t0: float = -1.0 + 2.0 * w / wedges
			var t1: float = -1.0 + 2.0 * (w + 1) / wedges
			var e0: Vector3 = (d * cos(t0 * 1.1) + side * sin(t0 * 1.1)) * fr + Vector3(0, tilt * 0.8 - absf(t0) * 0.35, 0)
			var e1: Vector3 = (d * cos(t1 * 1.1) + side * sin(t1 * 1.1)) * fr + Vector3(0, tilt * 0.8 - absf(t1) * 0.35, 0)
			var p0: Vector3 = stem
			var p1: Vector3 = stem + e0
			var p2: Vector3 = stem + e1
			var nn: Vector3 = (p1 - p0).cross(p2 - p0).normalized()
			if nn.y < 0.0:
				nn = -nn
			var f: float = clampf(0.7 + jb + 0.2 * (nn.y) - 0.1 * float(tilt < -0.3), 0.0, 1.0)
			var col: Color = S.lerp(M, f * 2.0) if f < 0.5 else M.lerp(L, (f - 0.5) * 2.0)
			var cb := Color(col.r, col.g, col.b, 0.35)
			var ct := Color(col.r * 1.05, col.g * 1.05, col.b * 1.05, 1.0)
			b.tri("foliage", [p0, p1, p2], [nn, nn, nn], [cb, ct, ct], nn)
			var cu := Color(col.r * 0.86, col.g * 0.86, col.b * 0.86, 1.0)
			b.tri("foliage", [p0, p1, p2], [-nn, -nn, -nn], [Color(cu.r, cu.g, cu.b, 0.35), cu, cu], -nn)
		b.tube("bark", [base, stem], [0.05, 0.035], 3, c("#7A6A4A"))


static func _banana(b: MB, h: float, S: Color, M: Color, L: Color, bark: Color, bias: float, rng: RandomNumberGenerator) -> void:
	var stem_h: float = h * 0.6
	b.tube("bark", [Vector3(0, -0.1, 0), Vector3(0, stem_h * 0.5, 0), Vector3(0, stem_h, 0)], [0.2, 0.17, 0.13], 6, [c("#7E8A52"), c("#8A9458")])
	var nl: int = 7
	for i in nl:
		var a: float = TAU * i / nl + rng.randf_range(-0.2, 0.2)
		var d := Vector3(cos(a), 0, sin(a))
		var up0: float = rng.randf_range(0.6, 1.6)
		var length: float = rng.randf_range(1.8, 2.4)
		var pts: Array = []
		var sides: Array = []
		var k: int = 5
		var base := Vector3(0, stem_h - 0.2, 0) + d * 0.1
		for j in k + 1:
			var t: float = float(j) / k
			var y: float = up0 * t * 1.5 - t * t * (up0 * 0.9 + 0.6)
			pts.append(base + d * (t * length) + Vector3(0, y + t * 0.4, 0))
			var w: float = (sin(PI * clampf(t * 0.9 + 0.1, 0.0, 1.0)) * 0.42 + 0.03) * (0.25 if j == 0 else 1.0)
			sides.append(d.cross(Vector3.UP).normalized() * w)
		var jb: float = bias + rng.randf_range(-0.1, 0.1)
		b.strip("foliage", pts, sides, 0.12, func(t: float, sg: float) -> Color:
			var f: float = clampf(0.55 + 0.3 * t + 0.08 * sg + jb, 0.0, 1.0)
			var col: Color = S.lerp(M, f * 2.0) if f < 0.5 else M.lerp(L, (f - 0.5) * 2.0)
			col.a = t
			return col)
