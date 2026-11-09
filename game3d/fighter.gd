extends Node3D
## One fighter (cq 061, reworked in cq 233): a runtime GLB (or a capsule mannequin), its
## CombatAnimator (clips when the GLB has them, procedural poses when not), a hurtbox, a
## weapon arc hitbox on a pivot, the hit flash (with a team rim while it shows), knockback, the SHIELD barrier
## and the RALLY buff. The model faces +Z (glTF convention); yaw turns +Z to the facing.

const HitArea := preload("res://hit_area.gd")
const Animator := preload("res://combat_animator.gd")
## cq 015 rim (char_lit.gdshader): strength on the key light's side, and the share of it the
## team-coloured sky-side rim gets
const RIM_AMOUNT: float = 1.7
const RIM_BOSS: float = 1.8
const RIM_TEAM: float = 0.45
const FLASH_SHADER := preload("res://vfx/flash.gdshader")
const LIT_SHADER := preload("res://vfx/char_lit.gdshader")
const ArenaScript := preload("res://arena.gd")
const DOME_SHADER := preload("res://vfx/dome.gdshader")

const HEIGHT: float = 2.3             # a touch over life size: reads at phone size, as on the reference

var display_name: String = ""
var team: int = 0                # 0 = hero side, 1 = enemy
var role: String = "hero"        # hero | ally | boss
var max_hp: int = 1000
var hp: int = 1000
var radius: float = 0.45
var size_k: float = 1.0          # the boss stands taller
## The fight setup's look (battle-3d-only): the boss's height x this (a raid boss stands taller still). Set before setup().
var size_mult: float = 1.0
var colour: Color = Color.WHITE
var body: Node3D
var model: Node3D
var anim: Animator = Animator.new()
var model_info: String = "capsule"
var bind_info: Dictionary = {}
var anim_opts: Dictionary = {}   # {key, class}: picks the cast clip library and the weapon set (cq 012)
var yaw: float = 0.0
var speed_now: float = 0.0
var dead: bool = false
var celebrating: bool = false
var anim_freeze: bool = false
var weapons: Dictionary = {}      # "r" / "l" -> {node, class, bone} (weapons in hand, cq 234)

# combat state the fight reads and writes
var kb_vel: Vector3 = Vector3.ZERO
var iframes: float = 0.0
var stagger: float = 0.0
var guarding: bool = false
var guard_t: float = 0.0         # seconds since guard went up
var shield_hp: int = 0
var shield_t: float = 0.0
var buff_t: float = 0.0
var buff_mult: float = 1.0

var hurtbox: Area3D
var weapon_pivot: Node3D
var weapon: HitArea
var weapon_reach: float = 2.2

var _overlay: ShaderMaterial
var _flash: float = 0.0
var _overlay_meshes: Array[MeshInstance3D] = []
var _overlay_on: bool = false
## cq 015: the fighter's own materials, rebuilt on char_lit.gdshader (rim + hit flash in
## the same pass). The overlay above is only kept for a surface that cannot be converted.
var _lit_mats: Array[ShaderMaterial] = []
var _lit_flash: float = -1.0
var rim_on: bool = true                                  # set by fight.gd from the look ("rim": false = the old material + overlay)
var look: Dictionary = {}                                # the arena's look (set by fight.gd)
var sun_blob: bool = true                                # set by fight.gd from the look ("ao")
var key_dir: Vector3 = Vector3(0.65, -0.56, 0.51)       # the key light's direction (arena.gd)
var _rim_team: Color = Color(0.5, 0.85, 1.0)
var _dome: MeshInstance3D
var _dome_mat: ShaderMaterial
var _dome_hit: float = 0.0
var _dome_age: float = 0.0          # cq 013: pop-in when the barrier goes up
var _shatter_t: float = -1.0        # cq 013: >= 0 while the dome breaks up
## cq 013: the barrier broke or ran out (fx shards it)
signal shield_ended(at: Vector3, radius: float)
var _aura: MeshInstance3D
var _cast: MeshInstance3D       # cq 015: the blob with its sun-cast tail (top level: it keeps the sun's heading)
var _cast_off: Vector3 = Vector3.ZERO
var _cast_yaw: float = 0.0

# procedural body motion (stands in for clip root motion)
var _motion: String = ""
var _mt: float = 0.0
var _mlen: float = 0.0
var _pop_t: float = -1.0
var _death_t: float = -1.0
var _cele_t: float = 0.0
var _spin_dir: float = 1.0
# look-fight (presentation only): the victim's shudder through a hit-stop, the Guardian's dissolve
var _shud_t: float = 0.0
var _shud_len: float = 0.0
var _shud_amp: float = 0.0
var _shud_clock: float = 0.0
var _diss_t: float = -1.0
var _diss_len: float = 0.7
# fight-anim (presentation only): the model's facing eases after the fighter's yaw. The game snaps
# yaw (soft-lock on a swing, a wind-up's aim, a charge: up to 140 deg in one frame); the yaw, the
# hurtbox and the weapon hitbox keep snapping exactly as before, only the drawn body follows.
const TURN_RATE: float = 16.0           # 1/s: most of a snap within 4-5 frames
const TURN_LAG_MAX: float = 2.618          # 150 deg: a bigger snap catches up the rest at once
var _vis_yaw: float = NAN


