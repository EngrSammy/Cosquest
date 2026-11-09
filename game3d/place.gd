extends Node3D
## The real place round a fight (cq 019, docs/game3d/PLACE.md): OpenStreetMap ground in the game
## server's /v1/map/ground shape (roads, paved squares, green, water, buildings with heights, trees,
## and the landmarks the Overpass tool adds), laid out round the Quest Point the fight is at.
##
## The fight itself does not change: the fighters keep the same 11.2 x 18 m area and every rule. The
## place is turned so the camera looks at the nearest notable landmark (a column, a monument, a
## statue, a fountain; else the tallest building near by), and nothing is built where it would stand
## in the fight or between the fight and the camera.
##
## look-world (art direction "Sunlit Real Places", cosquest-review/art-direction): the place is built
## from one kit shared with the default street (StreetLayout), in the region's style:
##  - ground by land use (region pavement, plaza stone, grass, park paths, water that moves) with a
##    world-space wear layer (place_roads.gd builds roads, kerbs, markings and crossings);
##  - buildings in the region's trim sheets (128 px/m, shopfronts on walls that face a road, cornices,
##    parapets), walls tinted from the region's wall list, flat roofs with roof clutter;
##  - the landmark kit (world_landmarks.gd) instanced by OSM kind, never boxes;
##  - props along the roads and squares and climate-matched trees (place_dress.gd, world_props.gd);
##  - cast shadows and contact AO baked once into a ground texture (place_bake.gd), no per-frame cost;
##  - a little life: a few cars on the roads, distant people, birds, fountain spray (place_life.gd).
## Draws are merged per material (MultiMesh per kit mesh), so a place costs about 80 to 110 draws.

const Roads := preload("res://place_roads.gd")
const Dress := preload("res://place_dress.gd")
const Bake := preload("res://place_bake.gd")
const Life := preload("res://place_life.gd")
const Landmarks := preload("res://world_landmarks.gd")
const Heroes := preload("res://world_heroes.gd")
const GROUND_SHADER := preload("res://vfx/world_ground.gdshader")
const FACADE_SHADER := preload("res://vfx/world_facade.gdshader")
const KIT_SHADER := preload("res://vfx/world_kit.gdshader")
const WATER_SHADER := preload("res://vfx/world_water.gdshader")
const ART := "res://art/world/"

const REACH: float = 260.0      # nothing further than this is built (the camera sees ~150 m)
# the clear zone, in the fight's frame: the fighters' area with a margin, and the wedge up to the
# camera (it stands ~17 m behind the fight, ~11 m up)
const CLEAR := Rect2(-9.0, -11.0, 18.0, 37.0)
const LANDMARK_WEIGHT: Dictionary = {"column": 3.0, "obelisk": 2.5, "monument": 2.0, "clock": 2.5, "statue": 1.0, "fountain": 0.8}

## The trim sheet's rows (art/world/trims, tools/world/make_world_art.py): metres from the top of the
## 8 m x 10 m sheet. Every row tiles along the wall every 8 m.
const SHEET_W: float = 8.0
const SHEET_H: float = 10.0
const ROW_PARAPET := Vector2(0.0, 0.6)
const ROW_EDGE := Vector2(0.6, 1.0)
const ROW_BAY := Vector2(1.0, 4.2)
const ROW_STRING := Vector2(4.2, 4.5)
const ROW_SHOP := Vector2(4.5, 8.5)
const ROW_PLINTH := Vector2(8.5, 9.0)
const ROW_BLANK := Vector2(9.0, 10.0)

## Regions (art direction 2.3, tokens world.regions): wall tints per sheet, roof tints, the climate for trees.
const REGIONS: Dictionary = {
	"uk": {"climate": "temperate_maritime", "pave": "pave_uk", "roof": [Color("#5E6670"), Color("#7C838A")],
		"drive": "left", "marking": "uk"},
	"us_east": {"climate": "humid_continental", "pave": "pave_us", "roof": [Color("#4E4C4F"), Color("#5a5856")],
		"drive": "right", "marking": "us"},
	"us_west": {"climate": "mediterranean", "pave": "pave_us", "roof": [Color("#8C8F94"), Color("#9a8f86")],
		"drive": "right", "marking": "us"},
	"west_africa": {"climate": "tropical", "pave": "pave_lagos", "roof": [Color("#A4613A"), Color("#A7ADB2"), Color("#3F78A8")],
		"drive": "right", "marking": "wa"},
	"generic": {"climate": "temperate_maritime", "pave": "pave_uk", "roof": [Color("#6a6e74"), Color("#7C838A")],
		"drive": "right", "marking": "generic"},
}
const SHEET_TINTS: Dictionary = {
	"trim_uk_brick": [Color("#B98B62"), Color("#A65441"), Color("#B98B62")],
	"trim_uk_stone": [Color("#E3DACB"), Color("#EEE6D8"), Color("#E3DACB")],
	"trim_us_brownstone": [Color("#7A4E3A"), Color("#9B4A36"), Color("#D9CDB8")],
	"trim_us_modern": [Color("#BDB8AF"), Color("#c9c4ba"), Color("#a9a59e")],
	"trim_us_west": [Color("#E8D7BC"), Color("#F1E6CF"), Color("#D9B48C")],
	"trim_wa_render": [Color("#EFE2C6"), Color("#D9A548"), Color("#8EC3D9"), Color("#9FD3B5"), Color("#E7A7A0"), Color("#B7B1A6")],
	"trim_generic": [Color("#EEE6D8"), Color("#B98B62"), Color("#F1E6CF"), Color("#D9CDB8")],
}
## Ground colours the stylised textures were matched to (tokens world.ground): the horizon ring and the
## minimap read these.
const FLOOR_COLOR: Dictionary = {"pave_uk": Color("#C9C0B2"), "pave_us": Color("#C7C3BC"), "pave_lagos": Color("#B89F86")}

var map_blocks: Array[Rect2] = []
var info: Dictionary = {}       # what was built and which way it faces (the load log)
var quality: String = "low"     # arena sets it: "device" (a real GPU) or "low" (software GPU, captures)
var region: String = "generic"
var climate: String = "temperate_maritime"
var clear: Rect2 = CLEAR

var _at: Vector2 = Vector2.ZERO  # the fight's spot in ground metres (x east, z north)
var _yaw: float = 0.0            # radians: ground (after the north flip) turned by this into the fight frame
var _hemi: Callable
var _look: Dictionary = {}
var _tp: Dictionary = {}         # the time preset (arena.gd TIMES)
static var _tex: Dictionary = {}   # textures stay loaded for the next fight
var _mats: Dictionary = {}
var _roads: RefCounted          # place_roads.gd: the road network in the fight's frame (also used to dress)
var _bldg_polys: Array = []     # [PackedVector2Array, h, Rect2] per built building
var _bldg_grid: Dictionary = {} # cell -> [building index]
var _landmark_pts: Array = []   # [Vector2, radius]
var _green_polys: Array = []
var _water_polys: Array = []
var _paved_polys: Array = []
var bake: RefCounted            # place_bake.gd
var _heroes: Array = []         # world_heroes.gd: the hero landmarks this place has (begin), built in _work
var life: Node3D


## ground: the parsed JSON. at: the Quest Point in the ground's metres. cam_yaw_deg: the fight camera's
## turn (fight.gd CAM_YAW), so the landmark lands in the middle of the view. yaw_override: degrees, or NAN.
## Builds the whole place now, on the calling thread (tests, tools). The fight uses begin() + pump().
func build(ground: Dictionary, at: Vector2, cam_yaw_deg: float, yaw_override: float, look: Dictionary, hemi: Callable) -> void:
	begin(ground, at, cam_yaw_deg, yaw_override, look, hemi, false)
	pump(INF)


