// look-world: the kit (props, roof clutter, trees, landmarks; world_props.gd, world_landmarks.gd). Their
// meshes carry their colour and baked AO in the vertex colour; this adds a painterly detail texture
// (props noise, landmark stone, canopy breakup) projected in world space (triplanar, no UVs), the
// hemisphere ambient, wind sway on foliage (vertex alpha = sway weight), wing flaps on birds, and an
// emission for lamp heads (only lit at dusk). One shader, a material per surface class.
shader_type spatial;
render_mode cull_back, shadows_disabled;

uniform sampler2D detail_tex : filter_linear_mipmap, repeat_enable;
uniform float detail_tile = 2.0;
uniform float detail_k = 0.35;       // 0: vertex colour only; 1: the texture fully multiplies (mean 0.5 -> x1)
uniform float detail_mean = 0.5;
uniform vec3 tint : source_color = vec3(1.0);
uniform float rough = 0.7;
uniform float sway = 0.0;            // metres of sway at a weight of 1
uniform float flap = 0.0;            // bird wing flap amplitude (radians-ish)
uniform vec3 emit_col : source_color = vec3(1.0, 0.8, 0.5);
uniform float emit_k = 0.0;
uniform float emit_from_vcol = 0.0;
uniform float cull_two = 0.0;
uniform float lift = 0.1;            // a little bounced light, so shade sides never go black (bronze, granite)
uniform vec3 hemi_up : source_color = vec3(0.54, 0.6, 0.98);
uniform vec3 hemi_horizon : source_color = vec3(0.8, 0.74, 0.9);
uniform vec3 hemi_ground : source_color = vec3(0.6, 0.48, 0.5);
uniform float hemi_energy = 0.0;

varying vec3 wpos;
varying vec3 wnrm;

vec3 hemi_extra(vec3 nw) {
	vec3 c = nw.y > 0.0 ? mix(hemi_horizon, hemi_up, nw.y) : mix(hemi_horizon, hemi_ground, -nw.y);
	return (c - hemi_up) * hemi_energy;
}

vec3 to_lin(vec3 c) {
	return pow(max(c, vec3(0.0)), vec3(2.2));   // vertex colours are authored in sRGB
}

void vertex() {
	vec3 ip = MODEL_MATRIX[3].xyz;
	float ph = ip.x * 0.37 + ip.z * 0.21;
	if (sway > 0.0) {
		float w = COLOR.a;
		VERTEX.x += sin(TIME * 1.3 + ph) * w * sway;
		VERTEX.z += cos(TIME * 1.07 + ph * 1.3) * w * sway * 0.6;
		VERTEX.y += sin(TIME * 2.3 + ph + VERTEX.x) * w * sway * 0.15;
	}
	if (flap > 0.0) {
		float w = COLOR.a;
		VERTEX.y += sin(TIME * 14.0 + ph * 5.0) * w * flap * abs(VERTEX.x);
	}
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wnrm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	vec3 bw = pow(abs(wnrm), vec3(4.0));
	bw /= (bw.x + bw.y + bw.z + 1e-4);
	float d = texture(detail_tex, wpos.yz / detail_tile).r * bw.x
		+ texture(detail_tex, wpos.xz / detail_tile).r * bw.y
		+ texture(detail_tex, wpos.xy / detail_tile).r * bw.z;
	float m = mix(1.0, d / detail_mean, detail_k);
	ALBEDO = to_lin(COLOR.rgb) * tint * m;
	ROUGHNESS = rough;
	vec3 nw = (INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz;
	EMISSION = ALBEDO * (hemi_extra(nw) + vec3(lift)) + mix(emit_col, to_lin(COLOR.rgb), emit_from_vcol) * emit_k;
}