func setup(n: String, t: int, hp_max: int, c: Color, r: String = "hero") -> void:
	display_name = n
	team = t
	role = r
	max_hp = hp_max
	hp = hp_max
	colour = c
	size_k = (1.55 if role == "boss" else 1.0) * size_mult
	radius = 0.8 if role == "boss" else 0.5
	body = Node3D.new()
	body.name = "Body"
	add_child(body)
	_overlay = ShaderMaterial.new()
	_overlay.shader = FLASH_SHADER
	var rim: Color = Color(1.0, 0.35, 0.3) if team == 1 else (Color(0.55, 1.0, 0.6) if role == "hero" else Color(0.5, 0.85, 1.0))
	_overlay.set_shader_parameter("rim_color", rim)
	_overlay.set_shader_parameter("rim_amount", 0.55 if role == "boss" else 0.4)
	_rim_team = rim
	_build_boxes()
	_build_shadow()
	set_capsule()


func _build_shadow() -> void:
	# a soft contact shadow: grounds the fighters on the bright paving at no real cost
	var sh := MeshInstance3D.new()
	sh.name = "BlobShadow"
	var q := PlaneMesh.new()
	q.size = Vector2(1.5, 1.5) * size_k
	sh.mesh = q
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.albedo_texture = preload("res://art/fx/vfx_glow.png")
	m.albedo_color = Color(0.08, 0.04, 0.12, 0.75)
	m.disable_receive_shadows = true
	sh.material_override = m
	sh.position.y = 0.045
	sh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(sh)
	# cq 015: the low key light's shadow, faked in the same quad: the contact blob and a long
	# soft tail leaning away from the sun (arena.gd KEY_ROT) in one texture, on a longer quad that
	# keeps the sun's heading as the fighter turns (top level). Still one draw a fighter.
	var ld := Vector3(key_dir.x, 0.0, key_dir.z)
	if sun_blob and ld.length() > 0.05:
		q.size = Vector2(SUN_BLOB.x, SUN_BLOB.y) * size_k
		m.albedo_texture = _sun_blob_tex()
		m.albedo_color = Color.WHITE
		sh.top_level = true
		_cast = sh
		# the quad's centre sits ahead of the feet along the sun (the texture's feet are at SUN_FEET)
		_cast_off = ld.normalized() * (SUN_BLOB.y * (0.5 - SUN_FEET)) * size_k
		_cast_yaw = atan2(ld.x, ld.z)


## The sun-cast blob's quad (width, length in metres at size 1) and where the feet sit along it (0-1).
const SUN_BLOB: Vector2 = Vector2(1.5, 3.4)
const SUN_FEET: float = 0.22
static var _sun_tex: ImageTexture


## The contact blob plus the sun's soft tail, drawn once into a 64 x 128 texture (v runs along the sun).
static func _sun_blob_tex() -> ImageTexture:
	if _sun_tex != null:
		return _sun_tex
	var img := Image.create(64, 128, false, Image.FORMAT_RGBA8)
	var contact := Color(0.08, 0.04, 0.12)
	var tail := Color(0.16, 0.12, 0.3)
	for y in 128:
		for x in 64:
			var u: float = (x + 0.5) / 64.0 - 0.5
			var v: float = (y + 0.5) / 128.0
			# contact: a 0.75 m radius disc round the feet, like the old blob (alpha 0.75)
			var dc: float = Vector2(u / 0.5, (v - SUN_FEET) * SUN_BLOB.y / SUN_BLOB.x / 0.5).length()
			var ac: float = 0.75 * pow(clampf(1.0 - dc, 0.0, 1.0), 1.6)
			# tail: a soft ellipse 1 m ahead, 2.6 m long, 1.1 m wide (alpha 0.5)
			var dt: Vector2 = Vector2(u / 0.37, (v - (SUN_FEET + 1.0 / SUN_BLOB.y)) / (1.3 / SUN_BLOB.y))
			var at: float = 0.5 * pow(clampf(1.0 - dt.length(), 0.0, 1.0), 1.2)
			var a: float = ac + at * (1.0 - ac)
			var c: Color = tail.lerp(contact, ac / maxf(a, 0.001))
			c.a = a
			img.set_pixel(x, y, c)
	img.generate_mipmaps()
	_sun_tex = ImageTexture.create_from_image(img)
	return _sun_tex


