extends Node
## fight-anim (7 Nov 2026): a per-frame animation probe for review captures only. fight.gd adds it
## when the config has "anim_probe": "/abs/out.jsonl"; the game never sets it. Each visual frame it
## writes one JSON line per fighter: the animator state, the clip and its playback rate, the body
## root, both feet and the right hand in the world, and the largest rotation any skeleton bone made
## since the last frame (degrees: a snap or pop shows as a spike). tools/anim/probe_report.py
## turns the file into numbers (foot sliding while planted, pops per state, transitions).
## Reads only; it changes nothing in the fight.

var fighters: Array = []        # [[role, FighterScript], ...]
var path: String = ""
var _f: FileAccess
var _prev: Dictionary = {}      # role -> PackedVector4Array? (bone global quats)
var _frame: int = 0
const SKIP_CHAINS: String = "^(Robe|Coat|Skirt|Wing|Flame|Hair|Tail|Cape).*"
var _re: RegEx


func _ready() -> void:
	_f = FileAccess.open(path, FileAccess.WRITE)
	_re = RegEx.new()
	_re.compile(SKIP_CHAINS)
	process_priority = 1000   # after the fighters' visual tick


func _process(_dt: float) -> void:
	if _f == null:
		return
	_frame += 1
	for pair: Array in fighters:
		var role: String = pair[0]
		var f: Node3D = pair[1]
		if f == null or not is_instance_valid(f):
			continue
		var a: Variant = f.get("anim")
		if a == null:
			continue
		var sk: Skeleton3D = a.get("skeleton")
		var pl: AnimationPlayer = a.get("player")
		var row: Dictionary = {"fr": _frame, "role": role, "st": str(a.get("state")),
			"clip": str(pl.current_animation) if pl != null else "", "rate": snappedf(pl.speed_scale, 0.001) if pl != null else 0.0,
			"spd": snappedf(float(f.get("speed_now")), 0.001), "pos": _v(f.global_position), "dead": bool(f.get("dead")),
			"motion": str(f.get("_motion"))}
		if sk != null:
			var xf: Transform3D = sk.global_transform
			for nm: String in ["LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase", "RightHand", "Hips"]:
				var b: int = sk.find_bone(nm)
				if b >= 0:
					row[nm] = _v(xf * sk.get_bone_global_pose(b).origin)
			var qs: Array = []
			var worst: float = 0.0
			var mq: Quaternion = xf.basis.get_rotation_quaternion()
			if _prev.has(role + "/m"):
				row["turn"] = snappedf(rad_to_deg((_prev[role + "/m"] as Quaternion).angle_to(mq)), 0.01)
			_prev[role + "/m"] = mq
			var worst_b: String = ""
			var prev: Array = _prev.get(role, [])
			for b in sk.get_bone_count():
				var q: Quaternion = sk.get_bone_global_pose(b).basis.get_rotation_quaternion()
				qs.append(q)
				if prev.size() == sk.get_bone_count() and _re.search(sk.get_bone_name(b)) == null:
					var d: float = rad_to_deg((prev[b] as Quaternion).angle_to(q))
					if d > worst:
						worst = d
						worst_b = sk.get_bone_name(b)
			_prev[role] = qs
			row["pop"] = snappedf(worst, 0.01)
			row["pop_bone"] = worst_b
		_f.store_line(JSON.stringify(row))


func _exit_tree() -> void:
	if _f != null:
		_f.close()


static func _v(p: Vector3) -> Array:
	return [snappedf(p.x, 0.001), snappedf(p.y, 0.001), snappedf(p.z, 0.001)]
