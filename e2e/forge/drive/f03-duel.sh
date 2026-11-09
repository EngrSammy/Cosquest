# Forge drop-in proof 3/4 (adb driver): a Guardian duel with the equipped
# Forge weapon. The versus card shows the weapon (and a Forge Guardian when
# the server picked one); the server fights with the weapon's class and a
# damage-based attack modifier. Strikes are taps on the arena.
source "$(dirname "$0")/lib.sh"
prep || exit 1
link "cosquest://play?duel=XD-trafalgar-duel"; wait_s 8
shot f03-1-point
# battle-3d-only: the point's Fight opens the 3D fight directly; an autoplay
# build (EXPO_PUBLIC_GAME3D_AUTOPLAY=1) fights by itself.
tap $SHEET_PLAY "Fight (point sheet)"; wait_s 2
shot f03-2-card
expect_not "Fight (3D)" || exit 1
for i in 1 2 3 4 5 6 7 8 9 10; do sleep 6; shot "f03-3-fight-$i"; done
wait_s 20
shot f03-5-result
alive || exit 1
# The server judged this fight: no "practice" anywhere.
expect_not "practice" || exit 1
tap_label "Back to the map" 540 1436; wait_s 4
alive