func _build_boxes() -> void:
	hurtbox = Area3D.new()
	hurtbox.name = "Hurtbox"
	hurtbox.collision_layer = HitArea.hurt_layer(team)
	hurtbox.collision_mask = 0
	hurtbox.monitoring = false
	hurtbox.monitorable = true
	hurtbox.set_meta("fighter", self)
	var cs := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = radius
	cap.height = HEIGHT * size_k
	cs.shape = cap
	cs.position.y = HEIGHT * size_k * 0.5
	hurtbox.add_child(cs)
	add_child(hurtbox)
	# the weapon arc: a fan from the chest out to the reach, rebuilt every frame of a swing
	# to cover the arc the weapon swept since the last frame (sweep_arc)
	weapon_pivot = Node3D.new()
	weapon_pivot.name = "WeaponPivot"
	weapon_pivot.position.y = HEIGHT * size_k * 0.55
	add_child(weapon_pivot)
	weapon = HitArea.new()
	weapon.name = "WeaponArc"
	var fan := ConvexPolygonShape3D.new()
	fan.points = PackedVector3Array([Vector3(-0.2, -0.5, 0.3), Vector3(0.2, -0.5, 0.3), Vector3(-0.2, 0.5, 0.3), Vector3(0.2, 0.5, 0.3),
		Vector3(-0.2, -0.5, 1.5), Vector3(0.2, -0.5, 1.5), Vector3(-0.2, 0.5, 1.5), Vector3(0.2, 0.5, 1.5)])
	weapon.setup(1 - team, fan)
	weapon_pivot.add_child(weapon)
	sweep_arc(-10.0, 10.0)


## The arc's reach (m) for the next swings.
func set_reach(reach: float, _width: float = 0.5) -> void:
	weapon_reach = reach


## Shapes the weapon hitbox as the fan between two yaw angles (deg, + is its left), from
## 0.3 m out to the reach and from knee to above the head: everything the blade swept.
func sweep_arc(a0_deg: float, a1_deg: float) -> void:
	var lo: float = minf(a0_deg, a1_deg)
	var hi: float = maxf(a0_deg, a1_deg)
	if hi - lo < 12.0:
		var mid: float = (lo + hi) * 0.5
		lo = mid - 6.0
		hi = mid + 6.0
	hi = minf(hi, lo + 170.0)   # a fan under 180 degrees stays convex
	var y0: float = -HEIGHT * size_k * 0.45
	var y1: float = HEIGHT * size_k * 0.6
	var pts := PackedVector3Array()
	var n: int = clampi(int((hi - lo) / 15.0) + 1, 1, 12)
	for i in n + 1:
		var a: float = deg_to_rad(lerpf(lo, hi, float(i) / float(n)))
		var d := Vector3(sin(a), 0, cos(a))
		for y: float in [y0, y1]:
			pts.append(d * 0.3 + Vector3(0, y, 0))
			pts.append(d * weapon_reach + Vector3(0, y, 0))
	(weapon.shape_node.shape as ConvexPolygonShape3D).points = pts


func forward() -> Vector3:
	return Vector3(sin(yaw), 0.0, cos(yaw))


func face(dir: Vector3, dt: float, rate: float = 18.0) -> void:
	if dir.length_squared() < 0.0001:
		return
	var target: float = atan2(dir.x, dir.z)
	if rate <= 0.0:
		yaw = target
	else:
		yaw = lerp_angle(yaw, target, 1.0 - exp(-dt * rate))
	rotation.y = yaw


func head_pos() -> Vector3:
	return global_position + Vector3(0.0, HEIGHT * size_k + 0.3, 0.0)


func chest_pos() -> Vector3:
	return global_position + Vector3(0.0, HEIGHT * size_k * 0.6, 0.0)


## The right-hand attach point (BoneAttachment3D on the hand bone, or a stand-in node at
## the right hip when the model has no skeleton). The weapons task parents weapons here.
func hand_r() -> Node3D:
	return anim.hand_r


## Puts `weapon_node` in the right hand (replacing any weapon there). A child named "tip"
## (if any) marks the blade's end; reach, when given, also resizes the arc hitbox.
func attach_weapon(weapon_node: Node3D, reach: float = -1.0) -> void:
	var h: Node3D = hand_r()
	if h == null:
		return
	for c: Node in h.get_children():
		if c.is_in_group("cq_weapon"):
			c.queue_free()
	weapon_node.add_to_group("cq_weapon")
	h.add_child(weapon_node)
	if reach > 0.0:
		set_reach(reach)


# ---------------------------------------------------------------- models

func _clear_model() -> void:
	if model != null:
		model.queue_free()
	model = null
	weapons = {}


func set_capsule() -> void:
	_clear_model()
	var root := Node3D.new()
	root.name = "Mannequin"
	var mat := StandardMaterial3D.new()
	mat.albedo_color = colour
	mat.roughness = 0.8
	var mi := MeshInstance3D.new()
	var cap := CapsuleMesh.new()
	cap.radius = 0.3
	cap.height = HEIGHT
	cap.radial_segments = 12
	cap.rings = 4
	mi.mesh = cap
	mi.position.y = HEIGHT * 0.5
	mi.material_override = mat
	root.add_child(mi)
	var nose := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.18, 0.12, 0.25)
	nose.mesh = bm
	nose.position = Vector3(0.0, 1.55, 0.3)
	nose.material_override = mat
	root.add_child(nose)
	root.scale = Vector3.ONE * size_k
	model = root
	body.add_child(root)
	model_info = "capsule"
	bind_info = anim.bind(root, body)
	_apply_overlay(root)


