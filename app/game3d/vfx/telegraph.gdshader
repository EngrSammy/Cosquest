// Boss telegraph on the ground (cq 233): a circle (half_angle = PI) or a cone
// opening towards local +Z, drawn on a unit PlaneMesh scaled to the radius.
// The fill grows from the centre to the edge over the wind-up, so the strike
// lands exactly when the fill meets the rim: that is the parry / dodge cue.
// cq 013: drawn as light, not paint (premultiplied alpha): a thin tinted fill that
// thickens towards the advancing front, a glowing front line and a glowing rim, so it
// reads as an energy warning instead of a flat coloured disc. Same timing and shape.
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

uniform vec4 tint : source_color = vec4(1.0, 0.18, 0.12, 1.0);
uniform float fill : hint_range(0.0, 1.0) = 0.0;
uniform float half_angle = 3.1416;
uniform float alpha = 1.0;
uniform float flash = 0.0;

void fragment() {
	vec2 p = (UV - 0.5) * 2.0;
	float r = length(p);
	float ang = abs(atan(p.x, p.y));
	float aa = fwidth(r) * 1.5;
	float inside = (1.0 - smoothstep(1.0 - aa, 1.0, r)) * (1.0 - smoothstep(half_angle - 0.02, half_angle, ang));
	if (inside <= 0.001) discard;
	float rim = smoothstep(0.86, 0.96, r);
	float side = 0.0;
	if (half_angle < 3.1) {
		float d = (half_angle - ang) * r;   // distance to the cone's side line
		side = 1.0 - smoothstep(0.0, 0.06, d);
	}
	float filled = 1.0 - smoothstep(fill - aa, fill, r);
	float front = smoothstep(fill - 0.1, fill, r) * filled;
	float edge = max(rim, side);
	float k = inside * alpha * tint.a;
	// blended body: faint inside, denser towards the front and at the rim
	float body = (0.06 + 0.24 * filled * smoothstep(0.0, max(fill, 0.01), r) + 0.28 * edge) * k;
	// additive glow: the advancing front line and the rim
	float glow = (0.9 * front + 0.55 * edge * (0.6 + 0.4 * fill)) * k;
	ALBEDO = tint.rgb * body + mix(tint.rgb, vec3(1.0, 0.85, 0.6), 0.3) * glow + vec3(flash) * inside * alpha;
	ALPHA = clamp(body, 0.0, 1.0);
}
