extends Node3D
## Combat FX for the Compatibility renderer (cq 061, reworked in cq 233, rebuilt in cq 013).
## Everything is pooled (built once in _ready, reused round-robin: no node churn per hit) and
## drawn with three shaders in premultiplied alpha, so one draw is both a coloured body that
## keeps its colour on the light paving and an additive glow (the effects' own bloom; there
## is no full-screen glow pass, see docs/game3d/EFFECTS.md):
##   vfx/fx_card.gdshader  cards and particles, one cell of art/fx/fx_atlas.png each
##   vfx/fx_arc.gdshader   slash crescents and weapon ribbons (core, body, halo, energy)
##   vfx/fx_beam.gdshader  the SPLIT beam and the RALLY column
## Particles are CPUParticles3D (one draw each, no transform-feedback pass on GLES3).
## Effects never touch the fight's seeded RNG (global randf() only), so results are unchanged.

const TELEGRAPH_SHADER := preload("res://vfx/telegraph.gdshader")
const CARD_SHADER := preload("res://vfx/fx_card.gdshader")
const CARD_TOP_SHADER := preload("res://vfx/fx_card_top.gdshader")
const ARC_SHADER := preload("res://vfx/fx_arc.gdshader")
const BEAM_SHADER := preload("res://vfx/fx_beam.gdshader")
const T_ATLAS := preload("res://art/fx/fx_atlas.png")
const T_TILE := preload("res://art/fx/fx_tile.png")
const T_GLOW := preload("res://art/fx/vfx_glow.png")
const T_COIN := preload("res://art/fx/vfx_coin.png")

# fx_atlas.png cells (tools/fx/make_fx_art.py)
enum { GLOW, STAR4, BURST, SPARKLE, STREAK, RING, PUFF, SCORCH, CRACK, SWIRL, LINES, HALO, PLUS, SHARD, FLAME, DOT }

const TRAIL_LIFE: float = 0.18   # look-fight: an arc trail fades over 180 ms (art direction 7)
const WHITE_HOT := Color(1.0, 0.98, 0.92)

## Slash colours per weapon class: [body, glow]. The heavy third hit is always gold.
const CLASS_COLS: Dictionary = {
	"blade": [Color(0.2, 0.55, 1.0), Color(0.45, 0.82, 1.0)],
	"heavy": [Color(1.0, 0.45, 0.1), Color(1.0, 0.72, 0.3)],
	"staff": [Color(0.72, 0.3, 1.0), Color(0.88, 0.6, 1.0)],
	"gun": [Color(1.0, 0.8, 0.3), Color(1.0, 0.92, 0.6)],
}
const GOLD := [Color(1.0, 0.62, 0.08), Color(1.0, 0.86, 0.4)]

## Pool sizes = the per-effect budget (docs/game3d/EFFECTS.md). A pool reuses its oldest
## node when every one is busy, so a flurry can never grow the scene.
const N_ARCS := 12
const N_CARDS := 48
const N_TOP := 20
const N_DECALS := 12
const N_BEAMS := 4

var _arc_mesh: ArrayMesh
var _arcs: Array[MeshInstance3D] = []
var _cards: Array[MeshInstance3D] = []
var _tops: Array[MeshInstance3D] = []       # cards drawn over the fighters (hit flashes)
var _decals: Array[MeshInstance3D] = []
var _beams: Array[MeshInstance3D] = []
var _coins: Array[MeshInstance3D] = []
var _teles: Array[MeshInstance3D] = []
var _parts: Dictionary = {}        # kind -> Array[CPUParticles3D]
var _next: Dictionary = {}
var _live: Array[Dictionary] = []
var _trails: Dictionary = {}        # key -> {mi, mesh, samples: Array[[t, base, tip]], tint}
var _clock: float = 0.0
var _pending: Array[Dictionary] = []   # delayed bursts (SPLIT crack, KO coins)
var _emit_until: Dictionary = {}       # CPUParticles3D -> clock when its burst is over
var peak_parts: int = 0
var peak_live: int = 0


func _ready() -> void:
	_arc_mesh = _crescent(40)
	for i in N_ARCS:
		var am := ShaderMaterial.new()
		am.shader = ARC_SHADER
		am.set_shader_parameter("tile", T_TILE)
		_arcs.append(_make_mi(_arc_mesh, am))
		_arcs[-1].set_meta("no_bloom", true)   # cq 016: the arcs carry their own halo; bloomed they white out the fighters
	var q := QuadMesh.new()
	q.size = Vector2(1.0, 1.0)
	for i in N_CARDS:
		_cards.append(_make_mi(q, _card_mat(GLOW, 0.6)))
	for i in N_TOP:
		_tops.append(_make_mi(q, _card_mat(GLOW, 0.6, 1, true)))
	for i in N_DECALS:
		_decals.append(_make_mi(q, _card_mat(SCORCH, 0.0, 0)))
	var bq := QuadMesh.new()
	bq.size = Vector2(1.0, 1.0)
	bq.center_offset = Vector3(0, 0.5, 0)   # stands on the ground
	for i in N_BEAMS:
		var bm := ShaderMaterial.new()
		bm.shader = BEAM_SHADER
		bm.set_shader_parameter("tile", T_TILE)
		_beams.append(_make_mi(bq, bm))
	for i in 6:
		var cm := StandardMaterial3D.new()
		cm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		cm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		cm.albedo_texture = T_COIN
		cm.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
		cm.billboard_keep_scale = true
		cm.disable_receive_shadows = true
		_coins.append(_make_mi(_quad(0.55), cm))
	for i in 4:
		var mi := _make_mi(_flat_quad(2.0), null)
		var sm := ShaderMaterial.new()
		sm.shader = TELEGRAPH_SHADER
		mi.material_override = sm
		_teles.append(mi)
	# particles: [kind, count per system, systems, cell, size (w, h), add, billboard, over the fighters]
	for spec: Array in [
		["spark_s", 10, 4, STREAK, Vector2(0.09, 0.55), 0.9, 2, true],
		["spark_m", 18, 4, STREAK, Vector2(0.11, 0.7), 0.9, 2, true],
		["spark_l", 30, 3, STREAK, Vector2(0.13, 0.9), 0.9, 2, true],
		["glint", 8, 4, SPARKLE, Vector2(0.6, 0.6), 1.0, 1, true],
		["dust", 10, 5, PUFF, Vector2(0.9, 0.9), 0.0, 1],
		["mote", 26, 2, PLUS, Vector2(0.22, 0.22), 0.7, 1],
		["sparkle", 18, 3, SPARKLE, Vector2(0.38, 0.38), 1.0, 1],
		["shard", 16, 2, SHARD, Vector2(0.22, 0.34), 0.6, 1],
		["ember", 16, 2, DOT, Vector2(0.14, 0.14), 1.0, 1],
	]:
		var arr: Array = []
		var mesh := QuadMesh.new()
		mesh.size = spec[4]
		mesh.material = _card_mat(int(spec[3]), float(spec[5]), int(spec[6]), spec.size() > 7 and bool(spec[7]))
		for i in int(spec[2]):
			arr.append(_make_parts(int(spec[1]), mesh))
		_parts[spec[0]] = arr
	_tune_parts()
	for k: String in _parts:
		for p: CPUParticles3D in _parts[k]:
			p.set_meta("r0", p.emission_sphere_radius)
	_warm.call_deferred()


