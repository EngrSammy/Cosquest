extends SceneTree
## Contract check for the Bridge autoload. Run headless:
##   godot --headless --path game3d -s res://tests/bridge_test.gd
## Exits with the number of failed checks (0 = pass). Uses capsule fighters (no GLBs) so it is quick.

var _fail: int = 0
var _results: Array[String] = []
var _states: Array[String] = []
var _signals: Array[String] = []


func _initialize() -> void:
	_run.call_deferred()


func _check(cond: bool, what: String) -> void:
	print(("CQTEST PASS " if cond else "CQTEST FAIL ") + what)
	if not cond:
		_fail += 1


func _status(bridge: Node) -> Dictionary:
	var v: Variant = JSON.parse_string(str(bridge.call("get_status")))
	return v if v is Dictionary else {}


func _wait_frames(n: int) -> void:
	for i in n:
		await process_frame


func _wait_results(count: int, max_s: float) -> void:
	var t0: int = Time.get_ticks_msec()
	while _results.size() < count and Time.get_ticks_msec() - t0 < int(max_s * 1000.0):
		await process_frame


func _run() -> void:
	var bridge: Node = root.get_node_or_null("Bridge")
	if bridge == null:
		bridge = (load("res://bridge.gd") as GDScript).new() as Node
		bridge.name = "Bridge"
		root.add_child(bridge)
		print("CQTEST note: Bridge autoload not present under -s, added by hand")
	await _wait_frames(2)
	# Results only; state pushes ({"event": "state"}) are counted apart.
	bridge.call("set_result_callback", func(j: String) -> void:
		if j.contains("\"event\""):
			_states.append(j)
		else:
			_results.append(j))
	bridge.connect("fight_finished", func(j: String) -> void: _signals.append(j))
	_check(str(_status(bridge).get("state", "")) == "idle", "state idle before any fight")

	# 1. start, then restart on the very next frame
	bridge.call("start_fight", JSON.stringify({"mode": "arena", "duration_s": 3}))
	await _wait_frames(1)
	bridge.call("start_fight", JSON.stringify({"mode": "full", "duration_s": 25, "autoplay": true, "seed": 5}))
	await _wait_frames(3)
	var st: Dictionary = _status(bridge)
	_check(str(st.get("state", "")) == "fighting", "fighting after restart (got %s)" % str(st))
	_check(_results.is_empty(), "restart emits no result")
	_check(not _states.is_empty() and _states[-1].contains("fight_id"), "state pushed with fight_id")
	# a fresh fight's numbers (the autoplay bot may already have landed its opening CHARGE)
	_check(int(st.get("hero_hp", 0)) == 1000 and int(st.get("enemy_hp", 0)) > 6000, "status hp fields (got %s)" % str(st))
	var fights: int = 0
	for n: Node in root.find_children("Fight*", "", true, false):
		if not n.is_queued_for_deletion():
			fights += 1
	_check(fights == 1, "exactly one live fight node after restart (got %d)" % fights)

	# 2. end_fight -> quit, through both the callback and the signal
	bridge.call("end_fight")
	await _wait_frames(2)
	_check(_results.size() == 1 and _signals.size() == 1, "end_fight delivers one result via callback and signal")
	if _results.size() >= 1:
		var r: Dictionary = JSON.parse_string(_results[0])
		_check(str(r.get("outcome", "")) == "quit", "end_fight outcome quit")
	_check(str(_status(bridge).get("state", "")) == "done", "state done after end_fight")
	bridge.call("end_fight")   # second abort is a no-op
	await _wait_frames(2)
	_check(_results.size() == 1, "second end_fight does not emit again")

	# 3. a full autoplay fight to its end, with a broken GLB path (capsule fallback)
	bridge.call("start_fight", JSON.stringify({"duration_s": 30, "autoplay": true, "seed": 7, "hero_glb": "file:///nonexistent/hero.glb"}))
	await _wait_results(2, 60.0)
	_check(_results.size() == 2, "autoplay fight finished")
	if _results.size() >= 2:
		var r2: Dictionary = JSON.parse_string(_results[1])
		print("CQTEST result " + _results[1])
		for k: String in ["outcome", "damage_dealt", "damage_taken", "time_s", "hits", "skill_uses", "enemy_hp_left", "hero_hp_left", "mode"]:
			_check(r2.has(k), "result has key " + k)
		_check(str(r2.get("outcome", "")) in ["win", "lose", "timeout"], "outcome is win/lose/timeout")
		_check(int(r2.get("damage_taken", 0)) > 0, "damage taken > 0")
		_check(int(r2.get("hits", 0)) > 0, "hits > 0")
		_check(int(r2.get("combo_max", 0)) == 3, "the bot chained a full 3-hit combo (cq 233)")

	# 4. bad JSON still starts a default fight; then quit it
	bridge.call("start_fight", "this is not json")
	await _wait_frames(3)
	_check(str(_status(bridge).get("state", "")) == "fighting", "bad json falls back to defaults")
	bridge.call("end_fight")
	await _wait_frames(2)
	_check(_results.size() == 3, "third result delivered")

	# 5. the loss path (cq 233): a hero who does nothing loses to the boss, sped up 4x
	Engine.time_scale = 4.0
	bridge.call("start_fight", JSON.stringify({"duration_s": 45, "autoplay": true, "bot": "idle", "seed": 9}))
	await _wait_results(4, 40.0)
	Engine.time_scale = 1.0
	_check(_results.size() == 4, "idle-bot fight finished")
	if _results.size() >= 4:
		var r4: Dictionary = JSON.parse_string(_results[3])
		print("CQTEST result " + _results[3])
		_check(str(r4.get("outcome", "")) == "lose", "a hero who never fights loses (got %s)" % str(r4.get("outcome", "")))
		_check(int(r4.get("hits", -1)) == 0, "the idle hero landed no hits")

	# 6. the fighting bot wins (cq 233), sped up 4x
	Engine.time_scale = 4.0
	bridge.call("start_fight", JSON.stringify({"duration_s": 45, "autoplay": true, "seed": 11}))
	await _wait_results(5, 40.0)
	Engine.time_scale = 1.0
	_check(_results.size() == 5, "bot fight finished")
	if _results.size() >= 5:
		var r5: Dictionary = JSON.parse_string(_results[4])
		print("CQTEST result " + _results[4])
		_check(str(r5.get("outcome", "")) == "win", "the fighting bot wins (got %s)" % str(r5.get("outcome", "")))
		_check(int(r5.get("skill_uses", 0)) >= 3, "the bot used skills")

	print("CQTEST done failures=%d" % _fail)
	quit(_fail)