## day1-world (ART-DIRECTION 8, "place build <= 60 ms on device"): the build in two halves.
##  - begin() on the main thread: the region, the turn towards the landmark and the landmark's spot (the
##    fight's camera and fly-in need them at once). Cheap.
##  - _work(): everything heavy (ground triangulation, roads, walls, landmarks, props, trees, the bake's
##    meshes, MultiMesh buffers, materials) as arrays and resources only. With threaded it runs on a
##    WorkerThreadPool task while the fighters load; the place node is not in the scene tree yet, and no
##    node is made off the main thread: every node is queued (_emit) as a small Callable.
##  - pump(budget_ms) on the main thread, every frame: once the task is done, runs the queued node adds
##    (a time budget per frame), then the bake's SubViewport and the life layer, then sets `built`.
## info gets main_ms (all main-thread time spent on the place), main_max_ms (the worst single frame),
## worker_ms and ms (begin to built, wall clock).
var built: bool = false
const NODES_PER_PUMP: int = 6
signal place_built
var _queue: Array[Callable] = []
var _qi: int = 0
var _deferring: bool = false
var _task: int = -1
var _ground: Dictionary = {}
var _stage: int = 0        # 0 work pending, 1 attaching nodes, 2 done
var _t_begin: int = 0
var _main_us: int = 0
var _main_max_us: int = 0
var _work_us: int = 0
var _work_info: Dictionary = {}


func begin(ground: Dictionary, at: Vector2, cam_yaw_deg: float, yaw_override: float, look: Dictionary, hemi: Callable, threaded: bool) -> void:
	var t0: int = Time.get_ticks_usec()
	_t_begin = t0
	_at = at
	_hemi = hemi
	_look = look
	_tp = TIMES_OF(look)
	_ground = ground
	var o: Dictionary = ground.get("origin", {})
	region = str(ground.get("region", region_of(float(o.get("lat", 0.0)), float(o.get("lng", 0.0)))))
	if not REGIONS.has(region):
		region = "generic"
	climate = str(REGIONS[region]["climate"])
	if region == "generic" and o.has("lat"):
		climate = climate_of(float(o["lat"]))
	var cr: Variant = ground.get("clear", null)
	if cr is Array and (cr as Array).size() == 4:
		clear = Rect2(float(cr[0]), float(cr[1]), float(cr[2]), float(cr[3]))
	_heroes = Heroes.find(ground, at)
	var lm: Dictionary = _hero_landmark(ground)
	if not is_nan(yaw_override):
		_yaw = deg_to_rad(yaw_override)
	elif not lm.is_empty():
		# the landmark's direction (after the north flip) onto the camera's forward
		var d: Vector2 = Vector2(float(lm["x"]) - at.x, -(float(lm["z"]) - at.y))
		var fwd: Vector2 = Vector2(-sin(deg_to_rad(cam_yaw_deg)), -cos(deg_to_rad(cam_yaw_deg)))
		_yaw = fwd.angle() - d.angle()
	info = {"landmark": str(lm.get("name", "")), "landmark_kind": str(lm.get("kind", "")),
		"yaw_deg": snappedf(rad_to_deg(_yaw), 0.1), "region": region, "climate": climate, "time": str(look.get("time", "")),
		"threaded": threaded}
	if not lm.is_empty():
		var lp: Vector2 = to_fight(Vector2(float(lm["x"]), float(lm["z"])))
		info["landmark_at"] = Vector3(lp.x, 0.0, lp.y)
		info["landmark_h"] = float(lm.get("h", 12.0))
	_main_us += Time.get_ticks_usec() - t0
	_main_max_us = maxi(_main_max_us, Time.get_ticks_usec() - t0)
	if threaded:
		_deferring = true
		_task = WorkerThreadPool.add_task(_work, false, "place build")
	else:
		_work()


## The heavy half (see begin). On the worker it touches only this place's own data (the node is outside
## the tree) and resources; node adds go through _emit.
func _work() -> void:
	var t0: int = Time.get_ticks_usec()
	var ground: Dictionary = _ground
	var tm: Dictionary = {}
	bake = Bake.new()
	bake.call("setup", self, quality)
	_roads = Roads.new()
	var t1: int = Time.get_ticks_usec()
	_roads.call("setup", self, ground.get("roads", []))
	_build_flat(ground)
	tm["flat"] = _lap(t1)
	t1 = Time.get_ticks_usec()
	_roads.call("build", self)
	tm["roads"] = _lap(t1)
	t1 = Time.get_ticks_usec()
	_build_heroes()
	_build_bridges()
	tm["heroes"] = _lap(t1)
	t1 = Time.get_ticks_usec()
	_build_buildings(ground.get("buildings", []))
	tm["buildings"] = _lap(t1)
	t1 = Time.get_ticks_usec()
	_build_landmarks(ground.get("landmarks", []))
	tm["landmarks"] = _lap(t1)
	t1 = Time.get_ticks_usec()
	var dress: RefCounted = Dress.new()
	dress.call("build", self, ground)
	tm["dress"] = _lap(t1)
	t1 = Time.get_ticks_usec()
	bake.call("prepare", self)
	tm["bake"] = _lap(t1)
	info["ms_parts"] = tm
	_work_us = Time.get_ticks_usec() - t0


## Runs a node add now, or (threaded) queues it for pump() on the main thread.
func _emit(f: Callable) -> void:
	if _deferring:
		_queue.append(f)
	else:
		f.call()


## True once the worker's half is done (the arena may put the place in the tree while pump attaches).
func work_done() -> bool:
	return _task < 0 or WorkerThreadPool.is_task_completed(_task)


## The main thread's share, once a frame (budget_ms of node adds per call). True once the place is built.
func pump(budget_ms: float = 4.0) -> bool:
	if built:
		return true
	if _task >= 0:
		if budget_ms < 1e6 and not WorkerThreadPool.is_task_completed(_task):
			return false
		WorkerThreadPool.wait_for_task_completion(_task)
		_task = -1
	var t0: int = Time.get_ticks_usec()
	var lim: int = t0 + int(minf(budget_ms, 1e6) * 1000.0)
	# a few nodes a frame, so the renderer's first draw of each new material (shader variants, texture
	# uploads) is spread over the loading frames too, not paid in one
	var n_max: int = NODES_PER_PUMP if budget_ms < 1e6 else 1 << 30
	var n: int = 0
	while _qi < _queue.size() and n < n_max:
		_queue[_qi].call()
		_qi += 1
		n += 1
		if Time.get_ticks_usec() > lim:
			break
	if _qi >= _queue.size():
		_queue.clear()
		_deferring = false
		bake.call("commit", self)
		life = Life.new()
		life.name = "Life"
		add_child(life)
		life.call("build", self, _roads, _ground)
		_ground = {}
		built = true
	var dt: int = Time.get_ticks_usec() - t0
	_main_us += dt
	_main_max_us = maxi(_main_max_us, dt)
	if built:
		info["worker_ms"] = snappedf(_work_us / 1000.0, 0.1)
		info["main_ms"] = snappedf(_main_us / 1000.0, 0.1)
		info["main_max_ms"] = snappedf(_main_max_us / 1000.0, 0.1)
		info["ms"] = snappedf((Time.get_ticks_usec() - _t_begin) / 1000.0, 0.1)
		place_built.emit()
	return built


## The kit's meshes (world_landmarks.gd, world_props.gd): baked ahead into art/world/kit/*.res by
## tools/world/bake_kit.gd (building them procedurally at load cost ~100 ms), else built here; kept for
## the next fight.
static var _kit_cache: Dictionary = {}


static func kit(kind: String, variant: int) -> ArrayMesh:
	var key: String = "%s_%d" % [kind, variant]
	if _kit_cache.has(key):
		return _kit_cache[key]
	var path: String = "res://art/world/kit/%s.res" % key
	var m: ArrayMesh = null
	if ResourceLoader.exists(path):
		m = load(path) as ArrayMesh
	if m == null:
		var lm: Dictionary = Landmarks.info(kind)
		m = Landmarks.build(kind, variant) if not lm.is_empty() and kind in KIT_LANDMARKS else (load("res://world_props.gd") as GDScript).call("build", kind, variant)
	_kit_cache[key] = m
	return m


const KIT_LANDMARKS: Array[String] = ["column", "obelisk", "statue", "lion", "fountain", "memorial", "clock_tower", "arch", "dome", "spire"]


static func _lap(t: int) -> float:
	return snappedf((Time.get_ticks_usec() - t) / 1000.0, 0.1)


