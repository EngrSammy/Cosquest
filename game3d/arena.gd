extends Node3D
## The fight's place (cq 233): a dusk street plaza like the reference. Paving, the carved
## medallion at the centre, pink and gold circuit lines running down the street, shop
## fronts either side (Kenney City Kit, CC0), street lamps with warm light pools,
## planters and benches. All art is CC0 (docs/game3d/LICENSES.md). cfg "arena": "plain"
## gives G0's flat plate (no kit models) for a cheap run.

const T_PAVERS := preload("res://art/street/street_pavers.png")
const T_MEDALLION := preload("res://art/street/medallion.png")
const T_CIRCUIT := preload("res://art/street/circuit_run.png")
const T_POOL := preload("res://art/street/light_pool.png")
const FACADE_SHADER := preload("res://vfx/facade.gdshader")
const PlaceScript := preload("res://place.gd")
const StreetLayout := preload("res://street_layout.gd")
const T_NEON := preload("res://art/street/neon_atlas.png")     # 6 signs stacked, self-drawn
const T_SHOP := preload("res://art/street/shop_glow.png")
const T_LAMP := preload("res://art/street/lamp_glow.png")
const T_CONE := preload("res://art/street/lamp_cone.png")
const NEON_SIGNS: int = 6

const BUILDINGS: Array[String] = ["building-a", "building-b", "building-c", "building-d", "building-e",
	"building-f", "building-g", "building-h", "building-k", "building-l"]
const STREET_HALF: float = 5.6       # kerb to kerb half width (fight.gd clamps at 4.7 m)
const SHOP_W: float = 7.0
const NEAR_FADE: Vector2 = Vector2(13.0, 15.5)   # lamps fade out nearer the camera than this (m)
const MERGE_CHUNK: float = 12.0      # metres of street per merged mesh (culling)
## cq 016 composition: the street runs on past the fight to a lit cross street (zebra crossings,
## traffic lights, parked and passing cars), then on again between lower-detail blocks.
const CROSS_Z: Vector2 = Vector2(-18.0, -28.0)   # the cross street's near and far kerb (z, m)
const STREET_END: float = -64.0
const FAR_Z: float = -40.0                       # beyond this the blocks are the kit's low-detail ones
const FAR_BUILDINGS: Array[String] = ["commercial/low-detail-building-a", "commercial/low-detail-building-b",
	"commercial/low-detail-building-c", "commercial/low-detail-building-d", "commercial/low-detail-building-e",
	"commercial/low-detail-building-f"]
const CARS: Array[String] = ["cars/sedan", "cars/taxi", "cars/van", "cars/suv", "cars/hatchback-sports", "cars/delivery", "cars/police"]

var ground: MeshInstance3D
var plaza: MeshInstance3D
var _dressing: Node3D
var _scenes: Dictionary = {}
var map_blocks: Array[Rect2] = []   # building footprints (x, z in metres) for the minimap


## The look (cq 015, docs/game3d/LOOK.md): every piece can be switched off from the fight
## config ("look": {"sky": false, ...}) to measure what it costs.
const LOOK_DEFAULTS: Dictionary = {
	"sky": true,        # dusk sky ambient (cool above, lilac horizon, warm bounce below), not flat grey;
	                    # true: a flat sky-up ambient + the hemisphere term in the fighter and facade
	                    # shaders (ALU only); "cube": Godot's sky radiance (two cubemap reads a pixel)
	"fog": true,        # env-fixes 1: depth fog tinted to the sky's horizon from FOG_BEGIN (60 m) out,
	                    # so the far city fades into the sky (aerial perspective) and the world never
	                    # ends in a hard edge. Per pixel in the scene shader (~3 % on the software GPU)
	"glow": false,      # Godot glow (post pass): bloom on what is brighter than white. Off: see below
	"grade": false,     # BCS + a split-tone LUT (post pass). Off: see below
	"rim": true,        # the fighters' key-side rim light (in their own pass, fighter.gd)
	"ao": true,         # soft dark where the shop walls meet the paving
	"halos": true,      # soft coloured halos round signs and lamp heads (bloom faked on the light)
	"shadows": "auto",  # real directional shadows (the blob shadows are always on). look-world: "auto" = on
	                    # for the device quality profile (the art direction: fighters + near props cast, 35 m,
	                    # 1 split), off on a software GPU (+58 % there); true/false force it
	"tonemap": "aces",  # aces | filmic | agx (all in the scene shader, no extra pass)
	"bloom": true,      # cq 016: the cheap bloom (bloom.gd): lit street + effects only, from a tiny
	                    # view, added back at the 3D resolution; ~5 % of the frame on the software GPU
	"post": false,      # cq 016: the full post stack for a real device: Godot glow + the grade
	                    # (turns "glow" and "grade" on; the cheap bloom then steps aside)
	"time": "auto",     # look-world (art direction "Sunlit Real Places"): "golden" | "day" | "dusk" | "night"
	                    # (TIMES), or "auto": the player's local clock (time_of_day: golden from 08:00 to an
	                    # hour before sunset, dusk round sunset, night after; night falls back to dusk)
	"sky_draw": true,   # env-fixes 1: draw the sky shader as the background (false: the old flat colour)
	"street": "place",  # look-world: the default street is built by place.gd from a laid-out ground (the same
	                    # roads, facades, props and light as the real places); "kit" keeps the cq 016 Kenney street
}
# "glow" and "grade" each turn on the Compatibility renderer's post pass, which runs over the
# whole screen at full resolution: on the 1-thread software GPU it doubled the frame (LOOK.md).
# Instead the lamps, signs and windows carry their own halo cards (the effects do the same), and
# the grade is in the light and material colours. Turn them on for a device that can pay.
## The key light: a low warm evening sun from up the street on the left (the reference's
## haze sits top left), so the fighters are side-lit and the street's right walls catch it.
## env-fixes 2 (cq 020 audit issue 3): a stronger key over a weaker, less blue ambient, so things
## have a lit side and a shadow side (was energy 1.35 over a 0.85 blue-lilac ambient).
const KEY_ROT: Vector3 = Vector3(-34.0, -128.0, 0.0)
const KEY_COLOR: Color = Color(1.0, 0.84, 0.68)
const KEY_ENERGY: float = 1.9
## The dusk sky that lights the shade (look "sky"): straight up, at the horizon, and the bounce
## off the warm paving from below. The paving faces up, so it gets SKY_UP; the walls and the
## fighters add the rest of the gradient in their shaders (hemi_* uniforms).
## env-fixes 2: ambient 0.85 -> 0.45 and much less blue (was (0.6, 0.66, 1.0)): cool shade, real darks.
const SKY_UP: Color = Color(0.7, 0.74, 0.9)
const SKY_HORIZON: Color = Color(0.82, 0.76, 0.78)
const SKY_GROUND: Color = Color(0.66, 0.54, 0.46)
const SKY_ENERGY: float = 0.45
## Dusk depth: up the street (beyond the fight) the paving and the shop fronts cool towards the
## blue-violet dusk, so the warm lamps and signs stand out there as on the reference. Baked into the
## ground's vertex colours and a term in facade.gdshader; no extra pass.
const DUSK_COL: Color = Color(0.6, 0.64, 0.9)
const DUSK_Z: Vector2 = Vector2(-4.0, -24.0)   # starts cooling at z -4, full at z -24