## Draws every effect material once, fully transparent, on the first frames (during loading),
## so their shaders compile then and not on the first SPLIT or crit (a hitch on a phone).
func _warm() -> void:
	var clear := Color(1, 1, 1, 0)
	var at := Vector3(0, 1.0, 0)
	card(GLOW, at, clear, 0.1, 0.1, 0.1)
	card(GLOW, at, clear, 0.1, 0.1, 0.1, {"top": true})
	card(GLOW, at, clear, 0.1, 0.1, 0.1, {"flat": true, "decal": true})
	var arc := slash(at, 0.0, [clear, clear], 0.1, 0.0, 0.1)
	(arc.material_override as ShaderMaterial).set_shader_parameter("alpha", 0.0)
	var b := beam(at, 0.1, 0.1, clear, clear, 0.1)
	(b.material_override as ShaderMaterial).set_shader_parameter("alpha", 0.0)
	trail_push("warm", at, at + Vector3(0, 0.1, 0), [clear, clear])
	trail_push("warm", at + Vector3(0.1, 0, 0), at + Vector3(0.1, 0.1, 0), [clear, clear])
	for k: String in _parts:
		_emit(k, at, clear)
	var t := telegraph(at, 0.0, 0.1, 180.0, 0.1, clear)
	telegraph_end(t, false)


func _card_mat(cell: int, add: float, billboard: int = 1, top: bool = false) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = CARD_TOP_SHADER if top else CARD_SHADER
	m.set_shader_parameter("atlas", T_ATLAS)
	m.set_shader_parameter("cell", float(cell))
	m.set_shader_parameter("add", add)
	m.set_shader_parameter("billboard", billboard)
	return m


## cq 016: the cheap bloom's visual layer (bloom.gd sets it); 0 = no bloom.
var bloom_layer: int = 0


func _make_mi(mesh: Mesh, mat: Material) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.visible = false
	add_child(mi)
	return mi


static func _quad(s: float) -> QuadMesh:
	var q := QuadMesh.new()
	q.size = Vector2(s, s)
	return q


static func _flat_quad(s: float) -> PlaneMesh:
	var p := PlaneMesh.new()
	p.size = Vector2(s, s)
	return p


func _make_parts(n: int, mesh: QuadMesh) -> CPUParticles3D:
	var p := CPUParticles3D.new()
	p.one_shot = true
	p.emitting = false
	p.amount = n
	p.lifetime = 0.4
	p.explosiveness = 1.0
	p.local_coords = false
	p.direction = Vector3.UP
	p.spread = 180.0
	p.gravity = Vector3(0.0, -9.0, 0.0)
	p.mesh = mesh
	var g := Gradient.new()
	g.set_color(0, Color(1, 1, 1, 1))
	g.set_color(1, Color(1, 1, 1, 0))
	p.color_ramp = g
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	p.visible = false
	add_child(p)
	return p


func _curve(a: float, b: float, c: float) -> Curve:
	var cv := Curve.new()
	cv.add_point(Vector2(0.0, a))
	cv.add_point(Vector2(0.35, b))
	cv.add_point(Vector2(1.0, c))
	return cv


func _tune_parts() -> void:
	for k: String in ["spark_s", "spark_m", "spark_l"]:
		var v: Vector2 = {"spark_s": Vector2(4.0, 8.0), "spark_m": Vector2(5.0, 10.5), "spark_l": Vector2(6.0, 13.5)}[k]
		for p: CPUParticles3D in _parts[k]:
			p.particle_flag_align_y = true
			p.initial_velocity_min = v.x
			p.initial_velocity_max = v.y
			p.damping_min = 6.0
			p.damping_max = 12.0
			p.gravity = Vector3(0, -7.0, 0)
			p.lifetime = 0.32
			p.scale_amount_min = 0.7
			p.scale_amount_max = 1.3
			p.scale_amount_curve = _curve(1.0, 0.8, 0.1)
	for p: CPUParticles3D in _parts["glint"]:
		p.initial_velocity_min = 1.0
		p.initial_velocity_max = 3.0
		p.gravity = Vector3(0, -1.0, 0)
		p.lifetime = 0.45
		p.scale_amount_min = 0.5
		p.scale_amount_max = 1.2
		p.scale_amount_curve = _curve(0.3, 1.0, 0.0)
		p.angle_min = 0.0
		p.angle_max = 45.0
	for p: CPUParticles3D in _parts["dust"]:
		p.direction = Vector3.UP
		p.spread = 85.0
		p.initial_velocity_min = 0.8
		p.initial_velocity_max = 2.6
		p.damping_min = 2.0
		p.damping_max = 4.0
		p.gravity = Vector3(0, 0.4, 0)
		p.lifetime = 0.75
		p.scale_amount_min = 0.6
		p.scale_amount_max = 1.4
		p.scale_amount_curve = _curve(0.4, 1.0, 1.4)
		p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
		p.emission_sphere_radius = 0.35
	for p: CPUParticles3D in _parts["mote"]:
		p.gravity = Vector3(0, 3.2, 0)
		p.lifetime = 1.0
		p.emission_shape = CPUParticles3D.EMISSION_SHAPE_RING
		p.emission_ring_axis = Vector3.UP
		p.emission_ring_radius = 0.75
		p.emission_ring_inner_radius = 0.1
		p.emission_ring_height = 0.2
		p.direction = Vector3.UP
		p.spread = 12.0
		p.initial_velocity_min = 0.6
		p.initial_velocity_max = 1.8
		p.explosiveness = 0.55
		p.scale_amount_min = 0.6
		p.scale_amount_max = 1.3
		p.scale_amount_curve = _curve(0.2, 1.0, 0.3)
	for p: CPUParticles3D in _parts["sparkle"]:
		p.gravity = Vector3(0, 0.6, 0)
		p.lifetime = 0.9
		p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
		p.emission_sphere_radius = 0.7
		p.initial_velocity_min = 0.6
		p.initial_velocity_max = 2.2
		p.explosiveness = 0.7
		p.damping_min = 1.0
		p.damping_max = 2.0
		p.scale_amount_min = 0.4
		p.scale_amount_max = 1.3
		p.scale_amount_curve = _curve(0.0, 1.0, 0.0)
	for p: CPUParticles3D in _parts["shard"]:
		p.gravity = Vector3(0, -9.0, 0)
		p.lifetime = 0.6
		p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE_SURFACE
		p.emission_sphere_radius = 1.0
		p.direction = Vector3.UP
		p.spread = 70.0
		p.initial_velocity_min = 2.0
		p.initial_velocity_max = 4.5
		p.angular_velocity_min = -400.0
		p.angular_velocity_max = 400.0
		p.scale_amount_min = 0.6
		p.scale_amount_max = 1.4
	for p: CPUParticles3D in _parts["ember"]:
		p.gravity = Vector3(0, 2.0, 0)
		p.lifetime = 0.7
		p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
		p.emission_sphere_radius = 0.6
		p.initial_velocity_min = 1.5
		p.initial_velocity_max = 4.0
		p.damping_min = 2.0
		p.damping_max = 4.0
		p.scale_amount_curve = _curve(1.0, 0.8, 0.0)


