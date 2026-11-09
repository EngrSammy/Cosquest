// A test run of the 3D fight asked for from outside the game (cq 061): the
// dev link cosquest://fight3d?mode=arena&cycle=10&ms=8000&autoplay=1
// (app/fight3d.tsx) leaves it here and the game root opens it once the game
// is on screen, the way cosquest://play hands its spot to the world.
import { useSyncExternalStore } from "react";

import type { Fight3DRun } from "./fight3d";

let pending: Fight3DRun | null = null;
let serial = 0;
const listeners = new Set<() => void>();

export function requestFight3D(run: Fight3DRun) {
  pending = run;
  serial += 1;
  listeners.forEach((l) => l());
}

/** The waiting request, once. */
export function takeFight3DRequest(): Fight3DRun | null {
  const r = pending;
  pending = null;
  return r;
}

/** Changes each time a request arrives. */
export function useFight3DRequestSerial(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => serial,
    () => serial,
  );
}
