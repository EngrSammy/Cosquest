#!/usr/bin/env bash
# Export the Godot 3D fight (game3d/) for the app, as react-native-godot loads it:
#   Android: a folder of files, godot-export/android/game3d/ (the config plugin
#            plugins/withGodot.js copies it to android/app/src/main/assets/game3d
#            at prebuild; Godot opens it with `--path /game3d`). Reading
#            files out of a .pck inside the APK is slow, so Android gets a folder.
#   iOS:     one pack, godot-export/ios/game3d.pck (added to the app bundle by
#            the plugin; opened with `--main-pack <bundle>/game3d.pck`).
#
#   scripts/godot-export.sh            # android and ios
#   scripts/godot-export.sh android    # one platform
#
# Env:
#   GODOT   the Godot 4.5 editor binary (the same LibGodot tag as the app:
#           4.5.1.migeran.2), default ~/cq-work/tools/libgodot/src/godot/bin/godot.linuxbsd.editor.x86_64
#   GODOT_TILES_LIBS  [~/cq-work/game-godot/out-tiles] <abi>/libGodot3DTiles.android.*.so
#           from game3d/tools/tiles-android/ (optional; without them the
#           fight runs and the tiles layer reports itself unavailable)
#   PROJECT [game3d] the Godot project folder (needs export presets named
#           "Android" and "iOS"; --export-pack needs no export templates)
#
# Run `npx expo prebuild` (or scripts/android-emulator-build.sh) afterwards so
# the new export is copied into the native project. godot-export/ is git-ignored.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${GODOT:=$HOME/cq-work/tools/libgodot/src/godot/bin/godot.linuxbsd.editor.x86_64}"
: "${PROJECT:=game3d}"
: "${GODOT_TILES_LIBS:=$HOME/cq-work/game-godot/out-tiles}"
# Absolute: Godot resolves export paths against the project folder.
OUT="$PWD/godot-export"
NAME=game3d

[ -x "$GODOT" ] || { echo "godot-export: no Godot editor at GODOT=$GODOT" >&2; exit 1; }
[ -f "$PROJECT/project.godot" ] || { echo "godot-export: no Godot project at $PROJECT/" >&2; exit 1; }
[ -f "$PROJECT/export_presets.cfg" ] || { echo "godot-export: $PROJECT/export_presets.cfg is missing (presets \"Android\" and \"iOS\")" >&2; exit 1; }

platforms=("$@")
[ ${#platforms[@]} -gt 0 ] || platforms=(android ios)

echo "== import $(date -u +%FT%TZ)"
# Twice, as the library's export_godot.sh does: the first run on a fresh
# checkout imports, the second settles resources that depend on imports.
"$GODOT" --headless --path "$PROJECT" --import
"$GODOT" --headless --path "$PROJECT" --import

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
for p in "${platforms[@]}"; do
  case "$p" in
    android)
      echo "== export android $(date -u +%FT%TZ)"
      "$GODOT" --headless --path "$PROJECT" --export-pack Android "$tmp/$NAME.zip"
      rm -rf "$OUT/android/$NAME"
      mkdir -p "$OUT/android/$NAME"
      unzip -q "$tmp/$NAME.zip" -d "$OUT/android/$NAME"
      echo "== $OUT/android/$NAME: $(du -sh "$OUT/android/$NAME" | cut -f1), $(find "$OUT/android/$NAME" -type f | wc -l) files"
      # GDExtension libraries (3D Tiles, game3d/tools/tiles-android/): staged per
      # ABI for jniLibs when GODOT_TILES_LIBS has them (not in git: 14 MB each).
      rm -rf "$OUT/android/jniLibs"
      for abi in x86_64 arm64-v8a; do
        so=$(ls "$GODOT_TILES_LIBS"/$abi/libGodot3DTiles.android.*.so 2>/dev/null | grep -v unstripped | head -1 || true)
        if [ -n "$so" ]; then
          mkdir -p "$OUT/android/jniLibs/$abi" && cp "$so" "$OUT/android/jniLibs/$abi/"
          echo "== 3D Tiles GDExtension for $abi: $(basename "$so") ($(du -h "$so" | cut -f1))"
        fi
      done
      ;;
    ios)
      echo "== export ios $(date -u +%FT%TZ)"
      mkdir -p "$OUT/ios"
      "$GODOT" --headless --path "$PROJECT" --export-pack iOS "$OUT/ios/$NAME.pck"
      echo "== $OUT/ios/$NAME.pck: $(du -sh "$OUT/ios/$NAME.pck" | cut -f1)"
      ;;
    *)
      echo "godot-export: unknown platform $p (android or ios)" >&2
      exit 2
      ;;
  esac
done
