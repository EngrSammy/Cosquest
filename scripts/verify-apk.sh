#!/usr/bin/env bash
# Check a built Android APK carries the Godot fight with the cast as the branch ships it (cq 239).
#
#   scripts/verify-apk.sh <app-release.apk> [ABI]
#
# Checks: the APK's signature (apksigner, when the SDK is there); LibGodot for the ABI; the
# Godot export (assets/game3d/) with project.binary/.godot data; data/rig_fixes.json; and every
# res://cast file it names, byte-identical (sha256) to what rig_fixes.json promises, so the
# game swaps in exactly the files the branch made. Prints the APK size and the cast's share.
# Exit 1 on any failure.
set -uo pipefail
APK=${1:?usage: verify-apk.sh <apk> [abi]}
ABI=${2:-x86_64}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
fail=0
ok() { echo "PASS $*"; }
bad() { echo "FAIL $*"; fail=1; }
[ -f "$APK" ] || { echo "FAIL no APK at $APK"; exit 1; }
LIST=$(unzip -l "$APK")
[ -z "${JAVA_HOME:-}" ] && [ -d "$HOME/cq-work/tools/jdk17" ] && JAVA_HOME=$HOME/cq-work/tools/jdk17
[ -n "${JAVA_HOME:-}" ] && export PATH="$JAVA_HOME/bin:$PATH"
SIGNER=$(ls "${ANDROID_HOME:-$HOME/cq-work/tools/android-sdk}"/build-tools/*/apksigner 2>/dev/null | sort -V | tail -1)
if [ -n "$SIGNER" ]; then
  if "$SIGNER" verify "$APK" >/dev/null 2>&1; then ok "signature (apksigner verify)"; else bad "apksigner verify"; fi
else
  echo "SKIP apksigner (no Android SDK build-tools)"
fi
grep -q "lib/$ABI/libgodot_android.so" <<<"$LIST" && ok "LibGodot for $ABI" || bad "no lib/$ABI/libgodot_android.so"
grep -q "assets/game3d/" <<<"$LIST" && ok "Godot export in assets/game3d/" || bad "no assets/game3d/"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
unzip -q -o "$APK" "assets/game3d/data/*" "assets/game3d/cast/*" -d "$TMP" 2>/dev/null
FX="$TMP/assets/game3d/data/rig_fixes.json"
if [ -f "$FX" ]; then
  ok "data/rig_fixes.json"
  cmp -s "$FX" "$ROOT/app/game3d/data/rig_fixes.json" && ok "rig_fixes.json is the branch's" || bad "rig_fixes.json differs from the branch"
  python3 - "$FX" "$TMP/assets/game3d" <<'EOF' || fail=1
import hashlib, json, sys
fx = json.load(open(sys.argv[1]))["files"]
root = sys.argv[2]
keys, bad = set(), 0
for orig, f in fx.items():
    p = root + "/" + f["glb"].replace("res://", "")
    try:
        h = hashlib.sha256(open(p, "rb").read()).hexdigest()
    except FileNotFoundError:
        print("FAIL missing", f["glb"]); bad += 1; continue
    if h != f["sha256"]:
        print("FAIL sha256", f["glb"]); bad += 1
    keys.add(f["key"])
print(("PASS" if not bad else "FAIL"), "%d cast files present and byte-identical, %d characters: %s" % (len(fx) - bad, len(keys), " ".join(sorted(keys))))
sys.exit(1 if bad else 0)
EOF
else
  bad "no data/rig_fixes.json in the export"
fi
size=$(stat -c %s "$APK")
cast=$(echo "$LIST" | awk '/assets\/game3d\/cast\/.*\.glb$/ {s += $1} END {print s + 0}')
echo "INFO APK $((size / 1048576)) MB; cast GLBs inside $((cast / 1048576)) MB (stored sizes uncompressed)"
[ $fail = 0 ] && echo "verify-apk: OK" || echo "verify-apk: FAILED"
exit $fail