func _pick(pool: Array, key: String) -> Variant:
	var i: int = int(_next.get(key, 0))
	_next[key] = (i + 1) % pool.size()
	return pool[i]


func _emit(kind: String, at: Vector3, col: Color, dir: Vector3 = Vector3.ZERO, spread: float = -1.0) -> CPUParticles3D:
	var p: CPUParticles3D = _pick(_parts[kind], kind)
	p.position = at
	p.color = col
	if dir != Vector3.ZERO:
		p.direction = dir.normalized()
	if spread >= 0.0:
		p.spread = spread
	if p.has_meta("r0"):
		p.emission_sphere_radius = float(p.get_meta("r0"))   # a caller may widen it for one burst
	p.visible = true
	p.restart()
	p.emitting = true
	_emit_until[p] = _clock + p.lifetime + 0.05
	return p


## A crescent in the XZ plane opening towards +Z, edge radius 1. UV.x along the swing (0 at
## the start, 1 at the leading edge), UV.y across (0 inner, 0.72 the cutting edge, 1 halo).
## Thick in the middle, pointed at both ends, like the reference's arcs.
static func _crescent(seg: int) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var rows: Array = []
	for i in seg + 1:
		var u: float = float(i) / float(seg)
		var a: float = deg_to_rad(-80.0 + 160.0 * u)
		var w: float = pow(maxf(sin(PI * u), 0.0), 0.7)
		var d := Vector3(sin(a), 0.0, cos(a))
		rows.append([d * (1.0 - 0.5 * w - 0.02), d * 1.0, d * (1.0 + 0.3 * (0.25 + 0.75 * w)), u])
	var vs: Array[float] = [0.0, 0.72, 1.0]
	for i in seg:
		for j in 2:
			var a0: Vector3 = rows[i][j]
			var a1: Vector3 = rows[i][j + 1]
			var b0: Vector3 = rows[i + 1][j]
			var b1: Vector3 = rows[i + 1][j + 1]
			var u0: float = rows[i][3]
			var u1: float = rows[i + 1][3]
			for p: Array in [[a0, u0, vs[j]], [a1, u0, vs[j + 1]], [b1, u1, vs[j + 1]], [a0, u0, vs[j]], [b1, u1, vs[j + 1]], [b0, u1, vs[j]]]:
				st.set_uv(Vector2(p[1], p[2]))
				st.add_vertex(p[0])
	return st.commit()


func _start(mi: Node3D, life: float, kind: String, size: float, tint: Color, extra: Dictionary = {}) -> Dictionary:
	for d: Dictionary in _live:
		if d["node"] == mi:
			_live.erase(d)
			break
	var d := {"node": mi, "t": 0.0, "life": life, "kind": kind, "size": size, "tint": tint}
	d.merge(extra)
	_live.append(d)
	return d


## A card: one atlas cell, billboard (bb 1), flat on the ground (bb 0, node turned flat) or
## upright (bb 3). Scale s0 -> s1 (eased by sp), alpha up over `fin` of its life then down.
func card(cell: int, at: Vector3, tint: Color, life: float, s0: float, s1: float, opts: Dictionary = {}) -> MeshInstance3D:
	var flat: bool = bool(opts.get("flat", false))
	var pool: String = "decal" if bool(opts.get("decal", false)) else ("top" if bool(opts.get("top", false)) else "card")
	var mi: MeshInstance3D = _pick({"decal": _decals, "top": _tops, "card": _cards}[pool], pool)
	var m := mi.material_override as ShaderMaterial
	m.set_shader_parameter("cell", float(cell))
	m.set_shader_parameter("add", float(opts.get("add", 0.7)))
	m.set_shader_parameter("hot", float(opts.get("hot", 0.0)))
	m.set_shader_parameter("intensity", float(opts.get("intensity", 1.0)))
	m.set_shader_parameter("billboard", 0 if flat else int(opts.get("bb", 1)))
	var spin0: float = float(opts.get("rot", randf() * TAU if bool(opts.get("rand_rot", false)) else 0.0))
	m.set_shader_parameter("spin", spin0)
	m.set_shader_parameter("tint", tint)
	mi.position = at
	if bloom_layer != 0:
		# cq 016: the cheap bloom takes the standing cards (flashes, bursts, glows), not the big
		# flat ground rings and swirls (under the fighters: blooming them washes the fighters out)
		mi.layers = 1 | (0 if flat else bloom_layer)
	var aspect: Vector2 = opts.get("aspect", Vector2.ONE)
	if flat:
		mi.basis = Basis(Vector3.UP, spin0) * Basis(Vector3.RIGHT, -PI * 0.5)
	else:
		mi.basis = Basis.IDENTITY
	mi.scale = Vector3(s0 * aspect.x, s0 * aspect.y, 1.0)
	mi.visible = true
	_start(mi, life, "card", s0, tint, {"s0": s0, "s1": s1, "sp": float(opts.get("sp", 0.4)), "fin": float(opts.get("fin", 0.08)),
		"fp": float(opts.get("fp", 1.4)), "spin": float(opts.get("spin", 0.0)), "spin0": spin0, "flat": flat, "aspect": aspect,
		"vel": opts.get("vel", Vector3.ZERO)})
	return mi


# ---------------------------------------------------------------- slash arcs

