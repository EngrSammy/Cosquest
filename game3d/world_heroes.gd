extends RefCounted
## day1-world (ART-DIRECTION 4.7): the hero landmarks, hand-built in code from the landmark kit's pieces
## (world_landmarks.gd), one bespoke mesh each:
##  - Elizabeth Tower ("Big Ben"), Westminster: the panelled shaft, the clock stage with four gilt-framed
##    dials, the belfry, the slate spire with gilt pinnacles, the orb and cross;
##  - the Times Square billboard canyon: a screen-clad tower at the square's south end (One Times Square's
##    massing) and screens on every wall that faces the street near by (place.gd), all made-up generic ads
##    and colour panels from art/world/misc/screens.png (tools/world/make_screens.py), no real brand;
##  - Hoover Tower, Stanford: the buff shaft with its window strips, the arcaded observation stage, the
##    red-tile square dome and its lantern;
##  - the National Arts Theatre, Lagos: the round "military cap": a podium, the drum, the flared brim, the
##    ribbed crown.
## They are found (find) by an OSM landmark's or building's name or Wikidata id when the ground carries
## them, else by their real position from the ground's origin; the OSM footprint under one is not
## extruded (or kept low, as the annex round Hoover Tower). Real metres, origin at the base centre, +y
## up, front +z (place.gd turns the front towards the fight).

const L := preload("res://world_landmarks.gd")

## id, names / wikidata to match, real position, size (h, r), the footprint radius that is replaced,
## the height an oversized footprint under it is cut to (an annex), the landmark weight for the camera.
const HEROES: Array[Dictionary] = [
	{"id": "big_ben", "title": "Elizabeth Tower", "names": ["Elizabeth Tower", "Big Ben"], "wikidata": ["Q41225", "Q37733713"],
		"lat": 51.50073, "lng": -0.12463, "h": 96.0, "r": 7.0, "fp": 14.0, "annex_h": 0.0},
	{"id": "times_square", "title": "Times Square", "names": ["One Times Square"], "wikidata": ["Q1139633"],
		"lat": 40.75636, "lng": -73.98657, "h": 111.0, "r": 12.0, "fp": 18.0, "annex_h": 0.0, "canyon": 150.0},
	{"id": "hoover_tower", "title": "Hoover Tower", "names": ["Hoover Tower"], "wikidata": ["Q5898829"],
		"lat": 37.42746, "lng": -122.16682, "h": 87.0, "r": 8.5, "fp": 12.0, "annex_h": 11.0},
	{"id": "national_theatre", "title": "National Arts Theatre", "names": ["National Arts Theatre", "National Theatre"], "wikidata": ["Q6970499"],
		"lat": 6.47648, "lng": 3.36948, "h": 31.0, "r": 55.0, "fp": 30.0, "annex_h": 0.0},
]


## The heroes this ground has: [{id, x, z, h, r, fp, annex_h, name, canyon?}] in the ground's metres.
static func find(ground: Dictionary, _at: Vector2) -> Array:
	var o: Dictionary = ground.get("origin", {})
	var out: Array = []
	for hv: Dictionary in HEROES:
		var pos: Variant = null
		# 1. by name or Wikidata id on a landmark or a building (when the ground carries them)
		for key: String in ["landmarks", "buildings"]:
			for e: Variant in ground.get(key, []):
				var d: Dictionary = e
				var nm: String = str(d.get("name", ""))
				var wd: String = str(d.get("wikidata", ""))
				if (nm != "" and nm in hv["names"]) or (wd != "" and wd in hv["wikidata"]):
					if d.has("x"):
						pos = Vector2(float(d["x"]), float(d["z"]))
					elif d.has("p"):
						pos = _centre(d["p"])
					break
			if pos != null:
				break
		# 2. by where it really is (ground.py _to_metres: x east, z north from the origin)
		if pos == null and o.has("lat"):
			var olat: float = float(o["lat"])
			var p2 := Vector2((float(hv["lng"]) - float(o["lng"])) * 111320.0 * cos(deg_to_rad(olat)),
				(float(hv["lat"]) - olat) * 111320.0)
			if p2.length() < float(ground.get("radius_m", 300.0)) * 1.2:
				pos = p2
		if pos == null:
			continue
		var h: Dictionary = hv.duplicate()
		var c: Vector2 = pos
		# snap to the OSM footprint under it (its centre and its walls' heading)
		var fpb: Dictionary = _footprint(ground, c, float(hv["fp"]))
		if not fpb.is_empty():
			c = fpb["c"]
			h["heading"] = fpb["heading"]
			if hv["id"] == "national_theatre":
				h["r"] = clampf(float(fpb["r"]) * 0.5, 36.0, 52.0)
		h["x"] = c.x
		h["z"] = c.y
		h["name"] = hv["title"]
		out.append(h)
	return out