## Takes ownership of a generated GLTF scene. Normalises it to HEIGHT (x size_k) from its
## AABB, puts its feet on y=0 and centres it, then binds the CombatAnimator.
func set_model(node: Node3D) -> Dictionary:
	_clear_model()
	var holder := Node3D.new()
	holder.name = "Model"
	holder.add_child(node)
	var aabb: AABB = _model_aabb(holder)
	var s: float = 1.0
	if aabb.size.y > 0.01:
		s = HEIGHT * size_k / aabb.size.y
	holder.scale = Vector3.ONE * s
	var c: Vector3 = aabb.get_center()
	holder.position = Vector3(-c.x * s, -aabb.position.y * s, -c.z * s)
	body.add_child(holder)
	model = holder
	model_info = "glb"
	bind_info = anim.bind(holder, body, anim_opts)
	anim.play("idle")
	_apply_overlay(holder)
	_wire_cloth(holder)
	var names: PackedStringArray = anim.player.get_animation_list() if anim.player != null else PackedStringArray()
	return {"scale": s, "height_raw": aabb.size.y, "anims": names, "mapped": bind_info.get("clips", {}),
		"bones": bind_info.get("bones", 0), "hand": bind_info.get("hand", ""), "library": anim.lib_key}


## cq 015: each surface's material is rebuilt on char_lit.gdshader, which draws the same
## textures plus the rim and the hit flash in the one pass. The old overlay (a second pass over
## every skinned vertex, ~1 ms a fighter a frame on a software GPU) is only kept for a surface
## that cannot be converted (not a plain opaque BaseMaterial3D); it is attached only while a
## flash shows, and for the first frame after load so its shader compiles during loading.
func _apply_overlay(root: Node) -> void:
	_overlay_meshes.clear()
	_lit_mats.clear()
	_lit_flash = -1.0
	var meshes: Array[Node] = root.find_children("*", "MeshInstance3D", true, false)
	if root is MeshInstance3D:
		meshes.append(root)
	for n: Node in meshes:
		if not rim_on or not _light_mesh(n as MeshInstance3D):
			_overlay_meshes.append(n)
	_overlay_on = false
	if not _overlay_meshes.is_empty():
		_flash = maxf(_flash, 0.02)   # on for the first frame: compiles the shader during loading
		_set_overlay(true)


## cq 016: cloth off the legs. The robe, coat and skirt vertices (skinned to the cq 014 secondary
## chains, whose skin binds the rig appends after the body's) are pushed out of the leg capsules in
## the fighter's own vertex shader (char_lit.gdshader); the secondary sim feeds it the capsules.
func _wire_cloth(root: Node) -> void:
	var sm: Variant = anim.secondary if anim != null else null
	var skel: Skeleton3D = anim.skeleton if anim != null else null
	if sm == null or skel == null or _lit_mats.is_empty() or not bool(anim_opts.get("cloth_push", true)):
		return
	var re := RegEx.new()
	re.compile("^(Robe|Coat|Skirt|Wing|Flame).*_(\\d+|end)$")
	var mats: Array[ShaderMaterial] = []
	for n: Node in root.find_children("*", "MeshInstance3D", true, false):
		var mi := n as MeshInstance3D
		if mi.mesh == null or mi.skin == null:
			continue
		# the first chain bind; every bind after it must be a chain too (else this mesh is left alone)
		var first: int = -1
		var ok: bool = true
		for b in mi.skin.get_bind_count():
			var nm: String = str(mi.skin.get_bind_name(b))
			if nm == "" and mi.skin.get_bind_bone(b) >= 0:
				nm = skel.get_bone_name(mi.skin.get_bind_bone(b))
			var chain: bool = re.search(nm) != null
			if chain and first < 0:
				first = b
			elif not chain and first >= 0:
				ok = false
		if first < 0 or not ok:
			continue
		var surf: Array[Material] = []
		if mi.material_override != null:
			surf.append(mi.material_override)
		else:
			for si in mi.mesh.get_surface_count():
				surf.append(mi.get_surface_override_material(si))
		for m: Material in surf:
			if m is ShaderMaterial and _lit_mats.has(m):
				(m as ShaderMaterial).set_shader_parameter("cloth_bind0", first)
				mats.append(m as ShaderMaterial)
	sm.set("cloth_mats", mats)
	if not mats.is_empty():
		print("CQ cloth push: %d surfaces" % mats.size())