## env-fixes 1 (audit issues 1, 2): the drawn sky, the fog that ties the far city into it, and the
## ground out to the horizon. Two presets, chosen by look "time" ("dusk", the default, or "day").
## `fog` is the colour of the horizon band in the sky AND the depth fog, so far buildings and the
## ground ring melt into the sky with no seam. All in the scene and sky shaders: no post pass.
const SKY_SHADER := preload("res://vfx/sky.gdshader")
## look-world: the art direction's presets (cosquest-review/art-direction tokens.json world.time.*), exactly:
## sky, fog, key (colour, energy, elevation), ambient, the shade and contact-AO colours the bakes multiply in,
## the lit windows (emission, colour), tonemap exposure, the cheap bloom, and the halo cards' scale and clamp.
## "golden" is the default by day; "dusk" keeps Mark's reference for the hour round sunset; "night" (later in
## the art direction) is defined but falls back to dusk in the clock rule.
const TIMES: Dictionary = {
	"golden": {"zenith": Color(0.227, 0.435, 0.769), "upper": Color(0.525, 0.682, 0.878),
		"horizon": Color(0.949, 0.867, 0.761), "horizon_sun": Color(1.0, 0.796, 0.557), "fog": Color(0.894, 0.835, 0.769),
		"sun_glow": 0.55, "key_color": Color(1.0, 0.867, 0.69), "key_energy": 2.2, "key_elev": 38.0,
		"ambient": Color(0.722, 0.776, 0.863), "ambient_energy": 0.38,
		"shade": Color(0.49, 0.525, 0.659), "ao": Color(0.42, 0.416, 0.478), "ao_alpha": 0.55,
		"windows": 0.15, "window_col": Color(1.0, 0.851, 0.627), "exposure": 1.0, "fog_curve": 1.6, "fog_scatter": 0.35,
		"bloom": [0.5, 0.62, 0.28], "halo_scale": 0.6, "halo_max": 0.55, "lamps": 0.0},
	"day": {"zenith": Color(0.243, 0.498, 0.839), "upper": Color(0.498, 0.698, 0.918),
		"horizon": Color(0.863, 0.91, 0.949), "horizon_sun": Color(1.0, 0.937, 0.824), "fog": Color(0.812, 0.863, 0.902),
		"sun_glow": 0.35, "key_color": Color(1.0, 0.949, 0.871), "key_energy": 2.4, "key_elev": 55.0,
		"ambient": Color(0.737, 0.796, 0.878), "ambient_energy": 0.42,
		"shade": Color(0.541, 0.576, 0.69), "ao": Color(0.42, 0.416, 0.478), "ao_alpha": 0.55,
		"windows": 0.08, "window_col": Color(1.0, 0.851, 0.627), "exposure": 1.0, "fog_curve": 1.6, "fog_scatter": 0.35,
		"bloom": [0.4, 0.7, 0.25], "halo_scale": 0.0, "halo_max": 0.0, "lamps": 0.0},
	"dusk": {"zenith": Color(0.122, 0.169, 0.369), "upper": Color(0.337, 0.376, 0.62),
		"horizon": Color(0.941, 0.643, 0.494), "horizon_sun": Color(1.0, 0.69, 0.4), "fog": Color(0.812, 0.635, 0.596),
		"sun_glow": 0.7, "key_color": Color(1.0, 0.71, 0.494), "key_energy": 1.6, "key_elev": 14.0,
		"ambient": Color(0.557, 0.58, 0.761), "ambient_energy": 0.4,
		"shade": Color(0.369, 0.392, 0.58), "ao": Color(0.306, 0.298, 0.416), "ao_alpha": 0.6,
		"windows": 1.0, "window_col": Color(1.0, 0.761, 0.478), "exposure": 1.05, "fog_curve": 1.6, "fog_scatter": 0.5,
		"bloom": [0.8, 0.45, 0.35], "halo_scale": 0.6, "halo_max": 0.55, "lamps": 1.0},
	"night": {"zenith": Color(0.043, 0.075, 0.188), "upper": Color(0.106, 0.149, 0.314),
		"horizon": Color(0.227, 0.247, 0.431), "horizon_sun": Color(0.29, 0.29, 0.478), "fog": Color(0.165, 0.184, 0.333),
		"sun_glow": 0.2, "key_color": Color(0.663, 0.722, 0.91), "key_energy": 0.5, "key_elev": 40.0,
		"ambient": Color(0.227, 0.267, 0.439), "ambient_energy": 0.35,
		"shade": Color(0.369, 0.392, 0.58), "ao": Color(0.306, 0.298, 0.416), "ao_alpha": 0.6,
		"windows": 1.0, "window_col": Color(1.0, 0.761, 0.478), "exposure": 1.05, "fog_curve": 1.6, "fog_scatter": 0.5,
		"bloom": [0.8, 0.45, 0.35], "halo_scale": 0.6, "halo_max": 0.55, "lamps": 1.0},
}
const KEY_YAW: float = -128.0   # the sun's heading (KEY_ROT's yaw); its elevation comes from the preset
static var _key_elev: float = 38.0
static var _halo_scale: float = 0.6
static var _halo_max: float = 0.55
const FOG_BEGIN: float = 60.0       # m from the camera: never on the fighters (the fight camera is ~21 m off)
const FOG_END_STREET: float = 220.0
const FOG_END_PLACE: float = 320.0  # the place is built out to place.gd REACH (260 m)
const GROUND_HALF: float = 320.0    # the paved floor, both arenas
const HORIZON_HALF: float = 2400.0  # the ground ring out to the horizon (fogged out long before)

var look: Dictionary = {}
var sun: DirectionalLight3D
var env: Environment


static func look_opts(cfg: Dictionary) -> Dictionary:
	var out: Dictionary = LOOK_DEFAULTS.duplicate()
	var l: Variant = cfg.get("look", {})
	if l is Dictionary:
		for k: String in (l as Dictionary):
			out[k] = l[k]
	if cfg.has("shadows"):
		out["shadows"] = bool(cfg["shadows"])
	if cfg.has("fog"):
		out["fog"] = bool(cfg["fog"])
	if bool(out.get("post", false)):
		out["glow"] = true
		out["grade"] = true
	if str(out.get("time", "auto")) == "auto" or not TIMES.has(str(out["time"])):
		var ll: Vector2 = Vector2(float(cfg.get("_lat", 51.5)), float(cfg.get("_lng", -0.13)))
		out["time"] = time_of_day(ll.x, ll.y, cfg.get("clock_hour", null))
	if str(out["time"]) == "night":
		out["time"] = "dusk"   # the art direction: night is defined but not shipped in v1
	var tp: Dictionary = TIMES[str(out["time"])]
	# the cheap bloom per preset (tokens world.time.*.bloom) unless the config sets it
	for i in 3:
		var k: String = ["bloom_strength", "bloom_threshold", "bloom_cap"][i]
		if not out.has(k):
			out[k] = (tp["bloom"] as Array)[i]
	return out


## look-world: the art direction's clock rule (tokens.json time_rule) at a place (lat, lng), on the device's
## local clock: golden from sunrise (08:00 in the rule; earlier morning light is golden too) to an hour before
## sunset, dusk from then to half an hour after sunset, night after (shipped as dusk). `hour` (a float, the
## config's "clock_hour") replaces the clock for tests.
static func time_of_day(lat: float, lng: float, hour: Variant = null) -> String:
	var now: Dictionary = Time.get_datetime_dict_from_system()
	var h: float = float(now["hour"]) + float(now["minute"]) / 60.0
	if hour != null:
		h = float(hour)
	var doy: int = int(Time.get_unix_time_from_datetime_dict({"year": now["year"], "month": now["month"], "day": now["day"]}) / 86400.0) \
		- int(Time.get_unix_time_from_datetime_dict({"year": now["year"], "month": 1, "day": 1}) / 86400.0) + 1
	var bias_h: float = float(Time.get_time_zone_from_system().get("bias", 0)) / 60.0
	var sun: Vector2 = sun_times_utc(lat, lng, doy)
	var rise: float = fposmod(sun.x + bias_h, 24.0)
	var sset: float = fposmod(sun.y + bias_h, 24.0)
	if h >= rise and h < sset - 1.0:
		return "golden"
	if h >= sset - 1.0 and h < sset + 0.5:
		return "dusk"
	return "night"


## Sunrise and sunset in UTC hours for a day of the year (NOAA's approximate equations, a minute or two).
static func sun_times_utc(lat: float, lng: float, doy: int) -> Vector2:
	var g: float = TAU / 365.0 * float(doy - 1)
	var eqt: float = 229.18 * (0.000075 + 0.001868 * cos(g) - 0.032077 * sin(g) - 0.014615 * cos(2.0 * g) - 0.040849 * sin(2.0 * g))
	var decl: float = 0.006918 - 0.399912 * cos(g) + 0.070257 * sin(g) - 0.006758 * cos(2.0 * g) + 0.000907 * sin(2.0 * g) \
		- 0.002697 * cos(3.0 * g) + 0.00148 * sin(3.0 * g)
	var la: float = deg_to_rad(clampf(lat, -89.0, 89.0))
	var c: float = cos(deg_to_rad(90.833)) / (cos(la) * cos(decl)) - tan(la) * tan(decl)
	var ha: float = rad_to_deg(acos(clampf(c, -1.0, 1.0)))
	return Vector2((720.0 - 4.0 * (lng + ha) - eqt) / 60.0, (720.0 - 4.0 * (lng - ha) - eqt) / 60.0)


## The hemisphere ambient's extra over the flat sky-up ambient, for a shader with hemi_* uniforms
## (char_lit, facade). Zero when the look's sky is off or the real sky cube is used.
static func set_hemi(sm: ShaderMaterial, l: Dictionary) -> void:
	var on: bool = str(l.get("sky", true)) == "true"
	var t: Dictionary = time_preset(l)
	sm.set_shader_parameter("hemi_up", t["ambient"])
	sm.set_shader_parameter("hemi_horizon", SKY_HORIZON)
	sm.set_shader_parameter("hemi_ground", SKY_GROUND)
	sm.set_shader_parameter("hemi_energy", float(t["ambient_energy"]) if on else 0.0)
	sm.set_shader_parameter("windows_k_mul", float(t["windows"]))   # the lit windows (facade shaders)


## The look's time-of-day preset (TIMES), "dusk" unless the look says "day".
static func time_preset(l: Dictionary) -> Dictionary:
	return TIMES.get(str(l.get("time", "golden")), TIMES["golden"])


## The direction the key light travels (world space), for the fighters' rim. look-world: the elevation is
## the time preset's (build sets it before the fighters spawn); the heading stays KEY_YAW.
static func key_dir() -> Vector3:
	return Basis.from_euler(Vector3(-_key_elev, KEY_YAW, 0.0) * (PI / 180.0)) * Vector3(0, 0, -1)