static func TIMES_OF(l: Dictionary) -> Dictionary:
	var a: GDScript = load("res://arena.gd")
	return a.call("time_preset", l)


## The art direction's regions from where the place is (tokens world.regions countries, by box).
static func region_of(lat: float, lng: float) -> String:
	if lat == 0.0 and lng == 0.0:
		return "generic"
	if lat > 49.8 and lat < 61.0 and lng > -10.8 and lng < 2.0:
		return "uk"
	if lat > 24.0 and lat < 50.0 and lng > -125.0 and lng < -66.0:
		return "us_west" if lng < -104.0 else "us_east"
	if lat > 3.5 and lat < 17.5 and lng > -18.0 and lng < 16.0:
		return "west_africa"
	return "generic"


static func climate_of(lat: float) -> String:
	var a: float = absf(lat)
	if a < 23.0:
		return "tropical"
	if a < 38.0:
		return "mediterranean"
	return "temperate_maritime"


## A point in the ground's metres to the fight's frame (x right, z towards the camera).
func to_fight(p: Vector2) -> Vector2:
	return Vector2(p.x - _at.x, -(p.y - _at.y)).rotated(_yaw)


func pts(raw: Array) -> PackedVector2Array:
	var out := PackedVector2Array()
	for q: Variant in raw:
		var a: Array = q
		out.append(to_fight(Vector2(float(a[0]), float(a[1]))))
	return out


func far(p: PackedVector2Array) -> bool:
	for q: Vector2 in p:
		if q.length() < REACH:
			return false
	return true


func region_value(k: String) -> Variant:
	return REGIONS[region][k]


## The floor's colour (the region's pavement), for the arena's horizon ring.
func floor_color() -> Color:
	return FLOOR_COLOR.get(str(REGIONS[region]["pave"]), Color("#C9C0B2")) * 0.92


func _hero_landmark(ground: Dictionary) -> Dictionary:
	# day1-world: a hero landmark (world_heroes.gd) within sight wins: it is the "where am I" shot
	var hbest: Dictionary = {}
	for hv: Dictionary in _heroes:
		var hd: float = Vector2(float(hv["x"]) - _at.x, float(hv["z"]) - _at.y).length()
		if hd > 12.0 and hd < 220.0 and (hbest.is_empty() or hd < float(hbest["_d"])):
			hbest = {"x": hv["x"], "z": hv["z"], "name": hv["name"], "kind": "hero", "h": hv["h"], "_d": hd}
	if not hbest.is_empty():
		return hbest
	var best: Dictionary = {}
	var best_s: float = 0.0
	for m: Variant in ground.get("landmarks", []):
		var d: Dictionary = m
		var dist: float = Vector2(float(d["x"]) - _at.x, float(d["z"]) - _at.y).length()
		if dist < 12.0 or dist > 140.0:
			continue
		var s: float = float(LANDMARK_WEIGHT.get(str(d["kind"]), 0.5)) * sqrt(maxf(1.0, float(d["h"]))) / (1.0 + dist / 50.0)
		if s > best_s:
			best_s = s
			best = d
	if not best.is_empty():
		# its best name: a column's statue is often mapped apart from the column ("Horatio Nelson" on
		# "Nelson's Column"); the widest named thing at the same spot names the place
		for m2: Variant in ground.get("landmarks", []):
			var d2: Dictionary = m2
			if str(d2.get("name", "")) != "" and Vector2(float(d2["x"]) - float(best["x"]), float(d2["z"]) - float(best["z"])).length() < 3.0 \
					and float(d2.get("r", 0.0)) > float(best.get("r", 0.0)):
				best = best.duplicate()
				best["name"] = d2["name"]
	if best.is_empty():
		for b: Variant in ground.get("buildings", []):
			var bd: Dictionary = b
			var ring: Array = bd["p"]
			var c: Vector2 = Vector2.ZERO
			for q: Variant in ring:
				c += Vector2(float(q[0]), float(q[1]))
			c /= maxf(1.0, ring.size())
			var dist2: float = (c - _at).length()
			if dist2 > 25.0 and dist2 < 150.0 and float(bd["h"]) / (1.0 + dist2 / 60.0) > best_s:
				best_s = float(bd["h"]) / (1.0 + dist2 / 60.0)
				best = {"x": c.x, "z": c.y, "name": "", "kind": "building"}
	return best


# ------------------------------------------------------------ textures and materials

func tex(name: String) -> Texture2D:
	if not _tex.has(name):
		var p: String = ART + name + ".png"
		_tex[name] = load(p) if ResourceLoader.exists(p) else null
	return _tex[name]


## A ground-level material (world_ground.gdshader): `name` is the art/world texture, tile_m its repeat.
func ground_mat(key: String, name: String, tile_m: float, opts: Dictionary = {}) -> ShaderMaterial:
	if _mats.has(key):
		return _mats[key]
	var sm := ShaderMaterial.new()
	sm.shader = GROUND_SHADER
	var t: Texture2D = tex(name)
	sm.set_shader_parameter("albedo_tex", t if t != null else _white())
	sm.set_shader_parameter("tile_m", tile_m)
	var w: Texture2D = tex("ground/wear")
	if w != null:
		sm.set_shader_parameter("wear_tex", w)
	sm.set_shader_parameter("ao_col", _tp.get("ao", Color(0.42, 0.416, 0.478)))
	sm.set_shader_parameter("ao_alpha", float(_tp.get("ao_alpha", 0.55)))
	for k: String in opts:
		sm.set_shader_parameter(k, opts[k])
	bake.call("register", sm)
	_mats[key] = sm
	return sm


## A kit material (world_kit.gdshader) for a surface class of the props, trees and landmarks.
func kit_mat(cls: String) -> Material:
	var key: String = "kit_" + cls
	if _mats.has(key):
		return _mats[key]
	var m: Material
	if cls == "water":
		m = water_mat()
	elif cls == "screen":
		# day1-world: the Times Square screens (made-up ads, art/world/misc/screens.png): self-lit, so unshaded,
		# their brightest texel ~0.85 so they never clip to white; a little brighter at dusk
		var sc := StandardMaterial3D.new()
		sc.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		sc.albedo_texture = tex("misc/screens")
		var lift: float = 0.92 + 0.12 * float(_tp.get("lamps", 0.0))
		sc.albedo_color = Color(lift, lift, lift)
		sc.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
		m = sc
	elif cls == "clock":
		var sm0 := StandardMaterial3D.new()
		sm0.albedo_texture = tex("misc/clock_face")
		sm0.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR
		sm0.alpha_scissor_threshold = 0.5
		sm0.roughness = 0.6
		sm0.emission_enabled = float(_tp.get("lamps", 0.0)) > 0.0
		sm0.emission = Color(1.0, 0.86, 0.6) * 0.5
		m = sm0
	else:
		var sm := ShaderMaterial.new()
		sm.shader = KIT_SHADER
		var detail: String = "misc/props_noise"
		var k: float = 0.3
		var mean: float = 0.5
		var tile: float = 1.5
		var rough: float = 0.7
		match cls:
			"stone":
				detail = "misc/stone"
				k = 1.0
				mean = 0.8
				tile = 2.0
				rough = 0.8
				sm.set_shader_parameter("tint", Color("#E3DACB"))
				sm.set_shader_parameter("lift", 0.14)
			"granite":
				detail = "misc/stone"
				k = 0.8
				mean = 0.8
				tile = 1.6
				rough = 0.75
				sm.set_shader_parameter("tint", Color("#f2efe9"))
				sm.set_shader_parameter("lift", 0.3)
			"bronze":
				k = 0.25
				rough = 0.55
				sm.set_shader_parameter("lift", 0.9)   # the art direction: bronze never renders black
			"foliage":
				detail = "misc/foliage"
				k = 0.55
				tile = 1.2
				rough = 0.85
				sm.set_shader_parameter("sway", 0.12)
			"bark":
				k = 0.4
				rough = 0.9
			"glow":
				k = 0.0
				sm.set_shader_parameter("emit_from_vcol", 1.0)
				sm.set_shader_parameter("emit_k", 0.15 + 1.4 * float(_tp.get("lamps", 0.0)))
			"glass":
				k = 0.0
				rough = 0.2
			"render":
				# day1-world (hero landmarks): stone texture, the colour from the vertex colour
				detail = "misc/stone"
				k = 0.7
				mean = 0.8
				tile = 2.5
				rough = 0.8
				sm.set_shader_parameter("tint", Color(1, 1, 1))
				sm.set_shader_parameter("lift", 0.3)
			"tile":
				k = 0.5
				tile = 0.8
				rough = 0.8
				sm.set_shader_parameter("lift", 0.2)
			"slate":
				k = 0.35
				rough = 0.6
				sm.set_shader_parameter("lift", 0.5)   # slate and painted iron: dark, never black
			"gilt":
				k = 0.2
				rough = 0.45
				sm.set_shader_parameter("lift", 0.9)
			"bird":
				k = 0.0
				sm.set_shader_parameter("flap", 0.6)
		var t: Texture2D = tex(detail)
		if t != null:
			sm.set_shader_parameter("detail_tex", t)
		sm.set_shader_parameter("detail_k", k if t != null else 0.0)
		sm.set_shader_parameter("detail_mean", mean)
		sm.set_shader_parameter("detail_tile", tile)
		sm.set_shader_parameter("rough", rough)
		if _hemi.is_valid():
			_hemi.call(sm, _look)
		m = sm
	_mats[key] = m
	return m