static func _centre(raw: Array) -> Vector2:
	var c := Vector2.ZERO
	var n: int = 0
	for q: Variant in raw:
		c += Vector2(float(q[0]), float(q[1]))
		n += 1
	return c / maxf(1.0, n)


## The building footprint whose centre is nearest `c` (within `rad`): its centre, radius and the heading
## of its longest wall (radians, in the ground's x/z).
static func _footprint(ground: Dictionary, c: Vector2, rad: float) -> Dictionary:
	var best: Dictionary = {}
	var best_d: float = rad
	for e: Variant in ground.get("buildings", []):
		var p: Array = (e as Dictionary)["p"]
		var cc: Vector2 = _centre(p)
		var d: float = cc.distance_to(c)
		if d < best_d:
			best_d = d
			var r: float = 0.0
			var longest: float = 0.0
			var hd: float = 0.0
			for i in p.size() - 1:
				var a := Vector2(float(p[i][0]), float(p[i][1]))
				var b := Vector2(float(p[i + 1][0]), float(p[i + 1][1]))
				r = maxf(r, a.distance_to(cc))
				if a.distance_to(b) > longest:
					longest = a.distance_to(b)
					hd = (b - a).angle()
			best = {"c": cc, "r": r, "heading": hd}
	return best


## True when a building footprint (fight frame) is the one a hero stands on: its centre within fp.
static func covers(hero_pt: Vector2, fp: float, poly: PackedVector2Array) -> bool:
	var c := Vector2.ZERO
	for q: Vector2 in poly:
		c += q
	c /= maxf(1.0, poly.size())
	return c.distance_to(hero_pt) < fp or Geometry2D.is_point_in_polygon(hero_pt, poly)


static func build(id: String, r: float = 0.0) -> ArrayMesh:
	var c: Dictionary = {}
	match id:
		"big_ben":
			_big_ben(c)
		"times_square":
			_ts_tower(c)
		"hoover_tower":
			_hoover(c)
		"national_theatre":
			_theatre(c, r if r > 0.0 else 55.0)
		_:
			return ArrayMesh.new()
	return L._commit(c)


# ------------------------------------------------------------ Elizabeth Tower

const BB_HALF: float = 6.0


