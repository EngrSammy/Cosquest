extends RefCounted
## CombatAnimator (cq 233): one per fighter. The fight asks for a named state; if the
## loaded GLB has a clip for it, the clip plays (time-stretched to the gameplay length, so
## the hit timings never depend on the art); if not, a procedural pose on the skeleton
## (pose_layer.gd) and the body motion in fighter.gd stand in. See docs/game3d/COMBAT.md.
##
## States: idle walk run attack_1 attack_2 attack_3 heavy hit guard parry dodge
##         skill_charge skill_split skill_whirl skill_rally skill_shield death victory
##
## A clip is found by its exact state name first ("attack_1"), then by the aliases below,
## case-insensitive, ignoring "|" library prefixes and separators. To add a clip for a
## character, name the action in the GLB after the state (Blender action "attack_1").

const PoseLayer := preload("res://pose_layer.gd")
const AnimLib := preload("res://anim_library.gd")
const SecondaryMotion := preload("res://secondary_motion.gd")

# crossfades (s, real time): into a one-shot, back to a loop, into a hit react. fight-anim: Godot
# advances a crossfade with the player's speed_scale, so a clip warped to 2-3.6x used to finish its
# 0.08 s fade in one frame (a pose snap); play() now scales the fade by the clip's starting rate.
const BLEND_ACT: float = 0.08
const BLEND_LOOP: float = 0.18
const BLEND_HIT: float = 0.06
const BLEND_RECOVER: float = 0.26        # fight-anim: out of a hit reaction, a soft recovery
const BLEND_VICTORY_IDLE: float = 0.5    # fight-anim: the cheer settles into the idle loop

# fight-anim: the most a clip's wind-up is sped up to land its contact frame on the gameplay hit.
# A faster wind-up starts later in the clip instead (the crossfade carries the body into it), so a
# 0.11 s strike no longer squeezes 12 frames of wind-up into 3 (3.6x, the arm snapped).
const WINDUP_RATE_MAX: float = 1.7
# fight-anim: a hit reaction plays at most this fast; a short game length shows the reaction's
# first part (the impact and the recoil) and BLEND_RECOVER carries it back, instead of the whole
# clip at 2.2-2.4x
const HIT_RATE_MAX: float = 1.3
const ONE_SHOTS: Array[String] = ["attack_1", "attack_2", "attack_3", "heavy", "parry", "dodge",
	"skill_charge", "skill_split", "skill_whirl", "skill_rally", "skill_shield"]

# fight-anim: the additive flinch (pose_layer channels on top of whatever clip plays): a fast
# recoil away from the blow, then an eased return. Real time on the way in (it shows through the
# hit-stop), game time on the way back.
const FLINCH_IN: float = 0.05
const FLINCH_OUT: float = 0.32
const FLINCH_LEAN: float = 20.0          # degrees of spine lean at strength 1
const FLINCH_TILT: float = 12.0
const FLINCH_YAW: float = 9.0
const FLINCH_ARMS: float = 14.0

const STATES: Array[String] = ["idle", "walk", "run", "attack_1", "attack_2", "attack_3", "heavy",
	"hit", "guard", "parry", "dodge", "skill_charge", "skill_split", "skill_whirl", "skill_rally",
	"skill_shield", "death", "victory"]
const LOOPING: Array[String] = ["idle", "walk", "run", "guard"]
const HOLD_LAST: Array[String] = ["death", "victory"]   # victory settles into idle (fight-anim)

const ALIASES: Dictionary = {
	"idle": ["idle", "idle_loop", "breathing_idle"],
	"walk": ["walk", "walking", "walk_loop", "walk_forward"],
	"run": ["run", "running", "run_loop", "sprint", "jog"],
	"attack_1": ["attack1", "attack_a", "slash1", "sword_attack", "sword_slash", "punch_jab", "melee_attack"],
	"attack_2": ["attack2", "attack_b", "slash2", "sword_attack2", "punch_cross"],
	"attack_3": ["attack3", "attack_c", "slash3", "heavy_attack", "sword_heavy"],
	"heavy": ["heavy", "heavy_attack", "attack_heavy", "smash", "slam"],
	"hit": ["hit", "hit_react", "hitreact", "hurt", "take_damage", "damage"],
	"guard": ["guard", "block", "block_idle", "defend", "shield_block"],
	"parry": ["parry", "block_hit", "deflect", "counter"],
	"dodge": ["dodge", "roll", "dodge_roll", "evade"],
	"skill_charge": ["charge", "dash", "dash_attack", "lunge"],
	"skill_split": ["split", "ground_slam", "slam", "jump_attack"],
	"skill_whirl": ["whirl", "spin_attack", "spin", "whirlwind"],
	"skill_rally": ["rally", "buff", "cheer", "shout", "cast"],
	"skill_shield": ["shield", "barrier", "cast_shield", "spell"],
	"death": ["death", "die", "dying", "defeat", "ko"],
	"victory": ["victory", "celebrate", "win", "cheer", "dance"],
}

