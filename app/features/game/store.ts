// Everything the always-on game knows, for every game screen. The TypeScript
// twin of costquest-ios Roam/RoamStore.swift: one object at the root, because
// the map, the challenge and the reward are three views of the same moment.
//
// Nothing here decides an outcome. Distances are shown so a player knows
// whether to keep walking, and the Play button follows them, but the server
// says yes or no, and its refusal is shown in its own words.
//
// Pure: no React Native imports. The client, the key storage, randomness and
// the clock are injected (tested in features/game/__tests__).
import { GameClient, GameError } from "./client.ts";
import { fixFields } from "./fixInfo.ts";
import { distanceM, type LatLng, reachM } from "./geo.ts";
import { Identity, SEED_HEX } from "./identity.ts";
import type {
  CodexPayload,
  DuelFinished,
  DuelOutcome,
  DuelStart,
  FactionWar,
  GroundGeometry,
  Profile,
  QuestPoint,
  RoamAnswer,
  RoamAttempt,
  RoamConfig,
  RoamHint,
  RoamLeaders,
  RoamMe,
  RoamSpin,
  RoamVerdict,
} from "./wire.ts";
import { isCooling, pointPlaysAsDuel } from "./wire.ts";

export type KeyStorage = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

/**
 * One fix from the phone. `at` is when the OS took it (epoch ms); mocked
 * (Android) and simulated (iOS) are sent to the server as evidence only,
 * never a reason to refuse (fixInfo.ts).
 */
export type Fix = LatLng & { accuracy: number; at: number; mocked?: boolean | null; simulated?: boolean | null };

export type GameState = {
  /** Who is playing: the account's player (one login) or this phone's own key. */
  session: { playerKey: string; source: "account" | "device"; created: boolean } | null;
  /**
   * Why one login did not give the game the account's player, while that is
   * so (the shell shows it over the game, components/world/SsoProblemPanel).
   * Never papered over with this phone's own key: the player chooses that
   * (playOnThisPhone).
   */
  ssoProblem: SsoProblem | null;
  config: RoamConfig | null;
  me: RoamMe | null;
  profile: Profile | null;
  points: QuestPoint[];
  region: string;
  war: FactionWar | null;
  leaders: RoamLeaders | null;
  codex: CodexPayload | null;
  ground: GroundGeometry | null;
  /** Where the world was last cut (ground and points are fetched around it). */
  centre: LatLng | null;
  fix: Fix | null;
  /** Why the world is empty, when it is. */
  problem: string | null;
  loadedOnce: boolean;
  /** The world is standing: basics and the first points are in. */
  ready: boolean;
  /** Paused: off screen, location stopped, nothing polls. */
  paused: boolean;
  /** A spot something asked the game to open (an invite, a link). */
  focus: { pointId?: string; raidId?: string; duelId?: string; lat?: number; lng?: number; place?: string } | null;
};

/**
 * - rejected: the game server did not accept this chat login (401/403). On a
 *   CosQuest Beta build the chat is the team's live server while the staging
 *   game checks the TEST chat server, so this is what every Beta tester gets.
 *   Retrying will not help by itself.
 * - unavailable: the game server or the chat backend can't do it now (5xx,
 *   429, the network). Retried on its own from `retryAt`.
 */
export type SsoProblem = { kind: "rejected" | "unavailable"; message: string; retryAt?: number };

const DEVICE_KEY_STORE = "cq.game.devicekey";
/** The account's seed, per chat user, from the last one login that worked on this phone. */
export const ACCOUNT_KEY_STORE = (subject: string) => `cq.game.accountkey.${subject}`;
/** This chat user chose to play on this phone's own key when one login failed. */
export const PLAY_HERE_STORE = (subject: string) => `cq.game.playhere.${subject}`;
/** Waits between one-login retries; the last one repeats. */
export const SSO_RETRY_MS = [2000, 5000, 15000, 30000];
const SUBJECT = /^[A-Za-z0-9_-]{1,64}$/;

/** A JWT's `sub` (or `id` / `userId`), unverified: only for finding what this phone saved for that chat user. */
export function jwtSubject(token: string): string | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let bits = 0;
    let value = 0;
    let json = "";
    for (const ch of b64) {
      const index = alphabet.indexOf(ch);
      if (index < 0) continue;
      value = (value << 6) | index;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        json += String.fromCharCode((value >> bits) & 0xff);
      }
    }
    const claims = JSON.parse(json) as { sub?: unknown; id?: unknown; userId?: unknown };
    const sub = [claims.sub, claims.id, claims.userId].find((v) => typeof v === "string");
    return typeof sub === "string" && SUBJECT.test(sub) ? sub : null;
  } catch {
    return null;
  }
}

