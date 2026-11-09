extends RefCounted
## The landmark kit (look-world, ART-DIRECTION 4.7): column, obelisk, statue, lion, tiered fountain,
## memorial (cenotaph) and clock tower, modelled once in code and instanced by OSM kind (place.gd).
## Real metres, origin at the base centre, +y up, the front facing +z.
##
## Each mesh has one surface per material class, named with surface_set_name: "stone", "granite",
## "bronze", "water", "clock" (UV 0..1 per clock face), "glow". The vertex colour (authored sRGB) is
## the albedo multiplier with the AO baked in: stone and granite are near white (the material brings
## the stone texture and the tint), bronze carries its own colour (tokens world.landmark_bronze: #7A5A3A,
## patina #5E8C76 in the crevices and on upward faces, never darker than #3A2A1C, so it never renders
## black). Architecture keeps hard, bevelled edges; figures and basins are smooth.
##
##   var mesh: ArrayMesh = Landmarks.build("column")       # Landmarks := preload("res://world_landmarks.gd")
##   var i: Dictionary = Landmarks.info("column")          # {"h": 50.0, "r": 8.0, ...}

const BRONZE: Color = Color(0.478, 0.353, 0.227)       # #7A5A3A
const PATINA: Color = Color(0.369, 0.549, 0.463)       # #5E8C76
const BRONZE_MIN: Color = Color(0.227, 0.165, 0.11)    # #3A2A1C
const CLASSES: Array[String] = ["stone", "granite", "bronze", "water", "clock", "glow", "render", "tile", "slate", "gilt", "screen"]
const KINDS: Array[String] = ["column", "obelisk", "statue", "lion", "fountain", "memorial", "clock_tower", "arch", "dome", "spire"]
const GILT: Color = Color(0.79, 0.63, 0.29)            # #C9A04A, gold leaf
const SLATE: Color = Color(0.36, 0.4, 0.46)            # #5C6675, slate and painted iron (never black)

static var _dim: float = 1.0   # stone darkened while a void is built (the belfry's bell chamber)
## day1-world: the albedo of the coloured classes ("render", "tile") while a piece is built (world_heroes.gd)
static var _hue: Color = Color(1, 1, 1)


## Canonical size of each kind (metres): "h" height, "r" footprint radius (half the widest side for a
## square base), plus extras: "figure_top", "plinth_top", "spray" (fountain jet tips, local), "jets",
## "pools" ([{y, r}] water discs), "clock_y" / "clock_r" / "clock_out" (the faces' centre height,
## radius and distance out from the tower's axis), "length" (lion).
static func info(kind: String) -> Dictionary:
	match kind:
		"column":
			return {"h": 50.0, "r": 8.0, "plinth_top": 10.2, "figure_top": 50.0, "steps_r": 8.0}
		"obelisk":
			return {"h": 20.0, "r": 3.2, "plinth_top": 3.6}
		"statue":
			return {"h": 5.5, "r": 1.05, "plinth_top": 2.6, "figure_top": 5.5}
		"lion":
			return {"h": 2.75, "r": 3.0, "length": 5.8, "width": 2.2}
		"fountain":
			return {"h": 4.5, "r": 5.2, "spray": [Vector3(0, 4.5, 0)],
				"jets": [Vector3(3.6, 0.7, 0), Vector3(-3.6, 0.7, 0), Vector3(0, 0.7, 3.6), Vector3(0, 0.7, -3.6)],
				"pools": [{"y": 0.62, "r": 4.75}, {"y": 2.62, "r": 1.72}, {"y": 3.58, "r": 0.82}]}
		"memorial":
			return {"h": 10.0, "r": 3.6}
		"clock_tower":
			return {"h": 40.0, "r": 4.9, "clock_y": 27.0, "clock_r": 2.3, "clock_out": 4.5}
		"arch":
			return {"h": 16.0, "r": 8.5}
		"dome":
			return {"h": 26.0, "r": 9.5}
		"spire":
			return {"h": 46.0, "r": 4.2}
	return {}


static func build(kind: String, variant: int = 0) -> ArrayMesh:
	var c: Dictionary = {}
	match kind:
		"column":
			_column(c)
		"obelisk":
			_obelisk(c)
		"statue":
			_statue(c, variant)
		"lion":
			_lion(c, Transform3D.IDENTITY)
		"fountain":
			_fountain(c)
		"memorial":
			_memorial(c)
		"clock_tower":
			_clock_tower(c)
		"arch":
			_arch(c)
		"dome":
			_dome(c)
		"spire":
			_spire(c)
		_:
			return ArrayMesh.new()
	return _commit(c)


# ------------------------------------------------------------ building blocks

static func _st(c: Dictionary, cls: String) -> SurfaceTool:
	if not c.has(cls):
		var st := SurfaceTool.new()
		st.begin(Mesh.PRIMITIVE_TRIANGLES)
		c[cls] = st
	return c[cls]


static func _commit(c: Dictionary) -> ArrayMesh:
	var am := ArrayMesh.new()
	for cls: String in CLASSES:
		if c.has(cls):
			(c[cls] as SurfaceTool).commit(am)
			am.surface_set_name(am.get_surface_count() - 1, cls)
	return am


## The vertex colour: AO and a sky-from-above term; bronze gets its own colour and the patina.
static func _col(cls: String, n: Vector3, ao: float, p: Vector3) -> Color:
	var up: float = n.y
	var shade: float = clampf(0.88 + 0.12 * up, 0.7, 1.0) * ao
	if up < -0.5:
		shade *= 0.82
	match cls:
		"bronze":
			var hz: float = fposmod(sin(p.x * 12.9898 + p.y * 78.233 + p.z * 37.719) * 43758.5453, 1.0)
			var pat: float = clampf((1.0 - ao) * 2.6 + maxf(up - 0.25, 0.0) * 0.75 + (hz - 0.5) * 0.3, 0.0, 0.85)
			var col: Color = BRONZE.lerp(PATINA, pat) * minf(shade, 1.0)
			return Color(maxf(col.r, BRONZE_MIN.r), maxf(col.g, BRONZE_MIN.g), maxf(col.b, BRONZE_MIN.b))
		"water", "clock", "glow", "screen":
			return Color(1, 1, 1)
		"gilt":
			var g: Color = GILT * clampf(0.75 + 0.3 * ao + 0.15 * maxf(up, 0.0), 0.7, 1.15)
			return Color(minf(g.r, 1.0), minf(g.g, 1.0), minf(g.b, 1.0))
		"slate":
			return SLATE * clampf(shade, 0.75, 1.0)
		"render", "tile":
			var vv: float = clampf(shade, 0.3, 1.0) * _dim
			return Color(_hue.r * vv, _hue.g * vv, _hue.b * vv)
	var v: float = clampf(shade, 0.12, 1.0) * _dim
	return Color(v, v, v)


## One triangle, wound so its front faces along n (Godot draws clockwise-from-the-viewer as front).
static func _tri(st: SurfaceTool, p: Array, nn: Array, uv: Array, cols: Array) -> void:
	var a: Vector3 = p[0]
	var b: Vector3 = p[1]
	var cc: Vector3 = p[2]
	var g: Vector3 = (b - a).cross(cc - a)
	if g.length_squared() < 1e-12:
		return
	var avg: Vector3 = nn[0] + nn[1] + nn[2]
	var order: Array = [0, 1, 2] if g.dot(avg) < 0.0 else [0, 2, 1]
	for k: int in order:
		st.set_normal(nn[k])
		st.set_uv(uv[k])
		st.set_color(cols[k])
		st.add_vertex(p[k])