# Procedural stand-ins: keyframes of [phase 0..1, {channel: degrees}] (pose_layer.gd channels).
# A missing channel is 0 (the clip's own pose). The phase runs over the state's game length.
const POSES: Dictionary = {
	"attack_1": [[0.0, {}], [0.16, {"spine_yaw": -32, "r_side": 80, "r_fwd": -15, "r_bend": 35}],
		[0.42, {"spine_yaw": 34, "spine_lean": 10, "r_side": 70, "r_fwd": 85, "r_bend": 5}], [1.0, {}]],
	"attack_2": [[0.0, {}], [0.16, {"spine_yaw": 30, "r_fwd": 70, "r_side": 5, "r_bend": 75}],
		[0.42, {"spine_yaw": -36, "spine_lean": 8, "r_side": 85, "r_fwd": 35, "r_bend": 0}], [1.0, {}]],
	"attack_3": [[0.0, {}], [0.28, {"spine_lean": -16, "r_fwd": 165, "l_fwd": 150, "r_bend": 30, "l_bend": 30}],
		[0.5, {"spine_lean": 32, "r_fwd": 55, "l_fwd": 50, "r_bend": 5, "l_bend": 5}],
		[0.8, {"spine_lean": 22, "r_fwd": 45, "l_fwd": 40}], [1.0, {}]],
	"heavy": [[0.0, {}], [0.3, {"spine_lean": -16, "r_fwd": 165, "l_fwd": 150, "r_bend": 30, "l_bend": 30}],
		[0.52, {"spine_lean": 32, "r_fwd": 55, "l_fwd": 50}], [1.0, {}]],
	"hit": [[0.0, {}], [0.18, {"spine_lean": -24, "spine_yaw": 12, "r_side": 28, "l_side": 28, "r_bend": 30, "l_bend": 30}], [1.0, {}]],
	"guard": [[0.0, {"r_fwd": 78, "r_bend": 105, "l_fwd": 78, "l_bend": 105, "spine_lean": 12}]],
	"parry": [[0.0, {"r_fwd": 78, "r_bend": 105, "l_fwd": 78, "l_bend": 105}], [0.25, {"r_fwd": 100, "r_side": 45, "r_bend": 20, "spine_yaw": -22}],
		[0.6, {"r_fwd": 55, "r_side": 75, "spine_yaw": 24}], [1.0, {}]],
	"dodge": [[0.0, {}], [0.2, {"spine_lean": 50, "r_fwd": 45, "l_fwd": 45, "r_bend": 70, "l_bend": 70}],
		[0.8, {"spine_lean": 40, "r_fwd": 35, "l_fwd": 35, "r_bend": 60, "l_bend": 60}], [1.0, {}]],
	"skill_charge": [[0.0, {}], [0.12, {"spine_lean": 35, "r_fwd": -45, "r_side": 25, "l_fwd": -35}],
		[0.7, {"spine_lean": 30, "r_fwd": 70, "r_side": 40, "l_fwd": -30}], [1.0, {}]],
	"skill_split": [[0.0, {}], [0.3, {"spine_lean": -22, "r_fwd": 175, "l_fwd": 175, "r_bend": 15, "l_bend": 15}],
		[0.48, {"spine_lean": 48, "r_fwd": 35, "l_fwd": 35}], [0.85, {"spine_lean": 40, "r_fwd": 30, "l_fwd": 30}], [1.0, {}]],
	"skill_whirl": [[0.0, {}], [0.12, {"r_side": 88, "l_side": 65, "spine_lean": 10}], [0.85, {"r_side": 88, "l_side": 65, "spine_lean": 10}], [1.0, {}]],
	"skill_rally": [[0.0, {}], [0.25, {"spine_lean": -12, "l_side": 165, "l_bend": 10, "r_side": 35}],
		[0.8, {"spine_lean": -10, "l_side": 165, "l_bend": 10, "r_side": 35}], [1.0, {}]],
	"skill_shield": [[0.0, {}], [0.2, {"r_fwd": 85, "r_bend": 95, "l_fwd": 85, "l_bend": 95, "spine_lean": 10}],
		[0.8, {"r_fwd": 85, "r_side": 30, "l_fwd": 85, "l_side": 30, "spine_lean": -8}], [1.0, {}]],
	"death": [[0.0, {}], [0.3, {"spine_lean": -28, "r_side": 55, "l_side": 55}], [1.0, {"spine_lean": -28, "r_side": 70, "l_side": 70}]],
	"victory": [[0.0, {}], [0.25, {"r_fwd": 170, "r_bend": 10, "spine_lean": -8}], [1.0, {"r_fwd": 170, "r_bend": 10, "spine_lean": -8}]],
}

