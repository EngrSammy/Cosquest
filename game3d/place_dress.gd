extends RefCounted
## look-world (audit issues 14, 15; art direction 4.6, 4.8): a place dressed like a real street.
##  - Along every car road, on the pavement: street lamps every ~25 m (the region's: UK swan-neck, US
##    cobra-head, Lagos solar pole), bins, benches, US hydrants; traffic lights at the busy junctions;
##    Belisha beacons at UK zebras; a few UK post and phone boxes; parked cars along the kerbs.
##  - Round the squares: bollards where a square meets a road, lamps, benches and planters inside.
##  - Trees: OpenStreetMap's mapped trees, each a species of the place's climate (world_props.gd species),
##    plus street trees where a residential street has none mapped.
##  - Roof clutter on flat roofs (AC units, vents, NY water tanks, UK chimney stacks, Lagos tanks and dishes).
## Everything is a MultiMesh per kit mesh (one draw per surface), placed with a fixed hash of its spot (the
## same city every fight; no draw from the fight's random numbers). A spot is refused when it is in a
## building, on a road, in water, near a landmark or in the fight's clear zone.

const Props := preload("res://world_props.gd")
const REACH: float = 260.0   # place.gd REACH

var _xf: Dictionary = {}      # mesh key "kind:variant" -> [Transform3D]
var _cast: Dictionary = {}
var _p: Node3D
var _roads: RefCounted
var _bake: RefCounted
var _clear: Rect2
var _frontage: float = 0.0
var _count: Dictionary = {}


static func h01(v: Vector2, salt: float = 0.0) -> float:
	return fposmod(sin(v.x * 12.9898 + v.y * 78.233 + salt * 37.719) * 43758.5453, 1.0)


## How far from the fight each kind is placed (metres): beyond it the prop is a few pixels in the fog and
## its triangles are wasted (the art direction's 350 k visible-triangle budget).
const KIND_REACH: Dictionary = {"bollard": 80.0, "bin": 90.0, "bench": 90.0, "hydrant_us": 80.0, "planter": 100.0,
	"post_box_uk": 100.0, "phone_box_uk": 110.0, "bus_stop": 110.0, "belisha": 120.0,
	"lamp_uk": 115.0, "lamp_us": 125.0, "lamp_lagos": 115.0, "traffic_light_uk": 120.0, "traffic_light_us": 130.0}
# day1-world: lamps and signals 10 m nearer (Trafalgar's device frame was 351 k primitives, budget 350 k)


func _put(kind: String, variant: int, p: Vector2, yaw: float, scale: float = 1.0, cast: bool = true) -> void:
	if p.length() > float(KIND_REACH.get(kind, 180.0)):
		return
	var key: String = "%s:%d" % [kind, variant]
	if not _xf.has(key):
		_xf[key] = []
		_cast[key] = cast
	(_xf[key] as Array).append(Transform3D(Basis(Vector3.UP, yaw).scaled(Vector3.ONE * scale), Vector3(p.x, 0.0, p.y)))
	_count[kind] = int(_count.get(kind, 0)) + 1


## A spot on the pavement a prop may stand on.
func free_spot(p: Vector2, tall: bool = false, margin: float = 0.4) -> bool:
	if p.length() > REACH - 10.0:
		return false
	if _clear.grow(1.5 if tall else 0.5).has_point(p):
		return false
	var r: Array = _roads.call("nearest", p)
	if float(r[0]) < margin:
		return false
	if bool(_p.call("in_building", p, margin)) or bool(_p.call("in_water", p)) or bool(_p.call("near_landmark", p, 1.5)):
		return false
	return true


