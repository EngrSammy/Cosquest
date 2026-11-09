extends SceneTree
## Forge portraits (day1-ui, ART-DIRECTION 5 "Same characters everywhere", 6.4 pins/marker):
## one 3/4 render of each published Forge character or weapon, lit with the Golden preset's key
## and ambient (tokens.json world.time.golden), so the map pin, the player marker, the Collection
## and the versus card all show the same picture of the same model the fight loads.
##   xvfb-run -a -s "-screen 0 512x768x24" godot --path app/game3d --rendering-driver opengl3 \
##     --resolution 512x768 -s res://tools/portrait.gd -- --plan=/abs/plan.json
## plan.json: [{"glb": "/abs/x.glb", "kind": "character"|"weapon", "out": "/abs/prefix"}]
## Writes, per item:
##   <prefix>_portrait.png  512x512, cream #F4EEE2 page; characters a 3/4 bust (head and
##                          shoulders), weapons the whole piece at 3/4. Pins, cards, Collection.
##   <prefix>_full.png      characters only: 384x576 full body at 3/4 on a transparent page,
##                          the player marker's standing sprite (6.4 "Player marker").
## Software GL (llvmpipe) is fine: a handful of frames per model. The GLB goes through
## char_loader's rig_fix like the fight, so a cast model gets the same cleaned textures.
## Prints "CQPORTRAIT ok <prefix>" or "CQPORTRAIT fail <prefix> <why>" per item.

const Loader := preload("res://char_loader.gd")

# tokens.json world.time.golden
const CREAM := Color("#F4EEE2")
const KEY_COL := Color("#FFDDB0")
const KEY_ENERGY: float = 2.2 / 1.9     # the arena's 2.2 is for ACES at exposure 1.0 over a lit world; the
                                        # studio page has no bounce, so the key is scaled so skin sits at
                                        # the fight's on-screen brightness (checked on Armstrong's face)
const KEY_ELEV: float = 38.0
const AMB_COL := Color("#B8C6DC")
const AMB_ENERGY: float = 0.38 + 0.08   # + the 0.08 "studio fill" (5 Exposure)
const SKY_UPPER := Color("#86AEE0")
const RIM_STRENGTH: float = 0.35        # 5 Rim: Golden/Day
const YAW: float = -32.0                # 3/4: the model turned to its left, key from camera left

var _items: Array = []
var _i: int = 0
var _step: int = 0
var _wait: int = 0
var _cam: Camera3D
var _pivot: Node3D
var _model: Node3D
var _env: Environment
var _fails: int = 0


func _initialize() -> void:
	for a: String in OS.get_cmdline_user_args():
		if a.begins_with("--plan="):
			var d: Variant = JSON.parse_string(FileAccess.get_file_as_string(a.substr(7)))
			_items = d if d is Array else []
	var root3d := Node3D.new()
	root.add_child(root3d)
	_env = Environment.new()
	_env.background_mode = Environment.BG_COLOR
	_env.background_color = CREAM
	_env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	_env.ambient_light_color = AMB_COL
	_env.ambient_light_energy = AMB_ENERGY
	_env.tonemap_mode = Environment.TONE_MAPPER_ACES
	_env.tonemap_exposure = 1.0
	_env.tonemap_white = 6.0
	var we := WorldEnvironment.new()
	we.environment = _env
	root3d.add_child(we)
	var key := DirectionalLight3D.new()
	# from camera-left and above, 38 deg up (the Golden key's elevation)
	key.rotation_degrees = Vector3(-KEY_ELEV, -35.0, 0.0)
	key.light_color = KEY_COL
	key.light_energy = KEY_ENERGY
	key.shadow_enabled = false
	root3d.add_child(key)
	# the cool back rim of section 5 as a weak light from behind-right
	var back := DirectionalLight3D.new()
	back.rotation_degrees = Vector3(-20.0, 150.0, 0.0)
	back.light_color = Color(1, 1, 1).lerp(SKY_UPPER, 0.4)
	back.light_energy = 0.45
	root3d.add_child(back)
	_pivot = Node3D.new()
	root3d.add_child(_pivot)
	_cam = Camera3D.new()
	_cam.keep_aspect = Camera3D.KEEP_HEIGHT
	_cam.near = 0.02
	root3d.add_child(_cam)
	_cam.current = true
	root.transparent_bg = false


func _load(it: Dictionary) -> bool:
	if _model != null:
		_model.queue_free()
		_model = null
	var fx: Array = Loader.rig_fix(str(it.get("glb", "")))
	var r: Dictionary = Loader.new().load_glb(str(fx[0]))
	if not bool(r.get("ok", false)):
		print("CQPORTRAIT fail %s %s" % [it.get("out", ""), str(r.get("error", ""))])
		return false
	_model = r["node"]
	_pivot.add_child(_model)
	_pose(_model)
	_rim(_model)
	return true