const INITIAL: GameState = {
  session: null,
  ssoProblem: null,
  config: null,
  me: null,
  profile: null,
  points: [],
  region: "world",
  war: null,
  leaders: null,
  codex: null,
  ground: null,
  centre: null,
  fix: null,
  problem: null,
  loadedOnce: false,
  ready: false,
  paused: true,
  focus: null,
};

export type GameStoreDeps = {
  baseUrl: string;
  storage: KeyStorage;
  /** 32 random bytes as hex (expo-crypto in the app, node:crypto in tests). */
  randomSeedHex: () => string;
  /**
   * iOS: the native game's own key (Keychain, Game/Net/DeviceIdentity.swift),
   * the same 32-byte Ed25519 seed. Adopted once when this phone has no RN key
   * yet, so a player who never signed in keeps their progress when iOS moves
   * from the SwiftUI game to this one. Null: nothing to adopt.
   */
  legacySeedHex?: () => Promise<string | null>;
  fetch?: ConstructorParameters<typeof GameClient>[0]["fetch"];
  now?: () => number;
  log?: (message: string) => void;
  /** Run `work` after `ms` (setTimeout in the app); returns a cancel. */
  schedule?: (work: () => void, ms: number) => () => void;
};

/** Points nearest first (as given when there is no fix yet). Pure, so a
 * component can memoise it on the points and the fix it is given. */
export function nearestFirst(points: QuestPoint[], here: LatLng | null): QuestPoint[] {
  if (!here) return points;
  return [...points].sort((a, b) => distanceM(here, a) - distanceM(here, b));
}

