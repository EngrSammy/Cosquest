extends SceneTree
## look-fight: the feel is presentation only, and it keeps its own rules (art direction 7).
##   godot --headless --path app/game3d --fixed-fps 30 -s res://tests/feel_test.gd
## 1. The rules id is unchanged (the feel touched no combat number).
## 2. A seeded win: the KO beat ran (boss_ko), time is back to 1x when the result goes out, the
##    shake stayed inside its budget (15 % of the fight), and the VICTORY card came after the beat.
## 3. A seeded loss (the idle bot): the hero's KO beat, the world desaturating, time back to 1x.
## 4. The table matches section 7 (the numbers other workstreams review against).
## The byte-identical check of the fight's record is e2e (bin/seeded_full.sh before/after, README).
## Prints "CQTEST PASS <name>" / "CQTEST FAIL <name> <why>", then "CQTEST done failures=N".

const FightScript := preload("res://fight.gd")
const FeelScript := preload("res://feel.gd")

var _fails: int = 0
var _runs: Array[Dictionary] = [
	{"name": "win", "cfg": {"mode": "full", "duration_s": 45, "autoplay": true, "seed": 239, "load_thread": false, "render_scale": 0.5}},
	{"name": "loss", "cfg": {"mode": "full", "duration_s": 45, "autoplay": true, "bot": "idle", "seed": 7, "load_thread": false, "render_scale": 0.5}},
]
var _i: int = -1
var _fight: Node
var _saw_banner_at: float = -1.0
var _done: bool = false


func _check(name: String, ok: bool, why: String = "") -> void:
	if ok:
		print("CQTEST PASS " + name)
	else:
		_fails += 1
		print("CQTEST FAIL %s %s" % [name, why])


func _initialize() -> void:
	_check("rules_id_unchanged", FightScript.rules_id() == "f3d-1-21d2cde61ab2", FightScript.rules_id())
	var m: Dictionary = FeelScript.MOMENTS
	_check("table_light", is_equal_approx(float(m["light"]["stop"]), 0.05) and is_equal_approx(float(m["light"]["trauma"]), 0.04))
	_check("table_crit", is_equal_approx(float(m["crit"]["stop"]), 0.1) and is_equal_approx(float(m["crit"]["zoom"]), 0.04))
	_check("table_boss_ko", is_equal_approx(float(m["boss_ko"]["stop"]), 0.16) and is_equal_approx(float(m["boss_ko"]["slow"]), 0.3)
		and is_equal_approx(float(m["boss_ko"]["slow_s"]), 0.5))
	_check("table_hero_ko", is_equal_approx(float(m["hero_ko"]["slow"]), 0.5) and is_equal_approx(float(m["hero_ko"]["desat"]), 0.6))
	var f := FeelScript.new()
	f.reduce_motion = true
	f.shake("crit", 1.0, false)
	_check("reduce_motion_quarter_shake", is_equal_approx(f.trauma, 0.04), str(f.trauma))
	_check("reduce_motion_no_zoom", f.zoom("crit") == 0.0)
	var g := FeelScript.new()
	g.shake("heavy", 1.0, true)
	_check("no_shake_in_dodge", g.trauma == 0.0)
	g.shake_time = 10.0
	g.shake("light", 20.0, false)
	_check("budget_keeps_light_still", g.trauma == 0.0)
	g.shake("crit", 20.0, false)
	_check("budget_keeps_crit_still", g.trauma == 0.0)
	g.shake("ult", 20.0, false)
	_check("budget_lets_ult_through", g.trauma > 0.0)
	g.shake("boss_ko", 20.0, false)
	_check("budget_lets_ko_through", g.trauma >= 0.24)
	var main: Node = load("res://main.tscn").instantiate()
	root.add_child(main)
	current_scene = main
	_next.call_deferred()


func _next() -> void:
	_i += 1
	if _i >= _runs.size():
		print("CQTEST done failures=%d" % _fails)
		quit.call_deferred(0 if _fails == 0 else 1)
		return
	_saw_banner_at = -1.0
	_done = false
	var bridge: Node = root.get_node("Bridge")
	bridge.call("set_result_callback", func(j: String) -> void:
		if j.contains("\"event\"") or _done:
			return
		_done = true
		_verify(JSON.parse_string(j))
		_next.call_deferred())
	bridge.call("start_fight", JSON.stringify(_runs[_i]["cfg"]))
	_fight = bridge.get("_fight")


func _process(_dt: float) -> bool:
	if _fight != null and is_instance_valid(_fight) and _saw_banner_at < 0.0:
		var hud: Node = _fight.get("hud")
		if hud != null and str(hud.get("_banner_kind")) != "":
			var feel: Variant = _fight.get("feel")
			_saw_banner_at = float(feel.get("ko_t")) if feel != null else 0.0
	return false


func _verify(r: Dictionary) -> void:
	var run: String = _runs[_i]["name"]
	var feel: Variant = _fight.get("feel") if is_instance_valid(_fight) else null
	_check(run + "_time_back_to_1x", is_equal_approx(Engine.time_scale, 1.0), str(Engine.time_scale))
	if feel == null:
		_check(run + "_feel_present", false)
		return
	var ft: float = float(r.get("time_s", 1.0))
	if run == "win":
		_check("win_outcome", str(r["outcome"]) == "win", str(r["outcome"]))
		_check("win_ko_beat", bool(feel.get("ko_active")) and str(feel.get("ko_kind")) == "boss_ko")
		# the budget may run over by the last impact's tail (it decides per impact)
		var share: float = float(feel.get("shake_time")) / maxf(1.0, ft)
		_check("win_shake_budget", share <= FeelScript.SHAKE_BUDGET + 0.03, "%.3f" % share)
		_check("win_card_after_beat", _saw_banner_at >= 0.6, "%.2f" % _saw_banner_at)
		print("CQFEEL shake_share=%.3f skipped=%d time_s=%.2f" % [share, int(feel.get("shake_skipped")), ft])
	else:
		_check("loss_outcome", str(r["outcome"]) == "lose", str(r["outcome"]))
		_check("loss_ko_beat", bool(feel.get("ko_active")) and str(feel.get("ko_kind")) == "hero_ko")
		_check("loss_desaturated", float(feel.get("desat")) > 0.5, str(feel.get("desat")))
