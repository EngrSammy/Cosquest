# Helpers for the Forge proof's adb drivers (cq 056). Sourced by the drivers
# journey.sh runs for *.sh "flows". Coordinates are for the journeys' AVD
# (1080x2400, 420 dpi); every step leaves a screenshot in $SHOTS.
set -uo pipefail
APP=com.dammy0227.cosquest
DRIVE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$SHOTS"
say() { echo "$(date -u +%T) $*"; }
tap() { say "tap $1 $2${3:+ ($3)}"; adb shell input tap "$1" "$2"; }
shot() { adb exec-out screencap -p > "$SHOTS/$1.png"; say "shot $1"; }
wait_s() { sleep "$1"; }
link() { say "link $1"; adb shell am start -a android.intent.action.VIEW -d "$1" "$APP" >/dev/null; }
# The map, ready: the app up, the game page, the Warden's cards put away
# (plain UI, so Maestro does it).
prep() {
  "$MAESTRO" test ${ANDROID_SERIAL:+--device "$ANDROID_SERIAL"} "$DRIVE/prep.yaml" > "$SHOTS/prep.log" 2>&1 || { say "prep failed"; tail -5 "$SHOTS/prep.log"; return 1; }
}
# Did the app die (low memory, a native abort)?
alive() { adb shell pidof "$APP" >/dev/null || { say "APP NOT RUNNING"; adb logcat -d | grep -E "lowmemorykiller: Kill '$APP|F libc|E Filament" | tail -5; return 1; }; }

# Screen spots (1080x2400)
HUD_CHIP="180 366"
BAG_ITEMS="154 485"; BAG_AVATAR="382 485"; BAG_CLOSE="976 362"
BAG_IDLE="192 1336"; BAG_WALK="371 1336"; BAG_CELEBRATE="599 1336"; BAG_WEAR="852 1336"; BAG_EQUIP="540 1336"
BAG_TILE2="467 1594"
MAP_ME="540 1310"
CLAIM_MAIN="540 1758"; CLAIM_OPEN_BAG="540 1923"; CLAIM_CLOSE_WON="540 2046"
SHEET_PLAY="771 2139"

# cq 076: find buttons by their words, and check what is on screen, so a
# moved button or a wrong screen fails the step instead of passing it.
# Only for plain RN screens: over a live 3D view uiautomator may not settle.
ui_dump() { timeout 40 adb exec-out uiautomator dump /dev/tty 2>/dev/null | sed 's/UI hierchary dumped.*//'; }
# ui_find "<words>": "x y" of the centre of the node whose text or
# content-desc is exactly <words> (accessibility labels may add after a
# comma), nothing when it is not on screen.
ui_find() {
  ui_dump | python3 -c '
import re, sys, xml.etree.ElementTree as ET
want = sys.argv[1]
try: root = ET.fromstring(sys.stdin.read())
except Exception: sys.exit(0)
for n in root.iter("node"):
    for v in (n.get("text") or "", n.get("content-desc") or ""):
        if v == want or v.split(",")[0].strip() == want:
            b = re.findall(r"\d+", n.get("bounds") or "")
            if len(b) == 4:
                x1, y1, x2, y2 = map(int, b); print((x1 + x2) // 2, (y1 + y2) // 2); sys.exit(0)
' "$1"
}
# tap_label "<words>" [x y]: tap it by its words; the spot is the fallback.
tap_label() {
  local xy; xy=$(ui_find "$1")
  if [ -n "$xy" ]; then tap ${xy% *} ${xy#* } "$1"
  elif [ $# -ge 3 ]; then say "label '$1' not found, tapping the spot"; tap "$2" "$3" "$1"
  else say "FAIL: no '$1' on screen"; return 1; fi
}
# expect "<text>" / expect_not "<text>": the screen (all node text and
# labels) contains it / does not; a FAIL line and status 1 otherwise.
expect() { ui_dump | grep -qF -- "$1" && say "ok: '$1' on screen" || { say "FAIL: expected '$1' on screen"; return 1; }; }
expect_not() { ui_dump | grep -qF -- "$1" && { say "FAIL: '$1' should not be on screen"; return 1; } || say "ok: no '$1'"; }
