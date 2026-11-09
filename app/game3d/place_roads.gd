extends RefCounted
## look-world: a place's roads (art direction 4.4), in the fight's frame:
##  - asphalt: each OSM car road as a ribbon with round joins and round ends (Geometry2D.offset_polyline),
##    so junctions and bends join cleanly; tiled in world space (world_ground.gdshader), no navy;
##  - kerbs: the outline of the union of all the ribbons (each ribbon's outline minus every other ribbon),
##    a 0.15 m rise with a 0.3 m stone top, AO on the road side (baked);
##  - markings by region, one vertex-coloured mesh: UK white dashed centre lines and double yellows,
##    US double yellow centres and white lane lines, Lagos faded white; none inside junctions;
##  - crossings where OSM maps a footway crossing over a road: zebras (UK, with Belisha beacons placed by
##    place_dress.gd), ladder crosswalks (US), faded zebras (Lagos);
##  - park paths (footways inside green areas) in the park-path gravel.
## It also answers the dressing's questions: how far is a point from a road, does a wall face a road.

const CELL: float = 20.0

var roads: Array = []        # {"p": PackedVector2Array, "hw": float, "k": String, "d": String, "polys": Array}
var crossing_lines: Array = []
var paths: Array = []        # [PackedVector2Array, half width]
var crossings: Array = []    # [Vector2 at, Vector2 road dir, float hw] (for the Belisha beacons)
var junctions: Array = []    # [Vector2, arms]
var _grid: Dictionary = {}   # cell -> [[a, b, hw, road index]]
var _ribbons: Array = []     # [PackedVector2Array, Rect2]


func setup(p: Node3D, raw: Array) -> void:
	var arms: Dictionary = {}
	var at: Dictionary = {}
	for r: Variant in raw:
		var rd: Dictionary = r
		var k: String = str(rd.get("k", ""))
		var d: String = str(rd.get("d", ""))
		var pp: PackedVector2Array = p.call("pts", rd["p"])
		if pp.size() < 2 or bool(p.call("far", pp)):
			continue
		if k == "rail":
			continue
		if k == "path":
			if d == "crossing":
				crossing_lines.append(pp)
			elif d in ["footway", "path", "track", "bridleway", "cycleway", "pedestrian"]:
				paths.append([pp, maxf(0.9, float(rd.get("w", 2.0)) * 0.5)])
			continue
		var hw: float = float(rd.get("w", 6.0)) * 0.5
		var ri: int = roads.size()
		roads.append({"p": pp, "hw": hw, "k": k, "d": d})
		for i in pp.size() - 1:
			_grid_add(pp[i], pp[i + 1], hw, ri)
		for i in pp.size():
			var key: Vector2i = Vector2i(roundi(pp[i].x * 2.0), roundi(pp[i].y * 2.0))
			arms[key] = int(arms.get(key, 0)) + (1 if i == 0 or i == pp.size() - 1 else 2)
			at[key] = pp[i]
	for key: Vector2i in arms:
		if int(arms[key]) >= 3:
			junctions.append([at[key], int(arms[key])])


func _grid_add(a: Vector2, b: Vector2, hw: float, ri: int) -> void:
	var box := Rect2(a, Vector2.ZERO).expand(b).grow(hw + 1.0)
	for cx in range(floori(box.position.x / CELL), floori(box.end.x / CELL) + 1):
		for cy in range(floori(box.position.y / CELL), floori(box.end.y / CELL) + 1):
			var c := Vector2i(cx, cy)
			if not _grid.has(c):
				_grid[c] = []
			(_grid[c] as Array).append([a, b, hw, ri])


## [metres from the road's edge (negative: on the road), the road index, the closest centre point,
## the road's direction there] for the nearest car road within ~2 cells, or [INF, -1, ...].
func nearest(p: Vector2, reach: float = 9.0) -> Array:
	var best: Array = [INF, -1, Vector2.ZERO, Vector2.RIGHT]
	# only the cells a road within `reach` of its edge could be in (the widest road is ~12 m)
	var e: float = reach + 6.5
	for cx in range(floori((p.x - e) / CELL), floori((p.x + e) / CELL) + 1):
		for cy in range(floori((p.y - e) / CELL), floori((p.y + e) / CELL) + 1):
			for s: Array in _grid.get(Vector2i(cx, cy), []):
				var q: Vector2 = Geometry2D.get_closest_point_to_segment(p, s[0], s[1])
				var dd: float = q.distance_to(p) - float(s[2])
				if dd < float(best[0]):
					best = [dd, s[3], q, ((s[1] as Vector2) - (s[0] as Vector2)).normalized()]
	return best


