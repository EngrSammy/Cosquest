extends SceneTree
## Headless evidence shots of the fight (cq 234), run outside the app:
##   xvfb-run -s "-screen 0 720x1280x24" godot --path app/game3d --rendering-driver opengl3 \
##     --fixed-fps 30 -s res://tools/shots.gd -- --plan=/abs/plan.json --out=/abs/dir
## plan.json: {"config": {start_fight config}, "warm_s": 1.5,
##   "input": [{"t": 0.0, "stick": [0, 1]}, {"t": 1.0, "stick": [0, 0]}, {"t": 1.2, "attack": true}],
##   "shots": [{"t": 2.6, "name": "fight_2.6s"},
##             {"t": 3.0, "name": "grip_front", "close": "front", "who": "hero", "hud": false}],
##   "hold_enemy": false, "quit_s": 9.0}
## t is seconds after the fight starts (state "fighting"), counted in frames at --fixed-fps.
## "close" frames the fighter's right hand (its hand_r socket when it has one, else the
## chest) from "front" | "side" | "back" | "top"; "full" / "fullside" frame the whole fighter.

var plan: Dictionary = {}
var out_dir: String = ""
var _frames: int = 0
var _fight_frames: int = -1
var _shots: Array = []
var _inputs: Array = []
var _cam: Camera3D
var _fps: float = 30.0
var _done: bool = false


func _initialize() -> void:
	for a: String in OS.get_cmdline_user_args():
		if a.begins_with("--plan="):
			plan = JSON.parse_string(FileAccess.get_file_as_string(a.substr(7)))
		elif a.begins_with("--out="):
			out_dir = a.substr(6)
	if plan == null or plan.is_empty() or out_dir == "":
		push_error("shots: need --plan= and --out=")
		quit(2)
		return
	DirAccess.make_dir_recursive_absolute(out_dir)
	_shots = (plan.get("shots", []) as Array).duplicate()
	_inputs = (plan.get("input", []) as Array).duplicate()
	_fps = float(Engine.physics_ticks_per_second)
	var main: Node = load("res://main.tscn").instantiate()
	root.add_child(main)
	current_scene = main
	var cfg: Dictionary = plan.get("config", {})
	(func() -> void: root.get_node("Bridge").start_fight(JSON.stringify(cfg))).call_deferred()


func _fight() -> Node:
	var b: Node = root.get_node_or_null("Bridge")
	return b.get("_fight") if b != null else null


func _process(_dt: float) -> bool:
	if _done:
		return true
	_frames += 1
	var f: Node = _fight()
	if f == null or not is_instance_valid(f):
		return false
	if _fight_frames < 0:
		if f.state == "fighting":
			_fight_frames = 0
		else:
			return false
	_fight_frames += 1
	var t: float = _fight_frames / 30.0
	if bool(plan.get("hold_enemy", false)) and f.enemy != null:
		f.enemy.position = Vector3(0, 0, -30)
	while not _inputs.is_empty() and float(_inputs[0]["t"]) <= t:
		var ev: Dictionary = _inputs.pop_front()
		if ev.has("stick"):
			f.hud.bot_stick(Vector2(float(ev["stick"][0]), float(ev["stick"][1])))
		if bool(ev.get("attack", false)):
			f.hud.bot_attack()
		if bool(ev.get("skill", false)):
			f.hud.bot_skill()
		if ev.has("face"):
			f.hero.yaw = deg_to_rad(float(ev["face"]))
			f.hero.rotation.y = f.hero.yaw
	if not _shots.is_empty() and float(_shots[0]["t"]) <= t:
		var s: Dictionary = _shots.pop_front()
		_take.call_deferred(s, f)
	if _shots.is_empty() and t >= float(plan.get("quit_s", 0.0)):
		_done = true
		quit.call_deferred(0)
	return false


func _hand_point(fighter: Node3D) -> Vector3:
	var socket: Node = fighter.find_child("weapon_r", true, false)
	if socket is Node3D:
		# between the hand and the middle of the weapon: both in frame
		var g: Transform3D = (socket as Node3D).global_transform
		return g.origin + g.basis.y.normalized() * 0.2
	socket = fighter.find_child("hand_r", true, false)
	if socket is Node3D:
		return (socket as Node3D).global_position
	for n: Node in fighter.find_children("*", "Skeleton3D", true, false):
		var sk := n as Skeleton3D
		var b: int = sk.find_bone("RightHand")
		if b >= 0:
			return sk.global_transform * sk.get_bone_global_pose(b).origin
	return fighter.global_position + Vector3(0, 1.0, 0)


func _take(s: Dictionary, f: Node) -> void:
	var hud_layer: CanvasLayer = f.get_node_or_null("HudLayer")
	var who: Node3D = f.get(str(s.get("who", "hero")))
	var close: String = str(s.get("close", ""))
	if close != "" and who != null:
		if _cam == null:
			_cam = Camera3D.new()
			_cam.fov = 35.0
			_cam.near = 0.05
			f.add_child(_cam)
		var target: Vector3 = _hand_point(who)
		var fwd: Vector3 = Vector3(sin(who.yaw), 0, cos(who.yaw))
		var right: Vector3 = Vector3(fwd.z, 0, -fwd.x)
		var dist: float = float(s.get("dist", 1.5))
		var eye: Vector3
		match close:
			"side":
				eye = target - right * dist + Vector3(0, 0.15, 0)
			"back":
				eye = target - fwd * dist + Vector3(0, 0.35, 0)
			"top":
				eye = target + fwd * dist * 0.5 + Vector3(0, dist, 0)
			"full":
				# Half-way towards the held hand, far enough back that a long weapon held out stays in frame.
				# "zoom" (default 1) scales the framing for a bigger fighter (a boss at 2x).
				var zk: float = float(s.get("zoom", 1.0))
				var off: Vector3 = (target - who.global_position) * 0.5
				target = who.global_position + Vector3(off.x, 0.95 * zk, off.z)
				eye = target + fwd * 3.9 * zk + right * 0.6 * zk + Vector3(0, 0.4 * zk, 0)
			"fullside":
				target = who.global_position + Vector3(0, 0.95, 0)
				eye = target - right * 3.2 + fwd * 0.4 + Vector3(0, 0.3, 0)
			_:
				eye = target + fwd * dist - right * 0.25 + Vector3(0, 0.2, 0)
		_cam.look_at_from_position(eye, target, Vector3.UP)
		_cam.current = true
	elif _cam != null:
		_cam.current = false
		(f.get("cam") as Camera3D).current = true
	if hud_layer != null:
		hud_layer.visible = bool(s.get("hud", close == ""))
	# "solo": only the framed fighter is drawn (the others hidden for this frame).
	var hidden: Array[Node3D] = []
	if bool(s.get("solo", false)):
		for k: String in ["hero", "ally", "enemy"]:
			var o: Node3D = f.get(k)
			if o != null and o != who and o.visible:
				o.visible = false
				hidden.append(o)
	await RenderingServer.frame_post_draw
	for o: Node3D in hidden:
		o.visible = true
	var img: Image = root.get_viewport().get_texture().get_image()
	var p: String = out_dir.path_join(str(s["name"]) + ".png")
	img.save_png(p)
	print("CQSHOT %s t=%.2f" % [p, _fight_frames / 30.0])
	if hud_layer != null:
		hud_layer.visible = true