func build(p: Node3D, ground: Dictionary) -> void:
	_p = p
	_roads = p.get("_roads")
	_bake = p.get("bake")
	_clear = p.get("clear")
	var region: String = p.get("region")
	var lamp: String = {"uk": "lamp_uk", "us_east": "lamp_us", "us_west": "lamp_us", "west_africa": "lamp_lagos"}.get(region, "lamp_uk")
	var us: bool = region.begins_with("us")
	var uk: bool = region == "uk"
	_along_roads(lamp, us, uk, region)
	_squares(lamp)
	_junctions(us, uk)
	if uk:
		for c: Array in _roads.get("crossings"):
			var at: Vector2 = c[0]
			var nrm := Vector2(-(c[1] as Vector2).y, (c[1] as Vector2).x)
			for s: float in [-1.0, 1.0]:
				var q: Vector2 = at + nrm * s * (float(c[2]) + 0.6)
				if free_spot(q, true, 0.2):
					_put("belisha", 0, q, 0.0)
					_bake.call("post", q, 2.8, 0.1)
	_trees(ground)
	_roof_clutter(region)
	_parked_cars(region)
	for key: String in _xf:
		var kv: PackedStringArray = key.split(":")
		var mesh: ArrayMesh = p.call("kit", kv[0], int(kv[1]))
		p.call("add_multi", mesh, _xf[key], "props_" + key.replace(":", "_"), bool(_cast[key]))
	var info: Dictionary = p.get("info")
	info["props"] = _count
	var n_street: int = 0
	for k: String in _count:
		if not k.begins_with("tree_") and not k in ["ac_unit", "vent", "water_tank_us", "chimney_uk", "dish", "water_tank_lagos", "roof_plant"]:
			n_street += int(_count[k])
	info["props_per_100m_frontage"] = snappedf(100.0 * n_street / maxf(1.0, _frontage), 0.1)


## Walks both pavements of every car road (inside the reach) placing the street furniture.
func _along_roads(lamp: String, us: bool, uk: bool, region: String) -> void:
	var lamp_h: float = float(Props.info(lamp).get("h", 5.0))
	for rd: Dictionary in _roads.get("roads"):
		var line: PackedVector2Array = rd["p"]
		var hw: float = rd["hw"]
		if str(rd["d"]) == "service" and hw < 2.5:
			continue
		var t: float = 0.0
		for i in line.size() - 1:
			var a: Vector2 = line[i]
			var b: Vector2 = line[i + 1]
			var len: float = a.distance_to(b)
			if len < 0.5:
				continue
			var d: Vector2 = (b - a) / len
			var nrm := Vector2(-d.y, d.x)
			var s: float = fposmod(-t, 3.0)
			while s < len:
				var c: Vector2 = a + d * s
				var slot: int = int(round((t + s) / 3.0))
				if c.length() < REACH - 20.0:
					_frontage += 6.0      # both sides, 3 m a slot
				for side: float in [-1.0, 1.0]:
					var face: float = atan2(-side * nrm.x, -side * nrm.y)   # +z towards the road
					var off: float = hw + 0.9
					var q: Vector2 = c + nrm * side * off
					var hv: float = h01(q, slot)
					if (slot + (0 if side > 0.0 else 4)) % 8 == 0:
						if free_spot(q, true) and not bool(_roads.call("near_junction", q, hw + 3.0)):
							_put(lamp, 0, q, face)
							_bake.call("post", q, lamp_h)
							_lamp_heads.append(Transform3D(Basis(Vector3.UP, face), Vector3(q.x, 0, q.y)) * (Props.info(lamp).get("light_at", Vector3(0, lamp_h, 0)) as Vector3))
					elif hv < 0.07:
						var q2: Vector2 = c + nrm * side * (hw + 1.4)
						if free_spot(q2):
							_put("bin", 0, q2, face)
							_bake.call("blob", q2, 0.35, 1.0)
					elif hv < 0.1:
						var q3: Vector2 = c + nrm * side * (hw + 2.2)
						if free_spot(q3, false, 0.6):
							_put("bench", 0, q3, face)
							_bake.call("blob", q3, 0.8, 0.8)
					elif us and hv < 0.13:
						var q4: Vector2 = c + nrm * side * (hw + 0.7)
						if free_spot(q4, false, 0.2):
							_put("hydrant_us", 0, q4, face)
					elif uk and hv > 0.995:
						var q5: Vector2 = c + nrm * side * (hw + 1.6)
						if free_spot(q5, false, 0.6):
							_put("phone_box_uk" if hv > 0.9975 else "post_box_uk", 0, q5, face)
							_bake.call("blob", q5, 0.6, 2.4)
					elif region == "west_africa" and hv > 0.985:
						var q6: Vector2 = c + nrm * side * (hw + 1.8)
						if free_spot(q6, false, 0.6):
							_put("bus_stop", 0, q6, face)
				s += 3.0
			t += len


var _lamp_heads: Array = []


