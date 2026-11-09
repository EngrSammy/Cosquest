#!/usr/bin/env bash
#
# Type-checks the RN game's native iOS layer (ios/Embed: the module, the
# platform helpers, the islands, the Warden engine holder) on Linux, under
# Swift 6 with strict concurrency, against stand-ins for UIKit, SwiftUI,
# ExpoModulesCore, Speech, AVFoundation, CoreMotion, CoreNFC, ARKit and
# NearbyInteraction (ios/linux-check/stubs). The stand-ins copy the real
# signatures and actor isolation, so actor-isolation and Sendable mistakes
# show up here; it is not a build (only Xcode can say the code links against
# the real SDKs). VenueEventsIsland.swift and the Game/ sources are left out:
# they need the whole native game.
#
#   SWIFTC=~/swift/usr/bin/swiftc app/scripts/swift-stub-check.sh
#
# Passed on 2026-10-20 with Swift 6.1.2 (Linux); planted isolation errors
# were caught, so a pass means something.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EMBED="$APP_DIR/modules/costquest-game/ios/Embed"
STUBS="$APP_DIR/modules/costquest-game/ios/linux-check/stubs"
SWIFTC="${SWIFTC:-swiftc}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# The Embed files without their imports (the stubs stand in for them).
# LegacyDeviceKey needs Security: it is cut from GameHelpers.
for f in GameHelpers NativeIslands FriendBeaconIsland ShrineIsland CostQuestWardenModule CostQuestGameModule; do
  { echo "import Foundation"; grep -v '^import ' "$EMBED/$f.swift"; } > "$WORK/$f.swift"
done
python3 - "$WORK/GameHelpers.swift" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
open(p, "w").write(s[:s.index("// MARK: - The native game")])
PY
cp "$STUBS"/*.swift "$WORK/"

"$SWIFTC" -typecheck -swift-version 6 -strict-concurrency=complete "$WORK"/*.swift
echo "Embed type-checks (Swift 6, strict concurrency, stand-in SDKs)"
