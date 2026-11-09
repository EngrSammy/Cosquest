extends SceneTree
## The hit-haptics throttle (haptics.gd). Run headless:
##   godot --headless --path game3d -s res://tests/haptics_test.gd
## Exits with the number of failed checks (0 = pass). Pure: no fight, no fighters.

const HapticsScript := preload("res://haptics.gd")

var _fail: int = 0


func _initialize() -> void:
	_run()
	quit(_fail)


func _check(cond: bool, what: String) -> void:
	print(("CQTEST PASS " if cond else "CQTEST FAIL ") + what)
	if not cond:
		_fail += 1


func _run() -> void:
	var h: HapticsScript = HapticsScript.new()
	_check(h.allow("hit", 1000), "a first hit passes")
	_check(not h.allow("hit", 1040), "a second hit 40 ms later is dropped (per-kind 90 ms)")
	_check(h.allow("hit", 1100), "a hit 100 ms later passes")
	_check(h.allow("hit_heavy", 1130), "a heavy hit inside the global gap passes (it matters more)")
	_check(not h.allow("hit", 1160), "a light hit right after a heavy one is dropped")
	_check(not h.allow("nonsense", 2000), "an unknown kind never passes")

	# a burst of hits every 16 ms for one second: a few touches, not a continuous buzz
	h = HapticsScript.new()
	var sent: int = 0
	for i in 63:
		if h.allow("hit", 5000 + i * 16):
			sent += 1
	_check(sent >= 8 and sent <= 12, "a 60 fps burst of hits sends 8..12 touches a second (sent %d)" % sent)

	# KO: passes over anything, then quiet; one KO per window
	h = HapticsScript.new()
	_check(h.allow("parry", 9000), "a parry passes")
	_check(h.allow("ko", 9010), "a KO passes even 10 ms after a parry")
	_check(not h.allow("ko", 9030), "the victory a frame later is the same KO (one rumble)")
	_check(not h.allow("hit_heavy", 9300), "nothing else in the KO's quiet")
	_check(h.allow("hurt", 9800), "touches again after the quiet")
