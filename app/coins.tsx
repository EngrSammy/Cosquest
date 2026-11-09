// cosquest://coins?order=...  The way back from Stripe's hosted checkout
// for the game's CosCoins (costquest-ios CoinsModel). The game handles it.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";

import { urlFromParams } from "@/features/world/deepLink";
import { callGame } from "@/modules/costquest-game/src";
import { store } from "@/store/store";

export default function CoinsReturn() {
  const params = useLocalSearchParams();

  useEffect(() => {
    callGame("handleURL", urlFromParams("coins", params));
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(store.getState().auth.token ? "/home" : "/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
