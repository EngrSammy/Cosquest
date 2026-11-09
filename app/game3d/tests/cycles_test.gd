extends SceneTree
## Open/close soak (cq 233): N fights started and ended through the Bridge, each with the
## real cast GLBs, the street and a few seconds of autoplay. Prints the engine's memory,
## object, resource and node counts after each close, and fails on a climb.
##   CQ_MODELS=/abs/models/ CQ_CYCLES=10 godot --path game3d --rendering-driver opengl3 \
##     -s res://tests/cycles_test.gd
## (under xvfb-run for a real GL context; --headless works too, without the GPU side).
## CQ_MODELS holds pose/<name>/lod1.glb; without it the fighters are capsules.
## Exits with the number of failed checks (0 = pass).

var _fail: int = 0
var _results: Array[String] = []


func _initialize() -> void:
	_run.call_deferred()


func _check(cond: bool, what: String) -> void:
	print(("CQTEST PASS " if cond else "CQTEST FAIL ") + what)
	if not cond:
		_fail += 1


func _frames(n: int) -> void:
	for i in n:
		await process_frame


func _seconds(s: float) -> void:
	var t0: int = Time.get_ticks_msec()
	while Time.get_ticks_msec() - t0 < int(s * 1000.0):
		await process_frame


func _sample() -> Dictionary:
	return {
		"static_mb": OS.get_static_memory_usage() / 1048576.0,
		"objects": int(Performance.get_monitor(Performance.OBJECT_COUNT)),
		"resources": int(Performance.get_monitor(Performance.OBJECT_RESOURCE_COUNT)),
		"nodes": int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT)),
		"orphans": int(Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT)),
		"vmem_mb": Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED) / 1048576.0,
	}


func _run() -> void:
	var bridge: Node = root.get_node_or_null("Bridge")
	if bridge == null:
		bridge = (load("res://bridge.gd") as GDScript).new() as Node
		bridge.name = "Bridge"
		root.add_child(bridge)
	await _frames(2)
	bridge.call("set_result_callback", func(j: String) -> void:
		if not j.contains("\"event\""):
			_results.append(j))
	var models: String = OS.get_environment("CQ_MODELS")
	var n: int = int(OS.get_environment("CQ_CYCLES")) if OS.get_environment("CQ_CYCLES") != "" else 10
	var cast: Array = [["armstrong", "nebulx", "elvis"], ["catboy", "vanessa", "hoof"], ["bobo", "crystalz", "elvis"]]
	var samples: Array[Dictionary] = []
	for i in n:
		var c: Array = cast[i % cast.size()]
		var cfg: Dictionary = {"mode": "full", "duration_s": 45, "autoplay": true, "seed": 100 + i,
			"hero_name": str(c[0]).capitalize(), "ally_name": str(c[1]).capitalize(), "enemy_name": str(c[2]).capitalize(),
			"players_text": "2/3 players", "load_thread": false}
		if models != "":
			cfg["hero_glb"] = models + "pose/%s/lod1.glb" % c[0]
			cfg["ally_glb"] = models + "pose/%s/lod1.glb" % c[1]
			cfg["enemy_glb"] = models + "pose/%s/lod1.glb" % c[2]
		bridge.call("start_fight", JSON.stringify(cfg))
		await _seconds(3.0)
		bridge.call("end_fight")
		await _frames(10)   # queue_free and the renderer's deferred frees land
		var s: Dictionary = _sample()
		samples.append(s)
		print("CQCYCLE i=%d %s" % [i + 1, JSON.stringify(s)])
	_check(_results.size() == n, "one result per cycle (%d of %d)" % [_results.size(), n])
	# No climb: after the warm-up (first two cycles fill caches) the last cycle may not sit
	# well above the third.
	if samples.size() >= 4:
		var a: Dictionary = samples[2]
		var b: Dictionary = samples[-1]
		_check(float(b["static_mb"]) - float(a["static_mb"]) < 8.0, "static memory flat (%.1f to %.1f MB)" % [a["static_mb"], b["static_mb"]])
		_check(int(b["nodes"]) - int(a["nodes"]) <= 5, "node count flat (%d to %d)" % [a["nodes"], b["nodes"]])
		_check(int(b["objects"]) - int(a["objects"]) <= 200, "object count flat (%d to %d)" % [a["objects"], b["objects"]])
		_check(int(b["orphans"]) <= 5, "no orphan nodes left (%d)" % b["orphans"])
	print("CQTEST done failures=%d" % _fail)
	quit(_fail)