## A swing crescent, sized to the swing (radius ~ the reach: about a fighter's height), at
## chest height, facing yaw, tilted along the swing plane. Sweeps in over the first third
## of its life, then the tail catches up. cols = [body, glow] (CLASS_COLS / GOLD); a bare
## Color tint (older callers) gets a lighter glow. Returns the node (the latency rig times
## the press frame on it).
func slash(at: Vector3, yaw: float, tint: Variant, size: float, tilt: float, life: float = 0.26, echo: bool = false) -> MeshInstance3D:
	var cols: Array = tint if tint is Array else [tint, (tint as Color).lerp(Color.WHITE, 0.45)]
	var mi: MeshInstance3D = _pick(_arcs, "arc")
	mi.position = at
	mi.basis = Basis(Vector3.UP, yaw) * Basis(Vector3(0, 0, 1), tilt)
	mi.scale = Vector3.ONE * size
	var m := mi.material_override as ShaderMaterial
	m.set_shader_parameter("tint", cols[0])
	m.set_shader_parameter("glow", cols[1])
	m.set_shader_parameter("head", 0.0)
	m.set_shader_parameter("tail_len", 1.2)
	m.set_shader_parameter("alpha", 1.0)
	m.set_shader_parameter("core", 1.0)
	m.set_shader_parameter("halo", 1.3)
	m.set_shader_parameter("body", 0.95)
	mi.visible = true
	_start(mi, life, "arc", size, cols[0], {"spin": 0.0})
	if echo:
		# a thin bright stroke just outside the crescent, a beat behind it (the reference's
		# concentric strokes): core and halo only, no body
		var e: MeshInstance3D = _pick(_arcs, "arc")
		e.position = at + Vector3(0, 0.08, 0)
		e.basis = mi.basis * Basis(Vector3.UP, -0.12)
		e.scale = Vector3.ONE * size * 1.14
		var em := e.material_override as ShaderMaterial
		em.set_shader_parameter("tint", cols[1])
		em.set_shader_parameter("glow", cols[1])
		em.set_shader_parameter("head", 0.0)
		em.set_shader_parameter("tail_len", 1.2)
		em.set_shader_parameter("alpha", 1.0)
		em.set_shader_parameter("core", 0.8)
		em.set_shader_parameter("halo", 0.7)
		em.set_shader_parameter("body", 0.0)
		e.visible = true
		_start(e, life * 1.15, "arc", size * 1.14, cols[1], {"spin": 0.0})
	return mi


## Starts `key`'s trail afresh (a new swing never joins the last one's ribbon).
func trail_cut(key: String) -> void:
	if _trails.has(key):
		(_trails[key]["samples"] as Array).clear()


## Adds a hilt/tip pair to `key`'s ribbon (call every frame of a swing; the caller fills in
## between frames). cols: [body, glow] or a Color. halo: how far the glow reaches past the
## tip, in metres.
func trail_push(key: String, base: Vector3, tip: Vector3, tint: Variant, t_back: float = 0.0, halo: float = 0.35) -> void:
	var cols: Array = tint if tint is Array else [tint, (tint as Color).lerp(Color.WHITE, 0.45)]
	var tr: Dictionary = _trails.get(key, {})
	if tr.is_empty():
		var mi := MeshInstance3D.new()
		var im := ImmediateMesh.new()
		mi.mesh = im
		var sm := ShaderMaterial.new()
		sm.shader = ARC_SHADER
		sm.set_shader_parameter("tile", T_TILE)
		sm.set_shader_parameter("head", 1.0)
		sm.set_shader_parameter("tail_len", 1.0)
		mi.material_override = sm
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(mi)
		tr = {"mi": mi, "mesh": im, "samples": []}
		_trails[key] = tr
	var s: Array = tr["samples"]
	s.append([_clock - t_back, base, tip, halo])
	var trm := (tr["mi"] as MeshInstance3D).material_override as ShaderMaterial
	trm.set_shader_parameter("tint", cols[0])
	trm.set_shader_parameter("glow", cols[1])
	trm.set_shader_parameter("core", 0.45 if cols.size() > 2 else 1.0)   # a third entry: a softer core (CHARGE)


func _draw_trails() -> void:
	for key: String in _trails:
		var tr: Dictionary = _trails[key]
		var s: Array = tr["samples"]
		while not s.is_empty() and _clock - float(s[0][0]) > TRAIL_LIFE:
			s.pop_front()
		var im: ImmediateMesh = tr["mesh"]
		im.clear_surfaces()
		var mi: MeshInstance3D = tr["mi"]
		mi.visible = s.size() >= 2
		if s.size() < 2:
			continue
		im.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
		var prev: Array = []
		for i in s.size():
			var age: float = clampf((_clock - float(s[i][0])) / TRAIL_LIFE, 0.0, 1.0)
			var b: Vector3 = s[i][1]
			var t: Vector3 = s[i][2]
			var h: Vector3 = t + (t - b).normalized() * float(s[i][3]) * (1.0 - age * 0.5)
			var row: Array = [b, t, h, 1.0 - age]
			if not prev.is_empty():
				for j in 2:
					var vj: Array[float] = [0.0, 0.72, 1.0]
					for p: Array in [[prev, j], [row, j], [row, j + 1], [prev, j], [row, j + 1], [prev, j + 1]]:
						var r: Array = p[0]
						im.surface_set_uv(Vector2(r[3], vj[p[1]]))
						im.surface_add_vertex(r[p[1]])
			prev = row
		im.surface_end()


## Gun class: a muzzle flash at the barrel and a tracer to the target instead of an arc.
func muzzle(at: Vector3, to: Vector3, cols: Array) -> MeshInstance3D:
	var mi := card(STAR4, at, cols[1], 0.12, 0.9, 1.4, {"top": true, "add": 0.9, "hot": 1.0, "rand_rot": true})
	card(GLOW, at, cols[0], 0.16, 0.8, 1.6, {"top": true, "add": 1.0})
	# the tracer: a thin ribbon along the shot, newest at the target end, fading back to the barrel
	var dir: Vector3 = to - at
	var side: Vector3 = dir.cross(Vector3.UP).normalized() * 0.1
	var n: int = 6
	trail_cut("tracer")
	for i in n + 1:
		var p: Vector3 = at + dir * (float(i) / n)
		trail_push("tracer", p - side, p + side, cols, float(n - i) / n * 0.12, 0.12)
	card(GLOW, to, cols[1], 0.18, 0.6, 1.2, {"top": true, "add": 1.0})
	return mi


# ---------------------------------------------------------------- hits

## A hit, scaled to the damage (a 60 jab is a flick, a 250 slam a burst): a white-hot star
## and a glow halo on contact, streak sparks thrown away from the attacker, and for a crit a
## spiky burst, radial streaks and glints. `away` points from the attacker to the target.
func sparks(at: Vector3, tint: Color, dmg: int, crit: bool = false, away: Vector3 = Vector3.ZERO) -> void:
	var tier: int = 0 if dmg < 110 else (1 if dmg < 190 else 2)
	if crit:
		tier = maxi(tier, 1)
	var key: String = ["spark_s", "spark_m", "spark_l"][tier]
	var dir: Vector3 = (away.normalized() + Vector3(0, 0.6, 0)) if away != Vector3.ZERO else Vector3.UP
	_emit(key, at, tint.lerp(Color.WHITE, 0.3), dir, 75.0 if away != Vector3.ZERO else 180.0)
	var k: float = [1.15, 1.5, 1.85][tier] * (1.2 if crit else 1.0)
	var flash_col: Color = tint.lerp(WHITE_HOT, 0.5)
	card(STAR4, at, flash_col, 0.15, 0.6 * k, 1.25 * k, {"top": true, "add": 0.85, "hot": 1.0, "sp": 0.3, "fin": 0.05, "rand_rot": true})
	card(GLOW, at, tint, 0.2, 0.6 * k, 1.3 * k, {"top": true, "add": 1.0, "sp": 0.4, "intensity": 0.65})
	if tier >= 1 or crit:
		card(RING, at, tint.lerp(Color.WHITE, 0.4), 0.2, 0.4 * k, 1.8 * k, {"top": true, "add": 0.8, "sp": 0.35})
	if crit:
		card(BURST, at, Color(1.0, 0.82, 0.35), 0.24, 1.0, 2.4, {"top": true, "add": 0.7, "hot": 1.0, "sp": 0.3, "rand_rot": true, "spin": 2.0})
		card(LINES, at, Color(1.0, 0.92, 0.6), 0.22, 1.4, 3.4, {"top": true, "add": 0.9, "sp": 0.3, "rand_rot": true})
		_emit("glint", at, Color(1.0, 0.9, 0.55))


