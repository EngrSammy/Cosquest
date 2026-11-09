// The CostQuest game module, implemented in TypeScript for the React Native
// game (every platform). Same functions and events as the
// iOS native module (ios/Embed/CostQuestGameModule.swift), so the shell
// (components/world) and GameBridge cannot tell which game is behind them.
//
// The native Android module (android/, Kotlin) still supplies what only the
// platform knows: RAM for the prewarm policy, and the gesture-exclusion, NFC and speech helpers.
import { parsePlayUrl } from "@/features/world/deepLink";
import type { GameTarget } from "@/features/world/deepLink";
import { parseCoinsReturn } from "@/features/game/coins";
import { gameStore, startLocation, stopLocation } from "@/features/game/runtime";

import type { CostQuestGameModule, GameEvents } from "./index";

type Listener = (event: never) => void;

export type NativeHelpers = {
  physicalMemory?: number;
} | null;

const listeners = new Map<keyof GameEvents, Set<Listener>>();

/** Raise one of the module's events (the game's screens: share a point, back to chat). */
export function emitGameEvent<K extends keyof GameEvents>(event: K, payload: Parameters<GameEvents[K]>[0]) {
  listeners.get(event)?.forEach((listener) => {
    try {
      (listener as (p: typeof payload) => void)(payload);
    } catch (error) {
      console.warn(`[game] ${event} listener failed`, error);
    }
  });
}

const emit = emitGameEvent;

/** The chat's session token, as the shell last gave it (for the native venue Events: ./index.ts openVenueEvents). */
let chatToken: string | null = null;
export const currentChatToken = () => chatToken;

export function createRnGame(native: NativeHelpers): CostQuestGameModule {
  let readySent = false;

  // The world is standing once the basics and the first points are in.
  gameStore.subscribe(() => {
    const s = gameStore.get();
    if (s.ready && !readySent) {
      readySent = true;
      emit("onReady", { playerKey: s.session?.playerKey ?? null });
    }
  });

  const open = async (target: GameTarget) => {
    gameStore.setFocus({
      pointId: target.shrineId,
      raidId: target.raidId,
      duelId: target.duelId,
      lat: target.lat,
      lng: target.lng,
      place: target.place,
    });
  };

  return {
    available: true,
    physicalMemory: native?.physicalMemory,

    async prewarm() {
      // Build the world quietly: last-known fix, basics, ground. No prompt.
      await startLocation(false);
      stopLocation();
    },
    async pause() {
      gameStore.pause();
      stopLocation();
    },
    async resume() {
      gameStore.resume();
      await startLocation(true);
    },
    open,
    async setSession(token: string | null) {
      chatToken = token;
      await gameStore.setSession(token);
      const s = gameStore.get();
      if (token && s.session) {
        emit("onSession", {
          playerKey: s.session.playerKey,
          created: s.session.created,
          handle: s.profile?.handle ?? s.me?.handle ?? null,
          faction: s.me?.faction ?? null,
        });
      }
      // No account player (one login refused or down): the shell shows it
      // over the game (SsoProblemPanel reads the store); this is for the log.
      if (token && s.ssoProblem) emit("onError", { code: `sso_${s.ssoProblem.kind}`, message: s.ssoProblem.message });
    },
    // The RN game draws the chat bubble and the call bar from the store
    // itself (components/world); nothing to keep here.
    async setUnread() {},
    async setCallPill() {},
    async handleURL(url: string) {
      // cosquest://coins?order=...: back from Stripe's checkout (CoinsModel.handle).
      const coins = parseCoinsReturn(url);
      if (coins) {
        const { handleCoinsReturn } = await import("@/components/game/coinsModel");
        await handleCoinsReturn({ order: coins.order ?? undefined, result: coins.result ?? undefined });
        return;
      }
      const link = parsePlayUrl(url);
      if (link?.target) await open(link.target);
    },
    async reset() {
      readySent = false;
      await gameStore.setSession(null);
    },
    addListener(event, listener) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(listener as Listener);
      return { remove: () => set?.delete(listener as Listener) };
    },
  };
}
