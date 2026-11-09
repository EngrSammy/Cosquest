# The 3D fight: combat, animation hooks and weapons (cq 233, cq 011)

The Godot project is `app/game3d`. This page is the reference for the fight's rules and
numbers, and for the two hooks the sister tasks fill: **CombatAnimator** (clips) and
**hand_r** (weapons). All numbers live as constants at the top of `fight.gd`.

## Files
| File | What it does |
|---|---|
| `fight.gd` | One fight: arena, camera, the three fighters, combat rules, the boss and ally AI, the autoplay bot, instrumentation |
| `fighter.gd` | One fighter: model, hurtbox, weapon arc, flash and rim, knockback, shield, buff, procedural body motion |
| `combat_animator.gd` | **CombatAnimator**: named states, clip lookup, procedural fallback, the `hand_r` attach point |
| `pose_layer.gd` | A `SkeletonModifier3D` that turns the spine and arms for the procedural poses |
| `hit_area.gd` | A hitbox: an `Area3D` that reports each hurtbox it touches once per opening |
| `fx.gd` | Every effect: slash arcs and weapon ribbons, hit sparks and flashes, skill set pieces, decals, coins, telegraphs, bolts (pooled; cq 013, see EFFECTS.md) |
| `sfx.gd` | Sounds (Kenney CC0) |
| `hud.gd` | Joystick, attack, 5 skills, guard, timer, squad pill, minimap, overhead bars, damage numbers |
| `arena.gd` | The street plaza |
| `capture.gd` | Headless review captures (`-- --capture=<json>`) |

## Controls
- **Joystick** (bottom left): 12% dead zone, rescaled after it so the first push is a slow
  walk. Movement is camera-relative. Touching anywhere in the lower left spawns a floating
  stick under the thumb.
- **ATTACK** (bottom right): tap or hold. A press while the hero is free starts the swing
  on that frame. A press during a swing is buffered for 0.3 s. Holding the button chains.
  The three pips above it show the combo step.
- **Skills** (the arc round ATTACK): CHARGE (dash chevrons), SPLIT (sword in the ring),
  WHIRL (crescent), RALLY (golden burst), SHIELD (arcane circle), each on the reference's
  light disc. On cooldown the icon turns grey under a dark sweep with the seconds left.
  A greyed, dimmed icon with no number means the hero cannot act (staggered or down).
  A press during a swing or another skill is buffered for 0.4 s, so the buttons stay lit
  then. A ring pulses when a skill comes off cooldown.
- **GUARD** (the shield button left of the arc): hold to block; press just before a hit
  to parry; press with the stick pushed to dodge.

## The combo (`COMBO`)
| Hit | State | Length | Hitbox live | Damage | Knockback | Hit-stop | Arc |
|---|---|---|---|---|---|---|---|
| 1 | attack_1 | 0.34 s | 0.05 to 0.17 s | 60 to 80 | 0.35 m | 3 frames | right to left, 160 deg |
| 2 | attack_2 | 0.36 s | 0.05 to 0.17 s | 70 to 90 | 0.4 m | 3 frames | left to right, 160 deg |
| 3 | attack_3 (heavy) | 0.56 s | 0.17 to 0.30 s | 140 to 175 | 1.7 m | 7 frames + camera shake | overhead, 60 deg |

- **Chain:** a buffered press starts the next hit at 70% of the current one
  (`COMBO_CHAIN_AT`). The chain drops back to hit 1 after 0.55 s without a swing
  (`COMBO_RESET`), and after hit 3.
- **Crits:** 14% (x1.6 on heavy hits), x1.6 damage, a bigger orange number with "!", a star
  burst and sometimes a coin.
- **Soft lock:** a swing turns the hero to the boss if it is within 4.5 m.
- **Movement:** 4.6 m/s free, 25% during a swing, 35% while guarding, 0 during skills and
  hit stun (0.28 s).

## Hit detection
- Every fighter has a **hurtbox** (`Area3D` + capsule, layer 1 for the hero's side,
  layer 2 for the enemy), with meta `fighter`.
