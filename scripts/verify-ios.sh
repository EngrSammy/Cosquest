#!/usr/bin/env bash
#
# The merged app's iOS check, end to end, on a Mac. Everything the Linux
# side could not do: fetch the pinned UnityFramework, install, prebuild,
# pod install, and compile the app for the simulator (no Unity) and for a
# generic device (with Unity, unsigned).
#
#   scripts/verify-ios.sh                 the whole check
#   scripts/verify-ios.sh --no-unity      skip the framework: both builds are
#                                         the no-Unity one (NO_UNITY)
#   scripts/verify-ios.sh --sim-only      only the simulator build
#   scripts/verify-ios.sh --run           also install and launch a Release
#                                         simulator build (JS bundled in), open
#                                         the game page and take screenshots
#   scripts/verify-ios.sh --native-game   the bundled JS shows the SwiftUI game
#                                         (EXPO_PUBLIC_GAME_UI=native), the
#                                         fallback. Default: the shared React
#                                         Native game, as on Android
#                                         (docs/one-codebase.md)
#   scripts/verify-ios.sh --staging       the bundled JS talks to the STAGING
#                                         game server (default: production,
#                                         read-only use only)
#   (--rn-game is still accepted: it is the default now, and implies --staging
#   as it always did.)
#   scripts/verify-ios.sh --forge         with --run: Forge in the world (task
#                                         056): the by-hand list for the 3D
#                                         runtime (react-native-filament) against
#                                         a game server with forge_world on
#   scripts/verify-ios.sh --polish        with --run: also the fit checks of
#                                         docs/polish (task 058) on three
#                                         simulators: iPhone SE (home button,
#                                         375x667), a Dynamic Island iPhone,
#                                         and that one at the largest
#                                         accessibility text size
#   scripts/verify-ios.sh --cohesion      with --run: the task 059 checks (one
#                                         theme, App Store must-haves, push,
#                                         links, dark mode): the light and dark
#                                         launch screenshots and a by-hand list
#   scripts/verify-ios.sh --godot         with --run: the Godot fight (task 061,
#                                         docs/game3d/G0_VERDICT.md): LibGodot
#                                         xcframeworks, the iOS .pck exported and
#                                         bundled, the borndotcom pod, then the
#                                         by-hand fight list. Needs a Godot 4.5.1
#                                         editor (GODOT_EDITOR, default
#                                         /Applications/Godot.app/...)
#
# What the Mac must look at by hand after this passes is the checklist in
# docs/one-codebase.md, "What the Mac must verify".
#
# Needs: Xcode 26+ (iOS 18 SDK or later) with its command line tools, Node 22,
# CocoaPods, and for Unity the GitHub CLI signed in to an account that can
# read ubmids/costquest-ios releases. Logs go to app/build-logs/.
#
# Exit code: 0 when every step that ran passed. The last lines say which
# steps ran and which were skipped.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/app"
LOGS="$APP/build-logs"
mkdir -p "$LOGS"

NO_UNITY=0
SIM_ONLY=0
RUN=0
NATIVE_GAME=0
STAGING=0
POLISH=0
COHESION=0
FORGE=0
GODOT=0
for arg in "$@"; do
  case "$arg" in
    --no-unity) NO_UNITY=1 ;;
    --sim-only) SIM_ONLY=1 ;;
    --run) RUN=1 ;;
    --native-game) NATIVE_GAME=1 ;;
    --staging) STAGING=1 ;;
    --rn-game) STAGING=1 ;;
    --polish) POLISH=1; RUN=1 ;;
    --cohesion) COHESION=1; RUN=1 ;;
    --forge) FORGE=1; RUN=1; STAGING=1 ;;
    --godot) GODOT=1; RUN=1; STAGING=1 ;;
    -h|--help) sed -n '2,55p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

ran=()
skipped=()
step() { echo; echo "==> $*"; }
need() { command -v "$1" >/dev/null || { echo "missing: $1 ($2)" >&2; exit 1; }; }

[ "$(uname -s)" = "Darwin" ] || { echo "this runs on a Mac (xcodebuild)" >&2; exit 1; }
need xcodebuild "install Xcode"
need node "Node 22"
need npm "Node 22"
need pod "gem install cocoapods (or brew install cocoapods)"

