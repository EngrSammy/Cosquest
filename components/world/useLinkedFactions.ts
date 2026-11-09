// F-08 behind EXPO_PUBLIC_LINKED_FACTIONS (task 059): keeps the chat faction
// and the game realm in step in the direction the flag names
// (features/world/factionLink.ts). Off by default: nothing happens.
// Mounted by GameBridge. Only for the React Native game (the native iOS
// fallback game keeps its own first run).
import { useEffect, useRef } from "react";

import { gameStore, useGame } from "@/features/game/runtime";
import { linkAction, resolveLinkMode } from "@/features/world/factionLink";
import { gamePlayable } from "@/modules/costquest-game/src";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { updateAuthUser } from "@/store/slices/authSlice";
import { saveUserFaction } from "@/store/thunks/userThunks";

const MODE = resolveLinkMode(process.env.EXPO_PUBLIC_LINKED_FACTIONS);

export function useLinkedFactions() {
  const dispatch = useAppDispatch();
  const token = useAppSelector((s) => s.auth.token);
  const email = useAppSelector((s) => (s.auth.user as any)?.email ?? "");
  const chatFaction = useAppSelector((s) => (s.auth.user as any)?.faction ?? null) as string | null;
  const gameRealm = useGame((s) => s.me?.faction ?? null);
  const gameLoaded = useGame((s) => s.me !== null);
  const busy = useRef(false);

  useEffect(() => {
    if (MODE === "off" || !gamePlayable || !token || !gameLoaded || busy.current) return;
    const action = linkAction(MODE, chatFaction, gameRealm);
    if (!action) return;
    busy.current = true;
    void (async () => {
      try {
        if ("joinRealm" in action) {
          await gameStore.chooseFaction(action.joinRealm);
        } else {
          await dispatch(saveUserFaction({ email, factionKey: action.setChatFaction, token })).unwrap();
          dispatch(updateAuthUser({ faction: action.setChatFaction } as any));
        }
      } catch {
        // A faction change cooldown or an offline moment: try again next time.
      } finally {
        busy.current = false;
      }
    })();
  }, [chatFaction, dispatch, email, gameLoaded, gameRealm, token]);
}