static func _big_ben(c: Dictionary) -> void:
	var id := Transform3D.IDENTITY
	L._hue = Color("#E6D9B8")    # Anston limestone, warm
	# the plinth and the shaft (a little batter at the foot)
	L._block(c, "render", PackedVector2Array([Vector2(0, 0), Vector2(6.7, 0), Vector2(6.7, 1.2), Vector2(6.4, 1.5),
		Vector2(6.3, 3.2), Vector2(6.05, 3.6), Vector2(BB_HALF, 3.8), Vector2(BB_HALF, 54.6), Vector2(0, 54.6)]), 1.0, 0.25)
	for f in 4:
		var xf: Transform3D = L._yaw(90.0 * f)
		# the Gothic panelling: dark window strips between stone mullions, transoms every storey
		L._hue = Color("#4A4E5C")
		for k in 4:
			var x: float = -4.05 + 2.7 * k
			L._box(c, "render", xf * Transform3D(Basis(), Vector3(x, 0, BB_HALF - 0.05)), 0.85, 0.08, 5.0, 53.2, 0.02)
		L._hue = Color("#EDE2C4")
		for k in 5:
			var x: float = -5.4 + 2.7 * k
			L._box(c, "render", xf * Transform3D(Basis(), Vector3(x, 0, BB_HALF + 0.05)), 0.22, 0.2, 4.2, 54.0, 0.04)
		var y: float = 8.2
		while y < 53.0:
			L._box(c, "render", xf * Transform3D(Basis(), Vector3(0, 0, BB_HALF + 0.03)), 5.6, 0.16, y, y + 0.35, 0.04)
			y += 4.4
		# corner buttresses
		L._box(c, "render", xf * Transform3D(Basis(), Vector3(BB_HALF - 0.3, 0, BB_HALF - 0.3)), 0.6, 0.6, 3.8, 54.6, 0.08)
	# the clock stage: wider, with the four dials in gilt square frames
	L._hue = Color("#E6D9B8")
	L._block(c, "render", PackedVector2Array([Vector2(0, 54.6), Vector2(6.3, 54.6), Vector2(6.75, 55.2), Vector2(6.75, 68.2),
		Vector2(7.05, 68.6), Vector2(7.05, 69.3), Vector2(0, 69.3)]), 1.0, 0.2)
	for f in 4:
		var xf: Transform3D = L._yaw(90.0 * f)
		var face := Transform3D(L._basis_y(Vector3(0, 0, 1)), Vector3(0, 61.6, 6.8))
		L._box(c, "gilt", xf * Transform3D(Basis(), Vector3(0, 0, 6.78)), 4.6, 0.1, 57.0, 66.2, 0.05)   # the gilt frame
		L._hue = Color("#E6D9B8")
		L._box(c, "render", xf * Transform3D(Basis(), Vector3(0, 0, 6.86)), 4.2, 0.06, 57.4, 65.8, 0.03)
		L._torus(c, "gilt", xf * Transform3D(L._basis_y(Vector3(0, 0, 1)), Vector3(0, 61.6, 6.95)), 3.55, 0.22, 32, 6)
		L._disc(c, "clock", xf * Transform3D(L._basis_y(Vector3(0, 0, 1)), Vector3(0, 61.6, 6.98)), 3.45, 36)
		L._box(c, "bronze", xf * Transform3D(Basis(Vector3.BACK, deg_to_rad(-40.0)), Vector3(0, 61.6, 7.04)), 0.14, 0.04, -0.2, 2.2, 0.01)
		L._box(c, "bronze", xf * Transform3D(Basis(Vector3.BACK, deg_to_rad(120.0)), Vector3(0, 61.6, 7.08)), 0.11, 0.04, -0.2, 3.0, 0.01)
		# gilt spandrels in the frame's corners
		for sx: float in [-1.0, 1.0]:
			for sy: float in [-1.0, 1.0]:
				L._ell(c, "gilt", xf, Vector3(sx * 3.75, 61.6 + sy * 3.75, 6.92), Vector3(0.55, 0.55, 0.08), 8, 3)
		# a gable over each dial
		L._extrude(c, "render", xf, PackedVector2Array([Vector2(-6.4, 69.3), Vector2(6.4, 69.3), Vector2(0, 72.6)]), 6.5, 7.0)
		L._hue = Color("#E6D9B8")
	# the belfry: a dark core behind pierced arcades, corner piers
	L._dim = 0.25
	L._box(c, "render", id, 4.9, 4.9, 69.3, 77.5, 0.02)
	L._dim = 1.0
	for f in 4:
		var xf: Transform3D = L._yaw(90.0 * f)
		for k in 3:
			var x: float = -3.3 + 3.3 * k
			L._extrude(c, "render", xf * Transform3D(Basis(), Vector3(x, 0, 0)), L._spandrel_pts(1.65, 1.1, 69.3, 74.6, 77.5), 5.25, 5.65)
		L._box(c, "render", xf * Transform3D(Basis(), Vector3(0, 0, 5.5)), 5.6, 0.22, 77.3, 78.1, 0.05)
	for sx: float in [-1.0, 1.0]:
		for sz: float in [-1.0, 1.0]:
			L._box(c, "render", Transform3D(Basis(), Vector3(sx * 5.3, 0, sz * 5.3)), 0.55, 0.55, 69.3, 78.1, 0.06)
			# pinnacles with gilt tips at the clock stage and the belfry
			L._block(c, "render", PackedVector2Array([Vector2(0, 69.3), Vector2(0.55, 69.3), Vector2(0.55, 71.6), Vector2(0, 74.8)]),
				1.0, 0.05, Transform3D(Basis(), Vector3(sx * 6.55, 0, sz * 6.55)))
			L._lathe(c, "gilt", PackedVector2Array([Vector2(0.12, 74.6), Vector2(0.18, 74.9), Vector2(0.0, 75.4)]), 6,
				Transform3D(Basis(), Vector3(sx * 6.55, 0, sz * 6.55)))
			L._block(c, "slate", PackedVector2Array([Vector2(0, 78.1), Vector2(0.75, 78.1), Vector2(0.75, 79.0), Vector2(0, 83.2)]),
				1.0, 0.05, Transform3D(Basis(), Vector3(sx * 4.9, 0, sz * 4.9)))
			L._lathe(c, "gilt", PackedVector2Array([Vector2(0.14, 83.0), Vector2(0.22, 83.4), Vector2(0.0, 84.2)]), 6,
				Transform3D(Basis(), Vector3(sx * 4.9, 0, sz * 4.9)))
	# the spire: slate and cast iron, gilt bands, the lantern, orb and cross
	L._block(c, "slate", PackedVector2Array([Vector2(0, 78.1), Vector2(5.6, 78.1), Vector2(5.6, 78.6), Vector2(4.6, 80.5),
		Vector2(2.1, 88.5), Vector2(1.2, 90.6), Vector2(0, 91.0)]), 1.0, 0.35)
	for y2: float in [80.6, 84.6, 88.4]:
		var w: float = 4.55 - (y2 - 80.5) * 0.3125
		L._box(c, "gilt", id, w + 0.06, w + 0.06, y2, y2 + 0.28, 0.03)
	for f in 4:   # little dormer windows (gilt) up the spire
		var xf: Transform3D = L._yaw(90.0 * f)
		L._extrude(c, "gilt", xf, PackedVector2Array([Vector2(-0.7, 81.4), Vector2(0.7, 81.4), Vector2(0.7, 83.0), Vector2(0, 84.0), Vector2(-0.7, 83.0)]), 3.9, 4.15)
	L._lathe(c, "gilt", PackedVector2Array([Vector2(0.7, 90.6), Vector2(0.75, 91.4), Vector2(0.35, 92.0), Vector2(0.18, 93.6),
		Vector2(0.0, 93.7)]), 10)
	L._ell(c, "gilt", id, Vector3(0, 94.2, 0), Vector3(0.5, 0.5, 0.5), 10, 6)
	L._box(c, "gilt", id, 0.08, 0.08, 94.5, 96.0, 0.01)
	L._box(c, "gilt", Transform3D(Basis(), Vector3(0, 0, 0)), 0.5, 0.08, 95.2, 95.4, 0.01)
	L._hue = Color(1, 1, 1)