var _white_tex: ImageTexture


func _white() -> ImageTexture:
	if _white_tex == null:
		var img := Image.create(4, 4, true, Image.FORMAT_RGB8)
		img.fill(Color.WHITE)
		_white_tex = ImageTexture.create_from_image(img)
	return _white_tex


func water_mat() -> ShaderMaterial:
	if _mats.has("water"):
		return _mats["water"]
	var sm := ShaderMaterial.new()
	sm.shader = WATER_SHADER
	var n: Texture2D = tex("ground/water_n")
	if n != null:
		sm.set_shader_parameter("water_n", n)
	sm.set_shader_parameter("sky_upper", _tp.get("upper", Color(0.5, 0.68, 0.88)))
	sm.set_shader_parameter("sky_horizon", _tp.get("horizon", Color(0.95, 0.87, 0.76)))
	_mats["water"] = sm
	return sm


func add_mesh(mesh: Mesh, mat: Material, n: String) -> void:
	_emit(_mk_mesh.bind(mesh, mat, n))


func _mk_mesh(mesh: Mesh, mat: Material, n: String) -> void:
	var mi := MeshInstance3D.new()
	mi.name = n
	mi.mesh = mesh
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)


## A kit mesh (its surfaces named by class) instanced at `xfs`: one MultiMesh, one draw per surface.
## cast: kept for callers; the place casts nothing into the shadow map (see below).
func add_multi(mesh: ArrayMesh, xfs: Array, n: String, _cast: bool = false, owned: bool = false) -> void:
	if xfs.is_empty() or mesh == null:
		return
	if owned:
		# a mesh built for this place only (a hero, a bridge): its materials go straight on it
		for si in mesh.get_surface_count():
			mesh.surface_set_material(si, kit_mat(mesh.surface_get_name(si)))
		add_multi_buffer(mesh, xform_buffer(xfs), xfs.size(), n)
		return
	# the kit mesh's copy with this place's materials is made on the main thread: ArrayMesh.duplicate()
	# reads the surfaces back from the RenderingServer, which from a worker waits for the main thread's
	# next flush (a frame per call)
	var mats: Array = []
	for si in mesh.get_surface_count():
		mats.append(kit_mat(mesh.surface_get_name(si)))
	_emit(_mk_multi_kit.bind(mesh, mats, xform_buffer(xfs), xfs.size(), n))


func _mk_multi_kit(mesh: ArrayMesh, mats: Array, buf: PackedFloat32Array, count: int, n: String) -> void:
	var m2: ArrayMesh = mesh.duplicate() as ArrayMesh
	for si in m2.get_surface_count():
		m2.surface_set_material(si, mats[si])
	_mk_multi(m2, buf, count, n)


## The MultiMesh's instance data as one buffer (12 floats per instance, Godot's TRANSFORM_3D layout),
## built off the main thread; the MultiMesh itself is made when its node is (one buffer upload).
static func xform_buffer(xfs: Array) -> PackedFloat32Array:
	var buf := PackedFloat32Array()
	buf.resize(xfs.size() * 12)
	var k: int = 0
	for x: Transform3D in xfs:
		var b: Basis = x.basis
		buf[k] = b.x.x; buf[k + 1] = b.y.x; buf[k + 2] = b.z.x; buf[k + 3] = x.origin.x
		buf[k + 4] = b.x.y; buf[k + 5] = b.y.y; buf[k + 6] = b.z.y; buf[k + 7] = x.origin.y
		buf[k + 8] = b.x.z; buf[k + 9] = b.y.z; buf[k + 10] = b.z.z; buf[k + 11] = x.origin.z
		k += 12
	return buf


func add_multi_buffer(mesh: Mesh, buf: PackedFloat32Array, count: int, n: String) -> void:
	_emit(_mk_multi.bind(mesh, buf, count, n))


## Parked cars of one Kenney model (place_dress.gd), on the main thread.
func mk_cars(model: String, xs: Array) -> void:
	var mi: Array = Dress.car_mesh(self, model)
	if mi.is_empty():
		return
	var xf2: Array = []
	for x: Transform3D in xs:
		xf2.append(x * (mi[1] as Transform3D))
	_mk_multi(mi[0], xform_buffer(xf2), xf2.size(), "cars_" + model.get_file())


func _mk_multi(mesh: Mesh, buf: PackedFloat32Array, count: int, n: String) -> void:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = mesh
	mm.instance_count = count
	mm.buffer = buf
	var mmi := MultiMeshInstance3D.new()
	mmi.name = n
	mmi.multimesh = mm
	# the place's static shade is baked (place_bake.gd); the device shadow map is the fighters' only: a
	# MultiMesh casts all its instances, which doubled the triangles in a shadow pass (498 k at Trafalgar)
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mmi)


# ------------------------------------------------------------ the ground by land use

## A flat ground triangle wound so its front face looks up (env-fixes 2: two-sided flat layers lit as
## faces looking down rendered navy).
static func up_tri(st: SurfaceTool, a: Vector2, b: Vector2, c: Vector2, y: float) -> void:
	var cross: float = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
	var tri := PackedVector2Array([a, b, c] if cross > 0.0 else [a, c, b])   # clockwise seen from above
	for p: Vector2 in tri:
		st.set_normal(Vector3.UP)
		st.add_vertex(Vector3(p.x, y, p.y))


func poly_fill(st: SurfaceTool, poly: PackedVector2Array, y: float) -> bool:
	var tri: PackedInt32Array = Geometry2D.triangulate_polygon(poly)
	if tri.is_empty():
		return false
	for k in range(0, tri.size(), 3):
		up_tri(st, poly[tri[k]], poly[tri[k + 1]], poly[tri[k + 2]], y)
	return true


func _ring(a: Dictionary) -> PackedVector2Array:
	var p: PackedVector2Array = pts(a["p"])
	if p.size() > 3 and p[0].is_equal_approx(p[p.size() - 1]):
		p.remove_at(p.size() - 1)
	return p


const GREEN_DRY: Array[String] = ["meadow", "scrub", "heath", "grassland"]


