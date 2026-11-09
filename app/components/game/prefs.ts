// The player's choices about the game itself, kept on the phone (costquest-ios
// UI/Preferences.swift: `haptics`, `worldClock`, `shrineAR`). Never sent to a server.
//
// Others honour the haptics choice by reading `hapticsOn()` before an impact,
// or by calling `impact` / `notify` / `selection` here, which do it for them:
//
//   import { hapticsOn } from "./prefs";
//   if (hapticsOn()) Haptics.impactAsync(...);
//
// The value is loaded once at start-up (on by default until it has been read,
// as on iOS, where UserDefaults answers at once).
import * as Haptics from "expo-haptics";
import { useSyncExternalStore } from "react";

import { arShrineDevFor } from "@/features/game/config";
import { isWorldClock, type WorldClock } from "@/features/game/mapStyle";
import { getPref, setPref } from "@/utils/prefsStorage";

const HAPTICS_PREF = "game.haptics";

let haptics = true;
const listeners = new Set<() => void>();
const notifyAll = () => listeners.forEach((l) => l());

getPref(HAPTICS_PREF)
  .then((v) => {
    if (v === "0" || v === "1") {
      haptics = v === "1";
      notifyAll();
    }
  })
  .catch(() => {});

/** Whether the player wants the phone to buzz. */
export function hapticsOn(): boolean {
  return haptics;
}

export function setHapticsOn(next: boolean) {
  haptics = next;
  setPref(HAPTICS_PREF, next ? "1" : "0").catch(() => {});
  notifyAll();
}

export function useHapticsOn(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    hapticsOn,
    hapticsOn,
  );
}

/** UIImpactFeedbackGenerator(style).impactOccurred(), unless haptics are off. */
export function impact(style: Haptics.ImpactFeedbackStyle) {
  if (haptics) Haptics.impactAsync(style).catch(() => {});
}

/** UINotificationFeedbackGenerator().notificationOccurred(type), unless haptics are off. */
export function notify(type: Haptics.NotificationFeedbackType) {
  if (haptics) Haptics.notificationAsync(type).catch(() => {});
}

/** UISelectionFeedbackGenerator().selectionChanged(), unless haptics are off. */
export function selection() {
  if (haptics) Haptics.selectionAsync().catch(() => {});
}

// ---------- Time in town (Preferences.worldClock) ----------

const WORLD_CLOCK_PREF = "game.worldClock";

let worldClock: WorldClock = "real";

getPref(WORLD_CLOCK_PREF)
  .then((v) => {
    if (isWorldClock(v)) {
      worldClock = v;
      notifyAll();
    }
  })
  .catch(() => {});

/** The hour the town is lit for: the phone's, or one the player fixed. */
export function worldClockNow(): WorldClock {
  return worldClock;
}

export function setWorldClock(next: WorldClock) {
  worldClock = next;
  setPref(WORLD_CLOCK_PREF, next).catch(() => {});
  notifyAll();
}

export function useWorldClock(): WorldClock {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    worldClockNow,
    worldClockNow,
  );
}

// ---------- The shrine through the camera (Preferences.shrineAR) ----------

const SHRINE_AR_PREF = "game.shrineAR";

/** Test builds only (features/game/config.ts arShrineDevFor): the AR shrine on by default and in More. */
export const AR_SHRINE_DEV = arShrineDevFor(process.env.EXPO_PUBLIC_AR_SHRINE, process.env.EXPO_PUBLIC_E2E);

/** Off by default, as on iOS: AR drains the battery and is awkward one-handed. On in a test build with AR_SHRINE_DEV. */
let shrineAR = AR_SHRINE_DEV;

getPref(SHRINE_AR_PREF)
  .then((v) => {
    if (v === "0" || v === "1") {
      shrineAR = v === "1";
      notifyAll();
    }
  })
  .catch(() => {});

export function shrineAROn(): boolean {
  return shrineAR;
}

export function setShrineAR(next: boolean) {
  shrineAR = next;
  setPref(SHRINE_AR_PREF, next ? "1" : "0").catch(() => {});
  notifyAll();
}

export function useShrineAR(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    shrineAROn,
    shrineAROn,
  );
}

// ---------- The AR reveal before a fight (features/game/reveal.ts) ----------

const FIGHT_REVEAL_PREF = "game.fightReveal";

/**
 * On by default: the reveal itself only happens on a phone that can do AR
 * (reveal.ts revealWanted), so "on" means on where it can be. One tap turns it
 * off in the reveal and in Profile; remembered on the phone, never sent.
 */
let fightReveal = true;

getPref(FIGHT_REVEAL_PREF)
  .then((v) => {
    if (v === "0" || v === "1") {
      fightReveal = v === "1";
      notifyAll();
    }
  })
  .catch(() => {});

export function fightRevealOn(): boolean {
  return fightReveal;
}

export function setFightReveal(next: boolean) {
  fightReveal = next;
  setPref(FIGHT_REVEAL_PREF, next ? "1" : "0").catch(() => {});
  notifyAll();
}

export function useFightReveal(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    fightRevealOn,
    fightRevealOn,
  );
}
