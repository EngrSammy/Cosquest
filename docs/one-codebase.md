# One codebase for the game screens (branch `one-codebase`)

The game's screens are the shared React Native ones on **both** platforms.
iOS used to run the SwiftUI game (costquest-ios, copied into
`app/modules/costquest-game/ios/Game/`) and Android the RN port; since this
branch iOS runs the RN game by default too. The SwiftUI game is still built
and kept as a whole-game fallback, and the few things only the platform can
do are thin native "islands" the RN screens embed, with the same module
names on Android where Android has the thing.

Screenshots of the moved screens (Android emulator, staging game server):
`docs/one-codebase-shots/`. What the Mac has to compile and check: the last
section, and `scripts/verify-ios.sh`.

## The flags

| Flag | Values | Default | What it does |
|---|---|---|---|
| `EXPO_PUBLIC_GAME_UI` | `rn` / `native` | `rn` on both platforms | `native` brings back the SwiftUI game on iOS (whole game, `CostQuestGameView`), the fallback. Android has only `rn`. `features/game/config.ts resolveGameUi` |
| `EXPO_PUBLIC_GAME_2D` | comma list of islands, or `all` | none | Turns a native island off so the RN screen draws its 2D fallback: `forgeModel`, `unityDuel`, `unityBattle`, `venueEvents`, `arShrine`, `arSummon` ("See it here"), `arReveal` (the AR Guardian reveal before a fight: straight to the fight). For a phone where an island misbehaves. `config.ts resolveIslandsOff` |
| `EXPO_PUBLIC_DUEL_RENDERER` | `rn` / `unity` | `rn` | `unity` draws Guardian Duels with the Unity scene where the build has it (device build with UnityFramework, or an Android unityAndroid build). Same simulation either way. |

Why the fallback is whole-game rather than per screen: the SwiftUI game is
one app (`AppRoot`, one `RoamStore`, one navigation stack); its screens
cannot be shown one at a time inside the RN game without running two game
states side by side. Per-part fallbacks exist where the part is an island.

## Parity, screen by screen

Status: **parity** = same look, behaviour, animation, haptics and
accessibility as the Swift screen (differences listed are deliberate);
**island** = the Swift view itself, embedded; **partial** = works, with the
differences listed; **native** = stays Swift (next section).

Paths: Swift under `app/modules/costquest-game/ios/Game/`, RN under
`app/components/game/` and `app/features/game/`.

### The home and its sheets

| Swift | RN | Status | Notes |
|---|---|---|---|
| `Roam/RoamHomeView.swift`: top bar, PlayerChip, ResourceChip, WardenBadge | `Hud.tsx`, `AvatarView.tsx`, `WardenBadge.tsx` | parity | XP ring, level badge, coin chip opening CosCoins, streak chip, the Warden's face (blink, bob). |
| RoamHomeView rail | `Hud.tsx` Rail | parity | Dailies, Relics, Trials or Codex, More; hidden while a card is open or a pocket run is on. RN also keeps the mute and recentre buttons (no system map controls on Android). |
| RoamHomeView Nearby tray, NearbyCard, CardPress | `Hud.tsx` | parity | 172-wide cards, NEXT tab (`guide.ts bestNext`), HERE / bearing, "NEARBY · n in reach" plate, press scale 0.95 + light haptic on press-down. |
| `Features/SpawnsFeature.swift` NearbyRadar, SpawnLine | `NearbyRadar.tsx`, `PointLines.tsx` | parity | |
| RoamHomeView PointCard | `PointSheet.tsx`, `PointLines.tsx` | parity | Legend, Spawn/Hold/Siege/Raid lines, Spin + Play/Fight/Siege/Fight the boss with Swift's disabled labels. |
| RoamHomeView spin, holds-lost banner | `GameRoot.tsx`, `Banner.tsx` | parity | |
| `Features/HoldsFeature.swift` | `PointLines.tsx`, `features/game/siege.ts` | parity | Pin tint raid > holder > tier. |
| `Warden/WardenCoach.swift`, `Roam/RoamGuide.swift` | `Coach.tsx`, `features/game/coach.ts`, `guide.ts` | parity | Spotlight, unlock intros, first nudge 25 s. |
| `Roam/HallPage.swift` MoreSheet | `MoreSheet.tsx` | parity | All nine tiles incl. Bag (count only), Your day, Events (iOS), Ask the Warden, Profile; next sheet after 380 ms. |
| `Roam/RoamSheets.swift` Dailies, War | `Journal.tsx`, `journal.ts` | parity | |
| `Features/CodexFeature.swift` | `Journal.tsx` (Codex), `CodexDetail.tsx` | parity | Foil rim paused under Reduce Motion. |
| `Map/WorldView.swift`, `WorldScene`, `WorldBuilder`, `WorldView+Roam`, `GroundGeometry` | `WorldMap.tsx`, `mapPaths.ts`, `mapStyle.ts` | **partial** | Same ground (`GET /v1/map/ground`), same Roam board colours by the hour (day, dusk, night, from `TimeOfDay.swift` and the board palettes), buildings drawn standing off the board. Not a tilted RealityKit 3D board: the RN map is a flat 2D board. Deliberate: the map is the one screen every other part sits on; a native 3D island under it would make the home two codebases again. |
| `Map/TimeOfDay.swift` + Preferences "Time in town" | `mapStyle.ts`, Profile > Settings | parity | The Swift preference was never wired to the board (only a debug default was); the RN one is. |

