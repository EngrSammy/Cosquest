extends Node3D
## look-world (audit issue 14, art direction 4.9): a little life in a place, cheaply and never in the
## fight's way. All cosmetic: nothing here reads or draws the fight's seeded random numbers (its own
## RandomNumberGenerator with a fixed seed), and nothing collides.
##  - 2 to 4 cars driving the OSM roads that stay clear of the fight (one mesh each, moved in _process);
##  - 6 to 12 distant pedestrians beyond 40 m (billboards from art/world/misc/npc_atlas, one MultiMesh),
##    strolling up and down the pavement;
##  - pigeons circling the landmark (one MultiMesh, wings flapped in world_kit.gdshader);
##  - fountain spray on the nearest fountains, and drifting leaves (temperate, autumn) or golden dust
##    motes round the fight: at most 3 particle systems, under 400 particles in all.

const Props := preload("res://world_props.gd")
const Dress := preload("res://place_dress.gd")
const NPC_SHADER := preload("res://vfx/world_npc.gdshader")

var _cars: Array = []       # [MeshInstance3D, PackedVector2Array, cumulative lengths, speed, offset, t, Transform3D fix]
var _npcs: MultiMesh
var _npc_paths: Array = []  # [Vector2 a, Vector2 dir, float len, float speed, float phase]
var _birds: MultiMesh
var _bird_c: Vector3
var _bird_par: Array = []
var _t: float = 0.0
var info: Dictionary = {}


func build(p: Node3D, roads: RefCounted, _ground: Dictionary) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 4242
	var clear: Rect2 = p.get("clear")
	_drivers(p, roads, clear, rng)
	_people(p, roads, rng)
	_flock(p, rng)
	_spray(p)
	_air(p)
	(p.get("info") as Dictionary)["life"] = info


func _drivers(p: Node3D, roads: RefCounted, clear: Rect2, rng: RandomNumberGenerator) -> void:
	var cands: Array = []
	for rd: Dictionary in roads.get("roads"):
		if not str(rd["k"]) in ["major_road", "medium_road", "minor_road", "highway"] or str(rd["d"]) == "service":
			continue
		var line: PackedVector2Array = rd["p"]
		var len: float = 0.0
		var ok: bool = true
		var near: float = INF
		for i in line.size() - 1:
			len += line[i].distance_to(line[i + 1])
			var q: Vector2 = Geometry2D.get_closest_point_to_segment(Vector2.ZERO, line[i], line[i + 1])
			near = minf(near, q.length())
			# never through the fight or the camera's wedge
			if clear.grow(4.0).has_point(q) or _seg_hits_rect(line[i], line[i + 1], clear.grow(4.0)):
				ok = false
		if ok and len > 45.0 and near < 140.0:
			cands.append([near, line, len, float(rd["hw"])])
	cands.sort_custom(func(a: Array, b: Array) -> bool: return float(a[0]) < float(b[0]))
	var left: bool = str(p.get("region")) == "uk"
	var models: Array[String] = ["cars/sedan", "cars/taxi", "cars/suv", "cars/van"]
	var n: int = mini(cands.size(), 3)
	for i in n:
		var c: Array = cands[i]
		var mi: Array = Dress.car_mesh(p, models[i % models.size()])
		if mi.is_empty():
			continue
		var m := MeshInstance3D.new()
		m.mesh = mi[0]
		m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(m)
		var line: PackedVector2Array = c[1]
		var cum := PackedFloat32Array([0.0])
		for k in line.size() - 1:
			cum.append(cum[cum.size() - 1] + line[k].distance_to(line[k + 1]))
		var lane: float = float(c[3]) * 0.45 * (1.0 if left else -1.0)
		_cars.append([m, line, cum, rng.randf_range(6.0, 9.5), lane, rng.randf() * float(c[2]), mi[1]])
	info["cars"] = _cars.size()


static func _seg_hits_rect(a: Vector2, b: Vector2, r: Rect2) -> bool:
	if r.has_point(a) or r.has_point(b):
		return true
	var c: Array = [r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y)]
	for i in 4:
		if Geometry2D.segment_intersects_segment(a, b, c[i], c[(i + 1) % 4]) != null:
			return true
	return false