# ------------------------------------------------------------ Times Square: the screen tower

## One Times Square's massing: a narrow tower (24 m x 14 m) clad in stacked screens on all sides from
## the street to ~95 m, a darker crown above. The screens' UVs pick cells of the screen atlas.
static func _ts_tower(c: Dictionary) -> void:
	var id := Transform3D.IDENTITY
	L._hue = Color("#8E9198")
	L._box(c, "render", id, 12.0, 7.0, 0.0, 111.0, 0.3)
	L._hue = Color("#5D6270")
	L._box(c, "render", id, 12.3, 7.3, 96.0, 104.0, 0.2)
	L._hue = Color(1, 1, 1)
	var cell: int = 0
	var rows: Array = [[6.0, 13.0], [13.4, 24.0], [24.4, 36.0], [36.4, 46.0], [46.4, 60.0], [60.4, 72.0], [72.4, 84.0], [84.4, 95.0]]
	for row: Array in rows:
		for f in 4:
			var xf: Transform3D = L._yaw(90.0 * f)
			var half_w: float = (12.0 if f % 2 == 0 else 7.0) + 0.25
			var depth: float = (7.0 if f % 2 == 0 else 12.0) + 0.3
			screen_quad(c, xf, Vector3(0, float(row[0]), depth), half_w * 2.0 - 0.6, float(row[1]) - float(row[0]), cell)
			cell += 1
	# the crown's mast
	L._box(c, "slate", id, 0.25, 0.25, 104.0, 111.0, 0.02)


