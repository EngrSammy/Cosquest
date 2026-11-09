// Shop fronts at dusk (cq 011): the Kenney city kits share one colour atlas, and its glass
// swatches are the blue ones. Those texels glow warm, as lit windows do at dusk; the walls
// get a little warmth and saturation so the street reads like the reference, not grey boxes.
// One pass, no extra draw calls. cq 015: less self-lift (the sky ambient lights the walls now),
// brighter windows, contact shade at the foot of the wall.
shader_type spatial;
render_mode cull_back, shadows_disabled;

uniform sampler2D atlas : source_color, filter_linear_mipmap;
// env-fixes 2 (audit issues 3, 6, 11): no pink tint (was (1.0, 0.92, 0.95)), almost no self-lift
// (was 0.12: it greyed every shadow side), and the windows a clamped warm glow (was 3.0: clipped)
uniform vec3 tint : source_color = vec3(1.0);
uniform vec3 window_col : source_color = vec3(1.0, 0.76, 0.46);
uniform float window_k = 1.6;
uniform float windows_k_mul = 1.0;  // the time of day (arena.gd TIMES "windows"): lit at dusk, dim by day
uniform float lift = 0.03;  // light bounced off the lit street: the walls never go fully black
uniform float sat = 1.1;
// cq 015: the walls darken softly towards the paving (contact shade, the street's own baked AO
// strip continues it on the ground); lit windows are not darkened
uniform float ao_height = 1.6;
uniform float ao_min = 0.55;

// cq 015: the dusk sky's hemisphere ambient over the flat sky-up ambient the environment gives
// (arena.gd SKY_*, set_hemi): walls get the lilac horizon, undersides the warm bounce. ALU only.
uniform vec3 hemi_up : source_color = vec3(0.54, 0.6, 0.98);
uniform vec3 hemi_horizon : source_color = vec3(0.8, 0.74, 0.9);
uniform vec3 hemi_ground : source_color = vec3(0.6, 0.48, 0.5);
uniform float hemi_energy = 0.0;

vec3 hemi_extra(vec3 nw) {
	vec3 c = nw.y > 0.0 ? mix(hemi_horizon, hemi_up, nw.y) : mix(hemi_horizon, hemi_ground, -nw.y);
	return (c - hemi_up) * hemi_energy;
}

// cq 015: dusk depth, the fronts up the street cool towards the dusk (arena.gd DUSK_*); lit windows don't
uniform vec3 dusk_col : source_color = vec3(1.0);
uniform vec2 dusk_z = vec2(-6.0, -30.0);

varying float wy;
varying float wz;

void vertex() {
	vec3 wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wy = wp.y;
	wz = wp.z;
}

void fragment() {
	vec3 c = texture(atlas, UV).rgb;
	float l = dot(c, vec3(0.299, 0.587, 0.114));
	vec3 s = mix(vec3(l), c, sat);
	float glass = smoothstep(0.12, 0.26, c.b - max(c.r, c.g));
	float ao = mix(ao_min, 1.0, smoothstep(0.0, ao_height, wy));
	vec3 dusk = mix(vec3(1.0), dusk_col, smoothstep(dusk_z.x, dusk_z.y, wz));
	ALBEDO = mix(s * tint * ao * dusk, vec3(0.08, 0.06, 0.1), glass * 0.7);
	EMISSION = min(window_col * glass * window_k * windows_k_mul * (0.75 + 0.5 * l), vec3(1.4)) + s * tint * lift * ao * dusk * (1.0 - glass);
	ROUGHNESS = 0.9;
	EMISSION += ALBEDO * hemi_extra((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz) * ao;
}
