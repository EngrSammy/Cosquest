// cq 013: fx_card.gdshader drawn over everything (no depth test): hit flashes and the
// crit/parry bursts, which must read even when the contact point is inside a body.
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, depth_test_disabled, cull_disabled, shadows_disabled, fog_disabled;
#include "res://vfx/fx_card.gdshaderinc"