## A screen: a flat quad facing +z in xf's frame, bottom centre at p, w x h metres, showing atlas cell
## `cell` of SCREEN_CELLS (4 x 4), with a dark bezel behind it.
const SCREEN_GRID: int = 4


static func screen_quad(c: Dictionary, xf: Transform3D, p: Vector3, w: float, h: float, cell: int) -> void:
	var st: SurfaceTool = L._st(c, "screen")
	var nb: Basis = xf.basis.inverse().transposed()
	var nrm: Vector3 = (nb * Vector3(0, 0, 1)).normalized()
	var k: int = posmod(cell * 7 + 3, SCREEN_GRID * SCREEN_GRID)
	var u0: float = float(k % SCREEN_GRID) / SCREEN_GRID
	var v0: float = float(floori(float(k) / SCREEN_GRID)) / SCREEN_GRID
	var du: float = 1.0 / SCREEN_GRID
	# a wide screen shows the cell once, cropped to its aspect (cells are square)
	var asp: float = w / maxf(0.1, h)
	var cu: float = du
	var cv: float = du
	if asp > 1.0:
		cv = du / asp
	else:
		cu = du * asp
	var ou: float = u0 + (du - cu) * 0.5
	var ov: float = v0 + (du - cv) * 0.5
	var q: Array = [xf * (p + Vector3(-w * 0.5, 0, 0)), xf * (p + Vector3(w * 0.5, 0, 0)), xf * (p + Vector3(w * 0.5, h, 0)), xf * (p + Vector3(-w * 0.5, h, 0))]
	var uv: Array = [Vector2(ou, ov + cv), Vector2(ou + cu, ov + cv), Vector2(ou + cu, ov), Vector2(ou, ov)]
	var col := Color(1, 1, 1)
	L._tri(st, [q[0], q[1], q[2]], [nrm, nrm, nrm], [uv[0], uv[1], uv[2]], [col, col, col])
	L._tri(st, [q[0], q[2], q[3]], [nrm, nrm, nrm], [uv[0], uv[2], uv[3]], [col, col, col])
	L._hue = Color("#2E3038")
	L._box(c, "render", xf * Transform3D(Basis(), p + Vector3(0, -0.25, -0.18)), w * 0.5 + 0.25, 0.15, 0.0, h + 0.5, 0.04)
	L._hue = Color(1, 1, 1)


# ------------------------------------------------------------ Hoover Tower