## Swaps every surface of `mi` to the lit fighter material; false if one cannot be converted.
func _light_mesh(mi: MeshInstance3D) -> bool:
	if mi.mesh == null:
		return false
	if mi.material_override != null:
		var o: ShaderMaterial = _lit_material(mi.material_override)
		if o == null:
			return false
		mi.material_override = o
		return true
	var subs: Array = []
	for si in mi.mesh.get_surface_count():
		var sm: ShaderMaterial = _lit_material(mi.get_active_material(si))
		if sm == null:
			return false
		subs.append(sm)
	for si in subs.size():
		mi.set_surface_override_material(si, subs[si])
	return true


func _lit_material(m: Material) -> ShaderMaterial:
	if not (m is BaseMaterial3D):
		return null
	var b := m as BaseMaterial3D
	if b.transparency != BaseMaterial3D.TRANSPARENCY_DISABLED or b.shading_mode != BaseMaterial3D.SHADING_MODE_PER_PIXEL \
			or b.cull_mode != BaseMaterial3D.CULL_BACK or b.vertex_color_use_as_albedo or b.normal_enabled \
			or b.emission_enabled or b.uv1_triplanar:
		return null
	var sm := ShaderMaterial.new()
	sm.shader = LIT_SHADER
	sm.set_shader_parameter("albedo_tex", b.albedo_texture)
	sm.set_shader_parameter("albedo", b.albedo_color)
	var orm: Texture2D = b.roughness_texture if b.roughness_texture != null else b.metallic_texture
	sm.set_shader_parameter("orm_tex", orm)
	var ch: Array[Vector4] = [Vector4(1, 0, 0, 0), Vector4(0, 1, 0, 0), Vector4(0, 0, 1, 0), Vector4(0, 0, 0, 1), Vector4(0.3, 0.59, 0.11, 0)]
	sm.set_shader_parameter("orm_channel_r", ch[b.roughness_texture_channel] if b.roughness_texture != null else Vector4(0, 0, 0, 1))
	sm.set_shader_parameter("orm_channel_m", ch[b.metallic_texture_channel] if b.metallic_texture != null else Vector4(0, 0, 0, 1))
	sm.set_shader_parameter("roughness", b.roughness)
	sm.set_shader_parameter("metallic", b.metallic)
	sm.set_shader_parameter("specular", b.metallic_specular)
	sm.set_shader_parameter("uv1_scale", b.uv1_scale)
	sm.set_shader_parameter("uv1_offset", b.uv1_offset)
	sm.set_shader_parameter("key_dir", key_dir)
	sm.set_shader_parameter("rim_team", _rim_team)
	sm.set_shader_parameter("rim_amount", (RIM_BOSS if role == "boss" else RIM_AMOUNT) if rim_on else 0.0)
	sm.set_shader_parameter("team_amount", RIM_TEAM)
	ArenaScript.set_hemi(sm, look)
	_lit_mats.append(sm)
	return sm


func _set_overlay(on: bool) -> void:
	if on == _overlay_on:
		return
	_overlay_on = on
	for mi: MeshInstance3D in _overlay_meshes:
		if is_instance_valid(mi):
			mi.material_overlay = _overlay if on else null


static func _model_aabb(root: Node3D) -> AABB:
	var out := AABB()
	var first: bool = true
	for n: Node in root.find_children("*", "MeshInstance3D", true, false):
		var mi := n as MeshInstance3D
		if mi.mesh == null:
			continue
		var xf: Transform3D = Transform3D.IDENTITY
		var p: Node = mi
		while p != null and p != root:
			if p is Node3D:
				xf = (p as Node3D).transform * xf
			p = p.get_parent()
		var box: AABB = xf * mi.get_aabb()
		if first:
			out = box
			first = false
		else:
			out = out.merge(box)
	return out


# ---------------------------------------------------------------- weapons in hand (cq 234)

## Puts a loaded weapon scene in a hand. `att` is {bone, matrix} from
## data/attach.json (or the app's fight config): bone is the skeleton's hand
## bone ("" for a static model: the weapon goes on the model itself) and
## matrix the weapon root's transform in that bone's space (16 floats,
## column-major). The socket is a BoneAttachment3D named hand_r / hand_l on
## the hand bone, so the idle, walk and attack motion carry the weapon.
## Returns "" or why it could not.
func hold_weapon(weapon: Node3D, att: Dictionary, side: String, cls: String) -> String:
	if model == null or model_info != "glb":
		weapon.free()
		return "no model"
	var m: Array = att.get("matrix", [])
	if m.size() != 16:
		weapon.free()
		return "no grip matrix"
	var xf := Transform3D(Basis(Vector3(m[0], m[1], m[2]), Vector3(m[4], m[5], m[6]), Vector3(m[8], m[9], m[10])), Vector3(m[12], m[13], m[14]))
	var bone: String = str(att.get("bone", ""))
	var socket: Node3D
	if bone == "":
		# static model: the GLB's own root (under the size-normalising holder)
		socket = Node3D.new()
		model.get_child(0).add_child(socket)
	else:
		var sk: Skeleton3D = null
		for n: Node in model.find_children("*", "Skeleton3D", true, false):
			if (n as Skeleton3D).find_bone(bone) >= 0:
				sk = n
				break
		if sk == null:
			weapon.free()
			return "no bone " + bone
		var ba := BoneAttachment3D.new()
		ba.bone_name = bone
		sk.add_child(ba)
		socket = ba
	socket.name = "hand_" + side
	var holder := Node3D.new()
	holder.name = "weapon_" + side
	holder.transform = xf
	socket.add_child(holder)
	holder.add_child(weapon)
	if weapons.has(side):
		(weapons[side]["socket"] as Node).queue_free()
	weapons[side] = {"socket": socket, "node": holder, "class": cls, "bone": bone}
	return ""