var player: AnimationPlayer
var skeleton: Skeleton3D
var secondary: Node              # SecondaryMotion (cq 014) when the rig has chains
var layer: PoseLayer
var clips: Dictionary = {}       # state -> clip name in the player
var state: String = "idle"
var t: float = 0.0
var length: float = 0.0          # game length of the current one-shot state (0 = looping)
var frozen: bool = false
var walk_rate: float = 1.0
var hand_r: Node3D               # the right-hand attach point (BoneAttachment3D or a stand-in)
var lib_key: String = ""         # the cast key whose clip library is bound ("" = none)
var timing: Dictionary = {}      # state -> {clip, frames, fps, contact, in, out, body} from anim_clips.json
var _warp: Array = []            # [clip time at the hit, speed before it, speed after it, game time of the hit]
var _clip_t: float = 0.0         # where the one-shot clip should be (seconds into the clip)
var hip_h: float = 0.9           # the model's hip height in metres (locomotion rate)
var _after: String = ""          # fight-anim: the one-shot that just ended (picks the blend back)
var _victory_idle: bool = false  # fight-anim: the cheer has settled into the idle loop
var _flinch_t: float = -1.0      # fight-anim: seconds into the current flinch (-1 = none)
var _flinch_k: float = 0.0       # its strength
var _flinch_dir: Vector3 = Vector3.ZERO   # the push, in the character's own frame (+Z forward)


## Finds the AnimationPlayer and Skeleton3D under `model`, maps clips to states, adds the
## pose layer and the hand_r attach point. `body` hosts the stand-in hand if there is no
## skeleton. `opts`: {key: cast key hint, class: weapon class}; when the skeleton is a cast
## character with a clip library (anim_library.gd), the library's clips for that weapon
## class take every state they cover. Returns {clips: {state: clip}, procedural: [states],
## bones: n, hand: "bone"|"standin", library: key}.
func bind(model: Node3D, body: Node3D, opts: Dictionary = {}) -> Dictionary:
	clips.clear()
	timing.clear()
	lib_key = ""
	player = null
	skeleton = null
	layer = null
	secondary = null
	var skels: Array[Node] = model.find_children("*", "Skeleton3D", true, false)
	if skels.size() > 0:
		skeleton = skels[0] as Skeleton3D
	var players: Array[Node] = model.find_children("*", "AnimationPlayer", true, false)
	if players.size() > 0:
		player = players[0] as AnimationPlayer
		var names: PackedStringArray = player.get_animation_list()
		for st: String in STATES:
			var c: String = _match(names, st)
			if c != "":
				clips[st] = c
	if skeleton != null:
		_bind_library(model, str(opts.get("key", "")), str(opts.get("class", "")))
	if player != null:
		for st: String in clips:
			var a: Animation = player.get_animation(clips[st])
			if a != null:
				a.loop_mode = Animation.LOOP_LINEAR if st in LOOPING else Animation.LOOP_NONE
	var nb: int = 0
	if skeleton != null:
		layer = PoseLayer.new()
		layer.name = "CombatPose"
		layer.frame_root = model
		skeleton.add_child(layer)
		nb = layer.bind_bones()
		# robes, coats, skirts, wings, flames (cq 014): after the pose layer, so they hang from
		# the final pose
		secondary = null
		if bool(opts.get("secondary", true)):
			var sm := SecondaryMotion.new()
			sm.name = "SecondaryMotion"
			if sm.setup(skeleton) > 0:
				skeleton.add_child(sm)
				secondary = sm
			else:
				sm.free()
	hand_r = _make_hand(body)
	var proc: Array[String] = []
	for st: String in STATES:
		if not clips.has(st):
			proc.append(st)
	return {"clips": clips.duplicate(), "procedural": proc, "bones": nb, "hand": str(hand_r.get_meta("kind", "standin"))}


