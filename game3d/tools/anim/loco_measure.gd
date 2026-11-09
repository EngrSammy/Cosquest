extends SceneTree
## fight-anim (7 Nov 2026): measures each cast character's locomotion clips the way the fight plays
## them, so the walk and run playback rates keep the feet planted (no skating).
##   godot --headless --path app/game3d -s res://tools/anim/loco_measure.gd [-- --keys=a,b --out=/abs.json]
## For every character with a clip library and every locomotion clip it has, the clip plays in place
## at 1x on the model normalised as fighter.gd does (HEIGHT from its box). Each frame the lowest of the
## foot and toe bones is the contact point; on frames where it is within 2 cm of the clip's lowest,
## its backward speed is the ground speed the body must move at for that foot to stay put. Prints
## CQLOCO lines and writes {key: {clip: ground_speed_per_hip}} (median over the stance frames, in
## hip heights per second, the unit of anim_clips.json "ground_speed_per_hip").

const AnimLib := preload("res://anim_library.gd")
const HEIGHT: float = 2.3
const CLIPS: Array[String] = ["Walking_A", "Walking_B", "Running_A", "Running_B", "Staff_Walk", "Staff_Run"]
const CONTACT: Array[String] = ["LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase"]

var _keys: Array = []
var _out: String = ""
var _res: Dictionary = {}
var _ki: int = -1
var _ci: int = 0
var _f: int = 0
var _model: Node3D
var _holder: Node3D
var _sk: Skeleton3D
var _ap: AnimationPlayer
var _clips: Array = []
var _samples: Array = []     # [y, z] of the contact point per frame
var _hip: float = 1.0


func _initialize() -> void:
	for a: String in OS.get_cmdline_user_args():
		if a.begins_with("--keys="):
			_keys = Array(a.substr(7).split(","))
		elif a.begins_with("--out="):
			_out = a.substr(6)
	if _keys.is_empty():
		for k: String in (AnimLib.data().get("characters", {}) as Dictionary):
			if str(((AnimLib.data()["characters"] as Dictionary)[k] as Dictionary).get("status", "")) == "clips":
				_keys.append(k)
	_next_char()


func _next_char() -> void:
	if _holder != null:
		_holder.queue_free()
	_ki += 1
	if _ki >= _keys.size():
		if _out != "":
			var f := FileAccess.open(_out, FileAccess.WRITE)
			f.store_string(JSON.stringify(_res, " "))
		quit()
		return
	var key: String = _keys[_ki]
	var doc := GLTFDocument.new()
	var st := GLTFState.new()
	if doc.append_from_file("res://cast/%s_lod1.glb" % key, st) != OK:
		_next_char()
		return
	_model = doc.generate_scene(st)
	_holder = Node3D.new()
	_holder.add_child(_model)
	root.add_child(_holder)
	_sk = _model.find_children("*", "Skeleton3D", true, false)[0]
	var box := AABB()
	var first: bool = true
	for n: Node in _model.find_children("*", "MeshInstance3D", true, false):
		var mi := n as MeshInstance3D
		var bb: AABB = mi.transform * mi.get_aabb()
		box = bb if first else box.merge(bb)
		first = false
	_holder.scale = Vector3.ONE * (HEIGHT / box.size.y)
	_hip = _sk.get_bone_global_rest(_sk.find_bone("Hips")).origin.y * _holder.scale.y
	_ap = AnimationPlayer.new()
	_model.add_child(_ap)
	_ap.root_node = _ap.get_path_to(_model)
	var names: PackedStringArray = AnimLib.apply(_ap, _sk, AnimLib.library(key))
	_clips = []
	for c: String in CLIPS:
		if ("cq/" + c) in names:
			_clips.append(c)
	_res[key] = {"hip_m": snappedf(_hip, 0.001)}
	_ci = -1
	_next_clip()


func _next_clip() -> void:
	_ci += 1
	if _ci >= _clips.size():
		_next_char()
		return
	var a: Animation = _ap.get_animation("cq/" + str(_clips[_ci]))
	a.loop_mode = Animation.LOOP_LINEAR
	_ap.play("cq/" + str(_clips[_ci]), 0.0)
	_ap.seek(0.0, true)
	_samples = []
	_f = 0


func _process(_dt: float) -> bool:
	if _ki >= _keys.size() or _ap == null:
		return false
	_f += 1
	if _f > 3:   # the pose of the frame before (skeleton updated)
		var xf: Transform3D = _sk.global_transform
		var low := Vector3(0, INF, 0)
		for nm: String in CONTACT:
			var b: int = _sk.find_bone(nm)
			if b >= 0:
				var p: Vector3 = xf * _sk.get_bone_global_pose(b).origin
				if p.y < low.y:
					low = p
		_samples.append([low.y, low.z, low.x])
	var a: Animation = _ap.get_animation("cq/" + str(_clips[_ci]))
	if _f > 3 + int(a.length * 30.0 * 2.0):
		_finish_clip()
	return false


func _finish_clip() -> void:
	var miny: float = INF
	for s: Array in _samples:
		miny = minf(miny, float(s[0]))
	var sp: Array = []
	for i in range(1, _samples.size()):
		var s0: Array = _samples[i - 1]
		var s1: Array = _samples[i]
		if float(s1[0]) < miny + 0.02 and float(s0[0]) < miny + 0.02:
			# the model faces +Z: a planted point moves -Z (backwards) as the body walks forward
			sp.append(-(float(s1[1]) - float(s0[1])) * 30.0)
	sp.sort()
	var med: float = float(sp[sp.size() / 2]) if not sp.is_empty() else 0.0
	var key: String = _keys[_ki]
	(_res[key] as Dictionary)[_clips[_ci]] = snappedf(med / _hip, 0.001)
	print("CQLOCO key=%s clip=%s stance_frames=%d ground_mps=%.3f per_hip=%.3f hip=%.3f" % [key, _clips[_ci], sp.size(), med, med / _hip, _hip])
	_next_clip()
