extends SceneTree
## fight-anim (7 Nov 2026): the character animation fixes, checked on Armstrong's real clip library.
##   godot --headless --path app/game3d --fixed-fps 30 -s res://tests/anim_feel_test.gd
## 1. The rules id is unchanged (the animation touches no combat number).
## 2. The clip de-spike: Armstrong's library has no isolated one-frame bone jump left (> 40 deg and
##    3x its neighbours), and 1H_Melee_Attack_Chop's leg snap (62-67 deg in one frame) is spread.
## 3. Wind-ups: a 0.11 s strike on the diagonal slice plays its wind-up at most WINDUP_RATE_MAX.
## 4. Hit reactions: a 0.28 s hit plays at most HIT_RATE_MAX.
## 5. The swing plays the cast clip (the library bound for the sword set).
## 6. The victory cheer settles into the idle loop (no frozen last frame).
## 7. A blow on a fighter mid-swing does not cut the swing (react_hit) and the recoil shows.
## 8. The flinch is additive and fades out (pose_layer channels back to empty).
## The byte-identical fight record is e2e (seeded before/after, cosquest-review/fight-anim/NOTES.md).
## Prints "CQTEST PASS <name>" / "CQTEST FAIL <name> <why>", then "CQTEST done failures=N".

const FightScript := preload("res://fight.gd")
const AnimLib := preload("res://anim_library.gd")
const Animator := preload("res://combat_animator.gd")
const FighterScript := preload("res://fighter.gd")

var _fails: int = 0
var _f: FighterScript
var _step: int = 0
var _t: int = 0


func _check(name: String, ok: bool, why: String = "") -> void:
	if ok:
		print("CQTEST PASS " + name)
	else:
		_fails += 1
		print("CQTEST FAIL %s %s" % [name, why])


func _initialize() -> void:
	_check("rules_id_unchanged", FightScript.rules_id() == "f3d-1-21d2cde61ab2", FightScript.rules_id())
	var lib: AnimationLibrary = AnimLib.library("armstrong")
	_check("library_loads", lib != null and lib.get_animation_list().size() > 20)
	if lib == null:
		_finish()
		return
	var spikes: int = 0
	for n: StringName in lib.get_animation_list():
		var a: Animation = lib.get_animation(n)
		for i in a.get_track_count():
			if a.track_get_type(i) != Animation.TYPE_ROTATION_3D or a.track_get_key_count(i) < 5:
				continue
			var q: Array = []
			for k in a.track_get_key_count(i):
				q.append(a.track_get_key_value(i, k))
			for k in range(1, q.size() - 2):
				var d: float = rad_to_deg((q[k] as Quaternion).angle_to(q[k + 1]))
				var nb: float = maxf(5.0, maxf(rad_to_deg((q[k - 1] as Quaternion).angle_to(q[k])), rad_to_deg((q[k + 1] as Quaternion).angle_to(q[k + 2]))))
				if d > AnimLib.SPIKE_DEG and d > AnimLib.SPIKE_RATIO * nb:
					spikes += 1
	_check("no_one_frame_snaps_left", spikes == 0, "spikes=%d" % spikes)
	var chop: Animation = lib.get_animation("1H_Melee_Attack_Chop")
	var worst: float = 0.0
	for i in chop.get_track_count():
		if chop.track_get_type(i) == Animation.TYPE_ROTATION_3D and str(chop.track_get_path(i)).ends_with("Leg"):
			for k in range(chop.track_get_key_count(i) - 1):
				worst = maxf(worst, rad_to_deg((chop.track_get_key_value(i, k) as Quaternion).angle_to(chop.track_get_key_value(i, k + 1))))
	_check("chop_leg_snap_spread", worst < 30.0, "worst=%.1f" % worst)
	# a real fighter with Armstrong's model and library
	_f = FighterScript.new()
	root.add_child(_f)
	_f.setup("Armstrong", 0, 1000, Color.WHITE, "hero")
	var doc := GLTFDocument.new()
	var st := GLTFState.new()
	doc.append_from_file("res://cast/armstrong_lod1.glb", st)
	_f.anim_opts = {"key": "armstrong", "class": "sword"}
	_f.set_model(doc.generate_scene(st))
	_check("bound_library", _f.anim.lib_key == "armstrong" and _f.anim.has_clip("attack_1"))


func _process(dt: float) -> bool:
	if _f == null:
		return true
	_t += 1
	_f.tick_logic(dt)
	_f.tick_visual(dt)
	var a: Animator = _f.anim
	match _step:
		0:
			if _t > 3:
				# the fight's first combo hit: 0.34 s, the strike at 0.11 s
				_f.act("attack_1", 0.34, 0.11)
				_check("windup_capped", not a._warp.is_empty() and float(a._warp[1]) <= Animator.WINDUP_RATE_MAX + 0.001, str(a._warp))
				_check("attack_clip_plays", a.player.get_current_animation() == "cq/1H_Melee_Attack_Slice_Diagonal")
				_check("busy_while_swinging", a.busy_action())
				# a blow mid-swing: the swing is not cut, the recoil shows
				_f.react_hit(0.3)
				_f.hurt_pop(Vector3(0, 0, 1), 1.0)
				_check("swing_not_cut_by_hit", a.state == "attack_1")
				_step = 1
				_t = 0
		1:
			if _t == 3:
				var p: Dictionary = a.layer.pose
				_check("flinch_on_top_of_clip", absf(float(p.get("spine_lean", 0.0))) > 5.0, str(p))
			if _t > 20:
				_check("flinch_fades", a.layer.pose.is_empty(), str(a.layer.pose))
				_f.act("hit", 0.28)
				_check("hit_rate_capped", not a._warp.is_empty() and float(a._warp[1]) <= Animator.HIT_RATE_MAX + 0.001, str(a._warp))
				_step = 2
				_t = 0
		2:
			if _t > 20:
				_check("back_to_idle_after_hit", a.state == "idle", a.state)
				_f.celebrate()
				_step = 3
				_t = 0
		3:
			if _t > int(1.4 * 30) + 6:
				_check("victory_settles_into_idle", a._victory_idle and a.player.get_current_animation() == a.clips.get("idle", "?"),
					"%s %s" % [str(a._victory_idle), a.player.get_current_animation()])
				_finish()
				return true
	return false


func _finish() -> void:
	print("CQTEST done failures=%d" % _fails)
	quit(1 if _fails > 0 else 0)
