#!/usr/bin/env bash
# Build the merged app for an x86_64 Android emulator, with the JS bundled in
# (no Metro needed), pointed at a local chat backend and the STAGING game
# server. Never points at production.
#
#   scripts/android-emulator-build.sh            # prebuild --clean + assembleRelease
#   SKIP_PREBUILD=1 scripts/android-emulator-build.sh
#
# Then:
#   (cd ../cosquest-backend && node scripts/devLocal.js)   # chat backend on :4120
#   adb reverse tcp:4120 tcp:4120
#   adb install -r android/app/build/outputs/apk/release/app-release.apk
#
# Env (defaults in brackets):
#   CHAT_API_URL   [http://localhost:4120]  the chat backend (devLocal.js)
#   GAME_SERVER    [staging]                "staging", an https URL, or a game
#                                           server on this machine for local runs
#                                           (http://localhost:PORT with
#                                           `adb reverse tcp:PORT tcp:PORT`)
#   GAME_UI        [rn]                     the React Native game
#   ABI            [x86_64]                 arm64-v8a for a phone; a comma list
#                                           (x86_64,arm64-v8a) makes one APK for both
#   UNLOCK_ALL     [0]                      1: every feature open whatever the
#                                           player's level (screens on a new
#                                           player; refused on production)
#   JAVA_HOME / ANDROID_HOME                 JDK 17 and the Android SDK
#   LIBGODOT_ANDROID_PATH / LIBGODOT_CPP_ANDROID_PATH
#                  [official]               LibGodot zips (scripts/godot-prebuilt.sh);
#                                           the official ones have no x86_64
#   GODOT_EXPORT   [0]                      1: export game3d/ first (scripts/godot-export.sh)
#   GRADLE_WORKERS [4] / GRADLE_XMX [3g]     Gradle's workers and heap (a shared machine: 2 / 2g)
#
# The release build is signed with the debug key (the Expo template's
# default) and is for testing only. When the chat URL is plain http, this
# script turns on cleartext traffic in the generated manifest; that edit
# lives in android/ (generated, git-ignored), never in app.json.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${CHAT_API_URL:=http://localhost:4120}"
: "${GAME_SERVER:=staging}"
: "${GAME_UI:=rn}"
: "${ABI:=x86_64}"
export ANDROID_SDK_ROOT="${ANDROID_HOME:?set ANDROID_HOME}"
export PATH="${JAVA_HOME:?set JAVA_HOME}/bin:$PATH"

case "$GAME_SERVER" in
  staging | https://*) ;;
  http://localhost:* | http://127.0.0.1:* | http://10.0.2.2:*) ;;
  *) echo "GAME_SERVER must be 'staging', an https URL or http://localhost:PORT" >&2; exit 2 ;;
esac

export EXPO_PUBLIC_API_URL="$CHAT_API_URL"
export EXPO_PUBLIC_GAME_SERVER="$GAME_SERVER"
export EXPO_PUBLIC_GAME_UI="$GAME_UI"
# battle-3d-only: the 3D fight is in every build (EXPO_PUBLIC_GAME3D=0 to leave it out).
export EXPO_PUBLIC_GAME3D="${EXPO_PUBLIC_GAME3D:-1}"
export EXPO_PUBLIC_WORLD_TIMING=1
# Test-only routes (app/dev/crash, app/dev/push-test): task 059 journeys.
export EXPO_PUBLIC_E2E=1
export EXPO_PUBLIC_GAME_UNLOCK_ALL="${UNLOCK_ALL:-0}"
export NODE_ENV=production
# Metro caches in $TMPDIR/metro-cache; on a shared machine another user may
# own /tmp/metro-cache, so use a private temp dir then.
if [ -e /tmp/metro-cache ] && [ ! -w /tmp/metro-cache ]; then
  export TMPDIR="$PWD/node_modules/.cache/tmp"
  mkdir -p "$TMPDIR"
fi

# Godot (cq 061): the LibGodot prebuilts live in node_modules (not on npm), so
# install them when missing (scripts/godot-prebuilt.sh; LIBGODOT_*_PATH for
# local zips), and refuse an ABI they do not have before a long build.
GODOT_LIBS=node_modules/@borndotcom/react-native-godot/android/libs
if [ -d node_modules/@borndotcom/react-native-godot ]; then
  if [ -n "${LIBGODOT_ANDROID_PATH:-}" ] || ! ls "$GODOT_LIBS"/libgodot-android/*/com >/dev/null 2>&1; then
    scripts/godot-prebuilt.sh
  fi
  aar=$(find "$GODOT_LIBS/libgodot-android" -name '*.aar' | head -1)
  for abi in ${ABI//,/ }; do
    if ! unzip -l "$aar" | grep -q "jni/$abi/libgodot_android.so" ||
      [ ! -f "$(find "$GODOT_LIBS/libgodot-cpp-android" -path "*/$abi/libgodot-cpp.a" | head -1)" ]; then
      echo "LibGodot has no $abi build installed; point LIBGODOT_ANDROID_PATH / LIBGODOT_CPP_ANDROID_PATH at zips that do" >&2
      exit 2
    fi
  done
  # GODOT_EXPORT=1: export game3d/ first (scripts/godot-export.sh android).
  if [ "${GODOT_EXPORT:-0}" = 1 ]; then scripts/godot-export.sh android; fi
fi

if [ "${SKIP_PREBUILD:-0}" != 1 ]; then
  echo "== prebuild $(date -u +%FT%TZ)"
  CI=1 npx expo prebuild --platform android --clean --no-install
fi

if [[ "$CHAT_API_URL" == http://* ]]; then
  manifest=android/app/src/main/AndroidManifest.xml
  grep -q 'usesCleartextTraffic="true"' "$manifest" ||
    sed -i 's/<application /<application android:usesCleartextTraffic="true" /' "$manifest"
  echo "== cleartext on (test build only): $CHAT_API_URL"
fi

# ninja runs cores+2 native compile jobs by default, which on a big shared
# machine can push it into swap. CMAKE_DIR may point at a copy of the SDK's
# cmake whose bin/ninja is a wrapper adding -j4.
if [ -n "${CMAKE_DIR:-}" ]; then
  grep -v '^cmake.dir=' android/local.properties 2>/dev/null > android/local.properties.tmp || true
  echo "cmake.dir=$CMAKE_DIR" >> android/local.properties.tmp
  mv android/local.properties.tmp android/local.properties
fi

echo "== gradle assembleRelease ($ABI) $(date -u +%FT%TZ)"
cd android
# Lint-vital is skipped: this is a test build, and it is the slowest step.
./gradlew :app:assembleRelease -x lintVitalRelease --no-daemon -PreactNativeArchitectures="$ABI" \
  -Dorg.gradle.workers.max="${GRADLE_WORKERS:-4}" -Dorg.gradle.jvmargs="-Xmx${GRADLE_XMX:-3g} -XX:MaxMetaspaceSize=768m" \
  -Dkotlin.daemon.jvm.options=-Xmx1536m ${GRADLE_EXTRA:-} --console=plain
echo "== done $(date -u +%FT%TZ): $(ls -la app/build/outputs/apk/release/*.apk)"