## A closed 2D section in the (x, z) plane, counter-clockwise: its edges [p0, p1, n0, n1] with the
## outward normals at both ends (averaged with the neighbours when smooth, the edge's own when not).
static func _sec(pts: PackedVector2Array, smooth: bool) -> Array:
	var n: int = pts.size()
	var en: Array[Vector2] = []
	for i in n:
		var d: Vector2 = pts[(i + 1) % n] - pts[i]
		en.append(Vector2(d.y, -d.x).normalized())
	var out: Array = []
	for i in n:
		var j: int = (i + 1) % n
		var n0: Vector2 = en[i]
		var n1: Vector2 = en[i]
		if smooth:
			n0 = (en[(i - 1 + n) % n] + en[i]).normalized()
			n1 = (en[i] + en[j]).normalized()
		out.append([pts[i], pts[j], n0, n1])
	return out


## A unit ring of n points (radius 1, modulated by mod(angle) when given).
static func _ring(n: int, mod: Callable = Callable()) -> PackedVector2Array:
	var p := PackedVector2Array()
	for i in n:
		var a: float = TAU * float(i) / float(n)
		var r: float = 1.0 if not mod.is_valid() else float(mod.call(a))
		p.append(Vector2(cos(a), sin(a)) * r)
	return p


## A rectangle (half sizes hx, hz) with its corners chamfered by ch, counter-clockwise.
static func _rect(hx: float, hz: float, ch: float) -> PackedVector2Array:
	if ch <= 0.0001:
		return PackedVector2Array([Vector2(hx, -hz), Vector2(hx, hz), Vector2(-hx, hz), Vector2(-hx, -hz)])
	return PackedVector2Array([Vector2(hx, -hz + ch), Vector2(hx, hz - ch), Vector2(hx - ch, hz), Vector2(-hx + ch, hz),
		Vector2(-hx, hz - ch), Vector2(-hx, -hz + ch), Vector2(-hx + ch, -hz), Vector2(hx - ch, -hz)])


static func _pm(d: Vector2, e: float) -> Vector2:
	return Vector2(d.y, -d.x * e).normalized()


## Sweeps a section up a profile [(scale, y)] (bottom to top along the outside): a lathe for a round
## section, a moulded pedestal for a square one. Joints sharper than smooth_deg stay hard; inner
## corners of the profile get baked AO, outer ones a little light.
static func _sweep(c: Dictionary, cls: String, sec: Array, prof: PackedVector2Array, xf: Transform3D = Transform3D.IDENTITY, smooth_deg: float = 35.0) -> void:
	var st: SurfaceTool = _st(c, cls)
	var nb: Basis = xf.basis.inverse().transposed()
	var m: int = prof.size()
	var segs: Array[Vector2] = []
	for j in m - 1:
		segs.append(prof[j + 1] - prof[j])
	var cos_lim: float = cos(deg_to_rad(smooth_deg))
	var ao := PackedFloat32Array()
	var sm: Array[bool] = []
	for i in m:
		var a: float = 1.0
		var s: bool = false
		if i > 0 and i < m - 1 and segs[i - 1].length() > 1e-5 and segs[i].length() > 1e-5:
			var d0: Vector2 = segs[i - 1].normalized()
			var d1: Vector2 = segs[i].normalized()
			var cr: float = d0.x * d1.y - d0.y * d1.x
			if cr < -0.25:
				a = 0.7
			elif cr > 0.25:
				a = 1.05
			s = d0.dot(d1) > cos_lim
			if s:
				a = lerpf(1.0, a, 0.35)
		ao.append(a)
		sm.append(s)
	var perim: float = 0.0
	for e: Array in sec:
		perim += (e[1] as Vector2).distance_to(e[0])
	for j in m - 1:
		var d: Vector2 = segs[j]
		if d.length() < 1e-5:
			continue
		var u: float = 0.0
		for e: Array in sec:
			var corners: Array = [[0, e[0], e[2], u], [0, e[1], e[3], u + (e[1] as Vector2).distance_to(e[0])],
				[1, e[1], e[3], u + (e[1] as Vector2).distance_to(e[0])], [1, e[0], e[2], u]]
			u += (e[1] as Vector2).distance_to(e[0])
			var pp: Array = []
			var nn: Array = []
			var uv: Array = []
			var cl: Array = []
			for q: Array in corners:
				var k: int = q[0]
				var p: Vector2 = q[1]
				var sn: Vector2 = q[2]
				var idx: int = j + k
				var ev: float = p.dot(sn)
				var mm: Vector2 = _pm(d, ev)
				if sm[idx]:
					var other: Vector2 = segs[j - 1] if k == 0 else segs[j + 1]
					mm = (mm + _pm(other, ev)).normalized()
				var s: float = prof[idx].x
				var pos: Vector3 = xf * Vector3(p.x * s, prof[idx].y, p.y * s)
				var nrm: Vector3 = (nb * Vector3(sn.x * mm.x, mm.y, sn.y * mm.x)).normalized()
				pp.append(pos)
				nn.append(nrm)
				uv.append(Vector2(float(q[3]) / maxf(perim, 0.001), prof[idx].y))
				cl.append(_col(cls, nrm, ao[idx], pos))
			if prof[j].x > 1e-5:
				_tri(st, [pp[0], pp[1], pp[2]], [nn[0], nn[1], nn[2]], [uv[0], uv[1], uv[2]], [cl[0], cl[1], cl[2]])
			if prof[j + 1].x > 1e-5:
				_tri(st, [pp[0], pp[2], pp[3]], [nn[0], nn[2], nn[3]], [uv[0], uv[2], uv[3]], [cl[0], cl[2], cl[3]])


static func _lathe(c: Dictionary, cls: String, prof: PackedVector2Array, n: int, xf: Transform3D = Transform3D.IDENTITY, smooth_deg: float = 35.0) -> void:
	_sweep(c, cls, _sec(_ring(n), true), prof, xf, smooth_deg)


## A square (or hz/hx-proportioned) moulded block: profile [(half width x, y)].
static func _block(c: Dictionary, cls: String, prof: PackedVector2Array, ratio: float = 1.0, ch: float = 0.03, xf: Transform3D = Transform3D.IDENTITY) -> void:
	_sweep(c, cls, _sec(_rect(1.0, ratio, ch), false), prof, xf, 10.0)


## A bevelled box, hx x hz half sizes, from y0 to y1, centred on xf's origin.
static func _box(c: Dictionary, cls: String, xf: Transform3D, hx: float, hz: float, y0: float, y1: float, bev: float = 0.04) -> void:
	var b: float = minf(bev, minf(minf(hx, hz), (y1 - y0) * 0.5) * 0.9)
	var prof := PackedVector2Array([Vector2(0, y0), Vector2(hx - b, y0), Vector2(hx, y0 + b), Vector2(hx, y1 - b), Vector2(hx - b, y1), Vector2(0, y1)])
	if b <= 0.0001:
		prof = PackedVector2Array([Vector2(0, y0), Vector2(hx, y0), Vector2(hx, y1), Vector2(0, y1)])
	_sweep(c, cls, _sec(_rect(1.0, hz / hx, b / hx), false), prof, xf, 10.0)


