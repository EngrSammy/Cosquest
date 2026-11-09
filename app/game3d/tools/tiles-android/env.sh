# Common environment for building 3D-Tiles-For-Godot (Battle-Road) for Android.
# Usage: source env.sh <abi>   where <abi> is x86_64 or arm64-v8a
# Paths are overridable from the environment.

ABI="${1:-${ABI:-x86_64}}"
case "$ABI" in
  x86_64)    TRIPLET=x64-android;   GODOT_ARCH=x86_64 ;;
  arm64-v8a) TRIPLET=arm64-android; GODOT_ARCH=arm64 ;;
  linux-x86_64) TRIPLET=x64-linux; GODOT_ARCH=x86_64 ;;   # desktop verification build only
  *) echo "unknown ABI $ABI (use x86_64 or arm64-v8a)" >&2; return 1 2>/dev/null || exit 1 ;;
esac
export ABI TRIPLET GODOT_ARCH

export CQ="${CQ:-$HOME/cq-work}"
export ANDROID_HOME="${ANDROID_HOME:-$CQ/tools/android-sdk}"
export NDK="${NDK:-$ANDROID_HOME/ndk/27.2.12479018}"
export ANDROID_NDK_HOME="$NDK"
export ANDROID_NDK_ROOT="$NDK"
export ANDROID_API="${ANDROID_API:-28}"   # vcpkg's android triplets use API 28

# Sources and build trees (outside the plugin clone)
export PLUGIN_DIR="${PLUGIN_DIR:-$CQ/game-godot/ext/tiles}"
export TB="${TB:-$CQ/game-godot/ext/tiles-build}"
export VCPKG_ROOT="$TB/vcpkg"
export CESIUM_NATIVE_DIR="$TB/cesium-native"
export GODOT_CPP_DIR="$TB/godot-cpp-4.1.4"
export LITEHTML_DIR="$TB/litehtml"
export OUT_DIR="${OUT_DIR:-$CQ/game-godot/out-tiles}"
export LOG_DIR="${LOG_DIR:-$CQ/game-godot/logs}"

# Tools
export CMAKE_HOME="${CMAKE_HOME:-$CQ/tools/cmake-3.31.9-linux-x86_64}"
export NINJA_DIR="$ANDROID_HOME/cmake/3.22.1/bin"
export SCONS="${SCONS:-$CQ/tools/pyenv-scons/bin/scons}"
export PATH="$CMAKE_HOME/bin:$NINJA_DIR:$PATH"
export LOCK="${LOCK:-$CQ/game-godot/bin/build-run}"

# Parallelism caps (shared box, 10 GB task memory cap; lead asked for -j3 at 17:5x)
export VCPKG_MAX_CONCURRENCY=3
export CMAKE_BUILD_PARALLEL_LEVEL=3
export VCPKG_DISABLE_METRICS=1
export VCPKG_KEEP_ENV_VARS="ANDROID_NDK_HOME;VCPKG_MAX_CONCURRENCY"

export NDK_TOOLCHAIN="$NDK/build/cmake/android.toolchain.cmake"
export LLVM_BIN="$NDK/toolchains/llvm/prebuilt/linux-x86_64/bin"

# vcpkg ports needed by cesium-native v0.52.1 (from its CMakeLists PACKAGES_*),
# minus curl (we use the plugin's GodotHttpClient on Android).
VCPKG_PACKAGES=(
  asyncplusplus expected-lite fmt glm rapidjson spdlog stb ada-url ms-gsl
  abseil draco ktx modp-base64 meshoptimizer openssl s2geometry
  libjpeg-turbo sqlite3 tinyxml2 libwebp zlib-ng picosha2
  earcut-hpp "cpp-httplib[core]" libmorton zstd "blend2d[core,jit]" asmjit
  doctest uriparser
)
