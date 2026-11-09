#!/usr/bin/env bash
# Install the LibGodot prebuilts that @borndotcom/react-native-godot links
# against (they are not on npm). Runs the library's own `download-prebuilt`
# script, which unpacks them into node_modules/@borndotcom/react-native-godot/
# {android,ios}/libs, so run it again after every `npm ci`.
#
#   scripts/godot-prebuilt.sh                 # official release zips (GitHub), sha256 checked
#   LIBGODOT_ANDROID_PATH=/path/libgodot-android.zip \
#   LIBGODOT_CPP_ANDROID_PATH=/path/godot-cpp-android.zip \
#     scripts/godot-prebuilt.sh               # local zips (e.g. a build with x86_64 added)
#
# Env:
#   LIBGODOT_ANDROID_PATH, LIBGODOT_CPP_ANDROID_PATH,
#   LIBGODOT_XCFRAMEWORK_PATH, LIBGODOT_CPP_XCFRAMEWORK_PATH
#                      local archives instead of the download. When any is set
#                      the sha256 check is off (SHASUM_CHECK=false) and the
#                      installed copy is replaced (REPLACE_EXISTING=true),
#                      as the library's README says for custom builds. Set
#                      SHASUM_CHECK=true yourself to check local copies of the
#                      official zips.
#   GODOT_PLATFORMS    [android on Linux, android,ios on macOS] which prebuilts
#                      to install (android, ios or android,ios).
#   REPLACE_EXISTING   [false] true: unpack again even if that version is there.
#
# The library's script skips an entry whose version folder is already
# unpacked, so switching between the official zips and local ones needs a
# replace (automatic when a *_PATH is set).
set -euo pipefail
cd "$(dirname "$0")/.."

LIB=node_modules/@borndotcom/react-native-godot
if [ ! -f "$LIB/scripts/download-prebuilt.js" ]; then
  echo "godot-prebuilt: $LIB is not installed; run npm ci first" >&2
  exit 1
fi

if [ -z "${GODOT_PLATFORMS:-}" ]; then
  if [ "$(uname -s)" = Darwin ]; then GODOT_PLATFORMS=android,ios; else GODOT_PLATFORMS=android; fi
fi
only=()
case ",$GODOT_PLATFORMS," in *,android,*) only+=(libgodot-android libgodot-cpp-android) ;; esac
case ",$GODOT_PLATFORMS," in *,ios,*) only+=(libgodot libgodot-cpp) ;; esac
if [ ${#only[@]} -eq 0 ]; then
  echo "godot-prebuilt: GODOT_PLATFORMS must name android and/or ios" >&2
  exit 2
fi
PREBUILT_ONLY="$(IFS=,; echo "${only[*]}")"
export PREBUILT_ONLY

local_zip=0
for v in LIBGODOT_ANDROID_PATH LIBGODOT_CPP_ANDROID_PATH LIBGODOT_XCFRAMEWORK_PATH LIBGODOT_CPP_XCFRAMEWORK_PATH; do
  if [ -n "${!v:-}" ]; then
    [ -f "${!v}" ] || { echo "godot-prebuilt: $v=${!v} does not exist" >&2; exit 1; }
    export "${v?}"
    local_zip=1
  else
    unset "$v"
  fi
done
if [ "$local_zip" = 1 ]; then
  export SHASUM_CHECK="${SHASUM_CHECK:-false}" REPLACE_EXISTING="${REPLACE_EXISTING:-true}"
fi

# The script stages each zip in $TMPDIR under its plain file name: use a
# private folder so two users on one machine do not share /tmp/<name>.zip.
TMPDIR="$(mktemp -d)"
export TMPDIR
trap 'rm -rf "$TMPDIR"' EXIT

echo "== godot-prebuilt: $PREBUILT_ONLY (local zips: $local_zip, shasum check: ${SHASUM_CHECK:-true}, replace: ${REPLACE_EXISTING:-false})"
node "$LIB/scripts/download-prebuilt.js"

# Which Android ABIs the installed copy can build.
aar=$(find "$LIB/android/libs/libgodot-android" -name '*.aar' 2>/dev/null | head -1 || true)
if [ -n "$aar" ]; then
  echo "== libgodot_android.so ABIs: $(unzip -l "$aar" | awk '/libgodot_android.so/ {split($4, p, "/"); printf "%s ", p[2]}')"
fi
cpp="$LIB/android/libs/libgodot-cpp-android"
if [ -d "$cpp" ]; then
  echo "== libgodot-cpp.a ABIs: $(find "$cpp" -name libgodot-cpp.a | awk -F/ '{printf "%s ", $(NF-1)}')"
fi
