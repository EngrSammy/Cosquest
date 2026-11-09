// look-world: building facades from the regional trim sheets (art/world/trims, art direction 4.3). place.gd
// lays every wall out in bands (plinth, ground floor shopfront or bay, string course, upper bays, roof
// edge, parapet; blank walls for sheds and narrow returns) and gives each band its sheet row in UV.
//  - albedo x the building's wall colour (vertex colour, from the region's wall list) where the sheet's
//    tint mask (ORM blue) says wall: one sheet, 4 to 6 looks;
//  - ORM: R AO, G roughness, A glass. Glass reflects the sky (fresnel) and some windows are lit warm, per
//    window (UV2: x the building's seed, y the floor), at the time preset's strength (never white);
//  - normal map at half strength; the hemisphere ambient the other shaders use; contact shade at the foot.
shader_type spatial;
render_mode cull_back, shadows_disabled;

uniform sampler2D albedo_tex : source_color, filter_linear_mipmap, repeat_enable;
uniform sampler2D orm_tex : filter_linear_mipmap, repeat_enable;
uniform sampler2D normal_tex : hint_normal, filter_linear_mipmap, repeat_enable;
uniform float normal_k = 1.0;
uniform vec3 window_col : source_color = vec3(1.0, 0.851, 0.627);
uniform float windows_k_mul = 0.15;   // the preset's window emission (arena.gd TIMES "windows")
uniform float lit_share = 0.45;
uniform vec3 sky_upper : source_color = vec3(0.525, 0.682, 0.878);
uniform vec3 sky_horizon : source_color = vec3(0.949, 0.867, 0.761);
uniform float ao_height = 2.0;
uniform float ao_min = 0.6;
uniform vec3 hemi_up : source_color = vec3(0.54, 0.6, 0.98);
uniform vec3 hemi_horizon : source_color = vec3(0.8, 0.74, 0.9);
uniform vec3 hemi_ground : source_color = vec3(0.6, 0.48, 0.5);
uniform float hemi_energy = 0.0;

varying float wy;

vec3 hemi_extra(vec3 nw) {
	vec3 c = nw.y > 0.0 ? mix(hemi_horizon, hemi_up, nw.y) : mix(hemi_horizon, hemi_ground, -nw.y);
	return (c - hemi_up) * hemi_energy;
}

float hash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

vec3 to_lin(vec3 c) {
	return pow(max(c, vec3(0.0)), vec3(2.2));   // vertex colours are authored in sRGB
}

void vertex() {
	wy = (MODEL_MATRIX * vec4(VERTEX, 1.0)).y;
}

void fragment() {
	vec3 base = texture(albedo_tex, UV).rgb;
	vec4 orm = texture(orm_tex, UV);
	vec3 wall = base * to_lin(COLOR.rgb) / 0.604;   // the sheet's tinted areas average 0.8 (sRGB)
	vec3 a = mix(base, wall, orm.b);
	float glass = smoothstep(0.35, 0.75, orm.a);
	float ao = mix(ao_min, 1.0, smoothstep(0.0, ao_height, wy)) * mix(1.0, orm.r, 0.35);
	vec3 nw = (INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz;
	// a window's own lit state and level: the building's seed, its floor, and which 2 m of the wall
	float cell = floor(UV.x * 4.0);
	float hsh = hash12(vec2(UV2.x * 97.0 + cell, UV2.y * 13.0 + cell * 0.37));
	float lit = step(hsh, lit_share) * mix(0.45, 1.0, fract(hsh * 7.31));
	float fres = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 3.0);
	vec3 sky = mix(sky_horizon, sky_upper, 0.55);
	ALBEDO = a * ao;
	ROUGHNESS = mix(max(orm.g, 0.6), 0.2, glass);
	NORMAL_MAP = texture(normal_tex, UV).rgb;
	NORMAL_MAP_DEPTH = normal_k;
	EMISSION = glass * (window_col * lit * windows_k_mul + sky * (0.06 + 0.32 * fres) * (1.0 - lit * min(windows_k_mul, 1.0)));
	EMISSION += ALBEDO * hemi_extra(nw);
}