## The cast clip library (cq 012): adds it to the model's AnimationPlayer (made if the GLB has
## none) and maps the weapon class's set onto the states. A looping state gets its own copy
## of a clip that a one-shot state also uses, so the loop flag never fights.
func _bind_library(model: Node3D, hint: String, cls: String) -> void:
	var key: String = AnimLib.key_for(skeleton, hint)
	if key == "":
		return
	var lib: AnimationLibrary = AnimLib.library(key)
	if lib == null:
		return
	if player == null:
		player = AnimationPlayer.new()
		player.name = "AnimationPlayer"
		model.add_child(player)
		player.root_node = player.get_path_to(model)
	AnimLib.apply(player, skeleton, lib)
	if cls == "":
		# nothing in hand: the character's own prop decides (Nebul-X's staff is part of her model)
		cls = str(((AnimLib.data().get("characters", {}) as Dictionary).get(key, {}) as Dictionary).get("default_class", ""))
	var st_map: Dictionary = AnimLib.states_for(cls, key)
	var used: Dictionary = {}
	for st: String in st_map:
		var name: String = AnimLib.LIB_NAME + "/" + str(st_map[st]["clip"])
		if not player.has_animation(name):
			continue
		if st in LOOPING and used.has(name):
			name = _loop_copy(name)
		elif st in LOOPING:
			name = _loop_copy(name)
		used[name] = true
		clips[st] = name
		timing[st] = st_map[st]
	lib_key = key
	var hb: int = skeleton.find_bone("Hips")
	if hb >= 0:
		hip_h = skeleton.get_bone_global_rest(hb).origin.y * model.scale.y


## The locomotion clip's playback rate for a ground speed (m/s): the planted foot moves at
## the body's speed, so the feet do not slide.
func _loco_rate(st: String, speed_now: float) -> float:
	var gs: float = float((timing.get(st, {}) as Dictionary).get("ground_speed_per_hip", 0.0)) * hip_h
	if gs <= 0.01:
		return clampf(speed_now / 2.6, 0.8, 1.9)
	return clampf(speed_now / gs, 0.5, 2.4)


func _loop_copy(name: String) -> String:
	var copy: String = name + "__loop"
	var lib: AnimationLibrary = player.get_animation_library(AnimLib.LIB_NAME)
	if not lib.has_animation(copy.get_slice("/", 1)):
		var a: Animation = player.get_animation(name).duplicate(true)
		a.loop_mode = Animation.LOOP_LINEAR
		lib.add_animation(copy.get_slice("/", 1), a)
	return copy


## True when the state's clip wants the procedural body motion on top (data: "body": true).
func body_with_clip(st: String) -> bool:
	return bool((timing.get(st, {}) as Dictionary).get("body", false))


static func _norm(s: String) -> String:
	var n: String = s.to_lower()
	if n.contains("|"):
		n = n.get_slice("|", n.get_slice_count("|") - 1)
	return n.replace(" ", "_").replace("-", "_").replace(".", "_")


func _match(names: PackedStringArray, st: String) -> String:
	for n: String in names:
		if _norm(n) == st:
			return n
	for alias: String in ALIASES.get(st, []):
		for n: String in names:
			if _norm(n) == alias:
				return n
	if st in ["idle", "walk", "victory"]:   # the 056/060 packs name them loosely ("celebrate", "Idle_A")
		for alias: String in ALIASES.get(st, []):
			for n: String in names:
				if _norm(n).contains(alias):
					return n
	return ""


const HAND_BONES: Array = ["RightHand", "hand_r", "hand.R", "Hand_R", "RightHandMiddle1", "mixamorig:RightHand"]


func _make_hand(body: Node3D) -> Node3D:
	if skeleton != null:
		var b: int = PoseLayer.find_bone(skeleton, HAND_BONES)
		if b >= 0:
			var ba := BoneAttachment3D.new()
			ba.name = "hand_r"
			ba.bone_name = skeleton.get_bone_name(b)
			ba.set_meta("kind", "bone")
			skeleton.add_child(ba)
			return ba
	var n := Node3D.new()
	n.name = "hand_r"
	n.position = Vector3(-0.38, 1.0, 0.18)   # its right side (+X is its left), waist high, a little forward
	n.set_meta("kind", "standin")
	body.add_child(n)
	return n


func has_clip(st: String) -> bool:
	return clips.has(st)