## Parry: a bright clash spark where the weapons meet.
func clash(at: Vector3) -> void:
	var gold := Color(1.0, 0.88, 0.45)
	card(STAR4, at, WHITE_HOT, 0.22, 1.2, 3.0, {"top": true, "add": 0.9, "hot": 1.0, "sp": 0.25, "rot": PI * 0.25})
	card(STAR4, at, gold, 0.28, 1.0, 2.2, {"top": true, "add": 1.0, "hot": 0.6, "sp": 0.3})
	card(GLOW, at, gold, 0.3, 1.4, 2.8, {"top": true, "add": 1.0})
	card(LINES, at, gold, 0.25, 1.2, 3.2, {"top": true, "add": 0.9, "sp": 0.3, "rand_rot": true})
	_emit("spark_l", at, gold, Vector3.UP, 180.0)
	_emit("glint", at, WHITE_HOT)


## KO: a burst, a shock ring and sparkles (the coins come from coin_burst).
func ko_burst(at: Vector3, size: float, tint: Color = Color(1.0, 0.85, 0.45)) -> void:
	var c: Vector3 = at + Vector3(0, 1.0 * size, 0)
	card(BURST, c, tint, 0.45, 1.6 * size, 4.2 * size, {"top": true, "add": 0.8, "hot": 1.0, "sp": 0.3, "rand_rot": true, "spin": 1.2})
	card(GLOW, c, tint, 0.5, 2.0 * size, 4.0 * size, {"top": true, "add": 1.0})
	card(LINES, c, Color(1.0, 0.95, 0.75), 0.4, 2.0 * size, 5.0 * size, {"top": true, "add": 0.9, "sp": 0.3, "rand_rot": true})
	# look-fight: a ring, not a white-out (art direction 7: no halo blobs)
	card(RING, at + Vector3(0, 0.08, 0), tint, 0.55, 3.2 * size * 0.4, 3.2 * size * 2.0, {"flat": true, "add": 0.55, "sp": 0.35})
	_emit("sparkle", c, Color(1.0, 0.92, 0.6))
	_emit("spark_l", c, tint, Vector3.UP, 180.0)
	dust(at, true)


## look-fight KO: the fallen Guardian carried off as motes of the player's faction colour,
## a soft glow where it stood and a slow ring.
func motes(at: Vector3, size: float, tint: Color) -> void:
	var c: Vector3 = at + Vector3(0, 0.9 * size, 0)
	var p := _emit("mote", at + Vector3(0, 0.2, 0), tint.lerp(Color.WHITE, 0.25))
	p.emission_ring_radius = 0.9 * size
	_emit("sparkle", c, tint.lerp(Color.WHITE, 0.5))
	card(GLOW, c, tint, 0.9, 1.6 * size, 3.2 * size, {"add": 1.0, "intensity": 0.7})
	shock(at, 2.4 * size, tint, 0.8)


## An expanding ground ring (kept for older callers): a shock ring on the ground.
func ring(at: Vector3, radius: float, tint: Color, life: float = 0.4) -> void:
	card(RING, at + Vector3(0, 0.07, 0), tint, life, radius * 0.6, radius * 2.0, {"flat": true, "add": 0.45, "sp": 0.4})


## A shock ring: a bright ring on the ground with a soft halo, racing out.
func shock(at: Vector3, radius: float, tint: Color, life: float = 0.45) -> void:
	card(RING, at + Vector3(0, 0.08, 0), tint.lerp(Color.WHITE, 0.3), life, radius * 0.4, radius * 2.0, {"flat": true, "add": 0.55, "sp": 0.35})
	card(HALO, at + Vector3(0, 0.06, 0), tint, life * 1.1, radius * 0.5, radius * 2.3, {"flat": true, "add": 0.9, "sp": 0.4, "intensity": 0.8})


# ---------------------------------------------------------------- skills

## SPLIT: the energy beam (a white core in a blue sheath with scrolling energy, a wide glow,
## a downward light spike), a shock ring, a gold blast, a crack + scorch and dust.
func beam(at: Vector3, height: float, width: float, tint: Color, glow: Color, life: float = 0.6) -> MeshInstance3D:
	var mi: MeshInstance3D = _pick(_beams, "beam")
	mi.position = at
	mi.scale = Vector3(width, height, 1.0)
	var m := mi.material_override as ShaderMaterial
	m.set_shader_parameter("tint", tint)
	m.set_shader_parameter("glow", glow)
	m.set_shader_parameter("alpha", 1.0)
	m.set_shader_parameter("core_w", 0.09)
	m.set_shader_parameter("sheath_w", 0.28)
	m.set_shader_parameter("sheath", 0.75)
	m.set_shader_parameter("speed", 3.5)
	m.set_shader_parameter("top_fade", 0.6)
	m.set_shader_parameter("flow", 1.0)
	mi.visible = true
	_start(mi, life, "beam", width, tint, {"h": height})
	return mi


func pillar(at: Vector3, height: float, width: float, tint: Color, life: float = 0.45) -> void:
	beam(at, height, width, tint, tint.lerp(Color.WHITE, 0.3), life)


func split_slam(at: Vector3, dir: Vector3) -> void:
	# look-fight: the hero's ultimate in the hero's colours (art direction 2.8: core, mid, edge)
	var ice := Color("#FFF6D8")
	var gold := Color("#FFC54D")
	var outer := beam(at, 16.0, 4.2, Color("#FF8A1F"), Color("#FFC54D"), 0.8)
	(outer.material_override as ShaderMaterial).set_shader_parameter("sheath", 0.95)
	(outer.material_override as ShaderMaterial).set_shader_parameter("sheath_w", 0.32)
	beam(at, 17.0, 1.5, Color("#FFC54D"), Color("#FFF6D8"), 0.6)
	# the downward spike of light the reference's beam ends in
	card(STREAK, at + Vector3(0, 0.1, 0) + dir * 2.6, ice, 0.5, 1.0, 1.0, {"flat": true, "add": 0.6, "hot": 0.8, "aspect": Vector2(2.2, 10.0),
		"rot": atan2(dir.x, dir.z) + PI, "sp": 0.3})
	card(GLOW, at + Vector3(0, 0.6, 0), ice, 0.45, 4.0, 6.5, {"add": 1.0})
	card(GLOW, at + Vector3(0, 0.1, 0), Color(1.0, 0.72, 0.35), 0.6, 6.0, 10.0, {"flat": true, "add": 0.85, "fin": 0.02, "intensity": 0.8})
	card(STAR4, at + Vector3(0, 0.5, 0), WHITE_HOT, 0.2, 2.0, 4.0, {"add": 0.9, "hot": 1.0})
	shock(at, 3.0, gold, 0.5)
	card(SWIRL, at + Vector3(0, 0.1, 0), gold, 0.7, 3.5, 8.5, {"flat": true, "add": 0.35, "spin": 4.0, "rand_rot": true, "sp": 0.3, "intensity": 1.2})
	card(HALO, at + Vector3(0, 0.12, 0), Color(1.0, 0.7, 0.25), 0.6, 2.0, 8.0, {"flat": true, "add": 0.5, "sp": 0.4})
	card(RING, at + Vector3(0, 0.14, 0), Color(1.0, 0.85, 0.5), 0.5, 1.5, 7.0, {"flat": true, "add": 0.6, "sp": 0.35})
	crack(at, 3.2)
	dust(at, true)
	_emit("ember", at + Vector3(0, 0.4, 0), Color(1.0, 0.75, 0.3))


