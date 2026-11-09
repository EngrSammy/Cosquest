# Out-of-tree Android build of the 3D-Tiles-For-Godot GDExtension (Battle-Road).
# Builds cesium-native (add_subdirectory) + litehtml and links them with the
# plugin sources and a godot-cpp static library built separately with SCons.
# Configure through build.sh, which sets the vcpkg toolchain chain-loading the NDK.
cmake_minimum_required(VERSION 3.22)

if(NOT DEFINED PLUGIN_SRC OR NOT DEFINED GODOT_CPP_DIR OR NOT DEFINED CESIUM_NATIVE_DIR OR NOT DEFINED LITEHTML_DIR)
  message(FATAL_ERROR "PLUGIN_SRC, GODOT_CPP_DIR, CESIUM_NATIVE_DIR and LITEHTML_DIR must be set")
endif()

# cesium-native options: no curl (we use Godot's HTTPClient), no tests/tidy/docs
set(CESIUM_USE_EZVCPKG OFF CACHE BOOL "" FORCE)
set(CESIUM_DISABLE_CURL ON CACHE BOOL "" FORCE)
set(CESIUM_TESTS_ENABLED OFF CACHE BOOL "" FORCE)
set(CESIUM_ENABLE_CLANG_TIDY OFF CACHE BOOL "" FORCE)
set(CESIUM_INSTALL_STATIC_LIBS OFF CACHE BOOL "" FORCE)
set(CESIUM_INSTALL_HEADERS OFF CACHE BOOL "" FORCE)
# Keep cesium-native's own GLM settings as upstream (strict ON). Note GLM_FORCE_XYZW_ONLY also keeps
# GLM in its pure (constexpr) code path; turning strict off enables SIMD and cesium-native stops compiling.
set(CESIUM_GLM_STRICT_ENABLED ON CACHE BOOL "" FORCE)
set(VCPKG_TRIPLET "${VCPKG_TARGET_TRIPLET}" CACHE STRING "" FORCE)

project(godot3dtiles_android LANGUAGES C CXX)

set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_VISIBILITY_INLINES_HIDDEN ON)

add_subdirectory(${CESIUM_NATIVE_DIR} cesium-native EXCLUDE_FROM_ALL)

# cesium-native exports GLM_FORCE_INTRINSICS, GLM_FORCE_XYZW_ONLY and GLM_FORCE_EXPLICIT_CTOR as
# PUBLIC defines. The plugin relies on implicit glm conversions (dvec4->dvec3, fmat->dmat) and on
# constexpr glm (lost if INTRINSICS is on without XYZW_ONLY). Its desktop SCons build compiles the
# plugin with none of them, so strip them from the consumer-facing (INTERFACE) definitions only;
# cesium-native itself is compiled exactly as upstream. Type layouts are unaffected
# (no GLM_FORCE_DEFAULT_ALIGNED_GENTYPES; XYZW_ONLY only removes same-type union aliases).
set(CESIUM_TARGETS Cesium3DTiles Cesium3DTilesSelection CesiumRasterOverlays Cesium3DTilesContent
  Cesium3DTilesReader Cesium3DTilesWriter CesiumGltfContent CesiumGltfReader CesiumGltfWriter CesiumGltf
  CesiumAsync CesiumJsonReader CesiumJsonWriter CesiumGeospatial CesiumGeometry
  CesiumQuantizedMeshTerrain CesiumUtility CesiumClientCommon CesiumIonClient CesiumITwinClient CesiumVectorData)
foreach(t ${CESIUM_TARGETS})
  if(TARGET ${t})
    get_target_property(defs ${t} INTERFACE_COMPILE_DEFINITIONS)
    if(defs)
      list(REMOVE_ITEM defs GLM_FORCE_INTRINSICS GLM_FORCE_XYZW_ONLY GLM_FORCE_EXPLICIT_CTOR)
      set_target_properties(${t} PROPERTIES INTERFACE_COMPILE_DEFINITIONS "${defs}")
    endif()
  endif()
endforeach()

set(LITEHTML_BUILD_TESTING OFF CACHE BOOL "" FORCE)
add_subdirectory(${LITEHTML_DIR} litehtml EXCLUDE_FROM_ALL)