# Public config the JS reads at start-up (the same values as eas.json's
# preview profile; nothing secret). An app/.env with your own wins.
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-https://cosquest-1.onrender.com}"
export EXPO_PUBLIC_WEB_URL="${EXPO_PUBLIC_WEB_URL:-https://cosquest.vercel.app}"
if [ "$NATIVE_GAME" = 1 ]; then
  # The SwiftUI game, kept compiling as the fallback (features/game/config.ts).
  export EXPO_PUBLIC_GAME_UI=native
else
  # The shared React Native game, the iOS default since docs/one-codebase.md.
  export EXPO_PUBLIC_GAME_UI=rn
fi
if [ "$STAGING" = 1 ]; then
  export EXPO_PUBLIC_GAME_SERVER="${EXPO_PUBLIC_GAME_SERVER:-staging}"
  export EXPO_PUBLIC_WORLD_TIMING=1
fi

# 1. UnityFramework (device builds only).
if [ "$NO_UNITY" = 1 ]; then
  skipped+=("unity framework (--no-unity)")
  export COSTQUEST_NO_UNITY=1
else
  step "UnityFramework: pinned release, sha256 checked"
  need gh "brew install gh; gh auth login"
  "$APP/scripts/fetch-unity-framework.sh" 2>&1 | tee "$LOGS/fetch-unity.log"
  ran+=("unity framework")
fi

cd "$APP"

# 2. JS: install exactly the lockfile, then the shell's own checks.
step "npm ci"
npm ci 2>&1 | tail -5
ran+=("npm ci")

step "unit tests and typecheck"
npm test 2>&1 | tee "$LOGS/npm-test.log" | tail -8
npm run typecheck 2>&1 | tee "$LOGS/typecheck.log" | tail -5
ran+=("npm test" "typecheck")

step "lint (0 errors expected since merged-app-sync ecbfc0b)"
npm run lint 2>&1 | tee "$LOGS/lint.log" | tail -3
ran+=("lint")

step "task 059: every chat and community button labelled; release config"
node scripts/a11y-buttons.js --check 2>&1 | tee "$LOGS/a11y-buttons.log" | head -1
EAS_BUILD_PROFILE=production node scripts/check-release-env.js 2>&1 | tee "$LOGS/release-env.log" | tail -3 || true
echo "    (release env: failing here is expected until the production hosts are set as EAS env vars; see docs/polish/DECISIONS.md)"
ran+=("a11y labels" "release env check")

