# Cast look pass: textures, faces, materials, normals (cq 239)

The eight cast characters (Armstrong, Bobo, Cat-Boy, Crystal-Z, Elvis, Hoof, Nebul-X, Vanessa) were
the weakest thing on screen. This page has the audit (what was wrong, ranked by what a player sees
first), what changed, the budgets, and how to rerun the pass on a new Forge model. The rigs are
cq 014's (RIGS.md) and are untouched: every mesh, UV, skin, weight, bone and clip byte is the same
(`tools/look/same_rig.py --allow-normals`, 24 of 24 files). Only the two images and the shading
normals change.

Evidence (BEFORE = `game-quality/rigs` b74012b, AFTER = this branch): the task's
`out/evidence/index.html`, with turntables at LOD0 and LOD1, select-screen and face close-ups, the real
fight at the game's camera and render scale, a victory close-up, and `contact_sheet_all8.png`.

## Audit (BEFORE), ranked by what Mark would notice first

| # | problem | who | why |
|---|---|---|---|
| 1 | **The fight camera sparkles with noise** | all 8 | `GLTFDocument` at runtime gives the embedded textures **no mipmaps** (`has_mipmaps() == false`). At ~60 px tall every screen pixel samples one texel of an atlas cut into 5,000 to 10,000 islands, so the characters shimmer and read as speckle. |
| 2 | **Faces are smudges** at the select screen and victory close-ups | Armstrong, Bobo, Crystal-Z, Elvis, Nebul-X, Vanessa | The lift's texture is a sample of a 1024³ voxel colour volume, so eyes and mouths are 2 to 4 texel blobs. Armstrong had red smears across the cheeks, Vanessa black eyeliner shapes without eyes, Elvis no eyes at all. |
| 3 | **Crystal-Z renders black** (the deck: teal starfield) | Crystal-Z (Nebul-X, Bobo, Vanessa partly) | The metal map says 97 % of Crystal-Z is metal at roughness 0.36. The fight has no reflection environment, so metal shows only the sun's highlight and dark "metal" cloth goes black. Nebul-X: 31 % metal, half of it on dark cloth. |
| 4 | **Elvis is slate-blue and light-skinned** (the deck: charcoal and gold, dark brown skin) | Elvis | Robe texels are mid-grey (Lab L 51) and blue-grey (b −7.4) where the deck is charcoal and black (L 33 and 12); the arena's bluish ambient pushes them further to blue. Skin is L 52 to 62 against the deck's 44. |
| 5 | **Blocky shading** ("Armstrong reads blocky") | all, most on Armstrong, Elvis, Vanessa | The lift's normals are split at most corners: on Armstrong's LOD1, 74 % of vertices are more than 15° off the smooth normal at their position (Elvis 80 %, Vanessa 84 %). Hoodies, faces and capes shade as flat facets. |
| 6 | Blotchy, noisy albedo | Elvis, Hoof, Crystal-Z | Voxel stair-steps (2 to 4 texel blocks) and speckle in the atlas. |
| 7 | Silhouettes and proportions | Elvis (long face), Crystal-Z (orb halo as scattered beads), Hoof (flames and skirt one sheet), Vanessa (shredded hair) | From the lift's geometry (cq 060's report). Not fixed here, see "Still short". |

