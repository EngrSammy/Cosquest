// cosquest://play?raid=<id>&place=...  (and shrine= / duel= / lat=&lng=)
// A link into the game from anywhere outside the app. It hands the spot to
// the world (features/world/worldState.ts) and gets out of the way: the
// world pager swipes to the game once it is on screen, so a link opened
// before sign-in still lands after it. Rendered as a transparent modal with
// no animation, so nothing flashes.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";

import { parsePlayUrl, urlFromParams } from "@/features/world/deepLink";
import { world } from "@/features/world/worldState";
import { store } from "@/store/store";

export default function PlayLink() {
  const params = useLocalSearchParams();

  useEffect(() => {
    const link = parsePlayUrl(urlFromParams("play", params));
    if (link) world.openGame(link.target);
    if (router.canDismiss()) {
      // Back to the tabs, past any chat screen on top: the game sits behind
      // them and only opens once they are on screen (as joinInvite does).
      // router.back() alone left an open chat covering the game.
      router.dismissAll();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      // Opened cold: the splash decides between the app and sign-in.
      router.replace(store.getState().auth.token ? "/home" : "/");
    }
    // Once, for the link that opened this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
