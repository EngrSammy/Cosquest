#!/usr/bin/env bash
# Sign a debug-signed release APK / AAB (scripts/android-beta-release.sh on a
# build box without the key) with the dev upload key, on the machine that
# holds it. The old signature is replaced, not added to.
#
#   scripts/android-sign.sh in.apk out.apk
#   scripts/android-sign.sh in.aab out.aab
#
# Env: SIGNING [~/.config/cosquest-dev/android-signing.properties]
#      BUILD_TOOLS [newest in $ANDROID_HOME/build-tools]
set -euo pipefail
in="${1:?in.apk|in.aab}"; out="${2:?out}"
: "${SIGNING:=$HOME/.config/cosquest-dev/android-signing.properties}"
: "${ANDROID_HOME:=$HOME/Library/Android/sdk}"
: "${BUILD_TOOLS:=$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)}"
[ -r "$SIGNING" ] || { echo "no signing file at $SIGNING" >&2; exit 2; }
prop() { sed -n "s/^$1=//p" "$SIGNING" | head -1; }
STORE="$(prop storeFile)"; ALIAS="$(prop keyAlias)"
export CQ_SP="$(prop storePassword)" CQ_KP="$(prop keyPassword)"

case "$in" in
  *.apk)
    "$BUILD_TOOLS/zipalign" -f -p 4 "$in" "$out.aligned"
    "$BUILD_TOOLS/apksigner" sign --ks "$STORE" --ks-key-alias "$ALIAS" \
      --ks-pass env:CQ_SP --key-pass env:CQ_KP --out "$out" "$out.aligned"
    rm -f "$out.aligned" "$out.idsig"
    "$BUILD_TOOLS/apksigner" verify --print-certs "$out" | grep -E "Signer #1 certificate (DN|SHA-256)"
    ;;
  *.aab)
    cp "$in" "$out"
    # drop the debug signature so the bundle has exactly one signer
    zip -q -d "$out" 'META-INF/*.SF' 'META-INF/*.RSA' 'META-INF/*.EC' 'META-INF/*.DSA' 'META-INF/MANIFEST.MF' 2>/dev/null || true
    jarsigner -keystore "$STORE" -storepass:env CQ_SP -keypass:env CQ_KP \
      -sigalg SHA256withRSA -digestalg SHA-256 "$out" "$ALIAS" >/dev/null
    jarsigner -verify "$out" | tail -1
    ;;
  *) echo "need an .apk or .aab" >&2; exit 2 ;;
esac