## The weapon's grip point (the hand) in the world, or Vector3.INF.
func grip_point(side: String = "r") -> Vector3:
	if weapons.has(side):
		return (weapons[side]["node"] as Node3D).global_position
	return Vector3.INF


# ---------------------------------------------------------------- actions

## Plays a combat state for `length` seconds: the clip if the GLB has one, else the
## procedural pose plus a body motion. `hit_at`: when the strike lands (seconds into the
## state); a clip's contact frame is lined up with it. Returns true when a clip plays it.
func act(state: String, length: float, hit_at: float = -1.0) -> bool:
	if dead and state != "death":
		# a hit landing after the killing blow (a bolt in flight) must not stand a clip
		# character back up out of its held death pose (cq 014: the boss and the Guardian
		# have clips now)
		return anim.has_clip("death")
	var clip: bool = anim.play(state, length, hit_at)
	_motion = state
	_mt = 0.0
	_mlen = length
	_spin_dir = 1.0
	return clip


func set_guard(on: bool) -> void:
	if on == guarding:
		return
	guarding = on
	guard_t = 0.0
	if on:
		anim.play("guard")
	elif anim.state == "guard":
		anim.state = "_"


func flash(amount: float = 1.0) -> void:
	_flash = maxf(_flash, amount)


## The hit's pop, and (fight-anim) the additive recoil away from `push` (the blow's direction in
## the world; zero = pushed back) at `strength` (0.5 light or blocked, 1 heavy, 1.4 crit).
func hurt_pop(push: Vector3 = Vector3.ZERO, strength: float = 0.8) -> void:
	_pop_t = 0.0
	anim.flinch(push, strength)


## fight-anim: a blow the body takes without a new clip (a block, a barrier): the recoil only.
func flinch(push: Vector3, strength: float) -> void:
	anim.flinch(push, strength)


## fight-anim: a hit reaction for `length` seconds, unless an attack or skill clip still owns the
## body (the Guardian mid-swing): then the recoil already playing on top of it shows the hit, and
## the swing is not cut into a hit clip (the old 165 deg/frame snap). Presentation only: callers
## that change the game (the hero's interrupted swing, a stagger) keep calling act("hit").
func react_hit(length: float) -> void:
	if anim.busy_action():
		return
	act("hit", length)


## look-fight: the body shakes side to side for `secs` (the hit-stop), `amp` metres, fading.
## The body node only: the fighter's position, hurtbox and weapon arc never move.
func shudder(secs: float, amp: float) -> void:
	_shud_t = secs
	_shud_len = maxf(0.001, secs)
	_shud_amp = amp


## look-fight: the fallen Guardian glows and folds away over `secs` (fx.motes carries it off).
func dissolve(secs: float) -> void:
	_diss_t = 0.0
	_diss_len = maxf(0.05, secs)


func knock(dir: Vector3, metres: float) -> void:
	# an impulse that travels about `metres` under the 9/s friction in tick_physics
	var d: Vector3 = Vector3(dir.x, 0.0, dir.z)
	if d.length_squared() < 0.0001:
		d = -forward()
	kb_vel = d.normalized() * metres * 9.0


func give_shield(amount: int, seconds: float) -> void:
	shield_hp = amount
	shield_t = seconds
	if _dome == null:
		_dome = MeshInstance3D.new()
		var sm := SphereMesh.new()
		sm.radius = 1.0
		sm.height = 1.0           # a half-height sphere: a dome
		sm.radial_segments = 24
		sm.rings = 8
		sm.is_hemisphere = true
		_dome.mesh = sm
		_dome_mat = ShaderMaterial.new()
		_dome_mat.shader = DOME_SHADER
		_dome.material_override = _dome_mat
		_dome.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(_dome)
	var r: float = 1.15 * size_k
	_dome.scale = Vector3(r, HEIGHT * size_k * 0.75, r)
	_dome.visible = true
	_dome_age = 0.0
	_shatter_t = -1.0
	_dome_mat.set_shader_parameter("shatter", 0.0)
	_dome_mat.set_shader_parameter("tile", preload("res://art/fx/fx_tile.png"))


