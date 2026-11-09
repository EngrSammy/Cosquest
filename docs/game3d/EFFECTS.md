# The fight's effects (cq 013)

Skill and hit effects for the Godot fight (`app/game3d`), rebuilt in cq 013 to reach the
reference shots (big glowing slash arcs, the SPLIT energy beam, hit sparks and bursts, impact
flashes, ground scorch and dust, sparkle, a camera that sells impact). COMBAT.md has the
gameplay; this file is the look, the budget and how to tune it.

## Files
| File | What |
|---|---|
| `fx.gd` | Every effect, pooled. Public calls: `slash`, `trail_push` / `trail_cut`, `muzzle`, `sparks`, `clash`, `ko_burst`, `shock`, `ring`, `split_slam`, `ground_split`, `beam`, `whirl`, `charge_start` / `charge_end` / `speed_line`, `heal`, `shield_up`, `shatter`, `decal` / `scorch` / `crack` / `dust`, `coin` / `coin_burst`, `telegraph`, `card` (the generic building block), `budget()` |
| `vfx/fx_card.gdshader` (+ `fx_card.gdshaderinc`, `fx_card_top.gdshader`) | Cards and particles: one atlas cell, tinted, premultiplied alpha. `_top` skips the depth test (hit flashes) |
| `vfx/fx_arc.gdshader` | Slash crescents and weapon ribbons: core, body, halo, energy |
| `vfx/fx_beam.gdshader` | The SPLIT beam and the RALLY column |
| `vfx/dome.gdshader` | The SHIELD dome (fresnel, hex pattern, hit pulse, shatter) |
| `vfx/flash.gdshader` | The white hit flash on a fighter |
| `art/fx/fx_atlas.png`, `art/fx/fx_tile.png` | The effect art (self-made, `tools/fx/make_fx_art.py`) |
| `fight.gd` | Where effects fire (`_swing`, `_tick_swing`, `_cast`, `_tick_skill`, `_apply_hit`, `_parry`, the boss strike), the per-class slash colours, the weapon tip, the camera (`_impact_cam`, `_apply_camera`) |
| `fighter.gd` | The SHIELD dome's pop-in and shatter (`shield_ended` signal) |
| `hud.gd` | The damage-number punch (`_draw_pops`, `_pop_punch`) |

## How it is drawn (and why there is no bloom pass)
**cq 016:** there is now a cheap bloom (LOOK.md "Bloom", `bloom.gd`) that takes the effects as
sources: every pooled node except the slash arcs (`no_bloom` meta), and of the cards only the standing
ones (`card()` sets the layer by `flat`). The arcs and the flat WHIRL/SPLIT ground rings keep only their
own halo, as below: bloomed as well they whited out the fighters inside a WHIRL. The notes below are
cq 013's and still hold for the effects themselves.

- The app runs Godot's **Compatibility renderer** on devices: `godotArgs` in
  `features/game3d/fight3d.ts` passes `--rendering-driver opengl3 --rendering-method gl_compatibility`
  on Android and iOS (only the iOS simulator uses Metal/mobile), and `project.godot` sets
  `gl_compatibility` for desktop and mobile.
- In 4.5.1 that renderer has a glow effect, but its 3D buffer is not HDR, so nothing goes over 1.0 and
  the glow either does nothing (threshold 1.0, what cq 011 saw) or blooms the light paving as well
  (threshold lowered). It is also a full-screen multi-pass blur, the costliest thing one could add on a
  software or low-end GPU.
- So the glow lives **on the effects themselves** (fake bloom): every effect is drawn in
  **premultiplied alpha** (`blend_premul_alpha`). A single draw then carries:
  - a coloured body that is blended, so it keeps its colour on the light paving (pure additive
    washes to white there);
  - an additive glow halo around it, which is the effect's own bloom;
  - a white-hot core.
- The `add` uniform of a card sets the mix: 0 is an ordinary transparent card, 1 is purely additive.
  No full-screen pass is added.
- **For the look task:** effect glow is owned here. A scene-wide mild bloom, if the look task adds one,
  will also catch these effects. They already peak near white, so keep any scene bloom threshold high
  (or bloom only the lamps and signs) so the effects do not double-glow into white blobs.
- Hit flashes, crit and parry bursts, sparks, glints and the slash arcs/ribbons are drawn **over
  the fighters** (no depth test), as phone action games draw their slashes. Without that, a contact
  point inside the boss's body hid the flash entirely.
- Particles are **CPUParticles3D**: one draw each, small counts, no transform-feedback pass (GLES3
  GPU particles need one per system, and a software GPU pays for it). Systems hide when their burst ends.
- Everything is pooled in `fx._ready()` and reused round-robin. A busy pool reuses its oldest member,
  so a flurry of hits never grows the scene (cycles_test stays flat).
- Effects never use the fight's seeded RNG (`rng`). They use the global `randf()`, so seeded fights
  play out exactly as before.

