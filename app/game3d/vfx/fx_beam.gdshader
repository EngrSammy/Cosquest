// cq 013: the SPLIT energy beam and the RALLY column (fx.gd): an upright card that turns
// round world up to face the camera. UV.x across (0.5 the axis), UV.y up (0 the ground).
// Layers in one premultiplied-alpha draw: a white core, a blended colour sheath, a wide
// additive glow, and energy streaks scrolling up the beam.
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

uniform vec4 tint : source_color = vec4(0.45, 0.75, 1.0, 1.0);
uniform vec4 glow : source_color = vec4(0.55, 0.85, 1.0, 1.0);
uniform sampler2D tile : filter_linear_mipmap, repeat_enable;
uniform float alpha = 1.0;
uniform float core_w = 0.07;
uniform float sheath_w = 0.2;
uniform float sheath = 0.6;
uniform float speed = 3.0;
uniform float top_fade = 0.55;
uniform float flow = 1.0;

void vertex() {
	vec3 r = normalize(vec3(INV_VIEW_MATRIX[0].x, 0.0, INV_VIEW_MATRIX[0].z));
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(vec4(r * length(MODEL_MATRIX[0].xyz), 0.0), vec4(0.0, length(MODEL_MATRIX[1].xyz), 0.0, 0.0), vec4(cross(r, vec3(0.0, 1.0, 0.0)), 0.0), MODEL_MATRIX[3]);
}

void fragment() {
	float x = abs(UV.x - 0.5) * 2.0;     // 0 axis .. 1 edge of the card
	float y = 1.0 - UV.y;                 // QuadMesh UV.y runs down: y 0 ground .. 1 top
	float n = texture(tile, vec2(y * 1.2 - TIME * speed, UV.x * 1.3)).r;
	float n2 = texture(tile, vec2(y * 0.7 - TIME * speed * 0.6 + 0.37, UV.x * 0.8 + 0.21)).r;
	float vfade = smoothstep(0.0, 0.04, y) * (1.0 - smoothstep(top_fade, 1.0, y));
	float c = exp(-(x * x) / (core_w * core_w));
	float s = exp(-(x * x) / (sheath_w * sheath_w));
	float g = exp(-(x * x) / 0.25);
	float sa = s * sheath * (0.65 + 0.6 * mix(1.0, n, flow)) * vfade * alpha;
	float ca = clamp(c * (0.85 + 0.3 * n2) * vfade * alpha, 0.0, 1.0);
	vec3 rgb = tint.rgb * sa;
	float a = sa;
	rgb = vec3(1.0, 0.99, 0.96) * ca + rgb * (1.0 - ca);
	a = ca + a * (1.0 - ca);
	rgb += glow.rgb * g * (0.18 + 0.3 * n2 * flow) * vfade * alpha;
	ALBEDO = rgb;
	ALPHA = clamp(a, 0.0, 1.0);
}