static func _hoover(c: Dictionary) -> void:
	var id := Transform3D.IDENTITY
	var buff := Color("#EEDDBB")
	L._hue = buff
	# the base block and the shaft
	L._block(c, "render", PackedVector2Array([Vector2(0, 0), Vector2(8.5, 0), Vector2(8.5, 10.5), Vector2(8.7, 10.8),
		Vector2(8.7, 11.3), Vector2(7.2, 11.6), Vector2(7.0, 11.6), Vector2(7.0, 62.0), Vector2(7.4, 62.3), Vector2(7.4, 62.8), Vector2(0, 62.8)]), 1.0, 0.2)
	for f in 4:
		var xf: Transform3D = L._yaw(90.0 * f)
		# the entrance arch on the base, window strips up the shaft (dark glass in buff reveals)
		L._hue = Color("#56607A")
		L._extrude(c, "render", xf, L._arch_pts(1.6, 0.0, 6.4, 8), 8.48, 8.56)
		for k in 3:
			var x: float = -3.2 + 3.2 * k
			L._box(c, "render", xf * Transform3D(Basis(), Vector3(x, 0, 6.95)), 0.36, 0.1, 14.0, 59.0, 0.02)
		L._hue = buff
		for k in 4:   # pilasters between the strips
			var x: float = -4.8 + 3.2 * k
			L._box(c, "render", xf * Transform3D(Basis(), Vector3(x, 0, 7.02)), 0.5, 0.12, 11.6, 62.0, 0.05)
		var y: float = 17.0
		while y < 59.0:   # spandrel bands between the floors' windows
			L._box(c, "render", xf * Transform3D(Basis(), Vector3(0, 0, 7.0)), 4.2, 0.08, y, y + 0.6, 0.02)
			y += 6.0
	# the observation stage: a dark core behind three arches a side, a balustrade, a cornice
	L._dim = 0.3
	L._box(c, "render", id, 6.4, 6.4, 62.8, 71.0, 0.02)
	L._dim = 1.0
	for f in 4:
		var xf: Transform3D = L._yaw(90.0 * f)
		for k in 3:
			var x: float = -4.4 + 4.4 * k
			L._extrude(c, "render", xf * Transform3D(Basis(), Vector3(x, 0, 0)), L._spandrel_pts(2.2, 1.35, 62.8, 67.4, 71.0), 6.9, 7.4)
		L._box(c, "render", xf * Transform3D(Basis(), Vector3(0, 0, 7.15)), 7.2, 0.25, 62.8, 63.9, 0.05)
	L._block(c, "render", PackedVector2Array([Vector2(0, 71.0), Vector2(7.4, 71.0), Vector2(7.8, 71.4), Vector2(7.8, 72.0),
		Vector2(7.1, 72.3), Vector2(0, 72.3)]), 1.0, 0.25)
	# the red-tile dome: square in plan, a bell curve up to the lantern
	L._hue = Color("#B4553A")
	L._block(c, "tile", PackedVector2Array([Vector2(0, 72.3), Vector2(6.9, 72.3), Vector2(6.6, 74.4), Vector2(5.8, 76.6),
		Vector2(4.4, 78.6), Vector2(2.7, 80.0), Vector2(1.6, 80.6), Vector2(0, 80.8)]), 1.0, 0.9)
	# the lantern: a little arcaded drum, its cap, the finial
	L._hue = buff
	L._lathe(c, "render", PackedVector2Array([Vector2(1.7, 80.4), Vector2(1.7, 82.6), Vector2(1.95, 82.8), Vector2(1.95, 83.1), Vector2(0, 83.1)]), 12)
	L._hue = Color("#B4553A")
	L._lathe(c, "tile", PackedVector2Array([Vector2(1.95, 83.1), Vector2(1.2, 84.4), Vector2(0.4, 85.3), Vector2(0, 85.4)]), 12)
	L._lathe(c, "gilt", PackedVector2Array([Vector2(0.12, 85.3), Vector2(0.2, 85.9), Vector2(0.06, 86.6), Vector2(0, 87.0)]), 8)
	L._hue = Color(1, 1, 1)


# ------------------------------------------------------------ the National Arts Theatre, Lagos