func build(cfg: Dictionary) -> void:
	var place_mode: bool = str(cfg.get("arena", "street")) == "place"
	# look-world: the place's ground is read first, so the clock rule knows where on Earth the fight is
	if place_mode:
		_ground_doc = _read_ground(cfg)
		if not _ground_doc.is_empty():
			var o: Dictionary = _ground_doc.get("origin", {})
			if o.has("lat"):
				cfg["_lat"] = float(o["lat"])
				cfg["_lng"] = float(o["lng"])
	look = look_opts(cfg)
	var tp: Dictionary = time_preset(look)
	_key_elev = float(tp["key_elev"])
	_halo_scale = float(tp["halo_scale"])
	_halo_max = float(tp["halo_max"])
	if str(look.get("shadows", false)) == "auto":
		look["shadows"] = str(cfg.get("_quality", "low")) == "device"
	print("CQ look time=%s key_elev=%.0f shadows=%s street=%s" % [look["time"], _key_elev, str(look["shadows"]), str(look.get("street", "place"))])
	env = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = tp["fog"]
	if str(look["sky"]) == "true":
		env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
		env.ambient_light_color = tp["ambient"]
		env.ambient_light_energy = float(tp["ambient_energy"])
	elif str(look["sky"]) == "cube":
		# ambient from a sky (never seen: the camera looks down): surfaces facing up get the
		# blue-violet dusk sky, walls the warm horizon, undersides the warm paving's bounce.
		# A 32 px radiance map, filtered once at load; one cubemap read per pixel.
		var psm := ProceduralSkyMaterial.new()
		psm.sky_top_color = Color(0.46, 0.56, 1.0)
		psm.sky_horizon_color = Color(0.78, 0.74, 0.92)
		psm.sky_curve = 0.12
		psm.ground_horizon_color = Color(0.82, 0.68, 0.72)
		psm.ground_bottom_color = Color(0.55, 0.44, 0.48)
		psm.ground_curve = 0.06
		psm.sun_angle_max = 40.0
		psm.sun_curve = 0.2
		var csky := Sky.new()
		csky.sky_material = psm
		csky.radiance_size = Sky.RADIANCE_SIZE_32
		csky.process_mode = Sky.PROCESS_MODE_QUALITY
		env.sky = csky
		env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
		env.ambient_light_sky_contribution = 1.0
		env.ambient_light_energy = float(tp["ambient_energy"])
		env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	else:
		env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
		env.ambient_light_color = Color(0.62, 0.64, 0.92)
		env.ambient_light_energy = 0.66
	# env-fixes 1: the sky, drawn (it was a flat colour). A gradient sky shader, ALU only, one pass
	# over the background pixels; nothing lights from it (ambient stays the flat colour above, no
	# radiance map, no reflections), so it costs what the clear did plus a few ALU per sky pixel.
	if bool(look.get("sky_draw", true)) and str(look["sky"]) != "cube":
		var ssm := ShaderMaterial.new()
		ssm.shader = SKY_SHADER
		for k: String in ["zenith", "upper", "horizon", "horizon_sun", "fog", "sun_glow"]:
			ssm.set_shader_parameter(k, tp[k])
		ssm.set_shader_parameter("sun_dir", -key_dir())
		var dsky := Sky.new()
		dsky.sky_material = ssm
		dsky.radiance_size = Sky.RADIANCE_SIZE_32
		dsky.process_mode = Sky.PROCESS_MODE_QUALITY
		env.sky = dsky
		env.background_mode = Environment.BG_SKY
		env.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	env.tonemap_mode = {"filmic": Environment.TONE_MAPPER_FILMIC, "agx": Environment.TONE_MAPPER_AGX}.get(str(look["tonemap"]), Environment.TONE_MAPPER_ACES)
	env.tonemap_exposure = float(tp["exposure"])
	env.tonemap_white = 6.0
	env.fog_enabled = bool(look["fog"])
	if env.fog_enabled:
		# env-fixes 1: aerial perspective. Depth fog in the sky's horizon colour: none within
		# FOG_BEGIN (60 m, or further for a far review camera, so never on the fighters), the far
		# city fading into the sky's horizon band, fully fogged before the camera's far plane, so
		# the place never ends in an edge. (Was a uniform lilac haze from 21 m, off by default.)
		env.fog_mode = Environment.FOG_MODE_DEPTH
		env.fog_light_color = tp["fog"]
		env.fog_light_energy = 1.0
		env.fog_sun_scatter = float(tp["fog_scatter"])   # look-world: the art direction's sun scatter
		env.fog_density = 1.0
		env.fog_depth_begin = maxf(FOG_BEGIN, float(cfg.get("cam_dist", 21.0)) + 25.0)
		env.fog_depth_end = FOG_END_PLACE if place_mode else FOG_END_STREET
		env.fog_depth_curve = float(tp["fog_curve"])
		env.fog_sky_affect = 0.0       # the sky draws its own horizon band in the fog colour
	if bool(look["glow"]):
		# bloom only on what is brighter than white (lit windows, neon, lamp heads); the
		# effects peak near white and keep their own glow (EFFECTS.md), so the threshold
		# sits above them
		env.glow_enabled = true
		env.glow_normalized = false
		env.glow_intensity = 0.9
		env.glow_strength = 1.0
		env.glow_bloom = 0.0
		env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SCREEN
		env.glow_hdr_threshold = 1.15
		env.glow_hdr_scale = 2.0
		for i in 7:
			env.set_glow_level(i, 0.0)
		env.set_glow_level(1, 0.6)
		env.set_glow_level(2, 1.0)
		env.set_glow_level(3, 0.7)
	if bool(look["grade"]):
		# a warm evening grade: a touch more contrast and colour, and a split-tone curve
		# (violet shadows, gold highlights) as a 256 px colour-correction ramp
		env.adjustment_enabled = true
		env.adjustment_brightness = 1.0
		env.adjustment_contrast = 1.04
		env.adjustment_saturation = 0.9
		env.adjustment_color_correction = _grade_ramp()
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	sun = DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-_key_elev, KEY_YAW, 0.0)
	sun.light_energy = float(tp["key_energy"])
	sun.light_color = tp["key_color"]
	sun.shadow_enabled = str(look["shadows"]) == "true"
	if sun.shadow_enabled:
		# the fighters only (the street casts nothing): one orthogonal split close in
		sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
		sun.directional_shadow_max_distance = 35.0    # look-world: tokens world.time.*.shadow
		sun.shadow_blur = 2.0
		sun.shadow_opacity = 0.5 if str(look["time"]) == "dusk" else 0.65
	add_child(sun)
	# no second (fill) light: each directional light is shaded on every pixel, ~2 ms a frame
	# on the software GPU; the sky ambient is the fill
	# the street floor, paved
	ground = MeshInstance3D.new()
	var pm := PlaneMesh.new()
	# env-fixes 1: the paved floor reaches the fog in the street too (was 160 m: a hard edge to the
	# background in low and wide views), the same paver size (4 m a tile)
	pm.size = Vector2(GROUND_HALF * 2.0, GROUND_HALF * 2.0)
	ground.mesh = pm
	var gm := StandardMaterial3D.new()
	gm.albedo_texture = T_PAVERS
	gm.uv1_scale = Vector3(GROUND_HALF * 0.5, GROUND_HALF * 0.5, 1)
	# env-fixes 2: a neutral grey (the key warms it), not pink-lilac (was (0.66, 0.63, 0.69))
	gm.albedo_color = Color(0.68, 0.67, 0.66)
	gm.roughness = 0.95
	# plain trilinear: anisotropic filtering costs ~1.7 ms a frame on a software GPU
	gm.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	ground.material_override = gm
	add_child(ground)
	_build_horizon(gm.albedo_color)
	# the medallion at the centre: where the fight stands
	plaza = MeshInstance3D.new()
	var mq := PlaneMesh.new()
	mq.size = Vector2(7.2, 7.2)
	plaza.mesh = mq
	var mm := StandardMaterial3D.new()
	mm.albedo_texture = T_MEDALLION
	mm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR
	mm.alpha_scissor_threshold = 0.5
	mm.albedo_color = Color(0.96, 0.92, 0.86)   # look-world: plaza stone, not pink (art direction 2.2)
	mm.roughness = 0.9
	plaza.material_override = mm
	plaza.position.y = 0.02
	add_child(plaza)
	if place_mode and not bool(cfg.get("place_medallion", false)):
		# env-fixes 4 (audit issue 9): in a real place the 7.2 m Greek-key disc read as a sticker on
		# the map; a thin, faint ring in the faction's colour marks the fight instead
		(plaza.mesh as PlaneMesh).size = Vector2(RING_SIZE, RING_SIZE)
		plaza.material_override = _faction_ring_mat(cfg)
	# circuit lines down the street, towards the camera, as on the reference
	var cm := StandardMaterial3D.new()
	cm.albedo_texture = T_CIRCUIT
	cm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	cm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	cm.albedo_color = Color(1, 1, 1, 0.9)
	cm.disable_receive_shadows = true
	# cq 019: no street neon in a real place; look-world: on the street only at dusk (neon is not daylight)
	for i in (0 if place_mode or (str(look.get("street", "place")) == "place" and str(look["time"]) != "dusk") else 2):
		var c := MeshInstance3D.new()
		var cq := PlaneMesh.new()
		cq.size = Vector2(2.4, 9.6)
		c.mesh = cq
		c.material_override = cm
		c.position = Vector3(0.6 + i * 0.2, 0.03, 9.6 + i * 9.6)
		c.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(c)
	if str(cfg.get("arena", "street")) == "plain":
		return
	# cq 019: the real place round the Quest Point (OpenStreetMap ground), else the street
	if place_mode and not _ground_doc.is_empty():
		_build_place(cfg, _ground_doc)
		return
	# look-world: the default street is laid out as a ground document (StreetLayout) and built by place.gd
	# like any real place, so the street and the places share one kit, one light and one material set
	if str(look.get("street", "place")) == "place":
		_build_place(cfg, StreetLayout.ground(), Vector2.ZERO, 0.0)
		street_place = place
		place = null    # fight.gd: the street keeps the street camera and has no fly-in
		return
	_dressing = Node3D.new()
	_dressing.name = "Street"
	add_child(_dressing)
	for k in 2:
		var st := SurfaceTool.new()
		st.begin(Mesh.PRIMITIVE_TRIANGLES)
		_neon_st.append(st)
		var st2 := SurfaceTool.new()
		st2.begin(Mesh.PRIMITIVE_TRIANGLES)
		_shop_st.append(st2)
	_cones_st = SurfaceTool.new()
	_cones_st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_halo_st = SurfaceTool.new()
	_halo_st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_shade_st = SurfaceTool.new()
	_shade_st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_build_street()
	# the low sun's glare up the street, as on the reference (its bloom): one big warm pool on the
	# far paving, in the halo mesh, so no extra draw
	if bool(look.get("halos", true)):
		_halo_st.set_color(Color(1.0 / HALO_GAIN, 0.74 / HALO_GAIN, 0.48 / HALO_GAIN, _halo_alpha(0.85)))
		_ground_quad(_halo_st, SUN_GLARE, 12.0, 18.0, Rect2(0, 0, 1, 1))
	if bool(look["ao"]):
		_bake_ground()
	_commit_glows()
	if bool(cfg.get("merge_street", true)):
		_merge_dressing()


