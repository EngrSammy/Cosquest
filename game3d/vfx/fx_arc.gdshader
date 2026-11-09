// cq 013: slash arcs and weapon ribbons (fx.gd), layered in one premultiplied-alpha draw:
//   a saturated colour body (blended, so it keeps its colour on the light paving),
//   a white-hot core along the cutting edge, a soft additive glow halo either side of the
//   edge (the effect's own bloom), and scrolling energy streaks, fading towards the tail.
// UV.x along the arc: 0 where the swing started, 1 at the leading edge. Only u <= head shows
// (the sweep), and it fades out over tail_len behind the head.
// Drawn over the fighters (no depth test), as phone action games draw their slashes, so the
// arc reads even where it passes behind the boss.
// UV.y across: 0 inner edge (hilt side), EDGE_V the cutting edge, 1 the halo's outer limit.
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, depth_test_disabled, cull_disabled, shadows_disabled, fog_disabled;

uniform vec4 tint : source_color = vec4(0.3, 0.7, 1.0, 1.0);
uniform vec4 glow : source_color = vec4(0.5, 0.8, 1.0, 1.0);
uniform sampler2D tile : filter_linear_mipmap, repeat_enable;
uniform float head = 1.0;
uniform float tail_len = 1.0;
uniform float alpha = 1.0;
uniform float core = 1.0;
uniform float halo = 1.0;
uniform float body = 0.85;
uniform float scroll = 2.0;

const float EDGE_V = 0.72;

void fragment() {
	float u = UV.x;
	float v = UV.y;
	if (u > head + 0.002) {
		discard;
	}
	float t = clamp((u - (head - tail_len)) / max(tail_len, 0.001), 0.0, 1.0);
	float fade = t * t * (3.0 - 2.0 * t);
	float n = texture(tile, vec2(u * 1.6 - TIME * scroll, v * 0.9)).r;
	// body: deep at the hilt side, full colour towards the edge
	float b = pow(smoothstep(0.0, EDGE_V, v), 1.6) * (1.0 - smoothstep(EDGE_V - 0.02, EDGE_V + 0.05, v));
	float ba = b * body * fade * (0.7 + 0.45 * n) * alpha;
	vec3 brgb = mix(tint.rgb * 0.55, tint.rgb, smoothstep(0.1, EDGE_V, v));
	// white-hot core along the edge, strongest at the head
	float cd = (v - (EDGE_V - 0.04)) / 0.055;
	float ca = exp(-cd * cd) * core * clamp(fade * 1.25, 0.0, 1.0) * alpha;
	// halo: soft additive glow round the edge
	float hd = (v - EDGE_V) / (v > EDGE_V ? 0.16 : 0.32);
	float ha = exp(-hd * hd) * halo * fade * (0.6 + 0.5 * n) * alpha;
	vec3 rgb = brgb * ba;
	float a = ba;
	rgb = vec3(1.0, 0.98, 0.92) * ca + rgb * (1.0 - ca);
	a = ca + a * (1.0 - ca);
	rgb += glow.rgb * ha * 0.75;
	ALBEDO = rgb;
	ALPHA = clamp(a, 0.0, 1.0);
}
