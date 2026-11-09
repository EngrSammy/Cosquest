# cq 061 proof (adb driver), battle-3d-only: a map point's "Fight" opens the 3D
# fight directly (no briefing, no second button): the fight runs in Godot inside the app, played with the on-screen joystick,
# Attack and the WHIRL skill (raw touches on the phone's touchscreen, as a
# thumb would), then the result back in React Native on the reward screen.
source "$(dirname "$0")/../../forge/drive/lib.sh"
H="$(cd "$(dirname "$0")/.." && pwd)"
prep || exit 1
adb root >/dev/null 2>&1; sleep 2; adb wait-for-device; "$H/../emu.sh" tunnels
tmp=$(mktemp -d); python3 "$H/mkevents.py" "$tmp" >/dev/null
adb shell mkdir -p /data/local/tmp/cqlat; adb push "$tmp"/*.bin /data/local/tmp/cqlat/ >/dev/null
link "cosquest://play?duel=XD-trafalgar-duel"; wait_s 8
shot g01-1-point
tap 772 2142 "Fight (point sheet)"; wait_s 2
shot g01-2-card
for i in 1 2 3 4 5 6; do sleep 1.5; shot "g01-3-open-$i"; done
# Play: walk up to the Guardian, then strike; WHIRL whenever it is ready.
# Stop playing the moment Godot reports the end (the reward screen comes next;
# a stray tap there would dismiss it): the phone-side loop reads Godot's log.
adb logcat -c
adb shell "cd /data/local/tmp/cqlat; E=/dev/input/event2
  cat down.bin > \$E; sleep 0.1; cat up_push.bin > \$E; sleep 1.2; cat up.bin > \$E
  i=0; while [ \$i -lt 160 ]; do
    logcat -d -s godot -t 40 | grep -q 'CQ fight_end' && break
    if [ \$((i % 24)) = 3 ]; then cat skill_down.bin > \$E; sleep 0.1; cat up.bin > \$E; fi
    cat atk_down.bin > \$E; sleep 0.08; cat atk_up.bin > \$E; sleep 0.17
    if [ \$((i % 40)) = 20 ]; then cat down.bin > \$E; sleep 0.1; cat left_push.bin > \$E; sleep 0.4; cat up.bin > \$E; fi
    i=\$((i+1)); done" &
player=$!
n=0
while kill -0 $player 2>/dev/null && [ $n -lt 20 ]; do sleep 3; n=$((n+1)); shot "g01-4-fight-$n"; done
wait $player
wait_s 3
shot g01-5-result
alive || exit 1
wait_s 5; shot g01-6-reward
# The server judged the fight: its verdict and pay on the result screen, never "practice".
expect "Back to the map" || exit 1
expect_not "practice" || exit 1
say "godot: $(adb logcat -d -s godot | grep -o 'CQ fight_end.*' | tail -1)"
wait_s 4; tap_label "Back to the map" 540 2194; wait_s 4; shot g01-7-map
alive || exit 1
