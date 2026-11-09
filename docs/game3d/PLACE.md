# The real place round a fight (cq 019)

Until cq 019 every 3D fight happened in the same night street (cq 016), wherever the Quest Point was.
Now, when the map has the ground round the point, the fight happens in the real place: the buildings,
roads, squares, green, water, trees and landmarks round the point, from OpenStreetMap, laid out round
the fighters and turned so the camera faces the nearest landmark. A short fly-in from the landmark
down to the fight camera opens the fight, with the point's name.

It is recognisable, stylised (not photoreal), in the art direction's regional kit and Golden light (look-world).
Photoreal places would be Google 3D Tiles (a billed key, about 4 weeks, no iOS yet): that is Mark's call
(SCOPE-CHECK.md).

## Where the ground comes from
- **In the app:** the store already fetches `/v1/map/ground` (600 m round the player) for the map.
  `Fight3D.tsx placeFile` writes that answer to a cache file and the fight config gets
  `arena: "place"`, `ground_json` and `place_at` (the point in the ground's metres, `fight3d.ts
  placeFrom`). No ground, a ground no archive covers, or a point off it: the street, as before.
  `EXPO_PUBLIC_GAME3D_PLACE=0` keeps the street everywhere.
- **On the server:** `/v1/map/ground` answers from the PMTiles archives published for venues
  (`app/ground.py`). A place no archive covers has no ground yet.
- **For any lat/lon, today:** `costquest-backend tools/arena/osm_ground.py` makes the same answer
  straight from OpenStreetMap (the Overpass API, one request per place, cached), plus the real mapped
  trees and the landmarks (columns, monuments, statues, fountains), which the vector tiles do not carry.
  `--lat --lng --radius --out`. The Trafalgar Square answer is 134 KB (in
  `app/game3d/tests/fixtures/trafalgar_ground.json`).

## How it is built (`place.gd`, look-world)
look-world (1 Nov 2026) rebuilt the place to the art direction "Sunlit Real Places"
(`cosquest-review/art-direction/ART-DIRECTION.md` + `tokens.json`). The default street uses the same code: it is
a laid-out ground document (`street_layout.gd`) built by `place.gd`, so the street and the real places share one
kit, one light and one material set.
- Coordinates: the ground's x east, z north, turned into the fight's frame so the chosen landmark is
  straight ahead of the camera (the landmark: the most notable one 12 to 140 m away, weighted by kind and
  height; else the tallest building near by).
- **Nothing in the fight's way:** no building, statue or tree inside the fighters' area plus a margin, or
  between the fight and the camera (`CLEAR`; a ground document may set its own `clear`, as the street does).
  The fighters keep the same 11.2 x 18 m area and every rule: seeded fights are byte-identical.
- **Region** from the ground's origin (`region_of`: UK/Ireland, US east, US west, West Africa, else generic) or
  a `region` key; it picks the trim sheets, wall and roof tints, pavement, street furniture, road markings and
  the tree climate (`REGIONS`, tokens `world.regions`).
- **Ground by land use** (`world_ground.gdshader`, textures tiled in world space, a 24 m wear map over them):
  the region's pavement as the floor, plaza stone on squares, grass (dry grass for meadow/scrub and the
  tropics), park paths, moving water (`world_water.gdshader`). Fountain basins the landmark kit draws are not
  drawn twice.
- **Roads** (`place_roads.gd`): each car road a ribbon with round joins and ends (`offset_polyline`), asphalt
  at 128 px/m; kerbs on the outline of the union of the ribbons (0.15 m rise, 0.3 m stone top, AO on the road
  side); markings by region in one vertex-coloured mesh (UK dashed centre and double yellows, US double yellow
  and lane lines, Lagos faded), none inside junctions; crossings where OSM maps a footway crossing a road:
  zebras with Belisha beacons (UK) or ladders (US) mid-block, studded signal crossings near junctions.
- **Buildings**: walls laid out in bands on the region's trim sheet (`world_facade.gdshader`, art/world/trims,
  128 px/m): plinth, a shopfront where the wall faces a road or a square (else a bay over a blank band), string
  course, whole floors of upper bays, roof edge, parapet; narrow returns and sheds get blank wall. Walls tinted
  per building from the region's wall list, windows lit warm per window at the preset's strength, glass
  reflecting the sky. Flat roofs with roof clutter (chimney stacks, AC units, vents, NY water tanks, Lagos tanks
  and dishes, plant on towers). Tall and big buildings take the civic or modern sheet.
- **Landmarks** (`world_landmarks.gd`): column (Nelson's), obelisk, three statues, Landseer lions (OSM statues
  named "Lion", facing out from the column), tiered fountains with spray, memorials, clock towers, monument
  platforms. MultiMesh per kind.
- **Dressing** (`place_dress.gd`, `world_props.gd`): along every car road, lamps every ~24 m per side, bins,
  benches, US hydrants, UK post and phone boxes; traffic lights at busy junctions; bollards where a square meets
  a road; lamps, benches and planters in squares; parked cars (Kenney Car Kit at 4.5 m) on quieter roads;
  OSM trees as the climate's species (15 species, 4 climates) plus street trees where none are mapped. Each kind
  stops at a distance (`KIND_REACH`) past which it would be a few fogged pixels.
- **Baked shade** (`place_bake.gd`): building, landmark, tree and post shadows along the preset's sun and the
  contact AO at wall feet, trees, landmarks and kerbs, drawn once by a SubViewport (UPDATE_ONCE, 1024 px over
  440 m) into one texture that every ground material reads: no per-frame cost.
- **Life** (`place_life.gd`): up to 3 cars driving roads clear of the fight, 10 distant pedestrians (billboards)
  strolling, 12 pigeons circling the landmark, spray on the nearest 2 fountains, leaves (temperate autumn) or
  golden dust motes. Cosmetic only, its own fixed-seed random numbers.
- The kit's meshes are baked ahead (`tools/world/bake_kit.gd` -> `art/world/kit/*.res`).
- The minimap gets the real footprints. Everything past 260 m is left out; the camera sees about 150 m.

## Numbers (look-world, farm CPU, Godot 4.5.1 Compatibility on llvmpipe, 720x1280)
- Build: Trafalgar 191 ms (buildings 78, dress 52, roads 48, landmarks 4, flat 2), the street 52 ms. The art
  direction's budget is 60 ms on a device; see "Not done".
- Per frame (the renderer's own counts, fight and fly-in stills): 107 to 189 draws (budget 250), 254 k to 348 k
  primitives (budget 350 k), 83 to 96 MB texture memory (budget 220 MB).
- Frame time on the 4-thread software GPU (interleaved, 2 rounds): street 22.5 -> 28 ms p50, Trafalgar 16.5 ->
  33 ms p50 (it was an almost empty blockout). A software GPU pays per triangle; a phone GPU is not measured yet.

## Tests
- Godot `tests/place_test.gd`: the camera faces Nelson's Column, the fight's area is clear, the minimap
  gets the footprints, it builds in under a second, another spot faces something too.
- App `fight3d.test.ts`: where the point stands on the ground, and the config Godot gets.
- Server `tests/test_arena_osm_ground.py`: an Overpass answer becomes the server's ground shape with
  heights, road kinds and widths, trees, landmarks, water and squares.

## Not done
- Build time: 191 ms for Trafalgar on the farm's CPU is over the 60 ms device budget. Next steps, in order of
  value: let the game server send the place pre-built (roads, kerbs and walls as arrays), or build in a thread
  during the fly-in; a GDExtension for the wall and kerb geometry.
- Hero landmarks (Big Ben, the Times Square billboard canyon, Hoover Tower, Lagos National Theatre) and the
  generic arch, dome, spire and bridge pieces of the art direction 4.7.
- Land uses the server does not send yet (sand, railway, industrial, parking) have no ground; the generator can
  draw their textures (`make_world_art.py`), they are left out of the pack until the data exists.
- Building tags (`building=*`, `building:material`, levels) are not in the ground document; the style comes from
  the region and the height/footprint. `osm_ground.py` could pass them through.
- Points whose ground the server does not have (no published archive) keep the street. Publishing
  archives for the places that matter (or serving `osm_ground.py`'s answer) is a deploy decision.