func _build_flat(ground: Dictionary) -> void:
	var pave: String = str(REGIONS[region]["pave"])
	# the floor: the region's pavement out to the build reach (the arena's horizon ring takes over beyond)
	var fl := SurfaceTool.new()
	fl.begin(Mesh.PRIMITIVE_TRIANGLES)
	var r: float = REACH + 60.0
	up_tri(fl, Vector2(-r, -r), Vector2(r, -r), Vector2(r, r), 0.0)
	up_tri(fl, Vector2(-r, -r), Vector2(r, r), Vector2(-r, r), 0.0)
	add_mesh(fl.commit(), ground_mat("floor", "ground/" + pave, 3.0 if pave == "pave_us" else 4.0, {"bake_on": 1.0}), "floor")
	# squares (plaza stone), grass and parks, water; fountains the landmark kit draws are left to it
	var fountains: Array[Vector2] = []
	for m: Variant in ground.get("landmarks", []):
		var d: Dictionary = m
		if str(d["kind"]) == "fountain":
			fountains.append(to_fight(Vector2(float(d["x"]), float(d["z"]))))
	var st_p := SurfaceTool.new()
	st_p.begin(Mesh.PRIMITIVE_TRIANGLES)
	var st_g := SurfaceTool.new()
	st_g.begin(Mesh.PRIMITIVE_TRIANGLES)
	var st_d := SurfaceTool.new()
	st_d.begin(Mesh.PRIMITIVE_TRIANGLES)
	var st_w := SurfaceTool.new()
	st_w.begin(Mesh.PRIMITIVE_TRIANGLES)
	var n: Dictionary = {"paved": 0, "green": 0, "water": 0}
	for a: Variant in ground.get("paved", []):
		var p: PackedVector2Array = _ring(a)
		if p.size() >= 3 and not far(p) and poly_fill(st_p, p, 0.006):
			_paved_polys.append(p)
			n["paved"] += 1
	for a: Variant in ground.get("green", []):
		var p: PackedVector2Array = _ring(a)
		if p.size() < 3 or far(p):
			continue
		var dry: bool = str((a as Dictionary).get("k", "")) in GREEN_DRY or climate == "tropical"
		if poly_fill(st_d if dry else st_g, p, 0.01):
			_green_polys.append(p)
			n["green"] += 1
	for a: Variant in ground.get("water", []):
		var p: PackedVector2Array = _ring(a)
		if p.size() < 3 or far(p):
			continue
		var kit_has_it: bool = false
		if str((a as Dictionary).get("k", "")) == "fountain":
			for f: Vector2 in fountains:
				if Geometry2D.is_point_in_polygon(f, p) or _poly_centre(p).distance_to(f) < 6.0:
					kit_has_it = true
		if kit_has_it:
			continue
		if poly_fill(st_w, p, 0.03):
			_water_polys.append(p)
			n["water"] += 1
	for k: String in n:
		info[k] = n[k]
	if n["paved"] > 0:
		add_mesh(st_p.commit(), ground_mat("plaza", "ground/plaza", 4.0, {"bake_on": 1.0}), "paved")
	var gm: ArrayMesh = st_g.commit()
	if gm.get_surface_count() > 0:
		add_mesh(gm, ground_mat("grass", "ground/grass", 4.0, {"bake_on": 1.0, "grime_k": 0.0, "crack_k": 0.0, "macro_k": 0.25}), "green")
	var dm: ArrayMesh = st_d.commit()
	if dm.get_surface_count() > 0:
		add_mesh(dm, ground_mat("grass_dry", "ground/grass_dry", 4.0, {"bake_on": 1.0, "grime_k": 0.0, "crack_k": 0.0, "macro_k": 0.25}), "green_dry")
	if n["water"] > 0:
		add_mesh(st_w.commit(), water_mat(), "water")


static func _poly_centre(p: PackedVector2Array) -> Vector2:
	var c := Vector2.ZERO
	for q: Vector2 in p:
		c += q
	return c / maxf(1.0, p.size())


# ------------------------------------------------------------ buildings

func _sheet_for(h: float, area: float, rnd: float) -> String:
	match region:
		"uk":
			if h >= 34.0:
				return "trim_us_modern" if rnd < 0.6 else "trim_uk_stone"
			if h >= 16.0 or area > 900.0:
				return "trim_uk_stone" if rnd < 0.8 else "trim_uk_brick"
			return "trim_uk_brick" if rnd < 0.75 else "trim_uk_stone"
		"us_east":
			if h >= 30.0:
				return "trim_us_modern" if rnd < 0.75 else "trim_us_brownstone"
			return "trim_us_brownstone" if rnd < 0.85 else "trim_us_modern"
		"us_west":
			return "trim_us_modern" if h >= 30.0 else "trim_us_west"   # day1-world: was 20 m (Stanford read as glass)
		"west_africa":
			return "trim_us_modern" if h >= 30.0 else "trim_wa_render"
	return "trim_us_modern" if h >= 30.0 else "trim_generic"


static func _hash2(v: Vector2) -> float:
	return fposmod(sin(v.x * 12.9898 + v.y * 78.233) * 43758.5453, 1.0)


func _bcell(p: Vector2) -> Vector2i:
	return Vector2i(floori(p.x / 20.0), floori(p.y / 20.0))


## True when `p` is inside a built building (with a margin).
func in_building(p: Vector2, margin: float = 0.4) -> bool:
	for dx in [-1, 0, 1]:
		for dy in [-1, 0, 1]:
			var c: Vector2i = _bcell(p) + Vector2i(dx, dy)
			for i: int in _bldg_grid.get(c, []):
				var b: Array = _bldg_polys[i]
				if not (b[2] as Rect2).grow(margin).has_point(p):
					continue
				if Geometry2D.is_point_in_polygon(p, b[0]):
					return true
				if margin > 0.0:
					var poly: PackedVector2Array = b[0]
					for k in poly.size():
						var q: Vector2 = Geometry2D.get_closest_point_to_segment(p, poly[k], poly[(k + 1) % poly.size()])
						if q.distance_to(p) < margin:
							return true
	return false


func building_height_at(p: Vector2) -> float:
	for i: int in _bldg_grid.get(_bcell(p), []):
		var b: Array = _bldg_polys[i]
		if (b[2] as Rect2).has_point(p) and Geometry2D.is_point_in_polygon(p, b[0]):
			return float(b[1])
	return 0.0


func in_water(p: Vector2) -> bool:
	return _in_any(p, _water_polys, "_water_box")


func in_green(p: Vector2) -> bool:
	return _in_any(p, _green_polys, "_green_box")


func in_paved(p: Vector2) -> bool:
	return _in_any(p, _paved_polys, "_paved_box")


## Point in any of `polys`, with their bounding boxes (cached in meta `key`) tested first.
func _in_any(p: Vector2, polys: Array, key: String) -> bool:
	var boxes: Array = get_meta(key, [])
	if boxes.size() != polys.size():
		boxes = []
		for poly: PackedVector2Array in polys:
			var b := Rect2(poly[0], Vector2.ZERO)
			for q: Vector2 in poly:
				b = b.expand(q)
			boxes.append(b)
		set_meta(key, boxes)
	for i in polys.size():
		if (boxes[i] as Rect2).has_point(p) and Geometry2D.is_point_in_polygon(p, polys[i]):
			return true
	return false


func near_landmark(p: Vector2, extra: float = 2.0) -> bool:
	for l: Array in _landmark_pts:
		if p.distance_to(l[0]) < float(l[1]) + extra:
			return true
	return false