static func _basis_y(dir: Vector3) -> Basis:
	var y: Vector3 = dir.normalized()
	var ref: Vector3 = Vector3.FORWARD if absf(y.dot(Vector3.UP)) > 0.9 else Vector3.UP
	var x: Vector3 = ref.cross(y).normalized()
	var z: Vector3 = x.cross(y)
	return Basis(x, y, z)


## An ellipsoid at centre (radii along the basis axes).
static func _ell(c: Dictionary, cls: String, xf: Transform3D, centre: Vector3, radii: Vector3, n: int = 12, rings: int = 7, rot: Basis = Basis()) -> void:
	var prof := PackedVector2Array()
	for i in rings + 1:
		var t: float = PI * float(i) / float(rings)
		prof.append(Vector2(sin(t), -cos(t)))
	_lathe(c, cls, prof, n, xf * Transform3D(rot * Basis.from_scale(radii), centre), 60.0)


## A tapered capsule from a (radius r0) to b (radius r1).
static func _cap(c: Dictionary, cls: String, xf: Transform3D, a: Vector3, b: Vector3, r0: float, r1: float, n: int = 10) -> void:
	var l: float = a.distance_to(b)
	var prof := PackedVector2Array()
	for i in 4:
		var t: float = PI * 0.5 * float(i) / 3.0
		prof.append(Vector2(r0 * sin(t), -r0 * cos(t)))
	for i in 4:
		var t: float = PI * 0.5 * float(i) / 3.0
		prof.append(Vector2(r1 * cos(t), l + r1 * sin(t)))
	_lathe(c, cls, prof, n, xf * Transform3D(_basis_y(b - a), a), 60.0)


## A torus round the local y axis (ring radius rr, tube radius r).
static func _torus(c: Dictionary, cls: String, xf: Transform3D, rr: float, r: float, n: int = 20, m: int = 8) -> void:
	var prof := PackedVector2Array()
	for i in m + 1:
		var t: float = PI * 1.5 + TAU * float(i) / float(m)   # from the back (-y), round the outside first
		prof.append(Vector2(rr + r * cos(t), r * sin(t)))
	_lathe(c, cls, prof, n, xf, 60.0)


## A flat polygon (x, y in the local plane) extruded from z0 to z1 (front faces +z).
static func _extrude(c: Dictionary, cls: String, xf: Transform3D, pts: PackedVector2Array, z0: float, z1: float, col_k: float = 1.0) -> void:
	var st: SurfaceTool = _st(c, cls)
	var nb: Basis = xf.basis.inverse().transposed()
	var tri: PackedInt32Array = Geometry2D.triangulate_polygon(pts)
	for side: float in [1.0, -1.0]:
		var z: float = z1 if side > 0.0 else z0
		var nrm: Vector3 = (nb * Vector3(0, 0, side)).normalized()
		for k in range(0, tri.size(), 3):
			var pp: Array = []
			var cl: Array = []
			var uv: Array = []
			for i2 in 3:
				var q: Vector2 = pts[tri[k + i2]]
				var w: Vector3 = xf * Vector3(q.x, q.y, z)
				pp.append(w)
				uv.append(q)
				cl.append(_col(cls, nrm, col_k, w))
			_tri(st, pp, [nrm, nrm, nrm], uv, cl)
	var cw: bool = Geometry2D.is_polygon_clockwise(pts)
	for i in pts.size():
		var a: Vector2 = pts[i]
		var b: Vector2 = pts[(i + 1) % pts.size()]
		var d: Vector2 = b - a
		if d.length() < 1e-5:
			continue
		var n2: Vector2 = Vector2(d.y, -d.x).normalized() * (-1.0 if cw else 1.0)
		var nrm: Vector3 = (nb * Vector3(n2.x, n2.y, 0)).normalized()
		var q: Array = [xf * Vector3(a.x, a.y, z0), xf * Vector3(b.x, b.y, z0), xf * Vector3(b.x, b.y, z1), xf * Vector3(a.x, a.y, z1)]
		var cl: Color = _col(cls, nrm, col_k, q[0])
		var uv0 := Vector2.ZERO
		_tri(st, [q[0], q[1], q[2]], [nrm, nrm, nrm], [uv0, uv0, uv0], [cl, cl, cl])
		_tri(st, [q[0], q[2], q[3]], [nrm, nrm, nrm], [uv0, uv0, uv0], [cl, cl, cl])


## A flat disc facing +y in the local frame, UV 0..1 across it (pools, clock faces).
static func _disc(c: Dictionary, cls: String, xf: Transform3D, r: float, n: int = 24) -> void:
	var st: SurfaceTool = _st(c, cls)
	var nrm: Vector3 = (xf.basis.inverse().transposed() * Vector3.UP).normalized()
	var ctr: Vector3 = xf * Vector3.ZERO
	var col: Color = _col(cls, nrm, 1.0, ctr)
	for i in n:
		var a0: float = TAU * float(i) / float(n)
		var a1: float = TAU * float(i + 1) / float(n)
		var p0 := Vector2(cos(a0), sin(a0))
		var p1 := Vector2(cos(a1), sin(a1))
		_tri(st, [ctr, xf * Vector3(p0.x * r, 0, p0.y * r), xf * Vector3(p1.x * r, 0, p1.y * r)], [nrm, nrm, nrm],
			[Vector2(0.5, 0.5), Vector2(0.5 + p0.x * 0.5, 0.5 + p0.y * 0.5), Vector2(0.5 + p1.x * 0.5, 0.5 + p1.y * 0.5)], [col, col, col])


static func _yaw(deg: float, at: Vector3 = Vector3.ZERO) -> Transform3D:
	return Transform3D(Basis(Vector3.UP, deg_to_rad(deg)), at)


# ------------------------------------------------------------ the figure (statues, the column's top)