## True when the wall at `mid` (outward normal n) looks onto a car road close by: it gets a shopfront.
func faces_road(mid: Vector2, n: Vector2) -> bool:
	var probe: Vector2 = mid + n * 7.0
	var r: Array = nearest(probe, 7.5)
	if float(r[0]) > 7.0:
		return false
	var v: Vector2 = (r[2] as Vector2) - mid
	return v.length() < 26.0 and v.normalized().dot(n) > 0.45


func near_junction(p: Vector2, r: float) -> bool:
	for j: Array in junctions:
		if (j[0] as Vector2).distance_to(p) < r:
			return true
	return false


func build(p: Node3D) -> void:
	var clear: Rect2 = p.get("clear")
	var asphalt := SurfaceTool.new()
	asphalt.begin(Mesh.PRIMITIVE_TRIANGLES)
	for rd: Dictionary in roads:
		var polys: Array = Geometry2D.offset_polyline(rd["p"], float(rd["hw"]), Geometry2D.JOIN_ROUND, Geometry2D.END_ROUND)
		for poly: PackedVector2Array in polys:
			if Geometry2D.is_polygon_clockwise(poly) and polys.size() > 1:
				continue   # a hole (a loop road's inside): the floor shows through
			p.call("poly_fill", asphalt, poly, 0.02)
			var box := Rect2(poly[0], Vector2.ZERO)
			for q: Vector2 in poly:
				box = box.expand(q)
			_ribbons.append([poly, box])
	p.get("info")["roads"] = roads.size()
	if roads.is_empty():
		return
	var region: String = p.get("region")
	p.call("add_mesh", asphalt.commit(), p.call("ground_mat", "asphalt", "ground/asphalt", 4.0, {"bake_on": 1.0, "roughness": 0.88, "tint": Color(1.12, 1.12, 1.12)}), "roads")
	_kerbs(p, clear)
	_markings(p, region, clear)
	_paths(p)


# ---- kerbs: the union's outline

func _kerbs(p: Node3D, clear: Rect2) -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var n_seg: int = 0
	var bake: RefCounted = p.get("bake")
	for i in _ribbons.size():
		var own: PackedVector2Array = _ribbons[i][0]
		var box: Rect2 = _ribbons[i][1]
		var line := PackedVector2Array(own)
		line.append(own[0])
		var pieces: Array = [line]
		for j in _ribbons.size():
			if j == i or not box.intersects(_ribbons[j][1]):
				continue
			var nxt: Array = []
			for pc: PackedVector2Array in pieces:
				nxt.append_array(Geometry2D.clip_polyline_with_polygon(pc, _ribbons[j][0]))
			pieces = nxt
			if pieces.is_empty():
				break
		for pc: PackedVector2Array in pieces:
			for k in pc.size() - 1:
				var a: Vector2 = pc[k]
				var b: Vector2 = pc[k + 1]
				if a.distance_to(b) < 0.05 or clear.grow(1.0).has_point((a + b) * 0.5):
					continue
				var d: Vector2 = (b - a).normalized()
				var nrm: Vector2 = Vector2(-d.y, d.x)
				if Geometry2D.is_point_in_polygon((a + b) * 0.5 + nrm * 0.05, own):
					nrm = -nrm          # out of the road, onto the pavement
				_kerb_seg(st, a, b, nrm)
				bake.call("kerb", a, b, nrm)
				n_seg += 1
	p.get("info")["kerb_segments"] = n_seg
	if n_seg > 0:
		var kc: Color = Color("#B9B2A6")
		p.call("add_mesh", st.commit(), p.call("ground_mat", "kerb", "misc/stone", 1.6,
			{"tint": Color(kc.r / 0.8, kc.g / 0.8, kc.b / 0.8), "bake_on": 1.0, "crack_k": 0.0, "uv_world_y": 0.0}), "kerbs")


const KERB_H: float = 0.15
const KERB_W: float = 0.3


