extends SceneTree
## Clip review renders (cq 012): one character, its clip library, its weapon, frames of every
## clip from a fixed camera, and a turntable. Run outside the app:
##   xvfb-run -s "-screen 0 720x1280x24" godot --path app/game3d --rendering-driver opengl3 \
##     --resolution 480x640 -s res://tools/anim_review.gd -- --plan=/abs/plan.json
## plan.json: {"model": "/abs/lod1.glb", "key": "armstrong", "class": "hammer",
##   "weapon": "/abs/forge_warhammer.glb", "out": "/abs/dir", "frames": 8,
##   "clips": ["cq/2H_Melee_Attack_Chop", ...] | "states", "views": ["front", "side"],
##   "turntable": 8, "grip": "clip" | "idle"}
## Saves <out>/<clip or state>_<view>_<k>.png and turn_<k>.png; prints CQREVIEW lines.

const Loader := preload("res://char_loader.gd")
const AnimLib := preload("res://anim_library.gd")
const Animator := preload("res://combat_animator.gd")

var plan: Dictionary = {}
var _jobs: Array = []          # [name, clip, time, view, yaw]
var _cam: Camera3D
var _model: Node3D
var _player: AnimationPlayer
var _skel: Skeleton3D
var _pivot: Node3D
var _wait: int = 0
var _cur: Array = []
var _out: String = ""
var _weapon: Node3D


func _initialize() -> void:
	for a: String in OS.get_cmdline_user_args():
		if a.begins_with("--plan="):
			plan = JSON.parse_string(FileAccess.get_file_as_string(a.substr(7)))
	_out = str(plan.get("out", "/tmp/cq-review"))
	DirAccess.make_dir_recursive_absolute(_out)
	var root3d := Node3D.new()
	root.add_child(root3d)
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.16, 0.17, 0.2)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.75, 0.75, 0.8)
	e.ambient_light_energy = 0.7
	env.environment = e
	root3d.add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50, 30, 0)
	sun.light_energy = 1.3
	root3d.add_child(sun)
	var floor := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(6, 6)
	floor.mesh = pm
	var fm := StandardMaterial3D.new()
	fm.albedo_color = Color(0.36, 0.38, 0.42)
	floor.material_override = fm
	root3d.add_child(floor)
	# a grid of lines on the floor so foot sliding shows
	for i in range(-6, 7):
		for axis in 2:
			var ln := MeshInstance3D.new()
			var bm := BoxMesh.new()
			bm.size = Vector3(6, 0.004, 0.012) if axis == 0 else Vector3(0.012, 0.004, 6)
			ln.mesh = bm
			ln.position = Vector3(0, 0.002, i * 0.25) if axis == 0 else Vector3(i * 0.25, 0.002, 0)
			var lm := StandardMaterial3D.new()
			lm.albedo_color = Color(0.28, 0.3, 0.33)
			ln.material_override = lm
			root3d.add_child(ln)
	_pivot = Node3D.new()
	root3d.add_child(_pivot)
	_cam = Camera3D.new()
	_cam.fov = 38
	root3d.add_child(_cam)
	_cam.current = true
	var r: Dictionary = Loader.new().load_glb(str(plan["model"]))
	if not bool(r.get("ok", false)):
		push_error("model: " + str(r.get("error")))
		quit(2)
		return
	_model = r["node"]
	_pivot.add_child(_model)
	var sk: Array[Node] = _model.find_children("*", "Skeleton3D", true, false)
	_skel = sk[0] if sk.size() > 0 else null
	var aps: Array[Node] = _model.find_children("*", "AnimationPlayer", true, false)
	if aps.size() > 0:
		_player = aps[0]
	else:
		_player = AnimationPlayer.new()
		_model.add_child(_player)
	var key: String = AnimLib.key_for(_skel, str(plan.get("key", "")))
	var lib: AnimationLibrary = AnimLib.library(key) if key != "" else null
	var names: PackedStringArray = AnimLib.apply(_player, _skel, lib)
	print("CQREVIEW key=%s clips=%d skeleton=%s" % [key, names.size(), str(_skel != null)])
	if _skel != null:
		var fp: Array = []
		for b: String in ["Hips", "RightHand", "LeftFoot"]:
			var i: int = _skel.find_bone(b)
			if i >= 0:
				fp.append("%s=%s" % [b, str(_skel.get_bone_global_rest(i).origin)])
		print("CQREVIEW rest ", " ".join(fp), " skel_xf=", str(_skel.global_transform.origin))
	_hold_weapon(key)
	var views: Array = plan.get("views", ["front"])
	var frames: int = int(plan.get("frames", 8))
	var clips: Array = []
	var cls: String = str(plan.get("class", "sword"))
	if str(plan.get("clips", "")) == "states":
		var st: Dictionary = AnimLib.states_for(cls, key)
		for s: String in Animator.STATES:
			if st.has(s):
				clips.append([s, AnimLib.LIB_NAME + "/" + str(st[s]["clip"]), st[s]])
	elif plan.get("clips") is Array:
		for c: String in plan["clips"]:
			clips.append([c.get_file(), c, {}])
	else:
		for c: String in names:
			clips.append([c.get_file(), c, {}])
	for c: Array in clips:
		var a: Animation = _player.get_animation(c[1])
		if a == null:
			print("CQREVIEW missing ", c[1])
			continue
		var t0: float = float(c[2].get("in", 0)) / 30.0
		var t1: float = minf(a.length, float(c[2].get("out", int(a.length * 30.0))) / 30.0)
		for v: String in views:
			for k in frames:
				var tt: float = lerpf(t0, t1, float(k) / maxf(1.0, frames - 1.0))
				_jobs.append([str(c[0]), c[1], tt, v, k])
		if c[2].has("contact"):
			_jobs.append([str(c[0]) + "_contact", c[1], float(c[2]["contact"]) / 30.0, views[0], 0])
	var turn: int = int(plan.get("turntable", 0))
	var idle: String = ""
	for c: Array in clips:
		if c[0] == "idle":
			idle = c[1]
	if idle == "" and _player != null:
		for n: String in _player.get_animation_list():
			if n.to_lower().contains("idle"):
				idle = n
				break
	for k in turn:
		_jobs.append(["turn", idle, 0.0, "front", k, 360.0 * k / turn])


