extends RefCounted
## Hit haptics, the Godot half (phone-hardware design 2.1, 1 Nov 2026).
##
## fight.gd calls `want(kind, strength)` next to each camera shake and impact; this decides
## whether that touch is worth sending, so rapid hits never become one continuous buzz and
## the bridge carries a few messages a second at most. The app plays the pattern
## (features/game3d/haptics.ts, expo-haptics: Core Haptics / UIImpactFeedbackGenerator on
## iOS, VibrationEffect on Android) and throttles once more on its side.
##
## Kinds match sfx.gd's cue names so sound and touch agree:
##   hit        the hero's normal hit landing
##   hit_heavy  a heavy hit or a crit (either side)
##   slam       a ground slam near the hero (the boss's, the SPLIT skill's), the boss enraging
##   block      the hero's guard taking a strike
##   parry      a perfect parry
##   hurt       the hero taking damage
##   cast       a skill cast
##   ko         a fighter going down (the Guardian or the hero), and the victory

## Higher wins inside the global gap; ko passes over everything (but one ko per KO_QUIET_MS:
## the Guardian's fall and the victory a frame later are one moment, one rumble).
const PRIORITY: Dictionary = {"hit": 1, "cast": 2, "block": 2, "hurt": 3, "hit_heavy": 3, "slam": 3, "parry": 4, "ko": 5}
## Per kind: the least time between two of the same kind (ms).
const MIN_INTERVAL_MS: Dictionary = {"hit": 90, "cast": 200, "block": 120, "hurt": 150, "hit_heavy": 120, "slam": 200, "parry": 250, "ko": 0}
## Any two touches at least this far apart, unless the newer one matters more.
const GLOBAL_GAP_MS: int = 70
## After a KO, nothing else for this long: the rumble, then quiet.
const KO_QUIET_MS: int = 700

var _last_kind_ms: Dictionary = {}
var _last_ms: int = -1000000
var _last_priority: int = 0
var _quiet_until_ms: int = -1


## True when a touch of `kind` at `now_ms` should be sent. Records it when it is.
func allow(kind: String, now_ms: int) -> bool:
	if not PRIORITY.has(kind):
		return false
	var pri: int = int(PRIORITY[kind])
	if kind == "ko":
		if now_ms < _quiet_until_ms:
			return false
		_mark(kind, now_ms, pri)
		_quiet_until_ms = now_ms + KO_QUIET_MS
		return true
	if now_ms < _quiet_until_ms:
		return false
	if now_ms - int(_last_kind_ms.get(kind, -1000000)) < int(MIN_INTERVAL_MS[kind]):
		return false
	if now_ms - _last_ms < GLOBAL_GAP_MS and pri <= _last_priority:
		return false
	_mark(kind, now_ms, pri)
	return true


func _mark(kind: String, now_ms: int, pri: int) -> void:
	_last_kind_ms[kind] = now_ms
	_last_ms = now_ms
	_last_priority = pri
