// The coins model wired to the game's one store (runtime.ts): one for the
// whole game, read through useSyncExternalStore. (features/game/coins.ts is
// the pure part; this is the glue, so it is not unit tested.)
//
// The way back from Stripe, `cosquest://coins?order=...&result=...`, lands in
// app/coins.tsx, which should call `handleCoinsReturn(params)` (see the notes).
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { useSyncExternalStore } from "react";

import { createCoinsStore, type CoinsState, regionFromLocale } from "@/features/game/coins";
import { gameStore, GAME_SERVER_IS_PRODUCTION } from "@/features/game/runtime";

import { notify } from "./prefs";
import { playSound } from "./sound";

function deviceRegion(): string {
  try {
    return regionFromLocale(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return "";
  }
}

export const coinsStore = createCoinsStore({
  client: gameStore.client,
  isProduction: GAME_SERVER_IS_PRODUCTION,
  deviceRegion,
  refreshMe: () => gameStore.refreshMe(),
  meCoins: () => gameStore.get().me?.coins ?? null,
  // CoinsModel.celebrate: success haptic and the coin sound, as the coins land.
  onCelebrate: () => {
    notify(Haptics.NotificationFeedbackType.Success);
    playSound("coin");
  },
});

// A sign-out or a different player: forget the last one's ledger at once.
let lastKey: string | null = null;
gameStore.subscribe(() => {
  const key = gameStore.get().session?.playerKey ?? null;
  if (key === lastKey) return;
  lastKey = key;
  coinsStore.reset();
});

export function useCoins(): CoinsState {
  return useSyncExternalStore(coinsStore.subscribe, coinsStore.get, coinsStore.get);
}

/**
 * Open Stripe's hosted checkout in the system browser (Safari View Controller
 * on iOS, a Custom Tab on Android: Apple Pay / Google Pay work there and the
 * player can see whose page they are on), then ask the server what happened
 * once it is closed.
 */
export async function openCheckout(url: string): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url, { dismissButtonStyle: "cancel", showTitle: true });
  } catch {
    // No browser: the order is still followed up below.
  }
  await coinsStore.checkoutClosed();
}

/** app/coins.tsx: the return link from Stripe (params as expo-router gives them). */
export async function handleCoinsReturn(params: Record<string, string | string[] | undefined>): Promise<void> {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  try {
    await WebBrowser.dismissBrowser();
  } catch {
    // Nothing was open.
  }
  await coinsStore.handleReturn({ order: one(params.order), result: one(params.result) });
}