Per character (BEFORE):
- **Armstrong**: good silhouette and palette (teal is a little bluer than the deck's). The face had brown eye blobs and red smears. Blocky facets on the hoodie and face.
- **Bobo**: good palette and silhouette. Smudged eyes, so he read as expressionless.
- **Cat-Boy**: reads well (visor, no face). The visor was half metal, so it went dark and lost its purple.
- **Crystal-Z**: near black (metal) instead of teal and cream. The face was a pale blur.
- **Elvis**: slate blue instead of charcoal, a long face (geometry), no eyes, gold fine.
- **Hoof**: closest to his deck (lavender and white). Blotchy albedo; his face is under his raised arm in the deck pose.
- **Nebul-X**: the palette is close but the skin read red-brown. Her eyes were dark smears; the forehead gem was a white dot.
- **Vanessa**: the palette is good. Her eyes were black eyeliner shapes with nothing in them, and her lips a pink smear.

## What changed (cheapest first)

1. **Mipmaps at load** (`char_loader.gd add_mipmaps`): every material texture of a loaded character
   gets its mip chain on the loader's worker thread. Measured here (CPU): 64 ms for a LOD1
   character, 235 ms for a LOD0 one. This is the single biggest change at the fight camera: no
   shimmer, the colours average correctly.
2. **Metal only where the albedo is gold, brass or bright silver** (`tools/look/retex.py`): metal is
   multiplied by a gold mask (b* > 10 to 20, L > 35 to 45) or a silver mask (L > 62 to 72, chroma < 10 to 18);
   everything else is dielectric with roughness ≥ 0.55 (metal ≥ 0.35). Metal share: Crystal-Z 97 to 41 %,
   Nebul-X 32 to 7 %, Cat-Boy 11 to 1 %, Vanessa 21 to 13 %, Bobo 11 to 7 %, Elvis 17 to 15 %.
3. **Faces painted from the concept** (`tools/look/face.py`, six characters): the A-pose concept
   each model was lifted from (cq 060 `pose/<key>/concept.png`), head crop upscaled 4x with
   Real-ESRGAN anime 6B on the CPU (`tools/look/upscale.py`), is projected front-on onto the model's
   head texels that the front camera sees, weighted by n·z and a face ellipse, and blended in Lab
   with the border level-matched. Registration is by 4 to 5 landmarks per character (eyes, nose tip,
   mouth, Nebul-X's gem) read off gridded sheets the script writes (`tools/look/faces.json`), and
   fitted with a least-squares affine. The lift made faces up to 40 % longer than the concept, so a
   similarity cannot fit. Landmark residuals are 0.03 to 4.9 concept px (Nebul-X worst). Automatic
   registration (silhouette IoU, masked NCC, ECC, optical flow) was tried first and locked onto
   shoulders and crowns. cq 057 rejected a whole-body projection (smears), so this is the head only.
4. **Palette fix toward the deck** (`looks.json` `recolor`, Elvis only): his mid-grey robe goes to
   charcoal (L × 0.62, chroma × 0.5) and his blue-grey to neutral dark. His skin goes darker brown:
   the deck's Elvis is Lab L 44, but the A-pose concept edit had lightened him to L 52 to 62 (cq 060
   noted that klein edits lighten skin), and the hands and ears were a greyed pink. Texels skinned to
   cq 014's `Wing_*` chains are excluded, because his wings are cream in the deck. His face ellipse
   is shorter (`faces.json` `ry`), because his long face put the concept's jaw line on his neck.
5. **Island-aware cleanup** of the base colour: 2 passes of an edge-preserving bilateral in Lab
   that never reads across UV islands (cq 057's E2 failure was island bleed), and push-pull gutters,
   so mips do not pull in black.
6. **Smooth shading normals** (`tools/look/normals.py`, crease 55°): area-weighted face normals
   averaged over each welded position, within 55° of the corner's own face. Real creases stay sharp.
7. Metallic-roughness re-encoded as JPEG (q92, 4:4:4): the cleaned map has no fine detail, and as a
   PNG it was the bigger half of every file.

Not changed: meshes, UVs, triangle counts, texture sizes, rigs, clips, the fight scene, effects,
camera and lighting.

## Budgets

| | before | after |
|---|---|---|
| triangles LOD0 / 1 / 2 | 26.5k to 27.8k / 10.7k to 11.3k / 2.7k to 2.8k | identical (same meshes) |
| textures LOD0 / 1 / 2 | 2048² / 1024² / 512², base JPEG + MR PNG | same sizes; base JPEG q92 4:4:4, MR JPEG q92 |
| the 24 cast files | 58.8 MB (5 in `res://cast` + 3 from the catalogue) | 46.2 MB |
| shipped in the app (`res://cast`) | 36.1 MB (Armstrong, Bobo, Crystal-Z, Elvis, Hoof) | 48.4 MB (all 8): **+12.4 MB raw**, because Cat-Boy, Nebul-X and Vanessa now ship too; the five that already shipped shrank |
| frame time at the fight camera | p50 64.9 to 68.8 ms, p95 79 to 87 ms | p50 62.4 to 68.0 ms, p95 76 to 81 ms (same within noise; software GPU, 720x1280, 0.5 render scale, 2 runs each) |
| draw calls | 106 to 110 | 106 to 110 |
| load | — | + mip generation, 64 ms per LOD1 character (worker thread, this CPU) |

Mipmaps add a third to texture memory in theory (+2.7 MB per LOD1 character: two 1024² RGB maps).
Godot's own `vmem_mb` counter read 80.4 MB both ways in the seeded fight, so it does not see the
difference. The cycles soak (10 fights, real cast) stays flat.

When the packs are published to the Forge catalogue, `res://cast` and `rig_fixes.json` can go
(−48 MB in the APK), as RIGS.md already says for the rigs.

## How the game gets them

As with cq 014's rigs: `data/rig_fixes.json` maps the sha256 of each cq 060 catalogue file to
`res://cast/<key>_lod<n>.glb`. The look pass now covers all 8: Cat-Boy, Nebul-X and Vanessa are
new entries, on cq 060's own rigs. A newer Forge version of a character loads as it is. The
contract-2 packs (task `out/packs/cast_<key>/`) pass the backend's publish-time check
(`tools/forge_import.py --dry-run`: ok, no warnings; USDZ for every LOD by `tools/look/usdz.py`,
Blender headless). They are not published: Subomi approves the visuals first. The app's Filament previews read the catalogue, so
they show the new look only once the packs are published.

## Rerun on a new Forge model

```
PY=<python with numpy, scipy, opencv-python-headless, pillow>
# 1. landmark sheets (writes <key>_model_mm.png / <key>_concept_px.png), then add the key to faces.json
$PY app/game3d/tools/look/retex.py --glb <lod0.glb> --out /tmp/x.glb --concept <concept.png> --key <key> --debug <dir>
# 2. the concept head 4x (torch + spandrel, CPU)
python app/game3d/tools/look/upscale.py <concept.png> <up>/<key>.png --weights RealESRGAN_x4plus_anime_6B.pth
# 3. every LOD (settings: looks.json _default + the key's overrides)
$PY app/game3d/tools/look/retex.py --glb <lodN.glb> --out <looks>/<key>/lodN.glb --ref <deck front.png> \
    --cfg app/game3d/tools/look/looks.json --key <key> --concept <concept.png> --up <up>/<key>.png
# 4. ship: MR as JPEG, smooth normals, res://cast + rig_fixes.json, packs
$PY app/game3d/tools/look/ship_look.py --looks <looks> --orig <key>=<catalogue dir> ... --packs <out> --base <catalogue packs>
$PY app/game3d/tools/look/same_rig.py --allow-normals <before.glb> <after.glb> ...
blender -b --factory-startup --python app/game3d/tools/look/usdz.py -- <out>/cast_<key>   # USDZ for iOS (carries the idle clip since 1 Nov 2026)
# look sheets and the "fight did not change" check
godot --path app/game3d --rendering-driver opengl3 --resolution 720x1280 -s res://tools/turntable.gd -- --glb=<lod.glb> --out=<prefix>
godot --path app/game3d --fixed-fps 30 -s res://tests/seeded_fight.gd -- --hero=... --ally=... --enemy=...
```

## Still short (honest)

- **Geometry** is still the lift's: Elvis's long face, Crystal-Z's halo as scattered beads, Hoof's
  flames and skirt as one sheet, Vanessa's shredded hair, coarse faces (a nose is a few facets).
  Smooth normals hide some facets; silhouettes need a new lift or hand modelling, then cq 014's
  re-rig and tear gate.
- **Backs are the lift's invention** (TRELLIS sees one view). The faces are painted on the front
  only, so a three-quarter-back view shows the old texture around the ears.
- **Faces at an angle**: the paint is weighted by how much the surface faces the front, so at a
  steep angle the old smudge shows through (Elvis's far eye in the 3/4 select view). Vanessa has a
  few hair strands painted on her forehead (the concept's fringe), and Nebul-X's landmark fit is the
  loosest (up to 4.9 px).
- **Hoof and Cat-Boy** have no painted face (arm over the face in the deck pose; a visor).
- **Fight-camera readability** is mostly unchanged in silhouette and size; it is cleaner (no
  shimmer) but softer. Rim light, outline or a bigger camera belong to the scene and effects task.
- The textures still carry the lift's baked shading. A hand-painted-style repaint of the whole atlas
  (multi-view texturing) is the next lever and needs a multi-view model, not this pass.
