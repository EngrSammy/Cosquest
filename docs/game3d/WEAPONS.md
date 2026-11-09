# Weapons in hand (cq 234)

Every cast character (Armstrong, Bobo, Cat-Boy, Crystal-Z, Elvis, Hoof, Nebul-X, Vanessa) holds a textured weapon in the Godot fight and in every Filament preview (Forge bag, Wear list, versus card, avatar, point scene). This page is what the animation task (game-quality/animations) needs: where the sockets are, how a weapon sits in a hand, and how to change it.

Commando, Blade, Killua and P-Mon are out of scope and have no entry: they are not touched.

## Files

| what | where |
|---|---|
| attach manifest (machine-readable) | `app/game3d/data/attach.json` |
| the maths (hand bones, hand frame, grips, GLB merge) | `app/features/game3d/attach.ts` (tests: `app/features/game3d/__tests__/attach.test.ts`) |
| who holds what, the catalogue link, placeholders, the bag's Items list (`bagItems`), map drops (`dropShown`) | `app/features/game3d/held.ts` (pure), `app/features/game3d/heldDevice.ts` (files) |
| the catalogue link against a LOCAL stack, both flag states | `app/features/game3d/__tests__/catalogue.local.test.ts` |
| headless fight plans for both flag states | `e2e/forge/flag_fight_plans.ts` |
| Godot socket | `app/game3d/fighter.gd` `hold_weapon()`, loaded by `app/game3d/fight.gd` `_queue_weapons()` |
| class poses (hand-tuned) | `app/game3d/tools/weapons/grips.json` |
| the weapon set (sources, sizes, licences) | `app/game3d/tools/weapons/weapons.json` |
| pack builder (Blender 4.2, CPU) | `app/game3d/tools/weapons/build_weapons.py` |
| manifest generator | `app/game3d/tools/weapons/make_attach.ts` |
| headless evidence shots | `app/game3d/tools/shots.gd` |
| bundled default weapons | `app/assets/weapons/<slug>.glb` (LOD0) and `.png` (thumbnail) |
| fixture packs for the local stack | `e2e/forge/make_cast_packs.py` |
| licences | `docs/game3d/LICENSES.md` |

## The weapon contract (contract 2, pivot "grip")