### Points, fights and rewards

| Swift | RN | Status | Notes |
|---|---|---|---|
| `Roam/EncounterView.swift` | `Encounter.tsx` | parity | Approach ("Tap the shrine", the challenge's blurb), opening, the Strike, reveal, leave confirmation while the clock runs, Warden bubble, status bar hidden. |
| `Roam/ShrineStage.swift` | iOS: **island** `CostQuestShrineView` (`ios/Embed/ShrineIsland.swift`); elsewhere `ShrineCrystal.tsx` | island | The native RealityKit stage, or ARKit through the camera when AR is on (header switch, camera asked first, as Swift), photo + share after an AR reveal. Android: the 2D crystal with the same beats. |
| `Roam/StrikeHaptics.swift` | `strike.ts`, `components/game/strike.ts` | **partial** | expo-haptics has no Core Haptics transients with intensity/sharpness: the three pulses are light/medium/heavy impacts and the verdict a success/error notification. |
| `Roam/ChallengeViews.swift` | `Encounter.tsx` cards, `SayItButton.tsx` | parity | Trivia, rebus, sequence, blitz, hint bar with bag items, second chance, voice answers (SFSpeechRecognizer on iOS, SpeechRecognizer on Android). |
| `Roam/RewardView.swift` + LevelUp | `Reward.tsx`, `LevelUp.tsx`, `rewardCeremony.ts` | parity | |
| `Roam/PointDuelView.swift` | `DuelScreen.tsx` Briefing | parity | |
| `Features/DuelFeature.swift` DuelView, VersusCard, DuelResult, DuelSFX, Trials, stance | `DuelScreen.tsx`, `DuelVersus.tsx`, `DuelResult.tsx`, `TrialsSheet.tsx`, `StancePicker.tsx`, `duelFlow.ts` | parity | The fight: 2D arena (TS port of costquest-duel) by default; Unity island where built. |
| `Features/BattleWire.swift`, `Unity/UnityBattleHost.swift` (fantasy battle) | `duelFlow.ts` battle helpers, `DuelScreen.tsx` | parity (Unity builds) | Point fights ask for the battle (`battle: true`) only where the export has the Battle scene (`hasBattleScene`, iOS). Android never asks. |
| `Features/BattlePauseView.swift` | `BattlePause.tsx` | parity | |
| `Features/SiegeFeature.swift` | `SiegeScreen.tsx`, `SiegeParts.tsx`, `siege.ts`, `siegeFlow.ts` | parity | Quiz siege and duel siege by `siege_mode`. |
| `Features/RaidsFeature.swift` | `RaidBanner.tsx`, `RaidScreen.tsx`, `RaidParts.tsx`, `RaidDuel.tsx`, `RaidLine.tsx` | parity | |
| `Features/RunFeature.swift` | `Run.tsx`, `runModel.ts`, `run.ts` | parity | |

### Player, social and money

| Swift | RN | Status | Notes |
|---|---|---|---|
| `Roam/OnboardingView.swift` | `Onboarding.tsx`, `onboarding.ts` | parity | |
| `UI/ProfileView.swift`, `UI/HeroStage.swift` | `ProfileSheet.tsx`, `HeroStage.tsx` | parity | "Appearance" (Automatic/Light/Dark) left out: it set SwiftUI's colour scheme, which the game's palette never read; the app's light/dark is the chat app's. |
| `UI/Preferences.swift` | `prefs.ts`, `wardenVoice.ts` | parity | Haptics, Time in town, shrine AR, the Warden speaks. Payout destination belongs to venue Events (native). |
| `Features/FriendsFeature.swift` FriendsSheet | `FriendsSheet.tsx`, `friends.ts`, `QrCode.tsx`, `qr.ts` | parity | Code + QR (the QR encoder's format bits were drawn transposed until 2026-10-20; fixed and checked against segno and OpenCV). |
| FriendsFeature "hold phones together" | iOS: `HoldPhonesCard.tsx`, `friendsNearby.ts` + **island** `ios/Embed/FriendBeaconIsland.swift` | island (transport) | The card and the claims (`POST /v1/roam/social/nearby`) are TS; the Bonjour/AWDL TLS-PSK link and Nearby Interaction ranging are the Swift FriendBeacon/FriendRanger, unchanged. Not on Android (cannot reach an iPhone that way); the code works across both. |
| `Features/CoinsFeature.swift` | `CoinsSheet.tsx`, `coinsModel.ts`, `coins.ts` | parity | Checkout opens in `expo-web-browser` (SFSafariViewController on iOS, Custom Tabs on Android), as Swift's CheckoutSafari. |
| `Features/RelicsFeature.swift` | `RelicsSheet.tsx`, `RelicArt.tsx`, `RelicDropCard.tsx`, `relics.ts` | parity | |
| `Features/ForgeFeature.swift`, `Net/ForgeCatalogue.swift` | `ForgeArmoury.tsx`, `forge.ts`, `forgeDevice.ts` + iOS **island** `CostQuestModelView` | island | TS downloads and checks the lod0 file; iOS turns it in RealityKit (ForgeModelView + GLBMesh); Android shows the 2D art. |
| `Features/StepsFeature.swift` | `StepsCard.tsx`, `steps.ts`, `stepsDevice.ts` | parity | CMPedometer (iOS) / step counter (Android) behind the module. |
| `Features/LiveFeature.swift` | `LiveBanner.tsx`, `LiveCalendarSheet.tsx`, `LiveStampCard.tsx`, `live.ts` | parity | |
| `Features/RoomsFeature.swift` (sheet, beacons) | `RoomSheet.tsx`, `RoomBeacon.tsx`, `RoomButton.tsx`, `rooms.ts` | parity | |
| Rooms play (`UI/EntryView` → `TravelView` → `PlayView` AR + `Map/FieldMapView`) | `RoomScreen.tsx`, `RoomLobby.tsx`, `RoomFight.tsx` (2D field), `roomsSession.ts` | **partial** | The RN Room fight is a 2D field map with compass heading, not the AR camera; haptics as the AR field (hit taken heavy, pickup medium). The full AR version is the venue Events flow (native, below). |

### The Warden

| Swift | RN | Status | Notes |
|---|---|---|---|
| `Game/Warden.swift`, `Warden/WardenLines`, `WardenMoments`, `WardenVoice` | `warden.ts`, `wardenVoice.ts` | parity | RN reads lines aloud (expo-speech) unless muted; the Swift WardenSpeaker shipped switched off. Speech now uses the game's audio session (plays with the silent switch on) and keeps quiet during a call. |
| `Warden/WardenCheck.swift` | `wardenCheck.ts` | parity | Patch 0006, both platforms; Swift copy checked against the TS vectors. |
| `Warden/VoiceAnswer.swift` | `voiceAnswer.ts` + `GameHelpers.swift` SpeechHelper | parity | Patch 0005 matcher fix, both platforms. |
| `Warden/WardenViews.swift` | `WardenBadge.tsx`, `Coach.tsx` | parity | |
| `UI/WardenView.swift` (Ask the Warden) | `AskWarden.tsx`, `askWarden.ts` | parity | On-device model on iOS through `CostQuestWardenModule.swift`. |
| `Warden/RecapSheet.swift` (Your day) | `RecapSheet.tsx`, `recap.ts` | **partial** | Shares the day as text; Swift rendered the card to an image (ImageRenderer) and shared that. Needs a view-capture dependency to match; not added on a branch other tasks share. |
| `Game/MoteEngine.swift`, `Game/Engine/*.c`, `Game/ModelStore.swift` | `wardenModel.ts` + `CostQuestWardenModule.swift` | native (engine) | Download, verify and choose in TS; generation in the C engine. |

### Left out on purpose

| Swift | Why |
|---|---|
| `UI/SplashView.swift` | The merged app has one launch screen (the chat app's). |
| `Roam/RoamDev.swift`, `Dev/*` (GameSelfTest, MeshSelfTest, PackHarnessView, WardenSelfTest) | Developer harnesses of the SwiftUI game; still in the native fallback. |
| `Roam/RoamHomeView.swift` UnlockCard, `HallPage` HomePageSwitcher/HallActions, `Unity/UnityHallHost.swift` | Not reachable in the Swift game either (replaced by the coach). |

## What stays native, exactly, and why

With `gameUi: 'rn'` (the default) this Swift runs on iOS. Everything else
under `ios/Game/` runs only in the `EXPO_PUBLIC_GAME_UI=native` fallback.

| Swift | Why native | JS interface (Android counterpart) |
|---|---|---|
| `Embed/CostQuestGameModule.swift` | The Expo module: constants, functions and events below. | `modules/costquest-game/src/index.ts` (`CostQuestGameModule.kt`) |
| `Embed/GameHelpers.swift` | Speech recognition (Speech), walking distance (CoreMotion), NFC (CoreNFC), UWB stub (NearbyInteraction), the SwiftUI game's Keychain key for migration. | `startListening/stopListening/cancelListening` + `onSpeechResult/onSpeechError` (SpeechListener.kt); `queryPedometer` (Android: `readStepCounter`); `startNfcScan/stopNfcScan` + `onNfcTag/onNfcEnd` (NfcReader.kt); `startUwbRanging` → `ERR_UWB_NO_MESH` on both; `readLegacyDeviceKey` (iOS only) |
| `Embed/CostQuestWardenModule.swift` + `Game/MoteEngine.swift` + `Game/Engine/*.c` | The on-device language model (C engine). | `CostQuestWarden` load/generate/stop/unload/sha256File (costquest-warden JNI) |
| `Embed/NativeIslands.swift` UnityIsland + `CostQuestUnityView`, `Game/Unity/UnityBridge.swift` | Unity as a library (embedded runtime). | `unityStartDuel/unityStartBattle/unityDemoDuel/unityQuit/unitySend/unityPause`, `onUnityEvent`, view `CostQuestUnityView` (UnityHost.kt, CQUnityEvents.kt, CostQuestUnityView.kt) |
| `Embed/NativeIslands.swift` `CostQuestModelView` + `Features/ForgeFeature.swift` ForgeModelView + `Net/GLBMesh.swift` | RealityKit model rendering. | view `CostQuestModelView {uri, tint}` (Android: none, 2D art) |
| `Embed/ShrineIsland.swift` + `Roam/ShrineStage.swift` (+ GameKit's GameBackdrop) | RealityKit stage and ARKit world tracking. | view `CostQuestShrineView {tint, wardenTint, useAR}`, `onPlaced`, view functions `pulse/resolve/reset/photo` (Android: none, 2D crystal) |
| `Embed/FriendBeaconIsland.swift` + `Features/FriendsFeature.swift` FriendBeacon, FriendRanger | Bonjour/AWDL peer link with TLS-PSK (Network) and Nearby Interaction. | `startFriendBeacon(key, handle)/stopFriendBeacon`, `onFriendBeacon` (Android: none) |
| `Embed/VenueEventsIsland.swift` + the venue Events chain: `Map/DiscoverView`, `UI/EntryView`, `TravelView`, `PlayView`, `ResultsView`, `RulesView`, `LobbyView`, `RosterView`, `GameHUD`, `TargetReticle`, `Map/FieldMapView`, `VenueMap`, `AR/*`, `Mesh/*` (PeerMesh, MeshCoordinator, UWBRanging), `Game/GameSession`, `LiveLink`, `EventOutbox`, `Checkpoints`, `Presence`, `Targeting`, `Net/PackStore`, `Net/GameClient`, `Unity/UnityWorldView`, `WorldState`, `TownSpots` | The paid venue games are ARKit + RealityKit + the peer mesh + UWB end to end; Android has no ARCore port. Presented full screen over the RN game. | `openVenueEvents({gameId?, side?, handle?})/closeVenueEvents`, `onVenueEventsClosed` (Android: no Events tile) |
| `Embed/GameHost.swift` (GameEventSink), `GameResources.swift`, `CQProcessMemory.h`, `CostQuestGameBridge.h` | Event plumbing, the game's fonts for the native views, memory probe, C headers. | |
| `Embed/AccountKey.swift`, `GameSSO.swift`, `GameEmbedRoot.swift`, `CostQuestGameView.swift`, `GameChromeWindow.swift` | The SwiftUI game's host: only in the native fallback. | |

Swift patches 0005 (voice matcher) and 0006 (WardenCheck off-voice lines)
are applied to the copied sources (`ios/patches/`), compile under Swift 6
and pass the TS test vectors (`app/scripts/swift-linux-check.sh`, run on
Linux with Swift 6.1.2 on 2026-10-20, and by `verify-ios.sh` on the Mac).
They are not upstreamed to ubmids/costquest-ios (not in this task's push
list); with the RN game the default they only matter for the fallback.

## What the Mac must verify

Nothing on this branch's iOS side has been compiled by Xcode. What Linux
could check (Swift 6.1.2, 2026-10-20): all 120 Swift files pass a Swift 6
syntax parse; the pure Swift (matcher, WardenCheck) compiles and runs
against the TS vectors (`app/scripts/swift-linux-check.sh`); and the whole
native layer the RN game uses (`ios/Embed`: the module definition, the
helpers, the Unity, model, shrine and friend islands, the Warden engine
holder; not VenueEventsIsland, which needs the whole native game) type-checks
under Swift 6 with strict concurrency against stand-ins that copy the real
SDK and expo-modules-core signatures (`app/scripts/swift-stub-check.sh`;
planted isolation errors are caught). That removes most of the
concurrency risk, not the linking against the real SDKs. Everything below
needs a Mac with Xcode 26+.

1. `scripts/verify-ios.sh` (needs `gh` signed in for the Unity framework),
   then `scripts/verify-ios.sh --no-unity --sim-only --run`. Both must pass.
   It runs the JS tests and typecheck, the plugin tests, the Swift matcher
   check, prebuild, the Info.plist keys the islands need, pod install, a
   simulator build (no Unity) and a generic device build (Unity embedded).
2. **Compile errors to expect, if any, are in the Swift written on this
   branch and never built by Xcode** (strict concurrency `complete`, Swift 6):
   `Embed/CostQuestGameModule.swift`, `GameHelpers.swift`,
   `NativeIslands.swift`, `VenueEventsIsland.swift`,
   `CostQuestWardenModule.swift`, `FriendBeaconIsland.swift`,
   `ShrineIsland.swift`, the 4 lines in `GameHost.swift`. Fix them in place;
   the JS interface is fixed by `src/index.ts`.
3. `scripts/verify-ios.sh --native-game --sim-only --run`: the fallback
   still builds and opens the SwiftUI game.
4. On a phone (device build, ideally with Unity), by hand:
   - First launch as an existing SwiftUI-game player who never signed in:
     the same player comes back (legacy Keychain key adopted).
   - Home: map colours by the hour; Profile > Settings > Time in town.
   - A quiz point: the shrine on its RealityKit stage, "Tap the shrine",
     the Strike's three pulses, the break; switch to AR in the header: the
     camera prompt, the shrine on the floor, a reveal, Photo, Share.
   - Voice answers (mic button) work on device and refuse during a call.
   - Walking card: the Motion & Fitness prompt, then distance this week.
   - Ask the Warden with the on-device model downloaded (iPhone 13 or
     newer); check the model folder is excluded from iCloud backup.
   - The Warden's spoken lines play with the silent switch on and stay
     quiet during a CosQuest call.
   - Forge Armoury: a weapon with a model turns in 3D, drag turns it.
   - With `EXPO_PUBLIC_DUEL_RENDERER=unity`: a duel in Unity, the pause
     page on background, Leave counts as a loss; on staging with
     `point_battle` on, a point fight comes as the fantasy battle.
   - Friends on two iPhones: the Local Network prompt, each sees the other,
     the distance in cm, the add fires on its own at 0.5 m, "You and X are
     friends". Refuse Local Network on one: the Open Settings line.
   - More > Events: the native Events flow full screen, and back.
   - Sheets drag closed and close on the scrim; no status bar over a
     challenge, a duel briefing, a fight or a siege.
   - VoiceOver over the home, a point card, a challenge, a fight and two
     sheets; Dynamic Type at the largest size on the same screens.
   - CosCoins: a test pack through Stripe's test mode on staging returns to
     the RN game's coins sheet (`cosquest://coins?...`).
5. Compare the simulator screenshots `verify-ios.sh --run` leaves in
   `app/build-logs/screens/` with `docs/one-codebase-shots/`.
