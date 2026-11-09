// cq 013: one shader for every effect card and particle (fx.gd). It draws one cell of
// art/fx/fx_atlas.png, tinted, in premultiplied alpha, so a single draw is both a coloured
// body that holds its colour on the light paving (blend) and a glow (add):
//   add = 0 blends like an ordinary transparent card, add = 1 is purely additive.
// "hot" turns the densest part of the cell white (the white-hot core of a flash).
// billboard: 0 none (the node's own orientation: flat decals), 1 faces the camera,
// 2 axial (keeps the node's Y axis, turns round it to the camera: velocity-aligned sparks
// with particle_flag_align_y), 3 upright (keeps world up: columns, flames).
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;
#include "res://vfx/fx_card.gdshaderinc"
