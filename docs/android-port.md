# CostQuest on Android: the port plan and where it stands

The iOS game (costquest-ios, ~37k lines of Swift, plus Unity 6000.0.84f1 for
the 3D fights) has to be playable on Android inside the merged app. This file
maps every part of it to one of four homes, says what is at parity today, and
what is degraded and why.

| Home | Used for | Lives in |
|---|---|---|
| **(a) Shared React Native** | all 2D UI and every game-logic client: map, HUD, sheets, challenges, rewards, onboarding, journal, codex, the Warden's lines, the duel sim | `app/features/game` (pure TS, Node-tested), `app/components/game` (screens) |
| **(b) Unity on both platforms** | 3D world, the 3D duel, AR (AR Foundation: ARKit on iOS, ARCore on Android) | `costquest-unity` export; Android embed in `app/modules/costquest-game/android/src/unity` behind `unityAndroid` |
| **(c) Small native Kotlin** | NFC, UWB, speech recognition, back-gesture exclusion, memory facts | `app/modules/costquest-game/android/src/main` |
| **(d) On-device model** | the Warden (mote engine, plain C) | `app/modules/costquest-warden` (NDK + JNI) |

The rule that made this tractable: **the server decides everything.** Every
point, card, XP number, daily, faction score and duel verdict comes from the
game backend, and the iOS client only draws it. So a TypeScript client that
signs requests the same way, and screens that draw the same payloads, give
Android the same game, not an imitation of it.

## 1. Inventory and mapping

### Net/ → one TypeScript client (a)
| iOS | Android / shared | Status |
|---|---|---|
| `Net/DeviceIdentity.swift` (Ed25519 device key in the Keychain, signed requests) | `features/game/identity.ts` (key in expo-secure-store, same signing payload) | **Parity.** Payload cross-checked against Python's hashlib in tests and against the live staging server (5/5 live checks). |
| `Net/GameClient.swift`, `Wire.swift`, `RoamWire.swift` | `features/game/client.ts`, `wire.ts` | **Parity** for every route the core loop uses: sso, roam config, quest points, me, faction, starter, open, answer, hint, retry, bag, faction war, leaders, codex, relics, profile, duel start/finish, ground, model manifest. Duel seeds are 62-bit: kept as exact text (`seed_text`), never through `JSON.parse`. |
| `Net/CQConfig.swift` | `features/game/config.ts` | **Parity.** `EXPO_PUBLIC_GAME_SERVER=staging` or an https URL; unset = production. |
| `Net/PackStore.swift`, `GLBMesh.swift` (venue packs, 3D meshes) | not ported | Degraded: only used by the AR venue layer and the mesh (below). |
| `Net/ForgeCatalogue.swift` | not ported | Degraded: the Forge weapon catalogue view (see Features). |

