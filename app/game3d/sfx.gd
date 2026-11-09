extends Node
## Combat sounds (cq 233): Kenney "Impact Sounds" and "RPG Audio" (CC0, art/sfx/License_*).
## A few pooled AudioStreamPlayers; each cue picks one of its variants and a little pitch
## jitter so repeated swings do not sound machine-gunned. cfg "sound": false mutes it all
## (the effects and the music: the app sends it while a CosQuest call holds the audio).
##
## look-fight (1 Nov 2026, art direction 7 "SFX character"):
## - Layers: a hit is the body thud ("hit"/"hit_heavy") plus a bright crack on top
##   ("crack", Kenney impactGeneric/impactGlass light); the swing before it is the whoosh.
## - The KO: a deep boom (two Kenney impacts pitched down, art/sfx/ko_boom.ogg) and a rising
##   two-note chime (Kenney Music Jingles PIZZI16); the music ducks 6 dB under it.
## - The Guardian's grunt layer on its wind-ups and when it reels (art/sfx/guardian_grunt.ogg,
##   synthesised by tools/fx/make_grunt.py: the project's own sound).
## - Stings: victory (Music Jingles STEEL10, rising D E F# G) and defeat (STEEL07, falling).
## - Music: a light combat loop, "Battle Theme A" by cynicmusic (OpenGameArt, CC0), loudness
##   normalised to -16 LUFS integrated (art/sfx/CREDITS.md), faded in under the intro.
## - Buses: "Music" and "Sfx" (made here when the project has none); SFX peaks stay under
##   -3 dBFS through the per-cue volumes below.

const CUES: Dictionary = {
	"swing": ["knifeSlice", "knifeSlice2", "drawKnife1", "drawKnife2"],
	"swing_heavy": ["chop"],
	"hit": ["impactPunch_medium_000", "impactPunch_medium_001", "impactPunch_medium_002", "impactPunch_medium_003"],
	"hit_heavy": ["impactPunch_heavy_000", "impactPunch_heavy_001", "impactPunch_heavy_002", "impactPunch_heavy_003"],
	"crack": ["impactGeneric_light_000", "impactGeneric_light_001", "impactGeneric_light_002"],
	"crack_crit": ["impactGlass_light_000", "impactGlass_light_001"],
	"block": ["impactPlate_medium_000"],
	"parry": ["impactMetal_heavy_000", "impactBell_heavy_000"],
	"skill": ["impactGlass_heavy_000"],
	"slam": ["impactMining_000", "impactPunch_heavy_001"],
	"dash": ["cloth1"],
	"rally": ["handleCoins"],
	"ko": ["impactSoft_heavy_000", "impactSoft_heavy_001"],
	"ko_boom": ["ko_boom"],
	"ko_chime": ["ko_chime"],
	"hurt": ["impactPunch_heavy_000"],
	"grunt": ["guardian_grunt"],
	"sting_win": ["sting_victory"],
	"sting_lose": ["sting_defeat"],
}
const VOLUME_DB: Dictionary = {"swing": -9.0, "hit": -5.0, "hit_heavy": -3.0, "crack": -13.0, "crack_crit": -9.0,
	"block": -5.0, "parry": -3.0, "skill": -6.0, "slam": -3.0, "dash": -5.0, "rally": -6.0, "ko": -4.0, "hurt": -6.0,
	"swing_heavy": -6.0, "ko_boom": -3.0, "ko_chime": -8.0, "sting_win": -6.0, "sting_lose": -8.0, "grunt": -9.0}
const MUSIC_DB: float = -9.0          # under the effects: the loop is at -16 LUFS already
const MUSIC_FADE_IN_S: float = 1.6
const DUCK_DB: float = -6.0           # the music under the KO
const DUCK_S: float = 1.4

var enabled: bool = true
var music_on: bool = true
var _streams: Dictionary = {}
var _players: Array[AudioStreamPlayer] = []
var _next: int = 0
var _last_ms: Dictionary = {}
var _music: AudioStreamPlayer
var _music_k: float = 0.0             # 0..1 the fade in
var _duck_t: float = 0.0
var _music_target_db: float = MUSIC_DB
var _sfx_bus: String = "Master"