## A stylised standing figure 1.8 m tall at scale 1, feet at the origin, facing +z.
## v 0: coat, right arm raised. 1: long cloak, a sword at the side. 2: seated on a throne.
static func _figure(c: Dictionary, cls: String, xf: Transform3D, v: int) -> void:
	var seated: bool = v == 2
	var dy: float = -0.33 if seated else 0.0
	if not seated:
		for sx: float in [-1.0, 1.0]:
			if v != 1:
				_cap(c, cls, xf, Vector3(sx * 0.11, 0.1, 0.0), Vector3(sx * 0.1, 0.92, 0.0), 0.075, 0.095, 8)
			_ell(c, cls, xf, Vector3(sx * 0.11, 0.06, 0.06), Vector3(0.075, 0.06, 0.15), 8, 5)
	else:
		for sx: float in [-1.0, 1.0]:
			_cap(c, cls, xf, Vector3(sx * 0.11, 0.62, -0.02), Vector3(sx * 0.13, 0.64, 0.4), 0.1, 0.085, 8)
			_cap(c, cls, xf, Vector3(sx * 0.13, 0.62, 0.42), Vector3(sx * 0.13, 0.12, 0.47), 0.075, 0.065, 8)
			_ell(c, cls, xf, Vector3(sx * 0.13, 0.06, 0.55), Vector3(0.075, 0.06, 0.15), 8, 5)
		# the throne: a solid seat, a tall back, arm rests
		_box(c, cls, xf * Transform3D(Basis(), Vector3(0, 0, -0.02)), 0.36, 0.34, 0.0, 0.55, 0.04)
		_box(c, cls, xf * Transform3D(Basis(), Vector3(0, 0, -0.31)), 0.38, 0.07, 0.0, 1.18, 0.04)
		_ell(c, cls, xf, Vector3(0, 1.18, -0.31), Vector3(0.38, 0.08, 0.08), 8, 4)
		for sx: float in [-1.0, 1.0]:
			_box(c, cls, xf * Transform3D(Basis(), Vector3(sx * 0.36, 0, 0.0)), 0.05, 0.32, 0.55, 0.82, 0.02)
		# the coat's lap over the thighs
		_ell(c, cls, xf, Vector3(0, 0.66, 0.15), Vector3(0.26, 0.09, 0.3), 10, 5)
	if v == 0:
		_lathe(c, cls, PackedVector2Array([Vector2(0.27, 0.48), Vector2(0.25, 0.7), Vector2(0.21, 0.95), Vector2(0.18, 1.02)]), 14,
			xf * Transform3D(Basis.from_scale(Vector3(1, 1, 0.78)), Vector3.ZERO))
	elif v == 1:
		var folds := func(a: float) -> float: return 1.0 + 0.07 * cos(a * 9.0)
		_sweep(c, cls, _sec(_ring(36, folds), true), PackedVector2Array([Vector2(0.0, 0.03), Vector2(0.43, 0.03), Vector2(0.41, 0.35),
			Vector2(0.35, 0.85), Vector2(0.29, 1.25), Vector2(0.27, 1.4), Vector2(0.14, 1.5)]),
			xf * Transform3D(Basis.from_scale(Vector3(1, 1, 0.8)), Vector3(0, 0, -0.03)), 40.0)
	# torso, shoulders, neck, head
	_lathe(c, cls, PackedVector2Array([Vector2(0.19, 0.9 + dy), Vector2(0.17, 1.02 + dy), Vector2(0.2, 1.2 + dy),
		Vector2(0.22, 1.33 + dy), Vector2(0.2, 1.43 + dy), Vector2(0.07, 1.5 + dy)]), 12,
		xf * Transform3D(Basis.from_scale(Vector3(1, 1, 0.64)), Vector3.ZERO), 45.0)
	_ell(c, cls, xf, Vector3(0, 1.42 + dy, 0), Vector3(0.26, 0.075, 0.12), 10, 5)
	_cap(c, cls, xf, Vector3(0, 1.46 + dy, 0), Vector3(0, 1.56 + dy, 0.01), 0.055, 0.05, 8)
	_ell(c, cls, xf, Vector3(0, 1.665 + dy, 0.01), Vector3(0.095, 0.115, 0.105), 10, 7)
	if v == 0:   # a bicorne hat
		_ell(c, cls, xf, Vector3(0, 1.77 + dy, -0.005), Vector3(0.17, 0.05, 0.075), 10, 5)
	else:        # hair
		_ell(c, cls, xf, Vector3(0, 1.71 + dy, -0.015), Vector3(0.1, 0.08, 0.1), 10, 5)
	# arms: shoulder, elbow, hand
	var arms: Array = []
	match v:
		0:
			arms = [[Vector3(-0.24, 1.4, 0), Vector3(-0.29, 1.13, 0.02), Vector3(-0.29, 0.88, 0.07)],
				[Vector3(0.24, 1.4, 0), Vector3(0.37, 1.6, 0.07), Vector3(0.45, 1.86, 0.11)]]
		1:
			arms = [[Vector3(-0.24, 1.4, 0), Vector3(-0.31, 1.12, 0.05), Vector3(-0.27, 0.92, 0.12)],
				[Vector3(0.24, 1.4, 0), Vector3(0.3, 1.15, 0.12), Vector3(0.06, 1.24, 0.21)]]
			# the sword, point down at the left side
			_cap(c, cls, xf, Vector3(-0.27, 0.95, 0.13), Vector3(-0.23, 0.12, 0.22), 0.022, 0.018, 6)
			_box(c, cls, xf * Transform3D(Basis(), Vector3(-0.268, 0, 0.14)), 0.09, 0.02, 0.86, 0.9, 0.005)
		_:
			arms = [[Vector3(-0.24, 1.07, 0), Vector3(-0.32, 0.86, 0.06), Vector3(-0.35, 0.86, 0.3)],
				[Vector3(0.24, 1.07, 0), Vector3(0.32, 0.86, 0.06), Vector3(0.35, 0.86, 0.3)]]
	for arm: Array in arms:
		var s: Vector3 = arm[0] + Vector3(0, dy if v != 2 else 0.0, 0)
		var e: Vector3 = arm[1]
		var h: Vector3 = arm[2]
		_cap(c, cls, xf, s, e, 0.068, 0.056, 8)
		_cap(c, cls, xf, e, h, 0.056, 0.045, 8)
		_ell(c, cls, xf, h + (h - e).normalized() * 0.05, Vector3(0.05, 0.06, 0.05), 8, 5)


# ------------------------------------------------------------ the kinds

