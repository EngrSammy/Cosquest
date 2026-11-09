// look-world: moving water (fountain pools, ponds, rivers): two scrolling normal maps, a shallow/deep
// tint (art direction 2.2), and the sky in a fresnel reflection, so it reads as water in daylight.
shader_type spatial;
render_mode cull_back, shadows_disabled;

uniform sampler2D water_n : hint_normal, filter_linear_mipmap, repeat_enable;
uniform vec3 shallow : source_color = vec3(0.243, 0.612, 0.769);
uniform vec3 deep : source_color = vec3(0.165, 0.435, 0.62);
uniform vec3 sky_upper : source_color = vec3(0.525, 0.682, 0.878);
uniform vec3 sky_horizon : source_color = vec3(0.949, 0.867, 0.761);
uniform float tile_m = 5.0;
uniform float speed = 1.0;

varying vec3 wpos;

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 uv = wpos.xz / tile_m;
	vec3 n1 = texture(water_n, uv + TIME * speed * vec2(0.031, 0.017)).rgb;
	vec3 n2 = texture(water_n, uv * 1.73 - TIME * speed * vec2(0.019, 0.034)).rgb;
	NORMAL_MAP = normalize(n1 + n2 - 1.0) * 0.5 + 0.5;
	NORMAL_MAP_DEPTH = 0.7;
	float fres = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 4.0);
	ALBEDO = mix(deep, shallow, 0.45 + 0.25 * (n1.r - 0.5));
	ROUGHNESS = 0.12;
	SPECULAR = 0.6;
	EMISSION = mix(sky_horizon, sky_upper, 0.6) * (0.08 + 0.5 * fres);
}