func _build_buildings(builds: Array) -> void:
	var sts: Dictionary = {}       # sheet -> SurfaceTool
	var roof := SurfaceTool.new()
	roof.begin(Mesh.PRIMITIVE_TRIANGLES)
	var built: int = 0
	var cleared: int = 0
	var sheets_used: Dictionary = {}
	var roofs_list: Array = []      # [poly, h, sheet, area] for the roof clutter
	for b: Variant in builds:
		var bd: Dictionary = b
		var p: PackedVector2Array = _ring(bd)
		if p.size() < 3 or far(p):
			continue
		var box: Rect2 = Rect2(p[0], Vector2.ZERO)
		for q: Vector2 in p:
			box = box.expand(q)
		if box.intersects(clear):
			cleared += 1
			continue
		var h: float = clampf(float(bd["h"]), 3.0, 320.0)
		var under: Array = _under_hero(p) if not _hero_pts.is_empty() else ["", 0.0]
		if under[0] == "skip":
			continue
		if under[0] == "annex":
			h = minf(h, float(under[1]))
		var base: float = clampf(float(bd.get("b", 0.0)), 0.0, h - 1.0)
		var area: float = absf(_area(p))
		var rnd: float = _hash2(p[0])
		var sheet: String = str(bd.get("sheet", _sheet_for(h, area, rnd)))
		if not sts.has(sheet):
			sts[sheet] = {"v": PackedVector3Array(), "n": PackedVector3Array(), "t": PackedFloat32Array(),
				"c": PackedColorArray(), "uv": PackedVector2Array(), "uv2": PackedVector2Array()}
		var tints: Array = SHEET_TINTS.get(sheet, SHEET_TINTS["trim_generic"])
		var tint: Color = tints[int(rnd * 997.0) % tints.size()]
		tint = tint.lightened((fposmod(rnd * 31.0, 1.0) - 0.5) * 0.1)
		_walls(sts[sheet], p, base, h, tint, rnd, sheet)
		var roofs: Array = REGIONS[region]["roof"]
		var rc: Color = roofs[int(rnd * 131.0) % roofs.size()]
		roof.set_color(rc)
		var tri: PackedInt32Array = Geometry2D.triangulate_polygon(p)
		for k in range(0, tri.size(), 3):
			up_tri_col(roof, p[tri[k]], p[tri[k + 1]], p[tri[k + 2]], h, rc)
		bake.call("building", p, base, h)
		_bldg_polys.append([p, h, box])
		var bi: int = _bldg_polys.size() - 1
		for cx in range(floori(box.position.x / 20.0), floori(box.end.x / 20.0) + 1):
			for cy in range(floori(box.position.y / 20.0), floori(box.end.y / 20.0) + 1):
				var c := Vector2i(cx, cy)
				if not _bldg_grid.has(c):
					_bldg_grid[c] = []
				(_bldg_grid[c] as Array).append(bi)
		map_blocks.append(box)
		roofs_list.append([p, h, sheet, area])
		sheets_used[sheet] = int(sheets_used.get(sheet, 0)) + 1
		built += 1
	info["buildings"] = built
	info["buildings_cleared"] = cleared
	info["sheets"] = sheets_used
	for sheet: String in sts:
		var w: Dictionary = sts[sheet]
		var arr: Array = []
		arr.resize(Mesh.ARRAY_MAX)
		arr[Mesh.ARRAY_VERTEX] = w["v"]
		arr[Mesh.ARRAY_NORMAL] = w["n"]
		arr[Mesh.ARRAY_TANGENT] = w["t"]
		arr[Mesh.ARRAY_COLOR] = w["c"]
		arr[Mesh.ARRAY_TEX_UV] = w["uv"]
		arr[Mesh.ARRAY_TEX_UV2] = w["uv2"]
		var am := ArrayMesh.new()
		am.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
		add_mesh(am, _facade_mat(sheet), "buildings_" + sheet)
	if built > 0:
		add_mesh(roof.commit(), ground_mat("roof", "roofs/roof_flat", 4.0, {"use_vcol": 1.0, "tint": Color(1.25, 1.25, 1.25), "crack_k": 0.0}), "roofs")
	if not _screens.is_empty():
		add_multi(Landmarks._commit(_screens), [Transform3D.IDENTITY], "canyon_screens", false, true)
		_screens = {}
	set_meta("roofs", roofs_list)


static func _area(p: PackedVector2Array) -> float:
	var a: float = 0.0
	for i in p.size():
		var q: Vector2 = p[i]
		var r: Vector2 = p[(i + 1) % p.size()]
		a += q.x * r.y - r.x * q.y
	return a * 0.5


static func up_tri_col(st: SurfaceTool, a: Vector2, b: Vector2, c: Vector2, y: float, col: Color) -> void:
	var cross: float = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
	var tri := PackedVector2Array([a, b, c] if cross > 0.0 else [a, c, b])
	for p: Vector2 in tri:
		st.set_color(col)
		st.set_normal(Vector3.UP)
		st.add_vertex(Vector3(p.x, y, p.y))


func _facade_mat(sheet: String) -> ShaderMaterial:
	var key: String = "facade_" + sheet
	if _mats.has(key):
		return _mats[key]
	var sm := ShaderMaterial.new()
	sm.shader = FACADE_SHADER
	for pair: Array in [["albedo_tex", ""], ["orm_tex", "_orm"], ["normal_tex", "_n"]]:
		var t: Texture2D = tex("trims/" + sheet + str(pair[1]))
		if t != null:
			sm.set_shader_parameter(str(pair[0]), t)
	if _hemi.is_valid():
		_hemi.call(sm, _look)
	sm.set_shader_parameter("windows_k_mul", float(_tp.get("windows", 0.15)))
	sm.set_shader_parameter("window_col", _tp.get("window_col", Color(1.0, 0.85, 0.63)))
	sm.set_shader_parameter("sky_upper", _tp.get("upper", Color(0.5, 0.68, 0.88)))
	sm.set_shader_parameter("sky_horizon", _tp.get("horizon", Color(0.95, 0.87, 0.76)))
	_mats[key] = sm
	return sm


## The bands of a wall from y0 to h: [y_bottom, y_top, row (Vector2 metres in the sheet), floor index].
## Plinth, a ground floor (a shopfront where the wall faces a road, else a bay over a blank band), a string
## course, upper bays (whole floors, stretched a little to fit), then the roof edge and parapet.
static func wall_bands(base: float, h: float, shop: bool, narrow: bool) -> Array:
	var out: Array = []
	var top_parts: Array = []
	var hh: float = h - base
	if hh >= 7.0:
		top_parts = [[0.4, ROW_EDGE], [0.6, ROW_PARAPET]]
	elif hh >= 3.0:
		top_parts = [[0.4, ROW_EDGE]]
	var top_h: float = 0.0
	for t: Array in top_parts:
		top_h += float(t[0])
	var y: float = base
	var lim: float = h - top_h
	var fl: int = 0
	if base < 0.5 and lim - y >= 1.2:
		out.append([y, y + 0.5, ROW_PLINTH, -1])
		y += 0.5
		if lim - y >= 4.0:
			if shop and not narrow:
				out.append([y, y + 4.0, ROW_SHOP, 0])
			elif narrow:
				out.append_array(_blank(y, y + 4.0))
			else:
				out.append_array(_blank(y, y + 0.8))
				out.append([y + 0.8, y + 4.0, ROW_BAY, 0])
			y += 4.0
			fl = 1
			if lim - y >= 3.0:
				out.append([y, y + 0.3, ROW_STRING, -1])
				y += 0.3
	var rest: float = lim - y
	if rest >= 2.4 and not narrow:
		var n: int = maxi(1, int(round(rest / 3.2)))
		var bay: float = rest / n
		for i in n:
			out.append([y + i * bay, y + (i + 1) * bay, ROW_BAY, fl + i])
		y = lim
	elif rest > 0.05:
		out.append_array(_blank(y, lim))
		y = lim
	for t: Array in top_parts:
		out.append([y, y + float(t[0]), t[1], -1])
		y += float(t[0])
	return out


static func _blank(y0: float, y1: float) -> Array:
	var out: Array = []
	var y: float = y0
	while y < y1 - 0.01:
		var y2: float = minf(y + 1.0, y1)
		out.append([y, y2, Vector2(ROW_BLANK.x, ROW_BLANK.x + (y2 - y)), -1])
		y = y2
	return out