Each weapon GLB:
- origin at the grip (where the hand closes);
- +Y (glTF) along the blade, haft or barrel, to the tip; +Z towards the cutting edge, the head of an axe or hammer, the top of a gun, the face of a shield;
- real-world metres (length along +Y): sword 0.95, greatsword 1.4, axe 0.8, warhammer 1.05, staff 1.6, dagger 0.45, crossbow 0.8, rifle 0.8, shield 0.6 across (the rifle's cross-section is slimmed to 60 % with `girth` in weapons.json, since Kenney's blaster is a chunky toy at its own proportions, and its pale grey body is moved to the atlas's copper-wood and gold swatches with `recolour`, so it matches the KayKit wood-and-steel set);
- scene root is an empty named `grip` at the origin; under it the mesh and an empty named `tip`;
- one texture per weapon, embedded (KayKit and Kenney palette atlases), LOD0/1/2 (100/60/30 % of the triangles, texture 1024/512/256), USDZ per LOD, a 512 px thumbnail;
- `pack.json` carries `stats.kind` (the backend's kinds), `sockets.grip` [0,0,0] and `sockets.tip`.

All nine pass the publish-time pack check (`tools/forge_import.py --dry-run`: ok, no warnings for the weapons once USDZ is there).

| slug | name | backend kind | hand class | tris LOD0/1/2 |
|---|---|---|---|---|
| knight_sword | Knight's Arming Sword | blade | sword | 300/180/90 |
| crown_greatsword | Crown Greatsword | blade | greatsword | 412/247/123 |
| war_axe | Barbarian War Axe | axe | axe | 274/164/82 |
| forge_warhammer | Forge Warhammer | hammer | hammer | 552/330/164 |
| arcane_staff | Arcane Staff | staff | staff | 440/264/132 |
| rogue_dagger | Rogue's Dagger | blade | dagger | 172/103/51 |
| hunter_crossbow | Hunter's Crossbow | bow | crossbow | 792/475/237 |
| repeater_rifle | Repeater Rifle | bow | rifle | 700/420/210 |
| knight_shield | Knight's Round Shield | gauntlet | shield (left hand) | 284/170/85 |

The backend's weapon kinds are unchanged (blade, axe, hammer, gauntlet, staff, bow), so no backend change: the hand class is read from the name first, then the kind (`gripClassOf` in attach.ts): shield/buckler, crossbow, rifle/repeater/blaster/gun, greatsword/claymore, dagger/knife, hammer/mace, staff/wand/spear, axe, bow; else by kind (axe, hammer, staff, bow to crossbow, gauntlet to shield, anything else sword). A Forge weapon published tomorrow gets a sensible pose from its name.

## Sockets per character

`hand_r` / `hand_l` are found from each character's own skeleton (cq 060's rig stage writes Mixamo-style names; no finger bones). The search order (`findHandBones`) is Mixamo `RightHand`/`mixamorig:RightHand`, then `hand_r`, `hand.R`, `R_Hand`, `Bip01 R Hand`, and similar; only skin joints count.

| key | name | rig | right socket bone | left socket bone | main hand | default weapon |
|---|---|---|---|---|---|---|
| armstrong | Armstrong | 060 pose set, rigged | RightHand | LeftHand | right | Forge Warhammer (the deck's hammer) |
| bobo | Bobo | 060 pose set, rigged | RightHand | LeftHand | right | Barbarian War Axe |
| catboy | Cat-Boy | 060 pose set, rigged | RightHand | LeftHand | right | Rogue's Dagger |
| crystalz | Crystal-Z | 060 pose set, rigged | RightHand | LeftHand | right | Arcane Staff (the deck's staff) |
| elvis | Elvis | 060 pose set, rigged | RightHand | LeftHand | right | Crown Greatsword |
| hoof | Hoof | 060 deck set, static (the rig gate failed) | none: a fixed point on the model, (-0.455, 0.815, 0.035) m | none | right | Arcane Staff (the deck's staff) |
| nebulx | Nebul-X | 060 pose set, rigged | RightHand | LeftHand | left: her own orb staff is part of her model, in her right hand | none (she holds her own staff); an equipped weapon goes in her left hand |
| vanessa | Vanessa | 060 pose set, rigged | RightHand | LeftHand | right | Repeater Rifle |

Hoof's model has no skeleton, so his socket is a point read off front and side renders, and the weapon is parented to the model itself (`bone: ""`). Once Hoof is rigged, delete his entry in `STATIC_HANDS` (make_attach.ts) and rerun the generator.

## How a grip is computed

1. Pose the rig in the first frame of its **idle** clip (the rest pose is an A-pose; a fighter spends its time in idle, arms down).
2. The hand frame (model space, model facing +Z): the hand direction `d` from the forearm joint to the hand joint (averaged with the hand bone's own axis when they agree); the grip point is half a hand length past the hand joint (hand length 0.38 x forearm, clamped 6 to 12 cm); `f` = the model's forward made square to the hand; `u` = up the forearm (-d); `o` = away from the body.
3. A class's pose (`grips.json`) says where the weapon's tip (+Y) and edge (+Z) point, as mixes of f, u, o and w (world up), plus an optional grip offset.
4. The weapon root's matrix in the hand bone's space is `inverse(handBoneIdle) * weaponWorld` (4x4, column-major, metres). That is what attach.json stores per character per class.

The clips then move the hand bone and the weapon follows: idle, walk, celebrate and the procedural attack (lunge, spin, lean) all carry it.

Class poses today:

| class | hand | tip | edge | reads as |
|---|---|---|---|---|
| sword | right | 0.9 f + 0.45 u | down | forward, a little raised |
| greatsword | right | 0.55 f + 0.85 u | forward | raised in front |
| dagger | right | 0.75 f + 0.45 o + 0.3 u | down | forward and a little out (shows in a front-on card) |
| axe | right | 0.55 f + 0.75 u + 0.3 o | o + 0.35 f | haft forward and up, away from the body, head turned out (the blade shows its profile in a front-on card) |
| hammer | right | 0.9 u + 0.35 f + 0.1 o | forward | haft up the arm to the shoulder |
| staff | right | world up + 0.15 f | forward | upright beside the body |
| crossbow | right | f | world up | at the hip, pointing forward |
| rifle | right | 0.6 f + 0.3 o - 0.75 w | world up | low ready: barrel down, forward and a little out, clear of the leg |
| shield | left | world up | o + 0.6 f | on the forearm, face out and forward |

A shield is an off-hand item: with a shield, the main hand holds the character's own one-handed weapon, or the Knight's Arming Sword.

## Godot

`fight.gd` reads, per fighter, `hero_weapon` / `hero_offhand` (and `ally_`, `enemy_`) from the fight config:

```json
"hero_weapon": {"glb": "/data/.../forge_warhammer.glb", "class": "hammer", "bone": "RightHand", "matrix": [16 floats]}
```

When `bone`/`matrix` are missing it looks them up in `res://data/attach.json` by `character` (or `<role>_key`) and `class`. Weapons load after the three characters (GLTFDocument at run time, one per frame on the loader thread). `fighter.gd hold_weapon()` adds a `BoneAttachment3D` named `hand_r` / `hand_l` on the hand bone (or a plain node on the model for a static model) and under it `weapon_r` / `weapon_l` with the matrix. `fighter.grip_point(side)` gives the grip in world space (for trails and hit effects).

For the animation task: new clips must keep the bone names `RightHand` / `LeftHand`. If a clip changes the hand's orientation a lot (a two-handed overhead swing), the weapon simply follows the right hand; a second-hand IK target can use `weapon_r`'s transform. The idle-fitted matrices stay valid as long as the idle clip's first frame is not changed; if it is, rerun `make_attach.ts`.

## Filament (React Native previews)

`ForgeModel` merges the held weapon into the character's GLB (`mergeWeaponGlb`): the weapon's nodes, meshes, materials, textures and buffer are appended, and its root goes under the hand bone's node with the same matrix. Filament's animator moves the joint node and the weapon follows, with no per-frame JS work and still one model per view (cq 056 found multi-model scenes ran away with memory on the emulator). The merged file is cached in `cache/forge-held/` per character version and weapon. If anything fails, the character shows alone, as before.

## Who holds what, and the catalogue link

- The catalogue link is on only when this build has `EXPO_PUBLIC_FORGE_CATALOGUE=1` AND the server's `forge_world` feature is on. Off: the Forge screens behave exactly as before (the bag lists what the server says you own, nothing filtered or added).
- On: the player's own avatar holds the Forge weapon they equipped (a real one); placeholder weapons (one file served as every LOD, or no thumbnail and under 16 KB: the untextured Ember Blade v1) are hidden from the bag and the map; the bag's Items list adds the app's starter set (the nine bundled weapons, "Hold" keeps one in hand on this phone, since the 3D fight is practice).
- Every other character holds its own default weapon (table above), from the bundled files, so a fresh install with an empty or placeholder-only catalogue still shows real weapons.

## Proving the flag without a phone

```
# a LOCAL game backend with forge_world ON (and one with it OFF, same database), packs imported with tools/forge_import.py
CQ_LOCAL_GAME=http://127.0.0.1:47699 CQ_LOCAL_GAME_OFF=http://127.0.0.1:47698 CQ_LOCAL_EXPECT=full \
  node --test app/features/game3d/__tests__/catalogue.local.test.ts
# a fresh database with only the untextured Ember Blade imported:
CQ_LOCAL_GAME=http://127.0.0.1:47697 CQ_LOCAL_EXPECT=placeholder-only node --test app/features/game3d/__tests__/catalogue.local.test.ts
# the Godot fight in both states (a new player claims and equips a real weapon; app flag on vs off)
node e2e/forge/flag_fight_plans.ts --base http://127.0.0.1:47699 --dl <dir> --out <plans> --cast <cq060 models>
```

It checks: the placeholder is recognised and hidden; a new player's bag is the starter set; every bundled weapon embeds its texture and is byte-identical to the catalogue's LOD0; each cast character's file from the server takes its weapon under the hand bone with the manifest's matrix; a claimed and equipped real weapon is held with the link on and not with it off; with the server's forge_world off the Forge routes answer 404 and the bag is as before.

## Merging with game-quality/combat

A local trial merge of this branch with `game-quality/combat` (7e60689) builds and renders (headless fight timeline with the weapons in hand at the combat camera: cq 010 evidence `preview_with_combat/`). Three files conflict; the resolution used:
- `app/game3d/fighter.gd`: keep both blocks of fields (this branch's `weapons` dictionary and combat's combat state); in `_clear_model()` add `weapons = {}`; keep this branch's `hold_weapon()` and `grip_point()` and combat's "actions" section (combat replaces the old `play()` / `lunge()` / `spin()` with its CombatAnimator, so drop those). Combat also has an `attach_weapon(node, reach)` on `anim.hand_r` that nothing calls; this branch's entry point is `hold_weapon()` (renamed from `attach_weapon` so the two do not clash). A follow-up can call combat's `set_reach()` with the held weapon's length.
- `app/game3d/export_presets.cfg`: `include_filter="data/*.json"` (the attach manifest must ship) and combat's `exclude_filter="tests/*, tools/*"`.
- `docs/game3d/LICENSES.md`: both files' sections, combat's first, then "Weapons (cq 234)".

## Rebuild everything

```
# weapons (Blender 4.2 headless, CPU, ~10 s)
env -u LD_LIBRARY_PATH blender -b --factory-startup -noaudio --python app/game3d/tools/weapons/build_weapons.py -- \
  --spec app/game3d/tools/weapons/weapons.json --src <downloads> --out <out>
cp <out>/packs/<slug>/<slug>__lod0.glb app/assets/weapons/<slug>.glb   # and the thumbnail at 256 px
# manifest (from app/)
node game3d/tools/weapons/make_attach.ts <cq060 models>/pose
# fixture packs for the local stack, then import (LOCAL only)
python3 e2e/forge/make_cast_packs.py <dir> --models <cq060 models> --weapons <out>/packs
(cd costquest-backend && python -m tools.forge_import <dir>/* --approve --publish)
# headless shots
xvfb-run -a -s "-screen 0 720x1280x24" godot --path app/game3d --rendering-driver opengl3 --fixed-fps 30 \
  --resolution 720x1280 -s res://tools/shots.gd -- --plan=<plan.json> --out=<dir>
```

## Known limits

- No finger bones in the cast's rigs: the hand cannot close; the handle passes through the hand mesh where the fist is. Close-ups show it from three angles (cq 234 evidence).
- Hoof is static, so his staff does not move except with his whole body.
- The Kenney repeater is a slimmed, recoloured toy blaster; it reads as a rifle at fight and card distance, less so in a close-up.
- USDZ files are exported (Blender's USD exporter, Z-up stage) but not tried on iOS.
