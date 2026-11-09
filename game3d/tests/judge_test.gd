extends SceneTree
## The fight's record for the game server's judge (cq 019, docs/game3d/XP.md):
##   godot --headless --path app/game3d --fixed-fps 30 -s res://tests/judge_test.gd
## 1. The rules id is pinned: a change to fight.gd's combat numbers changes it, and the game server
##    (costquest-backend app/roam_fight3d.py RULES) must change with it, or every 3D fight is held.
## 2. A seeded fight's record adds up to its result: the boss's HP, damage dealt, hits, skills.
## Prints "CQTEST PASS <name>" / "CQTEST FAIL <name> <why>", then "CQTEST done failures=N".

const FightScript := preload("res://fight.gd")
const PINNED_RULES: String = "f3d-1-21d2cde61ab2"

var _fails: int = 0
var _done: bool = false


func _check(name: String, ok: bool, why: String = "") -> void:
	if ok:
		print("CQTEST PASS " + name)
	else:
		_fails += 1
		print("CQTEST FAIL %s %s" % [name, why])


func _initialize() -> void:
	_check("rules_id_pinned", FightScript.rules_id() == PINNED_RULES, FightScript.rules_id())
	var cfg: Dictionary = {"mode": "full", "duration_s": 45, "autoplay": true, "seed": 239, "load_thread": false, "render_scale": 0.5}
	var main: Node = load("res://main.tscn").instantiate()
	root.add_child(main)
	current_scene = main
	(func() -> void:
		var bridge: Node = root.get_node("Bridge")
		bridge.call("set_result_callback", func(j: String) -> void:
			if j.contains("\"event\"") or _done:
				return
			_done = true
			_verify(JSON.parse_string(j))
			print("CQTEST done failures=%d" % _fails)
			quit.call_deferred(0 if _fails == 0 else 1))
		bridge.call("start_fight", JSON.stringify(cfg))).call_deferred()


func _verify(r: Dictionary) -> void:
	var j: Dictionary = r.get("judge", {})
	_check("record_present", not j.is_empty() and int(j.get("v", 0)) == 1)
	_check("record_seed", int(j.get("seed", -1)) == 239, str(j.get("seed")))
	_check("record_rules", str(j.get("rules", "")) == PINNED_RULES)
	var boss: int = 0
	var dealt: int = 0
	var hits: int = 0
	var last_t: int = 0
	var ordered: bool = true
	for h: Array in j.get("hits", []):
		ordered = ordered and int(h[0]) >= last_t and int(h[1]) <= int(h[0]) + 1
		last_t = int(h[0])
		if int(h[2]) == 2:
			boss += int(h[5])
			if int(h[3]) >= 1 and int(h[3]) <= 6:
				dealt += int(h[5])
				hits += 1 if int(h[5]) > 0 else 0
	_check("record_ordered", ordered)
	_check("boss_hp_adds_up", maxi(0, 6500 - boss) == int(r["enemy_hp_left"]), "%d vs %d" % [6500 - boss, int(r["enemy_hp_left"])])
	_check("damage_adds_up", dealt == int(r["damage_dealt"]) and hits == int(r["hits"]), "%d/%d vs %d/%d" % [dealt, hits, int(r["damage_dealt"]), int(r["hits"])])
	_check("casts_add_up", (j.get("casts", []) as Array).size() == int(r["skill_uses"]))