var place: Node3D   # the real place (cq 019), when the fight has one
var street_place: Node3D   # look-world: the default street, built by place.gd from StreetLayout


## The real place round the fight (place.gd, docs/game3d/PLACE.md) from `ground_json` (the game server's
## /v1/map/ground answer, or the Overpass tool's), with the Quest Point at `place_at` [x, z] metres from
## its origin. Empty (and the street is built instead) when the file is missing or unreadable.
var _ground_doc: Dictionary = {}


func _read_ground(cfg: Dictionary) -> Dictionary:
	var path: String = str(cfg.get("ground_json", ""))
	if path == "" or not FileAccess.file_exists(path):
		print("CQ place none path=%s" % path)
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not (parsed is Dictionary) or not (parsed as Dictionary).has("buildings"):
		print("CQ place unreadable path=%s" % path)
		return {}
	return parsed


## Builds `doc` with place.gd round `at` (default: the config's place_at). yaw_override: degrees (the street
## passes 0: its layout is already in the fight's frame), else the place turns to its landmark.
func _build_place(cfg: Dictionary, doc: Dictionary, at_override: Variant = null, yaw_override: float = NAN) -> void:
	var at: Vector2 = Vector2.ZERO
	var at_raw: Variant = cfg.get("place_at", [0.0, 0.0])
	if at_override is Vector2:
		at = at_override
	elif at_raw is Array and (at_raw as Array).size() == 2:
		at = Vector2(float(at_raw[0]), float(at_raw[1]))
	if is_nan(yaw_override):
		yaw_override = float(cfg.get("place_yaw", NAN))
	place = PlaceScript.new()
	place.name = "Place"
	place.set("quality", str(cfg.get("_quality", "low")))
	# day1-world: the heavy part of the build runs on a worker while the fighters load (place.gd begin);
	# the place joins the tree when pump_place() has attached it. place_thread: false builds it here.
	var threaded: bool = bool(cfg.get("place_thread", true))
	place.call("begin", doc, at, float(cfg.get("cam_yaw", 12.0)), yaw_override, look, Callable(self, "set_hemi"), threaded)
	_pending_place = place
	if not threaded:
		pump_place(INF)


var _pending_place: Node3D


## Finishes the place now (waits for the worker if it is still running, attaches what is left): the
## fight calls it on the frame it begins. info.begin_wait_ms is that frame's cost.
func finish_place() -> void:
	if _pending_place == null:
		return
	var t0: int = Time.get_ticks_usec()
	var pl: Node3D = _pending_place
	pump_place(INF)
	(pl.get("info") as Dictionary)["begin_wait_ms"] = snappedf((Time.get_ticks_usec() - t0) / 1000.0, 0.1)
	print("CQ place begin_wait_ms=%.1f" % ((Time.get_ticks_usec() - t0) / 1000.0))


## True once the place (or the street) is built and in the tree. Called by the fight every frame while it
## loads; each call spends at most budget_ms of the main thread on it.
func pump_place(budget_ms: float = 4.0) -> bool:
	if _pending_place == null:
		return true
	var t0: int = Time.get_ticks_usec()
	if _pending_place.get_parent() == null and bool(_pending_place.call("work_done")):
		add_child(_pending_place)   # empty yet: its nodes join it a few a frame (place.gd pump)
	var add_ms: float = (Time.get_ticks_usec() - t0) / 1000.0
	if not bool(_pending_place.call("pump", budget_ms)):
		return false
	var pl: Node3D = _pending_place
	_pending_place = null
	t0 = Time.get_ticks_usec()
	if pl.get_parent() == null:
		add_child(pl)
	for r: Rect2 in pl.get("map_blocks"):
		map_blocks.append(r)
	# the place lays its own ground (land use, roads, the bake): the arena's plain floor steps aside, and
	# the horizon ring takes the place's floor colour
	ground.visible = false
	var hz: Node = get_node_or_null("Horizon")
	if hz != null:
		((hz as MeshInstance3D).material_override as StandardMaterial3D).albedo_color = pl.call("floor_color")
	var info: Dictionary = pl.get("info")
	add_ms += (Time.get_ticks_usec() - t0) / 1000.0
	info["main_ms"] = snappedf(float(info.get("main_ms", 0.0)) + add_ms, 0.1)
	info["main_max_ms"] = snappedf(maxf(float(info.get("main_max_ms", 0.0)), add_ms), 0.1)
	info["tree_add_ms"] = snappedf(add_ms, 0.1)
	print("CQ place " + JSON.stringify(info))
	return true


## The grade's colour curve, per channel (input level -> output level). env-fixes 2: warm lights,
## cool shadows and real darks (the toe pulled down, the shadows a cool slate, not violet). Only used
## with the post pass on ("grade" / "post", a device knob); the default look carries the same split in
## its light colours (warm key, cool ambient).
static func _grade_ramp() -> GradientTexture1D:
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.2, 0.5, 0.78, 1.0])
	g.colors = PackedColorArray([Color(0.02, 0.025, 0.045), Color(0.17, 0.19, 0.23), Color(0.5, 0.495, 0.48),
		Color(0.82, 0.78, 0.7), Color(1.0, 0.97, 0.9)])
	g.interpolation_mode = Gradient.GRADIENT_INTERPOLATE_CUBIC
	var t := GradientTexture1D.new()
	t.gradient = g
	t.width = 256
	return t


## env-fixes 1: the ground out to the horizon round the paved floor: a square ring from the floor's
## edge (GROUND_HALF) to HORIZON_HALF, flat, in the paving's colour. The fog has taken it long before its
## far edge, so the ground meets the sky's horizon band with no visible end. 8 triangles, no texture.
func _build_horizon(col: Color) -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var a: float = GROUND_HALF - 0.5     # a little under the floor's edge: no crack between them
	var b: float = HORIZON_HALF
	# four strips: north and south full width, east and west between them
	var rects: Array[Rect2] = [Rect2(-b, -b, 2.0 * b, b - a), Rect2(-b, a, 2.0 * b, b - a),
		Rect2(-b, -a, b - a, 2.0 * a), Rect2(a, -a, b - a, 2.0 * a)]
	for r: Rect2 in rects:
		var q: Array[Vector3] = [Vector3(r.position.x, -0.01, r.position.y), Vector3(r.end.x, -0.01, r.position.y),
			Vector3(r.end.x, -0.01, r.end.y), Vector3(r.position.x, -0.01, r.end.y)]
		for k: int in [0, 1, 2, 0, 2, 3]:
			st.set_normal(Vector3.UP)
			st.add_vertex(q[k])
	var m := StandardMaterial3D.new()
	# the paving texture's average under the floor's tint (the pavers average ~0.8 of white)
	m.albedo_color = Color(col.r * 0.8, col.g * 0.8, col.b * 0.8)
	m.roughness = 0.95
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	var mi := MeshInstance3D.new()
	mi.name = "Horizon"
	mi.mesh = st.commit()
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)


## env-fixes 4: the fight's mark in a real place, RING_SIZE m across: a thin ring and a faint inner
## wash in the faction's colour (cfg "faction_color": "#rrggbb" or [r, g, b]; a warm gold by default),
## at about 40 % opacity, drawn once into a 128 px texture at load.
const RING_SIZE: float = 5.2
const RING_COLOR: Color = Color(1.0, 0.82, 0.48)


func _faction_ring_mat(cfg: Dictionary) -> StandardMaterial3D:
	var col: Color = RING_COLOR
	var fc: Variant = cfg.get("faction_color")
	if fc is String and Color.html_is_valid(str(fc)):
		col = Color.html(str(fc))
	elif fc is Array and (fc as Array).size() >= 3:
		col = Color(float(fc[0]), float(fc[1]), float(fc[2]))
	var n: int = 128
	var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
	for y in n:
		for x in n:
			var r: float = Vector2(x + 0.5 - n * 0.5, y + 0.5 - n * 0.5).length() / (n * 0.5)   # 0 centre, 1 edge
			var ring: float = clampf(1.0 - absf(r - 0.9) / 0.035, 0.0, 1.0)          # the line, ~0.18 m wide
			var inner: float = clampf(1.0 - absf(r - 0.78) / 0.012, 0.0, 1.0) * 0.5  # a hairline inside it
			var wash: float = 0.12 * (1.0 - smoothstep(0.55, 0.88, r)) * smoothstep(0.0, 0.5, r)
			img.set_pixel(x, y, Color(1, 1, 1, clampf(maxf(maxf(ring, inner), wash), 0.0, 1.0)))
	img.generate_mipmaps()
	var m := StandardMaterial3D.new()
	m.albedo_texture = ImageTexture.create_from_image(img)
	m.albedo_color = Color(col.r, col.g, col.b, 0.42)
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	m.disable_receive_shadows = true
	return m


func _scene(n: String) -> PackedScene:
	if not _scenes.has(n):
		_scenes[n] = load("res://art/city/%s.glb" % n)
	return _scenes[n]