## The "military cap": a podium with steps, the glazed drum, the wide flared brim, the inward-sloping
## crown with its ribs, the roof. `r` the brim's radius (metres).
static func _theatre(c: Dictionary, r: float) -> void:
	var n: int = 72
	var id := Transform3D.IDENTITY
	var white := Color("#EEE6D6")
	L._hue = Color("#D8CFC0")
	L._lathe(c, "render", PackedVector2Array([Vector2(r * 1.04, 0.0), Vector2(r * 1.04, 0.5), Vector2(r * 1.0, 0.5),
		Vector2(r * 1.0, 1.0), Vector2(r * 0.96, 1.0), Vector2(r * 0.96, 1.5), Vector2(0, 1.5)]), n, id, 20.0)
	# the drum: a band of dark glazing between white bands
	L._hue = white
	L._lathe(c, "render", PackedVector2Array([Vector2(r * 0.84, 1.5), Vector2(r * 0.84, 5.0), Vector2(r * 0.845, 5.0)]), n)
	L._hue = Color("#6E7C8E")   # the glazing: blue-grey glass (it reads dark under the brim, never black)
	var mull := func(a: float) -> float: return 1.0 - 0.004 * absf(sin(a * 36.0))
	L._sweep(c, "render", L._sec(L._ring(n * 2, mull), true), PackedVector2Array([Vector2(r * 0.83, 5.0), Vector2(r * 0.83, 11.0)]), id, 20.0)
	L._hue = white
	L._lathe(c, "render", PackedVector2Array([Vector2(r * 0.845, 11.0), Vector2(r * 0.85, 13.6), Vector2(r * 0.88, 14.0)]), n)
	# the brim: out to r, a sharp edge, its dark underside
	L._hue = Color("#A9875A")
	L._lathe(c, "render", PackedVector2Array([Vector2(r * 0.86, 13.6), Vector2(r * 0.99, 15.6), Vector2(r * 1.0, 16.4),
		Vector2(r * 0.97, 16.9)]), n, id, 15.0)
	L._hue = white
	L._lathe(c, "render", PackedVector2Array([Vector2(r * 0.97, 16.9), Vector2(r * 0.86, 17.6), Vector2(r * 0.8, 18.0)]), n, id, 15.0)
	# the crown: sloping in, with ribs (the cap's pleats) and a brown band at the top
	var ribs := func(a: float) -> float: return 1.0 + 0.025 * pow(absf(cos(a * 18.0)), 6.0)
	L._sweep(c, "render", L._sec(L._ring(n * 2, ribs), true), PackedVector2Array([Vector2(r * 0.8, 18.0), Vector2(r * 0.72, 23.0),
		Vector2(r * 0.64, 27.2)]), id, 20.0)
	L._hue = Color("#8A6B45")
	L._lathe(c, "render", PackedVector2Array([Vector2(r * 0.64, 27.2), Vector2(r * 0.645, 28.6), Vector2(r * 0.6, 28.9)]), n)
	L._hue = Color("#B9B3A8")
	L._lathe(c, "render", PackedVector2Array([Vector2(r * 0.6, 28.9), Vector2(r * 0.4, 30.2), Vector2(r * 0.12, 31.0), Vector2(0, 31.0)]), n, id, 20.0)
	# the entrance canopies (four, round the drum)
	L._hue = white
	for f in 4:
		var xf: Transform3D = L._yaw(90.0 * f + 45.0)
		L._box(c, "render", xf * Transform3D(Basis(), Vector3(0, 0, r * 0.88)), 6.0, 3.0, 4.6, 5.4, 0.1)
		for sx: float in [-1.0, 1.0]:
			L._box(c, "render", xf * Transform3D(Basis(), Vector3(sx * 5.2, 0, r * 0.88 + 2.4)), 0.3, 0.3, 1.5, 4.6, 0.04)
	L._hue = Color(1, 1, 1)
