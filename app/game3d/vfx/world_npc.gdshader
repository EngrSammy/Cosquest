// look-world: distant pedestrian silhouettes (billboards turned about y to the camera), one MultiMesh;
// INSTANCE_CUSTOM.x picks the figure in art/world/misc/npc_atlas.png (8 across).
shader_type spatial;
render_mode cull_disabled, shadows_disabled;

uniform sampler2D atlas : source_color, filter_linear_mipmap;
uniform float cells = 8.0;

void vertex() {
	// Godot's y-billboard (as BaseMaterial3D BILLBOARD_FIXED_Y), keeping the instance's scale
	float s = length(MODEL_MATRIX[0].xyz);
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(
		vec4(normalize(cross(vec3(0.0, 1.0, 0.0), INV_VIEW_MATRIX[2].xyz)) * s, 0.0),
		vec4(0.0, s, 0.0, 0.0),
		vec4(normalize(cross(INV_VIEW_MATRIX[0].xyz, vec3(0.0, 1.0, 0.0))) * s, 0.0),
		MODEL_MATRIX[3]);
	MODELVIEW_NORMAL_MATRIX = mat3(MODELVIEW_MATRIX);
	UV = vec2((UV.x + floor(INSTANCE_CUSTOM.x + 0.5)) / cells, UV.y);
}

void fragment() {
	vec4 c = texture(atlas, UV);
	if (c.a < 0.5) {
		discard;
	}
	ALBEDO = c.rgb;
	ROUGHNESS = 0.9;
}
