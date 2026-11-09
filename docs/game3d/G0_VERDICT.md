# G0 verdict: can Godot carry CosQuest's real-time 3D combat?

Task cq 061, 2026-10-21. Branch `godot-g0` of ubmids/cosquest-merged (from `forge-world`).
Everything below was measured on the Android emulator (API 35, x86_64, AVD `cx054`,
`EMU_GPU=swangle_indirect`, i.e. ANGLE on SwiftShader: **the GPU is software on the
host CPU**). Frame rates and latencies are therefore relative numbers: a phone's GPU
will do much better. Memory (PSS) is closer to real but still includes emulator GL
translation. Nothing here used Unity: the `street-look` Unity repo was read as text
for the camera, HUD and FX numbers only.

## The answers

| # | Question | Verdict | One-line evidence |
|---|---|---|---|
| 1 | Godot inside the merged Expo app on Android | **GO** | Map point, then "Fight (3D)", then the Godot fight, then the result on the app's reward screen, recorded. 10 open/close cycles without a crash, leaving ~0.3 MB native memory per fight. A leak in the library's worklet bridge (~1.7 MB per JS-to-Godot call, ~7 MB per fight) was found and designed around. |
| 2 | Combat feel | **GO** | Armstrong (Forge, runtime GLB) on a joystick, slash arc, sparks, WHIRL on a 6 s cooldown, Guardian with a health bar, 45 s timer, reference HUD. Input to motion: thumb on the stick p50 83 ms, Attack p50 82 ms, under 100 ms in 19/21 and 18/21 presses. A drag that starts beside the stick is p50 118 ms. All on a 16 fps software GPU. |
| 3 | Photoreal 3D Tiles on a phone in Godot | **Technically GO on Android; NO-GO as the G1 product path** | The 3D Tiles for Godot GDExtension now builds for Android arm64 and x86_64 and loads in the app. It streams and renders inside the fight a public CesiumGS sample and **real textured photogrammetry (NASA Dingo Gap, 5,149 tiles)**, both recorded. Placement and orientation were hand-tuned, re-creating the engine with the extension loaded crashes, and there is no iOS build. Google tiles need a billed key, logo and credits, and no caching. G1 uses stylised OSM + Forge arenas; tiles stay a spike. |
| 4 | Cost | measured | PSS: map 328 MB, arena 422 MB (+94), with 3 characters 438 MB (+110), with tiles 499 MB (+171). APK: +73 MB raw for Godot (x86_64; arm64 77 MB raw, 25 MB compressed), +14 MB raw for the tiles plugin (4.6 MB compressed). |
| 5 | iOS | written, **not compiled** | `scripts/verify-ios.sh --godot` for the Mac, plus the untested list below. |

## 1. Embedding (GO)

**What runs:** `@borndotcom/react-native-godot` 1.0.1 on LibGodot `4.5.1.migeran.2` (Godot 4.5.1, fork commit 21fba302).
- **Engine:** Godot runs on its own thread and draws into a SurfaceControl child of `RTNGodotView`.
- **Fight project:** `app/game3d/`, exported as a folder into `assets/game3d` and opened with `--path /game3d`.
- **Renderer:** `gl_compatibility` (OpenGL ES 3).

**The flow:**
1. A duel point on the map opens the existing briefing.
2. With `EXPO_PUBLIC_GAME3D=1` the briefing has a "Fight (3D)" button (`components/game/DuelScreen.tsx`, `RaidDuel.tsx`).
3. `Fight3D` builds the config:
   - **Characters:** the player's worn Forge hero, another hero as the ally, and the point's Guardian, the same one the server would pick. All are local GLB paths from 056's Forge cache.
   - **Bridge calls:** it sets a result callback and calls `Bridge.start_fight(json)` on the Godot thread.
4. Godot reports `{outcome, damage_dealt, damage_taken, time_s, ...}` through the callback.
5. The app closes the fight and shows the existing `Reward` screen with Result, Damage dealt, Damage taken and Time.
6. The server cannot judge a 3D fight: duels are judged by replaying the 2D game's inputs. So the reward screen says "A 3D practice fight: the server did not judge it, so it paid no XP". No fake server win.