## SPLIT: bursts that run along the ground from `from` in `dir` over `secs`.
func ground_split(from: Vector3, dir: Vector3, length: float, secs: float, tint: Color) -> void:
	var n: int = 5
	for i in n:
		var u: float = float(i + 1) / float(n)
		_pending.append({"at_t": _clock + secs * u, "kind": "split", "p": from + dir * length * u, "dir": dir, "tint": tint, "big": i == n - 1})


func _split_burst(p: Vector3, dir: Vector3, tint: Color, big: bool) -> void:
	var k: float = 1.4 if big else 1.0
	card(FLAME, p, tint, 0.4, 0.8 * k, 1.6 * k, {"bb": 3, "add": 0.7, "hot": 0.6, "aspect": Vector2(0.8, 1.6), "sp": 0.3})
	card(GLOW, p + Vector3(0, 0.3, 0), tint, 0.3, 1.0 * k, 2.0 * k, {"add": 1.0})
	card(CRACK, p + Vector3(0, 0.05, 0), Color(1.0, 0.7, 0.3), 0.6, 1.4 * k, 1.6 * k, {"flat": true, "add": 1.0, "rand_rot": true})
	decal(SCORCH, p, 1.3 * k, Color(0.12, 0.08, 0.07, 0.75), 3.5)
	_emit("spark_m" if big else "spark_s", p + Vector3(0, 0.3, 0), tint, dir + Vector3.UP, 60.0)
	if big:
		shock(p, 1.6, tint, 0.4)
		dust(p, false)


## WHIRL: a spinning ring of glowing blades round the hero (several swept arcs), a ground
## swirl, a shock ring and sparks thrown outward.
func whirl(at: Vector3, radius: float, cols: Array, spin_dir: float = 1.0, second: bool = false) -> void:
	var n: int = 4
	var y0: float = randf() * TAU
	for i in n:
		var mi := slash(at + Vector3(0, 0.6 + 0.15 * i, 0), y0 + TAU * float(i) / n, cols, radius * (0.8 + 0.08 * i), 0.1 * (i - 1.5), 0.45)
		for d: Dictionary in _live:
			if d["node"] == mi:
				d["spin"] = -spin_dir * (16.0 if second else 13.0)
	# the blade ring: a glowing ring at blade height that spins and widens, a pink halo round it
	card(SWIRL, at + Vector3(0, 0.75, 0), cols[0], 0.4, radius * 1.6, radius * 2.3, {"flat": true, "add": 0.2, "spin": -spin_dir * 11.0, "rand_rot": true, "sp": 0.35, "intensity": 0.75})
	card(RING, at + Vector3(0, 0.8, 0), cols[1], 0.5, radius * 1.7, radius * 2.4, {"flat": true, "add": 0.35, "sp": 0.4})
	card(HALO, at + Vector3(0, 0.1, 0), cols[0], 0.5, radius * 1.4, radius * 2.6, {"flat": true, "add": 0.3, "sp": 0.4, "intensity": 0.55})
	card(SWIRL, at + Vector3(0, 0.08, 0), cols[0], 0.6, radius * 1.2, radius * 2.0, {"flat": true, "add": 0.15, "spin": -spin_dir * 7.0, "rand_rot": true, "sp": 0.35})
	shock(at, radius, cols[1], 0.4)
	var sp := _emit("sparkle", at + Vector3(0, 0.8, 0), cols[1].lerp(Color.WHITE, 0.4))
	sp.emission_sphere_radius = radius * 0.9
	for i in 2:
		var a: float = randf() * TAU
		_emit("spark_m", at + Vector3(sin(a) * radius * 0.8, 0.9, cos(a) * radius * 0.8), cols[1].lerp(Color.WHITE, 0.3), Vector3(sin(a), 0.25, cos(a)), 50.0)


## WHIRL's ground swirl (kept for older callers).
func swirl(at: Vector3, radius: float, tint: Color, life: float = 0.5, height: float = 0.0) -> void:
	card(SWIRL, at + Vector3(0, 0.08 + height * 0.0, 0), tint, life, radius * 1.2, radius * 2.4, {"flat": true, "add": 0.55, "spin": -9.0, "rand_rot": true})


## CHARGE start: a speed-line burst behind the hero and a dust kick.
func charge_start(at: Vector3, dir: Vector3, tint: Color) -> void:
	var c: Vector3 = at + Vector3(0, 1.0, 0)
	card(LINES, c, tint.lerp(Color.WHITE, 0.4), 0.3, 1.2, 3.6, {"add": 0.9, "sp": 0.3, "rand_rot": true})
	card(GLOW, c, tint, 0.25, 1.0, 2.4, {"add": 1.0})
	card(RING, at + Vector3(0, 0.1, 0), tint, 0.3, 0.6, 2.6, {"flat": true, "add": 0.6, "sp": 0.35})
	dust(at - dir * 0.3, false)


## CHARGE end: an impact burst where the dash stops.
func charge_end(at: Vector3, dir: Vector3, tint: Color) -> void:
	var c: Vector3 = at + Vector3(0, 0.9, 0) + dir * 0.6
	card(STAR4, c, WHITE_HOT, 0.2, 1.4, 3.0, {"top": true, "add": 0.9, "hot": 1.0, "rand_rot": true, "sp": 0.3})
	card(GLOW, c, tint, 0.3, 1.5, 3.0, {"top": true, "add": 1.0})
	shock(at + dir * 0.6, 1.8, tint, 0.4)
	_emit("spark_m", c, tint.lerp(Color.WHITE, 0.3), dir + Vector3(0, 0.4, 0), 70.0)
	dust(at + dir * 0.6, true)


