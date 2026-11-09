extends SceneTree
## Headless stand-in for the app's Filament previews (Forge bag, Wear list,
## versus card, avatar; cq 234): the same GLB, fitted the way ForgeModel fits
## it (transformToUnitCube: the whole box into a 2-unit cube, centred), the
## same camera (eye [0, 0.12, 2.7] looking at the centre, 28 mm lens on a
## 24 mm sensor), the idle clip's first frame, on the bag card's navy.
##   xvfb-run -s "-screen 0 540x384x24" godot --path app/game3d --rendering-driver opengl3 \
##     --resolution 540x384 -s res://tools/preview.gd -- --plan=<previews.json> --out=<dir>
## previews.json comes from tools/weapons/merge_previews.ts: [{glb, name, center, longest}].

var items: Array = []
var out_dir: String = ""
var _i: int = 0
var _wait: int = 0
var _holder: Node3D


func _initialize() -> void:
	for a: String in OS.get_cmdline_user_args():
		if a.begins_with("--plan="):
			items = JSON.parse_string(FileAccess.get_file_as_string(a.substr(7)))
		elif a.begins_with("--out="):
			out_dir = a.substr(6)
	DirAccess.make_dir_recursive_absolute(out_dir)
	var env := WorldEnvironment.new()
	env.environment = Environment.new()
	env.environment.background_mode = Environment.BG_COLOR
	env.environment.background_color = Color("#22384f")
	env.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.environment.ambient_light_color = Color(0.75, 0.78, 0.85)
	env.environment.ambient_light_energy = 0.7
	root.add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-40, 25, 0)
	sun.light_energy = 1.3
	root.add_child(sun)
	var cam := Camera3D.new()
	cam.transform = Transform3D(Basis(), Vector3(0, 0.12, 2.7)).looking_at(Vector3.ZERO, Vector3.UP)
	cam.keep_aspect = Camera3D.KEEP_HEIGHT
	cam.fov = rad_to_deg(2.0 * atan(12.0 / 28.0))
	cam.near = 0.05
	root.add_child(cam)
	cam.current = true


func _load(it: Dictionary) -> void:
	if _holder != null:
		_holder.queue_free()
	var doc := GLTFDocument.new()
	var state := GLTFState.new()
	if doc.append_from_file(it["glb"], state) != OK:
		push_error("preview: cannot read " + it["glb"])
		return
	var node: Node3D = doc.generate_scene(state)
	_holder = Node3D.new()
	_holder.add_child(node)
	var c: Array = it["center"]
	var k: float = 2.0 / float(it["longest"])
	_holder.transform = Transform3D(Basis().scaled(Vector3.ONE * k), Vector3(-c[0], -c[1], -c[2]) * k)
	root.add_child(_holder)
	var players: Array[Node] = _holder.find_children("*", "AnimationPlayer", true, false)
	if players.size() > 0:
		var ap := players[0] as AnimationPlayer
		for n: String in ap.get_animation_list():
			if n.to_lower().contains("idle"):
				ap.play(n)
				ap.seek(0.0, true)
				ap.pause()
				break


func _process(_dt: float) -> bool:
	if _i >= items.size():
		return true
	if _wait == 0:
		_load(items[_i])
	_wait += 1
	if _wait < 4:
		return false
	var img: Image = root.get_viewport().get_texture().get_image()
	var path: String = out_dir.path_join(String(items[_i]["name"]) + ".png")
	img.save_png(path)
	print("CQPREVIEW ", path)
	_i += 1
	_wait = 0
	return false