## Damage through the barrier first. Returns what is left for the HP.
func absorb(amount: int) -> int:
	if shield_hp <= 0:
		return amount
	var took: int = mini(shield_hp, amount)
	shield_hp -= took
	_dome_hit = 1.0
	if shield_hp <= 0:
		shield_t = minf(shield_t, 0.25)
	return amount - took


func give_buff(mult: float, seconds: float) -> void:
	buff_mult = mult
	buff_t = seconds
	if _aura == null:
		_aura = MeshInstance3D.new()
		var q := PlaneMesh.new()
		q.size = Vector2(2.2, 2.2) * size_k
		_aura.mesh = q
		var m := StandardMaterial3D.new()
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		m.albedo_texture = preload("res://art/fx/magic_02.png")
		m.albedo_color = Color(1.0, 0.75, 0.3, 0.9)
		m.disable_receive_shadows = true
		_aura.material_override = m
		_aura.position.y = 0.06
		_aura.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(_aura)
	_aura.visible = true


func die() -> void:
	if dead:
		return
	dead = true
	hp = 0
	_death_t = 0.0
	set_guard(false)
	shield_t = 0.0
	buff_t = 0.0
	act("death", 1.2)
	hurtbox.monitorable = false


func celebrate() -> void:
	celebrating = true
	_cele_t = 0.0
	set_guard(false)
	act("victory", 1.4)


## Timers that run with game logic (frozen in hit-stop).
func tick_logic(dt: float) -> void:
	iframes = maxf(0.0, iframes - dt)
	stagger = maxf(0.0, stagger - dt)
	if guarding:
		guard_t += dt
	if shield_t > 0.0:
		shield_t -= dt
		if shield_t <= 0.0:
			shield_hp = 0
	if buff_t > 0.0:
		buff_t -= dt
		if buff_t <= 0.0:
			buff_mult = 1.0
	if kb_vel.length_squared() > 0.0001:
		position += kb_vel * dt
		kb_vel = kb_vel * exp(-9.0 * dt)
		if kb_vel.length() < 0.05:
			kb_vel = Vector3.ZERO


