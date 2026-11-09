extends SceneTree
## A seeded autoplay fight with the real cast files, for "the look changed, the fight did not" (cq 239).
##   godot --headless --path app/game3d --fixed-fps 30 -s res://tests/seeded_fight.gd -- \
##     --hero=/abs/hero.glb --ally=/abs/ally.glb --enemy=/abs/enemy.glb [--seed=239] [--keys=a,b,c]
## Prints "CQSEEDED {result json}" (outcome, damage dealt and taken, hits, time) when the fight ends.
## Run it on two builds with the same arguments: the results must be identical.

var _done: bool = false


func _initialize() -> void:
	var a: Dictionary = {"seed": "239", "keys": ",,"}
	for s: String in OS.get_cmdline_user_args():
		if s.begins_with("--") and s.contains("="):
			a[s.substr(2, s.find("=") - 2)] = s.substr(s.find("=") + 1)
	var keys: PackedStringArray = str(a["keys"]).split(",")
	var cfg: Dictionary = {"mode": "full", "duration_s": 45, "autoplay": true, "seed": int(a["seed"]),
		"hero_glb": str(a.get("hero", "")), "ally_glb": str(a.get("ally", "")), "enemy_glb": str(a.get("enemy", "")),
		"hero_key": keys[0], "ally_key": keys[1] if keys.size() > 1 else "", "enemy_key": keys[2] if keys.size() > 2 else "",
		"load_thread": false, "render_scale": 0.5}
	var main: Node = load("res://main.tscn").instantiate()
	root.add_child(main)
	current_scene = main
	(func() -> void:
		var bridge: Node = root.get_node("Bridge")
		bridge.call("set_result_callback", func(j: String) -> void:
			if not j.contains("\"event\"") and not _done:
				_done = true
				print("CQSEEDED " + j)
				quit.call_deferred(0))
		bridge.call("start_fight", JSON.stringify(cfg))).call_deferred()
