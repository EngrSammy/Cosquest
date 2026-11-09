// "Hold phones together": add a friend by holding two iPhones side by side.
// The TypeScript twin of costquest-ios Features/FriendsFeature.swift
// (NearbyFriendModel, HoldPhonesCard's rules).
//
// The phones find each other over a Bonjour/AWDL link with TLS-PSK and, where
// the radio exists, measure each other with Nearby Interaction. That part is
// native and thin (ios/Embed/FriendBeaconIsland.swift: startFriendBeacon,
// stopFriendBeacon, event onFriendBeacon); everything the player sees and
// every call to the server is here. Each phone claims the other at
// POST /v1/roam/social/nearby every 2.5 s for up to 90 s; the server makes
// them friends only once both have claimed from within 100 m.
//
// Android has neither half with an iPhone (friendBeaconAvailable is absent),
// so the card is iOS only; the six-letter code works between any two phones.
//
// Pure: the beacon, the client, the position and the clock are injected
// (features/game/__tests__/friendsNearby.test.ts).
import { type GameClient, GameError } from "./client.ts";
import type { LatLng } from "./geo.ts";

// ---------- the native beacon's events (FriendBeacon.Event + FriendRanger) ----------

export type BeaconEvent =
  /** Everyone advertising the friend service now: key to handle. */
  | { kind: "seen"; peers: { key: string; handle: string }[] }
  /** A link is up and the other phone said who it is. */
  | { kind: "hello"; key: string; handle: string }
  | { kind: "lost"; key: string }
  /** Ultra wideband measured this peer, in metres. */
  | { kind: "distance"; key: string; metres: number }
  /** Local Network permission was refused. */
  | { kind: "denied" };

export type Beacon = {
  start(me: { key: string; handle: string }): Promise<void>;
  stop(): Promise<void>;
  listen(on: (e: BeaconEvent) => void): () => void;
  /** The phone can measure distance (NISession precise distance). */
  usesUWB: boolean;
};

/** /v1/roam/social/nearby's answer. */
export type NearbyFriendResult = {
  friends: boolean;
  waiting?: boolean | null;
  already?: boolean | null;
  friend_key?: string | null;
  handle?: string | null;
  faction?: string | null;
};

// ---------- rules ----------

/** Claims fire on their own under this, when the radio can measure. */
export const CLAIM_DISTANCE_M = 0.5;
export const CLAIM_WINDOW_MS = 90_000;
export const CLAIM_EVERY_MS = 2_500;
/** Nobody found after this: "Make sure the other phone has this screen open." */
export const QUIET_AFTER_MS = 20_000;
/** A distance older than this is not shown. */
export const DISTANCE_FRESH_MS = 3_000;

export type NearbyPeer = { key: string; handle: string; linked: boolean; distance: number | null };

export type NearbyState = {
  running: boolean;
  denied: boolean;
  quiet: boolean;
  /** Whom we are claiming right now. */
  claiming: string | null;
  status: string | null;
  success: string | null;
  /** Goes up once per new friend: the card's cue for the fanfare and the haptic. */
  celebrations: number;
  advertised: Record<string, string>;
  greeted: Record<string, string>;
  distances: Record<string, { metres: number; at: number }>;
  autoClaimed: string[];
};

export const NEARBY_INITIAL: NearbyState = {
  running: false,
  denied: false,
  quiet: false,
  claiming: null,
  status: null,
  success: null,
  celebrations: 0,
  advertised: {},
  greeted: {},
  distances: {},
  autoClaimed: [],
};

/** NearbyFriendModel.recentDistance. */
export function recentDistance(s: NearbyState, key: string, now: number): number | null {
  const d = s.distances[key];
  return d && now - d.at < DISTANCE_FRESH_MS ? d.metres : null;
}

/** Everyone advertised or linked, by key, as the card lists them. */
export function peersOf(s: NearbyState, now: number): NearbyPeer[] {
  const keys = [...new Set([...Object.keys(s.advertised), ...Object.keys(s.greeted)])].sort();
  return keys.map((k) => ({
    key: k,
    handle: s.greeted[k] ?? s.advertised[k] ?? "Player",
    linked: s.greeted[k] !== undefined,
    distance: recentDistance(s, k, now),
  }));
}

/** "34 cm away" under a metre, else "1.2 m away" (HoldPhonesCard.peerRow). */
export function nearbyDistanceText(metres: number): string {
  return metres < 1 ? `${Math.round(metres * 100)} cm away` : `${metres.toFixed(1)} m away`;
}

/** With a live distance the radio decides; without one the player taps. */
export function tooFar(p: NearbyPeer): boolean {
  return p.distance !== null && p.distance > CLAIM_DISTANCE_M;
}

/** The peer row's button. */
export function addLabel(p: NearbyPeer): string {
  return tooFar(p) ? "Hold closer" : `Add ${p.handle}`;
}

/** What the card says under its title, when nothing else is shown. */
export function searchingLine(s: NearbyState): string {
  return s.quiet ? "Make sure the other phone has this screen open." : "Looking for phones nearby…";
}

// ---------- the model ----------

/**
 * What a claim posts and how its answer reads. The friend add by default; the
 * squad-up card (squad.ts) claims the same held phone at its own route.
 */
export type NearbyClaimer = {
  path: string;
  /** The success line once the server says both phones are in, else null (still waiting). */
  done(r: Record<string, unknown>, name: string): string | null;
  /** Both phones are in: the caller's own follow-up (refresh a list, keep a token). */
  onDone(r: Record<string, unknown>): void;
  /** The line while the other phone has not claimed yet. */
  waiting(name: string): string;
  /** The line when the window ran out. */
  gaveUp(name: string): string;
};