func _kerb_seg(st: SurfaceTool, a: Vector2, b: Vector2, n: Vector2) -> void:
	var a2: Vector2 = a + n * KERB_W
	var b2: Vector2 = b + n * KERB_W
	var c := Color(1, 1, 1)
	# road-side face, top, back face (the pavement side, slightly lower)
	_q(st, Vector3(a.x, 0.02, a.y), Vector3(b.x, 0.02, b.y), Vector3(b.x, KERB_H, b.y), Vector3(a.x, KERB_H, a.y), Vector3(-n.x, 0.0, -n.y), c * 0.92)
	_q(st, Vector3(a.x, KERB_H, a.y), Vector3(b.x, KERB_H, b.y), Vector3(b2.x, KERB_H, b2.y), Vector3(a2.x, KERB_H, a2.y), Vector3.UP, c)
	_q(st, Vector3(a2.x, KERB_H, a2.y), Vector3(b2.x, KERB_H, b2.y), Vector3(b2.x, 0.0, b2.y), Vector3(a2.x, 0.0, a2.y), Vector3(n.x, 0.0, n.y), c * 0.96)


static func _q(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, d: Vector3, n: Vector3, col: Color) -> void:
	var cr: Vector3 = (b - a).cross(c - a)
	var order: Array = [a, b, c, a, c, d] if cr.dot(n) < 0.0 else [a, c, b, a, d, c]
	for v: Vector3 in order:
		st.set_color(col)
		st.set_normal(n)
		st.add_vertex(v)


# ---- markings

const WHITE := Color("#F2EEE3")
const YELLOW_UK := Color("#F2C230")
const YELLOW_US := Color("#F2B705")


func _markings(p: Node3D, region: String, clear: Rect2) -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var style: String = str(p.call("region_value", "marking"))
	var asphalt := Color("#5E5C60")
	var white: Color = WHITE.lerp(asphalt, 0.5) if style == "wa" else WHITE
	var n: int = 0
	for rd: Dictionary in roads:
		var hw: float = rd["hw"]
		var k: String = rd["k"]
		if hw < 2.7 or str(rd["d"]) == "service":
			continue
		var line: PackedVector2Array = rd["p"]
		var busy: bool = k in ["major_road", "medium_road", "highway"]
		if style == "us":
			if busy:
				n += _line(st, line, -0.12, 0.1, 0.0, 0.0, YELLOW_US, hw)
				n += _line(st, line, 0.12, 0.1, 0.0, 0.0, YELLOW_US, hw)
				if hw >= 6.0:
					n += _line(st, line, -hw * 0.5, 0.12, 3.0, 9.0, WHITE, hw)
					n += _line(st, line, hw * 0.5, 0.12, 3.0, 9.0, WHITE, hw)
		else:
			n += _line(st, line, 0.0, 0.12, 3.0, 6.0, white, hw)
			if style == "uk" and busy:
				for s: float in [-1.0, 1.0]:
					n += _line(st, line, s * (hw - 0.3), 0.08, 0.0, 0.0, YELLOW_UK, hw)
					n += _line(st, line, s * (hw - 0.5), 0.08, 0.0, 0.0, YELLOW_UK, hw)
	# crossings where a mapped footway crosses a road
	for cl: PackedVector2Array in crossing_lines:
		for i in cl.size() - 1:
			var c0: Vector2 = cl[i]
			var c1: Vector2 = cl[i + 1]
			var cell := Vector2i(floori((c0.x + c1.x) * 0.5 / CELL), floori((c0.y + c1.y) * 0.5 / CELL))
			for dx in [-1, 0, 1]:
				for dy in [-1, 0, 1]:
					for s: Array in _grid.get(cell + Vector2i(dx, dy), []):
						var x: Variant = Geometry2D.segment_intersects_segment(c0, c1, s[0], s[1])
						if x == null:
							continue
						var xp: Vector2 = x
						var dup: bool = false
						for c: Array in crossings:
							if (c[0] as Vector2).distance_to(xp) < 5.0:
								dup = true
						if dup or clear.has_point(xp):
							continue
						var dir: Vector2 = ((s[1] as Vector2) - (s[0] as Vector2)).normalized()
						# a crossing by a junction is signalised (UK: two dashed lines; no beacons); else a zebra
						var is_sig: bool = near_junction(xp, float(s[2]) + 12.0)
						if not is_sig:
							crossings.append([xp, dir, float(s[2])])
						n += _crossing(st, xp, dir, float(s[2]), "signal_" + style if is_sig and style != "us" else style, white)
	p.get("info")["markings"] = n
	p.get("info")["crossings"] = crossings.size()
	if n > 0:
		p.call("add_mesh", st.commit(), p.call("ground_mat", "paint", "misc/white", 1.0,
			{"use_vcol": 1.0, "bake_on": 1.0, "roughness": 0.7, "grime_k": 0.6, "crack_k": 0.6}), "markings")


