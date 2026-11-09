# app/game3d/art/world: credits and licences (look-world)

Every texture here is rebuilt by `app/game3d/tools/world/make_world_art.py <ambientCG dir> app/game3d/art/world`
(deterministic). Photo-sourced ones go through the art direction's mandatory stylise pass
(`tools/world/stylise.py`: median 3 px, posterise 24 levels, gaussian 2 px, HSV saturation <= 0.55 except
paint/sign accents, mean-matched to the tokens.json hex; normal strength x0.5; roughness >= 0.6 except glass).

## Licence
- ambientCG (https://ambientcg.com): every asset is **CC0 1.0** (https://docs.ambientcg.com/license/). Sources
  were the 1K JPG/PNG downloads of the ids listed below.
- Everything drawn procedurally (layouts, windows, cornices, signs, noise, silhouettes, clock face) is own work,
  released as **CC0 1.0** by the project.
- No Poly Haven, Kenney or other files are embedded in these textures.

## Deviation from ART-DIRECTION.md 4.3
The AD asks for 1024 x 1024 trim sheets at 128 px/m, but its rows add up to 9.0 m. The sheets are 1024 x 1280
(8 m x 10 m at 128 px/m) and carry one extra row: a 1.0 m BLANK WALL of the sheet's main material (windowless
walls, sheds, gable ends). ORM and normal maps are half resolution (512 x 640, 64 px/m).

## Files

