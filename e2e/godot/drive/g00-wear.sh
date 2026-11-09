# cq 061 setup (adb driver): wear the first Forge hero (Armstrong in the rig)
# so the 3D fight's hero is the player's real Forge character.
source "$(dirname "$0")/../../forge/drive/lib.sh"
prep || exit 1
tap $HUD_CHIP "HUD chip: Forge bag"; wait_s 4
tap $BAG_AVATAR "Avatar tab"; wait_s 20
shot g00-1-avatar
tap $BAG_WEAR "Wear"; wait_s 3; shot g00-2-worn
tap $BAG_CLOSE "close the bag"; wait_s 4
shot g00-3-map
alive