**Proof:**
- **Video:** `out/videos/g01-map-to-fight-to-reward.mp4`. Map point, briefing, Fight (3D), a 26 s fight played with on-screen touches, VICTORY, then the reward "Guardian down!" with damage 2701 / 453 and 26 s. Armstrong celebrates in Filament, then "Back to the map".
- **Screens:** in `out/shots/g01-*`.

**Open and close repeatedly** (`cosquest://fight3d?mode=...&cycle=10&ms=8000`, PSS and native heap sampled every 2 to 3 s, `e2e/godot/memwatch.sh`):

| Build and mode | Cycles | Crash | Memory left behind per fight |
|---|---|---|---|
| first bridge, destroy engine on close (no tiles plugin), arena / 2 Forge characters | 10 / 10 | none | ~8 MB native heap |
| first bridge, keep one engine (pause/resume), arena / 2 Forge characters | 8 / 10 | none | ~6 / ~7 MB |
| destroy engine on close **with the 3D Tiles GDExtension loaded** | 2 | **SIGSEGV** in the extension's init on the second engine | n/a |
| status pushed by Godot, close = pause (one worklet run per fight) | 10 | none | ~2.2 MB |
| **final**: + kept engine starts fights from the JS thread (no worklet run) | 10 | none | **~0.3 MB native, ~0.6 MB PSS** (206.7 to 209.7 MB native over 10 fights) |

**How the leak was found:**
- **Long fights are flat:** a single 45 s fight, with or without the bot, stays flat. So do 10 fight restarts inside one Godot view (`selfcycle=10`: 438 to 440 MB) and 8 background/foreground surface cycles.
- **Godot's own allocator is flat:** `OS.get_static_memory_usage` stays at 58.3 MB across headless restarts with the Forge GLBs. Object counts stay at ~1,490 objects, 9 resources and 50 nodes.
- **The cause:** 300 `bridge.get_status()` calls from React Native (`statusspam=300`) put **+490 MB** of native heap (+550 MB PSS) on the emulator, and a Hermes `gc()` in the Godot thread's runtime frees none of it.
  - Every `runOnGodotThread(fn)` in react-native-godot 1.0.1 builds a new `JsiWorklet` and `WorkletInvoker`. That means the worklet's source is compiled again in the Godot thread's Hermes runtime, and the memory never comes back.
  - The first bridge polled `get_status` and called `end_fight`, about 4 to 5 runs per fight.

**The fix** (`features/game3d/engine.ts`, `game3d/bridge.gd`):
1. Godot pushes `{"event": "state", ...}` and the result through one callback, set once per engine. Every message carries the app's `fight_id`, and late ones from a replaced fight are dropped.
2. Close is a plain pause. The next `start_fight` replaces the paused fight.
3. A kept engine starts the next fight from the React Native thread: `Engine.get_singleton("CQBridge").call_deferred("start_fight", json)`. Godot's `call_deferred` is thread-safe. The Bridge registers itself as an Engine singleton, because Node lookups are main-thread only.
4. Only the first fight on a new engine uses worklet runs: create, plus a few tries while the scene tree comes up.

**For later:** the library should reuse one worklet per call site, or free the old ones. Report it to Migeran, or patch it in G1.

**Consequences:**
1. The default is now **one engine for the app's life**. Close pauses it and the next fight resumes it (`EXPO_PUBLIC_GODOT_KEEP=0` switches back to destroy).
2. Destroy/re-create leaks more and crashed once a GDExtension (3D Tiles) was loaded.
3. The kept engine costs its baseline (~90 MB PSS on the emulator) after the first fight. G1 adds destroy on `onTrimMemory`.

**Library patches** (patch-package, `app/patches/@borndotcom+react-native-godot+1.0.1.patch`):
1. `download-prebuilt.js`: `PREBUILT_ONLY` filter, so Linux installs the Android zips only.
2. `NativeGodotModule.java`: `getJSCallInvokerHolder()` from the context. RN 0.86 is bridgeless and `getCatalystInstance()` is a shim.
3. `native_godot_module_jni.h`: removed an include of `react/jni/CxxModuleWrapper.h`, which is gone since RN 0.82. It was unused.
4. `GodotModule.cpp`: the API 29 Choreographer calls are weak symbols behind `__builtin_available`, so the library builds at the app's minSdk 26. The 3D fight is only offered on Android 10+ (API 29), because the view needs SurfaceControl.