## Nelson's Column: a stepped granite base, a moulded pedestal with bronze relief panels, a fluted
## shaft on a moulded base, a bronze Corinthian capital, a drum and a figure on top.
static func _column(c: Dictionary) -> void:
	var id := Transform3D.IDENTITY
	_box(c, "granite", id, 8.0, 8.0, 0.0, 0.6, 0.08)
	_box(c, "granite", id, 7.2, 7.2, 0.6, 1.2, 0.08)
	_box(c, "granite", id, 6.4, 6.4, 1.2, 1.8, 0.08)
	_block(c, "granite", PackedVector2Array([Vector2(0, 1.8), Vector2(5.2, 1.8), Vector2(5.2, 2.3), Vector2(4.95, 2.45),
		Vector2(4.65, 2.6), Vector2(4.65, 2.75), Vector2(4.35, 2.85), Vector2(4.35, 8.6), Vector2(4.55, 8.75), Vector2(4.65, 8.9),
		Vector2(5.05, 9.3), Vector2(5.15, 9.7), Vector2(5.15, 10.0), Vector2(4.85, 10.2), Vector2(0, 10.2)]), 1.0, 0.05)
	# the bronze reliefs: a framed panel on each face with a scene of figures in low relief
	for f in 4:
		var xf: Transform3D = _yaw(90.0 * f)
		_box(c, "bronze", xf * Transform3D(Basis(), Vector3(0, 0, 4.42)), 3.1, 0.07, 3.5, 8.0, 0.05)
		for k in 5:
			var x: float = -2.2 + 1.1 * k
			var lean: float = 0.12 * float((k * 7) % 3 - 1)
			_ell(c, "bronze", xf, Vector3(x, 5.2, 4.5), Vector3(0.32, 1.0, 0.09), 6, 4, Basis(Vector3.BACK, lean))
			_ell(c, "bronze", xf, Vector3(x - lean * 1.2, 6.45, 4.5), Vector3(0.2, 0.22, 0.09), 6, 4)
		_box(c, "bronze", xf * Transform3D(Basis(), Vector3(0, 0, 4.47)), 2.9, 0.05, 3.75, 4.1, 0.02)
	# the shaft's base mouldings (torus and scotia), the fluted shaft with a little entasis
	_lathe(c, "stone", PackedVector2Array([Vector2(2.75, 10.2), Vector2(2.75, 10.45), Vector2(2.85, 10.6), Vector2(2.75, 10.78),
		Vector2(2.5, 10.85), Vector2(2.42, 11.0), Vector2(2.55, 11.15), Vector2(2.4, 11.32), Vector2(2.15, 11.4), Vector2(2.1, 11.6)]), 40)
	var flutes := func(a: float) -> float:
		var f: float = fposmod(a / (TAU / 20.0), 1.0)
		return 1.0 - 0.05 * sin(clampf((f - 0.1) / 0.8, 0.0, 1.0) * PI)
	_sweep(c, "stone", _sec(_ring(100, flutes), true), PackedVector2Array([Vector2(2.08, 11.6), Vector2(2.05, 22.0),
		Vector2(1.92, 32.0), Vector2(1.8, 40.0)]), id, 20.0)
	# the bronze capital: an astragal, the bell with its acanthus lobes, the abacus
	_lathe(c, "bronze", PackedVector2Array([Vector2(1.8, 40.0), Vector2(1.95, 40.1), Vector2(1.95, 40.28), Vector2(1.8, 40.38)]), 32)
	var lobes := func(a: float) -> float: return 1.0 + 0.09 * pow(absf(cos(a * 4.0)), 0.6)
	_sweep(c, "bronze", _sec(_ring(64, lobes), true), PackedVector2Array([Vector2(1.78, 40.38), Vector2(1.86, 41.0),
		Vector2(2.08, 41.9), Vector2(2.45, 42.75), Vector2(2.78, 43.3), Vector2(2.8, 43.48)]), id, 40.0)
	for f in 8:   # the volutes: curls under the abacus's corners
		var a: float = TAU * (f + 0.5) / 8.0
		_ell(c, "bronze", id, Vector3(cos(a) * 2.75, 43.1, sin(a) * 2.75), Vector3(0.32, 0.36, 0.32), 8, 5)
	_block(c, "bronze", PackedVector2Array([Vector2(0, 43.45), Vector2(3.05, 43.45), Vector2(3.2, 43.62), Vector2(3.2, 44.2),
		Vector2(3.05, 44.38), Vector2(0, 44.38)]), 1.0, 0.3)
	# the drum and the figure (stone, in a coat with a sword)
	_lathe(c, "stone", PackedVector2Array([Vector2(1.65, 44.38), Vector2(1.65, 44.65), Vector2(1.42, 44.8), Vector2(1.32, 45.55),
		Vector2(1.48, 45.72), Vector2(1.52, 46.0), Vector2(0, 46.0)]), 24)
	_figure(c, "stone", Transform3D(Basis.from_scale(Vector3.ONE * 2.2), Vector3(0, 46.0, 0)), 1)


static func _obelisk(c: Dictionary) -> void:
	var id := Transform3D.IDENTITY
	_box(c, "stone", id, 3.2, 3.2, 0.0, 0.35, 0.05)
	_box(c, "stone", id, 2.65, 2.65, 0.35, 0.7, 0.05)
	_box(c, "stone", id, 2.1, 2.1, 0.7, 1.05, 0.05)
	_block(c, "granite", PackedVector2Array([Vector2(0, 1.05), Vector2(1.75, 1.05), Vector2(1.75, 1.3), Vector2(1.55, 1.45),
		Vector2(1.5, 1.6), Vector2(1.5, 3.05), Vector2(1.62, 3.15), Vector2(1.75, 3.35), Vector2(1.75, 3.5), Vector2(1.5, 3.6), Vector2(0, 3.6)]), 1.0, 0.04)
	# a bronze plaque on the front of the die
	_box(c, "bronze", Transform3D(Basis(), Vector3(0, 0, 1.52)), 0.85, 0.04, 1.9, 2.85, 0.03)
	# the shaft tapers to the pyramidion
	_block(c, "granite", PackedVector2Array([Vector2(0, 3.6), Vector2(1.1, 3.6), Vector2(1.1, 3.75), Vector2(1.05, 3.8),
		Vector2(0.72, 18.6), Vector2(0.0, 20.0)]), 1.0, 0.03)


## A figure on a moulded plinth (5.5 m in all); variant 0, 1, 2 as _figure.
static func _statue(c: Dictionary, v: int) -> void:
	_block(c, "granite", PackedVector2Array([Vector2(0, 0), Vector2(1.05, 0), Vector2(1.05, 0.25), Vector2(0.95, 0.35),
		Vector2(0.85, 0.45), Vector2(0.85, 2.15), Vector2(0.95, 2.25), Vector2(1.05, 2.42), Vector2(1.05, 2.6), Vector2(0, 2.6)]), 1.0, 0.03)
	_box(c, "bronze", Transform3D(Basis(), Vector3(0, 0, 0.87)), 0.45, 0.03, 1.0, 1.6, 0.02)   # the name plaque
	var v2: int = clampi(v, 0, 2)
	if v2 == 2:
		_figure(c, "bronze", Transform3D(Basis.from_scale(Vector3.ONE * 1.8), Vector3(0, 2.6, -0.2)), 2)
	else:
		_figure(c, "bronze", Transform3D(Basis.from_scale(Vector3.ONE * 1.61), Vector3(0, 2.6, 0)), v2)


## A Landseer lion, couchant: lying with its forelegs stretched forward, head up, mane, tail round.
static func _lion(c: Dictionary, xf: Transform3D) -> void:
	var b := "bronze"
	_ell(c, b, xf, Vector3(0, 0.98, -0.55), Vector3(0.92, 0.82, 1.85), 14, 8)          # body
	_ell(c, b, xf, Vector3(0, 1.28, 0.75), Vector3(0.88, 1.0, 0.85), 14, 8)            # chest
	for sx: float in [-1.0, 1.0]:
		_ell(c, b, xf, Vector3(sx * 0.6, 0.85, -1.6), Vector3(0.5, 0.78, 0.95), 12, 7)  # haunch
		_ell(c, b, xf, Vector3(sx * 0.88, 0.2, -0.95), Vector3(0.26, 0.2, 0.62), 10, 5)  # hind paw
		_cap(c, b, xf, Vector3(sx * 0.55, 0.62, 0.95), Vector3(sx * 0.55, 0.3, 2.35), 0.3, 0.25, 10)   # foreleg
		_ell(c, b, xf, Vector3(sx * 0.55, 0.21, 2.62), Vector3(0.3, 0.21, 0.4), 10, 5)   # fore paw
	_ell(c, b, xf, Vector3(0, 1.92, 1.05), Vector3(0.98, 1.05, 0.95), 14, 8)           # mane
	_ell(c, b, xf, Vector3(0, 1.45, 1.3), Vector3(0.86, 0.85, 0.72), 12, 7)            # mane over the chest
	_ell(c, b, xf, Vector3(0, 2.32, 0.55), Vector3(0.7, 0.55, 0.8), 12, 6)             # mane over the shoulders
	_ell(c, b, xf, Vector3(0, 2.02, 1.82), Vector3(0.5, 0.52, 0.55), 12, 7)            # head
	_ell(c, b, xf, Vector3(0, 1.8, 2.3), Vector3(0.32, 0.27, 0.38), 10, 6)             # muzzle
	_ell(c, b, xf, Vector3(0, 1.6, 2.18), Vector3(0.28, 0.14, 0.3), 8, 5)              # jaw
	_ell(c, b, xf, Vector3(0, 1.95, 2.62), Vector3(0.13, 0.1, 0.09), 8, 4)             # nose
	_ell(c, b, xf, Vector3(0, 2.26, 2.1), Vector3(0.38, 0.11, 0.2), 8, 4)              # brow
	for sx: float in [-1.0, 1.0]:
		_ell(c, b, xf, Vector3(sx * 0.42, 2.42, 1.72), Vector3(0.13, 0.1, 0.08), 7, 4)  # ears
	_cap(c, b, xf, Vector3(0.5, 0.75, -2.3), Vector3(1.0, 0.25, -1.7), 0.11, 0.09, 6)   # tail
	_cap(c, b, xf, Vector3(1.0, 0.25, -1.7), Vector3(1.15, 0.16, -0.55), 0.09, 0.08, 6)
	_ell(c, b, xf, Vector3(1.16, 0.18, -0.42), Vector3(0.14, 0.12, 0.2), 7, 4)


