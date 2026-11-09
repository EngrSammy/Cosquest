extends SceneTree
## A fight with the server's modifiers (battle-3d-only, docs/game3d/XP.md "Modifiers"):
##   godot --headless --path app/game3d --fixed-fps 30 -s res://tests/judge_mods_test.gd
## 1. The rules id is still the pinned one: modifiers sit beside the rules table, never in it.
## 2. The record carries the modifiers, and adds up against the modded Guardian (its HP x boss_hp_permille).
## 3. Every strike on the hero side is inside the modded range (the strike's range x boss_dmg_permille).
## Prints "CQTEST PASS <name>" / "CQTEST FAIL <name> <why>", then "CQTEST done failures=N".

const FightScript := preload("res://fight.gd")
const PINNED_RULES: String = "f3d-1-21d2cde61ab2"
const HP_P: int = 700
const DMG_P: int = 1300

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
	var cfg: Dictionary = {"mode": "full", "duration_s": 30, "autoplay": true, "seed": 241, "load_thread": false, "render_scale": 0.5,
		"mods": {"boss_hp_permille": HP_P, "boss_dmg_permille": DMG_P}, "guardian_look": {"size_permille": 1150, "title": "RAID BOSS"}}
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
	var m: Dictionary = j.get("mods", {})
	_check("record_rules", str(j.get("rules", "")) == PINNED_RULES)
	_check("record_mods", int(m.get("boss_hp_permille", 0)) == HP_P and int(m.get("boss_dmg_permille", 0)) == DMG_P, str(m))
	var start: int = int(round(6500 * (HP_P / 1000.0)))
	var boss: int = 0
	var strikes_ok: bool = true
	var strikes: int = 0
	for h: Array in j.get("hits", []):
		if int(h[2]) == 2:
			boss += int(h[5])
		elif int(h[3]) == 8 or int(h[3]) == 9:
			var base: Vector2i = Vector2i(70, 90) if int(h[3]) == 8 else Vector2i(110, 140)
			var lo: int = int(round(base.x * (DMG_P / 1000.0)))
			var hi: int = int(round(base.y * (DMG_P / 1000.0)))
			var amt: int = int(h[4])
			if int(h[6]) & 8:   # blocked: x0.2 of the modded range
				lo = maxi(1, int(round(lo * 0.2)))
				hi = maxi(1, int(round(hi * 0.2)))
			strikes += 1
			strikes_ok = strikes_ok and amt >= lo and amt <= hi
	_check("boss_hp_adds_up", maxi(0, start - boss) == int(r["enemy_hp_left"]), "%d vs %d" % [start - boss, int(r["enemy_hp_left"])])
	_check("strikes_in_modded_range", strikes_ok and strikes > 0, "strikes=%d" % strikes)