## A speed streak card flying back off the hero during the dash.
func speed_line(at: Vector3, dir: Vector3, tint: Color) -> void:
	card(STREAK, at, tint, 0.18, 1.0, 1.0, {"flat": true, "add": 0.95, "aspect": Vector2(0.45, 2.6), "rot": atan2(dir.x, dir.z), "vel": -dir * 4.0, "fin": 0.0})


## RALLY: a rising heal column, motes and sparkles on each ally, a glow ring at the feet.
func heal(at: Vector3, tint: Color) -> void:
	var b := beam(at, 5.0, 2.4, Color(0.2, 0.85, 0.25), Color(0.6, 1.0, 0.45), 1.1)
	var m := b.material_override as ShaderMaterial
	m.set_shader_parameter("core_w", 0.2)
	m.set_shader_parameter("sheath_w", 0.45)
	m.set_shader_parameter("sheath", 1.0)
	# flame tongues rising round the ally, gold-green
	for i in 3:
		var a: float = TAU * float(i) / 3.0 + randf() * 0.6
		card(FLAME, at + Vector3(sin(a) * 0.55, 0.6, cos(a) * 0.55), Color(0.55, 1.0, 0.35), 0.8, 0.9, 1.4,
			{"bb": 3, "add": 0.6, "hot": 0.5, "aspect": Vector2(0.7, 1.8), "fin": 0.15, "vel": Vector3(0, 1.6, 0)})
	m.set_shader_parameter("speed", -1.6)
	m.set_shader_parameter("top_fade", 0.25)
	_emit("mote", at + Vector3(0, 0.1, 0), tint.lerp(Color.WHITE, 0.25))
	_emit("sparkle", at + Vector3(0, 1.2, 0), Color(1.0, 0.95, 0.6))
	shock(at, 1.5, Color(0.4, 1.0, 0.35), 0.6)
	card(HALO, at + Vector3(0, 0.08, 0), Color(0.35, 0.95, 0.3), 1.0, 1.4, 2.4, {"flat": true, "add": 0.4, "fin": 0.2})
	card(PLUS, at + Vector3(0, 2.3, 0), Color(0.5, 1.0, 0.45), 0.7, 0.4, 0.9, {"add": 0.5, "hot": 0.5, "fin": 0.25, "vel": Vector3(0, 1.2, 0)})


## SHIELD going up: a bright ring at the hem and a few glints (the dome is the fighter's).
func shield_up(at: Vector3, radius: float, tint: Color) -> void:
	shock(at, radius, tint, 0.45)
	card(GLOW, at + Vector3(0, 1.0, 0), tint, 0.35, 1.5, 2.8, {"add": 1.0})
	_emit("glint", at + Vector3(0, 1.4, 0), tint.lerp(Color.WHITE, 0.5))


## SHIELD breaking or running out: glass shards, a flash and a ring.
func shatter(at: Vector3, radius: float, tint: Color) -> void:
	var p := _emit("shard", at + Vector3(0, radius * 0.6, 0), tint.lerp(Color.WHITE, 0.35))
	p.emission_sphere_radius = radius * 0.9
	card(GLOW, at + Vector3(0, 1.0, 0), tint, 0.3, 1.8, 3.2, {"add": 1.0})
	card(STAR4, at + Vector3(0, 1.2, 0), WHITE_HOT, 0.18, 1.0, 2.4, {"add": 0.9, "hot": 1.0})
	shock(at, radius * 1.2, tint, 0.35)


# ---------------------------------------------------------------- ground decals

## A pooled ground decal (12 at most; the oldest is reused), fading over `life` seconds.
func decal(cell: int, at: Vector3, size: float, tint: Color, life: float) -> void:
	card(cell, at + Vector3(0, 0.035 + randf() * 0.01, 0), tint, life, size, size, {"flat": true, "decal": true, "add": 0.0, "rand_rot": true, "fin": 0.02, "fp": 3.0})


func scorch(at: Vector3, size: float) -> void:
	decal(SCORCH, at, size, Color(0.11, 0.07, 0.06, 0.8), 4.0)


## Ground cracks: a dark decal that lingers and a glowing copy that cools in a moment.
func crack(at: Vector3, size: float) -> void:
	decal(SCORCH, at, size * 0.8, Color(0.14, 0.09, 0.08, 0.55), 4.5)
	decal(CRACK, at, size, Color(0.22, 0.14, 0.12, 0.38), 3.5)
	card(CRACK, at + Vector3(0, 0.06, 0), Color(1.0, 0.65, 0.25), 0.9, size, size, {"flat": true, "add": 1.0, "fin": 0.02, "fp": 0.6, "intensity": 1.3})


## Dust: puffs kicked up (dashes, landings, heavy hits) and, big, a faint ring of it.
func dust(at: Vector3, big: bool = false) -> void:
	var p := _emit("dust", at + Vector3(0, 0.2, 0), Color(0.86, 0.78, 0.7, 0.55 if big else 0.42))
	p.emission_sphere_radius = 0.6 if big else 0.3
	if big:
		decal(PUFF, at, 2.2, Color(0.55, 0.45, 0.38, 0.35), 1.6)


# ---------------------------------------------------------------- coins and sparkle

## A coin popping off the boss on a big hit: a spinning gold coin, a glint and sparkles.
func coin(at: Vector3, vel: Vector3 = Vector3.ZERO) -> void:
	var mi: MeshInstance3D = _pick(_coins, "coin")
	mi.position = at
	(mi.material_override as StandardMaterial3D).albedo_color = Color(1, 1, 1, 1)
	mi.visible = true
	_start(mi, 1.0, "coin", 1.0, Color.WHITE, {"from": at, "vel": vel, "glint": false})
	_emit("glint", at, Color(1.0, 0.9, 0.5))


## A small pure-visual coin burst (KO and victory): no reward or gameplay change.
func coin_burst(at: Vector3, n: int = 5) -> void:
	for i in n:
		var a: float = TAU * float(i) / n + randf() * 0.5
		coin(at + Vector3(0, 0.4, 0), Vector3(sin(a), 0, cos(a)) * randf_range(1.2, 2.2))
	_emit("sparkle", at + Vector3(0, 0.8, 0), Color(1.0, 0.88, 0.45))


## The ally's bolt: a glowing orb (the fight moves it and its Area3D).
func make_bolt(tint: Color) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = _quad(0.7)
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	m.albedo_texture = T_GLOW
	m.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	m.billboard_keep_scale = true
	m.albedo_color = tint
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	return mi


# ---------------------------------------------------------------- telegraphs

## A boss telegraph: circle (half_deg >= 180) or cone towards yaw. The fill reaches the rim
## at `life`; the fight resolves the strike then and calls telegraph_end().
func telegraph(at: Vector3, yaw: float, radius: float, half_deg: float, life: float, tint: Color = Color(1.0, 0.2, 0.12, 1.0)) -> MeshInstance3D:
	var mi: MeshInstance3D = _pick(_teles, "tele")
	mi.position = at + Vector3(0, 0.05, 0)
	mi.basis = Basis(Vector3.UP, yaw)
	mi.scale = Vector3(radius, 1.0, radius)
	var sm := mi.material_override as ShaderMaterial
	sm.set_shader_parameter("tint", tint)
	sm.set_shader_parameter("half_angle", deg_to_rad(minf(half_deg, 180.0)))
	sm.set_shader_parameter("fill", 0.0)
	sm.set_shader_parameter("alpha", 1.0)
	sm.set_shader_parameter("flash", 0.0)
	mi.visible = true
	_start(mi, life, "tele", radius, tint, {"phase": "fill"})
	return mi


