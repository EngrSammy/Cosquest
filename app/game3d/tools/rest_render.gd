extends SceneTree
## Rest-pose renders of one GLB (cq 014: the proof that a rig fix leaves the look unchanged).
## No animation plays and every bone sits at its rest, so the original cq 060 file and the
## fixed rig must render the same pixels.
##   xvfb-run godot --path app/game3d --rendering-driver opengl3 --resolution 480x720 \
##     -s res://tools/rest_render.gd -- --glb=/abs/lod1.glb --out=/abs/prefix
## Saves <prefix>_front.png, _side.png, _back.png, _3q.png.

const Loader := preload("res://char_loader.gd")

var _cam: Camera3D
var _pivot: Node3D
var _views: Array = [["front", 0.0], ["side", 90.0], ["back", 180.0], ["3q", -35.0]]
var _k: int = 0
var _wait: int = 0
var _out: String = ""


func _initialize() -> void:
	var glb: String = ""
	for a: String in OS.get_cmdline_user_args():
		if a.begins_with("--glb="):
			glb = a.substr(6)
		elif a.begins_with("--out="):
			_out = a.substr(6)
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
	_pivot = Node3D.new()
	root3d.add_child(_pivot)
	var r: Dictionary = Loader.new().load_glb(glb)
	if not bool(r.get("ok", false)):
		push_error("load failed: " + str(r.get("error", "")))
		quit(1)
		return
	var model: Node3D = r["node"]
	_pivot.add_child(model)
	for ap: Node in model.find_children("*", "AnimationPlayer", true, false):
		(ap as AnimationPlayer).stop()
		(ap as AnimationPlayer).active = false
	for sk: Node in model.find_children("*", "Skeleton3D", true, false):
		(sk as Skeleton3D).reset_bone_poses()
	_cam = Camera3D.new()
	_cam.fov = 30.0
	root3d.add_child(_cam)
	_cam.look_at_from_position(Vector3(0, 0.9, 4.0), Vector3(0, 0.9, 0))
	print("CQREST loaded %s" % glb)


func _process(_dt: float) -> bool:
	if _k >= _views.size():
		quit(0)
		return true
	if _wait == 0:
		_pivot.rotation_degrees = Vector3(0, float(_views[_k][1]), 0)
	_wait += 1
	if _wait < 4:
		return false
	var img: Image = root.get_viewport().get_texture().get_image()
	img.save_png("%s_%s.png" % [_out, str(_views[_k][0])])
	print("CQREST shot %s_%s.png" % [_out, str(_views[_k][0])])
	_k += 1
	_wait = 0
	return false
