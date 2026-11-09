// Friends: added in person with a short code, friendship levels, gifts.
// The TypeScript twin of costquest-ios Features/FriendsFeature.swift
// (FriendsModel), against costquest-backend app/roam_social.py.
//
// Safety is the design, and the server holds all of it: a friend is added
// only by typing the code of a player standing beside you (the server checks
// the code is under 10 minutes old and that the adder is within 100 m of
// where it was made), there is no search, no request from afar, no chat, and
// no location ever crosses between friends. The phone shows what the server
// says; it judges nothing. The gift inside is the server's pick too.
//
// iOS's other way in, holding two phones together (/v1/roam/social/nearby),
// swaps device keys over a Bonjour/AWDL link with TLS-PSK and Nearby
// Interaction; Android has neither with an iPhone, so it is not here. The
// code works across both: either phone shows it, either phone types it.
//
// Pure: the client, the position and the clock are injected (tested in
// features/game/__tests__/friends.test.ts). The app's one model lives in
// friendsRuntime.ts.
import { type GameClient, GameError } from "./client.ts";
import type { LatLng } from "./geo.ts";
import type { RoamMe } from "./wire.ts";

// ---------- wire (roam_social.py) ----------

export type FriendEntry = {
  friend_key: string;
  handle: string;
  faction?: string | null;
  /** "Good" | "Great" | "Ultra" | "Best" (roam_social.LEVELS). */
  level_name: string;
  days: number;
  /** Interaction days for the next level; null at Best. */
  next_level_at?: number | null;
  can_gift_today: boolean;
  since: string;
};

export type FriendsPayload = { friends: FriendEntry[]; pending_gifts: number };

export type FriendCode = { code: string; expires_at: string; ttl_s: number };

export type FriendAdded = { added: boolean; already: boolean; friend_key: string; handle: string };

export type FriendGift = { from: string; item: string; name: string; added: number };

export type FriendClaim = { gifts: FriendGift[]; bag: Record<string, number>; names?: Record<string, string> | null };

/** roam_social.CODE_LEN: six letters, read aloud and typed off another phone. */
export const CODE_LEN = 6;

// ---------- calls ----------

/** Your friends. Signed: who you know is yours alone to read. */
export async function fetchFriends(client: GameClient): Promise<FriendsPayload> {
  const key = client.deviceKey();
  const got = await client.retrying(() =>
    client.request<FriendsPayload>("GET", "v1/roam/social/friends", { query: { device_key: key }, signed: true }),
  );
  return normaliseFriends(got);
}

/** A fresh code to show a friend standing beside you. Replaces any older one. */
export async function makeFriendCode(client: GameClient, here: LatLng): Promise<FriendCode> {
  return client.request("POST", "v1/roam/social/code", {
    body: { device_key: client.deviceKey(), lat: here.lat, lng: here.lng },
    signed: true,
  });
}

/** Add the player whose code this is. The server checks you are near where it was made. */
export async function addFriend(client: GameClient, code: string, here: LatLng): Promise<FriendAdded> {
  return client.request("POST", "v1/roam/social/add", {
    body: { device_key: client.deviceKey(), code, lat: here.lat, lng: here.lng },
    signed: true,
  });
}

/** One gift per friend per UTC day. The server picks what is inside. */
export async function sendGift(client: GameClient, friendKey: string): Promise<{ sent: boolean; friend_key?: string }> {
  return client.request("POST", "v1/roam/social/gift", {
    body: { device_key: client.deviceKey(), friend_key: friendKey },
    signed: true,
  });
}

/** Open every waiting gift into the item bag. */
export async function claimGifts(client: GameClient): Promise<FriendClaim> {
  const got = await client.request<FriendClaim>("POST", "v1/roam/social/claim", {
    body: { device_key: client.deviceKey() },
    signed: true,
  });
  return { ...got, gifts: Array.isArray(got.gifts) ? got.gifts : [], bag: got.bag ?? {} };
}

