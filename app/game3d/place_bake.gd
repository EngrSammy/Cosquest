extends RefCounted
## look-world (audit issue 4, art direction 3 and 8): the place's cast shadows and contact AO, baked once
## at build time into one ground texture, so they cost nothing per frame.
##  - R: cast shadow. Every building's footprint swept along the sun (its walls' shadow quads), the
##    landmarks', trees' and lamp posts' shadows, drawn white and opaque-additive: overlaps saturate,
##    they never double-darken.
##  - G: contact AO. A soft band at the foot of every wall, round landmarks and trees, on the road side
##    of every kerb.
## The two meshes are drawn once, top-down and orthographic, by a SubViewport with its own world
## (UPDATE_ONCE) into a 1024 px texture over BAKE_SIZE metres round the fight; world_ground.gdshader reads
## it (the shadow takes the sun's direct light away, the AO tints towards the preset's contact-AO colour).
## The sun's direction is the time preset's (arena.gd key_dir), so dusk shadows are long.

const ArenaScript := preload("res://arena.gd")
const BAKE_SIZE: float = 440.0
const BAKE_CENTER := Vector2(0.0, -80.0)
const BAKE_PX: int = 1024

var _sh: SurfaceTool
var _ao: SurfaceTool
var _sun: Vector2          # metres of shadow on the ground per metre of height
var _mats: Array = []
var _n: int = 0
var viewport: SubViewport


func setup(_p: Node3D, _quality: String) -> void:
	var d: Vector3 = ArenaScript.key_dir()
	_sun = Vector2(d.x, d.z) / maxf(0.12, -d.y)
	_sh = SurfaceTool.new()
	_sh.begin(Mesh.PRIMITIVE_TRIANGLES)
	_ao = SurfaceTool.new()
	_ao.begin(Mesh.PRIMITIVE_TRIANGLES)


func register(m: ShaderMaterial) -> void:
	_mats.append(m)


func _tri(st: SurfaceTool, a: Vector2, b: Vector2, c: Vector2, ca: float, cb: float, cc: float) -> void:
	for pr: Array in [[a, ca], [b, cb], [c, cc]]:
		var v: Vector2 = pr[0]
		st.set_color(Color(float(pr[1]), float(pr[1]), float(pr[1]), 1.0))
		st.add_vertex(Vector3(v.x, 0.0, v.y))


func _quad(st: SurfaceTool, a: Vector2, b: Vector2, c: Vector2, d: Vector2, ca: float, cb: float, cc: float, cd: float) -> void:
	_tri(st, a, b, c, ca, cb, cc)
	_tri(st, a, c, d, ca, cc, cd)
	_n += 1


func building(poly: PackedVector2Array, base: float, h: float) -> void:
	var s0: Vector2 = _sun * base
	var s1: Vector2 = _sun * h
	var tri: PackedInt32Array = Geometry2D.triangulate_polygon(poly)
	for k in range(0, tri.size(), 3):
		_tri(_sh, poly[tri[k]] + s1, poly[tri[k + 1]] + s1, poly[tri[k + 2]] + s1, 1.0, 1.0, 1.0)
		if base < 0.5:
			_tri(_sh, poly[tri[k]], poly[tri[k + 1]], poly[tri[k + 2]], 1.0, 1.0, 1.0)
	var ccw: bool = _area(poly) > 0.0
	for i in poly.size():
		var a: Vector2 = poly[i]
		var b: Vector2 = poly[(i + 1) % poly.size()]
		_quad(_sh, a + s0, b + s0, b + s1, a + s1, 1.0, 1.0, 1.0, 1.0)
		if base < 0.5:
			var d: Vector2 = (b - a).normalized()
			var n: Vector2 = Vector2(d.y, -d.x) if ccw else Vector2(-d.y, d.x)
			var w: float = clampf(h * 0.12, 0.8, 1.6)
			_quad(_ao, a - d * 0.3, b + d * 0.3, b + n * w + d * 0.3, a + n * w - d * 0.3, 0.9, 0.9, 0.0, 0.0)


static func _area(p: PackedVector2Array) -> float:
	var a: float = 0.0
	for i in p.size():
		a += p[i].x * p[(i + 1) % p.size()].y - p[(i + 1) % p.size()].x * p[i].y
	return a


## A landmark: a disc of contact shade at its foot and its shadow along the sun, `r` its footprint.
func landmark(p: Vector2, r: float, h: float) -> void:
	_disc(_ao, p, r * 1.25, 0.7, 0.0)
	_disc(_sh, p + _sun * minf(h, 3.0) * 0.5, r * 0.8, 1.0, 1.0)
	var w: float = clampf(r * 0.35, 0.6, 2.4)
	var dir: Vector2 = _sun.normalized()
	var nrm := Vector2(-dir.y, dir.x)
	var tip: Vector2 = p + _sun * h
	_quad(_sh, p - nrm * w, p + nrm * w, tip + nrm * w * 0.5, tip - nrm * w * 0.5, 1.0, 1.0, 0.85, 0.85)