## A line along the road at `off` metres from its centre, `w` wide; dashed when dash > 0. Stops short of
## junctions. Returns the quads it laid.
func _line(st: SurfaceTool, line: PackedVector2Array, off: float, w: float, dash: float, gap: float, col: Color, hw: float) -> int:
	var n: int = 0
	var t: float = 0.0
	for i in line.size() - 1:
		var a: Vector2 = line[i]
		var b: Vector2 = line[i + 1]
		var len: float = a.distance_to(b)
		if len < 0.1:
			continue
		var d: Vector2 = (b - a) / len
		var nrm := Vector2(-d.y, d.x)
		var s: float = 0.0
		while s < len:
			var e: float = len
			if dash > 0.0:
				var ph: float = fposmod(t + s, dash + gap)
				if ph >= dash:
					s += dash + gap - ph
					continue
				e = minf(len, s + dash - ph)
			else:
				e = minf(len, s + 2.0)
			var pa: Vector2 = a + d * s + nrm * off
			var pb: Vector2 = a + d * e + nrm * off
			if not near_junction((pa + pb) * 0.5, hw + 5.0):
				_flat(st, pa - nrm * w * 0.5, pb - nrm * w * 0.5, pb + nrm * w * 0.5, pa + nrm * w * 0.5, col)
				n += 1
			s = e + 0.001
		t += len
	return n


func _crossing(st: SurfaceTool, at: Vector2, dir: Vector2, hw: float, style: String, white: Color) -> int:
	var nrm := Vector2(-dir.y, dir.x)
	var n: int = 0
	var half_len: float = 1.3 if style != "us" else 1.5
	if style.begins_with("signal_"):
		# two lines of square studs across the road, 2.4 m apart
		for e: float in [-1.2, 1.2]:
			var s2: float = -hw + 0.3
			while s2 < hw - 0.3:
				var c3: Vector2 = at + nrm * s2 + dir * e
				_flat(st, c3 - dir * 0.1 - nrm * 0.1, c3 + dir * 0.1 - nrm * 0.1, c3 + dir * 0.1 + nrm * 0.1, c3 - dir * 0.1 + nrm * 0.1, white)
				n += 1
				s2 += 0.5
		return n
	var s: float = -hw + 0.45
	while s < hw - 0.45:
		var c: Vector2 = at + nrm * s
		_flat(st, c - dir * half_len - nrm * 0.25, c + dir * half_len - nrm * 0.25, c + dir * half_len + nrm * 0.25, c - dir * half_len + nrm * 0.25, white)
		n += 1
		s += 1.0
	if style == "us":
		for e: float in [-1.0, 1.0]:
			var c2: Vector2 = at + dir * e * (half_len + 0.2)
			_flat(st, c2 - nrm * hw - dir * 0.1, c2 + nrm * hw - dir * 0.1, c2 + nrm * hw + dir * 0.1, c2 - nrm * hw + dir * 0.1, white)
			n += 1
	return n


static func _flat(st: SurfaceTool, a: Vector2, b: Vector2, c: Vector2, d: Vector2, col: Color) -> void:
	for v: Vector2 in [a, c, b, a, d, c]:
		st.set_color(col)
		st.set_normal(Vector3.UP)
		st.add_vertex(Vector3(v.x, 0.035, v.y))


# ---- park paths

func _paths(p: Node3D) -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var n: int = 0
	for pa: Array in paths:
		var line: PackedVector2Array = pa[0]
		if not bool(p.call("in_green", line[line.size() / 2])) and not bool(p.call("in_green", line[0])):
			continue
		for poly: PackedVector2Array in Geometry2D.offset_polyline(line, float(pa[1]), Geometry2D.JOIN_ROUND, Geometry2D.END_ROUND):
			if p.call("poly_fill", st, poly, 0.016):
				n += 1
	p.get("info")["park_paths"] = n
	if n > 0:
		p.call("add_mesh", st.commit(), p.call("ground_mat", "path", "ground/path", 4.0, {"bake_on": 1.0, "crack_k": 0.0}), "park_paths")