## A tiered fountain: a wide moulded basin, a pedestal, an upper bowl, a small top bowl, a finial.
static func _fountain(c: Dictionary) -> void:
	var id := Transform3D.IDENTITY
	_lathe(c, "stone", PackedVector2Array([Vector2(5.1, 0.0), Vector2(5.1, 0.15), Vector2(5.0, 0.22), Vector2(5.0, 0.62),
		Vector2(5.2, 0.7), Vector2(5.22, 0.84), Vector2(5.1, 0.9), Vector2(4.82, 0.9), Vector2(4.75, 0.84), Vector2(4.75, 0.45), Vector2(0.0, 0.45)]), 48, id, 30.0)
	_disc(c, "water", Transform3D(Basis(), Vector3(0, 0.62, 0)), 4.76, 40)
	# the pedestal
	_lathe(c, "stone", PackedVector2Array([Vector2(1.05, 0.45), Vector2(1.05, 0.62), Vector2(0.85, 0.75), Vector2(0.62, 0.95),
		Vector2(0.5, 1.4), Vector2(0.44, 1.8), Vector2(0.55, 1.92), Vector2(0.4, 2.0)]), 24, id, 40.0)
	# the upper bowl: a curved underside, a rolled rim, its pool
	_lathe(c, "stone", PackedVector2Array([Vector2(0.4, 1.95), Vector2(0.9, 2.02), Vector2(1.4, 2.2), Vector2(1.75, 2.42),
		Vector2(1.92, 2.6), Vector2(1.95, 2.72), Vector2(1.85, 2.76), Vector2(1.74, 2.7), Vector2(1.74, 2.55), Vector2(0.0, 2.55)]), 32, id, 40.0)
	_disc(c, "water", Transform3D(Basis(), Vector3(0, 2.62, 0)), 1.74, 28)
	_lathe(c, "stone", PackedVector2Array([Vector2(0.28, 2.55), Vector2(0.24, 2.75), Vector2(0.18, 3.1), Vector2(0.25, 3.25)]), 16)
	_lathe(c, "stone", PackedVector2Array([Vector2(0.25, 3.22), Vector2(0.55, 3.3), Vector2(0.85, 3.48), Vector2(0.92, 3.62),
		Vector2(0.84, 3.66), Vector2(0.82, 3.55), Vector2(0.0, 3.55)]), 24, id, 40.0)
	_disc(c, "water", Transform3D(Basis(), Vector3(0, 3.58, 0)), 0.83, 20)
	# the finial: a stem, a ball, a spout
	_lathe(c, "stone", PackedVector2Array([Vector2(0.16, 3.55), Vector2(0.11, 3.85), Vector2(0.17, 3.95), Vector2(0.2, 4.1),
		Vector2(0.15, 4.25), Vector2(0.06, 4.35), Vector2(0.05, 4.5), Vector2(0.0, 4.5)]), 14, id, 40.0)
	# four small spouts on the basin rim, aimed in
	for f in 4:
		var xf: Transform3D = _yaw(90.0 * f)
		_ell(c, "bronze", xf, Vector3(0, 0.82, 4.92), Vector3(0.22, 0.2, 0.3), 8, 5)


## A cenotaph: three steps, a tall pylon (tapering, with entasis), a cornice, a tomb on top with a
## wreath on its front and back.
static func _memorial(c: Dictionary) -> void:
	var r: float = 0.62
	_block(c, "stone", PackedVector2Array([Vector2(0, 0), Vector2(3.0, 0), Vector2(3.0, 0.3), Vector2(2.7, 0.3), Vector2(2.7, 0.6),
		Vector2(2.4, 0.6), Vector2(2.4, 0.9), Vector2(0, 0.9)]), r, 0.02)
	_block(c, "stone", PackedVector2Array([Vector2(0, 0.9), Vector2(1.75, 0.9), Vector2(1.75, 1.15), Vector2(1.62, 1.3),
		Vector2(1.58, 4.0), Vector2(1.5, 6.6), Vector2(1.42, 8.1), Vector2(1.56, 8.3), Vector2(1.62, 8.55), Vector2(1.62, 8.7),
		Vector2(1.3, 8.8), Vector2(0, 8.8)]), r, 0.02)
	_block(c, "stone", PackedVector2Array([Vector2(0, 8.8), Vector2(1.15, 8.8), Vector2(1.15, 9.3), Vector2(1.05, 9.55),
		Vector2(0.7, 9.85), Vector2(0.0, 10.0)]), 0.7, 0.05)
	for f in 2:
		var xf: Transform3D = _yaw(180.0 * f)
		var tw := Transform3D(_basis_y(Vector3(0, 0, 1)), Vector3(0, 6.3, 1.48 * r * 0.95 + 0.06))
		_torus(c, "bronze", xf * tw, 0.55, 0.17, 20, 6)
		for k in 12:   # leaves round the wreath
			var a: float = TAU * float(k) / 12.0
			_ell(c, "bronze", xf * tw, Vector3(cos(a) * 0.55, 0.1, sin(a) * 0.55), Vector3(0.12, 0.08, 0.2), 6, 3, Basis(Vector3.UP, -a))
		_box(c, "bronze", xf * Transform3D(Basis(), Vector3(0, 0, 1.42 * r * 0.95 + 0.04)), 0.07, 0.04, 4.6, 5.8, 0.01)


