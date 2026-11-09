# Cast rigs: skeletons, weights and secondary motion (cq 014)

cq 012 gave five of the eight cast real CC0 clips. Elvis and Crystal-Z tore under them and Hoof
had no skeleton, so those three played only the procedural stand-in motion; Bobo and Armstrong
fell back in a few states. This page says what was wrong, how the scripted fixes work, how to
run them on a new Forge model, and how the secondary motion (robes, coats, skirts, wings) is
driven and tuned. The clips themselves are in ANIMATIONS.md.

(cq 239 later changed the look on top of these rigs, textures and shading normals only, and
extended the swap to all 8: CHARACTERS.md.)

Nothing here changes how a character looks: the meshes, normals, UVs, materials and textures are
the same bytes, only the skeleton, the skin weights and a few added bones change (proof below).

## What was wrong

| character | cq 060's rig | what it did under the clips |
|---|---|---|
| Elvis | almost everything from the waist to the ankles (shins included) weighted to Hips; the left hip joint on the centre line (x 0.015 m, the feet at +-0.2 m) and the hips 8 cm to one side; robe, wings and legs one fused surface | the shins stayed with the hips while the feet moved: idle, attacks and hit react tore (0.7 to 3.5 % of triangles past 2.5x) |
| Crystal-Z | the same skeleton fault mirrored (right hip joint on the centre line); coat tails weighted to Hips and both thighs at once; the upper back on the lowest spine bone | the coat ripped on every wide stance; no attack under the gate |
| Hoof | no skeleton (cq 060's auto-rig rejected it: its walk tore 2.8 %) | static |
| Bobo | baggy trousers split between Hips and the thighs; the head partly on Spine2 | walk, run, guard, dodge, death and WHIRL tore |
| Armstrong | trousers on Hips and the thighs | two-handed swings and Death_A tore (0.53 %) |

The diagnosis renders (stretch per triangle on the worst frame, dominant bone per triangle) are in
the task's evidence (`evidence/rig/diag/`).

## The fixes (all scripted, `app/game3d/tools/rig/`, CPU only)

Every tool runs on the glTF data with numpy (Blender 4.2's bundled Python), except
`heat_weights.py`, which runs inside Blender headless.

| file | what it does |
|---|---|
| `fix_rig.py` | rebuilds a cq 060 rig's weights and adds the secondary chains, LOD0/1/2 |
| `rigspec.json` | per character: leg radii, robe/coat/skirt chains, wings, bands |
| `make_skeleton.py` + `skeleton_spec.json` | a skeleton for an unrigged model from scripted landmarks (Hoof) |
| `heat_weights.py` | Blender automatic weights (bone heat) as the starting weights |
| `secondary.py` | the numpy twin of the game's secondary sim (the tear gate runs it) |
| `secondary_check.py` | through-the-legs, rest jitter, hit-stop and dodge-settle checks |
| `same_mesh.py` | proof that the look is unchanged (bytes and rest-pose skinning) |
| `rigcheck.py` | the gate's measure for quick experiments (shares 012's code) |
| `ship.py` | puts the rigs in the game (`app/game3d/cast/`, `data/rig_fixes.json`) and writes Forge packs |

`fix_rig.py`, in order:
1. **Skeleton re-centred where cq 060 misplaced it.** The hips, spine and leg joints move onto the
   mesh: the hips over the feet's midpoint, the hip joints a fixed half width either side, the knees
   on the hip-to-ankle line. Arms, hands, neck, head and feet stay where they were, so the grips,
   hand_r / hand_l and the weapon sockets do not move. Bone names and hierarchy are unchanged.
   The bind matrices are rewritten for the moved joints (bind pose = rest pose, so the rest render
   is unchanged).
2. **Stray weights removed**: a bone far from the point (beyond max(12 cm, 2.5x the nearest bone)),
   a limb of the other side, a leg bone above the waist.
3. **Parts** by position: legs (inside the leg capsules), robe/coat/skirt (below the waist and clear
   of the legs), wings (behind the spine line), the rest of the body.
4. **Weights per part**: legs by envelope over that side's leg chain and the hips, with an ankle
   rule (no foot weight above the ankle joint); the torso along the spine by height (cq 060 put
   parts of the upper back on the lowest spine bone); robe, coat and skirt on hanging chains around
   the hips, blended between the two nearest chains by angle and along the chain by height; wings
   on two chains from the upper back; the arms, hands and head keep cq 060's cleaned weights.
5. **Seeded harmonic fill**: only the confident points keep those weights (leg cores, free-hanging
   cloth, the upper body). Every point in a junction band (armpits, neck, robe to leg, robe to
   wing, cloth near the arms and hands) is filled with the harmonic blend of the seeds over the
   welded surface (UV-seam duplicates share one weight). A raised arm then stretches a band of
   triangles a little instead of tearing a seam.
6. Max 4 influences, normalised, u8 weights summing to exactly 255, identical on coincident
   vertices.
7. **LOD1 and LOD2**: LOD0's final weights transferred by nearest surface point, the junction
   bands refilled on the LOD's own (coarser) surface, then the same cleanup. The gate takes the
   worst of the three LODs.
8. The new JOINTS_0 / WEIGHTS_0 overwrite the old ones in place (same size); the added bones and
   bind matrices are appended. All other bytes are kept.

Hoof (`make_skeleton.py`): each of the 25 Mixamo-named joints has a seed point read from front and
side renders of the mesh and is moved to the centroid of the mesh points within a few centimetres
(the middle of the limb there). Bone heat (`heat_weights.py`) fails on the model as imported
("failed to find solution for one or more bones") because the mesh is split at its UV seams; with
the seams welded first it weights 40,451 of 40,548 vertices (the rest take the nearest bones). Then
the same `fix_rig.py` cleanup. His skirt and the flames on his left are one fused sheet, so they
hang from the same eight skirt chains.

## Secondary motion

Chains are bones named `<Prefix><n>_0 .. _k` plus `<Prefix><n>_end` (`Robe`, `Coat`, `Skirt`,
`Wing_L` / `Wing_R`, `Flame`), parented to Hips (robes, coats, skirts) or Spine2 (wings). The
retargeted clips never animate them. In the game, `secondary_motion.gd` (a SkeletonModifier3D
added by `combat_animator.gd` after the procedural pose layer, only when the skeleton has chains)
moves them every frame:
- the **target** is the chain hanging from its parent as at rest, swung by a share (`follow`) of
  the thighs' rotation relative to the hips, split left/right by where the chain hangs, and
  pushed out of the leg capsules;
- each joint **springs** toward its target (verlet: `stiffness` of the way per step, `damping` of
  the velocity lost), keeps its bone length, is pushed out of capsules on the thighs and shins
  (`legs`, radius + `joint_r`) and turns at most `max_deg` from the target;
- fixed 1/60 s steps (at most 4 per frame) in the skeleton's own space, so walking and dodging
  never drag it and a hit-stop just lets it settle. Nothing is allocated per frame.

The tear gate measures clips on rigs with chains with these bones moved by `secondary.py`, the
same maths and parameters (what the game shows); the reports also record the number with the
chains rigid (`tear_share_chains_rigid`).

**Tuning** (`app/game3d/data/secondary.json`, per group): `follow` 0.4 for robes, coats and skirts
was the best of 0 / 0.4 / 0.85 / 1.0 for the tear gate (more follow drags the hem across the
shins, less leaves the cloth behind the legs). `joint_r` 0.07 m (the cloth joints keep 7 cm off
the leg capsules) halves the cloth inside the legs against 0.02 m with every clip still under the
gate. `stiffness` 0.3 to 0.35 and `damping` 0.25 give a short lag that settles about 0.45 s after a
dodge. Wings are stiffer (`max_deg` 20) and do not collide. The spring's targets are pushed out of
the legs too, so spring and collision never fight (that was a 4 mm jitter at rest before).

Measured with `secondary_check.py` on LOD1 (`evidence/secondary/` in the task workdir): rest
jitter under 0.5 mm a frame after 0.5 s; a 0.15 s hit-stop freeze changes nothing (no jump); the
chains come to rest 0.43 to 0.47 s after a dodge; robe/coat/skirt vertices inside the leg
capsules on the worst frame drop from 1 to 15 % with rigid chains to 0 to 4 % with the sim (idle,
hit and chop near 0; walks 1.2 to 4.0 %; deaths about 2 to 3 %, lying on the floor). It is not
zero: a robe fused to the legs cannot be kept entirely off them by a few joints.

## cq 016: spin-aware sim and cloth off the legs

**Spin-aware.** A WHIRL turns the hips a full circle in half a second. The chains sprang after that
turn with a lag of up to 0.7 m, which stretched the robes past the tear gate (it was one reason no
spin clip passed on the robed three). Each frame the sim now measures the hips' turn about the
vertical since the last frame and carries every chain's state round the hips by it (`spin_carry` in
`secondary.json`, both `secondary_motion.gd` and its numpy twin). The spring then only answers the
thighs and the body's own sway. A flare (the hem swinging out with the turn rate,
`flare_deg_per_rad_s`, `flare_max_deg`) is built in but **off**: even 12 deg took Elvis's LOD0 spin
from 0.42 % to 0.57 % torn. Rest jitter, the hit-stop freeze and the dodge settle are unchanged
(0.4 mm, no jump, 0.43 to 0.47 s).