step "config plugin tests"
node --test modules/costquest-game/plugin/__tests__/*.test.js 2>&1 | tee "$LOGS/plugin-test.log" | grep -E "^# (pass|fail)"
grep -q "^# fail 0" "$LOGS/plugin-test.log" || { echo "plugin tests failed: $LOGS/plugin-test.log" >&2; exit 1; }
ran+=("plugin tests")

# The Swift voice matcher and WardenCheck (patches 0005 and 0006) against the
# TypeScript test vectors, with this Mac's compiler. Linux runs the same
# script with swift.org's toolchain (it passed there on 2026-10-20).
step "Swift matcher and WardenCheck vs the TS vectors"
SWIFTC="$(xcrun --find swiftc)" scripts/swift-linux-check.sh 2>&1 | tee "$LOGS/swift-check.log" | tail -3
grep -q "ALL PASSED" "$LOGS/swift-check.log" || { echo "Swift check failed: $LOGS/swift-check.log" >&2; exit 1; }
ran+=("swift matcher check")

# The RN game's native iOS layer from one-codebase (merged into
# polish-responsive): never through Xcode before this script. The stub check
# is the Linux type-check (Swift 6, strict concurrency); the xcodebuild below
# is what really compiles and links these files against the SDKs.
step "one-codebase Swift: stub type-check, then compiled by xcodebuild below"
for f in CostQuestGameModule CostQuestWardenModule FriendBeaconIsland GameHelpers GameHost \
         NativeIslands ShrineIsland VenueEventsIsland; do
  [ -f "modules/costquest-game/ios/Embed/$f.swift" ] || { echo "missing ios/Embed/$f.swift" >&2; exit 1; }
done
SWIFTC="$(xcrun --find swiftc)" scripts/swift-stub-check.sh 2>&1 | tee "$LOGS/swift-stub-check.log" | tail -3
grep -q "Embed type-checks" "$LOGS/swift-stub-check.log" || echo "    WARNING: stub check did not pass on this Mac (see $LOGS/swift-stub-check.log); the xcodebuild result is what counts" >&2
ran+=("one-codebase swift stub check")

# Godot fight (task 061): LibGodot xcframeworks and the exported .pck must be in
# place BEFORE prebuild (the withGodot config plugin copies the pck into the
# iOS bundle; the pod links the xcframeworks).
if [ "$GODOT" = 1 ] || [ "${EXPO_PUBLIC_GAME3D:-0}" = 1 ]; then
  export EXPO_PUBLIC_GAME3D=1
  step "godot: LibGodot 4.5.1.migeran.2 xcframeworks (download-prebuilt, sha256 checked)"
  GODOT_PLATFORMS=ios scripts/godot-prebuilt.sh 2>&1 | tee "$LOGS/godot-prebuilt.log" | tail -5
  for f in libgodot.xcframework libgodot-cpp.xcframework; do
    ls -d node_modules/@borndotcom/react-native-godot/ios/libs/*/*/"$f" >/dev/null 2>&1 \
      && echo "    $f: ok" \
      || { echo "    MISSING: $f under node_modules/@borndotcom/react-native-godot/ios/libs" >&2; exit 1; }
  done
  step "godot: export the fight as game3d.pck (iOS preset)"
  GODOT="${GODOT_EDITOR:-/Applications/Godot.app/Contents/MacOS/Godot}" \
    scripts/godot-export.sh ios 2>&1 | tee "$LOGS/godot-export.log" | tail -5
  ls -la godot-export/ios/game3d.pck 2>/dev/null || { echo "    MISSING: godot-export/ios/game3d.pck" >&2; exit 1; }
  ran+=("godot prebuilt + pck")
fi

# 3. Native project from app.json + the config plugins.
step "expo prebuild --clean (ios)"
CI=1 npx expo prebuild --platform ios --clean --no-install 2>&1 | tee "$LOGS/prebuild.log" | tail -5
ran+=("prebuild")

# The flag the RN game's NFC helper reads (GameHelpers.swift NfcHelper.entitled).
plist="$(ls ios/*/Info.plist | grep -v Pods | head -1)"
if /usr/libexec/PlistBuddy -c 'Print :CQNfcEnabled' "$plist" >/dev/null 2>&1; then
  echo "    Info.plist CQNfcEnabled = $(/usr/libexec/PlistBuddy -c 'Print :CQNfcEnabled' "$plist")"
else
  echo "    WARNING: Info.plist has no CQNfcEnabled (config plugin not applied?)" >&2
fi

# What the RN game's native islands need from Info.plist: the camera (the
# AR shrine, venue Events), Bonjour and Local Network (hold phones together,
# the venue mesh), Nearby Interaction (friend distance, UWB), motion (walking),
# speech and microphone (voice answers), location.
plist_need() {
  if /usr/libexec/PlistBuddy -c "Print :$1" "$plist" >/dev/null 2>&1; then
    echo "    Info.plist $1: ok"
  else
    echo "    WARNING: Info.plist has no $1" >&2
  fi
}
for key in NSCameraUsageDescription NSLocalNetworkUsageDescription NSNearbyInteractionUsageDescription \
           NSMotionUsageDescription NSSpeechRecognitionUsageDescription NSMicrophoneUsageDescription \
           NSLocationWhenInUseUsageDescription NSBonjourServices; do
  plist_need "$key"
done
/usr/libexec/PlistBuddy -c 'Print :NSBonjourServices' "$plist" 2>/dev/null | grep -q "_costquest._tcp" \
  || echo "    WARNING: NSBonjourServices lacks _costquest._tcp (hold phones together cannot find the other phone)" >&2

# Polish (docs/polish, task 058): fonts built in, phone only, the splash held.
# Poppins is embedded by the expo-font plugin (app.json): UIAppFonts lists it.
if /usr/libexec/PlistBuddy -c 'Print :UIAppFonts' "$plist" 2>/dev/null | grep -q "Poppins_400Regular.ttf"; then
  echo "    Info.plist UIAppFonts has Poppins: ok"
