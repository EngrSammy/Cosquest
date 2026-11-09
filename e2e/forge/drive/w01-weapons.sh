# cq 234 (adb driver): weapons on every Forge screen. The bag's Items (with
# the catalogue link on: the starter set after what you own, no placeholder),
# a starter weapon held, the Avatar list (each hero with its weapon in hand),
# a worn hero on the map chip. Screenshots only; the 3D views are judged by eye.
source "$(dirname "$0")/lib.sh"
prep || exit 1
shot w01-1-map
tap $HUD_CHIP "HUD chip: Forge bag"; wait_s 6
tap $BAG_ITEMS "Items tab"; wait_s 12
shot w01-2-items
tap $BAG_TILE2 "second item"; wait_s 12
shot w01-3-item2
adb shell input swipe 540 2100 540 1650 400; wait_s 3
shot w01-4-items-scrolled
tap $BAG_EQUIP "Hold / Equip"; wait_s 4
shot w01-5-held
alive || exit 1
tap $BAG_AVATAR "Avatar tab"; wait_s 20
shot w01-6-avatar-1
for i in 2 3 4 5; do
  tap $(( 154 + (i - 1) % 4 * 228 )) 1594 "hero $i"; wait_s 15; shot "w01-7-avatar-$i"
done
tap $BAG_WALK "Walk"; wait_s 4; shot w01-8-walk
alive || exit 1
tap $BAG_CLOSE "close the bag"; wait_s 4
shot w01-9-map
alive
