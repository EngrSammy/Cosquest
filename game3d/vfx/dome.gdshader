// SHIELD barrier (cq 233, reworked in cq 013): a glowing dome with a fresnel edge, a hex
// energy pattern drifting up it, a pulse where hits are absorbed, and a shatter when it
// ends (hex cells drop out in a random order with hot edges). Premultiplied alpha: a light
// tinted fill (blend) plus an additive rim and pattern (the dome's own glow).
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_back, shadows_disabled, fog_disabled;

uniform vec4 tint : source_color = vec4(0.2, 0.55, 1.0, 1.0);
uniform sampler2D tile : filter_linear_mipmap, repeat_enable;
uniform float alpha = 1.0;
uniform float hit = 0.0;
uniform float shatter = 0.0;
uniform float grow = 1.0;

void fragment() {
	float f = 1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0);
	float rim = pow(f, 2.0);
	vec2 huv = vec2(UV.x * 6.0, UV.y * 2.2 - TIME * 0.12);
	vec4 hx = texture(tile, huv);
	float hex = hx.g;
	float id = hx.b;
	if (shatter > 0.0 && id < shatter * 1.15 - 0.1) {
		discard;
	}
	float crack = shatter > 0.0 ? smoothstep(0.25, 0.0, abs(id - (shatter * 1.15 - 0.1))) : 0.0;
	float band = 0.5 + 0.5 * sin(UV.y * 18.0 - TIME * 4.0);
	float base_rim = 1.0 - smoothstep(0.0, 0.08, UV.y);   // bright hem where it meets the ground
	float pulse = hit * (0.6 + 0.4 * sin(UV.y * 30.0 - TIME * 30.0));
	float fill = (0.1 + 0.18 * rim) * alpha;
	vec3 glow = tint.rgb * (0.65 * rim + 0.28 * hex * (0.4 + 0.6 * rim + band * 0.3) + 0.5 * base_rim + 0.7 * pulse + 1.5 * crack) * alpha * grow;
	vec3 hotc = vec3(1.0) * (pow(f, 6.0) * 0.4 + hex * pulse * 0.6 + crack * 0.6) * alpha;
	ALBEDO = mix(tint.rgb, vec3(0.9, 0.97, 1.0), 0.4) * fill + glow + hotc;
	ALPHA = clamp(fill, 0.0, 1.0);
}
