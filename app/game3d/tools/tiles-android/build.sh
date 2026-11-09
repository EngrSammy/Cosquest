#!/usr/bin/env bash
# Build the 3D-Tiles-For-Godot GDExtension for Android.
#   build.sh <abi> [stage...]
#   abi:    x86_64 | arm64-v8a
#   stages: sources deps godotcpp configure build install   (default: all, in order)
# Heavy steps run under the task build lock ($LOCK, an flock) with -j6.
# One-time setup (see NOTES.md): clone cesium-native v0.52.1, godot-cpp 4.1.4,
# litehtml 35ecd69 and vcpkg dbe35ce into $TB, bootstrap vcpkg.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/env.sh" "${1:-x86_64}"
shift || true
STAGES=("$@")
[ ${#STAGES[@]} -eq 0 ] && STAGES=(sources deps godotcpp configure build install)

PLUGIN_SRC="$TB/plugin-src"
BUILD_DIR="$TB/build-$ABI"
GODOT_CPP_ABI_DIR="$TB/godot-cpp-$ABI"
if [ "$ABI" = linux-x86_64 ]; then GD_PLATFORM=linux; else GD_PLATFORM=android; fi
GODOT_CPP_LIB="$GODOT_CPP_ABI_DIR/bin/libgodot-cpp.$GD_PLATFORM.template_release.$GODOT_ARCH.a"
J=${J:-3}

stamp() { echo "[$(date +%H:%M:%S)] $*"; }

for st in "${STAGES[@]}"; do
  case "$st" in
  sources)
    # Pristine copy of the plugin sources + Android patch (plugin clone untouched)
    stamp "sources -> $PLUGIN_SRC"
    rm -rf "$PLUGIN_SRC"; mkdir -p "$PLUGIN_SRC"
    cp -r "$PLUGIN_DIR/cesium_godot" "$PLUGIN_DIR/cesium_auxiliars" "$PLUGIN_SRC/"
    rm -rf "$PLUGIN_SRC/cesium_godot/native"
    (cd "$PLUGIN_SRC" && patch -p1 < "$HERE/android-godot-http.patch")
    ;;
  deps)
    stamp "vcpkg install ($TRIPLET)"
    "$LOCK" "$VCPKG_ROOT/vcpkg" install --triplet "$TRIPLET" --clean-after-build "${VCPKG_PACKAGES[@]}"
    ;;
  godotcpp)
    # Separate copy per ABI so object files of both ABIs can coexist
    if [ ! -d "$GODOT_CPP_ABI_DIR" ]; then cp -r "$GODOT_CPP_DIR" "$GODOT_CPP_ABI_DIR"; fi
    stamp "godot-cpp 4.1.4 $GD_PLATFORM $GODOT_ARCH"
    if [ "$GD_PLATFORM" = linux ]; then
      (cd "$GODOT_CPP_ABI_DIR" && "$LOCK" "$SCONS" -j$J platform=linux arch="$GODOT_ARCH" \
          target=template_release disable_exceptions=no debug_symbols=no)
    else
      (cd "$GODOT_CPP_ABI_DIR" && "$LOCK" "$SCONS" -j$J platform=android arch="$GODOT_ARCH" \
          target=template_release android_api_level="$ANDROID_API" ANDROID_HOME= \
          disable_exceptions=no debug_symbols=no)
    fi
    ls -la "$GODOT_CPP_LIB"
    ;;
  configure)
    stamp "configure $BUILD_DIR"
    if [ "$GD_PLATFORM" = linux ]; then
      PLAT_ARGS=(-DCMAKE_C_COMPILER=gcc -DCMAKE_CXX_COMPILER=g++)
    else
      PLAT_ARGS=(-DVCPKG_CHAINLOAD_TOOLCHAIN_FILE="$NDK_TOOLCHAIN"
        -DANDROID_ABI="$ABI" -DANDROID_PLATFORM="android-$ANDROID_API" -DANDROID_STL=c++_static)
    fi
    cmake -S "$HERE" -B "$BUILD_DIR" -G Ninja "${PLAT_ARGS[@]}" \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_TOOLCHAIN_FILE="$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake" \
      -DVCPKG_TARGET_TRIPLET="$TRIPLET" -DVCPKG_MANIFEST_MODE=OFF \
      -DPLUGIN_SRC="$PLUGIN_SRC" -DGODOT_CPP_DIR="$GODOT_CPP_ABI_DIR" -DGODOT_CPP_LIB="$GODOT_CPP_LIB" \
      -DGODOT_ARCH="$GODOT_ARCH" -DCESIUM_NATIVE_DIR="$CESIUM_NATIVE_DIR" -DLITEHTML_DIR="$LITEHTML_DIR"
    ;;
  build)
    stamp "build $BUILD_DIR"
    "$LOCK" cmake --build "$BUILD_DIR" --target godot3dtiles -j $J
    ;;
  install)
    mkdir -p "$OUT_DIR/$ABI"
    SO="$BUILD_DIR/libGodot3DTiles.$GD_PLATFORM.template_release.$GODOT_ARCH.so"
    "$LLVM_BIN/llvm-strip" --strip-unneeded -o "$OUT_DIR/$ABI/$(basename "$SO")" "$SO"
    cp "$SO" "$OUT_DIR/$ABI/$(basename "$SO" .so).unstripped.so.debug"
    ls -la "$OUT_DIR/$ABI"
    "$LLVM_BIN/llvm-readelf" -d "$OUT_DIR/$ABI/$(basename "$SO")" | grep -E "NEEDED|SONAME"
    ;;
  *) echo "unknown stage $st" >&2; exit 1 ;;
  esac
done
stamp "done: ${STAGES[*]}"
