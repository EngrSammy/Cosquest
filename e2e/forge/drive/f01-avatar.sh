# Forge drop-in proof 1/4 (adb driver): a Forge hero as your avatar, idle /
# walk / celebrate, worn on the HUD chip and the map marker.
source "$(dirname "$0")/lib.sh"
prep || exit 1
shot f01-1-map-chip
tap $HUD_CHIP "HUD chip: Forge bag"; wait_s 4
tap $BAG_AVATAR "Avatar tab"; wait_s 20
shot f01-2-avatar-idle
tap $BAG_WALK "Walk"; wait_s 4; shot f01-3-avatar-walk; wait_s 3
tap $BAG_CELEBRATE "Celebrate"; wait_s 1; shot f01-4-avatar-celebrate; wait_s 1; shot f01-4b-avatar-celebrate; wait_s 1; shot f01-4c-avatar-celebrate; wait_s 2
tap $BAG_TILE2 "the second hero"; wait_s 15; shot f01-5-second-hero
tap $BAG_WALK "Walk"; wait_s 4; shot f01-6-second-walk
tap $BAG_WEAR "Wear"; wait_s 3; shot f01-7-worn
alive || exit 1
tap $BAG_CLOSE "close the bag"; wait_s 4
shot f01-8-map-with-avatar
alive
