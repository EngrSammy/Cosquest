#!/usr/bin/env bash
#
# Compiles and runs the game's pure Swift on Linux (no Xcode): the voice
# answer matcher (Warden/VoiceAnswer.swift, its "Matching" section) and
# WardenCheck (Warden/WardenCheck.swift) and FixPolicy (Game/FixPolicy.swift), against the same vectors as the
# TypeScript tests (features/game/__tests__/voiceAnswer.test.ts and
# wardenCheck.test.ts, fixInfo.test.ts). Proves the two platforms agree; it is not a build of
# the app (UIKit, AVFoundation and Speech do not exist on Linux).
#
#   SWIFTC=~/swift/usr/bin/swiftc app/scripts/swift-linux-check.sh
#
# Needs a Swift 6 toolchain (swift.org's Linux tarball works).
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GAME="$APP_DIR/modules/costquest-game/ios/Game"
CHECK="$APP_DIR/modules/costquest-game/ios/linux-check"
SWIFTC="${SWIFTC:-swiftc}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# WardenStyle and WardenMoment, as they are in WardenVoice.swift.
{
  echo "import Foundation"
  awk '/^\/\/\/ How the Warden talks, from the player/{p=1} p{print} /var maxTokens: Int/{if(p){print "}"; exit}}' "$GAME/Warden/WardenVoice.swift"
} > "$WORK/Moment.swift"
cp "$GAME/Warden/WardenCheck.swift" "$WORK/"
# VoiceAnswer's matcher, lifted out of its @MainActor class.
python3 - "$GAME/Warden/VoiceAnswer.swift" "$WORK/VoiceMatch.swift" <<'PY'
import sys
s = open(sys.argv[1]).read()
body = s[s.index("    // MARK: - Matching"):].rstrip()
assert body.endswith("}")
open(sys.argv[2], "w").write("import Foundation\n\nenum VoiceAnswer {\n" + body[:-1] + "}\n")
PY
# FixPolicy (venue Events anti-cheat fields and need_location retry) and the
# WireValue it builds, as it is in Net/Wire.swift.
cp "$GAME/Game/FixPolicy.swift" "$WORK/"
{
  echo "import Foundation"
  awk '/^enum WireValue: Codable/{p=1} p{print} p&&/^}/{exit}' "$GAME/Net/Wire.swift"
} > "$WORK/WireValue.swift"
cp "$CHECK/main.swift" "$WORK/"

"$SWIFTC" -swift-version 6 -o "$WORK/check" "$WORK"/*.swift
"$WORK/check"