## An instance of a kit piece scaled so its footprint is `width` metres wide.
func _piece(n: String, width: float, at: Vector3, yaw_deg: float) -> Node3D:
	var ps: PackedScene = _scene(n)
	if ps == null:
		return null
	var inst: Node3D = ps.instantiate() as Node3D
	var holder := Node3D.new()
	holder.add_child(inst)
	var aabb: AABB = _aabb(inst)
	var s: float = width / maxf(0.01, maxf(aabb.size.x, aabb.size.z))
	inst.scale = Vector3.ONE * s
	inst.position = Vector3(-aabb.get_center().x * s, -aabb.position.y * s, -aabb.get_center().z * s)
	holder.position = at
	holder.rotation_degrees.y = yaw_deg
	_dressing.add_child(holder)
	for mi: Node in inst.find_children("*", "MeshInstance3D", true, false):
		(mi as MeshInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		if n.begins_with("building"):
			mi.set_meta("facade", true)
		elif n in ["planter", "tree-small", "stall-bench"]:
			mi.set_meta("near_fade", true)
	return holder


static func _aabb(root: Node3D) -> AABB:
	var out := AABB()
	var first: bool = true
	for n: Node in root.find_children("*", "MeshInstance3D", true, false):
		var mi := n as MeshInstance3D
		if mi.mesh == null:
			continue
		var xf: Transform3D = Transform3D.IDENTITY
		var p: Node = mi
		while p != null and p != root:
			if p is Node3D:
				xf = (p as Node3D).transform * xf
			p = p.get_parent()
		var box: AABB = xf * mi.get_aabb()
		if first:
			out = box
			first = false
		else:
			out = out.merge(box)
	return out


func _build_street() -> void:
	# shop fronts down both sides of the street, facing in
	var i: int = 0
	var z: float = 16.0
	while z > STREET_END:
		if z - SHOP_W * 0.5 < CROSS_Z.x and z + SHOP_W * 0.5 > CROSS_Z.y:
			z = CROSS_Z.y - SHOP_W * 0.5 - 0.6   # cq 016: the cross street (_build_crossroad)
			continue
		for side in 2:
			var sx: float = -1.0 if side == 0 else 1.0
			var x: float = (STREET_HALF + SHOP_W * 0.5) * sx
			var far: bool = z < FAR_Z
			var n: String = BUILDINGS[(i * 3 + side * 5) % BUILDINGS.size()]
			if far:
				n = FAR_BUILDINGS[(i * 3 + side * 5) % FAR_BUILDINGS.size()]
			var h: Node3D = _piece(n, SHOP_W, Vector3(x, 0, z), 90.0 if side == 0 else -90.0)
			if h != null:
				if far:
					_set_meta_all(h, "facade")
				_dress_front(h, sx, i * 2 + side)
				var wb: AABB = h.transform * _aabb(h)
				map_blocks.append(Rect2(wb.position.x, wb.position.z, wb.size.x, wb.size.z))
		z -= SHOP_W + 0.4
		i += 1
	# kerbs: a slightly raised strip in front of the shops
	var km := StandardMaterial3D.new()
	km.albedo_color = Color(0.62, 0.55, 0.6)
	km.roughness = 0.95
	for side in 2:
		# cq 016: broken by the cross street
		for seg: Vector2 in [Vector2(18.0, CROSS_Z.x), Vector2(CROSS_Z.y, STREET_END - 4.0)]:
			var k := MeshInstance3D.new()
			var b := BoxMesh.new()
			b.size = Vector3(0.5, 0.18, seg.x - seg.y)
			k.mesh = b
			k.material_override = km
			k.position = Vector3((STREET_HALF - 0.3) * (-1.0 if side == 0 else 1.0), 0.09, (seg.x + seg.y) * 0.5)
			_dressing.add_child(k)
	# street lamps with warm pools, planters and benches along the kerbs
	var pool_m := StandardMaterial3D.new()
	pool_m.albedo_texture = T_POOL
	pool_m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	pool_m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	pool_m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	pool_m.albedo_color = Color(1.0, 0.68, 0.36, 0.42)
	pool_m.disable_receive_shadows = true
	var lz: float = 10.0
	var li: int = 0
	while lz > STREET_END + 6.0:
		for side in 2:
			var sx: float = -1.0 if side == 0 else 1.0
			if lz + side * 3.0 < CROSS_Z.x + 2.5 and lz + side * 3.0 > CROSS_Z.y - 2.5:
				continue   # cq 016: no lamp in the cross street
			var lamp := _piece("light-curved", 1.6, Vector3(sx * (STREET_HALF - 0.55), 0, lz + side * 3.0), 90.0 if side == 0 else -90.0)
			if lamp != null:
				var aabb: AABB = _aabb(lamp)
				var h: float = aabb.size.y
				lamp.scale = Vector3.ONE * (5.5 / maxf(0.1, h))
				for mi: Node in lamp.find_children("*", "MeshInstance3D", true, false):
					mi.set_meta("lamp", true)
				# the lamp head: the end of the arm, over the street
				var wb: AABB = lamp.transform * _aabb(lamp)
				var head_x: float = wb.position.x if sx > 0.0 else wb.end.x
				var head := Vector3(head_x + sx * 0.25, wb.end.y - 0.35, lamp.position.z)
				# the head itself, in the halo mesh (same texture, one draw for both)
				_halo_st.set_color(Color(1.0, 0.885, 0.69) )
				_glow_quad(_halo_st, head, 2.2, 2.2, Rect2(0, 0, 1, 1), true)
				_halo(head, 2.4, Color(1.0, 0.72, 0.4, 0.45))
				# the light falling from the head to its pool, as on the reference's dusk street
				_cone(_cones_st, head - Vector3(0, 0.2, 0), Vector3(head.x, 0.05, head.z + 0.6), 0.4, 4.0)
				if sx < 0.0 and bool(look.get("ao", true)):
					_post_shadow(Vector3(lamp.position.x, 0.0, lamp.position.z), wb.size.y)
			var pool := MeshInstance3D.new()
			var pq := PlaneMesh.new()
			pq.size = Vector2(8.0, 8.0)
			pool.mesh = pq
			pool.material_override = pool_m
			pool.position = Vector3(sx * (STREET_HALF - 3.0), 0.035, lz + side * 3.0)
			pool.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			_dressing.add_child(pool)
			if li % 2 == 0:
				_piece("planter", 1.4, Vector3(sx * (STREET_HALF - 0.9), 0, lz + side * 3.0 - 2.2), 0.0)
			else:
				_piece("stall-bench", 2.0, Vector3(sx * (STREET_HALF - 1.0), 0, lz + side * 3.0 - 2.4), 90.0 if side == 0 else -90.0)
		lz -= 9.0
		li += 1
	for side in 2:
		_piece("tree-small", 2.6, Vector3((STREET_HALF - 1.2) * (-1.0 if side == 0 else 1.0), 0, CROSS_Z.y - 3.0 - side * 4.0), 0.0)
	_build_crossroad(km)
	_build_cafes()


## cq 016: the cross street up the screen, as on the reference: asphalt with zebra crossings and
## lane marks (one vertex-coloured mesh), kerbs, traffic lights on the corners, cars parked along
## it and two passing through (each car one mesh; they move in _process, nothing in gameplay).
func _build_crossroad(kerb_mat: Material) -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var asphalt := Color(0.25, 0.24, 0.31)
	var paint := Color(0.86, 0.84, 0.88)
	_flat_rect(st, Vector2(-80.0, CROSS_Z.y), Vector2(80.0, CROSS_Z.x), 0.012, asphalt)
	# zebra crossings across the mouth of the street, both sides of the junction
	for zc: float in [CROSS_Z.x - 1.6, CROSS_Z.y + 1.6]:
		var x: float = -STREET_HALF + 0.8
		while x < STREET_HALF - 1.0:
			_flat_rect(st, Vector2(x, zc - 1.2), Vector2(x + 0.5, zc + 1.2), 0.02, paint)
			x += 1.0
	# a dashed centre line and the stop lines, outside the junction
	var mid: float = (CROSS_Z.x + CROSS_Z.y) * 0.5
	for sgn: float in [-1.0, 1.0]:
		var x0: float = STREET_HALF + 1.2
		while x0 < 70.0:
			_flat_rect(st, Vector2(sgn * x0 - 0.9, mid - 0.08), Vector2(sgn * x0 + 0.9, mid + 0.08), 0.02, paint)
			x0 += 3.6
	var mi := MeshInstance3D.new()
	mi.name = "Crossroad"
	mi.mesh = st.commit()
	var m := StandardMaterial3D.new()
	m.vertex_color_use_as_albedo = true
	m.roughness = 0.85
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	# the cross street's kerbs, either side of the main street
	for zk: float in [CROSS_Z.x + 0.25, CROSS_Z.y - 0.25]:
		for sgn: float in [-1.0, 1.0]:
			var k := MeshInstance3D.new()
			var b := BoxMesh.new()
			b.size = Vector3(60.0, 0.18, 0.5)
			k.mesh = b
			k.material_override = kerb_mat
			k.position = Vector3(sgn * (STREET_HALF + 30.0), 0.09, zk)
			_dressing.add_child(k)
	# the blocks along the cross street: the far side faces the camera, the near side its back
	var j: int = 0
	for sgn: float in [-1.0, 1.0]:
		var x: float = STREET_HALF + 1.2 + SHOP_W * 0.5
		while x < 26.0:
			# the corner shops in full detail, the rest of the cross street in the kit's low-detail blocks
			var n: String = BUILDINGS[(j * 7 + 3) % BUILDINGS.size()] if x < 16.0 else FAR_BUILDINGS[(j + 2) % FAR_BUILDINGS.size()]
			var h: Node3D = _piece(n, SHOP_W, Vector3(sgn * x, 0, CROSS_Z.y - 0.6 - SHOP_W * 0.5), 0.0)
			if h != null:
				if x >= 16.0:
					_set_meta_all(h, "facade")
				var wb: AABB = h.transform * _aabb(h)
				map_blocks.append(Rect2(wb.position.x, wb.position.z, wb.size.x, wb.size.z))
				if absf(x) < 16.0:
					_cross_sign(Vector3(sgn * x, 0, wb.end.z), j)
			var h2: Node3D = _piece(FAR_BUILDINGS[j % FAR_BUILDINGS.size()], SHOP_W, Vector3(sgn * x, 0, CROSS_Z.x + 0.6 + SHOP_W * 0.5), 180.0)
			if h2 != null:
				_set_meta_all(h2, "facade")
				var wb2: AABB = h2.transform * _aabb(h2)
				map_blocks.append(Rect2(wb2.position.x, wb2.position.z, wb2.size.x, wb2.size.z))
			x += SHOP_W + 0.4
			j += 1
	# traffic lights on the four corners, turned to the junction
	for c: Array in [[-1.0, CROSS_Z.x + 0.4, 90.0], [1.0, CROSS_Z.x + 0.4, -90.0], [-1.0, CROSS_Z.y - 0.4, 90.0], [1.0, CROSS_Z.y - 0.4, -90.0]]:
		var tl: Node3D = _piece("roads/traffic-light", 1.0, Vector3(float(c[0]) * (STREET_HALF + 0.2), 0, float(c[1])), float(c[2]))
		if tl != null:
			var hgt: float = _aabb(tl).size.y
			tl.scale = Vector3.ONE * (4.2 / maxf(0.1, hgt))
			for m2: Node in tl.find_children("*", "MeshInstance3D", true, false):
				m2.set_meta("lamp", true)
			# the lamp's glow: red for the cars, so the walk signal reads to the street
			var top: Vector3 = Vector3(float(c[0]) * (STREET_HALF + 0.2), 3.7, float(c[1]))
			_halo(top, 0.9, Color(1.0, 0.3, 0.25, 0.7))
	# parked cars along both kerbs, clear of the junction
	var pk: int = 0
	for spot: Array in [[-10.5, CROSS_Z.y + 1.25], [11.0, CROSS_Z.y + 1.25], [17.5, CROSS_Z.y + 1.25],
			[-13.0, CROSS_Z.x - 1.25], [14.5, CROSS_Z.x - 1.25]]:
		var car: Node3D = _piece(CARS[pk % CARS.size()], 4.3, Vector3(float(spot[0]), 0, float(spot[1])), 90.0 if pk % 2 == 0 else -90.0)
		pk += 1
		if car == null:
			continue
	# two cars passing through the junction (one draw each)
	for lane in 2:
		var car_mi: MeshInstance3D = _solid_piece(CARS[(lane * 3 + 1) % CARS.size()], 4.3)
		if car_mi == null:
			continue
		var dirx: float = 1.0 if lane == 0 else -1.0
		car_mi.position = Vector3(-30.0 * dirx + lane * 23.0, 0.0, mid + (1.4 if lane == 0 else -1.4))
		car_mi.rotation_degrees.y = 90.0 * dirx
		car_mi.set_meta("vx", dirx * (6.5 if lane == 0 else 5.0))
		add_child(car_mi)
		_moving.append(car_mi)


var _moving: Array[MeshInstance3D] = []


func _process(dt: float) -> void:
	for car: MeshInstance3D in _moving:
		var vx: float = car.get_meta("vx")
		car.position.x += vx * dt
		if car.position.x > 45.0:
			car.position.x -= 90.0
		elif car.position.x < -45.0:
			car.position.x += 90.0


## A neon sign on a cross-street shop front, facing down the street (in the sign mesh).
func _cross_sign(front: Vector3, n: int) -> void:
	var k: int = (n * 3 + 2) % NEON_SIGNS
	var w: float = 2.4
	var side: int = 0 if front.x < 0.0 else 1
	var at := Vector3(front.x, 4.4, front.z + 0.15)
	var q_right := Vector3(1, 0, 0) * w * 0.5
	var q_up := Vector3(0, 1, 0) * w * 0.375 * 0.5
	_quad(_neon_st[side], at, q_right, q_up, Rect2(0, float(k) / NEON_SIGNS, 1, 1.0 / NEON_SIGNS))
	var hc: Color = SIGN_HALO[k]
	hc.a = 0.3
	_halo(at + Vector3(0, 0, 0.05), w * 1.7, hc, 0.6)


## cq 016: café parasols and awnings on the shop fronts up the street (beyond the fight's reach).
func _build_cafes() -> void:
	for p: Array in [[-1.0, -11.2, "commercial/detail-parasol-a"], [1.0, -12.4, "commercial/detail-parasol-b"]]:
		var ps: Node3D = _piece(str(p[2]), 1.4, Vector3(float(p[0]) * (STREET_HALF - 0.75), 0, float(p[1])), 0.0)
		if ps != null:
			_set_meta_all(ps, "near_fade")


func _set_meta_all(root: Node, key: String) -> void:
	for mi: Node in root.find_children("*", "MeshInstance3D", true, false):
		mi.set_meta(key, true)


## A kit piece baked into one mesh (one draw), `length` metres long, standing on y = 0.
func _solid_piece(n: String, length: float) -> MeshInstance3D:
	var ps: PackedScene = _scene(n)
	if ps == null:
		return null
	var inst: Node3D = ps.instantiate() as Node3D
	var aabb: AABB = _aabb(inst)
	var s: float = length / maxf(0.01, maxf(aabb.size.x, aabb.size.z))
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var mat: Material = null
	for node: Node in inst.find_children("*", "MeshInstance3D", true, false):
		var mi := node as MeshInstance3D
		if mi.mesh == null:
			continue
		var xf: Transform3D = Transform3D.IDENTITY
		var p: Node = mi
		while p != null and p != inst:
			if p is Node3D:
				xf = (p as Node3D).transform * xf
			p = p.get_parent()
		xf = Transform3D(Basis.IDENTITY.scaled(Vector3.ONE * s), Vector3(-aabb.get_center().x * s, -aabb.position.y * s, -aabb.get_center().z * s)) * xf
		for si in mi.mesh.get_surface_count():
			if mat == null:
				mat = _opaque(mi.get_active_material(si))
			st.append_from(mi.mesh, si, xf)
	inst.free()
	var out := MeshInstance3D.new()
	out.mesh = st.commit()
	out.material_override = mat
	out.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return out


func _flat_rect(st: SurfaceTool, a: Vector2, b: Vector2, y: float, col: Color) -> void:
	var p := [Vector3(a.x, y, a.y), Vector3(b.x, y, a.y), Vector3(b.x, y, b.y), Vector3(a.x, y, b.y)]
	for idx: int in [0, 1, 2, 0, 2, 3]:
		st.set_color(col)
		st.set_normal(Vector3.UP)
		st.set_uv(Vector2(p[idx].x, p[idx].z) * 0.25)
		st.add_vertex(p[idx])


# ---- the lit street: neon signs, shop windows, lamp heads. Each kind is one mesh per side of
# the street (a handful of draw calls, unshaded and additive), not one node per sign.
var _neon_st: Array[SurfaceTool] = []
var _shop_st: Array[SurfaceTool] = []
var _cones_st: SurfaceTool
var _halo_st: SurfaceTool    # cq 015: soft coloured halos behind signs and lamp heads (bloom faked on the light)
var _shade_st: SurfaceTool   # cq 015: baked sun shade and contact darkening where the walls meet the paving
const SIGN_HALO: Array[Color] = [Color(1.0, 0.3, 0.7), Color(0.25, 0.8, 1.0), Color(1.0, 0.7, 0.25),
	Color(0.65, 0.35, 1.0), Color(0.3, 1.0, 0.55), Color(1.0, 0.35, 0.45)]   # the neon atlas's six signs
const SHADE_COL: Color = Color(0.6, 0.62, 0.86)   # multiplied into the paving: the sky-lit shade
const AO_COL: Color = Color(0.5, 0.47, 0.62)       # the contact darkening at the foot of a wall
const KERB_TOP: float = 0.185
const SUN_GLARE: Vector3 = Vector3(-4.5, 0.06, -18.0)   # a warm pool of low sun on the far paving
const HALO_GAIN: float = 1.3   # the halo mesh's material gain: vertex colours stop at 1, lamp heads need 1.3
## env-fixes 3 (audit issue 18): the halos stacked with the cheap bloom into white smears on the
## emulator. Every halo's alpha is 40 % lower and clamped (they are added, so alpha is their strength).
const HALO_SCALE: float = 0.6
const HALO_ALPHA_MAX: float = 0.42


static func _halo_alpha(a: float) -> float:
	# look-world: the time preset's halo scale and clamp (tokens halo_gain_scale / halo_alpha_max; none by day)
	return minf(a * _halo_scale, _halo_max)

var _cam_facing: Basis = Basis.from_euler(Vector3(deg_to_rad(-34.0), deg_to_rad(12.0), 0.0))   # fight.gd CAM_PITCH, CAM_YAW


## A shop front: warm light spilling from its windows onto the pavement, and on most a neon
## blade sign sticking out over the pavement (turned to the fight camera, so it reads).
func _dress_front(h: Node3D, sx: float, n: int) -> void:
	var wb: AABB = h.transform * _aabb(h)
	var front_x: float = wb.end.x if sx < 0.0 else wb.position.x
	var zc: float = wb.get_center().z
	var length: float = wb.size.z
	var side: int = 0 if sx < 0.0 else 1
	_ground_quad(_shop_st[side], Vector3(front_x - sx * 1.0, 0.04, zc), 2.0, length * 0.8, Rect2(0, 0, 1, 1))
	if bool(look.get("ao", true)):
		_wall_shade(front_x, sx, wb.position.z, wb.end.z, wb.end.y)
	# cq 016: a shop awning over the ground floor on most fronts, as on the reference's street
	if n % 4 != 3 and zc > FAR_Z:
		var aw: Node3D = _piece("detail-awning-wide" if n % 2 == 0 else "detail-awning", 3.4 if n % 2 == 0 else 2.4,
			Vector3(front_x - sx * 0.45, 2.3, zc + (0.9 if n % 3 == 0 else -0.9)), 90.0 if sx < 0.0 else -90.0)
		if aw != null:
			_set_meta_all(aw, "facade")
	# signs only up the street (z < -5): the camera's focus never goes past z = -8
	# (fight.gd CAM_BOUNDS), so they stay up the screen, never among the controls
	if n % 3 != 2 and zc < -5.0:
		var k: int = (n * 5 + 1) % NEON_SIGNS
		var w: float = 2.2
		var at := Vector3(front_x - sx * (w * 0.5 + 0.1), 4.7 + 0.35 * float(n % 2), zc + (1.2 if n % 2 == 0 else -1.2))
		_glow_quad(_neon_st[side], at, w, w * 0.375, Rect2(0, float(k) / NEON_SIGNS, 1, 1.0 / NEON_SIGNS), true)
		var hc: Color = SIGN_HALO[k]
		hc.a = 0.3
		_halo(at, w * 1.7, hc, 0.6)


## A soft coloured halo round a light, facing the camera (vertex colour x the lamp glow).
func _halo(c: Vector3, size: float, col: Color, aspect: float = 1.0) -> void:
	if not bool(look.get("halos", true)):
		return
	_halo_st.set_color(Color(col.r / HALO_GAIN, col.g / HALO_GAIN, col.b / HALO_GAIN, _halo_alpha(col.a)))
	_glow_quad(_halo_st, c, size, size * aspect, Rect2(0, 0, 1, 1), true)


## The paving at the foot of a shop front: a contact darkening 0.9 m out on every wall, and on the
## street's left side (the low sun comes from the left, KEY_ROT) the block's shade, as wide as
## half its height (2.5 to 4.5 m), leaning along the sun, fading out softly. The paving's share is
## baked into the ground mesh's vertex colours (`_bake_ground`, no extra draw, no overdraw); the
## kerb's top gets a thin multiplied strip.
func _wall_shade(front_x: float, sx: float, z0: float, z1: float, h: float) -> void:
	var w: float = clampf(h * 0.5, 2.5, 4.5) if sx < 0.0 else 0.0
	_blocks.append([sx, front_x, z0, z1, w])
	var kerb_in: float = STREET_HALF - 0.55       # the kerb's street-side edge (|x|)
	var xk: float = sx * kerb_in
	var lean: float = _lean() if sx < 0.0 else 0.0
	var ck: Color = _shade_at(xk + sx * 0.01, (z0 + z1) * 0.5 + lean * absf(xk - front_x))
	var c0: Color = _shade_at(front_x - sx * 0.01, (z0 + z1) * 0.5)
	_shade_quad(Vector3(front_x, KERB_TOP, z0), Vector3(xk, KERB_TOP, z0 + lean * absf(xk - front_x)), z1 - z0, c0, ck)


var _blocks: Array = []   # [sx, front_x, z0, z1, shade width] per shop block


## Metres along the street the sun's shade moves per metre across it.
static func _lean() -> float:
	var d: Vector3 = key_dir()
	return d.z / maxf(0.05, absf(d.x))


## The baked shade multiplier at a point of the paving (white = none).
func _shade_at(x: float, z: float) -> Color:
	var c: Color = Color.WHITE.lerp(DUSK_COL, smoothstep(DUSK_Z.x, DUSK_Z.y, z))
	var lean: float = _lean()
	for b: Array in _blocks:
		var sx: float = b[0]
		var dist: float = (x - float(b[1])) * -sx    # metres out from the wall into the street
		if dist < 0.0 or dist > 4.6:
			continue
		var zb: float = z - (lean * dist if sx < 0.0 else 0.0)
		if zb < float(b[2]) - 0.2 or zb > float(b[3]) + 0.2:
			continue
		# soft ends where the blocks' gaps let the sun through
		var edge: float = clampf(minf(zb - float(b[2]) + 0.2, float(b[3]) + 0.2 - zb) / 0.6, 0.0, 1.0)
		if dist < 0.9:
			c *= AO_COL.lerp(Color.WHITE, lerpf(1.0, dist / 0.9, edge))
		var w: float = b[4]
		if w > 0.0 and dist < w:
			c *= SHADE_COL.lerp(Color.WHITE, lerpf(1.0, smoothstep(0.0, 1.0, dist / w), edge))
	return c


## The ground with the shade baked in: a grid over the street whose vertex colours multiply the
## paving, dense only near the walls (0.3 m) and open in the middle, 2.2 m along the street over
## the stretch the camera can see, and plain quads out to the old 160 m plate. Few triangles: on a
## software GPU every triangle has a set-up cost (a 0.35 x 0.7 m grid, ~6k triangles, cost more
## than the multiplied overlay it replaced).
func _bake_ground() -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var hx: float = STREET_HALF + 0.35
	var zmin: float = -44.8
	var zmax: float = 21.0
	var xs: Array[float] = []
	for d: float in [-0.35, 0.0, 0.3, 0.6, 0.9, 1.4, 2.0, 2.7, 3.5, 4.5]:
		xs.append(-STREET_HALF + d)
	for d: float in [4.5, 2.0, 0.9, 0.45, 0.0, -0.35]:
		xs.append(STREET_HALF - d)
	var nz: int = int(ceil((zmax - zmin) / 2.2))
	var cols: Array = []
	for j in nz + 1:
		var row: Array = []
		for x: float in xs:
			row.append(_shade_at(x, zmin + j * ((zmax - zmin) / nz)))
		cols.append(row)
	for j in nz:
		var z0: float = zmin + j * ((zmax - zmin) / nz)
		var z1: float = zmin + (j + 1) * ((zmax - zmin) / nz)
		for i in xs.size() - 1:
			_ground_cell(st, xs[i], z0, xs[i + 1], z1, [cols[j][i], cols[j][i + 1], cols[j + 1][i + 1], cols[j + 1][i]])
	var w := Color.WHITE
	for r: Array in [[-80.0, -80.0, 80.0, zmin], [-80.0, zmax, 80.0, 80.0], [-80.0, zmin, -hx, zmax], [hx, zmin, 80.0, zmax]]:
		_ground_cell(st, r[0], r[1], r[2], r[3], [w, w, w, w])
	ground.mesh = st.commit()
	(ground.material_override as StandardMaterial3D).vertex_color_use_as_albedo = true
	(ground.material_override as StandardMaterial3D).uv1_scale = Vector3.ONE


func _ground_cell(st: SurfaceTool, x0: float, z0: float, x1: float, z1: float, c: Array) -> void:
	# UVs as the old PlaneMesh x 40: one paving repeat every 4 m, same phase
	var p := [Vector3(x0, 0, z0), Vector3(x1, 0, z0), Vector3(x1, 0, z1), Vector3(x0, 0, z1)]
	for idx: int in [0, 1, 2, 0, 2, 3]:
		st.set_color(c[idx])
		st.set_normal(Vector3.UP)
		st.set_uv(Vector2((p[idx].x + 80.0) / 4.0, (p[idx].z + 80.0) / 4.0))
		st.add_vertex(p[idx])


## A lamp post's long thin shadow across the paving, leaning away from the low sun.
func _post_shadow(base: Vector3, h: float) -> void:
	var d: Vector3 = key_dir()
	var run := Vector3(d.x, 0.0, d.z) / maxf(0.2, -d.y) * h * 0.8
	var side: Vector3 = Vector3(-run.z, 0.0, run.x).normalized() * 0.11
	var a := Vector3(base.x, 0.03, base.z)
	var b := a + run
	var p := [a - side, a + side, b + side * 2.5, b - side * 2.5]
	var col: Array[Color] = [SHADE_COL, SHADE_COL, Color.WHITE, Color.WHITE]
	for idx: int in [0, 1, 2, 0, 2, 3]:
		_shade_st.set_color(_ink(col[idx]))
		_shade_st.set_normal(Vector3.UP)
		_shade_st.add_vertex(p[idx])


## The shade multiplier `c` (white = none) as an alpha-blended ink of the same darkness.
const SHADE_INK: Color = Color(0.16, 0.15, 0.36)


static func _ink(c: Color) -> Color:
	var k: float = 1.0 - (c.r * 0.3 + c.g * 0.55 + c.b * 0.15)
	return Color(SHADE_INK.r, SHADE_INK.g, SHADE_INK.b, clampf(k * 1.15, 0.0, 1.0))


## A strip from the line `a` (length `len` along +z) to the line `b`, colour ca at a, cb at b.
func _shade_quad(a: Vector3, b: Vector3, len: float, ca: Color, cb: Color) -> void:
	var p := [a, b, b + Vector3(0, 0, len), a + Vector3(0, 0, len)]
	var c := [ca, cb, cb, ca]
	for idx: int in [0, 1, 2, 0, 2, 3]:
		_shade_st.set_color(_ink(c[idx]))
		_shade_st.set_normal(Vector3.UP)
		_shade_st.add_vertex(p[idx])


## A flat quad on the ground: `wx` across the street (x), `wz` along it.
func _ground_quad(st: SurfaceTool, c: Vector3, wx: float, wz: float, uv: Rect2) -> void:
	_quad(st, c, Vector3(0, 0, wz * 0.5), Vector3(wx * 0.5, 0, 0), uv)


## A quad on a wall facing the street (the wall's normal is -sx along x).
func _wall_quad(st: SurfaceTool, c: Vector3, sx: float, w: float, h: float, uv: Rect2) -> void:
	var right: Vector3 = Vector3(0, 0, sx) * (w * 0.5)   # reads left to right from the street
	var up: Vector3 = Vector3(0, h * 0.5, 0)
	_quad(st, c, right, up, uv)


## A quad that faces the (fixed-angle) fight camera: a glow without a billboard node.
func _glow_quad(st: SurfaceTool, c: Vector3, w: float, h: float, uv: Rect2, _face_cam: bool) -> void:
	_quad(st, c, _cam_facing.x * (w * 0.5), _cam_facing.y * (h * 0.5), uv)


## A light cone: a vertical trapezoid facing the camera's side of the street (+z).
func _cone(st: SurfaceTool, top: Vector3, bottom: Vector3, top_w: float, bottom_w: float) -> void:
	var p := [bottom - Vector3(bottom_w * 0.5, 0, 0), bottom + Vector3(bottom_w * 0.5, 0, 0), top + Vector3(top_w * 0.5, 0, 0), top - Vector3(top_w * 0.5, 0, 0)]
	var t := [Vector2(0, 1), Vector2(1, 1), Vector2(1, 0), Vector2(0, 0)]
	for idx: int in [0, 1, 2, 0, 2, 3]:
		st.set_uv(t[idx])
		st.add_vertex(p[idx])


func _quad(st: SurfaceTool, c: Vector3, right: Vector3, up: Vector3, uv: Rect2) -> void:
	var p := [c - right - up, c + right - up, c + right + up, c - right + up]
	var t := [Vector2(uv.position.x, uv.end.y), Vector2(uv.end.x, uv.end.y), Vector2(uv.end.x, uv.position.y), uv.position]
	for idx: int in [0, 1, 2, 0, 2, 3]:
		st.set_uv(t[idx])
		st.add_vertex(p[idx])


func _glow_mat(tex: Texture2D, col: Color, add: bool = true) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_texture = tex
	m.albedo_color = col
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD if add else BaseMaterial3D.BLEND_MODE_MIX
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	m.disable_receive_shadows = true
	m.no_depth_test = false
	m.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	return m


func _commit_glows() -> void:
	# cq 015: brighter than white (the ACES tonemap rolls the peak off), so signs read as lit tubes
	var neon_m := _glow_mat(T_NEON, Color(1.35, 1.35, 1.35, 1.0), false)   # mixed: added on the pale paving it washes to white
	var shop_m := _glow_mat(T_SHOP, Color(1.0, 0.78, 0.5, 0.6))
	var halo_m := _glow_mat(T_LAMP, Color(HALO_GAIN, HALO_GAIN, HALO_GAIN, 1))
	halo_m.vertex_color_use_as_albedo = true
	halo_m.render_priority = -1   # under the signs and lamp heads, not over them
	_near_fade(halo_m, true)
	var shade_m := StandardMaterial3D.new()
	shade_m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	shade_m.vertex_color_use_as_albedo = true
	# alpha-blended towards a dusk ink, not multiplied: with a post pass on (look glow / grade) the
	# 3D buffer is scaled by a luminance multiplier and a multiply blend goes black
	shade_m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	shade_m.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	shade_m.disable_receive_shadows = true
	shade_m.disable_fog = true
	shade_m.cull_mode = BaseMaterial3D.CULL_DISABLED   # the strips are wound either way
	var cone_m := _glow_mat(T_CONE, Color(1.0, 0.82, 0.55, 0.95))
	_near_fade(cone_m, true)
	var out: Array = []
	for side in 2:
		out.append([_neon_st[side], neon_m, true])
		out.append([_shop_st[side], shop_m, true])
	out.append([_cones_st, cone_m, false])
	out.append([_halo_st, halo_m, true])
	out.append([_shade_st, shade_m, false])
	for pair: Array in out:
		var mesh: ArrayMesh = (pair[0] as SurfaceTool).commit()
		if mesh.get_surface_count() == 0:
			continue
		var mi := MeshInstance3D.new()
		mi.name = "Glow"
		mi.mesh = mesh
		mi.material_override = pair[1]
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		if pair[2]:
			mi.set_meta("bloom", true)   # cq 016: the cheap bloom's sources (bloom.gd)
		add_child(mi)


## Bakes the whole street (about 90 mesh instances) into one mesh per material: the Kenney
## kits share a colour atlas, so the street draws in a handful of calls instead of ~90.
## On the emulator's software GPU each draw call is frame time, and frame time is input latency.
func _merge_dressing() -> void:
	var groups: Dictionary = {}     # key -> {st: SurfaceTool, mat: Material}
	var n_in: int = 0
	var inv: Transform3D = _dressing.global_transform.affine_inverse()
	for node: Node in _dressing.find_children("*", "MeshInstance3D", true, false):
		var mi := node as MeshInstance3D
		if mi.mesh == null:
			continue
		n_in += 1
		var xf: Transform3D = inv * mi.global_transform
		# one chunk per stretch of street and side, so the camera culls what it cannot see
		var at: Vector3 = xf * mi.get_aabb().get_center()
		var facade: bool = mi.has_meta("facade")
		# the shop fronts (most of the vertices) in chunks the camera can cull; the small
		# props one mesh per material (each extra mesh is a draw call)
		var chunk: String = "%d%s" % [floori(at.z / MERGE_CHUNK), "l" if at.x < 0.0 else "r"] if facade else ""
		for si in mi.mesh.get_surface_count():
			var mat: Material = mi.get_active_material(si)
			var key: String = "%s_c%s%s%s" % [_mat_key(mat), chunk, "f" if facade else "", "n" if mi.has_meta("near_fade") else ""]
			if not groups.has(key):
				var st := SurfaceTool.new()
				st.begin(Mesh.PRIMITIVE_TRIANGLES)
				groups[key] = {"st": st, "mat": _facade_mat(mat) if facade else (_dark(mat) if mi.has_meta("lamp") else (_faded(mat) if mi.has_meta("near_fade") else _opaque(mat)))}
			(groups[key]["st"] as SurfaceTool).append_from(mi.mesh, si, xf)
	var merged := Node3D.new()
	merged.name = "StreetMerged"
	for key: String in groups:
		var st: SurfaceTool = groups[key]["st"]
		var mesh: ArrayMesh = st.commit()
		var out := MeshInstance3D.new()
		out.mesh = mesh
		out.material_override = groups[key]["mat"]
		out.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		merged.add_child(out)
	remove_child(_dressing)
	_dressing.queue_free()
	_dressing = merged
	add_child(_dressing)
	# the kit scenes are no longer needed: each GLB embeds its own copy of the shared atlas,
	# so keeping them would hold ~15 duplicate textures in video memory
	_scenes.clear()
	_tex_hash.clear()
	print("CQ street merged %d mesh instances into %d (%.0f m chunks)" % [n_in, groups.size(), MERGE_CHUNK])


## The kits' GLBs import as alpha blended with a depth pre-pass (drawn twice, blended, sorted)
## though every pixel is opaque: draw the shop fronts, lamps and benches as plain opaque.
func _opaque(mat: Material) -> Material:
	if mat is BaseMaterial3D and (mat as BaseMaterial3D).transparency == BaseMaterial3D.TRANSPARENCY_ALPHA_DEPTH_PRE_PASS:
		var m := (mat as BaseMaterial3D).duplicate() as BaseMaterial3D
		m.transparency = BaseMaterial3D.TRANSPARENCY_DISABLED
		return m
	return mat


## Lamp posts: dark iron, so the glowing heads carry them (the kit's are pale grey).
func _dark(mat: Material) -> Material:
	var m: Material = _opaque(mat)
	if m is BaseMaterial3D:
		m = (m as BaseMaterial3D).duplicate()
		(m as BaseMaterial3D).albedo_color = Color(0.3, 0.27, 0.36)
		_near_fade(m as BaseMaterial3D, false)
	return m


func _faded(mat: Material) -> Material:
	var m: Material = _opaque(mat)
	if m is BaseMaterial3D:
		m = (m as BaseMaterial3D).duplicate()
		_near_fade(m as BaseMaterial3D, false)
	return m


## Lamps close to the camera stand at the bottom of the screen, tall, behind the controls:
## fade them out there.
func _near_fade(m: BaseMaterial3D, alpha: bool) -> void:
	# alpha, not dither: a dithered lamp arm reads as noise at phone size
	m.distance_fade_mode = BaseMaterial3D.DISTANCE_FADE_PIXEL_ALPHA
	m.distance_fade_min_distance = NEAR_FADE.x
	m.distance_fade_max_distance = NEAR_FADE.y


var _facades: Dictionary = {}   # atlas texture -> the facade ShaderMaterial (one per atlas)


func _facade_mat(mat: Material) -> Material:
	if not (mat is BaseMaterial3D) or (mat as BaseMaterial3D).albedo_texture == null:
		return _opaque(mat)
	var tex: Texture2D = (mat as BaseMaterial3D).albedo_texture
	var key: String = _mat_key(mat)
	if not _facades.has(key):
		var sm := ShaderMaterial.new()
		sm.shader = FACADE_SHADER
		sm.set_shader_parameter("atlas", tex)
		set_hemi(sm, look)
		sm.set_shader_parameter("dusk_col", DUSK_COL if bool(look["ao"]) else Color.WHITE)
		sm.set_shader_parameter("dusk_z", DUSK_Z)
		_facades[key] = sm
	return _facades[key]


var _tex_hash: Dictionary = {}   # texture instance id -> pixel hash (one hash per texture)


func _mat_key(mat: Material) -> String:
	# the kits' GLBs each embed their own copy of the same atlas: key them by the pixels
	if mat is BaseMaterial3D and (mat as BaseMaterial3D).albedo_texture != null:
		var bm := mat as BaseMaterial3D
		var tex: Texture2D = bm.albedo_texture
		var id: int = tex.get_instance_id()
		if not _tex_hash.has(id):
			var img: Image = tex.get_image()
			_tex_hash[id] = hash(img.get_data()) if img != null else id
		return "tex%d_%d_%s" % [_tex_hash[id], bm.transparency, str(bm.albedo_color)]
	return "mat%d" % (mat.get_instance_id() if mat != null else 0)


## With a 3D Tiles ground, the tileset is the floor: hide ours (and the plaza unless kept).
func tiles_mode(keep_plaza: bool) -> void:
	ground.visible = false
	if not keep_plaza:
		plaza.visible = false
	if _dressing != null:
		_dressing.visible = false