## Squares: bollards on the edges that meet a road, lamps, benches and planters inside.
func _squares(lamp: String) -> void:
	var lamp_h: float = float(Props.info(lamp).get("h", 5.0))
	for poly: PackedVector2Array in _p.get("_paved_polys"):
		var area: float = absf(_p.call("_area", poly))
		for i in poly.size():
			var a: Vector2 = poly[i]
			var b: Vector2 = poly[(i + 1) % poly.size()]
			var len: float = a.distance_to(b)
			if len < 1.0:
				continue
			var d: Vector2 = (b - a) / len
			var s: float = 0.8
			while s < len - 0.8:
				var q: Vector2 = a + d * s
				var r: Array = _roads.call("nearest", q)
				if float(r[0]) > 0.3 and float(r[0]) < 2.5 and free_spot(q, false, 0.3):
					_put("bollard", 0, q, 0.0)
				s += 1.7
		if area < 150.0:
			continue
		# inside: a loose grid of furniture
		var box := Rect2(poly[0], Vector2.ZERO)
		for q: Vector2 in poly:
			box = box.expand(q)
		var step: float = 11.0
		var y: float = box.position.y + step * 0.5
		while y < box.end.y:
			var x: float = box.position.x + step * 0.5
			while x < box.end.x:
				var q := Vector2(x, y) + Vector2(h01(Vector2(x, y), 1.0) - 0.5, h01(Vector2(x, y), 2.0) - 0.5) * 4.0
				if Geometry2D.is_point_in_polygon(q, poly) and free_spot(q, true, 1.0):
					var hv: float = h01(q, 3.0)
					var yaw: float = hv * TAU
					if hv < 0.22:
						_put(lamp, 0, q, yaw)
						_bake.call("post", q, lamp_h)
					elif hv < 0.42:
						_put("bench", 0, q, yaw)
						_bake.call("blob", q, 0.8, 0.8)
					elif hv < 0.55:
						_put("planter", 0, q, yaw)
						_bake.call("blob", q, 0.8, 1.2)
					elif hv < 0.6:
						_put("bin", 0, q, yaw)
				x += step
			y += step


func _junctions(us: bool, uk: bool) -> void:
	var kind: String = "traffic_light_us" if us else "traffic_light_uk"
	var h: float = float(Props.info(kind).get("h", 3.3))
	var n: int = 0
	for j: Array in _roads.get("junctions"):
		var at: Vector2 = j[0]
		if at.length() > 180.0 or int(j[1]) < 3:
			continue
		var r: Array = _roads.call("nearest", at)
		if int(r[1]) < 0:
			continue
		var rd: Dictionary = (_roads.get("roads") as Array)[int(r[1])]
		if not str(rd["k"]) in ["major_road", "medium_road", "highway"]:
			continue
		# a light on two opposite corners, turned to the junction
		for k in 4:
			if k % 2 == 1 and h01(at, k) < 0.5:
				continue
			var ang: float = TAU * (k + 0.5) / 4.0 + h01(at) * 0.6
			var q: Vector2 = at + Vector2(cos(ang), sin(ang)) * (float(rd["hw"]) + 1.6)
			for tries in 4:
				if free_spot(q, true, 0.3):
					break
				q = at + Vector2(cos(ang), sin(ang)) * (float(rd["hw"]) + 2.4 + tries * 1.2)
			if free_spot(q, true, 0.3):
				var to: Vector2 = at - q
				_put(kind, 0, q, atan2(to.x, to.y))
				_bake.call("post", q, h)
				n += 1
	_p.get("info")["traffic_lights"] = n


func _tree_kind(sp: Array, p: Vector2) -> String:
	return str(sp[int(h01(p, 5.0) * 97.0) % sp.size()])


