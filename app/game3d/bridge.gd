extends Node
## Autoload "Bridge" (/root/Bridge): the React Native <-> Godot fight contract.
##   start_fight(config_json: String) -> void     start or restart a fight
##   set_result_callback(cb: Callable) -> void    cb.call(result_json) when a fight ends
##   get_status() -> String                       {state, t_left, hero_hp, enemy_hp, fps}
##   end_fight() -> void                          abort, outcome "quit"
##   signal fight_finished(result_json: String)
## Pushed through the result callback besides the result (each with the fight's fight_id):
##   {"event":"state","state":..}            the fight loading / on screen
##   {"event":"haptic","k":kind,"s":0..1}    a touch to play (fight.gd _buzz, haptics.gd; only
##                                           when the config says "haptics": true; rm=1 under
##                                           the app's Reduce motion)
## Every event is printed with a "CQ " prefix (Android logcat tag "godot").
## User args (after "--"): --autotest, --config=<json file path>.

signal fight_finished(result_json: String)

const FightScript := preload("res://fight.gd")
# the deck cast from cq 060 (farm only; a missing file falls back to a mannequin)
const TEST_MODELS: String = "/opt/cq/tasks/060-forge-match-the-deck/out/models/"

var _cb: Callable = Callable()
var _fight: FightScript
var _started: bool = false
var _autotest: bool = false
var _config_path: String = ""
var _fights_started: int = 0
# The app's id for the fight (config fight_id), echoed in every message back so
# a late message from a replaced fight is ignored. State changes are pushed
# through the result callback ({"event": "state", ...}) instead of the app
# polling get_status(): each call from React Native into Godot is a worklet,
# and every worklet run left ~1.7 MB of native memory behind (measured).
var _fight_id: int = 0
var _pushed_state: String = ""
var _capture: Node = null   # review captures (capture.gd), only with -- --capture=<json>


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	# Reachable from the React Native thread without walking the scene tree
	# (Node lookups there are main-thread only): the app calls
	# Engine.get_singleton("CQBridge").call_deferred("start_fight", json), which
	# Godot queues thread-safely. That is not a worklet run (see above).
	if not Engine.has_singleton("CQBridge"):
		Engine.register_singleton("CQBridge", self)
	var args: PackedStringArray = OS.get_cmdline_user_args()
	for a: String in args:
		if a == "--autotest":
			_autotest = true
		elif a.begins_with("--config="):
			_config_path = a.substr(9)
		elif a.begins_with("--capture="):
			var spec: Variant = JSON.parse_string(FileAccess.get_file_as_string(a.substr(10)))
			if spec is Dictionary:
				_capture = (load("res://capture.gd") as GDScript).new()
				_capture.call("setup", spec)
				add_child(_capture)
				_start_capture.call_deferred(spec)
	var headless: bool = DisplayServer.get_name() == "headless"
	if headless:
		Engine.max_fps = 60   # headless has no vsync: keep the box quiet and the timing phone-like
	_log("bridge ready godot=%s display=%s renderer=%s args=%s" % [
		Engine.get_version_info().get("string", "?"), DisplayServer.get_name(),
		str(ProjectSettings.get_setting("rendering/renderer/rendering_method", "?")), str(args)])
	if _config_path != "":
		_start_from_file.call_deferred(_config_path)
	get_tree().create_timer(1.5).timeout.connect(_on_startup_timeout)
	if _autotest:
		get_tree().create_timer(300.0).timeout.connect(_on_watchdog)


func _start_capture(spec: Dictionary) -> void:
	var c: Dictionary = spec.get("config", {})
	if not c.has("dyn_res"):
		c["dyn_res"] = false   # review frames at a fixed render scale, whatever the box's load
	start_fight(JSON.stringify(c))
	_capture.call("attach", _fight)


func _on_watchdog() -> void:
	print("CQRESULT " + JSON.stringify({"outcome": "error", "reason": "autotest watchdog 300 s", "status": get_status()}))
	get_tree().quit(1)


func _log(s: String) -> void:
	print("CQ " + s)


func _start_from_file(path: String) -> void:
	var p: String = path
	if p.begins_with("file://"):
		p = p.substr(7).uri_decode()
	var txt: String = FileAccess.get_file_as_string(p)
	if txt == "":
		_log("config_file_error path=%s err=%d" % [p, FileAccess.get_open_error()])
		return
	_log("config_file path=%s" % p)
	start_fight(txt)