**Cloth off the legs (the vertex shader).** The chain joints keep 7 cm off the legs, but between the
joints 1 to 4 % of the robe/coat/skirt vertices still went through the thighs on wide strides and
lying dead. Now every such vertex is pushed out of the leg capsules on the GPU:
- `char_lit.gdshader` (the fighters' own material) reads each vertex's skin binds
  (`BONE_INDICES` / `BONE_WEIGHTS`); the chain bones' binds come after the body's (`fix_rig.py`
  appends them), so a vertex's cloth share is its weight on binds >= `cloth_bind0`.
- A vertex with a cloth share is moved out of four capsules (thighs and shins; world space, set
  every frame by `secondary_motion.gd` from the leg bones; radius `secondary.json cloth_push`:
  thigh 0.11 m, shin 0.09 m, about the legs' own fitted capsules), by its cloth share (a waistband
  vertex half on the hips moves half).
- `fighter.gd _wire_cloth` finds `cloth_bind0` per mesh from its Skin (only when every bind after
  the first chain bind is a chain) and hands the materials to the sim. Off: fight config
  `"cloth_push": false`.
- Measured with `secondary_check.py` (its `sim_gpu_push` column is the shader's twin), LOD1, worst
  frame, share of the chain-driven vertices inside the leg capsules:

| clip | Elvis sim / + push | Crystal-Z sim / + push | Hoof sim / + push |
|---|---|---|---|
| Walking_A | 2.58 / 0 % | 1.31 / 0 % | 3.90 / 0 % |
| Walking_B | 1.77 / 0 % | 1.23 / 0 % | 3.97 / 0 % |
| Running_B | 2.48 / 0 % | 1.31 / 0 % | 1.12 / 0 % |
| Death_A | 2.19 / 0 % | 3.12 / 0 % | 2.26 / 0 % |
| 1H diagonal | 0.34 / 0 % | 0 / 0 % (was 1.60) | 2.17 / 0 % |
| Whirl_Spin | 0 / 0 % | 0.15 / 0 % | 0.27 / 0 % |

  The capsule measure is zero by construction once pushed; what it does not see is a leg mesh wider
  than its capsule, so the zoomed review sheets are the real check (task evidence).
- The push moves vertices, so a pushed band can stretch a little where it is pushed hardest (a
  wide stride); it is drawn, not gated (the tear gate measures the skin before the shader).

## How the game gets the fixed rigs

The cast reaches the game through the Forge catalogue (cq 056's cache hands Godot a file path);
the catalogue holds cq 060's files. Until the fixed rigs are published there, the game swaps them
in itself: `char_loader.gd rig_fix()` checks the loaded file's sha256 against
`data/rig_fixes.json` and, for those exact cq 060 files only, loads the fixed rig from
`res://cast/<key>_lod<n>.glb` (shipped as bytes in the pck: importer "keep", export filter
`cast/*.glb`). A newer Forge version of a character is left alone. The fixed rig's skeleton
fingerprint picks its clip library (anim_clips.json), as for every cast character. Each fixed
character is also a contract-2 Forge pack (the task's out/ folder) for a later import; once those
are published, `cast/` and `rig_fixes.json` can go.

## Running it on a new Forge model

```
BPY=~/cq-work/tools/blender-dl/blender-4.2.9-linux-x64/4.2/python/bin/python3.11
BL=~/cq-work/tools/blender-dl/blender-4.2.9-linux-x64/blender
# a cq 060-style rigged model (lod0/1/2.glb): add an entry to rigspec.json, then
$BPY app/game3d/tools/rig/fix_rig.py --key <key> --src <dir> --out <rigs>/<key>
# an unrigged one: seeds in skeleton_spec.json (check app/game3d/tools/rig's front/side plot), then
$BPY app/game3d/tools/rig/make_skeleton.py --key <key> --src <dir> --out <skel>
$BL -b --factory-startup --python app/game3d/tools/rig/heat_weights.py -- <skel>/lod0.glb <skel>/heat_lod0.npy
$BPY app/game3d/tools/rig/fix_rig.py --key <key> --src <skel> --out <rigs>/<key> --init_weights <skel>/heat_lod0.npy
# checks, then the clips (ANIMATIONS.md) and the game
$BPY app/game3d/tools/rig/same_mesh.py <dir>/lod1.glb <rigs>/<key>/lod1.glb
$BPY app/game3d/tools/rig/secondary_check.py --glb <rigs>/<key>/lod1.glb --key <key>
$BPY app/game3d/tools/anim/build_all.py ... --cast <dir with pose/<key>/lod*.glb + rig.json>
$BPY app/game3d/tools/rig/ship.py --rigs <rigs> --orig <key>=<catalogue file dir> [--packs <out>]
```

What usually needs tuning in `rigspec.json`: `r_thigh` / `r_ankle` (bigger for baggy trousers),
`skirt.hem_min_y` (keep shoes out of the robe), `skirt.chains` (6 to 8), `wings.back`, and the
bands (`armpit_band`, `neck_band`, `junction`).

## What the Forge auto-rig would need to make rigs like these (proposal only, no Forge change made)

cq 060's auto-rig produced the skeletons and weights this task had to fix. To produce rigs like
these itself:
1. **Joints from the mesh, then a symmetry and proportion check.** Hips over the feet's midpoint,
   hip joints mirrored about it, knees on the hip-to-ankle line; reject (or mirror) an elbow whose
   forearm-to-upper-arm ratio is outside 0.6 to 1.6. cq 060 put one hip joint on the centre line
   for both Elvis and Crystal-Z.
2. **Bone heat on the welded surface.** Blender's automatic weights fail on these image-to-3D
   meshes as imported because they are split at the UV seams; welding coincident vertices first
   (and mapping the weights back by position) makes it solve (Hoof: 40,451 of 40,548 vertices).
3. **Cleanup after the heat pass**: drop weights on far bones, the other side's limbs, and leg
   bones above the waist; legs by envelope with an ankle rule; the torso along the spine by
   height; max 4 influences; one weight per welded point.
4. **Junction bands instead of seams**: no hard weights in the armpits, the neck, where cloth meets
   the legs or the arms, and where wings meet the robe; fill them harmonically from the
   confident points around them, on every LOD's own surface.
5. **Garments as secondary chains**: detect skirts, robes and coats (below the waist, clear of the
   leg capsules) and wings or capes (behind the spine line); add short chains named
   `Robe<n>_<k>` / `Coat` / `Skirt` / `Wing_<L|R>_<k>` / `Flame` plus an `_end` node under the hips
   or the spine, weighted along the chain by height and between chains by angle. The game drives
   any such chain with no other data.
6. **The rig gate as the game plays it**: cq 060's measure and threshold, on all three LODs, with
   the chains moved by the secondary sim (`tools/rig/secondary.py`), and a small clip set that
   covers wide stances, two-handed swings with the left-hand IK, hit reacts and a death, not
   only idle and walk.
7. **Pack contract**: keep `skeleton: humanoid-mixamo` (the extra bones are additive) and carry
   an idle clip in every rigged character (the publish check requires it); optionally list the
   chains under a new `secondary` key.
