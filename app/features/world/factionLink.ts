// F-08: one faction choice for both halves, behind a flag (task 059). The chat
// has six factions (constants/factions.ts), the game five realms
// (components/game/theme.ts realmColor). This maps between them; WHICH way
// (or whether at all) is Subomi and Mark's call: docs/polish/DECISIONS.md.
// Pure: no React Native imports (tested in features/world/__tests__).
//
//   EXPO_PUBLIC_LINKED_FACTIONS unset / "off"  two separate choices (today)
//   "chat"   the chat faction drives the game: a new player joins the mapped
//            realm without being asked (where the mapping is one-to-one)
//   "game"   the game realm drives the chat: joining a realm in the game sets
//            the chat faction it maps to

export type LinkMode = "off" | "chat" | "game";

export function resolveLinkMode(raw: string | null | undefined): LinkMode {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "chat" || v === "1" || v === "true") return "chat";
  if (v === "game") return "game";
  return "off";
}

/**
 * Chat faction -> the game realms it could be. One entry: a clean match.
 * Several: ambiguous (Comic Book Fans are Marvel or DC). None: the game has
 * no such realm (fantasy, sci-fi).
 */
export const CHAT_TO_GAME: Record<string, string[]> = {
  ascendants: ["anime"],
  icons: ["marvel", "dc"],
  controllers: ["gaming"],
  blockbusters: ["movies"],
  everborns: [],
  everborn: [],
  celestials: [],
};

/** Game realm -> chat faction (every realm has one). */
export const GAME_TO_CHAT: Record<string, string> = {
  anime: "ascendants",
  marvel: "icons",
  dc: "icons",
  gaming: "controllers",
  movies: "blockbusters",
};

/** The realm a chat faction puts a new player in, or null (ask them). */
export function gameRealmFor(chatFaction: string | null | undefined): string | null {
  const options = chatFaction ? CHAT_TO_GAME[chatFaction] ?? [] : [];
  return options.length === 1 ? options[0] : null;
}

/** The realms to offer first (highlight) when the mapping is not one-to-one. */
export function suggestedRealms(chatFaction: string | null | undefined): string[] {
  return chatFaction ? [...(CHAT_TO_GAME[chatFaction] ?? [])] : [];
}

export function chatFactionFor(gameRealm: string | null | undefined): string | null {
  return gameRealm ? GAME_TO_CHAT[gameRealm] ?? null : null;
}

/** What the link layer should do now, given both sides (null: nothing). */
export function linkAction(
  mode: LinkMode,
  chatFaction: string | null | undefined,
  gameRealm: string | null | undefined,
): { joinRealm: string } | { setChatFaction: string } | null {
  if (mode === "chat" && !gameRealm) {
    const realm = gameRealmFor(chatFaction);
    return realm ? { joinRealm: realm } : null;
  }
  if (mode === "game" && gameRealm) {
    const faction = chatFactionFor(gameRealm);
    return faction && faction !== chatFaction ? { setChatFaction: faction } : null;
  }
  return null;
}
