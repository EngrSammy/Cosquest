extends RefCounted
## Fight feel (look-fight, 1 Nov 2026): the art direction's section 7 table (ART-DIRECTION.md,
## tokens.json "fight") as data, and the small bits of state that turn it into presentation:
## the shake envelope and its budget, the presentation hit-stop and the KO's slow motion.
##
## Everything here is presentation only. The fight's simulation keeps its own hit-stop
## (fight.gd `_hitstop`, the per-attack "stop" values the judge's logic clock records) and
## its seeded RNG (fight.gd `rng`, which `_shake_cam` still advances exactly as before).
## Nothing in this file reads or writes either: the seeded fights stay byte-identical
## (tests/judge_test.gd, tests/feel_test.gd).
##
## Moments (section 7):
##   stop     the hit-stop the moment should feel like (s). Where the simulation's own stop is
##            shorter, the rest is a visual freeze only (animation and effects hold, the victim
##            shudders); where it is longer, the simulation's wins.
##   trauma   camera shake, 0..1; the view moves by trauma x SHAKE_CAP_M (linear), decaying
##            over SHAKE_LEN (a KO over KO_SHAKE_LEN).
##   zoom     a zoom punch, as a fraction of the field of view (0.04 = 4 %).
##   tint     a full-screen tint of the source colour at this alpha for tint_s (the ultimate).
##   vignette the red hurt vignette's alpha for vignette_s.
##   slow     after the stop, time runs at this rate for slow_s (KO only).
##   orbit    degrees the camera turns round the fallen fighter during the KO beat.
##   desat    how far the world desaturates over slow_s (hero KO).
const MOMENTS: Dictionary = {
	"light": {"stop": 0.050, "trauma": 0.04},
	"heavy": {"stop": 0.083, "trauma": 0.10},
	"crit": {"stop": 0.100, "trauma": 0.16, "zoom": 0.04},
	"skill_s": {"stop": 0.067, "trauma": 0.08},
	"skill_m": {"stop": 0.067, "trauma": 0.11},
	"skill_l": {"stop": 0.067, "trauma": 0.14},
	"ult": {"stop": 0.120, "trauma": 0.20, "tint": 0.10, "tint_s": 0.25},
	"hurt": {"stop": 0.050, "trauma": 0.10, "vignette": 0.15, "vignette_s": 0.2},
	"hurt_heavy": {"stop": 0.083, "trauma": 0.18, "vignette": 0.15, "vignette_s": 0.2},
	"block": {"stop": 0.050, "trauma": 0.04},
	"parry": {"stop": 0.100, "trauma": 0.16, "zoom": 0.04},
	"boss_slam": {"stop": 0.0, "trauma": 0.10},
	"enrage": {"stop": 0.0, "trauma": 0.10},
	"boss_ko": {"stop": 0.160, "trauma": 0.24, "zoom": 0.08, "orbit": 6.0, "slow": 0.3, "slow_s": 0.5},
	"hero_ko": {"stop": 0.120, "trauma": 0.12, "slow": 0.5, "slow_s": 0.4, "desat": 0.6},
}

const SHAKE_CAP_M: float = 0.32       # offset at trauma 1
const SHAKE_ROLL: float = 0.035       # radians of roll at trauma 1
const SHAKE_LEN: float = 0.24         # an impact's shake decays to nothing over this
const KO_SHAKE_LEN: float = 0.45
const SHAKE_BUDGET: float = 0.15      # shake may run for at most this share of the fight's time
const SHAKE_VISIBLE: float = 0.015    # trauma under this (5 mm) is not counted as shaking
const BUDGET_GRACE_S: float = 4.0     # the budget is measured once the fight is this old
const KO_RETURN_S: float = 0.6        # the camera's way back after the KO punch-in
const SLOW_EASE_S: float = 0.15       # the slow motion eases back to 1x over this

## VFX and number colours by source (section 2.8): you can tell who hit whom without reading.
const HERO_CORE := Color("#FFF6D8")
const HERO_MID := Color("#FFC54D")
const HERO_EDGE := Color("#FF8A1F")
const ALLY_CORE := Color("#E6FBFF")
const ALLY_MID := Color("#7FDDF5")
const ALLY_EDGE := Color("#2FB2E0")
const BOSS_CORE := Color("#FFE3F6")
const BOSS_MID := Color("#FF5FD2")
const BOSS_EDGE := Color("#8E2BD9")
const TELEGRAPH := Color("#FF5A36")
const HURT := Color("#FF4A3D")
const HEAL_CORE := Color("#DFFFE6")
const HEAL_MID := Color("#6BEA8C")
const HEAL_EDGE := Color("#22A75A")
const SHIELD_CORE := Color("#EAF8FF")
const SHIELD_MID := Color("#8FD8FF")
const SHIELD_EDGE := Color("#3D8EF0")
const CRIT_CORE := Color("#FFFFFF")
const CRIT_MID := Color("#FFE08A")
const CRIT_EDGE := Color("#F59E2A")
const INK := Color("#1C2B3A")
const SUN := Color("#F59E2A")
const BERRY := Color("#D93840")
const CREAM := Color("#FFF8EC")

var reduce_motion: bool = false

# shake: the envelope's peak and how long it has to fall from it
var trauma: float = 0.0
var _trauma_rate: float = 0.0
var shake_time: float = 0.0           # seconds of the fight with the view shaking
var shake_skipped: int = 0            # impacts the budget kept still (for the README numbers)

# the presentation hit-stop (beyond the simulation's)
var vis_stop: float = 0.0

# full-screen washes (the HUD draws them)
var tint_col: Color = Color(0, 0, 0, 0)
var tint_t: float = 0.0
var tint_len: float = 0.0
var vignette_a: float = 0.0
var vignette_t: float = 0.0
var vignette_len: float = 0.0

