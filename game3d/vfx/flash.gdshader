// Fighter overlay (cq 233): a team-coloured rim light plus the white hit flash.
// cq 013: the flash reads as an impact: a hot white core that fills the body at its peak
// and a warm fresnel rim that lingers a beat longer as it decays.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_back, shadows_disabled;

uniform vec4 rim_color : source_color = vec4(0.5, 0.8, 1.0, 1.0);
uniform float rim_amount = 0.35;
uniform float flash = 0.0;

void fragment() {
	float f = 1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0);
	float body = smoothstep(0.35, 1.0, flash);
	vec3 c = rim_color.rgb * pow(f, 3.0) * rim_amount
		+ vec3(1.0, 0.97, 0.92) * flash * (0.6 * body + 0.75 * pow(f, 1.5))
		+ vec3(1.0, 0.85, 0.6) * flash * pow(f, 3.0) * 0.6;
	ALBEDO = c;
}