## The idle clip's first frame if it has one; otherwise the rest pose (not the bind T-pose).
func _pose(m: Node3D) -> void:
	var held: bool = false
	for ap: Node in m.find_children("*", "AnimationPlayer", true, false):
		var p := ap as AnimationPlayer
		var pick: String = ""
		for n: StringName in p.get_animation_list():
			if str(n).to_lower().contains("idle"):
				pick = str(n)
		if pick != "":
			p.play(pick)
			p.seek(0.4, true)
			p.pause()
			held = true
		else:
			p.stop()
			p.active = false
	if not held:
		for sk: Node in m.find_children("*", "Skeleton3D", true, false):
			(sk as Skeleton3D).reset_bone_poses()


## Section 5 rim on the model's own materials (60 % white + 40 % sky upper, 0.35 Golden).
func _rim(m: Node3D) -> void:
	for n: Node in m.find_children("*", "MeshInstance3D", true, false):
		var mi := n as MeshInstance3D
		if mi.mesh == null:
			continue
		for s: int in mi.mesh.get_surface_count():
			var mat := mi.get_active_material(s) as BaseMaterial3D
			if mat == null:
				continue
			var c := mat.duplicate() as BaseMaterial3D
			c.rim_enabled = true
			c.rim = RIM_STRENGTH
			c.rim_tint = 0.4
			mi.set_surface_override_material(s, c)


func _aabb() -> AABB:
	var box := AABB()
	var first: bool = true
	for n: Node in _model.find_children("*", "MeshInstance3D", true, false):
		var mi := n as MeshInstance3D
		var b: AABB = mi.global_transform * mi.get_aabb()
		box = b if first else box.merge(b)
		first = false
	return box


func _head(top: float) -> Vector3:
	for n: Node in _model.find_children("*", "Skeleton3D", true, false):
		var sk := n as Skeleton3D
		for nm: String in ["Head", "mixamorig:Head", "head", "DEF-spine.006", "neck_01"]:
			var b: int = sk.find_bone(nm)
			if b >= 0:
				return sk.global_transform * sk.get_bone_global_pose(b).origin + Vector3(0, 0.05, 0)
	return Vector3(0, top * 0.88, 0)


func _frame(kind: String, shot: String) -> void:
	_pivot.rotation_degrees = Vector3(0, YAW, 0)
	var box: AABB = _aabb()
	var top: float = box.end.y
	_cam.fov = 26.0
	if kind == "character" and shot == "portrait":
		# head and shoulders: the eyes about a third down, the frame ~0.9 m tall, the hat or hair in frame
		var hp: Vector3 = _head(top)
		var h: float = clampf(top * 0.5, 0.7, 1.1)
		var aim := Vector3(hp.x, hp.y - h * 0.16, hp.z)
		var dist: float = (h * 0.5) / tan(deg_to_rad(_cam.fov * 0.5))
		_cam.look_at_from_position(aim + Vector3(0, h * 0.10, dist), aim)
	elif kind == "character":
		# full body, feet at the bottom with a little floor
		var mid: float = (box.position.y + top) * 0.5
		var h2: float = (top - box.position.y) * 1.08
		var dist2: float = (h2 * 0.5) / tan(deg_to_rad(_cam.fov * 0.5))
		_cam.look_at_from_position(Vector3(0, mid + 0.05, dist2), Vector3(0, mid, 0))
	else:
		# a weapon: laid back at 3/4 and fitted, longest side ~80 % of the frame
		var c: Vector3 = box.get_center()
		var longest: float = maxf(box.size.y, maxf(box.size.x, box.size.z))
		var dist3: float = (longest * 0.62) / tan(deg_to_rad(_cam.fov * 0.5))
		_cam.look_at_from_position(c + Vector3(0, longest * 0.12, dist3), c)


func _process(_dt: float) -> bool:
	if _i >= _items.size():
		print("CQPORTRAIT done %d/%d" % [_items.size() - _fails, _items.size()])
		quit(0 if _fails == 0 else 1)
		return true
	var it: Dictionary = _items[_i]
	var kind: String = str(it.get("kind", "character"))
	var shots: Array = ["portrait", "full"] if kind == "character" else ["portrait"]
	if _step == 0 and _wait == 0:
		if not _load(it):
			_fails += 1
			_i += 1
			return false
	var shot: String = shots[_step]
	if _wait == 0:
		var full: bool = shot == "full"
		root.transparent_bg = full
		_env.background_mode = Environment.BG_CLEAR_COLOR if full else Environment.BG_COLOR
		RenderingServer.set_default_clear_color(Color(0, 0, 0, 0))
		root.size = Vector2i(384, 576) if full else Vector2i(512, 512)
		_frame(kind, shot)
	_wait += 1
	if _wait < 5:
		return false
	var img: Image = root.get_viewport().get_texture().get_image()
	var path: String = "%s_%s.png" % [str(it["out"]), shot]
	img.save_png(path)
	_wait = 0
	_step += 1
	if _step >= shots.size():
		print("CQPORTRAIT ok %s" % str(it["out"]))
		_step = 0
		_i += 1
	return false
