# Forge drop-in: Forge assets in the game with no app release (cq 056)

What a published Forge element becomes in the game, how the app finds it,
and how Mark's team gets a new asset from the Forge to players' phones.
The server side (manifest, polling, validation, spawn/claim/equip rules,
import) is costquest-backend `docs/forge/CONTRACT.md`, branch `forge-world`.

## The switch

Everything here is behind the game server's feature `forge_world`
(`CQ_FEATURES_ON=...,forge_world`; off by default, so production stays as it
is until someone turns it on). The app reads it from `/me`
(`features.forge_world.on`) on every refresh: with it off the app looks and
plays exactly as before (`docs/forge/shots/00-flag-off-map.jpg`). The 3D view
can also be turned off per build: `EXPO_PUBLIC_GAME_2D=forgeModel` (thumbnails
only).

## What each type does in the game

| Forge type | Contract fields the app uses | In the game |
|---|---|---|
| weapon | `lods`, `thumbnail`, `gameplay.{class,kind,damage,range_m,cooldown_s}` | Finds on the map (server spawn rules), claim in reach with a reward moment, Forge bag, equip; the equipped weapon is on the duel versus card in 3D and the server fights with its class and a bounded damage modifier |
| character, role `hero` | `animations` (idle/walk/celebrate), `rigged`, `gameplay.avatar` | Pick it in Forge bag > Avatar (plays idle, walk, celebrate), wear it: HUD chip, map marker, profile (live 3D), celebrates on wins and claims |
| character, role `guardian` / `boss` | same | The server picks one (deterministically per point / raid) for the AI opponent; it stands on the versus card in 3D |
| environment | `gameplay.{placement,radius_m}`, `scale` | Dresses about half the points: a backdrop behind (or a prop beside) the point's scene in the encounter; on iOS venue Events via the game pack path (`forge-env:` packs) |
| station | `scale`, `gameplay.site_id` | Stands at its Warden site's point, else at about half the points, instead of the built-in shrine (Android: instead of the 2D crystal; iOS: instead of the RealityKit shrine) |

No code names an element. Adding a weapon, a hero, an environment or a
station is publishing it in the Forge.

## The 3D runtime

`react-native-filament` 1.11 (Google Filament; OpenGL ES/Vulkan on Android,
Metal on iOS; GLB with PBR materials, skins and clips; renders off the JS
thread), with `react-native-worklets-core` for its render loop. Self-hosted:
the engine is in the app, no service or key.

- `components/game/ForgeModel.tsx`: `<ForgeModel id lod animation purpose spin />`
  and `<ForgeStage items>` (several entries in one scene, one engine).
- Download once per version: `features/game/forgeWorldDevice.ts ensureFile`
  keys the cache by element id, version and the file's sha256; a download
  that does not match the catalogue's sha256 is deleted and never shown.
- LOD by device class (`deviceClassOf`: pixel ratio and screen size;
  `EXPO_PUBLIC_FORGE_LOD=low|mid|high` overrides) and purpose (thumb / scene /
  closeup), falling back to the nearest available LOD.
- Placeholder while loading (the server's thumbnail with a spinner); any
  failure (no GLB, bad digest, a model the engine rejects) stays on the
  thumbnail, inside the model's own box.
- Why not expo-gl + three: GLB textures on React Native need JS image
  decoding there, rendering is on the JS thread, and iOS would be on the
  deprecated OpenGL ES. Filament built cleanly on this app's RN 0.86 / Expo 57
  on the first try.

## Measurements (Android emulator, software GPU)

API 35 x86_64 emulator, 3 GB, GPU = ANGLE on SwiftShader (the CPU draws
everything, and "GPU" memory is the app's own RAM), release build.
`[forge-fps]` log lines (test builds, `EXPO_PUBLIC_WORLD_TIMING=1`) and
`dumpsys meminfo` every 3 s (`e2e/forge/measure.sh`):

| on screen | Filament FPS | app PSS |
|---|---|---|
| the map (no 3D; finds are 2D pins) | – | ~230 MB |
| one model (Forge bag) | 34–43 (character with idle clip / turning weapon) | ~340 MB |
| the point scene: station + environment + avatar (3 views) | – | ~530 MB peak |
| back on the map after it | – | ~400 MB (caches) |

FPS on the emulator is a floor, not a phone's number. Two things found on
the way, both handled:

- The emulator's default GLES translator reports 256 vertex uniform
  vectors and Filament's lit shader fails to link there (a native abort).
  Run the emulator with `EMU_GPU=swangle_indirect` (`e2e/emu.sh`); a build can
  also pick `EXPO_PUBLIC_FORGE_BACKEND=vulkan`. Check one low-end phone.
- A single Filament scene holding three models ran away with memory on the
  emulator (the low-memory killer took the app at 2-4 GB); three single-model
  views cost ~300 MB. So the point scene is layered views (`ForgePointScene`),
  and one view keeps its engine while its model changes.
- Over a live 3D view the emulator's UI hierarchy dumps never settle, so the
  proof drives those screens with adb taps (`e2e/forge/drive/*.sh`).

## Runbook: a new asset from the Forge to the game

1. Build it in the Forge portal as today (brief, type, role for characters:
   `hero` to be wearable, `guardian` / `boss` to be an opponent; weapon stats
   and optional `kind`; environment `placement` and `radius_m`).
2. Review it. Approve and Publish now run the pack check: an unusable pack is
   refused with the reason (no GLB, a file without a digest, a rigged
   character without an `idle` clip, absurd bounds); warnings (no thumbnail,
   no USDZ, identical LODs = placeholder, not rigged) are shown but allowed.
3. That is all. Phones poll `GET /v1/catalogue?types=...&since=` (60 s
   cache); the new element is downloaded the first time a screen needs it.
   Weapons start appearing as finds in the next spawn bucket (30 min);
   heroes are in the Avatar tab; environments and stations dress points on
   the next points refresh.
4. To take it out: Unpublish. Phones drop it on the next poll (`removed`).

Packs made offline (re-rigged, re-textured) go in as a new version of the
same element with costquest-backend `tools/forge_import.py` (run inside the
API container, like the seed tool), then are reviewed and published as
usual.

## The proof (Android emulator)

`e2e/forge/stack.sh` (local chat + game backend, forge_world on),
`e2e/forge/make_packs.py` (fixtures from existing Forge output: the 057
benchmark lifts and rigged characters, the four textured staging stations),
`e2e/forge/proof.sh` (unpublish everything, record the map, publish while
the app runs, then avatar, find/claim/equip, duel, station; videos with a
silent audio track). Results and video paths: cq 056 REPORT.

```sh
source ~/cq-work/game-forge/rig/env.sh        # ports, AVD, EMU_GPU=swangle_indirect
python3 e2e/forge/make_packs.py <packs_dir>   # fixtures from existing Forge output
e2e/forge/stack.sh up
e2e/emu.sh up <apk built with GAME_SERVER=http://localhost:8599 EXPO_PUBLIC_FORGE_LOD=low>
PACKS=<packs_dir> e2e/forge/proof.sh proof
```
