extends Node
## cq 016: a cheap bloom (docs/game3d/LOOK.md, "Bloom").
##
## The Compatibility renderer's own glow is a post pass over the whole screen at full resolution,
## which doubled the frame on the software GPU (cq 015). This one only blooms what is meant to glow:
## - the lit street (neon tubes, shop windows, lamp heads) and every effect sit on visual layer
##   BLOOM_LAYER as well as the normal layer;
## - a second camera, matched to the fight camera every frame, draws only that layer into a tiny
##   SubViewport (1/SRC_DIV of the screen, a dozen draws, black background);
## - a 2D pass blurs it into an even smaller one (1/BLUR_DIV, 13 taps);
## - a quad in front of the fight camera adds both back, thresholded, at the 3D resolution (one
##   texture read each, under the HUD).
## Nothing occludes the bloom view (the fighters are not in it), so a sign behind a fighter still
## glows round them a little; the sources sit on the walls and the effects mostly over the fighters.
## Off with look {"bloom": false}; the full post stack (glow + grade) stays opt-in (look "post").

const BLOOM_LAYER: int = 1 << 10     # visual layer 11
const SRC_DIV: int = 8
const BLUR_DIV: int = 16

var main_cam: Camera3D
var src: SubViewport
var blur: SubViewport
var cam: Camera3D
var quad: MeshInstance3D
# env-fixes 3 (audit issue 18): 40 % less bloom (was 0.8) and a lower cap (was 0.35), so the halos
# and the bloom no longer stack into white smears round lamps and signs on a device
var strength: float = 0.48
var threshold: float = 0.45
var cap: float = 0.28

const BLUR_SHADER := """
shader_type canvas_item;
uniform sampler2D src : filter_linear, repeat_disable;
uniform vec2 px;
void fragment() {
	// a 13-tap wide blur from the 1/8 view into the 1/16 one (bilinear taps between texels)
	vec2 uv = SCREEN_UV;
	vec3 c = texture(src, uv).rgb * 0.2;
	vec2 o1 = px * 1.5;
	vec2 o2 = px * 3.5;
	c += (texture(src, uv + vec2(o1.x, 0.0)).rgb + texture(src, uv - vec2(o1.x, 0.0)).rgb
		+ texture(src, uv + vec2(0.0, o1.y)).rgb + texture(src, uv - vec2(0.0, o1.y)).rgb) * 0.11;
	c += (texture(src, uv + o1).rgb + texture(src, uv - o1).rgb
		+ texture(src, uv + vec2(o1.x, -o1.y)).rgb + texture(src, uv + vec2(-o1.x, o1.y)).rgb) * 0.06;
	c += (texture(src, uv + vec2(o2.x, 0.0)).rgb + texture(src, uv - vec2(o2.x, 0.0)).rgb
		+ texture(src, uv + vec2(0.0, o2.y)).rgb + texture(src, uv - vec2(0.0, o2.y)).rgb) * 0.035;
	COLOR = vec4(c, 1.0);
}
"""

const ADD_SHADER := """
shader_type spatial;
render_mode unshaded, blend_add, depth_test_disabled, depth_draw_never, cull_disabled, fog_disabled, shadows_disabled;
uniform sampler2D tight : filter_linear, repeat_disable;
uniform sampler2D wide : filter_linear, repeat_disable;
uniform float strength = 0.9;
uniform float threshold = 0.32;
uniform float cap = 0.45;
void vertex() {
	POSITION = vec4(VERTEX.xy * 2.0, 0.0, 1.0);   // a full-screen triangle pair, whatever the camera
}
void fragment() {
	vec3 a = texture(tight, SCREEN_UV).rgb;
	vec3 b = texture(wide, SCREEN_UV).rgb;
	vec3 c = max(a - vec3(threshold), vec3(0.0)) * 0.3 + max(b - vec3(threshold * 0.5), vec3(0.0)) * 1.3;
	// keep the light's colour (a blurred white-hot core would wash to grey-white) and cap it, so a
	// big effect hazes round the fighters instead of whiting them out
	float l = dot(c, vec3(0.3, 0.55, 0.15));
	c = max(mix(vec3(l), c, 1.5), vec3(0.0));
	c = c * strength;
	ALBEDO = c * cap / (cap + c);
}
"""