func _hold_weapon(key: String) -> void:
	var wpath: String = str(plan.get("weapon", ""))
	if wpath == "" or _skel == null:
		return
	var cls: String = str(plan.get("class", "sword"))
	var att: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/attach.json"))
	var ch: Dictionary = (att.get("characters", {}) as Dictionary).get(key if key != "" else str(plan.get("key", "")), {})
	var which: String = "clip_grips" if str(plan.get("grip", "clip")) == "clip" else "grips"
	var g: Dictionary = (ch.get(which, {}) as Dictionary).get(cls, {})
	if g.is_empty():
		print("CQREVIEW no grip ", which, " ", cls)
		return
	var m: Array = g["matrix"]
	var xf := Transform3D(Basis(Vector3(m[0], m[1], m[2]), Vector3(m[4], m[5], m[6]), Vector3(m[8], m[9], m[10])), Vector3(m[12], m[13], m[14]))
	var r: Dictionary = Loader.new().load_glb(wpath)
	if not bool(r.get("ok", false)):
		return
	var ba := BoneAttachment3D.new()
	ba.bone_name = str(g["bone"])
	_skel.add_child(ba)
	var h := Node3D.new()
	h.transform = xf
	ba.add_child(h)
	h.add_child(r["node"])
	_weapon = h


func _place_cam(view: String) -> void:
	var tgt := Vector3(0, 0.95, 0)
	var d: float = 3.6
	var dir := Vector3(0, 0.12, 1)
	match view:
		"side":
			dir = Vector3(-1, 0.12, 0)
		"3q":
			dir = Vector3(-0.7, 0.25, 0.7)
		"back":
			dir = Vector3(0, 0.12, -1)
		"top":
			dir = Vector3(0, 1.4, 0.6)
	_cam.position = tgt + dir.normalized() * d
	_cam.look_at(tgt, Vector3.UP)


func _process(_dt: float) -> bool:
	if _wait > 0:
		_wait -= 1
		if _wait == 0:
			var img: Image = root.get_viewport().get_texture().get_image()
			var j: Array = _cur
			var nm: String = "%s/%s_%s_%02d.png" % [_out, j[0], j[3], j[4]] if j[0] != "turn" else "%s/turn_%02d.png" % [_out, j[4]]
			if j[0].ends_with("_contact"):
				nm = "%s/%s.png" % [_out, j[0]]
			img.save_png(nm)
			if _weapon != null:
				print("CQREVIEW weapon %s t=%.2f tip=%s up=%s" % [j[0], float(j[2]), str(_weapon.global_basis.y.normalized().snapped(Vector3.ONE * 0.01)), str(_weapon.global_basis.z.normalized().snapped(Vector3.ONE * 0.01))])
		return false
	if _jobs.is_empty():
		print("CQREVIEW done")
		return true
	_cur = _jobs.pop_front()
	_pivot.rotation_degrees.y = float(_cur[5]) if _cur.size() > 5 else 0.0
	_place_cam(str(_cur[3]))
	if str(_cur[1]) != "" and _player.has_animation(_cur[1]):
		_player.play(_cur[1], 0.0, 1.0)
		_player.seek(float(_cur[2]), true)
		_player.pause()
	_wait = 2
	return false