## Visual tick: animator, procedural body motion, flash, dome, aura.
func tick_visual(dt: float) -> void:
	anim.frozen = anim_freeze
	anim.update(dt, speed_now, dead or celebrating)
	var vdt: float = 0.0 if anim_freeze else dt
	var pos := Vector3.ZERO
	var rot := Vector3.ZERO
	var sc: float = 1.0
	var clip: bool = anim.has_clip(_motion) and not anim.body_with_clip(_motion)
	if _motion != "" and _mlen > 0.0:
		_mt += vdt
		var k: float = _mt / _mlen
		if k >= 1.0 and _motion != "death" and _motion != "victory":
			_motion = ""
		elif not clip:
			_body_motion(_motion, clampf(k, 0.0, 1.0), pos, rot)
			pos = _bm_pos
			rot = _bm_rot
	if _pop_t >= 0.0:
		_pop_t += vdt
		if _pop_t > 0.15:
			_pop_t = -1.0
		else:
			sc = 1.0 + 0.08 * (1.0 - _pop_t / 0.15)
	if dead and _death_t >= 0.0 and not anim.has_clip("death"):
		_death_t += vdt
		var kd: float = clampf(_death_t / 0.6, 0.0, 1.0)
		rot.x = -PI * 0.5 * ease(kd, 0.5)
		pos.y = -0.25 * kd
	if celebrating and not anim.has_clip("victory"):
		_cele_t += vdt
		pos.y += absf(sin(_cele_t * 7.0)) * 0.3
	if guarding and not anim.has_clip("guard"):
		pos.y -= 0.06
	if _shud_t > 0.0:
		_shud_t = maxf(0.0, _shud_t - dt)
		_shud_clock += dt
		var sk: float = _shud_t / _shud_len
		pos.x += sin(_shud_clock * 95.0) * _shud_amp * sk
		pos.z += sin(_shud_clock * 71.0 + 1.1) * _shud_amp * 0.5 * sk
	var sxz: float = 1.0
	if _diss_t >= 0.0:
		_diss_t += dt
		var kd2: float = clampf(_diss_t / _diss_len, 0.0, 1.0)
		_flash = maxf(_flash, 0.9 * (1.0 - kd2) + 0.3)
		sxz = 1.0 - ease(kd2, 2.2)
		sc *= 1.0 + 0.08 * sin(kd2 * PI)
		if kd2 >= 1.0:
			visible = false
			_diss_t = -1.0
	# fight-anim: the drawn body eases after the yaw (see TURN_RATE)
	if is_nan(_vis_yaw):
		_vis_yaw = yaw
	_vis_yaw = lerp_angle(_vis_yaw, yaw, 1.0 - exp(-dt * TURN_RATE))
	var lag: float = wrapf(_vis_yaw - yaw, -PI, PI)
	if absf(lag) > TURN_LAG_MAX:
		lag = signf(lag) * TURN_LAG_MAX
		_vis_yaw = yaw + lag
	rot.y += lag
	# fight-anim: a knockback shove leans the body with the push and sinks it a little (the feet
	# are planted while the game slides the fighter back, so the body reads as shoved, not gliding)
	var kv: float = kb_vel.length()
	if kv > 1.0 and not dead:
		var kk: float = clampf((kv - 1.0) / 6.0, 0.0, 1.0)
		var kl: Vector3 = global_basis.orthonormalized().inverse() * kb_vel.normalized()
		rot.x += 0.24 * kk * kl.z
		rot.z -= 0.24 * kk * kl.x
		pos.y -= 0.05 * kk * size_k
	body.position = pos
	body.rotation = rot
	body.scale = Vector3(sc * sxz, sc * (1.0 + 0.6 * (1.0 - sxz)) * maxf(0.05, sxz), sc * sxz)
	if _cast != null:
		_cast.visible = visible
		_cast.global_transform = Transform3D(Basis(Vector3.UP, _cast_yaw), global_position + _cast_off + Vector3(0, 0.04, 0))
	# hit flash
	if _flash > 0.0:
		_flash = maxf(0.0, _flash - dt * 7.0)
	_overlay.set_shader_parameter("flash", _flash)
	_set_overlay(_flash > 0.0 and not _overlay_meshes.is_empty())
	if _flash != _lit_flash:
		_lit_flash = _flash
		for m: ShaderMaterial in _lit_mats:
			m.set_shader_parameter("flash", _flash)
	if _dome != null:
		var on: bool = shield_t > 0.0 and not dead
		if not on and _dome.visible and _shatter_t < 0.0:
			_shatter_t = 0.0
			shield_ended.emit(global_position, 1.15 * size_k)
		if _shatter_t >= 0.0:
			# the dome breaks up cell by cell over 0.3 s (fx throws the shards)
			_shatter_t += dt
			_dome_mat.set_shader_parameter("shatter", clampf(_shatter_t / 0.3, 0.0, 1.0))
			_dome_mat.set_shader_parameter("hit", 1.0)
			if _shatter_t >= 0.3:
				_shatter_t = -1.0
				_dome.visible = false
		else:
			_dome.visible = on
		if on:
			_dome_age += dt
			_dome_hit = maxf(0.0, _dome_hit - dt * 4.0)
			var fade: float = clampf(shield_t / 0.4, 0.0, 1.0)
			_dome_mat.set_shader_parameter("alpha", maxf(fade, 0.6))
			_dome_mat.set_shader_parameter("hit", _dome_hit + maxf(0.0, 1.0 - _dome_age / 0.25))
			var pop: float = 1.0 + 0.12 * sin(clampf(_dome_age / 0.22, 0.0, 1.0) * PI) - 0.25 * maxf(0.0, 1.0 - _dome_age / 0.1)
			var r: float = 1.15 * size_k
			_dome.scale = Vector3(r, HEIGHT * size_k * 0.75, r) * pop
	if _aura != null:
		_aura.visible = buff_t > 0.0 and not dead
		if _aura.visible:
			_aura.rotation.y += dt * 1.6
			(_aura.material_override as StandardMaterial3D).albedo_color.a = 0.85 * clampf(buff_t / 0.5, 0.0, 1.0)


var _bm_pos: Vector3
var _bm_rot: Vector3


## Root-motion stand-ins per state; k is the state's phase 0..1.
func _body_motion(st: String, k: float, pos: Vector3, rot: Vector3) -> void:
	match st:
		"attack_1", "attack_2":
			var f: float = k / 0.3 if k < 0.3 else 1.0 - ease((k - 0.3) / 0.7, 0.6)
			pos.z += 0.3 * f
			rot.x += 0.14 * f
		"attack_3", "heavy":
			var f3: float = k / 0.45 if k < 0.45 else 1.0 - ease((k - 0.45) / 0.55, 0.6)
			pos.z += 0.5 * f3
			pos.y += 0.25 * sin(clampf(k / 0.45, 0.0, 1.0) * PI)
			rot.x += 0.22 * f3
		"skill_whirl":
			rot.y += TAU * 2.0 * ease(k, 0.8) * _spin_dir
		"skill_charge":
			rot.x += 0.35 * sin(k * PI)
		"skill_split":
			pos.y += 0.9 * sin(clampf(k / 0.45, 0.0, 1.0) * PI) if k < 0.45 else 0.0
			if k >= 0.45 and k < 0.7:
				pos.y -= 0.12 * sin((k - 0.45) / 0.25 * PI)
		"skill_rally", "skill_shield":
			pos.y += 0.12 * sin(k * PI)
		"hit":
			pos.z -= 0.18 * sin(k * PI)
			rot.x -= 0.18 * sin(k * PI)
		"parry":
			rot.y += 0.35 * sin(k * PI)
		"dodge":
			rot.x += 0.55 * sin(k * PI)
			pos.y -= 0.25 * sin(k * PI)
	_bm_pos = pos
	_bm_rot = rot
