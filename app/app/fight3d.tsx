// cosquest://fight3d?mode=full|arena|chars&cycle=N&ms=8000&autoplay=1&keep=0|1&tiles=<url>&tlat=&tlon=&talt=&tground=0|1&tsse=&torigin=0|1&trotx=&selfcycle=N&look=post|glow,grade|-bloom
// Test builds only (EXPO_PUBLIC_GAME3D=1): opens the 3D fight (cq 061) with no
// point, in a given mode, once or N times for the leak test. Like
// cosquest://play, it hands the request to the game and gets out of the way;
// the game root opens it once the game is on screen. With the flag off it
// does nothing.
//   adb shell am start -a android.intent.action.VIEW -d "cosquest://fight3d?mode=arena\&cycle=10\&ms=8000"
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";

import { lookFromParam, runFromParams } from "@/features/game3d/fight3d";
import { FIGHT3D, fight3dAvailable } from "@/features/game3d/flags";
import { requestFight3D } from "@/features/game3d/request";
import { world } from "@/features/world/worldState";
import { store } from "@/store/store";

export default function Fight3DLink() {
  const params = useLocalSearchParams();

  useEffect(() => {
    if (fight3dAvailable()) {
      // Test knobs over the build's env (measurements without a rebuild).
      const one = (k: string) => (Array.isArray(params[k]) ? params[k][0] : params[k]) as string | undefined;
      const flags = FIGHT3D as { keep: boolean; tilesUrl: string };
      if (one("keep") !== undefined) flags.keep = one("keep") === "1";
      if (one("statusspam") !== undefined) (flags as { statusSpam?: number }).statusSpam = Number(one("statusspam")) || 0;
      if (one("selfcycle") !== undefined) (flags as { selfCycle?: number }).selfCycle = Number(one("selfcycle")) || 0;
      // Every link sets the look switches afresh (none: the shipped look).
      (flags as { look?: Record<string, boolean> | null }).look = lookFromParam(one("look"));
      // The arena's place on the tileset as tlat/tlon/talt (a "#" in a link is cut off).
      if (one("tiles") !== undefined) {
        const at = one("tlat") !== undefined && one("tlon") !== undefined ? `#${[one("tlat"), one("tlon"), one("talt") ?? 0, one("tground"), one("tsse"), one("torigin"), one("trotx")].filter((v) => v !== undefined).join(",")}` : "";
        flags.tilesUrl = `${one("tiles") ?? ""}${at}`;
      }
      requestFight3D(runFromParams(params, FIGHT3D));
      world.openGame(null);
    }
    if (router.canDismiss()) router.dismissAll();
    else if (router.canGoBack()) router.back();
    else router.replace(store.getState().auth.token ? "/home" : "/");
    // Once, for the link that opened this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
