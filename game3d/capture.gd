extends Node
## Headless review captures (cq 233). Started by Bridge for `-- --capture=<json file>`:
##   {"config": {...fight config...}, "dir": "/abs/out", "prefix": "after",
##    "lead": 2.0, "times": [0.5, 1.3, ...],
##    "timeline": [[t, "stick", x, y], [t, "attack"], [t, "attack_hold", 0|1],
##                 [t, "skill", slot], [t, "guard", 0|1]],
##    "quit_after": 9.0,
##    "on_style": ["parry", "blocked", "crit"]}   # also a shot 0.1 s after the first damage
##                                                # number of each style: <prefix>_<style>.png
## Times are fight seconds (fight.fight_time). Saves <dir>/<prefix>_<t>s.png at lead + t
## for each t in times. Run with --fixed-fps 30 so every frame is 1/30 s of fight time
## whatever the software renderer manages, and the moments are the same run to run.

var spec: Dictionary = {}
var _fight: Node
var _shots: Array = []
var _events: Array = []
var _done: bool = false
var _t: float = 0.0          # fight seconds; keeps counting after the fight ends (banners)
var _started: bool = false
var _style_seen: Dictionary = {}
var _style_due: Array = []


func setup(s: Dictionary) -> void:
	spec = s
	# look-world: the look follows the device clock ("time": "auto"); review captures are reproducible, so
	# they take the art direction's default, Golden, unless the spec names a time
	var cfg0: Variant = spec.get("config", {})
	if cfg0 is Dictionary:
		var lk: Dictionary = (cfg0 as Dictionary).get("look", {})
		if not lk.has("time"):
			lk["time"] = "golden"
			(cfg0 as Dictionary)["look"] = lk
	var lead: float = float(spec.get("lead", 0.0))
	for t: Variant in spec.get("times", []):
		_shots.append([lead + float(t), float(t)])
	_shots.sort_custom(func(a: Array, b: Array) -> bool: return a[0] < b[0])
	for e: Variant in spec.get("timeline", []):
		_events.append(e)
	_events.sort_custom(func(a: Array, b: Array) -> bool: return float(a[0]) < float(b[0]))
	DirAccess.make_dir_recursive_absolute(str(spec.get("dir", "/tmp/cq-capture")))


func attach(f: Node) -> void:
	_fight = f


func _process(dt: float) -> void:
	if _done or _fight == null or not is_instance_valid(_fight):
		return
	var st: String = _fight.get("state")
	if st == "loading" or st == "idle":
		return
	if not _started:
		_started = true
	else:
		_t += dt
	var t: float = maxf(_t, float(_fight.get("fight_time")))
	var hud: Node = _fight.get("hud")
	_watch_styles(hud, t)
	while not _events.is_empty() and float(_events[0][0]) <= t:
		_fire(hud, _events.pop_front())
	if not _shots.is_empty() and t >= float(_shots[0][0]):
		var s: Array = _shots.pop_front()
		_save.call_deferred(float(s[1]))
	if not _style_due.is_empty() and t >= float(_style_due[0][0]):
		var sd: Array = _style_due.pop_front()
		_save_named.call_deferred(str(sd[1]))
	if _shots.is_empty() and t >= float(spec.get("quit_after", 1e9)):
		_done = true
		print("CQCAPTURE done")
		get_tree().quit.call_deferred(0)


func _watch_styles(hud: Node, t: float) -> void:
	var want: Array = spec.get("on_style", [])
	if want.is_empty() or hud == null:
		return
	for d: Dictionary in hud.get("_pops"):
		var st: String = str(d.get("style", ""))
		if st in want and not _style_seen.has(st):
			_style_seen[st] = true
			_style_due.append([t + 0.1, st])


func _save_named(tag: String) -> void:
	await RenderingServer.frame_post_draw
	var img: Image = get_viewport().get_texture().get_image()
	var path: String = "%s/%s_%s.png" % [spec.get("dir", "/tmp/cq-capture"), spec.get("prefix", "cap"), tag]
	img.save_png(path)
	_perf(path)
	print("CQCAPTURE style=%s path=%s" % [tag, path])


func _fire(hud: Node, e: Array) -> void:
	var kind: String = e[1]
	match kind:
		"stick":
			hud.call("bot_stick", Vector2(float(e[2]), float(e[3])))
		"attack":
			hud.call("bot_attack")
		"attack_hold":
			if hud.has_method("bot_attack_hold"):
				hud.call("bot_attack_hold", int(e[2]) != 0)
		"skill":
			if hud.has_method("bot_skill_slot"):
				hud.call("bot_skill_slot", int(e[2]))
			else:
				hud.call("bot_skill")
		"guard":
			if hud.has_method("bot_guard"):
				hud.call("bot_guard", int(e[2]) != 0)
		"autoplay":
			_fight.set("autoplay", int(e[2]) != 0)
		"call":
			if _fight.has_method(str(e[2])):
				_fight.callv(str(e[2]), e.slice(3))


func _save(t_ref: float) -> void:
	await RenderingServer.frame_post_draw
	var img: Image = get_viewport().get_texture().get_image()
	# "decimals" (default 1): 2 or 3 for clip frames closer together than 0.1 s
	var path: String = ("%s/%s_%." + str(int(spec.get("decimals", 1))) + "fs.png") % [str(spec.get("dir")), str(spec.get("prefix", "shot")), t_ref]
	img.save_png(path)
	print("CQCAPTURE shot t=%.1f fight_t=%.2f path=%s" % [t_ref, _t, path])
	_perf(path)


func _perf(path: String) -> void:
	# look-world: the frame's cost as the renderer counts it (draws, primitives, video memory)
	print("CQPERF shot %s draws=%d prims=%d objects=%d vmem_mb=%.1f tex_mb=%.1f buf_mb=%.1f" % [path.get_file(),
		Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME), Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME),
		Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME), Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED) / 1048576.0,
		Performance.get_monitor(Performance.RENDER_TEXTURE_MEM_USED) / 1048576.0, Performance.get_monitor(Performance.RENDER_BUFFER_MEM_USED) / 1048576.0])
	# day1-world (art direction 8, "landmark in frame"): where the place's landmark (place.gd info landmark_at,
	# landmark_h) lands in this frame: its top and base as fractions of the frame height from the top
	var arena: Node = _fight.get("arena") if _fight != null else null
	var pl: Node = arena.get("place") if arena != null else null
	var cam: Camera3D = get_viewport().get_camera_3d()
	if pl != null and cam != null:
		var info: Dictionary = pl.get("info")
		if info.has("landmark_at"):
			var at: Vector3 = info["landmark_at"]
			var top: Vector3 = at + Vector3.UP * float(info.get("landmark_h", 12.0))
			var hgt: float = get_viewport().get_visible_rect().size.y
			var vis: bool = not cam.is_position_behind(top) and not cam.is_position_behind(at)
			var yt: float = cam.unproject_position(top).y / hgt
			var yb: float = cam.unproject_position(at).y / hgt
			print("CQLANDMARK shot %s name=%s visible=%s top=%.3f base=%.3f h_frac=%.3f" % [path.get_file(), str(info.get("landmark", "")),
				str(vis), yt, yb, clampf(yb, 0.0, 1.0) - clampf(yt, 0.0, 1.0)])