## A clock tower: plinth, a shaft with string courses and slit windows, the clock stage with four
## faces, a cornice, an arched belfry, corner pinnacles and a pyramid spire.
static func _clock_tower(c: Dictionary) -> void:
	var id := Transform3D.IDENTITY
	_block(c, "stone", PackedVector2Array([Vector2(0, 0), Vector2(4.6, 0), Vector2(4.6, 1.3), Vector2(4.35, 1.5),
		Vector2(4.0, 1.6), Vector2(4.0, 24.0), Vector2(4.4, 24.3), Vector2(4.4, 30.0), Vector2(4.65, 30.2),
		Vector2(4.85, 30.55), Vector2(4.85, 30.9), Vector2(4.4, 31.0), Vector2(0, 31.0)]), 1.0, 0.12)
	for y: float in [7.0, 13.0, 19.0]:   # string courses
		_box(c, "stone", id, 4.18, 4.18, y, y + 0.45, 0.08)
	for f in 4:
		var xf: Transform3D = _yaw(90.0 * f)
		# slit windows, dark, in a stone surround
		for y2: float in [3.5, 9.5, 15.5, 20.5]:
			_box(c, "stone", xf * Transform3D(Basis(), Vector3(0, 0, 4.02)), 0.6, 0.06, y2, y2 + 2.6, 0.04)
			_extrude(c, "stone", xf, _arch_pts(0.38, y2 + 0.2, y2 + 2.4, 8), 4.06, 4.1, 0.25)
		# the clock: a stone surround, the face, bronze hands
		var tf := Transform3D(_basis_y(Vector3(0, 0, 1)), Vector3(0, 27.0, 4.4))
		_torus(c, "stone", xf * tf, 2.45, 0.2, 28, 6)
		_disc(c, "clock", xf * Transform3D(_basis_y(Vector3(0, 0, 1)), Vector3(0, 27.0, 4.48)), 2.3, 32)
		_box(c, "bronze", xf * Transform3D(Basis(Vector3.BACK, deg_to_rad(-60.0)), Vector3(0, 27.0, 4.52)), 0.09, 0.03, -0.1, 1.5, 0.01)
		_box(c, "bronze", xf * Transform3D(Basis(Vector3.BACK, deg_to_rad(150.0)), Vector3(0, 27.0, 4.55)), 0.07, 0.03, -0.1, 2.0, 0.01)
		_ell(c, "bronze", xf, Vector3(0, 27.0, 4.58), Vector3(0.14, 0.14, 0.05), 8, 4)
		# the belfry: a dark core behind, the open arch as a pierced wall with a moulded arch
		_extrude(c, "stone", xf, _spandrel_pts(3.55, 2.55, 31.0, 32.8, 35.6), 3.0, 3.6)
		_extrude(c, "stone", xf, _arch_ring_pts(2.55, 2.8, 32.8, 10), 3.6, 3.75)
		_box(c, "stone", xf * Transform3D(Basis(), Vector3(0, 0, 3.45)), 2.4, 0.06, 31.0, 31.9, 0.03)   # the balustrade
	_dim = 0.22
	_box(c, "stone", id, 2.8, 2.8, 31.0, 35.6, 0.02)    # the dark bell chamber (reads as the void)
	_dim = 1.0
	# corner piers
	for sx: float in [-1.0, 1.0]:
		for sz: float in [-1.0, 1.0]:
			_box(c, "stone", Transform3D(Basis(), Vector3(sx * 3.4, 0, sz * 3.4)), 0.55, 0.55, 31.0, 35.6, 0.06)
	_block(c, "stone", PackedVector2Array([Vector2(0, 35.6), Vector2(4.0, 35.6), Vector2(4.25, 35.8), Vector2(4.5, 36.1),
		Vector2(4.5, 36.35), Vector2(0, 36.35)]), 1.0, 0.1)
	# pinnacles on the corners, the spire, the finial
	for sx: float in [-1.0, 1.0]:
		for sz: float in [-1.0, 1.0]:
			_block(c, "stone", PackedVector2Array([Vector2(0, 36.35), Vector2(0.42, 36.35), Vector2(0.42, 37.1), Vector2(0.0, 38.6)]),
				1.0, 0.05, Transform3D(Basis(), Vector3(sx * 3.85, 0, sz * 3.85)))
	_block(c, "granite", PackedVector2Array([Vector2(0, 36.35), Vector2(3.4, 36.35), Vector2(3.4, 36.6), Vector2(0.18, 39.4),
		Vector2(0, 39.45)]), 1.0, 0.08)
	_lathe(c, "bronze", PackedVector2Array([Vector2(0.14, 39.3), Vector2(0.1, 39.6), Vector2(0.2, 39.7), Vector2(0.16, 39.82),
		Vector2(0.04, 39.9), Vector2(0.03, 40.0), Vector2(0, 40.0)]), 10)


## A round-headed arch opening (lancet) as a flat polygon: half width w, from y0 to the top y1.
static func _arch_pts(w: float, y0: float, y1: float, n: int) -> PackedVector2Array:
	var p := PackedVector2Array([Vector2(w, y0)])
	var yc: float = y1 - w
	for i in n + 1:
		var a: float = PI * float(i) / float(n)
		p.append(Vector2(cos(a) * w, yc + sin(a) * w))
	p.append(Vector2(-w, y0))
	return p


## The belfry's pierced wall: the face (half width hw) from y0 to y2 with an arched opening (half
## width aw, springing at y1) cut out, as one polygon: the opening is open at the bottom.
static func _spandrel_pts(hw: float, aw: float, y0: float, y1: float, y2: float) -> PackedVector2Array:
	var p := PackedVector2Array([Vector2(-hw, y0), Vector2(-aw, y0), Vector2(-aw, y1)])
	var n: int = 12
	for i in range(1, n):
		var a: float = PI - PI * float(i) / float(n)
		p.append(Vector2(cos(a) * aw, y1 + sin(a) * aw))
	p.append_array(PackedVector2Array([Vector2(aw, y1), Vector2(aw, y0), Vector2(hw, y0), Vector2(hw, y2), Vector2(-hw, y2)]))
	return p


## The arch's moulding: a half ring from radius r0 to r1 round (0, yc).
static func _arch_ring_pts(r0: float, r1: float, yc: float, n: int) -> PackedVector2Array:
	var p := PackedVector2Array()
	for i in n + 1:
		var a: float = PI * float(i) / float(n)
		p.append(Vector2(cos(a) * r1, yc + sin(a) * r1))
	for i in n + 1:
		var a: float = PI - PI * float(i) / float(n)
		p.append(Vector2(cos(a) * r0, yc + sin(a) * r0))
	return p


# ------------------------------------------------------------ day1-world: generic arch, dome, spire, bridge

## A triumphal arch / gate: 17 m wide, 6 m deep, 16 m tall; one big arch, two small side arches, columns
## on the front and back, a cornice and an attic with a bronze figure on top.
static func _arch(c: Dictionary) -> void:
	var id := Transform3D.IDENTITY
	for side: float in [1.0, -1.0]:
		var xf: Transform3D = _yaw(0.0 if side > 0.0 else 180.0)
		# the pierced front: the main arch and the two side arches, as one polygon open at the bottom
		var front := PackedVector2Array([Vector2(-8.5, 0.0), Vector2(-6.6, 0.0), Vector2(-6.6, 4.6)])
		for i in range(1, 8):
			var a: float = PI - PI * float(i) / 8.0
			front.append(Vector2(-5.4 + cos(a) * 1.2, 4.6 + sin(a) * 1.2))
		front.append_array(PackedVector2Array([Vector2(-4.2, 4.6), Vector2(-4.2, 0.0), Vector2(-3.0, 0.0), Vector2(-3.0, 7.0)]))
		for i in range(1, 12):
			var a: float = PI - PI * float(i) / 12.0
			front.append(Vector2(cos(a) * 3.0, 7.0 + sin(a) * 3.0))
		front.append_array(PackedVector2Array([Vector2(3.0, 7.0), Vector2(3.0, 0.0), Vector2(4.2, 0.0), Vector2(4.2, 4.6)]))
		for i in range(1, 8):
			var a: float = PI - PI * float(i) / 8.0
			front.append(Vector2(5.4 + cos(a) * 1.2, 4.6 + sin(a) * 1.2))
		front.append_array(PackedVector2Array([Vector2(6.6, 4.6), Vector2(6.6, 0.0), Vector2(8.5, 0.0), Vector2(8.5, 12.0), Vector2(-8.5, 12.0)]))
		_extrude(c, "stone", xf, front, 2.2, 3.0)
		for x: float in [-7.6, -3.6, 3.6, 7.6]:   # columns on pedestals
			_box(c, "stone", xf * Transform3D(Basis(), Vector3(x, 0, 3.4)), 0.55, 0.55, 0.0, 2.2, 0.05)
			_lathe(c, "stone", PackedVector2Array([Vector2(0.42, 2.2), Vector2(0.4, 9.8), Vector2(0.55, 10.2), Vector2(0.55, 10.6)]), 12,
				xf * Transform3D(Basis(), Vector3(x, 0, 3.4)))
	# the passages' inner walls (they read dark)
	_dim = 0.55
	for x: float in [-7.55, -4.8, 4.8, 7.55]:
		_box(c, "stone", Transform3D(Basis(), Vector3(x, 0, 0)), 0.95 if absf(x) > 6.0 else 0.6, 2.25, 0.0, 12.0, 0.02)
	_box(c, "stone", id, 8.4, 2.25, 10.0, 12.0, 0.02)
	_dim = 1.0
	_block(c, "stone", PackedVector2Array([Vector2(0, 12.0), Vector2(8.9, 12.0), Vector2(9.1, 12.4), Vector2(9.1, 12.8),
		Vector2(8.6, 13.0), Vector2(8.6, 15.4), Vector2(8.8, 15.6), Vector2(8.8, 16.0), Vector2(0, 16.0)]), 3.6 / 8.9, 0.05)
	_box(c, "bronze", Transform3D(Basis(), Vector3(0, 0, 3.75)), 4.0, 0.06, 13.3, 15.1, 0.03)
	_figure(c, "bronze", Transform3D(Basis.from_scale(Vector3.ONE * 2.2), Vector3(0, 16.0, 0)), 0)