/** Missing fields read as nothing rather than breaking the list. */
export function normaliseFriends(raw: Partial<FriendsPayload> | null | undefined): FriendsPayload {
  const list = raw?.friends;
  const friends: FriendEntry[] = Array.isArray(list) ? list : [];
  return {
    friends: friends
      .filter((f) => f && typeof f.friend_key === "string")
      .map((f) => ({
        ...f,
        handle: f.handle || "Player",
        level_name: f.level_name || "Good",
        days: Number.isFinite(f.days) ? f.days : 1,
        can_gift_today: f.can_gift_today !== false,
      })),
    pending_gifts: Number.isFinite(raw?.pending_gifts) ? Number(raw?.pending_gifts) : 0,
  };
}

// ---------- what the screen says ----------

/** What a typed code becomes as it is typed: capitals and digits, six at most (FriendsSheet onChange). */
export function cleanCode(typed: string): string {
  return typed.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LEN);
}

export function canSubmitCode(typed: string): boolean {
  return cleanCode(typed).length === CODE_LEN;
}

/** Whole seconds a code has left by the phone's clock. */
export function codeSecondsLeft(expiresAt: number | null, now: number): number {
  return expiresAt === null ? 0 : Math.max(0, Math.floor((expiresAt - now) / 1000));
}

/** "9:58" */
export function countdownText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "A B C 2 3 4", so a screen reader spells the code. */
export function spelledCode(code: string): string {
  return code.split("").join(" ");
}

export function addedMessage(r: FriendAdded): string {
  const name = r.handle || "Player";
  return r.already ? `You and ${name} are already friends.` : `You and ${name} are now friends!`;
}

/** "3 days · next at 7" */
export function daysLine(f: FriendEntry): string {
  const d = `${f.days} ${f.days === 1 ? "day" : "days"}`;
  return f.next_level_at == null ? d : `${d} · next at ${f.next_level_at}`;
}

/** The palette key a friendship level is drawn in (FriendsSheet.levelColor). */
export function levelTone(level: string): "sunDeep" | "berry" | "skyDeep" | "mint" {
  switch (level) {
    case "Best":
      return "sunDeep";
    case "Ultra":
      return "berry";
    case "Great":
      return "skyDeep";
    default:
      return "mint";
  }
}

export function giftFromLine(g: FriendGift): string {
  return g.added > 0 ? `from ${g.from}` : `from ${g.from} (bag full)`;
}

export function friendsButtonLabel(pending: number): string {
  return pending > 0 ? `Friends, ${pending} ${pending === 1 ? "gift" : "gifts"} waiting` : "Friends";
}