## Plays a state. `game_len` > 0 makes it a one-shot of that many seconds (a clip is
## time-stretched to fit); 0 makes it a loop. `hit_at` (seconds into the state, when the
## gameplay strike lands): a clip with a contact frame in the data is time-warped in two
## pieces so that frame shows exactly then (the hitbox and the art agree). Returns true when
## a clip plays it.
func play(st: String, game_len: float = 0.0, hit_at: float = -1.0, blend: float = -1.0) -> bool:
	var restart: bool = game_len > 0.0
	if st == state and not restart:
		return clips.has(st)
	var was: String = state
	if was == "_" and _after != "":
		was = _after
	_after = ""
	state = st
	t = 0.0
	length = game_len
	_warp = []
	_victory_idle = false
	if player == null or not clips.has(st):
		# no clip: idle/walk still come from the clip map when it has them
		return false
	var clip: String = clips[st]
	var a: Animation = player.get_animation(clip)
	if blend < 0.0:
		blend = BLEND_HIT if st == "hit" else (BLEND_ACT if restart else BLEND_LOOP)
		if was in LOOPING:
			blend = BLEND_ACT if restart else BLEND_LOOP
		elif was == "hit" and not restart:
			blend = BLEND_RECOVER
	var m: Dictionary = timing.get(st, {})
	var fps: float = float(m.get("fps", 30.0))
	var t_in: float = float(m.get("in", 0)) / fps
	var t_out: float = a.length if a != null else 0.0
	if m.has("out"):
		t_out = minf(t_out, float(m["out"]) / fps)
	if restart and st == "hit" and a != null:
		# fight-anim: the reaction's opening at a natural speed, not the whole clip squeezed
		t_out = minf(t_out, t_in + game_len * HIT_RATE_MAX)
	if restart and a != null and t_out - t_in > 0.01:
		var c_t: float = float(m.get("contact", -1)) / fps
		if hit_at > 0.02 and hit_at < game_len - 0.02 and c_t > t_in and c_t < t_out:
			# fight-anim: cap the wind-up speed; skip into the wind-up instead
			if (c_t - t_in) / hit_at > WINDUP_RATE_MAX:
				t_in = c_t - hit_at * WINDUP_RATE_MAX
			_warp = [c_t, (c_t - t_in) / hit_at, (t_out - c_t) / (game_len - hit_at), hit_at]
		else:
			_warp = [t_out, (t_out - t_in) / game_len, (t_out - t_in) / game_len, game_len]
		# a short strike cannot spend more than ~70 % of its wind-up fading in; a long wind-up (the
		# Guardian's 0.8 s) fades in over 30 % of it (up to 0.25 s), not 0.08 s: its two-hand chop
		# starts far from the idle pose (the off forearm swung 100 deg in one frame)
		if hit_at > 0.02:
			blend = maxf(minf(blend, hit_at * 0.7), minf(hit_at * 0.3, 0.25))
	_clip_t = t_in
	# fight-anim: the fade runs in clip time (speed_scale), so ask for blend x rate to get `blend` s
	var rate0: float = float(_warp[1]) if not _warp.is_empty() else (walk_rate if st in ["walk", "run"] else 1.0)
	player.play(clip, blend * maxf(rate0, 0.05), 1.0)
	player.seek(t_in, true)
	if not _warp.is_empty():
		player.speed_scale = 0.0 if frozen else float(_warp[1])
	return true


## fight-anim: an additive recoil on top of whatever plays (the clip keeps running): `push` is the
## blow's direction in the world, `strength` about 0.5 (blocked or light) to 1.4 (a crit). A new
## blow restarts it from the current depth, so a flurry stays a recoil, not a twitch.
func flinch(push: Vector3, strength: float) -> void:
	if layer == null or layer.frame_root == null or not layer.frame_root.is_inside_tree():
		return
	var local: Vector3 = layer.frame_root.global_basis.orthonormalized().inverse() * Vector3(push.x, 0.0, push.z)
	if local.length_squared() < 0.0001:
		local = Vector3(0, 0, -1)   # no direction: pushed back
	_flinch_dir = local.normalized()
	_flinch_k = maxf(strength, _flinch_k * _flinch_env() if _flinch_t >= 0.0 else 0.0)
	_flinch_t = 0.0


func _flinch_env() -> float:
	if _flinch_t < 0.0:
		return 0.0
	if _flinch_t < FLINCH_IN:
		var u: float = _flinch_t / FLINCH_IN
		return u * (2.0 - u)
	var v: float = clampf((_flinch_t - FLINCH_IN) / FLINCH_OUT, 0.0, 1.0)
	return 1.0 - v * v * (3.0 - 2.0 * v)