func _walls(w: Dictionary, poly: PackedVector2Array, base: float, h: float, tint: Color, seed: float, sheet: String) -> void:
	var wv: PackedVector3Array = w["v"]
	var wn: PackedVector3Array = w["n"]
	var wt: PackedFloat32Array = w["t"]
	var wc: PackedColorArray = w["c"]
	var wu: PackedVector2Array = w["uv"]
	var wu2: PackedVector2Array = w["uv2"]
	w.clear()   # the locals hold the only reference, so appending never copies the arrays
	var area: float = _area(poly)
	var ccw: bool = area > 0.0
	var u: float = (0.5 if seed > 0.5 else 0.0) * SHEET_W
	var tall_glass: bool = sheet == "trim_us_modern"
	for i in poly.size():
		var a: Vector2 = poly[i]
		var b: Vector2 = poly[(i + 1) % poly.size()]
		var len: float = a.distance_to(b)
		if len < 0.05:
			continue
		var d: Vector2 = (b - a) / len
		var n2: Vector2 = Vector2(d.y, -d.x) if ccw else Vector2(-d.y, d.x)
		var mid: Vector2 = (a + b) * 0.5
		var shop: bool = h >= 5.0 and ((_roads != null and bool(_roads.call("faces_road", mid, n2))) or in_paved(mid + n2 * 2.5))
		var narrow: bool = len < 2.4 and not tall_glass
		var nrm: Vector3 = Vector3(n2.x, 0.0, n2.y)
		if shop and not _canyon.is_empty():
			_canyon_screens(a, b, n2, h, fposmod(seed * 7.0 + float(i) * 0.137, 1.0))
		for band: Array in wall_bands(base, h, shop, narrow):
			var y0: float = band[0]
			var y1: float = band[1]
			var row: Vector2 = band[2]
			var v0: float = row.y / SHEET_H     # the band's bottom: the row's bottom edge in the sheet
			var v1: float = row.x / SHEET_H
			var uv2: Vector2 = Vector2(seed, float(band[3]))
			var q: Array = [[Vector3(a.x, y0, a.y), Vector2(u / SHEET_W, v0)], [Vector3(b.x, y0, b.y), Vector2((u + len) / SHEET_W, v0)],
				[Vector3(b.x, y1, b.y), Vector2((u + len) / SHEET_W, v1)], [Vector3(a.x, y1, a.y), Vector2(u / SHEET_W, v1)]]
			var order: Array = [0, 1, 2, 0, 2, 3] if ccw else [0, 2, 1, 0, 3, 2]
			for k: int in order:
				wv.append(q[k][0])
				wn.append(nrm)
				# the tangent runs along the wall the way u grows: a to b
				wt.append_array([d.x, 0.0, d.y, 1.0])
				wc.append(tint)
				wu.append(q[k][1])
				wu2.append(uv2)
		u += len
	w["v"] = wv
	w["n"] = wn
	w["t"] = wt
	w["c"] = wc
	w["uv"] = wu
	w["uv2"] = wu2


# ------------------------------------------------------------ hero landmarks

## day1-world: the hero landmarks this place has (world_heroes.gd find, in begin): each a bespoke mesh at its
## footprint, turned to the footprint's walls (or its front to the fight); its shade and contact AO baked,
## its footprint kept clear of props and on the minimap. Times Square also lines the street's walls near by
## with screens (_walls, _canyon).
var _hero_pts: Array = []       # [Vector2 fight frame, fp radius, annex_h]
var _canyon: Array = []         # [Vector2 centre, radius] (Times Square)
var _screens: Dictionary = {}   # the canyon's wall screens (world_landmarks classes "screen", "render")


func _build_heroes() -> void:
	var n: Array = []
	for hv: Dictionary in _heroes:
		var p: Vector2 = to_fight(Vector2(float(hv["x"]), float(hv["z"])))
		if p.length() > REACH:
			continue
		var id: String = str(hv["id"])
		var yaw: float = atan2(-p.x, -p.y) + PI    # its front (+z) towards the fight
		if hv.has("heading"):
			# square to its OSM footprint: the wall heading (ground frame, after the north flip and the turn),
			# the face nearest the fight's direction
			var a: float = -float(hv["heading"]) - _yaw
			var best: float = yaw
			var bd: float = 9.0
			for k in 4:
				var cand: float = a + PI * 0.5 * k
				var dd: float = absf(wrapf(cand - yaw, -PI, PI))
				if dd < bd:
					bd = dd
					best = cand
			yaw = best
		var mesh: ArrayMesh = Heroes.build(id, float(hv.get("r", 0.0)))
		add_multi(mesh, [Transform3D(Basis(Vector3.UP, yaw), Vector3(p.x, 0.0, p.y))], "hero_" + id, false, true)
		var r: float = float(hv["r"])
		_hero_pts.append([p, float(hv["fp"]), float(hv["annex_h"])])
		_landmark_pts.append([p, r + 1.0])
		bake.call("landmark", p, r, float(hv["h"]))
		map_blocks.append(Rect2(p - Vector2(r, r), Vector2(r, r) * 2.0))
		if hv.has("canyon"):
			_canyon = [p, float(hv["canyon"])]
		n.append(id)
	info["heroes"] = n


## day1-world: a bridge piece (world_landmarks.gd bridge) wherever a car road runs over water for 14 m
## or more: parapets, refuges and lamp standards along the crossing.
func _build_bridges() -> void:
	info["bridges"] = 0
	if _water_polys.is_empty():
		return
	var n: int = 0
	for rd: Dictionary in _roads.get("roads"):
		if str(rd.get("k", "")) == "path":
			continue
		var pp: PackedVector2Array = rd["p"]
		var run: Array = []   # sample points over water
		for i in pp.size() - 1:
			var a: Vector2 = pp[i]
			var b: Vector2 = pp[i + 1]
			var steps: int = maxi(1, int(a.distance_to(b) / 2.0))
			for k in steps + 1:
				var q: Vector2 = a.lerp(b, float(k) / steps)
				if q.length() < REACH and in_water(q):
					run.append(q)
				elif run.size() > 0:
					n += _bridge(run, float(rd["hw"]))
					run = []
		if run.size() > 0:
			n += _bridge(run, float(rd["hw"]))
	info["bridges"] = n


func _bridge(run: Array, hw: float) -> int:
	var a: Vector2 = run[0]
	var b: Vector2 = run[run.size() - 1]
	var len: float = a.distance_to(b)
	if len < 14.0:
		return 0
	var d: Vector2 = (b - a) / len
	a -= d * 3.0
	b += d * 3.0
	var mid: Vector2 = (a + b) * 0.5
	var mesh: ArrayMesh = Landmarks.bridge(len + 6.0, hw * 2.0)
	var z := Vector3(d.x, 0.0, d.y)
	var x: Vector3 = Vector3.UP.cross(z).normalized()
	add_multi(mesh, [Transform3D(Basis(x, Vector3.UP, z), Vector3(mid.x, 0.0, mid.y))], "bridge", false, true)
	return 1


## The OSM building under a hero: "skip" (not built), "annex" (cut to annex_h) or "" (built as mapped).
func _under_hero(poly: PackedVector2Array) -> Array:
	for hp: Array in _hero_pts:
		if Heroes.covers(hp[0], float(hp[1]), poly):
			return ["annex", float(hp[2])] if float(hp[2]) > 0.0 else ["skip", 0.0]
	return ["", 0.0]


## Times Square's canyon: screens on a wall that faces the street near the square (cells picked by a hash).
func _canyon_screens(a: Vector2, b: Vector2, n2: Vector2, h: float, seed: float) -> void:
	var len: float = a.distance_to(b)
	var mid: Vector2 = (a + b) * 0.5
	if _canyon.is_empty() or h < 12.0 or len < 7.0 or mid.distance_to(_canyon[0]) > float(_canyon[1]):
		return
	if clear.grow(6.0).has_point(mid):
		return
	var z := Vector3(n2.x, 0.0, n2.y)
	var x: Vector3 = Vector3.UP.cross(z).normalized()
	var xf := Transform3D(Basis(x, Vector3.UP, z), Vector3(mid.x, 0.0, mid.y) + z * 0.45)
	var cols: int = clampi(int(len / 15.0), 1, 3)
	var w: float = minf(len * 0.86 / cols, 17.0)
	var rows: int = 1 if h < 30.0 else 2
	var y: float = 4.9
	for r in rows:
		var hh: float = clampf(w * (0.55 if r == 0 else 0.8), 4.5, minf(13.0, h - y - 2.0))
		if hh < 3.5:
			break
		for k in cols:
			var cx: float = (float(k) - (cols - 1) * 0.5) * (len / cols)
			Heroes.screen_quad(_screens, xf, Vector3(cx, y, 0.0), w - 0.8, hh, int(seed * 1000.0) + k * 5 + r * 11)
		y += hh + 1.6


# ------------------------------------------------------------ landmarks