func _people(p: Node3D, roads: RefCounted, rng: RandomNumberGenerator) -> void:
	var atlas: Texture2D = p.call("tex", "misc/npc_atlas")
	if atlas == null:
		return
	var spots: Array = []
	var list: Array = roads.get("roads")
	for tries in 400:
		if spots.size() >= 10 or list.is_empty():
			break
		var rd: Dictionary = list[rng.randi() % list.size()]
		var line: PackedVector2Array = rd["p"]
		var i: int = rng.randi() % maxi(1, line.size() - 1)
		if i + 1 >= line.size():
			continue
		var a: Vector2 = line[i]
		var b: Vector2 = line[i + 1]
		var d: Vector2 = (b - a).normalized()
		var side: float = -1.0 if rng.randf() < 0.5 else 1.0
		var q: Vector2 = a.lerp(b, rng.randf()) + Vector2(-d.y, d.x) * side * (float(rd["hw"]) + 1.6 + rng.randf() * 1.2)
		if q.length() < 40.0 or q.length() > 130.0:
			continue
		if bool(p.call("in_building", q, 0.6)) or bool(p.call("in_water", q)):
			continue
		var walk: float = 0.0 if rng.randf() < 0.3 else rng.randf_range(0.9, 1.4)
		spots.append([q, d, rng.randf_range(6.0, 14.0), walk, rng.randf() * 10.0, rng.randi() % 8])
	if spots.is_empty():
		return
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var w: float = 0.44
	var h: float = 1.76
	var vs: Array = [[Vector3(-w, 0, 0), Vector2(0, 1)], [Vector3(w, 0, 0), Vector2(1, 1)], [Vector3(w, h, 0), Vector2(1, 0)], [Vector3(-w, h, 0), Vector2(0, 0)]]
	for k: int in [0, 1, 2, 0, 2, 3]:
		st.set_normal(Vector3(0, 0, 1))
		st.set_uv(vs[k][1])
		st.add_vertex(vs[k][0])
	var mesh: ArrayMesh = st.commit()
	var sm := ShaderMaterial.new()
	sm.shader = NPC_SHADER
	sm.set_shader_parameter("atlas", atlas)
	mesh.surface_set_material(0, sm)
	_npcs = MultiMesh.new()
	_npcs.transform_format = MultiMesh.TRANSFORM_3D
	_npcs.use_custom_data = true
	_npcs.mesh = mesh
	_npcs.instance_count = spots.size()
	for i in spots.size():
		var s: Array = spots[i]
		_npc_paths.append(s)
		_npcs.set_instance_transform(i, Transform3D(Basis(), Vector3((s[0] as Vector2).x, 0, (s[0] as Vector2).y)))
		_npcs.set_instance_custom_data(i, Color(float(s[5]), 0, 0, 0))
	var mmi := MultiMeshInstance3D.new()
	mmi.name = "people"
	mmi.multimesh = _npcs
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mmi)
	info["people"] = spots.size()


func _flock(p: Node3D, rng: RandomNumberGenerator) -> void:
	var mesh: ArrayMesh = p.call("kit", "bird", 0)
	if mesh == null:
		return
	mesh = mesh.duplicate() as ArrayMesh
	for si in mesh.get_surface_count():
		mesh.surface_set_material(si, p.call("kit_mat", "bird"))
	var lm: Vector3 = (p.get("info") as Dictionary).get("landmark_at", Vector3(0, 0, -45))
	_bird_c = Vector3(lm.x, 0.0, lm.z)
	var n: int = 12
	_birds = MultiMesh.new()
	_birds.transform_format = MultiMesh.TRANSFORM_3D
	_birds.mesh = mesh
	_birds.instance_count = n
	for i in n:
		_bird_par.append([rng.randf_range(8.0, 20.0), rng.randf_range(12.0, 26.0), rng.randf_range(0.35, 0.6) * (1.0 if rng.randf() < 0.8 else -1.0), rng.randf() * TAU, rng.randf_range(2.6, 3.4)])
	var mmi := MultiMeshInstance3D.new()
	mmi.name = "birds"
	mmi.multimesh = _birds
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mmi)
	info["birds"] = n
	_move(0.0)


func _spray(p: Node3D) -> void:
	var fl: Array = p.get_meta("fountains", [])
	fl.sort_custom(func(a: Array, b: Array) -> bool: return (a[0] as Vector2).length() < (b[0] as Vector2).length())
	var n: int = 0
	for f: Array in fl:
		if n >= 2 or (f[0] as Vector2).length() > 110.0:
			break
		for tip: Variant in f[2]:
			var ps := CPUParticles3D.new()
			ps.name = "spray"
			ps.amount = 70
			ps.lifetime = 1.1
			ps.position = tip as Vector3
			ps.direction = Vector3.UP
			ps.spread = 14.0
			var sc: float = float(f[1])
			ps.initial_velocity_min = 3.6 * sqrt(sc)
			ps.initial_velocity_max = 4.6 * sqrt(sc)
			ps.gravity = Vector3(0, -9.8, 0)
			ps.scale_amount_min = 0.6
			ps.scale_amount_max = 1.2
			var q := QuadMesh.new()
			q.size = Vector2(0.16, 0.16)
			var m := StandardMaterial3D.new()
			m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
			m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			m.albedo_color = Color(0.92, 0.97, 0.98, 0.55)
			m.albedo_texture = p.call("tex", "misc/props_noise") if false else null
			q.material = m
			ps.mesh = q
			ps.local_coords = false
			add_child(ps)
			n += 1
			break
	info["spray"] = n