else
  echo "    WARNING: UIAppFonts lacks Poppins (expo-font plugin fonts not embedded?)" >&2
fi
# supportsTablet false (Subomi's call, no iPad layouts yet): iPhone only.
if grep -q "TARGETED_DEVICE_FAMILY = \"1,2\"" ios/*.xcodeproj/project.pbxproj 2>/dev/null; then
  echo "    WARNING: TARGETED_DEVICE_FAMILY still includes iPad (app.json supportsTablet should be false)" >&2
else
  echo "    TARGETED_DEVICE_FAMILY: iPhone only: ok"
fi

step "pod install"
(cd ios && pod install 2>&1 | tee "$LOGS/pod-install.log" | grep -E "CostQuestGame|SparksCallAudio|KeyboardController|Pod installation|error" || true)
grep -q "Pod installation complete" "$LOGS/pod-install.log" || { echo "pod install failed: $LOGS/pod-install.log" >&2; exit 1; }
# One keyboard approach app-wide (audit A4): react-native-keyboard-controller's pod.
grep -q "react-native-keyboard-controller" ios/Podfile.lock \
  && echo "    react-native-keyboard-controller pod: ok" \
  || echo "    WARNING: react-native-keyboard-controller is not in Podfile.lock" >&2
# Forge in the world (task 056): the 3D runtime is react-native-filament
# (Metal on iOS) with react-native-worklets-core for its render loop.
for pod in "react-native-filament" "react-native-worklets-core"; do
  grep -q "$pod" ios/Podfile.lock \
    && echo "    $pod pod: ok" \
    || { echo "    MISSING: $pod is not in Podfile.lock (Forge models would show thumbnails only)" >&2; exit 1; }
done
ls -d "$APP"/node_modules/react-native-filament/ios/libs/filament/lib/* >/dev/null 2>&1 \
  && echo "    prebuilt filament libraries shipped in the npm package: ok" \
  || echo "    WARNING: no prebuilt filament libraries under node_modules/react-native-filament/ios/libs/filament/lib (pod may try to build filament)" >&2
if [ "$GODOT" = 1 ]; then
  grep -q "borndotcom-react-native-godot" ios/Podfile.lock \
    && echo "    borndotcom-react-native-godot pod: ok" \
    || { echo "    MISSING: borndotcom-react-native-godot is not in Podfile.lock" >&2; exit 1; }
  # react-native-godot depends on worklets-core, which Filament also uses: one copy only.
  [ "$(grep -c '^  - react-native-worklets-core ' ios/Podfile.lock)" -le 1 ] \
    && echo "    one react-native-worklets-core pod: ok" \
    || echo "    WARNING: more than one react-native-worklets-core in Podfile.lock" >&2
fi
ran+=("pod install")

WORKSPACE="$(ls -d ios/*.xcworkspace | head -1)"
SCHEME="$(basename "$WORKSPACE" .xcworkspace)"

build() {
  local label="$1" log="$2"
  shift 2
  step "xcodebuild: $label (log: $log)"
  if xcodebuild -workspace "$WORKSPACE" -scheme "$SCHEME" "$@" \
      CODE_SIGNING_ALLOWED=NO COMPILER_INDEX_STORE_ENABLE=NO > "$log" 2>&1; then
    echo "    ok"
    ran+=("$label")
  else
    echo "    FAILED. First errors:" >&2
    grep -E "error:|\*\* BUILD FAILED" "$log" | head -40 >&2
    exit 1
  fi
}

# 4. Simulator: Unity is device-only, so this is always the no-Unity game
#    (the costquest-ios CostQuestSim equivalent).
build "simulator (no Unity)" "$LOGS/xcodebuild-sim.log" \
  -configuration Debug -sdk iphonesimulator -destination "generic/platform=iOS Simulator" build

# 5. Generic device: links and embeds UnityFramework when it was fetched.
if [ "$SIM_ONLY" = 1 ]; then
  skipped+=("device build (--sim-only)")
else
  build "generic device$([ "$NO_UNITY" = 1 ] && echo ' (no Unity)')" "$LOGS/xcodebuild-device.log" \
    -configuration Release -sdk iphoneos -destination "generic/platform=iOS" build
  if [ "$NO_UNITY" = 0 ]; then
    app_path="$(grep -Eo '/[^ ]+/Release-iphoneos/[^ /]+\.app' "$LOGS/xcodebuild-device.log" | tail -1 || true)"
    if [ -n "$app_path" ] && [ -f "$app_path/Frameworks/UnityFramework.framework/UnityFramework" ]; then
      echo "    UnityFramework is embedded in $(basename "$app_path")"
    else
      echo "    WARNING: could not find UnityFramework inside the built app (check the '[CostQuest] Embed UnityFramework' phase)" >&2
    fi
  fi
fi

# 6. Optional: run it in a simulator (Release, so the JS is bundled in).
if [ "$RUN" = 1 ]; then
  step "install and launch in a simulator"
  build "simulator Release" "$LOGS/xcodebuild-sim-release.log" \
    -configuration Release -sdk iphonesimulator -destination "generic/platform=iOS Simulator" \
    -derivedDataPath "$APP/build-logs/DerivedData" build
  device="$(xcrun simctl list devices available | grep -E "iPhone 1[6-9]|iPhone 2[0-9]" | head -1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')"
  [ -n "$device" ] || { echo "no iPhone simulator found" >&2; exit 1; }
  xcrun simctl boot "$device" 2>/dev/null || true
  open -a Simulator || true
  app_path="$(ls -d "$APP"/build-logs/DerivedData/Build/Products/Release-iphonesimulator/*.app | head -1)"
  xcrun simctl install "$device" "$app_path"
  bundle_id="$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$app_path/Info.plist")"
  xcrun simctl privacy "$device" grant location "$bundle_id" 2>/dev/null || true
  xcrun simctl location "$device" set 51.5007,-0.1246 2>/dev/null || true
  xcrun simctl launch "$device" "$bundle_id"
  echo "    launched $bundle_id on $device"
  shots="$LOGS/screens"
  mkdir -p "$shots"
  sleep 20
  xcrun simctl io "$device" screenshot "$shots/01-launch.png" >/dev/null
  # The game page (the RN game unless --native-game), on a point near Big Ben.
  xcrun simctl openurl "$device" 'cosquest://play?place=Westminster' || true
  sleep 15
  xcrun simctl io "$device" screenshot "$shots/02-game.png" >/dev/null
  echo "    screenshots in $shots (compare with docs/one-codebase-shots/ from the Android emulator)"
  echo "    By hand on iOS (docs/journeys/FINDINGS.md has the Android side):"
  echo "     - chat: the keyboard still sits just under the composer (padding on both platforms, b434ee5)"
  echo "     - edit a message: the edit card shows once under it and Done closes it (55b5ca5)"
  echo "     - chat search, Open the chat: back to the same chat at the message (b83f40f)"
  echo "     - profile: stat cards keep their soft shadow (only Android lost elevation, ca9ee20)"
  echo "     - sign-up picture step: Continue pinned above the home indicator (6f2590f)"
  echo "     - incoming call: tapping the Accept caption answers (3718d17)"
  echo "     - xcrun simctl openurl $device 'cosquest://nowhere' shows 'This link doesn't go anywhere' (39dda0c)"
  echo "     - a 1:1 call with Sparks on (sparks-call-audio module), then add a third person: no crash (9034081)"
  ran+=("simulator run" "screenshots")

  # Forge in the world (task 056): what only a phone can show.
  if [ "$FORGE" = 1 ]; then
    echo "    By hand, Forge in the world (docs/forge/DROP-IN.md; game server with CQ_FEATURES_ON=forge_world):"
    echo "     - map: Forge finds show as diamond pins with the item's picture; tap one in reach: the 3D model turns (Metal)"
    echo "     - Claim: the sunburst, 'Yours now', Equip it; the HUD chip shows the item; the Forge bag lists it"
    echo "     - Forge bag > Avatar: a hero plays idle; Walk and Celebrate buttons switch clips; Wear puts it on the HUD chip and map marker"
    echo "     - a duel: the versus card shows your Forge weapon (3D) and a Forge Guardian when the server picked one"
    echo "     - a point with a Forge station: the station model stands where the shrine was, its environment behind, your avatar beside it"
    echo "     - win a point: your avatar celebrates on the reward screen"
    echo "     - Xcode memory gauge with three models on screen: note the number (Android emulator figures in docs/forge/DROP-IN.md)"
    ran+=("forge by-hand list")
  fi

  # Godot fight (task 061): what only a Mac / iPhone can show.
  if [ "$GODOT" = 1 ]; then
    rel_app="$(ls -d "$APP"/build-logs/DerivedData/Build/Products/Release-iphonesimulator/*.app | head -1)"
    [ -f "$rel_app/game3d.pck" ] && echo "    game3d.pck is in the app bundle: ok" \
      || echo "    WARNING: game3d.pck not found in $rel_app (withGodot plugin did not copy it?)" >&2
    echo "    By hand, the Godot fight (docs/game3d/G0_VERDICT.md; EXPO_PUBLIC_GAME3D=1 build, game server with forge_world on):"
    echo "     - a duel point: 'Fight' opens the Godot fight directly, full screen in portrait (no briefing); no black screen, no crash"
    echo "     - joystick bottom left moves your Forge hero at once; the camera follows from a high three-quarter view"
    echo "     - Attack: a slash arc and hit sparks on the Guardian; the skill button shows its cooldown"
    echo "     - the 0:45 timer, '2/3 players', the minimap, names and health bars over you, the ally and the monster"
    echo "     - win or lose: Godot closes and the app's reward screen shows win/lose, damage and time"
    echo "     - open and close the fight 10 times (X button): no crash; the Xcode memory gauge returns to the map level"
    echo "     - background the app during a fight and come back: the fight resumes or closes cleanly"
    echo "     - renderer: the JS starts Godot with opengl3 + gl_compatibility as the library README does (Apple GLES, deprecated); note fps in the CQPERF lines and try --rendering-driver metal --rendering-method mobile (LibGodot iOS is built with Metal)"
    echo "     - no 3D Tiles on iOS yet (the GDExtension is built for Android only): the fight logs 'CQ tiles unavailable'"
    ran+=("godot by-hand list")
  fi

  # 7. Polish fit checks (task 058, docs/polish/BASELINE.md has the Android side).
  if [ "$POLISH" = 1 ]; then
    step "polish: three phones"
    sim_named() { xcrun simctl list devices available | grep -E "$1" | head -1 | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/'; }
    se="$(sim_named 'iPhone SE')"
    island="$(sim_named 'iPhone 1[5-9] Pro|iPhone 2[0-9] Pro|iPhone 1[6-9] |iPhone 2[0-9] ')"
    for spec in "se:$se:L" "island:$island:L" "island-a11y:$island:accessibility-extra-extra-extra-large"; do
      name="${spec%%:*}"; rest="${spec#*:}"; dev="${rest%%:*}"; size="${rest#*:}"
      if [ -z "$dev" ]; then echo "    WARNING: no simulator for $name (install it in Xcode > Settings > Platforms)" >&2; continue; fi
      xcrun simctl boot "$dev" 2>/dev/null || true
      xcrun simctl ui "$dev" content_size "$( [ "$size" = L ] && echo large || echo "$size")" 2>/dev/null || true
      xcrun simctl install "$dev" "$app_path"
      xcrun simctl terminate "$dev" "$bundle_id" 2>/dev/null || true
      xcrun simctl launch "$dev" "$bundle_id" >/dev/null
      sleep 15
      xcrun simctl io "$dev" screenshot "$shots/polish-$name-01-welcome.png" >/dev/null
      echo "    $name: $shots/polish-$name-01-welcome.png"
    done
    echo "    By hand, on each of the three (sign in as chioma_e2e on the test server build):"
    echo "     - start: the logo splash stays until the first screen; no white flash, no second logo splash (B6)"
    echo "     - welcome and every sign-up step: nothing under the notch / Dynamic Island or the home indicator;"
    echo "       on the SE the welcome hero shrinks and the page scrolls; Continue always reachable (A2)"
    echo "     - sign in, forgot / reset password, chat search, group admin pages: the field stays above the keyboard (A4)"
    echo "     - tab bar floats above the home indicator, not on it; the SE (no indicator) keeps a small gap (A1)"
    echo "     - largest text: tab labels, game HUD cards and chat bubbles grow at most 1.3x (HUD 1.2x), nothing clipped (A3)"
    echo "     - game: the Chats bubble tucks to the edge during quizzes and duels, never over an answer (A5, F-38)"
    echo "     - map at Trafalgar Square: crowded pins spread apart with a thin line to their spot; each tap opens the pin you tapped (A8, F-37)"
    echo "     - rotate is locked; the app is not offered on iPad (A7)"
    echo "     - duel: fighters move smoothly at 60 fps; the clock and health update (B1); quiz bar drains smoothly (B9)"
    echo "     - feed: scrolls smoothly with videos, only the video on screen plays, more posts load at the end (B2)"
    echo "     - a 2,000-message group: opens fast, scrolling up loads older messages with a small spinner (B4)"
    echo "     - airplane mode, then pull a screen: 'Can't reach CosQuest right now' within 15 s, not an endless spinner (B7)"
    echo "     - orbit call: the speaking pulse is smooth (native driver, B10)"
    ran+=("polish screenshots")
  fi

  # 8. Cohesion checks (task 059, docs/polish/DECISIONS.md and PALETTE.md).
  if [ "$COHESION" = 1 ]; then
    step "cohesion: light and dark, links, push"
    xcrun simctl ui "$device" appearance dark 2>/dev/null || true
    xcrun simctl terminate "$device" "$bundle_id" 2>/dev/null || true
    xcrun simctl launch "$device" "$bundle_id" >/dev/null
    sleep 2
    xcrun simctl io "$device" screenshot "$shots/cohesion-01-splash-dark.png" >/dev/null
    sleep 15
    xcrun simctl io "$device" screenshot "$shots/cohesion-02-dark.png" >/dev/null
    xcrun simctl ui "$device" appearance light 2>/dev/null || true
    # A push shaped like the backend's (cosquest-backend src/utils/push.js): tap it, it opens Notifications.
    printf '%s' "{\"aps\":{\"alert\":{\"title\":\"CosQuest\",\"body\":\"Simulator push\"}},\"body\":{\"type\":\"system\"}}" > "$LOGS/push.apns"
    xcrun simctl push "$device" "$bundle_id" "$LOGS/push.apns" 2>/dev/null || echo "    (simctl push not available on this Xcode)"
    echo "    screenshots: $shots/cohesion-*.png"
    echo "    By hand (sign in as chioma_e2e on a test-server build, then on a local-backend build for the new routes):"
    echo "     - splash: the logo on brand pink (dark mode: on navy), then straight to the first screen"
    echo "     - dark mode: chat AND game sheets go dark together (Profile, More, Journal); the map is lit as at night"
    echo "     - allow notifications: a push token is registered (backend log: POST /api/users/me/devices); tap a push:"
    echo "       a message opens its chat, a follow the person, a game event the game; the app icon shows the unread badge"
    echo "     - links: xcrun simctl openurl $device 'cosquest://chat/<id>', 'cosquest://user/<name>', 'cosquest://invite/<code>', 'cosquest://play?shrine=<id>'"
    echo "     - airplane mode: 'You're offline' banner; send a text: 'Waiting for network', sent when back"
    echo "     - on the test server (no /api/meta/capabilities): no Delete account, no Report; Block still there"
    echo "     - on a local backend with this branch's cosquest-backend: Settings > Account Information > Delete account works;"
    echo "       Report from a profile, a message, a post, a group; Block from a group's member list"
    echo "     - Help & Support: Contact support and Report a bug send; Terms / Privacy / Guidelines say 'Not published yet' without URLs"
    echo "     - VoiceOver: every chat and community button reads a name (scripts/a11y-buttons.js counted 0 missing)"
    echo "     - profile: game level and XP under the chat points; the game's HUD chip shows your photo"
    echo "     - share a game result to a chat: a card on a local backend, a text line on the test server"
    echo "     - pod install picked up RNSentry, EXUpdates, RNCNetInfo and react-native-webview (Podfile.lock)"
    ran+=("cohesion screenshots")
  fi
fi

echo
ran+=("(JS built with gameUi=$EXPO_PUBLIC_GAME_UI, game server ${EXPO_PUBLIC_GAME_SERVER:-production})")
echo "verify-ios: passed"
echo "  ran:     ${ran[*]}"
[ ${#skipped[@]} -gt 0 ] && echo "  skipped: ${skipped[*]}"
exit 0