func _on_startup_timeout() -> void:
	if _started or not _autotest:
		return
	_log("autotest: no start_fight within 1.5 s, starting the test fight")
	start_fight(JSON.stringify({
		"hero_glb": TEST_MODELS + "pose/armstrong/lod1.glb",
		"ally_glb": TEST_MODELS + "pose/nebulx/lod1.glb",
		"enemy_glb": TEST_MODELS + "deck/hoof/lod1.glb",
		"hero_name": "Armstrong",
		"ally_name": "Nebul-X",
		"enemy_name": "Hoof",
		"point_name": "Autotest Plaza",
		"autoplay": true,
		"seed": 61,
	}))


# ------------------------------------------------------------ public API

func start_fight(config_json: String) -> void:
	_started = true
	var cfg: Dictionary = {}
	if config_json.strip_edges() != "":
		var j := JSON.new()
		if j.parse(config_json) == OK and j.data is Dictionary:
			cfg = j.data
		else:
			_log("start_fight bad_json line=%d msg=%s, using defaults" % [j.get_error_line(), j.get_error_message()])
	if _autotest and not cfg.has("autoplay"):
		cfg["autoplay"] = true
	if _fight != null and is_instance_valid(_fight):
		_log("restart previous_state=%s" % _fight.state)
		_fight.finished.disconnect(_on_finished)
		_fight.haptic.disconnect(_on_haptic)
		_fight.get_parent().remove_child(_fight)
		_fight.queue_free()
		_fight = null
	_fights_started += 1
	_fight_id = int(cfg.get("fight_id", _fights_started))
	_pushed_state = ""
	_fight = FightScript.new()
	_fight.name = "Fight%d" % _fights_started
	_fight.configure(cfg)
	_fight.finished.connect(_on_finished)
	_fight.haptic.connect(_on_haptic)
	var parent: Node = get_tree().current_scene
	if parent == null:
		parent = get_tree().root
	parent.add_child(_fight)
	_log("start_fight n=%d mode=%s keys=%s" % [_fights_started, _fight.mode, str(cfg.keys())])
	# Leak probe (tests): restart the fight inside this one engine and view,
	# self_cycle more times every self_cycle_ms, with no React Native churn.
	var left: int = int(cfg.get("self_cycle", 0))
	if left > 0:
		var again: Dictionary = cfg.duplicate()
		again["self_cycle"] = left - 1
		var me: Node3D = _fight
		get_tree().create_timer(float(cfg.get("self_cycle_ms", 6000)) / 1000.0).timeout.connect(func() -> void:
			if _fight == me:
				_log("self_cycle left=%d static_mb=%.1f objects=%d" % [left - 1, OS.get_static_memory_usage() / 1048576.0, int(Performance.get_monitor(Performance.OBJECT_COUNT))])
				start_fight(JSON.stringify(again)))


func set_result_callback(cb: Callable) -> void:
	_cb = cb
	_log("result_callback set valid=%s" % cb.is_valid())


func get_status() -> String:
	if _fight == null or not is_instance_valid(_fight):
		return JSON.stringify({"state": "idle", "t_left": 0.0, "hero_hp": 0, "enemy_hp": 0, "fps": Engine.get_frames_per_second()})
	return JSON.stringify(_fight.status())


func end_fight() -> void:
	if _fight == null or not is_instance_valid(_fight):
		_log("end_fight ignored (no fight)")
		return
	_log("end_fight state=%s" % _fight.state)
	_fight.abort()


# ------------------------------------------------------------ result

func _on_finished(result: Dictionary) -> void:
	result["fight_id"] = _fight_id
	var json: String = JSON.stringify(result)
	_log("result " + json)
	fight_finished.emit(json)
	if _cb.is_valid():
		_cb.call(json)
	if _autotest:
		print("CQRESULT " + json)
		get_tree().quit.call_deferred(0)


func _on_haptic(kind: String, strength: float) -> void:
	if _autotest or not _cb.is_valid():
		return
	var m: Dictionary = {"event": "haptic", "k": kind, "s": snappedf(strength, 0.01), "fight_id": _fight_id}
	if bool(_fight.cfg.get("reduce_motion", false)):
		m["rm"] = 1
	_cb.call(JSON.stringify(m))


func _exit_tree() -> void:
	if Engine.has_singleton("CQBridge") and Engine.get_singleton("CQBridge") == self:
		Engine.unregister_singleton("CQBridge")


func _process(_dt: float) -> void:
	if _fight == null or not is_instance_valid(_fight) or not _cb.is_valid():
		return
	var st: String = _fight.state
	if st == "intro":
		st = "fighting"   # cq 019: the place's fly-in is on screen, so the app's loading card goes
	if st != _pushed_state and (st == "fighting" or st == "loading"):
		_pushed_state = st
		_cb.call(JSON.stringify({"event": "state", "state": st, "fight_id": _fight_id}))
