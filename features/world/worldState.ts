// The world's small shared state: which page is showing, what the game was
// asked to open, whether the swipe has been taught. A tiny external store
// (like components/calls/callUi.ts), so the pager, the chat's invite cards,
// deep links and the game bridge all agree without prop-drilling.
// Pure: no React Native imports (the hook lives in components/world/useWorld.ts).
import type { GameTarget } from "./deepLink.ts";

export type WorldState = {
  /** Where the pager has settled. */
  page: "chat" | "game";
  /** The game has been mounted (prewarmed or opened). */
  gameMounted: boolean;
  /** The game said its world is standing (onReady). */
  gameReady: boolean;
  /**
   * Waiting for the pager: swipe to the game (at this spot, if any). Kept
   * until the pager takes it, so a link that arrives before login, or a Join
   * tapped inside a pushed chat screen, still lands once the pager is up.
   */
  pendingOpen: { target: GameTarget | null } | null;
  /** Bumped by every open request, so the pager reacts even to the same spot. */
  openSerial: number;
  /** Waiting for the pager: back to the chat (and into this conversation). */
  pendingClose: { chatId: string | null } | null;
  closeSerial: number;
  /** The veil colour (the player's faction), once known. */
  factionColor: string | null;
  /**
   * A full-screen game screen is up (a quiz, a fight, a reward, the first
   * run), not the map: the Chats bubble tucks in to keep off its content.
   */
  gameFocus: boolean;
};

const INITIAL: WorldState = {
  page: "chat",
  gameMounted: false,
  gameReady: false,
  pendingOpen: null,
  openSerial: 0,
  pendingClose: null,
  closeSerial: 0,
  factionColor: null,
  gameFocus: false,
};

export function createWorldStore(initial?: Partial<WorldState>) {
  let state: WorldState = { ...INITIAL, ...initial };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<WorldState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  return {
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Swipe to the game (optionally opening a spot there). */
    openGame(target: GameTarget | null = null) {
      set({
        pendingOpen: { target },
        pendingClose: null,
        openSerial: state.openSerial + 1,
        gameMounted: true,
      });
    },
    /** Swipe back to the chat (optionally into one conversation). */
    openChat(chatId: string | null = null) {
      set({ pendingClose: { chatId }, pendingOpen: null, closeSerial: state.closeSerial + 1 });
    },
    /** The pager takes the open request (once). */
    takeOpen(): { target: GameTarget | null } | null {
      const request = state.pendingOpen;
      if (request) set({ pendingOpen: null });
      return request;
    },
    /** The pager takes the back-to-chat request (once). */
    takeClose(): { chatId: string | null } | null {
      const request = state.pendingClose;
      if (request) set({ pendingClose: null });
      return request;
    },
    settled(page: "chat" | "game") {
      if (state.page !== page) set({ page });
    },
    mountGame() {
      if (!state.gameMounted) set({ gameMounted: true });
    },
    markGameReady() {
      if (!state.gameReady) set({ gameReady: true });
    },
    setFactionColor(color: string | null) {
      if (state.factionColor !== color) set({ factionColor: color });
    },
    setGameFocus(focus: boolean) {
      if (state.gameFocus !== focus) set({ gameFocus: focus });
    },
    /**
     * Sign-out: forget everything but the serials (they only ever grow) and
     * whether the game's world is standing: the native game outlives a
     * sign-out (it only drops the player) and reports ready once per run.
     */
    reset() {
      set({
        ...INITIAL,
        gameReady: state.gameReady,
        openSerial: state.openSerial,
        closeSerial: state.closeSerial,
      });
    },
  };
}

export type WorldStore = ReturnType<typeof createWorldStore>;

/** The app's one world. */
export const world = createWorldStore();

/** The game's faction colours (costquest-ios Roam/RoamStyle.swift realmColor). */
export const GAME_FACTION_COLORS: Record<string, string> = {
  anime: "#FF5C99",
  marvel: "#E33636",
  dc: "#2973ED",
  movies: "#F59E21",
  gaming: "#33C773",
};

/**
 * The deck's faction colours: one set for the reach ring, the puck, territory,
 * badges and the fight's ground ring ("Sunlit Real Places" 2.7; the clashing
 * pairs pulled apart: Icons off Controllers' blue, Everborn off Ascendants' magenta).
 */
export const CHAT_FACTION_COLORS: Record<string, string> = {
  ascendants: "#D633A8",
  icons: "#7C5CF0",
  controllers: "#2D6ED2",
  blockbusters: "#C8D800",
  everborn: "#F03A5F",
  everborns: "#F03A5F",
  celestials: "#35B9E6",
};

/** The game's realm -> the deck faction it belongs to (features/world/factionLink.ts GAME_TO_CHAT). */
const REALM_TO_DECK: Record<string, string> = {
  anime: "ascendants",
  marvel: "icons",
  dc: "icons",
  gaming: "controllers",
  movies: "blockbusters",
};

/**
 * The veil colour, and the player's colour on the map: the deck (chat) faction
 * first, else the deck faction the game realm belongs to, else the Sky accent.
 * Realm colours stay on quiz and codex chips; they never tint the map.
 */
export function factionVeilColor(gameFaction?: string | null, chatFaction?: string | null): string {
  if (chatFaction && CHAT_FACTION_COLORS[chatFaction]) return CHAT_FACTION_COLORS[chatFaction];
  const deck = gameFaction ? REALM_TO_DECK[gameFaction] : undefined;
  if (deck) return CHAT_FACTION_COLORS[deck];
  return "#1F7FC2";
}