func _trees(ground: Dictionary) -> void:
	var climate: String = _p.get("climate")
	var sp: Array = Props.species(climate)
	if sp.is_empty():
		return
	var spots: Array = []
	for t: Variant in ground.get("trees", []):
		var a: Array = t
		var q: Vector2 = _p.call("to_fight", Vector2(float(a[0]), float(a[1])))
		if q.length() > 210.0 or _clear.grow(-1.0).has_point(q):
			continue
		spots.append([q, clampf(float(a[2]), 0.6, 1.8)])
	# street trees where residential and minor streets have none mapped (most of the world maps few)
	var region: String = _p.get("region")
	if region != "us_east":
		for rd: Dictionary in _roads.get("roads"):
			if not str(rd["k"]) in ["minor_road", "medium_road"] or str(rd["d"]) == "service":
				continue
			var line: PackedVector2Array = rd["p"]
			for i in line.size() - 1:
				var a: Vector2 = line[i]
				var b: Vector2 = line[i + 1]
				var len: float = a.distance_to(b)
				var d: Vector2 = (b - a) / maxf(0.01, len)
				var s: float = 6.0
				while s < len - 4.0:
					for side: float in [-1.0, 1.0]:
						var q: Vector2 = a + d * s + Vector2(-d.y, d.x) * side * (float(rd["hw"]) + 2.0)
						if h01(q, 7.0) < 0.45 and q.length() < 170.0 and free_spot(q, true, 1.2) and not _tree_near(spots, q, 7.0):
							spots.append([q, 0.8 + h01(q, 8.0) * 0.4])
					s += 13.0
	var n: int = 0
	for s: Array in spots:
		var q: Vector2 = s[0]
		if bool(_p.call("in_building", q, 0.3)):
			continue
		var kind: String = _tree_kind(sp, q)
		var variant: int = int(h01(q, 9.0) * 2.0)
		var sc: float = float(s[1]) * (0.85 + h01(q, 11.0) * 0.3)
		_put(kind, variant, q, h01(q, 12.0) * TAU, sc, true)
		var inf: Dictionary = Props.info(kind)
		_bake.call("tree", q, float(inf.get("h", 10.0)) * sc, float(inf.get("r", 4.0)) * sc)
		n += 1
	_p.get("info")["trees"] = n


static func _tree_near(spots: Array, q: Vector2, r: float) -> bool:
	for s: Array in spots:
		if (s[0] as Vector2).distance_to(q) < r:
			return true
	return false


func _roof_clutter(region: String) -> void:
	var kinds: Dictionary = {
		"uk": ["chimney_uk", "chimney_uk", "ac_unit", "vent"],
		"us_east": ["water_tank_us", "ac_unit", "vent", "ac_unit"],
		"us_west": ["ac_unit", "vent", "ac_unit", "dish"],
		"west_africa": ["water_tank_lagos", "dish", "ac_unit", "water_tank_lagos"],
		"generic": ["ac_unit", "vent", "chimney_uk", "ac_unit"],
	}
	var ks: Array = kinds.get(region, kinds["generic"])
	for r: Array in _p.get_meta("roofs", []):
		var poly: PackedVector2Array = r[0]
		var h: float = r[1]
		var sheet: String = r[2]
		var area: float = r[3]
		if area < 40.0 or _p.call("_poly_centre", poly).length() > 120.0:
			continue
		var box := Rect2(poly[0], Vector2.ZERO)
		for q: Vector2 in poly:
			box = box.expand(q)
		var want: int = clampi(int(area / 140.0) + 1, 1, 6)
		if sheet == "trim_us_modern":
			ks = ["roof_plant", "ac_unit", "vent", "ac_unit"]
		elif region == "us_east" and h > 45.0:
			ks = ["ac_unit", "vent", "ac_unit", "vent"]
		else:
			ks = kinds.get(region, kinds["generic"])
		var placed: int = 0
		for tries in want * 4:
			if placed >= want:
				break
			var q := Vector2(lerpf(box.position.x, box.end.x, h01(poly[0], tries * 2.0)), lerpf(box.position.y, box.end.y, h01(poly[0], tries * 2.0 + 1.0)))
			if not Geometry2D.is_point_in_polygon(q, poly):
				continue
			var edge: float = INF
			for i in poly.size():
				edge = minf(edge, Geometry2D.get_closest_point_to_segment(q, poly[i], poly[(i + 1) % poly.size()]).distance_to(q))
			var k: String = ks[(placed + int(h01(q) * 4.0)) % ks.size()]
			if k == "chimney_uk" and (h > 20.0 or placed >= 2):
				k = "vent"
			var need: float = float(Props.info(k).get("r", 1.0)) + 0.4
			if k == "chimney_uk":
				need = 0.6
			if edge < need:
				continue
			var xf := Transform3D(Basis(Vector3.UP, h01(q, 4.0) * TAU), Vector3(q.x, h, q.y))
			var key: String = "%s:%d" % [k, int(h01(q, 6.0) * 2.0)]
			if not _xf.has(key):
				_xf[key] = []
				_cast[key] = false
			(_xf[key] as Array).append(xf)
			_count[k] = int(_count.get(k, 0)) + 1
			placed += 1


## Parked cars (Kenney Car Kit, scaled to 4.5 m) along the kerbs of the quieter roads.
const CARS: Array[String] = ["cars/sedan", "cars/hatchback-sports", "cars/suv", "cars/van", "cars/taxi", "cars/delivery"]