export function friendClaimer(onFriend: () => void): NearbyClaimer {
  return {
    path: "v1/roam/social/nearby",
    done: (r, name) => (r.friends ? `You and ${(r as NearbyFriendResult).handle ?? name} are friends` : null),
    onDone: () => onFriend(),
    waiting: (name) => `Waiting for ${name} to add you too…`,
    gaveUp: (name) => `Didn't hear back from ${name}. Make sure they tap Add on their phone too.`,
  };
}

export type NearbyDeps = {
  beacon: Beacon;
  /** Where claims go (default: the friend add, calling onFriend). */
  claimer?: NearbyClaimer;
  client: () => Pick<GameClient, "deviceKey" | "request">;
  here: () => LatLng | null;
  handle: () => string;
  /** A new friend: refresh the list and the bag (RoamStore.featureChanged). */
  onFriend: () => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
};

export function createNearbyFriendModel(deps: NearbyDeps) {
  let state: NearbyState = NEARBY_INITIAL;
  const listeners = new Set<() => void>();
  const now = deps.now ?? (() => Date.now());
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((t: unknown) => clearTimeout(t as ReturnType<typeof setTimeout>));
  const timers = new Set<unknown>();
  let unlisten: (() => void) | null = null;
  const claimer = deps.claimer ?? friendClaimer(deps.onFriend);
  /** Bumped by stop(): a claim loop from an earlier opening stops at its next step. */
  let generation = 0;

  const set = (patch: Partial<NearbyState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };

  const later = (ms: number, fn: () => void) => {
    const t = setTimer(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };
  const pause = (ms: number) => new Promise<void>((resolve) => later(ms, resolve));

  const onEvent = (e: BeaconEvent) => {
    if (!state.running) return;
    switch (e.kind) {
      case "seen":
        set({ advertised: Object.fromEntries(e.peers.map((p) => [p.key, p.handle])) });
        break;
      case "hello":
        set({ greeted: { ...state.greeted, [e.key]: e.handle } });
        break;
      case "lost": {
        const greeted = { ...state.greeted };
        delete greeted[e.key];
        set({ greeted });
        break;
      }
      case "distance":
        set({ distances: { ...state.distances, [e.key]: { metres: e.metres, at: now() } } });
        if (e.metres <= CLAIM_DISTANCE_M && state.claiming === null && !state.autoClaimed.includes(e.key)) {
          set({ autoClaimed: [...state.autoClaimed, e.key] });
          model.claim(e.key);
        }
        break;
      case "denied":
        set({ denied: true });
        break;
    }
  };

  async function runClaim(peer: string, name: string, distance: number | null, gen: number) {
    const deadline = now() + CLAIM_WINDOW_MS;
    const live = () => gen === generation && state.running;
    while (live() && now() < deadline) {
      const here = deps.here();
      if (here) {
        try {
          const client = deps.client();
          const r = await client.request<Record<string, unknown>>("POST", claimer.path, {
            body: { device_key: client.deviceKey(), peer_key: peer, lat: here.lat, lng: here.lng, distance_m: distance },
            signed: true,
          });
          if (!live()) return;
          const success = r ? claimer.done(r, name) : null;
          if (success) {
            set({ claiming: null, status: null, success, celebrations: state.celebrations + 1 });
            claimer.onDone(r);
            return;
          }
          set({ status: claimer.waiting(name) });
        } catch (error) {
          if (!live()) return;
          if (!(error instanceof GameError) || !error.retryable) {
            set({
              status: error instanceof Error ? error.message : "Something went wrong. Try again.",
              claiming: null,
              autoClaimed: state.autoClaimed.filter((k) => k !== peer),
            });
            return;
          }
          // A dropped request: the window is long, keep trying.
        }
      } else {
        set({ status: "Waiting for your location…" });
      }
      await pause(CLAIM_EVERY_MS);
    }
    if (!live()) return;
    set({
      status: claimer.gaveUp(name),
      claiming: null,
      autoClaimed: state.autoClaimed.filter((k) => k !== peer),
    });
  }

  const model = {
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    usesUWB: deps.beacon.usesUWB,

    /** The card appeared (NearbyFriendModel.start). */
    async start() {
      if (state.running) return;
      const gen = ++generation;
      set({ ...NEARBY_INITIAL, running: true, celebrations: state.celebrations });
      let key: string;
      try {
        key = deps.client().deviceKey();
      } catch {
        set({ status: "This phone couldn't prove who it is. Try again later." });
        return;
      }
      unlisten = deps.beacon.listen(onEvent);
      try {
        await deps.beacon.start({ key, handle: deps.handle().slice(0, 40) || "Player" });
      } catch (error) {
        if (gen === generation) set({ status: error instanceof Error ? error.message : "Couldn't look for phones nearby." });
        return;
      }
      if (gen !== generation) return;
      later(QUIET_AFTER_MS, () => {
        if (gen === generation && state.running) set({ quiet: true });
      });
    },

    /** The card went away (NearbyFriendModel.stop). */
    stop() {
      generation++;
      timers.forEach(clearTimer);
      timers.clear();
      unlisten?.();
      unlisten = null;
      if (state.running) void deps.beacon.stop().catch(() => {});
      set({ ...NEARBY_INITIAL, celebrations: state.celebrations });
    },

    /** Claim this phone and keep claiming until the other side has too. */
    claim(peer: string) {
      if (state.claiming !== null || !state.running) return;
      const name = peersOf(state, now()).find((p) => p.key === peer)?.handle ?? "your friend";
      set({ claiming: peer, success: null, status: `Waiting for ${name}…` });
      void runClaim(peer, name, recentDistance(state, peer, now()), generation);
    },
  };
  return model;
}

export type NearbyFriendModel = ReturnType<typeof createNearbyFriendModel>;