## The art: one atlas
`art/fx/fx_atlas.png`, 1024 x 1024, a 4 x 4 grid of 256 px cells, white with the shape in alpha
(tinted in the shader). The cells are the `enum` at the top of `fx.gd`:
glow, star4, burst, sparkle, streak, ring, puff, scorch, crack, swirl, lines, halo, plus, shard, flame, dot.
`art/fx/fx_tile.png` (256 px, tileable) packs the energy streaks (R, scrolled along arcs and
beams), hex edges (G) and hex ids (B, the shatter order) for the dome, and noise (A).
Both are drawn by `tools/fx/make_fx_art.py` (numpy + Pillow, fixed seeds): edit a `cell_*`
function and run `python tools/fx/make_fx_art.py art/fx` from `app/game3d`.
The atlas imports VRAM-compressed with mipmaps (ETC2 on phones, S3TC on desktop: 1.4 MB with
mips); the tile is lossless with mipmaps (about 0.35 MB). The HUD reuses the atlas for the crit flash behind a number.

## Each effect
| Effect | Layers | Budget (nodes / particles / life) |
|---|---|---|
| Slash arc (combo hit 1, 2) | A crescent (`slash`, `fx_arc`) at chest height, edge radius 1.05 x the hitbox reach (about 2.5 m, more than a fighter's height), thick in the middle and pointed at the ends; it sweeps in over the first 30 % of its life, then the tail catches up. A thin bright **echo stroke** follows just outside it (the reference's concentric strokes). Plus a **ribbon along the real weapon tip** (`_push_tip_trail`) while a cq 012 clip plays (procedural sweep when there is no clip). Both have a white-hot core on the edge, a saturated body, an additive halo and energy streaks. | 2 arcs + 1 ribbon; 0.32 s arc, 0.36 s ribbon |
| Heavy third hit | The same, 1.2 x reach (about 3.4 m), **gold**, 0.4 s, tilted so the camera sees its face; dust on contact | 2 arcs + 1 ribbon + dust |
| Per weapon class | blade (sword, dagger, axe) blue; heavy (hammer, greatsword) orange; staff violet; **gun** (rifle, crossbow): a muzzle flash and a tracer to the target instead of an arc | `_wclass` in fight.gd, `CLASS_COLS` in fx.gd |
| Hit spark (`sparks`) | Tier by damage (under 110, under 190, more): velocity-aligned streak sparks thrown away from the attacker (10 / 18 / 30), a white-hot star flash and a glow at the contact point on the body's surface; tiers 2 and 3 add a ring | 2 to 3 cards + 1 system, 0.15 to 0.32 s |
| Crit | A tier up, plus a spiky burst, radial speed streaks and glints; a small scorch decal under the target; camera trauma + 1.6 deg zoom punch | +2 cards + 1 system |
| Target flash | `flash.gdshader` on the fighter: a white body pop plus a warm fresnel rim; 0.55 light, 0.7 heavy, 0.85 crit, decays 7/s | the fighter's overlay pass (only while it shows) |
| Parry (`clash`) | Two crossed white/gold stars, a glow, radial streaks, big spark burst, glints, a gold shock ring | 5 cards + 2 systems |
| KO (`ko_burst` + `coin_burst`) | A burst, glow, streaks, shock ring, sparkles, sparks, big dust; six coins thrown up in arcs with glints (pure visuals) | 6 cards + 3 systems + 6 coins |
| CHARGE | Start: speed-line burst, glow, ground ring, dust. Dash: a tall cyan energy ribbon and speed streaks flying back. End: star flash, glow, shock ring, sparks, dust, camera kick | about 12 cards over 0.4 s + 1 ribbon |
| SPLIT (`split_slam`) | Two beams (a deep blue sheath 4.2 m wide, 16 m tall, and a 1.5 m bright core) that flare to full width in a few frames, scrolling energy, a 10 m light spike along the ground, a big glow and star, a 10 m warm ground flash, a gold swirl and halo and shock ring on the ground, a glowing crack that cools into a scorch, dust, embers; then 5 bursts run 7 m along the split (flame tongue, glow, glowing crack, scorch, sparks) | 2 beams + about 9 cards + 3 systems, then 5 x (3 cards + 1 decal + 1 system) |
| WHIRL (`whirl`, per hit) | Four swept arcs spinning round the hero at blade height (gold, then pink on the second hit), a spinning blade-ring swirl, a ring, a pink halo, a ground swirl, a shock ring, sparks thrown outward | 4 arcs + 6 cards + 2 systems, 0.45 to 0.6 s |
| SHIELD | Going up: shock ring, glow, glints, the dome pops in. The dome: fresnel rim, a bright hem, hex pattern drifting up, a pulse on every absorbed hit (plus a ring), and a 0.3 s shatter (hex cells drop out with hot edges, glass shards, flash, ring) when it breaks or runs out | the dome (1 per fighter) + 3 to 4 cards + 1 system |
| RALLY (`heal`, per ally) | A rising green column (`fx_beam`, 2.4 x 5 m, flowing up), three flame tongues rising round the ally, motes rising from a ring, sparkles, a shock ring, a halo at the feet and a rising plus | 1 beam + 6 cards + 2 systems, 1.1 s |
| Boss strike | A big red crescent and a red ribbon across the swipe; the slam gets a shock ring, sparks, a glowing crack + scorch and dust | as above |
| Boss telegraph (`telegraph.gdshader`) | Drawn as light, not paint: a faint fill that thickens towards the advancing front, a glowing front line and a glowing rim. Same shape and timing: the strike lands when the front meets the rim | 1 node per telegraph (4 pooled) |
| Ground decals | Scorch (SPLIT, slam, crits), cracks (SPLIT, slam), dust puffs (big hits, KO); flat cards in their own pool of **12**, fading out over 3 to 4.5 s (the oldest is reused) | 12 max |
| Dust | Puff particles (blended, warm grey), big ones add a faint dust ring decal: dashes, dodges, landings, heavy hits, KO | 5 systems x 10 |
| Coins | A spinning coin with a glint and sparkles when a big hit lands on the boss (as before), plus the KO burst | 6 coins |
| Damage numbers | Same styles and colours as cq 011; now they pop in from 45 % to 138 % (150 % heavy, 175 % crit) in 0.06 s, settle under full size and back, sit at a slight random tilt, fly out on an arc, and fade over 0.28 s. A crit has a hot burst and glow flash behind it for its first 0.26 s | HUD only |