- Attacks are **hitboxes** (`hit_area.gd`, an `Area3D` masking the other side's layer):
  - **the weapon arc** (`fighter.weapon`): a convex fan from 0.3 m out to the reach, knee
    to head height. Every frame of a swing it is reshaped to the arc the weapon swept since
    the last frame (`fighter.sweep_arc`), so a fast swing on a 15 fps phone cannot step
    over a target;
  - skill shapes (`_skill_area`): a box for CHARGE and SPLIT (SPLIT's box grows as the
    crack runs), a cylinder for WHIRL;
  - the boss's strike area: a fan prism for the swipe, a cylinder for the slam;
  - the ally's bolts: a sphere.
- `HitArea.scan()` runs an immediate shape query of the area's own shape at its current
  transform, so a hitbox never lags a physics step. `_physics_process` also reads the
  physics server's overlap list. Each target is struck once per opening either way.
- **No distance checks decide a hit.** The AI uses distances only to choose what to do.

## Damage resolution (`_apply_hit`)
In this order:
1. **I-frames** (dodge, CHARGE): no damage, "DODGE".
2. **Guard** (the boss's strikes only, hero facing the attacker within 100 deg):
   - raised 0.22 s or less before the hit (`PARRY_WINDOW`): a **parry**. No damage,
     "PARRY!", a gold burst, the bell, 0.16 s hit-stop, and the boss **staggers for 1.6 s**,
     taking x1.5 damage meanwhile;
   - otherwise **blocked**: 20% damage, "BLOCK n" in steel blue, a small push.
3. **Crit** roll (hero side), then x1.5 if the boss is staggered.
4. **SHIELD barrier** soaks first ("ABSORB n" in light blue).
5. HP loss, the target's white flash, sparks and a flare scaled to the damage, knockback
   (the boss takes 45%), hit-stop if the hero is involved, the damage number, sound.

Damage number styles: white (normal), gold (heavy), orange "n!" (crit), red (the hero
hurt), light blue (the ally's bolts), steel blue "BLOCK n", light blue "ABSORB n",
green "+n" (heal), gold "PARRY!", cyan "DODGE".

## Skills
| Slot | Skill | Cooldown | Length | Effect |
|---|---|---|---|---|
| 0 | CHARGE | 5 s | 0.42 s | Dash 6 m (stick direction, else at the boss), i-frames 0.34 s, 110 to 140 + 1.8 m knockback to what it passes through |
| 1 | SPLIT | 8 s | 0.72 s | Hop, slam at 0.34 s; a crack runs 7 m ahead over 0.25 s: 200 to 240, 2.2 m knockback, staggers the boss 0.8 s |
| 2 | WHIRL | 6 s | 0.5 s | Two spinning hits in a 3 m ring (at 0.08 s and 0.30 s), 90 to 110 each |
| 3 | RALLY | 14 s | 0.6 s | The hero and an ally within 9 m: heal 15% of max HP and x1.3 damage for 6 s |
| 4 | SHIELD | 12 s | 0.5 s | The hero and an ally within 9 m: a barrier dome that absorbs 260 for 6 s |

Skills cancel a swing's recovery (after its hitbox closed).

## The boss
- Approaches at 1.8 m/s. Every 1.5 s it can strike:
  - **swipe**: a 110 deg cone, 3.4 m. The telegraph is a red cone on the ground that
    fills from the boss outwards over **0.8 s**. The boss tracks its target for the
    first 55% of the wind-up, then commits, so a late side-step works. 70 to 90 damage.
  - **slam**: a 2.3 m ring centred where the target stood when it began. The ring fills
    over **1.05 s**. 110 to 140 damage.
- The strike lands exactly when the fill meets the rim: guard just before that to parry.
- **Enrage** at 35% HP: a callout, wind-ups x0.8, cooldowns and speed x1.25.
- Targets the hero; 30% of the time the ally, if the ally is 2 m closer.
- HP 6500 (the hero 1000, the ally 800).

## The ally
Holds a casting spot 4 m from the boss on the hero's side, fires a bolt every 1.6 to 2.6 s
(40 to 60 damage), and walks out of a slam ring while it fills.

## Round
- 45 s (config `duration_s`). The timer pill turns red and pulses under 10 s; at 0 the
  round ends ("TIME UP", outcome `timeout`).
- Win: the boss at 0 ("VICTORY", the hero and the ally celebrate). Lose: the hero at 0.
- The squad pill shows the players alive / the squad size (from `players_text`, "2/3").
- The result goes to the app with the fight's record under `judge` (cq 019): at a duel point on a server
  that judges 3D fights it is sent to the server and pays XP (docs/game3d/XP.md); elsewhere it is a
  practice fight (0 XP). Extra keys: `parries`,
  `blocks`, `dodges`, `crits`, `combo_max` and `skills` (uses per slot).

## CombatAnimator (for the animations task)
`combat_animator.gd`, one per fighter (`fighter.anim`).

**States:** `idle`, `walk`, `run`, `attack_1`, `attack_2`, `attack_3`, `heavy`, `hit`,
`guard`, `parry`, `dodge`, `skill_charge`, `skill_split`, `skill_whirl`, `skill_rally`,
`skill_shield`, `death`, `victory`.

- `idle`, `walk`, `run` and `guard` loop. `death` and `victory` hold their last frame.
  Everything else is a one-shot.
- `heavy` is the boss's telegraphed strike. Its strike frame should sit at about 72% of
  the clip: the fight plays it over wind-up / 0.72.
- **How a clip is found:** on load, `bind()` walks the GLB's `AnimationPlayer`. For each
  state it takes, in order:
  1. a clip named exactly like the state (case-insensitive; a `library|` prefix and
     `-`, `.`, spaces are ignored);
  2. else one of the aliases in `ALIASES` (`attack1`, `slash1`, `sword_attack`,
     `hit_react`, `block`, `roll`, `die`, `celebrate`, ...).
- **Timing:** a one-shot clip is time-stretched to the gameplay length (`play(state, len)`
  sets the speed to clip length / game length). The hit windows in the tables above never
  depend on the art. Hit-stop freezes the clip (`speed_scale` 0).
- **Fallback:** a state with no clip uses the procedural pose (`POSES`: keyframes of spine
  and arm angles applied by `pose_layer.gd` on Mixamo-named bones) plus the body motion
  in `fighter._body_motion` (lunge, hop, spin, lean). A model with no skeleton gets the
  body motion only. A model with no clips at all still fights.
- **To add a clip:** name the Blender action after the state (`attack_1`, `hit`,
  `skill_whirl`, ...) and export it in the character's GLB. Nothing in the code changes.
  The load log line (`CQ load role=hero ... mapped={...}`) lists what was picked up.
- **To add a state:** add it to `STATES` (and `LOOPING` / `HOLD_LAST` if needed), give
  it aliases and a `POSES` entry, then call `fighter.act("<state>", seconds)` from the fight.

**Cast clips (cq 012):** the rigged cast characters now bring their own clip library
(`app/game3d/anim/<key>.glb`, `anim_library.gd`), picked per weapon class, time-warped so
each clip's contact frame (data) lands on the hit moment that `fighter.act(state, length,
hit_at)` passes. See `docs/game3d/ANIMATIONS.md`.

## hand_r (for the weapons task)
- `fighter.hand_r()` returns the right-hand attach point:
  - a `BoneAttachment3D` named `hand_r` on the first bone matching `RightHand`, `hand_r`,
    `hand.R`, `Hand_R`, `mixamorig:RightHand` (all 060 rigged deck models have
    `RightHand`);
  - else a stand-in `Node3D` at the right hip (models without a skeleton).
  - The load log shows which: `hand=bone` or `hand=standin`.
- `fighter.attach_weapon(node, reach)` parents a weapon scene there (replacing the last
  one) and, with `reach` > 0, sets the weapon arc's reach in metres for the next swings.
- Author the weapon with its grip at the origin, the blade along +Y (the hand bone's axis
  towards the fingers in Mixamo rigs), and an optional child `tip` at the blade's end.
- The hitbox is the swept arc (above), not the weapon's own mesh, so a weapon never
  changes the combat numbers unless you pass `reach`.

## The street and the HUD frame
- **Camera:** pitch 34 deg, 20 m out, FOV 52, turned 12 deg left, the focus 3 m ahead of the fight
  (`CAM_*` in `fight.gd`; cq 016, was pitch 44, 16.5 m, FOV 55, yaw 0, 0.6 m ahead): the fight in the
  lower half, the street, its shop fronts and the cross street up the screen as on the reference
  (LOOK.md "Composition"). The autoplay bot and the ally steer in the street's own frame
  (`_play_right` / `_play_fwd`), so the camera never changes a seeded fight.
- **Street** (`arena.gd`): 11.2 m between the kerbs (fighters keep 4.7 m either side of
  the centre line), Kenney shop fronts with the `facade` shader (glass swatches glow warm,
  walls lifted), neon blade signs, light spilling from the shops, dark lamp posts with
  glowing heads and light cones. The signs, spills, heads and cones are one mesh per kind
  and side; the kit pieces are merged per material in 12 m chunks per side, so the camera
  culls what it cannot see.
- **Minimap:** centred on the hero, 20 m across, the street and the shop blocks (from
  `arena.map_blocks`) clipped to the disc, the medallion, the hero's view cone, dots with
  facing wedges (hero green, ally blue, boss red).
- **Damage numbers** pop on the target's body (chest height) and rise ~60 px.
- **Hero card** (top left): the hero's face, rendered once at the fight's start by a small
  camera in a 128 px SubViewport that shares the fight's world, copied to an image and
  freed (config `portrait: false` turns it off; the card then shows the initial).
- **Near fade:** lamps, planters, trees and benches fade out 13 to 15.5 m from the camera,
  so none stands tall behind the controls at the bottom of the screen.

## Frame cost on a software GPU
Frame time is input latency on the emulator (SwiftShader), so the fight is built to stay
near the trunk's cost there:
- 3D at half the screen's pixels (`render_scale` 0.5), the HUD at full resolution.
- **Dynamic resolution:** when the median of the last 12 real frames is over 30 ms, the
  3D steps down by 0.07 to at least 0.3 of the screen; under 18 ms it steps back up to
  `render_scale`. A phone at 60 fps never steps down; the emulator's software GPU does. The log line is `CQ dynres scale a -> b`. Review captures pin the
  scale (`dyn_res: false` is the capture default). Config `dyn_res: false` turns it off.
- One directional light; plain trilinear paving; mipmapped HUD art. Since cq 015 the hit flash
  and the rim are in the fighters' own material pass (no overlay pass); the light, materials and
  post stack and their costs are in [LOOK.md](LOOK.md).
- Draw calls: the HUD's circles are quads of one disc texture (they batch; `draw_circle`
  is one draw call each); the street's small props are one mesh per material, only the
  shop fronts are chunked for culling.
- Latency logs: `CQLAT kind=move|attack|move_blocked`. `move_blocked` is a push while the
  hero cannot move (a skill, a dodge, hit stun, hit-stop); it waits for the move to end by
  design and is not input latency.

## Capture rig (review images)
```
xvfb-run -s "-screen 0 1080x2340x24" godot --path app/game3d --rendering-driver opengl3 \
  --resolution 720x1280 --fixed-fps 30 -- --capture=/path/spec.json
```
The spec gives the fight config, a timeline of inputs (`stick`, `attack`, `skill`,
`guard`), the shot times and an output folder. `--fixed-fps 30` makes every frame 1/30 s
of fight time, so the same spec gives the same frames on a slow software renderer. The
config keys `cam_dist`, `cam_fov`, `cam_pitch`, `cam_yaw` and `cam_ahead` override the camera for
close-ups; `prof_no_hud` hides the HUD and `fx_visible: false` the effects (character review sheets); `boss_passive` stops the
boss, `rev_solo` puts the ally and the boss out of shot and stops the ally, `cam_hero_only` frames the hero
alone, `cloth_push: false` turns the cloth-off-the-legs shader push off (all review/measure switches, off by default).

## Effects (cq 013)
The skill and hit effects, the camera impact and the damage-number punch are described in
[EFFECTS.md](EFFECTS.md): each effect and its layers, why glow is drawn on the effects (no bloom pass
in the Compatibility renderer), the per-effect budget, and how to tune them.
