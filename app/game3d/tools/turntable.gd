extends SceneTree
## Character look sheets (cq 239): a turntable, a select-screen portrait, a face close-up and a
## fight-camera proxy of one cast GLB, under the arena's own light (sun, bluish ambient, filmic).
##   xvfb-run godot --path app/game3d --rendering-driver opengl3 --resolution 512x768 \
##     -s res://tools/turntable.gd -- --glb=/abs/lod1.glb --out=/abs/prefix [--views=8] [--pose=0.4]
## Saves <prefix>_tt<deg>.png (full body, every 360/views degrees), _select.png (3/4 portrait),
## _face.png (head close-up), _fightcam.png (the fight camera's pitch, FOV and distance, at the
## game's 0.5 render scale on a 720x1280 phone: the character ends up ~60 px tall).
## --pose=<s> holds the GLB's own idle clip at that time (rest pose when it has none).
## The file goes through char_loader's rig_fix, as in the fight.

const Loader := preload("res://char_loader.gd")

var _cam: Camera3D
var _pivot: Node3D
var _model: Node3D
var _shots: Array = []
var _k: int = 0
var _wait: int = 0
var _out: String = ""
var _top: float = 1.8


func _initialize() -> void:
	var glb: String = ""
	var views: int = 8
	var pose_t: float = 0.4
	for a: String in OS.get_cmdline_user_args():
		if a.begins_with("--glb="):
			glb = a.substr(6)
		elif a.begins_with("--out="):
			_out = a.substr(6)
		elif a.begins_with("--views="):
			views = int(a.substr(8))
		elif a.begins_with("--pose="):
			pose_t = float(a.substr(7))
	var root3d := Node3D.new()
	root.add_child(root3d)
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.16, 0.17, 0.21)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.62, 0.64, 0.92)
	e.ambient_light_energy = 0.66
	e.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	e.tonemap_white = 6.0
	var we := WorldEnvironment.new()
	we.environment = e
	root3d.add_child(we)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-42.0, 40.0, 0.0)
	sun.light_energy = 1.15
	root3d.add_child(sun)
	_pivot = Node3D.new()
	root3d.add_child(_pivot)
	var fx: Array = Loader.rig_fix(glb)
	var r: Dictionary = Loader.new().load_glb(str(fx[0]))
	if not bool(r.get("ok", false)):
		push_error("load failed: " + str(r.get("error", "")))
		quit(1)
		return
	_model = r["node"]
	_pivot.add_child(_model)
	var held: bool = false
	for ap: Node in _model.find_children("*", "AnimationPlayer", true, false):
		var p := ap as AnimationPlayer
		var pick: String = ""
		for n: StringName in p.get_animation_list():
			if str(n).to_lower().contains("idle"):
				pick = str(n)
		if pick != "" and pose_t >= 0.0:
			p.play(pick)
			p.seek(pose_t, true)
			p.pause()
			held = true
		else:
			p.stop()
			p.active = false
	if not held:
		for sk: Node in _model.find_children("*", "Skeleton3D", true, false):
			(sk as Skeleton3D).reset_bone_poses()
	_cam = Camera3D.new()
	root3d.add_child(_cam)
	for i: int in views:
		_shots.append({"name": "tt%03d" % int(360.0 * i / views), "yaw": 360.0 * i / views, "kind": "full"})
	_shots.append({"name": "select", "yaw": -25.0, "kind": "select"})
	_shots.append({"name": "face", "yaw": -15.0, "kind": "face"})
	_shots.append({"name": "fightcam", "yaw": 0.0, "kind": "fight"})
	print("CQTT loaded %s as %s" % [glb, str(fx[0])])


func _aabb() -> AABB:
	var box := AABB()
	var first: bool = true
	for n: Node in _model.find_children("*", "MeshInstance3D", true, false):
		var mi := n as MeshInstance3D
		var b: AABB = mi.global_transform * mi.get_aabb()
		box = b if first else box.merge(b)
		first = false
	return box


func _head() -> Vector3:
	for n: Node in _model.find_children("*", "Skeleton3D", true, false):
		var sk := n as Skeleton3D
		for nm: String in ["Head", "mixamorig:Head", "head"]:
			var b: int = sk.find_bone(nm)
			if b >= 0:
				# the head bone sits a little below the eyes on these rigs
				return sk.global_transform * sk.get_bone_global_pose(b).origin + Vector3(0, 0.03, 0)
	return Vector3(0, _top * 0.9, 0)


func _process(_dt: float) -> bool:
	if _k >= _shots.size():
		quit(0)
		return true
	var s: Dictionary = _shots[_k]
	if _wait == 0:
		_pivot.rotation_degrees = Vector3(0, float(s["yaw"]), 0)
		var box: AABB = _aabb()
		_top = box.end.y
		var mid: float = _top * 0.5
		match str(s["kind"]):
			"full":
				_cam.fov = 30.0
				_cam.look_at_from_position(Vector3(0, mid + 0.1, mid / tan(deg_to_rad(15.0)) * 1.12), Vector3(0, mid, 0))
			"select":
				_cam.fov = 30.0
				_cam.look_at_from_position(Vector3(0, _top * 0.72, _top * 2.0), Vector3(0, _top * 0.62, 0))
			"face":
				# aimed at the Head bone (the bounding box top is orbs, horns or hair on some)
				var hp: Vector3 = _head()
				_cam.fov = 30.0
				_cam.look_at_from_position(hp + Vector3(0, 0.02, 1.0), hp + Vector3(0, 0.0, 0), Vector3.UP)
			"fight":
				# fight.gd: pitch 44, FOV 55, distance 16.5, render scale 0.5 (bilinear up)
				_cam.fov = 55.0
				var pitch: float = deg_to_rad(44.0)
				_cam.look_at_from_position(Vector3(0, 0.7 + 16.5 * sin(pitch), 16.5 * cos(pitch)), Vector3(0, 0.7, 0))
		root.get_viewport().scaling_3d_mode = Viewport.SCALING_3D_MODE_BILINEAR
		root.get_viewport().scaling_3d_scale = 0.5 if str(s["kind"]) == "fight" else 1.0
	_wait += 1
	if _wait < 4:
		return false
	var img: Image = root.get_viewport().get_texture().get_image()
	img.save_png("%s_%s.png" % [_out, str(s["name"])])
	_k += 1
	_wait = 0
	return false
