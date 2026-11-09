// look-world: every ground-level surface of a place (the floor by land use, plaza stone, grass, paths,
// asphalt, kerbs, the painted markings, flat roofs). One shader, a material per surface kind:
//  - a stylised CC0 texture (art/world/ground, tools/world/make_world_art.py) tiled in WORLD space
//    (tile_m metres a repeat), so roads, squares and kerbs need no UVs and joins never seam;
//  - a large world-space wear map breaking the tiling: grime (R), cracks/stains/patches (G), macro (B);
//  - the place's baked shade (place_bake.gd, rendered once at build: R = cast shadow, G = contact AO):
//    the shadow takes the sun's direct light away in light() (so shade is lit by the cool sky ambient,
//    the art direction's warm-light/cool-shade), the AO darkens towards the preset's contact-AO colour.
// No extra pass; the bake is one texture read.
shader_type spatial;
render_mode cull_back, specular_disabled;

uniform sampler2D albedo_tex : source_color, filter_linear_mipmap, repeat_enable;
uniform float tile_m = 4.0;
uniform vec3 tint : source_color = vec3(1.0);
uniform float use_vcol = 0.0;          // 1: the vertex colour multiplies the albedo (markings, roof tints)
uniform sampler2D wear_tex : filter_linear_mipmap, repeat_enable;
uniform float wear_tile = 24.0;
uniform float grime_k = 0.35;
uniform float crack_k = 0.3;
uniform float macro_k = 0.12;
uniform sampler2D bake_tex : filter_linear;
uniform vec4 bake_rect = vec4(-210.0, -280.0, 420.0, 420.0);   // x0, z0, size x, size z (metres)
uniform float bake_on = 0.0;
uniform float shadow_k = 0.72;          // the share of direct sun a baked shadow removes
uniform vec3 ao_col : source_color = vec3(0.42, 0.416, 0.478);
uniform float ao_alpha = 0.55;
uniform float roughness = 0.92;
uniform float uv_world_y = 0.0;        // 1: tile on (x+z, y) for vertical faces (kerb fronts)

varying vec3 wpos;
varying float vshadow;

vec3 to_lin(vec3 c) {
	return pow(max(c, vec3(0.0)), vec3(2.2));   // vertex colours are authored in sRGB
}

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 p = mix(wpos.xz, vec2(wpos.x + wpos.z, wpos.y), uv_world_y);
	vec3 a = texture(albedo_tex, p / tile_m).rgb * tint;
	a *= mix(vec3(1.0), to_lin(COLOR.rgb), use_vcol);
	vec3 w = texture(wear_tex, wpos.xz / wear_tile).rgb;
	a *= 1.0 - w.r * grime_k * 0.3;
	a *= 1.0 - w.g * crack_k * 0.35;
	a *= 1.0 + (w.b - 0.5) * macro_k * 2.0;
	float sh = 0.0;
	if (bake_on > 0.5) {
		vec2 buv = (wpos.xz - bake_rect.xy) / bake_rect.zw;
		if (buv.x > 0.0 && buv.y > 0.0 && buv.x < 1.0 && buv.y < 1.0) {
			vec2 b = texture(bake_tex, buv).rg;
			sh = clamp(b.r, 0.0, 1.0);
			a *= mix(vec3(1.0), ao_col, clamp(b.g, 0.0, 1.0) * ao_alpha);
		}
	}
	vshadow = sh;
	ALBEDO = a;
	ROUGHNESS = roughness;
}

void light() {
	float ndl = clamp(dot(NORMAL, LIGHT), 0.0, 1.0);
	DIFFUSE_LIGHT += ndl * ATTENUATION * LIGHT_COLOR / PI * (1.0 - vshadow * shadow_k);
}
