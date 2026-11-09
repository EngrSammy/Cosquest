// cq 013: the body of fx_card.gdshader and fx_card_top.gdshader (see fx_card.gdshader).

uniform sampler2D atlas : source_color, filter_linear_mipmap, repeat_disable;
uniform float cell = 0.0;
uniform vec4 tint : source_color = vec4(1.0);
uniform float add = 0.6;
uniform float hot = 0.0;
uniform float intensity = 1.0;
uniform int billboard = 1;
uniform float spin = 0.0;

void vertex() {
	vec3 sx = MODEL_MATRIX[0].xyz;
	vec3 sy = MODEL_MATRIX[1].xyz;
	if (billboard == 1) {
		float c = cos(spin);
		float s = sin(spin);
		vec3 r = INV_VIEW_MATRIX[0].xyz * c + INV_VIEW_MATRIX[1].xyz * s;
		vec3 u = -INV_VIEW_MATRIX[0].xyz * s + INV_VIEW_MATRIX[1].xyz * c;
		MODELVIEW_MATRIX = VIEW_MATRIX * mat4(vec4(r * length(sx), 0.0), vec4(u * length(sy), 0.0), vec4(INV_VIEW_MATRIX[2].xyz, 0.0), MODEL_MATRIX[3]);
	} else if (billboard == 2) {
		vec3 axis = normalize(sy);
		vec3 to_cam = normalize(INV_VIEW_MATRIX[3].xyz - MODEL_MATRIX[3].xyz);
		vec3 side = normalize(cross(axis, to_cam));
		MODELVIEW_MATRIX = VIEW_MATRIX * mat4(vec4(side * length(sx), 0.0), vec4(sy, 0.0), vec4(to_cam, 0.0), MODEL_MATRIX[3]);
	} else if (billboard == 3) {
		vec3 r = normalize(vec3(INV_VIEW_MATRIX[0].x, 0.0, INV_VIEW_MATRIX[0].z));
		MODELVIEW_MATRIX = VIEW_MATRIX * mat4(vec4(r * length(sx), 0.0), vec4(0.0, length(sy), 0.0, 0.0), vec4(cross(r, vec3(0.0, 1.0, 0.0)), 0.0), MODEL_MATRIX[3]);
	}
}

void fragment() {
	vec2 c = vec2(mod(cell, 4.0), floor(cell / 4.0));
	float a = texture(atlas, (c + clamp(UV, vec2(0.004), vec2(0.996))) * 0.25).a;
	vec4 col = tint * COLOR;
	float al = a * col.a;
	vec3 rgb = mix(col.rgb, vec3(1.0, 0.99, 0.95), hot * smoothstep(0.5, 1.0, a)) * intensity;
	ALBEDO = rgb * al;
	ALPHA = al * (1.0 - add);
}
