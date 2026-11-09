# Forge drop-in proof 2/4 (adb driver): the phone stands on a Forge find (the
# proof walked it there); tap it, see it in 3D, claim it (the reward moment),
# equip it, see it on the HUD chip and in the bag.
source "$(dirname "$0")/lib.sh"
prep || exit 1
wait_s 8
shot f02-1-map-find
tap $MAP_ME "the find under the player"; wait_s 15
shot f02-2-find-3d
tap $CLAIM_MAIN "Claim"; wait_s 3; shot f02-3-claimed; wait_s 4; shot f02-4-claimed-celebrate
tap $CLAIM_MAIN "Equip it"; wait_s 4
shot f02-5-equipped-chip
tap $HUD_CHIP "HUD chip: Forge bag"; wait_s 4
tap $BAG_ITEMS "Items tab"; wait_s 12
shot f02-6-bag
alive || exit 1
tap $BAG_CLOSE "close the bag"; wait_s 3
alive