func _build_landmarks(marks: Array) -> void:
	var groups: Dictionary = {}    # "kind:variant" -> [Transform3D]
	var counts: Dictionary = {}
	var columns: Array[Vector2] = []
	var seen_fountains: Array[Vector2] = []
	for m: Variant in marks:
		var d: Dictionary = m
		var kind: String = str(d["kind"])
		var p: Vector2 = to_fight(Vector2(float(d["x"]), float(d["z"])))
		if p.length() > REACH:
			continue
		if (kind == "column" or kind == "obelisk" or kind == "monument") and float(d["h"]) >= 20.0:
			columns.append(p)
	for m: Variant in marks:
		var d: Dictionary = m
		var p: Vector2 = to_fight(Vector2(float(d["x"]), float(d["z"])))
		if p.length() > REACH:
			continue
		var kind: String = str(d["kind"])
		var nm: String = str(d.get("name", ""))
		var h: float = float(d["h"])
		var r: float = float(d.get("r", 0.0))
		if clear.has_point(p) and kind != "monument":
			continue
		var seed: float = _hash2(p)
		var yaw: float = seed * TAU
		var k2: String = ""
		var scale: float = 1.0
		var rad: float = 2.0
		match kind:
			"column", "obelisk", "monument":
				if h >= 20.0:
					k2 = "obelisk" if kind == "obelisk" else "column"
					scale = h / float(Landmarks.info(k2).get("h", 50.0))
					rad = h * 0.1
					yaw = atan2(-p.x, -p.y) + PI   # its face (+z) towards the fight
				elif kind == "obelisk":
					k2 = "obelisk"
					scale = clampf(h / float(Landmarks.info("obelisk").get("h", 20.0)), 0.3, 2.0)
					rad = 1.5 * scale
				elif r > 3.0:
					# a monument's platform (its steps), clear of the fight
					if not Rect2(p - Vector2(r, r) * 0.45, Vector2(r, r) * 0.9).intersects(clear):
						_steps(p, r * 0.9)
					counts["platform"] = int(counts.get("platform", 0)) + 1
					continue
				elif nm.contains("Arch") or nm.contains("Gate"):
					k2 = "arch"   # day1-world: a monument named an arch or a gate
					scale = clampf(maxf(h, 10.0) / float(Landmarks.info("arch").get("h", 16.0)), 0.6, 1.5)
					rad = 8.5 * scale
					yaw = atan2(-p.x, -p.y) + PI
				elif nm.contains("Memorial") or nm.contains("Cenotaph") or nm.contains("memorial"):
					k2 = "memorial"
					scale = clampf(maxf(h, 8.0) / float(Landmarks.info("memorial").get("h", 10.0)), 0.6, 1.6)
					rad = 2.5 * scale
				else:
					k2 = "statue"
			"statue":
				k2 = "statue"
				if nm.to_lower() == "lion":
					k2 = "lion"
				elif nm.contains("Memorial") or nm.contains("memorial"):
					k2 = "memorial"
			"fountain":
				var dup: bool = false
				for f: Vector2 in seen_fountains:
					if f.distance_to(p) < 6.0:
						dup = true
				if dup:
					continue
				seen_fountains.append(p)
				k2 = "fountain"
				var rr: float = r if r > 0.5 else 1.8
				scale = clampf(rr / float(Landmarks.info("fountain").get("r", 5.0)), 0.3, 1.6)
				rad = rr
			"arch", "gate", "dome", "spire":
				# day1-world: the generic pieces, by kind when the ground carries them
				k2 = "arch" if kind == "gate" else kind
				var ref: float = float(Landmarks.info(k2).get("h", 20.0))
				scale = clampf((h if h > 3.0 else ref) / ref, 0.5, 2.0)
				rad = float(Landmarks.info(k2).get("r", 6.0)) * scale
				yaw = atan2(-p.x, -p.y) + PI
			"clock":
				k2 = "clock_tower"
				scale = clampf(h / float(Landmarks.info("clock_tower").get("h", 40.0)), 0.4, 2.0)
				rad = 4.0 * scale
				yaw = atan2(-p.x, -p.y) + PI
			_:
				continue
		var variant: int = 0
		if k2 == "statue":
			variant = int(seed * 3.0) % 3
			scale = clampf(maxf(h, 4.0) / float(Landmarks.info("statue").get("h", 5.5)), 0.7, 2.0)
			yaw = atan2(-p.x, -p.y) + PI + (seed - 0.5) * 0.8
			rad = 1.6 * scale
		elif k2 == "lion":
			# Landseer's lions look out from the column
			var away: Vector2 = p
			var best: float = 1e9
			for c: Vector2 in columns:
				if c.distance_to(p) < best:
					best = c.distance_to(p)
					away = p - c
			if best < 30.0:
				yaw = atan2(away.x, away.y)
			scale = 1.0
			rad = 3.5
		var key: String = "%s:%d" % [k2, variant]
		if not groups.has(key):
			groups[key] = []
		(groups[key] as Array).append(Transform3D(Basis(Vector3.UP, yaw).scaled(Vector3.ONE * scale), Vector3(p.x, 0.0, p.y)))
		_landmark_pts.append([p, rad])
		bake.call("landmark", p, rad, h if k2 in ["column", "obelisk", "clock_tower"] else float(Landmarks.info(k2).get("h", 5.0)) * scale)
		counts[k2] = int(counts.get(k2, 0)) + 1
		if k2 == "fountain":
			var sp: Array = Landmarks.info("fountain").get("spray", [])
			var xf: Transform3D = (groups[key] as Array).back()
			var tips: Array = []
			for t: Variant in sp:
				tips.append(xf * (t as Vector3))
			var fl: Array = get_meta("fountains", [])
			fl.append([p, scale, tips])
			set_meta("fountains", fl)
	info["landmarks"] = counts
	for key: String in groups:
		var kv: PackedStringArray = key.split(":")
		var mesh: ArrayMesh = kit(kv[0], int(kv[1]))
		add_multi(mesh, groups[key], "landmark_" + key.replace(":", "_"), true)


## A stepped stone platform (a monument's base) `size` metres across.
func _steps(p: Vector2, size: float) -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var hgt: float = 0.0
	for i in 3:
		var s: float = size * (1.0 - i * 0.08)
		_bevel_box(st, Vector3(p.x, hgt, p.y), Vector3(s, 0.22, s), Color(0.92, 0.9, 0.86) * (1.0 - i * 0.03))
		hgt += 0.22
	var mesh: ArrayMesh = st.commit()
	mesh.surface_set_name(0, "granite")
	add_mesh(mesh, kit_mat("granite"), "platform")


static func _bevel_box(st: SurfaceTool, c: Vector3, size: Vector3, col: Color) -> void:
	var hx: float = size.x * 0.5
	var hz: float = size.z * 0.5
	var b: float = minf(0.06, size.y * 0.3)
	var y0: float = c.y
	var y1: float = c.y + size.y
	# top (inset by the bevel), the bevel ring, the sides
	var top: Array = [Vector3(-hx + b, y1, -hz + b), Vector3(hx - b, y1, -hz + b), Vector3(hx - b, y1, hz - b), Vector3(-hx + b, y1, hz - b)]
	var mid: Array = [Vector3(-hx, y1 - b, -hz), Vector3(hx, y1 - b, -hz), Vector3(hx, y1 - b, hz), Vector3(-hx, y1 - b, hz)]
	var bot: Array = [Vector3(-hx, y0, -hz), Vector3(hx, y0, -hz), Vector3(hx, y0, hz), Vector3(-hx, y0, hz)]
	var off := Vector3(c.x, 0.0, c.z)
	_quad(st, top[0] + off, top[3] + off, top[2] + off, top[1] + off, Vector3.UP, col)
	for i in 4:
		var j: int = (i + 1) % 4
		var nrm: Vector3 = ((mid[i] + mid[j]) * 0.5 * Vector3(1, 0, 1)).normalized()
		_quad(st, mid[i] + off, mid[j] + off, top[j] + off, top[i] + off, (nrm + Vector3.UP).normalized(), col * 1.04)
		_quad(st, bot[i] + off, bot[j] + off, mid[j] + off, mid[i] + off, nrm, col * 0.9)


static func _quad(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, d: Vector3, n: Vector3, col: Color) -> void:
	# wound so the face looks along n
	var cr: Vector3 = (b - a).cross(c - a)
	var order: Array = [a, b, c, a, c, d] if cr.dot(n) < 0.0 else [a, c, b, a, d, c]
	for v: Vector3 in order:
		st.set_color(Color(col.r, col.g, col.b, 0.0))
		st.set_normal(n)
		st.add_vertex(v)