## The strike landed (flash then fade) or was cancelled (fade).
func telegraph_end(mi: MeshInstance3D, landed: bool) -> void:
	for d: Dictionary in _live:
		if d["node"] == mi:
			d["phase"] = "flash" if landed else "fade"
			d["t"] = 0.0
			d["life"] = 0.25
			return


# ---------------------------------------------------------------- budget

## For the CQPERF line: pooled nodes, live effects now and peaks since the fight began.
func budget() -> Dictionary:
	var pooled: int = _arcs.size() + _cards.size() + _tops.size() + _decals.size() + _beams.size() + _coins.size() + _teles.size() + _trails.size()
	var systems: int = 0
	for k: String in _parts:
		systems += (_parts[k] as Array).size()
	return {"pooled": pooled + systems, "live": _live.size(), "peak_live": peak_live, "peak_parts": peak_parts}


# ---------------------------------------------------------------- tick

func _process(dt: float) -> void:
	_clock += dt
	while not _pending.is_empty() and _clock >= float(_pending[0]["at_t"]):
		var b: Dictionary = _pending.pop_front()
		if str(b["kind"]) == "split":
			_split_burst(b["p"], b["dir"], b["tint"], bool(b["big"]))
	_draw_trails()
	# particle systems hide when their burst is over (a hidden system costs no draw)
	var parts_now: int = 0
	for p: CPUParticles3D in _emit_until.keys():
		if _clock > float(_emit_until[p]):
			p.visible = false
			_emit_until.erase(p)
		else:
			parts_now += p.amount
	peak_parts = maxi(peak_parts, parts_now)
	peak_live = maxi(peak_live, _live.size())
	var i: int = _live.size() - 1
	while i >= 0:
		var d: Dictionary = _live[i]
		var t: float = float(d["t"]) + dt
		d["t"] = t
		var life: float = d["life"]
		var mi: MeshInstance3D = d["node"]
		var k: float = t / life
		var kind: String = d["kind"]
		if k >= 1.0 and not (kind == "tele" and d.get("phase", "") == "fill" and k < 3.0):
			mi.visible = false
			_live.remove_at(i)
			i -= 1
			continue
		var tint: Color = d["tint"]
		var size: float = d["size"]
		match kind:
			"card":
				var m := mi.material_override as ShaderMaterial
				var fin: float = d["fin"]
				var a: float = (k / fin) if (fin > 0.0 and k < fin) else 1.0 - ease((k - fin) / maxf(0.001, 1.0 - fin), float(d["fp"]))
				m.set_shader_parameter("tint", Color(tint.r, tint.g, tint.b, tint.a * clampf(a, 0.0, 1.0)))
				var s: float = lerpf(float(d["s0"]), float(d["s1"]), ease(k, float(d["sp"])))
				var asp: Vector2 = d["aspect"]
				var sp: float = float(d["spin"])
				if bool(d["flat"]):
					if sp != 0.0:
						mi.basis = Basis(Vector3.UP, float(d["spin0"]) + sp * t) * Basis(Vector3.RIGHT, -PI * 0.5)
					mi.scale = Vector3(s * asp.x, s * asp.y, 1.0)
				else:
					if sp != 0.0:
						m.set_shader_parameter("spin", float(d["spin0"]) + sp * t)
					mi.scale = Vector3(s * asp.x, s * asp.y, 1.0)
				var vel: Vector3 = d["vel"]
				if vel != Vector3.ZERO:
					mi.position += vel * dt
			"arc":
				var m2 := mi.material_override as ShaderMaterial
				# sweep in over the first 35 %, the tail catches up over the rest
				var head: float = clampf(k / 0.3, 0.0, 1.0)
				head = 1.0 - (1.0 - head) * (1.0 - head)
				m2.set_shader_parameter("head", head)
				m2.set_shader_parameter("tail_len", lerpf(1.2, 0.25, clampf((k - 0.3) / 0.7, 0.0, 1.0)))
				m2.set_shader_parameter("alpha", 1.0 - ease(clampf((k - 0.35) / 0.65, 0.0, 1.0), 1.6))
				mi.scale = Vector3.ONE * size * lerpf(0.92, 1.12, ease(k, 0.5))
				var spn: float = float(d["spin"])
				if spn != 0.0:
					mi.rotate_y(spn * dt)
			"beam":
				var mb := mi.material_override as ShaderMaterial
				# flares wide fast, holds, then thins and fades
				var wk: float = lerpf(0.55, 1.0, ease(minf(k / 0.06, 1.0), 0.4)) * lerpf(1.0, 0.25, ease(maxf(0.0, (k - 0.35) / 0.65), 1.5))
				mi.scale = Vector3(size * wk, float(d["h"]) * lerpf(0.75, 1.05, ease(k, 0.3)), 1.0)
				mb.set_shader_parameter("alpha", 1.0 - ease(maxf(0.0, (k - 0.3) / 0.7), 1.8))
			"coin":
				var from: Vector3 = d["from"]
				var cv: Vector3 = d["vel"]
				var up: float = 1.4 * sin(minf(k * 1.4, 1.0) * PI * 0.5) if cv == Vector3.ZERO else 5.5 * t - 5.5 * t * t
				mi.position = from + cv * t + Vector3(0, maxf(up, -0.3), 0)
				mi.scale = Vector3(absf(cos(t * 9.0)) * 0.9 + 0.1, 1, 1)
				(mi.material_override as StandardMaterial3D).albedo_color = Color(1, 1, 1, 1.0 - ease(maxf(0.0, k - 0.6) / 0.4, 1.0))
				# a glint as the coin turns face-on
				if not bool(d["glint"]) and k > 0.3:
					d["glint"] = true
					card(SPARKLE, mi.position + Vector3(0.1, 0.1, 0), Color(1.0, 0.95, 0.7), 0.3, 0.3, 0.9, {"add": 1.0, "hot": 1.0, "fin": 0.3, "spin": 3.0})
			"tele":
				var sm := mi.material_override as ShaderMaterial
				match str(d.get("phase", "fill")):
					"fill":
						sm.set_shader_parameter("fill", clampf(k, 0.0, 1.0))
					"flash":
						sm.set_shader_parameter("fill", 1.0)
						sm.set_shader_parameter("flash", 0.8 * (1.0 - k))
						sm.set_shader_parameter("alpha", 1.0 - k)
					"fade":
						sm.set_shader_parameter("alpha", 1.0 - k)
		i -= 1