func _flinch_pose() -> Dictionary:
	var e: float = _flinch_env() * _flinch_k
	if e <= 0.001:
		return {}
	# pushed back (-Z) leans the spine back; pushed to its left (+X) tilts it that way and turns it
	return {"spine_lean": FLINCH_LEAN * e * _flinch_dir.z, "spine_tilt": FLINCH_TILT * e * _flinch_dir.x,
		"spine_yaw": FLINCH_YAW * e * _flinch_dir.x, "r_side": FLINCH_ARMS * e, "l_side": FLINCH_ARMS * e,
		"r_bend": FLINCH_ARMS * 0.8 * e, "l_bend": FLINCH_ARMS * 0.8 * e}


## True while a one-shot action clip (an attack, skill, parry or dodge) still owns the body.
func busy_action() -> bool:
	return length > 0.0 and t < length and state in ONE_SHOTS and clips.has(state)


## Locomotion and the procedural pose. `busy` = a one-shot owns the body.
func update(dt: float, speed_now: float, dead: bool) -> void:
	if not frozen:
		t += dt
	if _flinch_t >= 0.0 and (not frozen or _flinch_t < FLINCH_IN):
		_flinch_t += dt
		if _flinch_t > FLINCH_IN + FLINCH_OUT:
			_flinch_t = -1.0
			_flinch_k = 0.0
	if player != null:
		var base: float = 1.0
		if state in ["walk", "run"]:
			base = walk_rate
		elif not _warp.is_empty():
			base = float(_warp[1]) if t < float(_warp[3]) else float(_warp[2])
		player.speed_scale = 0.0 if frozen else base
	if state == "victory" and length > 0.0 and t >= length and not _victory_idle and player != null and clips.has("idle"):
		# fight-anim: the cheer used to freeze on its last frame (a statue); it settles into idle
		_victory_idle = true
		_warp = []
		player.play(clips["idle"], BLEND_VICTORY_IDLE, 1.0)
		player.speed_scale = 0.0 if frozen else 1.0
	if length > 0.0 and t >= length and not (state in HOLD_LAST):
		length = 0.0
		_after = state
		state = "_"
		_warp = []
	if length <= 0.0 and not dead and not (state in HOLD_LAST) and state != "guard":
		var want: String = "idle"
		# run once a walk would have to play much faster than it was made
		var walk_gs: float = float((timing.get("walk", {}) as Dictionary).get("ground_speed_per_hip", 0.0)) * hip_h
		var run_at: float = walk_gs * 1.8 if walk_gs > 0.01 and clips.has("run") else 3.2
		if speed_now > run_at:
			want = "run" if clips.has("run") else "walk"
		elif speed_now > 0.2:
			want = "walk"
		walk_rate = _loco_rate(want if clips.has(want) else "walk", speed_now)
		if want != state:
			if not play(want):
				# no clip for it: fall back to whichever locomotion clip exists
				if player != null:
					var alt: String = "walk" if want == "run" else want
					if clips.has(alt):
						player.play(clips[alt], 0.15)
				state = want
	if layer != null:
		var p: Dictionary = _pose_now() if not clips.has(state) else {}
		var fl: Dictionary = _flinch_pose()
		if not fl.is_empty():
			p = p.duplicate()
			for k: String in fl:
				p[k] = float(p.get(k, 0.0)) + float(fl[k])
		layer.pose = p


func phase() -> float:
	if length <= 0.0:
		return 0.0
	return clampf(t / length, 0.0, 1.0)


func _pose_now() -> Dictionary:
	if not POSES.has(state):
		return {}
	var keys: Array = POSES[state]
	var k: float = phase() if length > 0.0 else 0.0
	if keys.size() == 1:
		return keys[0][1]
	for i in range(keys.size() - 1):
		var a: Array = keys[i]
		var b: Array = keys[i + 1]
		if k <= float(b[0]):
			var u: float = (k - float(a[0])) / maxf(0.0001, float(b[0]) - float(a[0]))
			u = u * u * (3.0 - 2.0 * u)
			return _lerp_pose(a[1], b[1], u)
	return keys[-1][1]


static func _lerp_pose(a: Dictionary, b: Dictionary, u: float) -> Dictionary:
	var out: Dictionary = {}
	for k: String in a:
		out[k] = lerpf(float(a[k]), float(b.get(k, 0.0)), u)
	for k: String in b:
		if not out.has(k):
			out[k] = lerpf(0.0, float(b[k]), u)
	return out