func _ready() -> void:
	_sfx_bus = _bus("Sfx")
	for cue: String in CUES:
		var arr: Array = []
		for n: String in CUES[cue]:
			var s: Resource = load("res://art/sfx/%s.ogg" % n)
			if s is AudioStream:
				arr.append(s)
		_streams[cue] = arr
	for i in 10:
		var p := AudioStreamPlayer.new()
		p.bus = _sfx_bus
		add_child(p)
		_players.append(p)


## The bus by name, made (sending to Master) when the project has none.
static func _bus(n: String) -> String:
	if AudioServer.get_bus_index(n) < 0:
		AudioServer.add_bus()
		var i: int = AudioServer.bus_count - 1
		AudioServer.set_bus_name(i, n)
		AudioServer.set_bus_send(i, "Master")
	return n


func play(cue: String, pitch: float = 1.0) -> void:
	if not enabled:
		return
	var arr: Array = _streams.get(cue, [])
	if arr.is_empty():
		return
	# the same cue twice inside 40 ms is one sound
	var now: int = Time.get_ticks_msec()
	if now - int(_last_ms.get(cue, -1000)) < 40:
		return
	_last_ms[cue] = now
	var p: AudioStreamPlayer = _players[_next]
	_next = (_next + 1) % _players.size()
	p.stream = arr[randi() % arr.size()]
	p.pitch_scale = pitch * randf_range(0.94, 1.06)   # +/- 6 %
	p.volume_db = float(VOLUME_DB.get(cue, -4.0))
	p.play()
	# the contact crack rides on every hit
	if cue == "hit" or cue == "hit_heavy":
		play("crack", pitch * 1.05)


## A crit's extra bright layer.
func crit() -> void:
	play("crack_crit", 1.0)


## The combat loop, faded in. Off with the sound, or when the config says "music": false.
func start_music() -> void:
	if not enabled or not music_on or _music != null:
		return
	var s: Resource = load("res://art/sfx/music_battle.ogg")
	if not (s is AudioStreamOggVorbis):
		return
	var st := (s as AudioStreamOggVorbis).duplicate() as AudioStreamOggVorbis
	st.loop = true
	_music = AudioStreamPlayer.new()
	_music.bus = _bus("Music")
	_music.stream = st
	_music.volume_db = -60.0
	add_child(_music)
	_music.play()
	_music_k = 0.0


## The fight is over: the music lets go over `secs`.
func end_music(secs: float = 1.2) -> void:
	_music_target_db = -60.0
	_fade_out_s = maxf(0.05, secs)


var _fade_out_s: float = 0.0


## The KO: boom, chime, the music ducked under it.
func ko_beat(boss: bool) -> void:
	if boss:
		play("ko_boom", 1.0)
		var t := get_tree().create_timer(0.16, true, false, true)
		t.timeout.connect(func() -> void: play("ko_chime", 1.0))
	else:
		play("ko_boom", 0.8)
	_duck_t = DUCK_S


func sting(win: bool) -> void:
	play("sting_win" if win else "sting_lose")
	end_music(0.8)


func _process(dt: float) -> void:
	if _music == null:
		return
	# real time: the KO's slow motion must not stretch the fades
	var rdt: float = dt / maxf(0.05, Engine.time_scale)
	_duck_t = maxf(0.0, _duck_t - rdt)
	if _fade_out_s > 0.0:
		_music.volume_db = move_toward(_music.volume_db, -60.0, 60.0 / _fade_out_s * rdt)
		if _music.volume_db <= -59.0:
			_music.stop()
		return
	_music_k = minf(1.0, _music_k + rdt / MUSIC_FADE_IN_S)
	var duck: float = DUCK_DB if _duck_t > 0.0 else 0.0
	_music.volume_db = lerpf(-40.0, _music_target_db + duck, sqrt(_music_k))
