#!/usr/bin/env bash
# The Android twin of the "CosQuest Beta" TestFlight build: the same app id
# (com.subomi.cosquest.chat), versionCode = the TestFlight build number, the
# chat on the team's Render API and the game server exactly as
# scripts/cosquest-beta-env.sh sets it for iOS (PRODUCTION from build 19;
# EXPO_PUBLIC_GAME_SERVER=staging for a staging test APK). A release build for real
# phones (arm64-v8a), APK + AAB.
#
#   scripts/android-beta-release.sh                prebuild --clean, Godot export, APK + AAB
#   SKIP_PREBUILD=1 scripts/android-beta-release.sh
#   NO_AAB=1 scripts/android-beta-release.sh       the APK only
#
# Signing: with SIGNING (a properties file: storeFile, storePassword,
# keyAlias, keyPassword; the dev upload key lives in ~/.config/cosquest-dev/,
# never in the repo) Gradle signs with it through AGP's injected signing
# config (ORG_GRADLE_PROJECT_* env, never on the command line). Without it
# the build is debug-signed; sign it afterwards with scripts/android-sign.sh
# on the machine that holds the key (that keeps the key off build boxes).
#
# Env (defaults in brackets):
#   ABI            [arm64-v8a]
#   GODOT_EXPORT   [1]          export game3d/ first (scripts/godot-export.sh android)
#   GRADLE_WORKERS [4] / GRADLE_XMX [3g]
#   CMAKE_DIR      optional cmake copy with a -j4 ninja wrapper (shared machines)
#   JAVA_HOME (JDK 17) / ANDROID_HOME (the Android SDK)
#
# Output: android/app/build/outputs/{apk,bundle}/release/.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${ABI:=arm64-v8a}"
export ANDROID_SDK_ROOT="${ANDROID_HOME:?set ANDROID_HOME}"
export PATH="${JAVA_HOME:?set JAVA_HOME}/bin:$PATH"

# shellcheck source=cosquest-beta-env.sh
source scripts/cosquest-beta-env.sh
export NODE_ENV=production
# Build 19 moved the beta to PRODUCTION (it was staging-only to 18). The env
# script has already refused a JS/native mismatch; this names the two hosts
# the APK may play on, so a typo'd or third server never ships.
case "$COSQUEST_GAME_SERVER_URL" in
  https://costquest.204.168.162.79.sslip.io | https://costquest-staging.204.168.162.79.sslip.io) ;;
  *) echo "the beta APK plays on the production or staging game server only (got $COSQUEST_GAME_SERVER_URL)" >&2; exit 2 ;;
esac
echo "== CosQuest Beta Android, build $COSQUEST_BUILD_NUMBER: chat $EXPO_PUBLIC_API_URL, game $EXPO_PUBLIC_GAME_SERVER (native $COSQUEST_GAME_SERVER_URL)"

if [ -e /tmp/metro-cache ] && [ ! -w /tmp/metro-cache ]; then
  export TMPDIR="$PWD/node_modules/.cache/tmp"
  mkdir -p "$TMPDIR"
fi

GODOT_LIBS=node_modules/@borndotcom/react-native-godot/android/libs
if [ -n "${LIBGODOT_ANDROID_PATH:-}" ] || ! ls "$GODOT_LIBS"/libgodot-android/*/com >/dev/null 2>&1; then
  scripts/godot-prebuilt.sh
fi
if [ "${GODOT_EXPORT:-1}" = 1 ]; then scripts/godot-export.sh android; fi

if [ "${SKIP_PREBUILD:-0}" != 1 ]; then
  echo "== prebuild $(date -u +%FT%TZ)"
  CI=1 npx expo prebuild --platform android --clean --no-install
fi

if [ -n "${CMAKE_DIR:-}" ]; then
  grep -v '^cmake.dir=' android/local.properties 2>/dev/null > android/local.properties.tmp || true
  echo "cmake.dir=$CMAKE_DIR" >> android/local.properties.tmp
  mv android/local.properties.tmp android/local.properties
fi

sign=()
if [ -n "${SIGNING:-}" ]; then
  [ -r "$SIGNING" ] || { echo "no signing file at $SIGNING" >&2; exit 2; }
  prop() { sed -n "s/^$1=//p" "$SIGNING" | head -1; }
  sign=(
    "ORG_GRADLE_PROJECT_android.injected.signing.store.file=$(prop storeFile)"
    "ORG_GRADLE_PROJECT_android.injected.signing.store.password=$(prop storePassword)"
    "ORG_GRADLE_PROJECT_android.injected.signing.key.alias=$(prop keyAlias)"
    "ORG_GRADLE_PROJECT_android.injected.signing.key.password=$(prop keyPassword)"
  )
else
  echo "== no SIGNING: debug-signed; run scripts/android-sign.sh where the upload key is"
fi

tasks=(:app:assembleRelease)
[ "${NO_AAB:-0}" = 1 ] || tasks+=(:app:bundleRelease)
echo "== gradle ${tasks[*]} ($ABI) $(date -u +%FT%TZ)"
cd android
env "${sign[@]}" ./gradlew "${tasks[@]}" -x lintVitalRelease --no-daemon -PreactNativeArchitectures="$ABI" \
  -Dorg.gradle.workers.max="${GRADLE_WORKERS:-4}" -Dorg.gradle.jvmargs="-Xmx${GRADLE_XMX:-3g} -XX:MaxMetaspaceSize=768m" \
  -Dkotlin.daemon.jvm.options=-Xmx1536m --console=plain
echo "== done $(date -u +%FT%TZ)"
ls -la app/build/outputs/apk/release/*.apk app/build/outputs/bundle/release/*.aab 2>/dev/null || true
