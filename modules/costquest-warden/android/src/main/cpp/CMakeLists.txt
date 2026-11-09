# The mote engine for Android: the same C iOS links (costquest-game/ios/Game/Engine,
# a verbatim copy of the mote project's src, never edited here) plus warden_jni.c.
cmake_minimum_required(VERSION 3.22.1)
project(costquest_warden C)

set(ENGINE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../../../../costquest-game/ios/Game/Engine)
file(GLOB ENGINE_SOURCES ${ENGINE_DIR}/*.c)

add_library(costquest_warden SHARED warden_jni.c ${ENGINE_SOURCES})
target_include_directories(costquest_warden PRIVATE ${ENGINE_DIR})
set_target_properties(costquest_warden PROPERTIES C_STANDARD 11 C_STANDARD_REQUIRED ON)
# -O3 always (see build.gradle). MOTE_RESERVE_CORES=1 as on iOS: one core stays
# with the UI thread. NEON is baseline on arm64-v8a; the dot-product path
# (__ARM_FEATURE_DOTPROD) is NOT enabled, because not every arm64 phone has it
# and the engine selects it at compile time. x86_64 (emulators) uses the
# engine's portable C path.
target_compile_options(costquest_warden PRIVATE -O3 -fvisibility=hidden -Wno-unused-parameter)
target_compile_definitions(costquest_warden PRIVATE MOTE_RESERVE_CORES=1)
find_library(log-lib log)
target_link_libraries(costquest_warden ${log-lib} m)