export function createGameStore(deps: GameStoreDeps) {
  let state: GameState = { ...INITIAL };
  let identity: Identity | null = null;
  const listeners = new Set<() => void>();
  const now = deps.now ?? (() => Date.now());
  const log = deps.log ?? (() => {});
  const client = new GameClient({
    baseUrl: deps.baseUrl,
    identity: () => identity,
    fetch: deps.fetch,
    // Every located request says how good and how old its fix is (fixInfo.ts).
    locationFields: () => (state.fix ? fixFields(state.fix, now()) : null),
  });
  let pointsFetchedAt: LatLng | null = null;
  let pointsFetchedTime = 0;
  let starterAsked = false;
  let groundFor: LatLng | null = null;
  let sessionSerial = 0;
  let chatToken: string | null = null;
  let retryCount = 0;
  let cancelRetry: (() => void) | null = null;
  const schedule =
    deps.schedule ??
    ((work: () => void, ms: number) => {
      const timer = setTimeout(work, ms);
      return () => clearTimeout(timer);
    });

  const set = (patch: Partial<GameState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  async function deviceIdentity(): Promise<Identity> {
    let seed = await deps.storage.get(DEVICE_KEY_STORE);
    if (!seed || !SEED_HEX.test(seed)) {
      const legacy = (await deps.legacySeedHex?.().catch(() => null))?.trim().toLowerCase() ?? null;
      seed = legacy && SEED_HEX.test(legacy) ? legacy : deps.randomSeedHex();
      await deps.storage.set(DEVICE_KEY_STORE, seed);
    }
    return new Identity(seed, "device");
  }

  /** Make `next` the player (or nobody), starting the world over if that changed. */
  async function install(next: Identity | null, created: boolean, ssoProblem: SsoProblem | null) {
    const changed = identity?.publicKeyHex !== next?.publicKeyHex;
    identity = next;
    set({
      session: next ? { playerKey: next.publicKeyHex, source: next.source, created } : null,
      ssoProblem,
      ...(changed ? { me: null, profile: null, points: [], codex: null, loadedOnce: false, ready: false } : {}),
    });
    if (changed && next) await store.loadBasics();
  }

  function retryLater(serial: number, ms: number) {
    cancelRetry?.();
    cancelRetry = schedule(() => {
      cancelRetry = null;
      if (serial === sessionSerial) void oneLogin(++sessionSerial);
    }, ms);
  }

  async function oneLogin(serial: number): Promise<void> {
    const token = chatToken;
    if (!token) return;
    const sub = jwtSubject(token);
    try {
      const sso = await client.sso(token);
      if (serial !== sessionSerial) return; // signed out or in again meanwhile
      retryCount = 0;
      const subject = SUBJECT.test(sso.subject) ? sso.subject : sub;
      if (subject) await deps.storage.set(ACCOUNT_KEY_STORE(subject), sso.key.seed_hex).catch(() => {});
      if (sub && sub !== subject) await deps.storage.set(ACCOUNT_KEY_STORE(sub), sso.key.seed_hex).catch(() => {});
      await install(new Identity(sso.key.seed_hex, "account", sso.nonce_floor), sso.created, null);
      return;
    } catch (error) {
      if (serial !== sessionSerial) return;
      const status = error instanceof GameError ? error.status : 0;
      const message = error instanceof Error ? error.message : String(error);
      const rejected = status === 401 || status === 403;
      // The player already chose this phone's key for this chat user.
      const playHere = sub ? await deps.storage.get(PLAY_HERE_STORE(sub)).catch(() => null) : null;
      if (serial !== sessionSerial) return;
      if (playHere === "1") {
        log(`[game] one login failed (${message}); playing on this phone's key, as chosen`);
        await install(await deviceIdentity(), false, null);
        return;
      }
      // Down for a moment (not a refusal): the key this phone saved for this
      // chat user is the same player, so nothing splits.
      const saved = !rejected && sub ? await deps.storage.get(ACCOUNT_KEY_STORE(sub)).catch(() => null) : null;
      if (serial !== sessionSerial) return;
      if (saved && SEED_HEX.test(saved)) {
        log(`[game] one login unavailable (${message}); using this account's saved key`);
        await install(new Identity(saved, "account"), false, null);
        return;
      }
      if (rejected) {
        log(`[game] one login refused (${status} ${message}); waiting for the player`);
        await install(null, false, { kind: "rejected", message: "The game server didn't accept your CosQuest sign-in." });
        return;
      }
      const waitMs = SSO_RETRY_MS[Math.min(retryCount, SSO_RETRY_MS.length - 1)];
      retryCount += 1;
      log(`[game] one login unavailable (${message}); again in ${waitMs} ms`);
      await install(null, false, {
        kind: "unavailable",
        message: status === 429 ? "The game is busy right now." : "Can't reach the game server right now.",
        retryAt: now() + waitMs,
      });
      retryLater(serial, waitMs);
    }
  }

  const store = {
    client,
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    // ---------- who is playing ----------

    /**
     * One login: trade the chat session for the account's player. When that
     * fails the game does NOT quietly switch to this phone's own key (that
     * splits a person's progress across two players without a word):
     * - down for a moment (5xx, 429, the network): the account's key saved
     *   from the last good one login on this phone, if any; otherwise no
     *   player, ssoProblem "unavailable", retried at 2 s, 5 s, 15 s, then 30 s.
     * - refused (401/403): no player, ssoProblem "rejected".
     * Playing on this phone's own key is the player's choice (playOnThisPhone),
     * remembered for that chat user. `null` signs out: the world starts over.
     */
    async setSession(token: string | null): Promise<void> {
      // Signed out while never signed in (the shell's first word when it starts
      // signed out): nothing to forget, and a player chosen on this phone
      // (playOnThisPhone, e.g. a test page) stays.
      if (!token && chatToken === null && identity?.source !== "account") return;
      const serial = ++sessionSerial;
      cancelRetry?.();
      cancelRetry = null;
      retryCount = 0;
      chatToken = token;
      if (!token) {
        identity = null;
        starterAsked = false;
        set({ ...INITIAL, paused: state.paused, fix: state.fix });
        return;
      }
      await oneLogin(serial);
    },

    /** Try one login again now (the Retry button). */
    async retrySession(): Promise<void> {
      if (!chatToken) return;
      cancelRetry?.();
      cancelRetry = null;
      retryCount = 0;
      await oneLogin(++sessionSerial);
    },

    /**
     * The player chose to play on this phone's own key (progress stays on this
     * phone). Remembered for the signed-in chat user, so they are not asked
     * again; a later one login that works still brings their account back.
     * Also how test pages play with no chat login at all.
     */
    async playOnThisPhone(): Promise<void> {
      const serial = ++sessionSerial;
      cancelRetry?.();
      cancelRetry = null;
      const sub = chatToken ? jwtSubject(chatToken) : null;
      if (sub) await deps.storage.set(PLAY_HERE_STORE(sub), "1").catch(() => {});
      const next = await deviceIdentity();
      if (serial !== sessionSerial) return;
      await install(next, false, null);
    },

    signedIn: () => identity !== null,

    // ---------- loading ----------

    async loadBasics(): Promise<void> {
      if (!identity) return;
      try {
        const [config, me] = await Promise.all([client.roamConfig(), client.roamMe()]);
        set({ config, me, problem: null });
        client
          .profile(identity.publicKeyHex)
          .then((profile) => set({ profile }))
          .catch(() => {});
      } catch (error) {
        log(`[game] basics failed: ${String(error)}`);
        set({ problem: "Can't reach CosQuest right now." });
      }
      set({ loadedOnce: true });
      await store.refreshPoints(true);
    },

    /** The phone moved (or a first fix arrived). */
    setFix(fix: Fix) {
      const centre = state.centre;
      const patch: Partial<GameState> = { fix };
      // Re-cut the world a good way before its edge.
      if (!centre || distanceM(centre, fix) > 300) patch.centre = { lat: fix.lat, lng: fix.lng };
      set(patch);
      if (state.paused || !identity) return;
      const stale = !pointsFetchedAt || distanceM(pointsFetchedAt, fix) > 60;
      if (stale || now() - pointsFetchedTime > 90000) void store.refreshPoints();
      if (!groundFor || distanceM(groundFor, fix) > 250) void store.refreshGround();
    },

    async refreshPoints(force = false): Promise<void> {
      const here = state.fix;
      if (!here || !identity) return;
      if (!force && now() - pointsFetchedTime < 5000) return;
      pointsFetchedTime = now();
      pointsFetchedAt = { lat: here.lat, lng: here.lng };
      try {
        const got = await client.questPoints(here.lat, here.lng);
        set({ points: got.points, region: got.region, problem: null });
      } catch (error) {
        log(`[game] points failed: ${String(error)}`);
        if (!state.points.length) set({ problem: "Can't find Quest Points right now." });
      }
      await store.ensureStarter();
      if (!state.ready && state.me) set({ ready: true });
      void store.refreshWar();
    },

    /** A new player's first point, beside them (the first thing asked is never "walk half a kilometre"). */
    async ensureStarter(): Promise<void> {
      const { me, fix } = state;
      if (!me || !me.faction || me.tutorial_done || starterAsked || !fix) return;
      if (state.points.some((p) => p.source === "starter")) return;
      starterAsked = true;
      try {
        const s = await client.starter(fix.lat, fix.lng, fix.accuracy);
        if (s.starter) set({ points: [s.starter, ...state.points] });
      } catch (error) {
        starterAsked = false;
        log(`[game] starter failed: ${String(error)}`);
      }
    },

    async refreshGround(): Promise<void> {
      const here = state.fix;
      if (!here) return;
      groundFor = { lat: here.lat, lng: here.lng };
      try {
        set({ ground: await client.ground(here.lat, here.lng, 600) });
      } catch (error) {
        groundFor = null;
        log(`[game] ground failed: ${String(error)}`);
      }
    },

    async refreshWar(): Promise<void> {
      const here = state.fix;
      if (!here) return;
      const [war, leaders] = await Promise.all([
        client.factionWar(here.lat, here.lng).catch(() => null),
        client.roamLeaders(here.lat, here.lng).catch(() => null),
      ]);
      set({ war: war ?? state.war, leaders: leaders ?? state.leaders });
    },

    async refreshMe(): Promise<void> {
      try {
        set({ me: await client.roamMe() });
      } catch {
        // Keep what we had.
      }
    },

    async refreshCodex(): Promise<CodexPayload | null> {
      try {
        const codex = await client.codex();
        set({ codex });
        return codex;
      } catch {
        return state.codex;
      }
    },

    // ---------- onboarding ----------

    get needsOnboarding(): boolean {
      return state.loadedOnce && !!state.me && !!state.config && !state.me.faction;
    },

    async saveProfile(handle: string, avatar = { face: 1, mark: 1, tint: "#3FA7D6" }): Promise<void> {
      await client.saveProfile(handle, avatar);
      if (identity) {
        client
          .profile(identity.publicKeyHex)
          .then((profile) => set({ profile }))
          .catch(() => {});
      }
    },

    async chooseFaction(id: string): Promise<void> {
      set({ me: await client.chooseFaction(id) });
      await store.refreshPoints(true);
    },

    // ---------- distances (the interface only) ----------

    distanceTo(p: LatLng): number | null {
      return state.fix ? distanceM(state.fix, p) : null;
    },

    reach(): number {
      return reachM(state.config?.open_radius_m, state.fix?.accuracy ?? 0);
    },

    inReach(p: LatLng): boolean {
      const d = store.distanceTo(p);
      return d !== null && d <= store.reach();
    },

    /** Nearest first. */
    nearby(): QuestPoint[] {
      return nearestFirst(state.points, state.fix);
    },

    playsAsDuel(p: QuestPoint): boolean {
      return pointPlaysAsDuel(p, state.me);
    },

    isCooling(p: QuestPoint): boolean {
      return isCooling(p, now());
    },

    // ---------- playing a quiz point ----------

    async open(p: QuestPoint): Promise<RoamAttempt> {
      const here = state.fix;
      if (!here) throw new GameError("http", "Waiting for your location.");
      return client.openPoint(p.id, here.lat, here.lng, here.accuracy);
    },

    async submit(attempt: RoamAttempt, answers: RoamAnswer[]): Promise<RoamVerdict> {
      const v = await client.answer(attempt.attempt_id, answers);
      store.applyCooling(v.point_id, v.cooling_until);
      if (v.me) set({ me: v.me });
      void store.refreshWar();
      return v;
    },

    async hint(attempt: RoamAttempt, kind: "fifty" | "time", question: number): Promise<RoamHint> {
      const h = await client.hint(attempt.attempt_id, kind, question);
      if (state.me) set({ me: { ...state.me, coins: h.coins } });
      return h;
    },

    // ---------- playing a duel point ----------

    /** `battle`: this build can play the fantasy battle scene (DuelModel.start: body.battle on point fights). */
    async duelStart(p: QuestPoint, opts?: { fight3d?: boolean; fallback2d?: boolean }): Promise<DuelStart> {
      const here = state.fix;
      if (!here) throw new GameError("http", "Waiting for your location.");
      return client.duelStart({ mode: "point", target: p.id, lat: here.lat, lng: here.lng, accuracy_m: here.accuracy, ...opts });
    },

    async duelFinish(start: DuelStart, finished: DuelFinished & { fight3d?: Record<string, unknown> | null }): Promise<DuelOutcome> {
      const out = await client.duelFinish(start.duel_id, finished);
      if (out.point?.point_id && out.point.cooling_until) store.applyCooling(out.point.point_id, out.point.cooling_until);
      void store.refreshMe();
      void store.refreshPoints(true);
      return out;
    },

    /** Spin: the one-second verb. Items fly into the bag, and the point rests (RoamStore.spin). */
    async spin(p: QuestPoint): Promise<RoamSpin> {
      const here = state.fix;
      if (!here) throw new GameError("http", "Waiting for your location.");
      const r = await client.spin(p.id, here.lat, here.lng, here.accuracy);
      set({ points: state.points.map((x) => (x.id === p.id ? { ...x, extra: { ...(x.extra ?? {}), spin_ready_at: r.spin_ready_at } } : x)) });
      void store.refreshMe();
      return r;
    },

    /** The point cools for this player: show it at once, not on the next fetch. Starters go. */
    applyCooling(pointId: string, coolingUntil: string) {
      const points = state.points.flatMap((p) => {
        if (p.id !== pointId) return [p];
        if (p.source === "starter") return [];
        return [{ ...p, cooling_until: coolingUntil }];
      });
      set({ points });
    },

    // ---------- the shell ----------

    pause() {
      if (!state.paused) set({ paused: true });
    },

    resume() {
      if (!state.paused) return;
      set({ paused: false });
      if (identity && state.fix) {
        void store.refreshPoints();
        if (!state.ground) void store.refreshGround();
      }
    },

    setFocus(focus: GameState["focus"]) {
      set({ focus });
    },

    factionName(id: string | null | undefined): string {
      if (!id) return "No faction";
      return state.config?.factions.find((f) => f.id === id)?.name ?? id.charAt(0).toUpperCase() + id.slice(1);
    },

    playerName(): string {
      return state.profile?.handle || state.me?.handle || "traveller";
    },
  };
  return store;
}

export type GameStore = ReturnType<typeof createGameStore>;