func _air(p: Node3D) -> void:
	var t: String = str((p.get("info") as Dictionary).get("time", "golden"))
	if t == "day":
		return
	var month: int = int(Time.get_datetime_dict_from_system()["month"])
	var leaves: bool = str(p.get("climate")) in ["temperate_maritime", "humid_continental"] and month >= 9 and month <= 11
	var ps := CPUParticles3D.new()
	ps.name = "leaves" if leaves else "motes"
	ps.amount = 40 if leaves else 60
	ps.lifetime = 7.0
	ps.preprocess = 7.0
	ps.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	ps.emission_box_extents = Vector3(22.0, 5.0, 22.0)
	ps.position = Vector3(0, 5.0, -6.0)
	ps.direction = Vector3(1, -0.3, 0.2)
	ps.spread = 40.0
	ps.initial_velocity_min = 0.3
	ps.initial_velocity_max = 1.0
	ps.gravity = Vector3(0.2, -0.35 if leaves else 0.02, 0.1)
	ps.angular_velocity_min = -90.0
	ps.angular_velocity_max = 90.0
	var q := QuadMesh.new()
	q.size = Vector2(0.14, 0.1) if leaves else Vector2(0.05, 0.05)
	var m := StandardMaterial3D.new()
	m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	if leaves:
		m.albedo_color = Color(0.72, 0.45, 0.2)
		m.vertex_color_use_as_albedo = true
		ps.color_ramp = _leaf_ramp()
	else:
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		m.albedo_color = Color(1.0, 0.88, 0.65, 0.35)
	q.material = m
	ps.mesh = q
	add_child(ps)
	info["air"] = ps.name


static func _leaf_ramp() -> Gradient:
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.5, 1.0])
	g.colors = PackedColorArray([Color(0.85, 0.55, 0.22), Color(0.7, 0.4, 0.18), Color(0.8, 0.62, 0.3)])
	return g


func _process(dt: float) -> void:
	_move(dt)


func _move(dt: float) -> void:
	_t += dt
	for c: Array in _cars:
		var line: PackedVector2Array = c[1]
		var cum: PackedFloat32Array = c[2]
		var total: float = cum[cum.size() - 1]
		c[5] = fposmod(float(c[5]) + float(c[3]) * dt, total)
		var s: float = c[5]
		var k: int = 0
		while k < cum.size() - 2 and cum[k + 1] < s:
			k += 1
		var a: Vector2 = line[k]
		var b: Vector2 = line[k + 1]
		var seg: float = maxf(0.01, cum[k + 1] - cum[k])
		var d: Vector2 = (b - a) / seg
		var q: Vector2 = a.lerp(b, (s - cum[k]) / seg) + Vector2(-d.y, d.x) * float(c[4])
		(c[0] as MeshInstance3D).transform = Transform3D(Basis(Vector3.UP, atan2(d.x, d.y)), Vector3(q.x, 0, q.y)) * (c[6] as Transform3D)
	if _npcs != null:
		for i in _npc_paths.size():
			var s2: Array = _npc_paths[i]
			var walk: float = s2[3]
			var x: float = 0.0
			if walk > 0.0:
				var per: float = float(s2[2]) * 2.0 / walk
				var ph: float = fposmod(_t + float(s2[4]), per) / per
				x = (1.0 - absf(ph * 2.0 - 1.0)) * float(s2[2])
			var q2: Vector2 = (s2[0] as Vector2) + (s2[1] as Vector2) * x
			_npcs.set_instance_transform(i, Transform3D(Basis(), Vector3(q2.x, 0.0, q2.y)))
	if _birds != null:
		for i in _bird_par.size():
			var b2: Array = _bird_par[i]
			var ang: float = float(b2[3]) + _t * float(b2[2])
			var r: float = float(b2[1])
			var pos: Vector3 = _bird_c + Vector3(cos(ang) * r, float(b2[0]) + sin(_t * 0.7 + i) * 1.5, sin(ang) * r)
			var fwd: Vector3 = Vector3(-sin(ang), 0, cos(ang)) * signf(float(b2[2]))
			_birds.set_instance_transform(i, Transform3D(Basis.looking_at(fwd, Vector3.UP).scaled(Vector3.ONE * float(b2[4])), pos))
