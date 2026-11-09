extends SceneTree
## The place's build cost on the main thread (day1-world, ART-DIRECTION 8 "place build time"):
##   godot --path app/game3d --rendering-driver opengl3 --fixed-fps 30 -s res://tools/place_perf.gd -- \
##     [--ground=/abs/ground.json --at=x,z] [--thread=1] [--frames=90] [--time=golden] \
##     [--hero=/abs/hero.glb --ally=... --enemy=...]
## Starts a fight the way the app does (bridge.start_fight; with --hero etc. the fighters load on their
## thread as in the app, else an arena-only fight) and measures until the fight begins:
##  - start_ms: the synchronous start_fight call (the frame the fight is created in stalls this long);
##  - per frame until the place is in: the main thread's process time (Performance TIME_PROCESS), its
##    max and sum, and the frame count;
##  - the place's own log (info: ms, ms_parts, main_ms, worker_ms).
## No --ground: the default street (StreetLayout through place.gd).
## Prints "CQPLACE {json}".

var _a: Dictionary = {"frames": "90", "thread": "1", "time": "golden"}
var _fight: Node
var _t0: int = 0
var _n: int = 0
var _proc: PackedFloat32Array = PackedFloat32Array()
var _frame: PackedFloat32Array = PackedFloat32Array()
var _last: int = 0
var _start_ms: float = 0.0
var _ready_frame: int = -1


func _initialize() -> void:
	for s: String in OS.get_cmdline_user_args():
		if s.begins_with("--") and s.contains("="):
			_a[s.substr(2, s.find("=") - 2)] = s.substr(s.find("=") + 1)
	var cfg: Dictionary = {"mode": "arena", "autoplay": false, "intro": false, "seed": 233, "render_scale": 0.5,
		"dyn_res": false, "look": {"time": str(_a["time"])}, "place_thread": str(_a["thread"]) == "1"}
	if _a.has("hero"):
		cfg["mode"] = "full"
		cfg["load_thread"] = true
		for r: String in ["hero", "ally", "enemy"]:
			cfg[r + "_glb"] = str(_a.get(r, ""))
	if _a.has("ground"):
		var at: PackedStringArray = str(_a.get("at", "0,0")).split(",")
		cfg["arena"] = "place"
		cfg["ground_json"] = str(_a["ground"])
		cfg["place_at"] = [float(at[0]), float(at[1])]
	var main: Node = load("res://main.tscn").instantiate()
	root.add_child(main)
	current_scene = main
	(func() -> void:
		var bridge: Node = root.get_node("Bridge")
		var t: int = Time.get_ticks_usec()
		bridge.call("start_fight", JSON.stringify(cfg))
		_start_ms = (Time.get_ticks_usec() - t) / 1000.0
		_fight = bridge.get("_fight")
		_last = Time.get_ticks_usec()).call_deferred()


func _process(_dt: float) -> bool:
	if _fight == null:
		return false
	var now: int = Time.get_ticks_usec()
	_frame.append((now - _last) / 1000.0)
	_last = now
	_proc.append(Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0)
	_n += 1
	var arena: Node = _fight.get("arena")
	var pl: Node = null
	if arena != null:
		pl = arena.get("place") if arena.get("place") != null else arena.get("street_place")
	var rv: Variant = pl.get("built") if pl != null else false
	var ready: bool = pl != null and (not (rv is bool) or rv == true)   # null: a build without the flag (synchronous)
	ready = ready and str(_fight.get("state")) != "loading" and pl.is_inside_tree()
	if ready and _ready_frame < 0:
		_ready_frame = _n
	if _n >= int(_a["frames"]) and _ready_frame >= 0:
		var mx: float = 0.0
		var sm: float = 0.0
		for i in mini(_proc.size(), _ready_frame + 2):
			mx = maxf(mx, _proc[i])
			sm += _proc[i]
		var info: Dictionary = pl.get("info") if pl != null else {}
		var fr: Array = []   # every frame from the start to two after the fight begins
		var pr: Array = []
		for i in range(1, mini(_frame.size(), _ready_frame + 3)):
			fr.append(snappedf(_frame[i], 0.1))
			pr.append(snappedf(_proc[i], 0.1))
		var steady: Array = Array(_frame.slice(_frame.size() - 20))
		steady.sort()
		var out: Dictionary = {"start_ms": snappedf(_start_ms, 0.1), "ready_frame": _ready_frame,
			"proc_max_ms": snappedf(mx, 0.1), "proc_sum_ms": snappedf(sm, 0.1),
			"thread": str(_a["thread"]), "info_ms": info.get("ms"), "main_ms": info.get("main_ms"),
			"main_max_ms": info.get("main_max_ms"), "begin_wait_ms": info.get("begin_wait_ms"),
			"frame_max_ms": snappedf(_maxf(fr), 0.1), "worker_ms": info.get("worker_ms"), "parts": info.get("ms_parts"),
			"buildings": info.get("buildings"), "heroes": info.get("heroes"), "dbg": info.get("dbg"), "frames_ms": fr, "proc_ms": pr, "steady_frame_p50": snappedf(float(steady[10]), 0.1)}
		print("CQPLACE " + JSON.stringify(out))
		quit(0)
	return false


static func _maxf(a: Array) -> float:
	var m: float = 0.0
	for v: Variant in a:
		m = maxf(m, float(v))
	return m