func _parked_cars(region: String) -> void:
	var left: bool = region == "uk"
	var groups: Dictionary = {}
	for rd: Dictionary in _roads.get("roads"):
		var hw: float = rd["hw"]
		if not str(rd["k"]) in ["minor_road", "medium_road", "major_road"] or hw < 2.8 or str(rd["d"]) == "service":
			continue
		var line: PackedVector2Array = rd["p"]
		for i in line.size() - 1:
			var a: Vector2 = line[i]
			var b: Vector2 = line[i + 1]
			var len: float = a.distance_to(b)
			var d: Vector2 = (b - a) / maxf(0.01, len)
			var nrm := Vector2(-d.y, d.x)
			var s: float = 3.0
			while s < len - 3.0:
				for side: float in [-1.0, 1.0]:
					var q: Vector2 = a + d * s + nrm * side * (hw - 1.15)
					var hv: float = h01(q, 21.0)
					if hv > 0.42 or q.length() > 100.0 or _clear.grow(2.0).has_point(q):
						continue
					if bool(_roads.call("near_junction", q, hw + 9.0)) or bool(_p.call("in_building", q, 0.5)):
						continue
					# cars face the way the traffic on their side drives
					var fwd: Vector2 = d * (side if left else -side) * -1.0
					var model: String = CARS[int(hv * 1000.0) % CARS.size()]
					if region == "us_east" and hv < 0.12:
						model = "cars/taxi"
					if not groups.has(model):
						groups[model] = []
					(groups[model] as Array).append(Transform3D(Basis(Vector3.UP, atan2(fwd.x, fwd.y)), Vector3(q.x, 0.0, q.y)))
					_bake.call("blob", q, 1.6, 1.0)
				s += 6.2
	var n: int = 0
	for model: String in groups:
		# day1-world: the car's mesh (a Kenney GLB merged once, cached for the next fight) and its node are made
		# on the main thread (place.gd _emit): merging reads the GLB's surfaces back from the RenderingServer
		_p.call("_emit", Callable(_p, "mk_cars").bind(model, groups[model]))
		n += (groups[model] as Array).size()
	_p.get("info")["parked_cars"] = n


## A Kenney car as one mesh (its own atlas material, opaque) and the transform that stands it 4.5 m long
## on y = 0, nose to +z. Cached on the place.
static var _car_cache: Dictionary = {}


static func car_mesh(_p: Node3D, model: String) -> Array:
	var cache: Dictionary = _car_cache
	if cache.has(model):
		return cache[model]
	var ps: PackedScene = load("res://art/city/%s.glb" % model)
	if ps == null:
		return []
	var inst: Node3D = ps.instantiate() as Node3D
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var mat: Material = null
	var box := AABB()
	var first: bool = true
	for node: Node in inst.find_children("*", "MeshInstance3D", true, false):
		var mi := node as MeshInstance3D
		if mi.mesh == null:
			continue
		var xf: Transform3D = Transform3D.IDENTITY
		var q: Node = mi
		while q != null and q != inst:
			if q is Node3D:
				xf = (q as Node3D).transform * xf
			q = q.get_parent()
		for si in mi.mesh.get_surface_count():
			if mat == null:
				mat = mi.get_active_material(si)
			st.append_from(mi.mesh, si, xf)
		var bb: AABB = xf * mi.get_aabb()
		box = bb if first else box.merge(bb)
		first = false
	inst.free()
	var mesh: ArrayMesh = st.commit()
	if mat is BaseMaterial3D:
		var m := (mat as BaseMaterial3D).duplicate() as BaseMaterial3D
		m.transparency = BaseMaterial3D.TRANSPARENCY_DISABLED
		m.roughness = 0.55
		mesh.surface_set_material(0, m)
	var long_z: bool = box.size.z >= box.size.x
	var s: float = 4.5 / maxf(0.01, maxf(box.size.x, box.size.z))
	var rot := Basis() if long_z else Basis(Vector3.UP, PI * 0.5)
	var c: Vector3 = box.get_center()
	var xf2 := Transform3D(rot.scaled(Vector3.ONE * s), Vector3.ZERO) * Transform3D(Basis(), Vector3(-c.x, -box.position.y, -c.z))
	var out: Array = [mesh, xf2]
	cache[model] = out
	return out