### Roam/ (the core loop) → shared RN (a)
| iOS | RN | Status |
|---|---|---|
| `RoamStore.swift` | `features/game/store.ts` (injected client/storage/clock; Node-tested on a mock server) | **Parity**: location → nearby points, reach and cooldowns, open → play → verdict, hints, retry, rewards, levels, coins, streak. |
| `RoamHomeView.swift` + `Map/WorldView*.swift` (RealityKit map from the server's ground geometry) | `components/game/WorldMap.tsx` (the same `/ground` geometry, merged into SVG paths, drawn in 2D with points, reach ring, player) | **Degraded (2D, not 3D).** Same streets, same buildings, same points; no tilted 3D camera, no time-of-day lighting. See §3. |
| `OnboardingView.swift` | `components/game/Onboarding.tsx` | Parity (faction choice, first point). |
| `RoamSheets.swift` (point sheet, dailies) | `PointSheet.tsx`, `Journal.tsx` | Parity. |
| `EncounterView.swift`, `ChallengeViews.swift` (trivia, rebus, sequence, blitz) | `Encounter.tsx` | Parity for all four kinds, hints (50/50, time), reveal, retry, the server's deadline, and **voice answers** (`SayItButton.tsx`, see Warden/ below). |
| `RewardView.swift` | `Reward.tsx` | Parity (XP, coins, faction points, level up, card, relic). |
| `PointDuelView.swift` | `DuelScreen.tsx` | Parity, see Features/duel. |
| `HallPage.swift` (faction war, leaders) | `Journal.tsx` "war" tab | Parity. |
| `ShrineStage.swift` (the shrine placed on the floor in AR, or on a rendered stage) | the encounter's "shrine is waking" opening, 2D | **Degraded:** no AR shrine. On Android that belongs to Unity + ARCore (b), which needs the licence. |
| `RoamGuide.swift`, `StrikeHaptics.swift` | `GameRoot.tsx` guide lines, `expo-haptics` | Parity. |

### Features/ (the feature registry)
| Feature | Home | Status on Android |
|---|---|---|
| **codex** | (a) `Journal.tsx` codex tab | **Parity** |
| **duel** (Guardian Duel) | (a) TS sim + 2D arena; (b) Unity 3D when exported | **Parity in rules and verdict**: `features/game/duel` is a byte-exact port of costquest-duel (84 golden fights from the C# engine: every checkpoint hash, event, wire log, replay and finish JSON identical). A real fight on staging was judged won by the server. **Degraded in looks**: 2D side-on arena instead of Unity's 3D one until the Unity export exists (`EXPO_PUBLIC_DUEL_RENDERER=unity` then switches it). |
| **run** (Quest Run: walk → point → challenge → reward) | (a) | **Parity** (it is the core loop above) |
| **spawns** (wandering challenges) | (a) | Partial: they arrive as normal points with source "wander" and play the same; the radar strip and expiry line are not drawn. |
| **holds** / **siege** | (a) | Partial: holds show on points and in the sheet; taking a rival hold is a duel against its Guardian, which plays. The siege-specific UI is not ported. |
| **raids** (co-op Boss Trivia / boss fights) | (a) | **Parity.** `RaidBanner` (nearest boss, shared HP), `RaidLine` in the point sheet, crowned markers, hidden below level 5. Both ways the server runs a raid: Boss Trivia (`RaidScreen`: lobby, the crew's 5 shared questions, shared boss HP, result) polling `/v1/roam/raids/state` once a second like iOS (the server polls on purpose; there is no websocket), and a boss fought as a Guardian Duel with mode `raid` (`raid_duel`, which staging runs: a fight was judged won there). |
| **live** (events calendar, Quest Hour / Landmark Day, stamp card) | (a) | **Parity.** `LiveBanner` counts down by the phone's clock and flips on the minute without a refetch, `LiveCalendarSheet` (now + 30 days), `LiveStampCard` in the journal from `/me.features.live`. The server pays the multiplier and stamps as reward lines. iOS's More → "Events" is the separate venue-games flow (`DiscoverView`, `v1/games`: paid entry, venue packs, AR), not ported. |
| **steps** (walking rewards: 5/25/50 km a week) | (a) + (c) `StepCounter.kt` | **Parity in rules, different sensor.** `StepsCard` in the journal from level 2, the same signed week-total report. Android has no pedometer history, so the hardware step counter (steps since boot) is read whenever the game comes forward and a TS ledger keeps the week's tally across reboots, at 0.7 m a step (errs low; iOS uses Apple's distance). Needs ACTIVITY_RECOGNITION. Sealed shrines: not implemented on the server or iOS either. |
| **relics** (faction weapons: collect, power up, equip) | (a) | **Parity.** `RelicsSheet` (all relics by faction, owned/unfound, rarity, level, power, shards), equip and level up as the server allows, the starter relic, `RelicsButton` on the rail from level 2, `RelicDropCard` in the reward. |
| **Forge weapons** | (a) | **Parity except 3D.** The Forge catalogue with damage, range and cooldown; view-only on both platforms (only admins and creators change them). The turning 3D GLB preview is not ported: the server's thumbnail when it has one, else a 2D drawing. |
| **coins** (bought on the web through Stripe) | (a) | Balance shows and is spent on hints; buying stays on the web (same as iOS). |
| **social** (friends, gifts) | (a) | **Parity except hold-phones.** Friends list, levels, one gift per friend a day, opening gifts, and adding a friend by a 6-character code (the server accepts it within 10 minutes and 100 m of where it was made). iOS has the same code path, so iPhone and Android players can add each other. Holding two phones together needs Apple's peer link (Bonjour/AWDL) and UWB, so it is not ported. |
| **rooms** (the arena battle anywhere) | (a) | **Playable in 2D.** Start a Room, share its code, beacons on the map, join, lobby, the fight and the results. A Room fight is server-judged events (pickups, hits within 12 m, shrines, trivia chests, respawns) with a live link; iOS draws the arena in AR, Android top-down, aiming with the compass and ranging by GPS (iOS does the same without UWB). Checked on staging with two players, including a hit. Not ported: the AR arena, UWB precision, the outbox surviving an app kill. |

### AR/, Map/, Unity/ → Unity on both (b)
| iOS | Android | Status |
|---|---|---|
| `Unity/UnityBridge.swift`, `UnityDuelHost`, `UnityHallHost`, `UnityWorldView`, `WorldState` | `android/src/unity/.../UnityBridge.kt` (same messages: start duel, demo duel, quit, send, pause; events back through `CQUnityEvents`), `CostQuestUnityView`, the C# `CQAndroidBridge` template | **Built and compile-checked, not run.** Behind `unityAndroid` (app.json) / `COSTQUEST_UNITY_ANDROID=1`. Compiled against Unity 6000.0.84f1's real `classes.jar` and its manifest merged; needs an export, which needs a Unity licence. |
| `AR/ARGameView.swift`, `ARSessionController.swift`, `VenueLayout`, `VenueMarker*` (ARKit world tracking) | AR Foundation scene in Unity (ARCore on Android) | **Not started.** The Unity project has no AR Foundation scene yet; iOS's AR is RealityKit, not Unity. This is new Unity work for both platforms. |
| `Map/DiscoverView`, `FieldMapView`, `VenueMap` | — | Not ported (venue/field maps). |

### Warden/ → (a) + (d)
| iOS | Android | Status |
|---|---|---|
| `WardenLines.swift`, `WardenMoments.swift` (scripted lines per moment) | `features/game/warden.ts` | **Parity** (same moments, same seeded choice). |
| `WardenCheck.swift` (guard on model output) | `features/game/wardenCheck.ts` | Parity (ported with tests). Since 2026-10-14 both refuse assistant/refusal lines ("I'm … an assistant", "I can't help with that"), so the 0.5B variant's off-voice lines fall back to the authored ones (patch 0006; none of the 1,500 Warden training lines or the authored lines trips it). |
| `Game/MoteEngine.swift`, `ModelStore.swift` (mote, ~968 MB model download) | `modules/costquest-warden` (mote's own C sources built with the NDK, JNI bridge), `features/game/wardenModel.ts` (download, sha256 while streaming, RAM-based variant choice) | **Built, not yet run on a phone.** C compiles clean for arm64-v8a and x86_64 (64-bit only: the NEON path is AArch64), and `libcostquest_warden.so` ships in the APK. The same C, driven the way `warden_jni.c` drives it, ran both staging models on a Linux host (2026-10-13). The 1.7B Warden (`qwen3-warden.mq`, phones with 6 GB+) speaks in voice: "That duel was tough, Ada, but you never gave up! Caffè Nero will remember this one." The 0.5B variant (`aimm05b_q4_v21.mq`, smaller phones) answers like a generic assistant ("I'm ada, an assistant built for…"); WardenCheck now refuses those lines on both platforms, so those phones hear the authored lines. Fallback: the authored lines, which is also what iOS says when the model is off or slow (2.5 s cap). |
| `WardenSpeaker.swift` (TTS) | `expo-speech` | Parity. |
| `VoiceAnswer.swift` (speech recognition) | Kotlin `SpeechListener` + `features/game/voiceAnswer.ts` + `components/game/SayItButton.tsx` | **Parity.** Same matcher (ordinals, letters, colours, words, run-together words; strict on partials, lenient on the final result), same 6 s silence timeout, same "on the phone or not at all" rule (`onDeviceOnly`: no on-device recogniser means voice is off, and tapping still works), the chat call keeps the microphone. Choices bias the recogniser on Android 13+. A matcher bug fixed on both platforms (patch 0005). `scripts/swift-linux-check.sh` runs the Swift matcher and WardenCheck against the TS test vectors. |
| `RecapSheet`, `WardenCoach` | — | Not ported. |

### Mesh/, NFC (c)
| iOS | Android | Status |
|---|---|---|
| `Mesh/PeerMesh.swift` (Network framework local mesh), `MeshCoordinator` | (Nearby Connections would be the Android match) | **Not ported.** Everything the mesh feeds degrades as iOS designed: packs come from the server, range from GPS. iOS and Android phones could not share one mesh anyway (Bonjour/AWDL vs Nearby). |
| `Mesh/UWBRanging.swift` (Nearby Interaction) | `androidx.core.uwb` | **Stub.** `uwbAvailable` is real; `startUwbRanging` is a documented stub. UWB needs the mesh to exchange session tokens first, and iPhone↔Android UWB needs FiRa config both sides agree on. |
| `Game/Checkpoints.swift` (Core NFC tags) | `NfcReader.kt` (reader mode) | Native side done, behind `nfc` in app.json (off). |

## 2. The shell on Android
Same pager as iOS (`components/world/WorldPager.tsx`, rules in
`features/world`). Android specifics:
- **System Back** (3-button Back, and the edge back gesture) on the game page
  returns to the chat, through `BackHandler`. The game's own layers close
  first, one per Back: journal, then encounter/duel/reward, then the point
  sheet, then the game itself.
- **Predictive back.** React Native 0.86's `ReactActivity` takes Back through
  an always-enabled `OnBackPressedCallback`, so `BackHandler` keeps working
  when predictive back is on. The chat app ships with
  `predictiveBackGestureEnabled: false` (the dev team's setting, left as is),
  so Android shows no back-to-home preview animation either way; turning it
  on later changes nothing in the game's Back order.
- **Gesture zones.** Android's back gesture starts from the left and right
  screen edges, which is exactly where the world swipe's 22 pt doorway strips
  are. `GestureExclusion.kt` excludes one rect per page from the system
  gesture with `View.setSystemGestureExclusionRects`
  (`androidGestureExclusion()` in `features/world/gesture.ts`, unit-tested):
  - chat page: the right edge, 32 dp wide, centred on the world handle;
  - game page: the left edge, 60 dp wide, centred on the chat bubble.
  Android honours at most **200 dp per edge**, so each rect is at most 200 dp
  tall, and the rest of both edges stays the system's: an edge swipe anywhere
  else is Back as usual. Exclusion is dropped while typing or in a full-screen
  call, the same times the world swipe itself is off.
- **Edge-to-edge.** The app is edge-to-edge (Expo 57 default); every game
  screen pads with `useSafeAreaInsets()`, the HUD sits under the status bar
  inset and the bottom tray above the navigation bar inset.

## 3. Home map on Android: 2D from the game's ground, not react-native-maps, not Unity
- **Not react-native-maps:** there is no Google Maps API key in the project,
  and without one Android draws a blank grid. A key is a billing account
  decision for Subomi, and Google's map would not look like the game's world
  anyway.
- **Not the Unity world (yet):** needs the Unity export (licence), costs
  ~300–500 MB more RAM on the warm page, and the swipe must be instant. The
  iOS home map is not Unity either; it is RealityKit drawing the server's
  `/ground` geometry.
- **So:** the RN map draws the same `/ground` geometry the iOS map draws
  (roads, buildings, water, parks, in metres on a local plane), merged into a
  handful of SVG paths, which is cheap to keep warm. It is the same place
  with the same points, flat instead of tilted.

## 4. One codebase path (`gameUi`)
`features/game/config.ts` resolves `gameUi: 'native' | 'rn'`:
Android is always `rn`; iOS stays `native` (the SwiftUI game) until the RN
game is checked on a Mac, then `EXPO_PUBLIC_GAME_UI=rn` switches it. Both
implement the same `CostQuestGame` API (`modules/costquest-game/src`), so the
shell does not know which one it hosts.

## 5. Checked on an emulator (2026-10-13)
Android 15 x86_64 emulator, the staging game server, and a throwaway local
chat backend (`cosquest-backend/scripts/devLocal.js`). Build with
`app/scripts/android-emulator-build.sh`. Checked:
- sign-in, the swipe both ways, Back and edge-back to the chat;
- the bubble with its unread count, and tapping it to return;
- invite card → Join → that point's sheet;
- walking to points with emulator GPS;
- a Guardian Duel played to its reward;
- the journal tabs, sharing to chat, and the Warden's line on arrival.

Warm swipe-to-interactive was 0.6–0.8 s on a software-rendered emulator
(median frame 250 ms), so phone numbers are still to be measured.

### Checked on the emulator again (2026-10-14, task 3)
The same setup, with `UNLOCK_ALL=1` so a level 2 player sees every feature.
Each of these was driven against staging:
- the Quest Hour banner and the events calendar;
- the More sheet;
- Friends: a friend added by a code that a second (Node) player made at the
  same spot, and a gift sent;
- the Relics collection and the Forge weapon card;
- the journal's stamp card and walking card (the emulator has no step sensor,
  and the card says so);
- a Room: started, entered, a shrine taken, walked by GPS to a weapon and
  picked it up, a chest question answered correctly, and the results;
- a raid boss: banner, sheet, walked into reach, briefing with the shared HP,
  the fight, and the server's verdict ("You dealt 40 damage. Boss HP 5960 / 6000").

Not reachable there: the voice button. Staging serves only duels, so no quiz
card appears.

## 6. What is at parity, in one line
Sign in once, map with nearby points, walk to a point, play its challenge
(all quiz kinds, answered by voice too, and the Guardian Duel, judged by the
server), XP/levels/coins, codex, dailies and streak, faction and the faction
war, the Warden's lines and voice, boss raids, Quest Hours and the stamp
card, walking rewards, relics and the Forge catalogue, friends and gifts (add
by code), Rooms (in 2D): **at parity or playable**. Features open by level as
on iOS (`features/game/unlocks.ts`); the rest sits in a More sheet as on iOS.
3D (world, duel looks, AR shrine, Room arena in AR, Forge 3D previews),
hold-phones friend adds, venue events (`DiscoverView`), mesh/UWB: **degraded
or not ported**, for the reasons above.