**LibGodot x86_64:**
- The official prebuilts ship arm64-v8a and armeabi-v7a only. For the emulator I built `libgodot_android.so` (template_release, `production=yes optimize=speed_trace`, swappy off, as in the fork's release script) and godot-cpp for x86_64 from the same tag. I repacked them into the library's zips (`~/cq-work/tools/libgodot/out/`, scripts in `~/cq-work/game-godot/scripts/libgodot-*.sh`).
- **Header check:** the GDExtension header is byte-identical to the release's.
- **Not needed for phones:** phones use the official arm64 build.

**worklets-core:** one copy, **1.6.3** (the app's), via npm `overrides`.
- react-native-godot pins 1.6.2 as a dependency.
- 1.6.2 to 1.6.3 only changes the Android CMake: it links `hermesvm` on RN 0.82 and later, which RN 0.86 needs. The JS and C++ API is identical, so 1.6.2 would not even link here.
- Filament (056) uses the same copy.

## 2. Combat feel (GO)

**Built** (`app/game3d/`, typed GDScript, ~2,300 lines):
- **Joystick:** virtual, bottom left. It floats where the thumb lands, or uses the drawn stick's centre when the thumb lands on it, so the first touch already steers.
- **Attack and skills:** a big ATTACK button plus 5 skill buttons on an arc: CHARGE, SPLIT, **WHIRL** and RALLY from the Unity HUD, plus SHIELD. WHIRL is real: a 3 m area hit on a 6 s cooldown with a radial overlay and seconds left. The other four show "Locked".
- **HUD:** 0:45 timer and "2/3 players" at the top, the point name under them, a minimap top right (32 m), and names and health bars over the hero, the ally and the Guardian. Damage numbers, hit-stop and screen shake.
- **FX:** slash arc (procedural crescent, fades in 0.2 s, from BladeTrail's 0.25 s) and hit sparks (CPUParticles3D, 10 per hit and 22 on a heavy hit, from BattleFx).
- **Camera:** high three-quarter, from BattleCamera: pitch 40 degrees, yaw 15, FOV 56, SmoothDamp 0.16 s. Distance scaled from Unity's 2.8 m hero to the 1.8 m Forge characters.
- **Guardian:** a dummy that approaches at 1.6 m/s and swings after a 0.6 s red telegraph. HP: Guardian 3000, hero 1000, ally 800.
- **Endings:** win, lose or timeout.
- **Characters loaded at runtime** with `GLTFDocument.append_from_file` + `generate_scene` on a worker thread, from the Forge cache:
  - **Load time:** Armstrong, the knight and Street Kid at LOD1 (~3 MB each) took 35 to 62 ms each to parse, 0.4 to 0.55 s for all three.
  - **Clips:** `idle`, `walk` and `celebrate` are found and played. There is no attack clip in the Forge rig, so the attack is a lunge plus the arc.
  - **Fallback:** capsules when a file is missing.
- **Start time:** cold engine start to "fighting" is ~1.2 s. Of that, the engine boots in ~0.45 s and the characters load in ~0.5 s.

**Input to motion, measured** (`e2e/godot/latency.sh`):
- **Injection:** raw touch packets are written to the emulator's touchscreen (`/dev/input/event2`) by a tiny static binary (`e2e/godot/inject.c`). It reads the phone's CLOCK_REALTIME right before `write()`.
- **Godot's side:** Godot logs the same clock at the input event and again at `RenderingServer.frame_post_draw` of the first frame where the hero moved, or where the slash arc became visible for attacks.
- **What it misses:** the compositor's last step to the glass (up to one vsync, 16.7 ms) is not seen.
- **Sample:** three fights, 7 rounds each, `chars` mode, keep-engine build:

| Input | n | p50 | p95 | under 100 ms | of which: delivery to Godot (p50) | engine, input to drawn frame (p50) |
|---|---|---|---|---|---|---|
| thumb lands on the stick (steers at once) | 21 | **83 ms** | 108 ms | 19/21 | 25 ms | 55 ms |
| Attack button | 21 | **82 ms** | 119 ms | 18/21 | 29 ms | 53 ms |
| drag from a floating stick (touch beside the stick, then push) | 21 | 118 ms | 138 ms | 4/21 | 61 ms | 52 ms |

- **Why the drag is slower:** Android batches move events to the next vsync, and the first move only arrives after the thumb has travelled.
- **Frame-bound:** every row is one SwiftShader frame (50 to 67 ms) plus the wait for the next frame. At 60 fps on a phone the same pipeline is ~30 to 40 ms.
- **Earlier changes that helped:**
  - The HUD now follows the embedded window size. It was laid out for a zero-size window.
  - 3D renders at half resolution.
  - HUD text is drawn after all shapes, grouped by size (draw calls down from 84 to 72).
  - The stick steers on touch-down.

**Frame rate** (Godot's own frame times, `CQPERF`): arena 17 fps (p50 50 ms), characters 16 fps (p50 67 ms), with tiles 13 fps (p50 83 ms, p99 117 ms).
- **What limits it:** the software GPU. The frame loop is paced by react-native-godot's Choreographer callbacks, so frames land on vsync multiples (50, 67 or 83 ms).
- **Phone check needed:** a mid-range phone should hold 60 fps. G1 has to confirm it on one Adreno and one Mali phone.

## 3. Real places with 3D Tiles (technically GO on Android; NO-GO as the G1 product path)

**What was done:**
- **Plugin build:** Battle-Road/3D-Tiles-For-Godot (HEAD a9c4c0b) with cesium-native v0.52.1, built for Android **x86_64 and arm64-v8a**.
  - **Toolchain:** NDK 27.2.12479018, API 28, static libc++, 16 KB page alignment, only the entry symbol exported. vcpkg android triplets, no curl.
  - **Scripts:** `app/game3d/tools/tiles-android/` (`build.sh`, `CMakeLists.txt`, `env.sh`).
  - **Patch:** `android-godot-http.patch` switches the plugin to its existing Godot `HTTPClient` accessor on Android (the macOS path) instead of curl.
- **Compile fix:** cesium-native passes `GLM_FORCE_*` settings on to everything that links it, and with them the plugin's own code doesn't compile. Those settings are now dropped only for the plugin.
- **Packaging:** the `.so` ships in the APK's `lib/<abi>/` and `res://addons/cesium_godot/Godot3DTiles.gdextension` names it. A godot-cpp **4.1.4** extension loads in the **4.5.1** engine.
- **In the fight:** `app/game3d/tiles_layer.gd` puts a `CesiumGeoreference` at the arena and a `Cesium3DTileset` from a URL under it, and calls `update_tileset` every frame. No keys, no ion.

**Results on the emulator:**
- **Renders:** the CesiumGS `3d-tiles-samples` "TilesetWithDiscreteLOD" (the dragon, 3 LODs, glTF in b3dm, public, served from this machine over `adb reverse`) **streams and renders inside the fight**. Video: `out/videos/g02-fight-on-3d-tiles.mp4`, a fight won next to the streamed model, result back in RN.
- **Renders, real photogrammetry:** NASA-AMMOS `msl-dingo-gap` (Mars rover photogrammetry: textured JPEG, unlit, 5,149 b3dm, public, no key) **streams and renders under the fighters**. This is the closest public stand-in for Google's photoreal tiles. Video: `out/videos/g03-fight-on-photogrammetry-tiles.mp4`, a 40 s fight won on the terrain, reward back in RN.
  - About 34 tiles are loaded around the arena, 17 drawn at a time, over 94 HTTP requests.
  - **Why the first tries showed nothing:**
    1. The dataset declares `"gltfUpAxis": "z"` in lower case. cesium-native doesn't read that as Z, so the terrain stood on its side. `game3d/tools/tiles-android/make-dingo-z.py` writes a copy with `"Z"`.
    2. My ECEF wrapper with the plugin's Cartographic-origin mode placed it out of view. The run that works loads the tileset directly in the plugin's **True Origin** mode, with the tileset node turned 180 degrees about X (`torigin=1&trotx=180` on the test link). Before the turn the surfaces faced away and only the textured tile seams showed.
- **Placement is hand-tuned:**
  - The Cartographic-origin placement behaves unexpectedly: heights move non-linearly with latitude changes.
  - The working orientation was found by trial.
  - Real places need this solved properly: arena origin from lat/lon/height, ground height from the tiles (a ray cast against the tile meshes, which the plugin can build as physics shapes).
- **Crash on re-create:** re-creating the Godot engine in the same process with the extension loaded crashes (SIGSEGV in the extension's init). The one-engine default avoids it. A later G-stage needs a fix in the plugin (static state) or must keep the engine alive.
- **Cost:**
  - **Dragon (3 LODs):** **+61 MB PSS** over the character fight (499 vs 438 MB); frame time p50 rises from 67 to 83 ms.
  - **Photogrammetry:** **+135 to 155 MB PSS** while fighting (571 to 591 vs 438 MB), Godot video memory 98 to 102 MB, 13 to 14 fps (frame p50 67 to 83 ms, p95 ~120 ms).
  - **At city scale:** a city of photogrammetry will be heavier. It needs LOD/SSE budgets by device class.
- **No iOS build** of the plugin was attempted. cesium-native supports iOS, but the plugin would need a static or xcframework GDExtension for LibGodot iOS.

**Honest effort to make photoreal places a phone feature:**
- **Georeferencing:** proper placement at a lat/lon with Google-style ECEF tiles (Cartographic origin, camera-relative LOD; today LOD is chosen from the georeference origin), ground height under the arena, and no hand rotations. 3 to 5 days.
- **Plugin re-init crash:** 1 to 2 days. Or keep the engine alive, as now.
- **iOS build** of the plugin (static/xcframework GDExtension for LibGodot iOS): 3 to 5 days.
- **Performance on real phones:** about a week. Memory budget, KTX2/basis textures, SSE by device class, frame pacing while tiles stream.
- **Google specifics:** about a week. Key handling and a proxy, the session, the logo and credits overlay, the cache turned off.
- **Total:** about **4 weeks** of one engineer. The plugin is young and desktop-first: a fork we own, not a dependency we can update.
- **Bottom line:**
  - **Technology:** works on Android. Real textured photogrammetry renders under the fight on a software-GPU emulator at 13 to 14 fps.
  - **Product path for G1:** a **NO-GO**, because of Google's per-use cost, attribution and no-caching terms, the missing iOS build, and the hand-tuned placement. Keep it as a spike next to the fallback below.

**What a real Google Photorealistic 3D Tiles run needs** (from public docs, nothing signed up for):
- **Key:** a Google Cloud project with billing and the **Map Tiles API** enabled, plus an API key.
  - Google recommends a proxy for mobile apps.
  - Android app restriction uses the `X-Android-Package` and `X-Android-Cert` headers. Google says this "may not be fully supported", and the plugin's HTTP client would have to add them (https://developers.google.com/maps/api-security-best-practices).
- **Root URL:** `https://tile.googleapis.com/v1/3dtiles/root.json?key=KEY`.
  - Child URLs carry `session=`. The key goes on every request, and a session lasts at least 3 hours.
  - cesium-native already passes the root's query on to child requests (https://developers.google.com/maps/documentation/tile/3d-tiles).
- **Attribution:**
  - The **Google Maps logo** must be shown unmodified (16 to 19 dp, with clear space around it).
  - **The copyright strings of all visible tiles** must be collected, split on ";", sorted by how often they occur and shown on screen.
  - The plugin has a credit system fed by cesium-native, untested on Android. The logo is ours to add (https://developers.google.com/maps/documentation/tile/policies).
- **Billing** (check before launch; Google's own pages disagree on what is billed):
  - **Price:** 1,000 free a month, then $6.00 per 1,000 up to 100k, falling to $2.40 per 1,000 above 5M.
  - **Limits:** 10,000 root requests per day and 12,000 requests per minute.
  - **Before launch:** set quota caps (https://developers.google.com/maps/billing-and-pricing/pricing, https://developers.google.com/maps/documentation/tile/usage-and-billing).
- **Terms:**
  - No pre-fetching, storing, bulk download or offline use of tiles, and nothing derived from them. Cache-Control and ETag must be honoured (https://cloud.google.com/maps-platform/terms, 3.2.3).
  - **Plugin change needed:** the plugin keeps a persistent SQLite tile cache at `user://cache`, which must be turned off for Google tiles.
  - **Not allowed:** generating "stylised" arenas from Google tiles is a derived product.
- **Alternative: Cesium ion asset 2275207** with an ion token.
  - **Plans:** the Community plan is non-commercial (1,000 Google sessions a month). Commercial is $149/mo for 5,000; Premium is $499/mo for 10,000 (https://cesium.com/platform/cesium-ion/pricing/).
  - **Terms:** Google's terms still apply (https://cesium.com/legal/terms-for-google/).

### Fallback for real places: stylised landmark arenas per location

**Recommended for G1 to G3.** Each fight point gets a small, light arena that *reads* as the place, built offline and cached like any Forge pack. It ships through the 056 drop-in contract with no app release.

1. **Footprints and heights:** OpenStreetMap (ODbL, attribution "© OpenStreetMap contributors", already shown on the map) for the ~150 m around the point. Building footprints with `height`/`building:levels`, roads, plazas, water, trees.
2. **Extrusion:** a server job (Python, the renderer box) extrudes the footprints into low-poly blocks with a facade texture atlas per city style. It lays the plaza floor from the OSM area, places the point's **Forge environment** (056 `placement`/`radius_m`: backdrop, prop, station) as the landmark hero piece, and puts the arena circle at the point.
3. **Output:** one GLB per point at three LODs, typically 0.5 to 2 MB, with a `pack.json` in contract 2 (`type: environment`, `placement: arena`). Godot loads it at runtime exactly like the characters.
4. **Landmarks that matter** (Trafalgar's column, Big Ben): a Forge-generated hero model (the 057 lift pipeline) placed from OSM coordinates.
5. **Cost:** no per-play fees, no keys, works offline, fits low-end phones, and avoids Google's restrictions on derived content.

## 4. Cost (measured)

**App memory, PSS** (`e2e/godot/measure.sh`, each scene from a fresh app process, median of 10 samples over 20 s after 15 s to settle):

| Scene | PSS MB | Native heap MB | Godot fps | frame p50 / p95 / p99 ms | draw calls |
|---|---|---|---|---|---|
| map, no Godot | 328 | 153 | - | - | - |
| fight, arena only | 422 (+94) | 192 | 17 | 50 / 67 / 67 | 56 |
| fight + 3 characters (2 Forge GLBs + Guardian capsule in this run) | 438 (+110) | 207 | 16 | 67 / 67 / 67 | 74 |
| full fight with FX | 438 (+110) | 207 | 16 | 67 / 67 / 68 | 74 |
| full fight + 3D Tiles (dragon) | 499 (+171) | 264 | 13 | 83 / 100 / 117 | 75 |
| full fight + photogrammetry tiles (Dingo Gap, during the fight, `mem-photogrammetry.tsv`) | 571 to 591 (+243 to 263) | 330 to 347 | 13 to 14 | 67 to 83 / ~120 / ~130 | 82 to 86 |

The emulator reports no "Graphics" PSS (software GL). On a phone, GPU memory shows up there instead. Godot's own `RENDER_VIDEO_MEM_USED` was 33 MB in the arena, 57 MB with characters and 98 to 102 MB on the photogrammetry tiles.

**APK size added:**

| Part | x86_64 raw | arm64 raw | arm64 compressed (gzip -9, ~ download) |
|---|---|---|---|
| `libgodot_android.so` (full engine: all modules, Vulkan + GLES3) | 71.5 MB | 77.1 MB | 24.9 MB |
| `librtngodot.so` (the RN bridge) | 1.5 MB | 1.7 MB | 0.45 MB (x86_64) |
| `assets/game3d` (the exported fight) | 0.07 MB | 0.07 MB | 0.07 MB |
| `libGodot3DTiles...so` (cesium-native + plugin) | 14.2 MB | 13.4 MB | 4.6 MB |

- **Whole APK:** the x86_64 test APK grew from 140.6 MB (056) to 214.3 MB with Godot, and to 228.5 MB with the tiles plugin. The arm64 (phone) APK with Godot and the tiles plugin is 221.3 MB. Native libraries are stored uncompressed, as AGP does by default for page-aligned loading. Store downloads compress them.
- **Smaller engine:** a custom LibGodot build with a Godot build profile (GLES3 only, no Vulkan, no navigation/Jolt/WebRTC/OpenXR/text_server_adv) should roughly halve the engine. That is G1 work.

## 5. iOS (not compiled here)

`scripts/verify-ios.sh --godot` (on a Mac with Xcode 26+, CocoaPods, and a Godot 4.5.1 editor in `GODOT_EDITOR`):
1. Installs the LibGodot iOS xcframeworks with sha256 checks (`GODOT_PLATFORMS=ios scripts/godot-prebuilt.sh`).
2. Exports `godot-export/ios/game3d.pck`.
3. Runs prebuild, so the `withGodot` plugin adds the pck to the bundle.
4. Checks `pod install` for the `borndotcom-react-native-godot` pod and a single worklets-core.
5. Builds a Release simulator app and checks that the pck is in the bundle.
6. Prints the by-hand list.

**Untested on iOS:**
- **Build:** the pod build itself (react-native-godot's podspec on RN 0.86 with the new architecture; the Android side needed 4 patches, iOS may need its own).
- **Startup:** `--main-pack <bundle>/game3d.pck` and the `RTNGodotView` embedding in the Expo app.
- **Renderer:** `opengl3`/`gl_compatibility` on iOS (Apple GLES, deprecated) vs Metal + `mobile`.
- **Threads:** Filament (Metal) and Godot in the same app, the GL/Metal context handover, and Godot's thread next to the JS thread.
- **Input:** multi-touch delivery (joystick + Attack together) through the embedded view.
- **Memory:** after 10 fights (the Xcode gauge).
- **3D Tiles:** none on iOS. The fight logs "tiles unavailable" and plays on the plain arena.
- **Exporter:** the official Godot 4.5.1 macOS editor exporting the pck, vs the fork's editor used on Linux.

## Licences of everything added

| Component | Licence | Notes |
|---|---|---|
| Godot Engine 4.5.1 / LibGodot (migeran fork) | MIT | Ships Godot's third-party notices (FreeType FTL, HarfBuzz MIT, ICU, mbedTLS Apache-2.0, Jolt MIT, libpng, zlib, etc.): include `COPYRIGHT.txt` in the app's licences screen |
| @borndotcom/react-native-godot 1.0.1 | MIT | patched (patch-package) |
| godot-cpp (fork for 4.5; 4.1.4 for the tiles plugin) | MIT | |
| react-native-worklets-core 1.6.3 | MIT | already in the app (056) |
| patch-package | MIT | dev dependency |
| 3D Tiles for Godot (Battle-Road) | Apache-2.0 | patched for Android HTTP |
| cesium-native 0.52.1 | Apache-2.0 | |
| cesium-native's vcpkg dependencies | Apache-2.0 (abseil, s2geometry, draco, KTX, ada), MIT (glm, spdlog, fmt, meshoptimizer, rapidjson, libmorton, earcut), BSD (libwebp, libjpeg-turbo, uriparser, zstd), zlib (zlib-ng, tinyxml2), Apache-2.0 (OpenSSL 3), zlib (blend2d, asmjit), BSD (modp-base64), public domain (sqlite3, stb, picosha2), MIT (async++, expected-lite, GSL, cpp-httplib) | from the vcpkg port list in `tools/tiles-android/env.sh`; check each `share/<port>/copyright` before shipping |
| litehtml (credits panel in the plugin) | BSD-3-Clause | |
| Sample data: CesiumGS 3d-tiles-samples | Apache-2.0 | test only, served locally, not shipped |
| Sample data: NASA-AMMOS 3DTilesSampleData (Dingo Gap) | Apache-2.0 (repo); NASA imagery | test only, not shipped |
| Forge characters (Armstrong, knight, Street Kid, guardians) | ours (Forge output) | |

No account, key or paid service was used.

## Risks

1. **Memory per fight:** ~0.3 MB native after the bridge fix, on the emulator. The library's worklet leak (~1.7 MB per `runOnGodotThread`) is still there for any new code that calls into Godot per frame or per event. The rule: one call per fight, push from Godot. Check on phones.
2. **One engine per process.** Destroy/re-create leaks, and crashes with GDExtensions. Keeping the engine costs its baseline (~90 MB PSS on the emulator) for the rest of the session after the first fight. Option: destroy only on memory pressure (`onTrimMemory`).
3. **Library maturity:** react-native-godot 1.0.1 has a small community and RN 0.81 as its target. We carry 4 patches for 0.86, and every RN upgrade may need more. Migeran sells support. LibGodot is a fork of Godot 4.5 and will lag upstream.
4. **APK size:** +25 MB compressed for the full engine. A trimmed engine build is needed to stay reasonable.
5. **Two 3D runtimes** (Filament for previews, Godot for fights) in one app: two GL contexts and more memory. Long term, use Godot for previews too, or keep Filament out of the fight path (it already is).
6. **Photoreal tiles:** plugin maturity (desktop-first, hand-tuned placement and orientation, a re-init crash, no iOS), Google costs and terms. It renders photogrammetry on Android, but treat it as a spike, not the plan.
7. **Fairness:** a client-side 3D fight cannot be judged by today's server (which replays 2D inputs). G3 needs a server-side simulation of the 3D fight rules, or signed input logs.
8. **Emulator vs phone:** every fps and latency number here is from a software GPU. A real-phone pass on low-end Android is the first G1 gate.

## G1 to G5 in Godot (sizes for one engineer; S < 3 days, M 1 to 2 weeks, L 3 to 5 weeks)

| Stage | Scope | Size | Exit gate |
|---|---|---|---|
| **G1 Phone-grade core** | Measure on 3 real phones: one low-end Adreno, one Mali, one iPhone via `verify-ios.sh --godot`. Re-check memory per fight on phones (0.3 MB on the emulator) and fix the library's worklet leak (patch or upstream). Trimmed LibGodot build (build profile; arm64 + x86_64 for CI). Release signing of the pck. Engine kept alive with destroy on `onTrimMemory`. iOS compile and fixes. | M (2 weeks) | 60 fps and under 50 ms input to motion on the mid phone; under 300 MB extra PSS; +15 MB compressed engine; 50 fights without growth |
| **G2 Combat systems** | Attack chain with real clips (add attack/hit/dodge clips to the 057 rig stage), the 4 locked skills, the Guardian AI from the server's guardian stats, hit reactions, an equipped Forge weapon in the hand socket (056 `sockets`), sounds, haptics. | L (4 weeks) | the duel design doc's numbers playable; designer sign-off on feel |
| **G3 Server truth and rewards** | The server simulates the 3D fight from an input log, or a deterministic, seeded sim in shared Rust/Python. Rewards paid by the server as in the 2D duel. Anti-cheat bounds. | L (3 to 4 weeks) | server verdict = client verdict on 1,000 recorded fights |
| **G4 Places** | The OSM + Forge environment arena generator (the fallback above), served as contract-2 environment packs per point, LODs by device class, loaded at runtime. | L (4 weeks) | 50 London and Lagos points with arenas under 2 MB each, loading in under 1 s on the mid phone |
| **G5 Players together** | The "2/3 players" made real: co-op against the Guardian over the existing realtime stack (LiveKit data channel or socket.io), state sync at 15 to 20 Hz, prediction for your own hero, and an ally that is a real player. | L (5 weeks) | 3 phones in one fight, under 150 ms visible lag, no desync over 45 s |

Photoreal 3D Tiles stay a separate spike (about 4 weeks, see section 3) that can run beside G4. Only adopt them if the spike lands, Google's terms allow the game use, and a phone can carry them.

## Reproduce

```
# tools (once): fork editor + x86_64 LibGodot (scripts in ~/cq-work/game-godot/scripts/)
scripts/libgodot-x86_64.sh && scripts/libgodot-repack.sh
# app build (emulator), Godot export included
cd app && LIBGODOT_ANDROID_PATH=~/cq-work/tools/libgodot/out/libgodot-android.zip \
  LIBGODOT_CPP_ANDROID_PATH=~/cq-work/tools/libgodot/out/godot-cpp-android.zip \
  GODOT_EXPORT=1 EXPO_PUBLIC_GAME3D=1 GAME_SERVER=http://localhost:8599 UNLOCK_ALL=1 scripts/android-emulator-build.sh
# tiles plugin (optional): app/game3d/tools/tiles-android/build.sh x86_64 ; serve-tiles.sh
# rig (056's local stack), emulator with ANGLE, then:
e2e/journey.sh godot/drive/g01-fight.sh g01-fight     # map point -> 3D fight -> reward
e2e/journey.sh godot/drive/g02-tiles.sh g02-tiles     # the fight next to the dragon tileset
app/game3d/tools/tiles-android/make-dingo-z.py && e2e/journey.sh godot/drive/g03-photogrammetry.sh g03-photogrammetry
e2e/godot/measure.sh m1                               # PSS + frame times per scene
e2e/godot/latency.sh 7 run                            # input-to-motion (a fight open)
adb shell am start -d "cosquest://fight3d?mode=chars&cycle=10&ms=8000&keep=1"   # leak test
```