# the KO beat
var ko_active: bool = false
var ko_kind: String = ""
var ko_t: float = 0.0                 # real seconds since the KO
var ko_at: Vector3 = Vector3.ZERO
var desat: float = 0.0                # 0..1 how far the world is desaturated now


static func moment(name: String) -> Dictionary:
	return MOMENTS.get(name, MOMENTS["light"])


## A camera shake for moment `name`. `fight_time` and `dodging` apply the budget rules: no shake
## during the player's own dodge, and while the fight has shaken for more than SHAKE_BUDGET of
## its time the view keeps still (light hits from 70 % of it); only a KO and the ultimate always shake.
func shake(name: String, fight_time: float, dodging: bool) -> void:
	var m: Dictionary = moment(name)
	var tr: float = float(m.get("trauma", 0.0))
	if tr <= 0.0:
		return
	var key: bool = name.ends_with("_ko")
	if dodging and not key:
		shake_skipped += 1
		return
	# over budget, only the KO and the ultimate still shake; light hits give way first (at 70 %)
	var cap: float = SHAKE_BUDGET * (0.7 if (name == "light" or name == "block") else 1.0)
	if not key and name != "ult" and fight_time > BUDGET_GRACE_S and shake_time > cap * fight_time:
		shake_skipped += 1
		return
	if reduce_motion:
		tr *= 0.25
	if tr >= trauma:
		trauma = tr
		_trauma_rate = tr / (KO_SHAKE_LEN if key else SHAKE_LEN)


## This frame's shake offset (metres, in the camera's plane) and roll; `clock` drives the noise.
func shake_offset(clock: float) -> Vector3:
	if trauma <= 0.0:
		return Vector3.ZERO
	var nx: float = sin(clock * 47.0) * 0.6 + sin(clock * 83.0 + 1.3) * 0.4
	var ny: float = sin(clock * 53.0 + 2.1) * 0.6 + sin(clock * 97.0 + 0.4) * 0.4
	var nr: float = sin(clock * 41.0 + 0.7)
	return Vector3(nx * SHAKE_CAP_M * trauma, ny * SHAKE_CAP_M * trauma, nr * SHAKE_ROLL * trauma)


## The zoom punch for moment `name`, as a fraction of the field of view (0 under Reduce motion).
func zoom(name: String) -> float:
	if reduce_motion:
		return 0.0
	return float(moment(name).get("zoom", 0.0))


## The presentation hit-stop: holds the look `want - sim` longer than the simulation does.
func stop(name: String, sim_stop: float) -> void:
	var want: float = float(moment(name).get("stop", 0.0))
	vis_stop = maxf(vis_stop, want - maxf(0.0, sim_stop))


func wash(name: String, col: Color) -> void:
	var m: Dictionary = moment(name)
	if m.has("tint"):
		tint_col = Color(col.r, col.g, col.b, float(m["tint"]))
		tint_len = float(m["tint_s"])
		tint_t = tint_len
	if m.has("vignette"):
		vignette_a = float(m["vignette"])
		vignette_len = float(m["vignette_s"])
		vignette_t = vignette_len


func ko(kind: String, at: Vector3) -> void:
	ko_active = true
	ko_kind = kind
	ko_t = 0.0
	ko_at = at


## Time's rate during the KO beat at `t` real seconds after it: 1 through the stop, then the
## slow rate, easing back to 1 at the end.
func ko_time_scale(t: float) -> float:
	if not ko_active:
		return 1.0
	var m: Dictionary = moment(ko_kind)
	var s0: float = float(m.get("stop", 0.0))
	var slow: float = float(m.get("slow", 1.0))
	var slow_s: float = float(m.get("slow_s", 0.0))
	if t < s0:
		return 1.0
	if t < s0 + slow_s:
		return slow
	return lerpf(slow, 1.0, clampf((t - s0 - slow_s) / SLOW_EASE_S, 0.0, 1.0))


## The camera's KO push, 0..1: in over the stop, held through the slow motion, back over KO_RETURN_S.
func ko_push(t: float) -> float:
	if not ko_active:
		return 0.0
	var m: Dictionary = moment(ko_kind)
	var s0: float = float(m.get("stop", 0.0))
	var hold: float = s0 + float(m.get("slow_s", 0.0))
	if t < s0:
		return ease(t / maxf(0.001, s0), 0.4)
	if t < hold:
		return 1.0
	return 1.0 - ease(clampf((t - hold) / KO_RETURN_S, 0.0, 1.0), -1.8)


## Per frame (real seconds). `shaking` counts towards the budget only while the fight runs.
func tick(real_dt: float, fighting: bool) -> void:
	if trauma > 0.0:
		if fighting and trauma > SHAKE_VISIBLE:
			shake_time += real_dt
		trauma = maxf(0.0, trauma - _trauma_rate * real_dt)
	vis_stop = maxf(0.0, vis_stop - real_dt)
	tint_t = maxf(0.0, tint_t - real_dt)
	vignette_t = maxf(0.0, vignette_t - real_dt)
	if ko_active:
		ko_t += real_dt
		var m: Dictionary = moment(ko_kind)
		var d: float = float(m.get("desat", 0.0))
		if d > 0.0:
			desat = d * clampf((ko_t - float(m.get("stop", 0.0))) / maxf(0.01, float(m.get("slow_s", 0.4))), 0.0, 1.0)


## The tint's alpha now (fades out over its length).
func tint_alpha() -> float:
	return 0.0 if tint_len <= 0.0 else tint_col.a * (tint_t / tint_len)


func vignette_alpha() -> float:
	return 0.0 if vignette_len <= 0.0 else vignette_a * (vignette_t / vignette_len)