func setup(fight_cam: Camera3D, screen: Vector2i, opts: Dictionary = {}) -> void:
	main_cam = fight_cam
	strength = float(opts.get("bloom_strength", strength))
	threshold = float(opts.get("bloom_threshold", threshold))
	cap = float(opts.get("bloom_cap", cap))
	var ss := Vector2i(maxi(16, screen.x / SRC_DIV), maxi(16, screen.y / SRC_DIV))
	var bs := Vector2i(maxi(8, screen.x / BLUR_DIV), maxi(8, screen.y / BLUR_DIV))
	src = SubViewport.new()
	src.name = "BloomSrc"
	src.size = ss
	src.transparent_bg = false
	src.msaa_3d = Viewport.MSAA_DISABLED
	src.screen_space_aa = Viewport.SCREEN_SPACE_AA_DISABLED
	src.use_debanding = false
	src.positional_shadow_atlas_size = 0
	src.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	src.render_target_clear_mode = SubViewport.CLEAR_MODE_ALWAYS
	add_child(src)
	cam = Camera3D.new()
	cam.name = "BloomCam"
	cam.cull_mask = BLOOM_LAYER
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color.BLACK
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color.BLACK
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	cam.environment = env
	cam.near = main_cam.near
	cam.far = main_cam.far
	src.add_child(cam)
	cam.current = true
	blur = SubViewport.new()
	blur.name = "BloomBlur"
	blur.size = bs
	blur.transparent_bg = false
	blur.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(blur)
	var rect := ColorRect.new()
	rect.size = Vector2(bs)
	var bm := ShaderMaterial.new()
	var bsh := Shader.new()
	bsh.code = BLUR_SHADER
	bm.shader = bsh
	bm.set_shader_parameter("src", src.get_texture())
	bm.set_shader_parameter("px", Vector2(1.0 / ss.x, 1.0 / ss.y))
	rect.material = bm
	blur.add_child(rect)
	quad = MeshInstance3D.new()
	quad.name = "BloomAdd"
	var qm := QuadMesh.new()
	qm.size = Vector2(1, 1)
	quad.mesh = qm
	quad.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	quad.extra_cull_margin = 16384.0   # never frustum-culled (the vertex shader puts it on the screen)
	var am := ShaderMaterial.new()
	var ash := Shader.new()
	ash.code = ADD_SHADER
	am.shader = ash
	am.render_priority = 127
	am.set_shader_parameter("tight", src.get_texture())
	am.set_shader_parameter("wide", blur.get_texture())
	am.set_shader_parameter("strength", strength)
	am.set_shader_parameter("threshold", threshold)
	am.set_shader_parameter("cap", cap)
	quad.material_override = am
	main_cam.add_child(quad)
	quad.position = Vector3(0, 0, -main_cam.near * 2.0)
	process_priority = 1000   # after the fight has moved its camera this frame
	_sync()


## Puts every visual instance under `root` (and any added later) on the bloom layer too.
func add_source(root: Node) -> void:
	for n: Node in root.find_children("*", "VisualInstance3D", true, false):
		if not n.has_meta("no_bloom"):
			(n as VisualInstance3D).layers |= BLOOM_LAYER
	if "bloom_layer" in root:
		root.set("bloom_layer", BLOOM_LAYER)
	if root is VisualInstance3D:
		(root as VisualInstance3D).layers |= BLOOM_LAYER
	if not root.child_entered_tree.is_connected(_on_child):
		root.child_entered_tree.connect(_on_child)


func _on_child(n: Node) -> void:
	if n is VisualInstance3D and not n.has_meta("no_bloom"):
		(n as VisualInstance3D).layers |= BLOOM_LAYER


func _process(_dt: float) -> void:
	_sync()


func _sync() -> void:
	if cam == null or main_cam == null:
		return
	cam.global_transform = main_cam.global_transform
	cam.fov = main_cam.fov
