# Forge drop-in proof 4/4 (adb driver): a point the server dressed with a
# Forge station and a Forge environment (XQ-trafalgar-sequence in the
# Trafalgar test world) shows them, with your avatar, where the built-in
# shrine stood; a point it left plain (XQ-trafalgar-trivia) keeps its shrine.
source "$(dirname "$0")/lib.sh"
prep || exit 1
link "cosquest://play?shrine=XQ-trafalgar-sequence"; wait_s 8
shot f04-1-point-sheet
tap $SHEET_PLAY "Play"; wait_s 25
shot f04-2-station-scene; wait_s 5; shot f04-3-station-scene
alive || exit 1
tap 96 170 "Leave"; wait_s 5
link "cosquest://play?shrine=XQ-trafalgar-trivia"; wait_s 8
tap $SHEET_PLAY "Play"; wait_s 8
shot f04-4-plain-shrine
tap 96 170 "Leave"; wait_s 4
alive