| File | What | Size | px/m | Sources (CC0 1.0) | Processing |
|---|---|---|---|---|---|
| `ground/asphalt.png` | road asphalt, warm grey | 512 | 128 (4 m tile) | [Asphalt031](https://ambientcg.com/view?id=Asphalt031) | stylise pass, low-freq tone, saturation <= 0.06 so it never reads navy, mean = #5E5C60 |
| `ground/pave_uk.png` | UK pavement, York stone flags in running rows | 1024 | 256 (4 m tile) | [Concrete012](https://ambientcg.com/view?id=Concrete012), [Bricks084](https://ambientcg.com/view?id=Bricks084) | procedural flag layout (0.5 m rows, 0.6-1.2 m flags), photo grain, bevels; stylise pass, mean = #C9C0B2 |
| `ground/pave_us.png` | US pavement, concrete flags with 1.5 m score lines | 1024 | 341 (3 m tile) | [Concrete034](https://ambientcg.com/view?id=Concrete034) | procedural score lines, photo grain; stylise pass, mean = #C7C3BC |
| `ground/pave_lagos.png` | Lagos interlock pavers | 1024 | 256 (4 m tile) | [Concrete012](https://ambientcg.com/view?id=Concrete012) | procedural pavers 0.25 x 0.125 m, mixed tones; stylise pass, mean = #B89F86 |
| `ground/plaza.png` | civic plaza stone, 1 m slabs | 1024 | 256 (4 m tile) | [Marble012](https://ambientcg.com/view?id=Marble012), [Concrete034](https://ambientcg.com/view?id=Concrete034) | procedural slabs, photo grain; stylise pass, mean = #D8CBB4 |
| `ground/grass.png` | park grass | 1024 | 256 (4 m tile) | [Grass004](https://ambientcg.com/view?id=Grass004) | stylise pass (+0.8 px soften), mean = #7FB356 |
| `ground/grass_dry.png` | dry grass / verge | 1024 | 256 (4 m tile) | [Grass001](https://ambientcg.com/view?id=Grass001), [Ground037](https://ambientcg.com/view?id=Ground037) | stylise pass, mean = #A7B866 |
| `ground/path.png` | park path, fine gravel | 1024 | 256 (4 m tile) | [Gravel023](https://ambientcg.com/view?id=Gravel023) | stylise pass, mean = #C9B98F |
| `ground/wear.png` | ground wear mask: R grime, G cracks/stains/patches, B macro brightness (0.5 mean) | 512 | ~21 (24 m world tile) | own work | procedural (periodic noise, wrapped strokes); own work |
| `ground/water_n.png` | water ripple normal map (GL, +Y up), scroll two copies | 256 | - | own work | procedural (periodic sines + noise); own work |
| `roofs/roof_flat.png` | flat roof membrane + gravel, neutral (mean 0.8), tint by the region roof hex | 512 | 128 (4 m tile) | [Gravel023](https://ambientcg.com/view?id=Gravel023), [Concrete036](https://ambientcg.com/view?id=Concrete036) | procedural 1 m membrane runs, photo grain; stylise pass, greyed to mean 0.8 |
| `misc/stone.png` | pale ashlar / limestone for landmarks and kerbs | 512 | 256 (2 m tile) | [Marble012](https://ambientcg.com/view?id=Marble012), [Concrete034](https://ambientcg.com/view?id=Concrete034) | procedural ashlar coursing, photo grain; stylise pass, mean ~0.8 warm neutral |
| `misc/clock_face.png` | clock dial (cream, bar numerals, gold ring, 10:10), alpha outside | 256 RGBA | - | own work | drawn with PIL at 4x; own work |
| `misc/props_noise.png` | painterly breakup noise for props (mean 0.5) | 256 L | 128 at 2 m | own work | procedural; own work |
| `misc/foliage.png` | leafy clump breakup for tree canopies (mean 0.5) | 256 L | - | own work | procedural (wrapped leaf clumps); own work |
| `misc/npc_atlas.png` | 8 distant pedestrian silhouettes (64 x 256 px cells, feet at the bottom) | 512x256 RGBA | - | own work | drawn with PIL at 4x; own work |
| `trims/trim_uk_brick.png` | UK brick: stock/red brick (tint), sash windows with white frames, gauged lintels, stone coping and string course, painted timber shopfront, deep fascias, roller shutter | 1024x1280 | 128 (8 x 10 m) | [Bricks085](https://ambientcg.com/view?id=Bricks085) | wall material: stylise pass then greyed to mean 0.8; architecture drawn procedurally (own work), baked bevel light + AO |
| `trims/trim_uk_brick_orm.png` | ORM: R AO, G roughness, B tint mask, A glass | 512x640 | 64 | [Bricks085](https://ambientcg.com/view?id=Bricks085) | wall material: stylise pass then greyed to mean 0.8; architecture drawn procedurally (own work), baked bevel light + AO |
| `trims/trim_uk_brick_n.png` | normal map (GL) | 512x640 | 64 | [Bricks085](https://ambientcg.com/view?id=Bricks085) | wall material: stylise pass then greyed to mean 0.8; architecture drawn procedurally (own work), baked bevel light + AO |
| `trims/trim_uk_stone.png` | UK stone: Portland ashlar (tint), balustrade + dentil cornice, architraves and hoods, arched window with balconette, rusticated ground floor with columns | 1024x1280 | 128 (8 x 10 m) | [Concrete034](https://ambientcg.com/view?id=Concrete034) | wall material: stylise pass then greyed to mean 0.8; architecture drawn procedurally (own work), baked bevel light + AO |
| `trims/trim_uk_stone_orm.png` | ORM: R AO, G roughness, B tint mask, A glass | 512x640 | 64 | [Concrete034](https://ambientcg.com/view?id=Concrete034) | wall material: stylise pass then greyed to mean 0.8; architecture drawn procedurally (own work), baked bevel light + AO |
| `trims/trim_uk_stone_n.png` | normal map (GL) | 512x640 | 64 | [Concrete034](https://ambientcg.com/view?id=Concrete034) | wall material: stylise pass then greyed to mean 0.8; architecture drawn procedurally (own work), baked bevel light + AO |
| `trims/trim_us_brownstone.png` | US East brownstone: smooth brownstone (tint), bracketed metal cornice, hoods, fire escape, cast-iron storefront, striped awnings | 1024x1280 | 128 (8 x 10 m) | [Concrete012](https://ambientcg.com/view?id=Concrete012) | wall material: stylise pass then greyed to mean 0.8; architecture drawn procedurally (own work), baked bevel light + AO |
| `trims/trim_us_brownstone_orm.png` | ORM: R AO, G roughness, B tint mask, A glass | 512x640 | 64 | [Concrete012](https://ambientcg.com/view?id=Concrete012) | wall material: stylise pass then greyed to mean 0.8; architecture drawn procedurally (own work), baked bevel light + AO |
| `trims/trim_us_brownstone_n.png` | normal map (GL) | 512x640 | 64 | [Concrete012](https://ambientcg.com/view?id=Concrete012) | wall material: stylise pass then greyed to mean 0.8; architecture drawn procedurally (own work), baked bevel light + AO |
| `trims/trim_us_modern.png` | US modern: curtain wall (#6F93AE glass, #8E98A3 mullions), concrete spandrels and parapet (tint only on concrete), lobby glazing, louvre panel | 1024x1280 | 128 (8 x 10 m) | [Concrete034](https://ambientcg.com/view?id=Concrete034) | wall material: stylise pass then greyed to mean 0.8; architecture drawn procedurally (own work), baked bevel light + AO |
| `trims/trim_us_modern_orm.png` | ORM: R AO, G roughness, B tint mask, A glass | 512x640 | 64 | [Concrete034](https://ambientcg.com/view?id=Concrete034) | wall material: stylise pass then greyed to mean 0.8; architecture drawn procedurally (own work), baked bevel light + AO |
| `trims/trim_us_modern_n.png` | normal map (GL) | 512x640 | 64 | [Concrete034](https://ambientcg.com/view?id=Concrete034) | wall material: stylise pass then greyed to mean 0.8; architecture drawn procedurally (own work), baked bevel light + AO |
| `trims/trim_us_west.png` | US West: stucco (tint), terracotta tile visor, rafter tails, arched dark-wood windows, iron balconette and gate, striped awning | 1024x1280 | 128 (8 x 10 m) | [Plaster001](https://ambientcg.com/view?id=Plaster001) | wall material: stylise pass then greyed to mean 0.8; architecture drawn procedurally (own work), baked bevel light + AO |
| `trims/trim_us_west_orm.png` | ORM: R AO, G roughness, B tint mask, A glass | 512x640 | 64 | [Plaster001](https://ambientcg.com/view?id=Plaster001) | wall material: stylise pass then greyed to mean 0.8; architecture drawn procedurally (own work), baked bevel light + AO |
| `trims/trim_us_west_n.png` | normal map (GL) | 512x640 | 64 | [Plaster001](https://ambientcg.com/view?id=Plaster001) | wall material: stylise pass then greyed to mean 0.8; architecture drawn procedurally (own work), baked bevel light + AO |
| `trims/trim_wa_render.png` | West Africa: painted render with rain streaks (tint), bare concrete frame, rusted tin eave, burglar-proof grilles + louvres, AC unit, saturated signboards | 1024x1280 | 128 (8 x 10 m) | [PaintedPlaster017](https://ambientcg.com/view?id=PaintedPlaster017) | wall material: stylise pass then greyed to mean 0.8; architecture drawn procedurally (own work), baked bevel light + AO |
| `trims/trim_wa_render_orm.png` | ORM: R AO, G roughness, B tint mask, A glass | 512x640 | 64 | [PaintedPlaster017](https://ambientcg.com/view?id=PaintedPlaster017) | wall material: stylise pass then greyed to mean 0.8; architecture drawn procedurally (own work), baked bevel light + AO |
| `trims/trim_wa_render_n.png` | normal map (GL) | 512x640 | 64 | [PaintedPlaster017](https://ambientcg.com/view?id=PaintedPlaster017) | wall material: stylise pass then greyed to mean 0.8; architecture drawn procedurally (own work), baked bevel light + AO |
| `trims/trim_generic.png` | Generic: render upper floors (tint), brick ground floor (untinted #A65441), plain windows, fascias | 1024x1280 | 128 (8 x 10 m) | [Plaster001](https://ambientcg.com/view?id=Plaster001), [Bricks085](https://ambientcg.com/view?id=Bricks085) | wall material: stylise pass then greyed to mean 0.8; architecture drawn procedurally (own work), baked bevel light + AO |
| `trims/trim_generic_orm.png` | ORM: R AO, G roughness, B tint mask, A glass | 512x640 | 64 | [Plaster001](https://ambientcg.com/view?id=Plaster001), [Bricks085](https://ambientcg.com/view?id=Bricks085) | wall material: stylise pass then greyed to mean 0.8; architecture drawn procedurally (own work), baked bevel light + AO |
| `trims/trim_generic_n.png` | normal map (GL) | 512x640 | 64 | [Plaster001](https://ambientcg.com/view?id=Plaster001), [Bricks085](https://ambientcg.com/view?id=Bricks085) | wall material: stylise pass then greyed to mean 0.8; architecture drawn procedurally (own work), baked bevel light + AO |

## Trim sheet layout (shared by every sheet; place.gd UVs)

| Row | Metres (from top) | Pixels (albedo 1024 x 1280) |
|---|---|---|
| parapet_cornice | 0.0 to 0.6 | 0 to 77 |
| roof_edge | 0.6 to 1.0 | 77 to 128 |
| upper_bay | 1.0 to 4.2 | 128 to 538 |
| string_course | 4.2 to 4.5 | 538 to 576 |
| shopfront | 4.5 to 8.5 | 576 to 1088 |
| plinth | 8.5 to 9.0 | 1088 to 1152 |
| blank_wall | 9.0 to 10.0 | 1152 to 1280 |

Upper bay: x 0-4 m variant A, 4-8 m variant B. Shopfront: x 0-4 m glazing + fascia, 4-6 m door, 6-8 m
roller shutter. Every row tiles horizontally at 8 m. ORM: R AO, G roughness, B tint mask (1 = main wall
material, authored neutral grey with mean luma 0.8: shade with `albedo * mix(vec3(1), tint / 0.8, B)`),
A glass (window panes).

## Not shipped (look-world)
`make_world_art.py` also draws `ground/sand.png`, `ground/ballast.png`, `ground/concrete.png` and `ground/laterite.png`
(art direction 4.5's sand, railway, industrial and Lagos verge ground). The server's ground document does not carry
those land uses yet, so nothing would use them; they are left out of the game pack (about 2.7 MB of ETC2) until it does.
Their sources would be Gravel023, Concrete034/036 and Ground037 (ambientCG, CC0) plus own procedural work.

## Kit meshes (`kit/*.res`)
68 meshes baked by `tools/world/bake_kit.gd` from `world_landmarks.gd` and `world_props.gd`: procedural, own work,
**CC0 1.0**. No third-party geometry. Parked and moving cars reuse the Kenney Car Kit already in `art/city/cars`
(CC0 1.0, `art/city/cars/LICENSE-Kenney-CarKit-CC0.txt`).

## Hero landmarks and the Times Square screens (day1-world)
- Elizabeth Tower, the Times Square screen tower, Hoover Tower, the National Arts Theatre and the generic arch,
  dome, spire and bridge pieces are built in code at load (`world_heroes.gd`, `world_landmarks.gd`): procedural,
  own work, **CC0 1.0**. No third-party geometry, no logos.
- `misc/screens.png`: 16 made-up ads and colour panels drawn by `tools/world/make_screens.py` (own work, **CC0 1.0**).
  Generic words and shapes only, no real brand, product or person. The words are rasterised from DejaVu Sans Bold
  (https://dejavu-fonts.github.io/License.html, Bitstream Vera licence: free to use, embed and redistribute);
  no font file is shipped.