set(S "${PLUGIN_SRC}/cesium_godot")
file(GLOB AUX_SOURCES "${PLUGIN_SRC}/cesium_auxiliars/*.cpp")
# Same list as the plugin's cesium_godot/SCsub
set(PLUGIN_SOURCES
  ${S}/register_types.cpp
  ${S}/Models/CesiumGDTileset.cpp
  ${S}/Models/GeoreferencedNode.cpp
  ${S}/Models/Cesium3DTile.cpp
  ${S}/Models/TileMetadata.cpp
  ${S}/Models/CesiumGDPanel.cpp
  ${S}/Models/CesiumGDRasterOverlay.cpp
  ${S}/Models/CesiumGlobe.cpp
  ${S}/Models/CesiumGDConfig.cpp
  ${S}/Models/CesiumHTTPRequestNode.cpp
  ${S}/Models/CesiumGDCreditSystem.cpp
  ${S}/Models/CesiumPropertyInfo.cpp
  ${S}/Implementations/NetworkAssetAccessor.cpp
  ${S}/Implementations/DocumentContainer.cpp
  ${S}/Implementations/GodotPrepareRenderResources.cpp
  ${S}/CesiumGDModelLoader.cpp
  ${S}/Utils/CesiumGDTextureLoader.cpp
  ${S}/Utils/CesiumDebugUtils.cpp
  ${S}/Utils/AssetManipulation.cpp
  ${S}/Utils/CesiumGDAssetBuilder.cpp
  ${S}/Utils/TokenTroubleShooting.cpp
  ${AUX_SOURCES}
)

if(NOT DEFINED GODOT_ARCH)
  set(GODOT_ARCH x86_64)
endif()
if(ANDROID)
  set(GD_PLATFORM android)
else()
  # Desktop Linux variant, only used to verify the same code path under the fork's 4.5 editor.
  set(GD_PLATFORM linux)
endif()
set(LIB_NAME "Godot3DTiles.${GD_PLATFORM}.template_release.${GODOT_ARCH}")
add_library(godot3dtiles SHARED ${PLUGIN_SOURCES})
set_target_properties(godot3dtiles PROPERTIES OUTPUT_NAME "${LIB_NAME}" PREFIX "lib")
target_compile_features(godot3dtiles PRIVATE cxx_std_20)
target_compile_options(godot3dtiles PRIVATE -fexceptions -fPIC -Wno-everything)
target_compile_definitions(godot3dtiles PRIVATE
  CESIUM_GD_EXT _HAS_EXCEPTIONS=1 SPDLOG_NO_EXCEPTIONS LIBASYNC_NO_EXCEPTIONS
  UNIX_ENABLED NDEBUG SQLITE_STATIC)
if(ANDROID)
  target_compile_definitions(godot3dtiles PRIVATE ANDROID_ENABLED)
else()
  # Use the plugin's GodotHttpClient (as on Android/macOS) instead of libcurl.
  target_compile_definitions(godot3dtiles PRIVATE LINUXBSD_ENABLED CESIUM_GD_USE_GODOT_HTTP)
  # cesium-native builds with -Werror; host gcc 15 may warn where the pinned CI compilers did not.
  foreach(t ${CESIUM_TARGETS})
    if(TARGET ${t})
      target_compile_options(${t} PRIVATE -Wno-error)
    endif()
  endforeach()
endif()
target_include_directories(godot3dtiles PRIVATE
  ${S} ${PLUGIN_SRC}/cesium_auxiliars
  ${GODOT_CPP_DIR}/include ${GODOT_CPP_DIR}/gen/include ${GODOT_CPP_DIR}/gdextension
  ${LITEHTML_DIR}/include)

find_package(uriparser CONFIG REQUIRED)
target_link_libraries(godot3dtiles PRIVATE
  Cesium3DTilesSelection CesiumRasterOverlays Cesium3DTilesContent Cesium3DTilesReader
  CesiumGltfContent CesiumGltfReader CesiumGltf CesiumAsync CesiumJsonReader CesiumJsonWriter
  CesiumGeospatial CesiumGeometry CesiumQuantizedMeshTerrain CesiumUtility
  litehtml
  uriparser::uriparser
  ${GODOT_CPP_LIB})
if(ANDROID)
  target_link_libraries(godot3dtiles PRIVATE log android)
else()
  target_link_libraries(godot3dtiles PRIVATE pthread dl)
endif()
# libc++ is linked statically (ANDROID_STL=c++_static; the GDExtension boundary is a C API).
# Export only the entry symbol and bind internal references locally, so the bundled copies of
# zstd/libwebp/libjpeg/sqlite/openssl/abseil can never interpose with (or be interposed by)
# symbols exported by the embedded libgodot.so. Fail on unresolved symbols at link time.
# 16 KB page alignment for Android 15+ devices.
target_link_options(godot3dtiles PRIVATE
  -Wl,--version-script=${CMAKE_CURRENT_SOURCE_DIR}/exports.map -Wl,-Bsymbolic -Wl,--exclude-libs,ALL
  -Wl,--no-undefined -Wl,--gc-sections -Wl,-z,max-page-size=16384)
set_property(TARGET godot3dtiles APPEND PROPERTY LINK_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/exports.map)