## Camera impact (`fight.gd`)
- **Trauma** (0..1) adds up per event and decays at 2.2/s. The offset is trauma squared, so light
  hits barely move the view and big ones kick it: at most 0.32 m sideways/up plus 2 deg of roll at full
  trauma. On a 16.5 m camera that is a few percent of the screen; the HUD (2D) never moves.
- Sources:
  - every legacy `_shake_cam(amount)` call adds `amount x 1.6`;
  - `_impact_cam(trauma, fov_kick, dir)` adds trauma, a **zoom punch** (FOV down by up to 4 deg,
    springing back at 14 deg/s) and a short **kick** of the view along the blow.
- Light hit 0.14, heavy 0.32 + 1.2 deg, crit 0.42 + 1.6 deg, parry 0.4 + 1.2 deg, CHARGE end
  0.35 + 1.5 deg, SPLIT 0.6 + 4 deg (plus its shake), boss swipe 0.35 + 1.2 deg, boss slam 0.55 + 2.5 deg,
  KO 0.7 + 2.5 deg. Hit-stop is unchanged.
- **Reduce motion:** the app's Settings > Appearance > Reduce motion is sent as `reduce_motion`
  (`buildFightConfig`). With it on, the shake is 30 % and there is no zoom punch.
- The old shake's two `rng` draws per shaking frame are kept, but their values are no longer used.
  They keep the seeded RNG advancing exactly as before, so crits and the boss's choices are unchanged.

## Budget (measured; see cq 013's REPORT.md for the runs)
- Pooled once: 12 arcs, 48 cards, 20 top cards, 12 decals, 4 beams, 6 coins, 4 telegraphs,
  29 particle systems (454 particles allocated at most), plus one ribbon per trail key (at most 10).
- In the autoplay fight (10 runs) the peak was 45 to 51 live effect nodes and 168 to 194 live particles;
  `fx_pool` (pooled nodes + particle systems) is 141.
- Draw calls: the fight's per-frame draws, idle versus the busiest effect frames, are in the REPORT's
  frame-time table. A hidden pooled node costs nothing.
- Texture memory for the new art: about 1.75 MB (atlas 1.4 MB, tile 0.35 MB). Twelve old effect textures
  were removed.
- To cut cost on a slow device: drop the second SPLIT beam, the WHIRL ground swirl, or a spark tier's
  count (`_ready()` spec table). Each of those is one draw or a few dozen particles.

## How to tune
- Colours: `CLASS_COLS` / `GOLD` (fx.gd) and `CHARGE_COLS`, `WHIRL_COLS`, `BOSS_COLS` (fight.gd) are
  `[body, glow]` pairs.
- Sizes: the arc radius is a multiple of the combo hit's `reach` in `_swing`; skill sizes are the
  arguments in each `fx.*` function.
- Brightness: on a card, `add` (glow share), `hot` (white core) and `intensity`; on arcs, the `core`,
  `halo` and `body` uniforms of `fx_arc`.
- Timing: each call's `life`; arcs sweep in over 35 % of theirs.
- Shake: `TRAUMA_DECAY`, `SHAKE_MAX_M`, `SHAKE_MAX_ROLL`, `FOV_KICK_DECAY` and the `_impact_cam` call
  sites.
- Review captures: cq 013's `cap/tune.json` (the scripted fight at the moments each effect peaks).
