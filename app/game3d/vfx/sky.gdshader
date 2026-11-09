// The fight's sky (env-fixes 1, audit issues 1 and 2): a gradient sky drawn as the background,
// ALU only (no textures, no radiance: arena.gd keeps the ambient a flat colour). Zenith to the
// upper sky to a horizon that warms towards the sun, a soft glow round the sun, and a haze band at
// the horizon that ends in exactly the depth fog's colour, so the fogged far city and the ground
// ring melt into the sky with no seam. Presets (dusk, day) in arena.gd TIMES.
shader_type sky;

uniform vec3 zenith : source_color = vec3(0.12, 0.16, 0.36);
uniform vec3 upper : source_color = vec3(0.36, 0.38, 0.64);
uniform vec3 horizon : source_color = vec3(0.9, 0.64, 0.58);
uniform vec3 horizon_sun : source_color = vec3(1.0, 0.7, 0.42);
uniform vec3 fog : source_color = vec3(0.74, 0.6, 0.6);
uniform vec3 sun_dir = vec3(0.0, 0.56, -0.83);   // towards the sun (world space)
uniform float sun_glow = 0.55;
uniform float band = 0.09;                        // the haze band's height (sine of the elevation)

void sky() {
	vec3 d = normalize(EYEDIR);
	float y = d.y;
	vec3 s = normalize(sun_dir);
	vec2 dh = normalize(d.xz + vec2(1e-5));
	vec2 sh = normalize(s.xz + vec2(1e-5));
	float toward = max(dot(dh, sh), 0.0);
	vec3 hz = mix(horizon, horizon_sun, toward * toward * toward);
	vec3 c = mix(hz, upper, smoothstep(0.02, 0.38, y));
	c = mix(c, zenith, smoothstep(0.3, 1.0, y));
	float sd = max(dot(d, s), 0.0);
	c += horizon_sun * (pow(sd, 6.0) * 0.3 + pow(sd, 64.0) * 0.5) * sun_glow;
	// the haze band: the sky goes to the fog's colour at and below the horizon
	c = mix(fog, c, smoothstep(-0.01, band, y));
	COLOR = c;
}