## A dome on a drum (a church or civic dome): a square base, the colonnaded drum, a lead dome with stone
## ribs, a lantern.
static func _dome(c: Dictionary) -> void:
	var id := Transform3D.IDENTITY
	_block(c, "stone", PackedVector2Array([Vector2(0, 0), Vector2(9.5, 0), Vector2(9.5, 9.0), Vector2(9.8, 9.3), Vector2(9.8, 9.8), Vector2(0, 9.8)]), 1.0, 0.2)
	_lathe(c, "stone", PackedVector2Array([Vector2(7.0, 9.8), Vector2(7.0, 15.0), Vector2(7.6, 15.3), Vector2(7.6, 15.8), Vector2(6.9, 16.0)]), 40)
	for k in 16:   # the drum's columns
		var a: float = TAU * float(k) / 16.0
		_cap(c, "stone", id, Vector3(cos(a) * 7.35, 9.8, sin(a) * 7.35), Vector3(cos(a) * 7.35, 15.0, sin(a) * 7.35), 0.32, 0.3, 8)
	var dome := PackedVector2Array()
	for i in 9:
		var t: float = PI * 0.5 * float(i) / 8.0
		dome.append(Vector2(6.9 * cos(t), 16.0 + 7.0 * sin(t)))
	_lathe(c, "slate", dome, 40)
	for k in 12:   # ribs
		var a: float = TAU * float(k) / 12.0
		for i in 7:
			var t0: float = PI * 0.5 * float(i) / 8.0
			var t1: float = PI * 0.5 * float(i + 1) / 8.0
			_cap(c, "stone", id, Vector3(cos(a) * 6.95 * cos(t0), 16.0 + 7.05 * sin(t0), sin(a) * 6.95 * cos(t0)),
				Vector3(cos(a) * 6.95 * cos(t1), 16.0 + 7.05 * sin(t1), sin(a) * 6.95 * cos(t1)), 0.16, 0.16, 5)
	_lathe(c, "stone", PackedVector2Array([Vector2(1.3, 22.8), Vector2(1.3, 24.4), Vector2(1.5, 24.6), Vector2(0.9, 25.0), Vector2(0, 25.0)]), 12)
	_lathe(c, "gilt", PackedVector2Array([Vector2(0.18, 25.0), Vector2(0.3, 25.4), Vector2(0.0, 26.0)]), 8)


## A church spire: a square tower with arched belfry openings, corner pinnacles, an octagonal spire.
static func _spire(c: Dictionary) -> void:
	_block(c, "stone", PackedVector2Array([Vector2(0, 0), Vector2(4.2, 0), Vector2(4.2, 1.0), Vector2(3.8, 1.3), Vector2(3.8, 18.0),
		Vector2(4.1, 18.3), Vector2(4.1, 18.8), Vector2(0, 18.8)]), 1.0, 0.1)
	for f in 4:
		var xf: Transform3D = _yaw(90.0 * f)
		_dim = 0.3
		_extrude(c, "stone", xf, _arch_pts(0.8, 12.5, 16.8, 8), 3.78, 3.84)
		_extrude(c, "stone", xf, _arch_pts(0.5, 4.0, 7.0, 6), 3.78, 3.84)
		_dim = 1.0
	for sx: float in [-1.0, 1.0]:
		for sz: float in [-1.0, 1.0]:
			_block(c, "stone", PackedVector2Array([Vector2(0, 18.8), Vector2(0.45, 18.8), Vector2(0.45, 20.0), Vector2(0, 22.6)]),
				1.0, 0.04, Transform3D(Basis(), Vector3(sx * 3.7, 0, sz * 3.7)))
	_sweep(c, "slate", _sec(_ring(8), false), PackedVector2Array([Vector2(3.4, 18.8), Vector2(3.2, 19.6), Vector2(0.25, 44.6), Vector2(0.0, 45.0)]),
		Transform3D(Basis(Vector3.UP, PI / 8.0), Vector3.ZERO), 10.0)
	_lathe(c, "gilt", PackedVector2Array([Vector2(0.12, 44.7), Vector2(0.18, 45.2), Vector2(0.05, 45.6), Vector2(0.0, 46.0)]), 8)


## A bridge span `length` m along +z, `width` m wide, centred on the origin, over the place's flat water:
## the deck's edge, parapets with a coping and a pier refuge (a bump-out with a lamp standard) every
## ~22 m. Built per bridge (its length varies), not cached.
static func bridge(length: float, width: float) -> ArrayMesh:
	var c: Dictionary = {}
	var hl: float = length * 0.5
	var hw: float = width * 0.5
	_box(c, "stone", Transform3D.IDENTITY, hw + 0.45, hl, -0.6, 0.0, 0.06)
	var n: int = maxi(1, int(round(length / 22.0)))
	var span: float = length / n
	for sx: float in [-1.0, 1.0]:
		var side := Transform3D(Basis(), Vector3(sx * (hw + 0.15), 0, 0))
		_box(c, "stone", side, 0.28, hl, 0.0, 1.05, 0.05)   # parapet
		_box(c, "stone", side, 0.36, hl, 1.05, 1.2, 0.04)    # its coping
		for i in n + 1:
			var z: float = -hl + span * i
			var pier := Transform3D(Basis(), Vector3(sx * (hw + 0.7), 0, z))
			_box(c, "stone", pier, 0.85, 1.4, -0.6, 1.3, 0.08)
			_cap(c, "slate", Transform3D.IDENTITY, Vector3(sx * (hw + 0.7), 1.3, z), Vector3(sx * (hw + 0.7), 5.2, z), 0.11, 0.08, 6)
			_ell(c, "glow", Transform3D.IDENTITY, Vector3(sx * (hw + 0.7), 5.45, z), Vector3(0.28, 0.36, 0.28), 8, 5)
	return _commit(c)
