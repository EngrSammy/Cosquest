extends RefCounted
## Combat clip libraries for the cast (cq 012). Each rigged cast character has a
## skeleton-only GLB in res://anim/<key>.glb, retargeted offline from KayKit's CC0 clips
## (app/game3d/tools/anim/retarget.py). It is loaded at run time with GLTFDocument (once per
## process, cached) and its animations are added to the character's own AnimationPlayer as the
## library "cq", with every track pointed at that model's Skeleton3D, so any LOD of the
## character plays them. Which clip plays for which combat state, and its contact frame, is
## data: res://data/anim_clips.json (see docs/game3d/ANIMATIONS.md).

const DATA_JSON: String = "res://data/anim_clips.json"
const LIB_NAME: String = "cq"

static var _data: Dictionary = {}
static var _libs: Dictionary = {}     # path -> AnimationLibrary (track paths relative to the skeleton: ".:Bone")


static func data() -> Dictionary:
	if _data.is_empty() and FileAccess.file_exists(DATA_JSON):
		var d: Variant = JSON.parse_string(FileAccess.get_file_as_string(DATA_JSON))
		if d is Dictionary:
			_data = d
	return _data


## The cast key for a skeleton: the config's key when it names a character with a library,
## else the character whose rest skeleton matches (bone names and hip/hand/foot rest
## positions within 2 cm), else "".
static func key_for(skeleton: Skeleton3D, hint: String) -> String:
	var chars: Dictionary = data().get("characters", {})
	if hint != "" and chars.has(hint) and str((chars[hint] as Dictionary).get("status", "")) == "clips":
		return hint
	if skeleton == null:
		return ""
	for k: String in chars:
		var c: Dictionary = chars[k]
		if str(c.get("status", "")) != "clips":
			continue
		var fp: Dictionary = c.get("fingerprint", {})
		var ok: bool = not fp.is_empty()
		for bone: String in fp:
			var b: int = skeleton.find_bone(bone)
			if b < 0:
				ok = false
				break
			var want: Array = fp[bone]
			var got: Vector3 = skeleton.get_bone_global_rest(b).origin
			if got.distance_to(Vector3(want[0], want[1], want[2])) > 0.02:
				ok = false
				break
		if ok:
			return k
	return ""


## Loads (once) the library GLB for `key`. Returns null when there is none.
static func library(key: String) -> AnimationLibrary:
	var c: Dictionary = (data().get("characters", {}) as Dictionary).get(key, {})
	var path: String = str(c.get("library", ""))
	if path == "":
		return null
	if _libs.has(path):
		return _libs[path]
	var t0: int = Time.get_ticks_usec()
	var doc := GLTFDocument.new()
	var st := GLTFState.new()
	var err: int = OK
	if path.begins_with("res://"):
		var bytes: PackedByteArray = FileAccess.get_file_as_bytes(path)
		err = doc.append_from_buffer(bytes, "", st) if bytes.size() > 0 else ERR_FILE_NOT_FOUND
	else:
		err = doc.append_from_file(path, st)
	if err != OK:
		push_warning("anim library %s: error %d" % [path, err])
		_libs[path] = null
		return null
	var root: Node = doc.generate_scene(st)
	var lib := AnimationLibrary.new()
	var players: Array[Node] = root.find_children("*", "AnimationPlayer", true, false)
	if players.size() > 0:
		var ap: AnimationPlayer = players[0]
		for n: StringName in ap.get_animation_list():
			var a: Animation = ap.get_animation(n).duplicate(true)
			# keep only the bone name: the track is pointed at the model's skeleton on apply
			var fixed: int = 0
			for i in a.get_track_count():
				var p: NodePath = a.track_get_path(i)
				var bone: String = str(p.get_concatenated_subnames())
				a.track_set_path(i, NodePath(".:" + bone))
				fixed += despike(a, i)
			lib.add_animation(n, a)
			_despiked += fixed
	root.free()
	_libs[path] = lib
	print("CQ anim_library path=%s clips=%d despiked=%d ms=%.1f" % [path, lib.get_animation_list().size(), _despiked, (Time.get_ticks_usec() - t0) / 1000.0])
	_despiked = 0
	return lib


static var _despiked: int = 0
const SPIKE_DEG: float = 40.0     # a one-frame bone turn this big ...
const SPIKE_RATIO: float = 3.0    # ... and this many times its neighbours' (at least 5 deg) is a snap