/** Waiting gifts as /me reports them (roam_social.me), before the list has loaded. */
export function pendingFromMe(me: RoamMe | null | undefined): number {
  const social = me?.features?.social as { pending_gifts?: unknown } | null | undefined;
  const n = Number(social?.pending_gifts);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

// ---------- the model ----------

export type FriendsState = {
  /** Whose friends these are: a different player signed in starts over. */
  key: string | null;
  payload: FriendsPayload | null;
  code: FriendCode | null;
  /** When the code dies by the phone's clock (ms). */
  codeExpiresAt: number | null;
  failed: boolean;
  busy: boolean;
  /** The last thing to tell the player: a refusal in the server's words, or a friend just added. */
  message: string | null;
  /** What the last "Open gifts" brought, shown until the sheet closes. */
  opened: FriendGift[];
  /** Friends gifted this session, so the button greys at once rather than after the list reloads. */
  giftedNow: string[];
};

const INITIAL: FriendsState = {
  key: null,
  payload: null,
  code: null,
  codeExpiresAt: null,
  failed: false,
  busy: false,
  message: null,
  opened: [],
  giftedNow: [],
};

/** Pure on a snapshot, so a screen can compute it from the state it rendered with. */
export function canGiftTo(state: Pick<FriendsState, "giftedNow">, f: FriendEntry): boolean {
  return f.can_gift_today && !state.giftedNow.includes(f.friend_key);
}

export type FriendsDeps = {
  client: () => GameClient;
  /** The phone's position now, or null while there is no fix. */
  here: () => LatLng | null;
  now?: () => number;
  /** Something the rest of the game shows changed (gifts opened into the bag). */
  onChanged?: () => void;
};

function messageOf(error: unknown): string {
  if (error instanceof GameError) return error.message;
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

/**
 * Friends, the live code and the gift box: one per app, shared by the button
 * and the sheet so the badge and the list never disagree. State is an
 * immutable snapshot, read through useSyncExternalStore.
 */
export function createFriendsModel(deps: FriendsDeps) {
  let state: FriendsState = INITIAL;
  const listeners = new Set<() => void>();
  const now = deps.now ?? (() => Date.now());

  const set = (patch: Partial<FriendsState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };

  /** The signed-in player's key, starting over if it is someone else's turn. */
  const keyNow = (): string => {
    const key = deps.client().deviceKey();
    if (state.key !== key) set({ ...INITIAL, key });
    return key;
  };

  /** One thing at a time, as iOS's busy flag: a double tap sends once. */
  async function exclusive<T>(work: () => Promise<T>): Promise<T | null> {
    if (state.busy) return null;
    try {
      keyNow();
    } catch (error) {
      set({ message: messageOf(error) });
      return null;
    }
    set({ busy: true });
    try {
      return await work();
    } finally {
      set({ busy: false });
    }
  }

  const model = {
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    pending: (): number => state.payload?.pending_gifts ?? 0,

    canGift: (f: FriendEntry): boolean => canGiftTo(state, f),

    async refresh(): Promise<void> {
      let key: string;
      try {
        key = keyNow();
      } catch {
        return;
      }
      try {
        const payload = await fetchFriends(deps.client());
        if (state.key === key) set({ payload, failed: false });
      } catch {
        // Keep the list we had: a flaky network should not "unfriend".
        if (state.key === key) set({ failed: true });
      }
    },

    async makeCode(): Promise<void> {
      const here = deps.here();
      if (!here) return;
      await exclusive(async () => {
        try {
          const code = await makeFriendCode(deps.client(), here);
          // The phone's clock, not the server's timestamp, times the
          // countdown: a skewed clock must not show a live code as dead.
          set({ code, codeExpiresAt: now() + Math.max(0, code.ttl_s) * 1000, message: null });
        } catch (error) {
          set({ message: messageOf(error) });
        }
      });
    },

    /** The added friend, or null (the reason is in `message`). */
    async add(typed: string): Promise<FriendAdded | null> {
      const here = deps.here();
      const code = cleanCode(typed);
      if (!here || code.length !== CODE_LEN) return null;
      const got = await exclusive(async () => {
        try {
          const r = await addFriend(deps.client(), code, here);
          set({ message: addedMessage(r) });
          return r;
        } catch (error) {
          set({ message: messageOf(error) });
          return null;
        }
      });
      if (got) await model.refresh();
      return got;
    },

    async gift(f: FriendEntry): Promise<boolean> {
      const sent = await exclusive(async () => {
        try {
          await sendGift(deps.client(), f.friend_key);
          set({ giftedNow: [...state.giftedNow, f.friend_key] });
          return true;
        } catch (error) {
          set({ message: messageOf(error) });
          return false;
        }
      });
      if (sent !== null) await model.refresh();
      return sent === true;
    },

    async claim(): Promise<FriendGift[] | null> {
      const got = await exclusive(async () => {
        try {
          const r = await claimGifts(deps.client());
          set({ opened: r.gifts });
          return r.gifts;
        } catch (error) {
          set({ message: messageOf(error) });
          return null;
        }
      });
      if (got) {
        await model.refresh();
        deps.onChanged?.();
      }
      return got;
    },

    /** The sheet closed: what was opened and said goes with it (the code stays). */
    dismissed() {
      if (state.opened.length || state.message) set({ opened: [], message: null });
    },
  };
  return model;
}

export type FriendsModel = ReturnType<typeof createFriendsModel>;