## A tree: a soft canopy shadow cast along the sun, and a little AO at the trunk.
func tree(p: Vector2, h: float, r: float) -> void:
	_disc(_sh, p + _sun * h * 0.62, r * 0.85, 0.8, 0.25)
	_disc(_ao, p, 0.9, 0.5, 0.0)


## A thin upright (a lamp post, a traffic light): its long shadow.
func post(p: Vector2, h: float, w: float = 0.14) -> void:
	var dir: Vector2 = _sun.normalized()
	var nrm := Vector2(-dir.y, dir.x)
	var tip: Vector2 = p + _sun * h
	_quad(_sh, p - nrm * w, p + nrm * w, tip + nrm * w, tip - nrm * w, 0.85, 0.85, 0.6, 0.6)


## A prop on the ground (a car, a bench, a phone box): its footprint shadow and contact.
func blob(p: Vector2, r: float, h: float) -> void:
	_disc(_sh, p + _sun * h * 0.5, r, 0.85, 0.3)
	_disc(_ao, p, r * 1.1, 0.5, 0.0)


func kerb(a: Vector2, b: Vector2, n_out: Vector2) -> void:
	# the road side of the kerb (n_out points onto the pavement)
	_quad(_ao, a, b, b - n_out * 0.4, a - n_out * 0.4, 0.5, 0.5, 0.0, 0.0)


func _disc(st: SurfaceTool, c: Vector2, r: float, inner: float, outer: float) -> void:
	var seg: int = 12
	for i in seg:
		var a0: float = TAU * i / seg
		var a1: float = TAU * (i + 1) / seg
		var p0: Vector2 = c + Vector2(cos(a0), sin(a0)) * r
		var p1: Vector2 = c + Vector2(cos(a1), sin(a1)) * r
		_tri(st, c, p0, p1, inner, outer, outer)


## day1-world: the two bake meshes, committed off the main thread (place.gd _work).
var _meshes: Array = []


func prepare(_p: Node3D) -> void:
	_meshes = []
	for pair: Array in [[_sh, Color(1, 0, 0)], [_ao, Color(0, 1, 0)]]:
		var mesh: ArrayMesh = (pair[0] as SurfaceTool).commit()
		if mesh.get_surface_count() > 0:
			_meshes.append([mesh, pair[1]])
	_sh = null
	_ao = null


## On the main thread: the SubViewport that draws the bake once.
func commit(p: Node3D) -> void:
	var rect := Vector4(BAKE_CENTER.x - BAKE_SIZE * 0.5, BAKE_CENTER.y - BAKE_SIZE * 0.5, BAKE_SIZE, BAKE_SIZE)
	viewport = SubViewport.new()
	viewport.name = "ShadeBake"
	viewport.size = Vector2i(BAKE_PX, BAKE_PX)
	viewport.own_world_3d = true
	viewport.transparent_bg = false
	viewport.msaa_3d = Viewport.MSAA_DISABLED
	viewport.render_target_clear_mode = SubViewport.CLEAR_MODE_ONCE
	viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color.BLACK
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	var we := WorldEnvironment.new()
	we.environment = env
	viewport.add_child(we)
	var cam := Camera3D.new()
	cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	cam.size = BAKE_SIZE
	cam.near = 1.0
	cam.far = 200.0
	# looking straight down; image x = world x, image y (down) = world z
	cam.transform = Transform3D(Basis(Vector3(1, 0, 0), Vector3(0, 0, -1), Vector3(0, 1, 0)), Vector3(BAKE_CENTER.x, 100.0, BAKE_CENTER.y))
	viewport.add_child(cam)
	cam.current = true
	if _sh != null:
		prepare(p)
	for pair: Array in _meshes:
		var mesh: ArrayMesh = pair[0]
		var m := StandardMaterial3D.new()
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		m.vertex_color_use_as_albedo = true
		m.albedo_color = pair[1]
		m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.no_depth_test = true
		m.cull_mode = BaseMaterial3D.CULL_DISABLED
		m.disable_fog = true
		var mi := MeshInstance3D.new()
		mi.mesh = mesh
		mi.material_override = m
		viewport.add_child(mi)
	p.add_child(viewport)
	viewport.render_target_update_mode = SubViewport.UPDATE_ONCE
	var t: Texture2D = viewport.get_texture()
	for sm: ShaderMaterial in _mats:
		sm.set_shader_parameter("bake_tex", t)
		sm.set_shader_parameter("bake_rect", rect)
	p.get("info")["bake_quads"] = _n