## fight-anim: the retargeted clips have a few one-frame snaps (both legs 62-67 deg in a single
## frame of 1H_Melee_Attack_Chop, the off-hand forearm 54 deg in the horizontal slice, the legs
## 135 deg in 2H_Melee_Attack_Spinning, the forearm 57 deg in Death_A): an isolated jump between
## keys k and k+1 is spread over keys k-1..k+2 (the same start and end pose, three even steps).
## Returns how many it spread. Rotation tracks only; a clip with no spike is untouched.
static func despike(a: Animation, i: int) -> int:
	if a.track_get_type(i) != Animation.TYPE_ROTATION_3D:
		return 0
	var n: int = a.track_get_key_count(i)
	if n < 5:
		return 0
	var q: Array[Quaternion] = []
	for k in n:
		q.append(a.track_get_key_value(i, k))
	var fixed: int = 0
	var k: int = 1
	while k < n - 2:
		var d: float = rad_to_deg(q[k].angle_to(q[k + 1]))
		var nb: float = maxf(5.0, maxf(rad_to_deg(q[k - 1].angle_to(q[k])), rad_to_deg(q[k + 1].angle_to(q[k + 2]))))
		if d > SPIKE_DEG and d > SPIKE_RATIO * nb:
			var q0: Quaternion = q[k - 1]
			var q3: Quaternion = q[k + 2]
			q[k] = q0.slerp(q3, 1.0 / 3.0)
			q[k + 1] = q0.slerp(q3, 2.0 / 3.0)
			a.track_set_key_value(i, k, q[k])
			a.track_set_key_value(i, k + 1, q[k + 1])
			fixed += 1
			k += 3
		else:
			k += 1
	return fixed


## Adds the library to `player`, its tracks pointed at `skeleton`. Returns the clip names.
static func apply(player: AnimationPlayer, skeleton: Skeleton3D, src: AnimationLibrary) -> PackedStringArray:
	var out := PackedStringArray()
	if player == null or skeleton == null or src == null:
		return out
	var root: Node = player.get_node(player.root_node)
	var skel_path: String = str(root.get_path_to(skeleton))
	var lib := AnimationLibrary.new()
	for n: StringName in src.get_animation_list():
		var a: Animation = src.get_animation(n).duplicate(true)
		for i in a.get_track_count():
			var bone: String = str(a.track_get_path(i).get_concatenated_subnames())
			a.track_set_path(i, NodePath(skel_path + ":" + bone))
		lib.add_animation(n, a)
		out.append(LIB_NAME + "/" + str(n))
	if player.has_animation_library(LIB_NAME):
		player.remove_animation_library(LIB_NAME)
	player.add_animation_library(LIB_NAME, lib)
	return out


## The clip set for a weapon class ("hammer" -> "heavy"), "" for none.
static func set_for(cls: String) -> String:
	var cs: Dictionary = data().get("class_set", {})
	return str(cs.get(cls, cs.get("_default", "")))


## {state: {clip, frames, fps, contact, in, out, body, ground_speed_per_hip}} for a weapon
## class on character `key`: the character's pick (the set's clip or the first alternate
## that passed the tear gate on its mesh); a state with no pick is left out (the model's own
## clip or the procedural pose plays it).
static func states_for(cls: String, key: String = "") -> Dictionary:
	var d: Dictionary = data()
	var sname: String = set_for(cls)
	var s: Dictionary = (d.get("sets", {}) as Dictionary).get(sname, {})
	var pick: Dictionary = ((((d.get("characters", {}) as Dictionary).get(key, {}) as Dictionary).get("pick", {}) as Dictionary).get(sname, {}) as Dictionary)
	var clips: Dictionary = d.get("clips", {})
	var out: Dictionary = {}
	for st: String in s:
		var e: Dictionary = s[st]
		var name: String = str(pick.get(st, e.get("clip", ""))) if key != "" else str(e.get("clip", ""))
		var c: Dictionary = clips.get(name, {})
		if name == "" or c.is_empty():
			continue
		var m: Dictionary = c.duplicate()
		if name == str(e.get("clip", "")):
			m.merge(e, true)    # in / out / body belong to the set's own clip
		elif e.has("body"):
			m["body"] = e["body"]
		if name != str(e.get("clip", "")) and bool(e.get("body_alt", false)) and not bool(c.get("spin", false)):
			m["body"] = true    # an alternate without the set clip's motion (no spin): the body motion adds it
		m["clip"] = name
		out[st] = m
	return out
