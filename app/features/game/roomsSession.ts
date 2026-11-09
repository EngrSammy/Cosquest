// Rooms, the moving parts: the model behind the Battle sheet and the map's
// beacons (costquest-ios Features/RoomsFeature.swift RoomsModel), the queue
// every action goes through (Game/EventOutbox.swift), and one player's
// session in a Room's game (Game/GameSession.swift + Game/LiveLink.swift).
//
// The session judges nothing. It sends what the player did and shows what
// came back: the engine's verdicts, the live link's scoreboard, who went
// down, where everyone is. Immutable snapshots behind subscribe/get, so the
// screens read it through useSyncExternalStore.
//
// Pure: the client, the socket, the clock and the timers are injected
// (tested in features/game/__tests__/rooms.test.ts). The app's instances live
// in roomsRuntime.ts.
import { type GameClient, GameError } from "./client.ts";
import { type FixInfo, fixFields, fixIsFresh, isNeedLocation, nextLocationRetry, WAITING_FOR_LOCATION } from "./fixInfo.ts";
import {
  createRoom,
  type DeviceEvent,
  type EventKind,
  type FightState,
  fightOver,
  findRoom,
  type GameAnchor,
  gameAnchors,
  gameState,
  type GameTerms,
  gameTerms,
  type HeldWeapon,
  INITIAL_FIGHT,
  isTerminal,
  joinGame,
  liveRooms,
  liveSocketUrl,
  nearbyRooms,
  type NearbyRoom,
  onLive,
  onVerdict,
  parseLiveMessage,
  type RoomCreated,
  roomEnded,
  sendEvents,
  type Verdict,
  weaponName,
} from "./rooms.ts";

type Timer = ReturnType<typeof setTimeout>;
export type Clock = {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => Timer;
  clearTimeout: (t: Timer) => void;
};
const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (t) => clearTimeout(t),
};

function emitter<S>(initial: S) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<S>) {
      state = { ...state, ...patch };
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

// ---------- RoomsModel: rooms near you, start one, find one by code ----------

export type Here = { lat: number; lng: number; accuracy: number };

export type RoomsState = {
  nearby: NearbyRoom[];
  loaded: boolean;
  /** The Room this player is hosting, once started. */
  hosting: RoomCreated | null;
  problem: string | null;
  busy: boolean;
};

export function createRoomsModel(deps: { client: () => GameClient; here: () => Here | null; now?: () => number }) {
  const now = deps.now ?? (() => Date.now());
  const store = emitter<RoomsState>({ nearby: [], loaded: false, hosting: null, problem: null, busy: false });
  const model = {
    get: store.get,
    subscribe: store.subscribe,

    /** Beacons are a nicety: a failed fetch keeps the last ones. */
    async refresh(): Promise<void> {
      const here = deps.here();
      if (!here) return;
      try {
        const got = await nearbyRooms(deps.client(), here.lat, here.lng);
        store.set({ nearby: liveRooms(got, now()), loaded: true });
      } catch {
        store.set({ loaded: true });
      }
    },

    async start(minutes: number, isPrivate: boolean): Promise<RoomCreated | null> {
      store.set({ problem: null, busy: true });
      try {
        const here = deps.here();
        if (!here) throw new GameError("http", "Waiting for your location.");
        const r = await createRoom(deps.client(), { lat: here.lat, lng: here.lng, accuracy: here.accuracy, minutes, private: isPrivate });
        store.set({ hosting: r, busy: false });
        void model.refresh();
        return r;
      } catch (e) {
        store.set({ problem: messageOf(e), busy: false });
        return null;
      }
    },

    async find(code: string): Promise<string | null> {
      store.set({ problem: null, busy: true });
      try {
        const r = await findRoom(deps.client(), code);
        store.set({ busy: false });
        return r.game_id;
      } catch (e) {
        store.set({ problem: messageOf(e), busy: false });
        return null;
      }
    },

    /** The hosted Room, while it is still live (the sheet shows its code again). */
    liveHosting(): RoomCreated | null {
      const h = store.get().hosting;
      return h && !roomEnded(h.ends_at, now()) ? h : null;
    },

    clearProblem() {
      store.set({ problem: null });
    },
  };
  return model;
}

export type RoomsModel = ReturnType<typeof createRoomsModel>;

// ---------- RoomOutbox: recorded, sent self-clocked, retried without fear ----------

/** How long an action's caller waits before being told the event is queued (EventOutbox.verdictWait). */
export const VERDICT_WAIT_MS = 10000;
export const QUEUED_REASON = "queued: waiting for network";
const GAME_OVER_REASON = "game is finished, not live";

type Queued = { seq: number; kind: EventKind; payload: Record<string, unknown> };

/**
 * Every action on its way to the server. `client_seq` makes the server
 * idempotent, so a lost reply costs one repeat and returns the first verdict.
 *
 * The sequence is a millisecond clock that never repeats or goes backwards.
 * iOS keeps a counter on disk; this queue is in memory, and a counter that
 * restarted at zero after a relaunch would collide with events the server
 * already holds (it would answer "duplicate" with an old verdict). A clock
 * cannot restart below itself. What is lost against iOS: events queued in a
 * dead spot do not survive the app being killed.
 */
export class RoomOutbox {
  private readonly send: (events: DeviceEvent[]) => Promise<Verdict[]>;
  private readonly clock: Clock;
  private readonly waitMs: number;
  private pending: Queued[] = [];
  private lastSeq = 0;
  private draining = false;
  private stopped = false;
  /** Set when the game is over: every later action is refused at once. */
  private over = false;
  private readonly waiters = new Map<number, { resolve: (v: Verdict) => void; timer: Timer }>();

  constructor(send: (events: DeviceEvent[]) => Promise<Verdict[]>, clock: Clock = realClock, waitMs = VERDICT_WAIT_MS) {
    this.send = send;
    this.clock = clock;
    this.waitMs = waitMs;
  }

  get depth(): number {
    return this.pending.length;
  }

  private nextSeq(): number {
    this.lastSeq = Math.max(Math.floor(this.clock.now()), this.lastSeq + 1);
    return this.lastSeq;
  }

  /** Record an action and resolve with the server's verdict (or "queued" after the wait). */
  submit(kind: EventKind, payload: Record<string, unknown>): Promise<Verdict> {
    const seq = this.nextSeq();
    if (this.over) return Promise.resolve({ client_seq: seq, ok: false, reason: GAME_OVER_REASON });
    this.pending.push({ seq, kind, payload });
    const answer = new Promise<Verdict>((resolve) => {
      const timer = this.clock.setTimeout(() => this.release(seq, { client_seq: seq, ok: false, reason: QUEUED_REASON }), this.waitMs);
      this.waiters.set(seq, { resolve, timer });
    });
    void this.drain();
    return answer;
  }

  private release(seq: number, v: Verdict) {
    const w = this.waiters.get(seq);
    if (!w) return;
    this.waiters.delete(seq);
    this.clock.clearTimeout(w.timer);
    w.resolve(v);
  }

  /** Leaving: stop retrying and release every waiter (the queue is kept for a rejoin). */
  stop() {
    this.stopped = true;
    for (const seq of [...this.waiters.keys()]) this.release(seq, { client_seq: seq, ok: false, reason: QUEUED_REASON });
  }

  resume() {
    this.stopped = false;
  }

  /** The game is over: nothing queued can be judged now. */
  discardAll() {
    this.stopped = true;
    this.over = true;
    this.pending = [];
    for (const seq of [...this.waiters.keys()]) this.release(seq, { client_seq: seq, ok: false, reason: GAME_OVER_REASON });
  }

  /** The connection came back: move a queue that gave up during a dead spot. */
  networkReturned() {
    void this.drain();
  }

  /**
   * One request at a time: two batches in flight would reach the engine out
   * of order, and its cooldowns are time-ordered.
   */
  private async drain(): Promise<void> {
    if (this.draining || this.stopped || !this.pending.length) return;
    this.draining = true;
    let backoff = 250;
    try {
      while (this.pending.length && !this.stopped) {
        const batch = this.pending.slice(0, 100);
        const sent = new Set(batch.map((q) => q.seq));
        try {
          const verdicts = await this.send(batch.map((q) => ({ client_seq: q.seq, kind: q.kind, payload: q.payload })));
          this.pending = this.pending.filter((q) => !sent.has(q.seq));
          for (const v of verdicts) this.release(v.client_seq, v);
          // A server that answered without a verdict for one of ours: say so rather than hang.
          for (const seq of sent) this.release(seq, { client_seq: seq, ok: false, reason: "no verdict" });
          backoff = 250;
        } catch (e) {
          if (e instanceof GameError && e.retryable) {
            // Kept: the events are still true and are judged when the phone can reach the server.
            await new Promise<void>((r) => this.clock.setTimeout(r, backoff));
            backoff = Math.min(backoff * 2, 8000);
            continue;
          }
          // Refused, not lost (a 4xx is refused identically on every retry):
          // drop the batch and give each waiter the server's reason.
          const reason = messageOf(e);
          this.pending = this.pending.filter((q) => !sent.has(q.seq));
          for (const seq of sent) this.release(seq, { client_seq: seq, ok: false, reason });
        }
      }
    } finally {
      this.draining = false;
    }
  }
}

// ---------- the session: one player in one Room ----------

/** What the session needs of a WebSocket (React Native's and the browser's both fit). */
export type SocketLike = {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
};

export type RoomSessionState = {
  gameId: string;
  terms: GameTerms | null;
  anchors: GameAnchor[];
  /** Joined and playing (the lobby is behind us). */
  joined: boolean;
  joining: boolean;
  /** Why loading or joining failed, in the server's words. */
  problem: string | null;
  fight: FightState;
};

/** A fix as the session keeps it: where, and (when known) how good, how old, mocked or simulated. */
export type RoomFix = { lat: number; lng: number } & Partial<FixInfo>;

/** accuracy_m, fix_age_s, mocked, simulated for a fix: only what it knows (fixInfo.ts). */
export function locatedFields(fix: RoomFix, now: number) {
  return fixFields({ accuracy: fix.accuracy ?? NaN, at: fix.at ?? NaN, mocked: fix.mocked, simulated: fix.simulated }, now);
}

export type RoomSessionDeps = {
  client: GameClient;
  gameId: string;
  openSocket: (url: string) => SocketLike;
  clock?: Clock;
  verdictWaitMs?: number;
  /**
   * A fresh fix now (runtime.ts refreshFix): asked before a located action
   * when the last one is older than FIX_FRESH_S (a phone standing still gets
   * no new fixes from the watch), and before resending an action the server
   * refused with need_location. Null: none to be had.
   */
  freshFix?: () => Promise<RoomFix | null>;
};

/** Position telemetry at a walking pace (LiveLink.sendPosition: once a second). */
export const POSITION_EVERY_MS = 1000;
/** The fewest milliseconds between two scoreboard asks for newcomers. */
const BOARD_EVERY_MS = 5000;

export function createRoomSession(deps: RoomSessionDeps) {
  const clock = deps.clock ?? realClock;
  const { client, gameId } = deps;
  const store = emitter<RoomSessionState>({ gameId, terms: null, anchors: [], joined: false, joining: false, problem: null, fight: INITIAL_FIGHT });
  const outbox = new RoomOutbox((events) => sendEvents(client, gameId, events), clock, deps.verdictWaitMs);

  let socket: SocketLike | null = null;
  let wantsLink = false;
  /** Bumped by leave(): a join whose reply lands after it must not open a link. */
  let epoch = 0;
  let reconnect: Timer | null = null;
  let backoff = 500;
  let lastPositionAt = -Infinity;
  let here: RoomFix | null = null;
  let boardAskedAt = -Infinity;

  /**
   * Someone on the live map the scoreboard has not named yet (they joined
   * after our hello; the server pushes a board only every fifth event): ask
   * for the board, at most every few seconds, so they are named, not "a rival".
   */
  function nameNewcomers() {
    const f = fight();
    if (!Object.keys(f.map).some((id) => !f.players[id])) return;
    const t = clock.now();
    if (t - boardAskedAt < BOARD_EVERY_MS) return;
    boardAskedAt = t;
    gameState(client, gameId)
      .then((board) => setFight(onLive(fight(), { t: "scoreboard", board }, clock.now())))
      .catch(() => {});
  }

  const fight = () => store.get().fight;
  const setFight = (next: FightState) => {
    const was = fight();
    store.set({ fight: next });
    if (!isTerminal(was.gameStatus) && fightOver(next)) {
      // Nothing queued can be judged any more.
      outbox.discardAll();
    }
  };

  function connect() {
    if (!wantsLink) return;
    let greeted = false;
    const ws = deps.openSocket(liveSocketUrl(client.baseUrl, gameId, client.deviceKey()));
    socket = ws;
    ws.onmessage = (ev) => {
      if (socket !== ws) return;
      const msg = typeof ev.data === "string" ? parseLiveMessage(ev.data) : null;
      if (!msg) return;
      if (!greeted) {
        // Connected when the server has spoken, not when the socket opened.
        greeted = true;
        backoff = 500;
        setFight({ ...fight(), connected: true });
        outbox.networkReturned();
      }
      setFight(onLive(fight(), msg, clock.now()));
      if (msg.t === "map") nameNewcomers();
    };
    const dropped = () => {
      if (socket !== ws) return;
      socket = null;
      if (fight().connected) setFight({ ...fight(), connected: false });
      if (!wantsLink) return;
      reconnect = clock.setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 10000);
    };
    ws.onclose = dropped;
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        // already closed
      }
      dropped();
    };
  }

  /**
   * Attach where the player is, so the server can judge where the action
   * happens, with how good and how old that fix is (fixInfo.ts). Omitted,
   * never faked.
   */
  const located = (payload: Record<string, unknown>) => (here ? { ...payload, lat: here.lat, lng: here.lng, ...locatedFields(here, clock.now()) } : payload);

  /** A fresh fix, when the last one is old (or for a resend). Never throws. */
  async function refreshHere(force: boolean): Promise<void> {
    if (!deps.freshFix || (!force && here && fixIsFresh(here, clock.now()))) return;
    try {
      const f = await deps.freshFix();
      if (f) here = f;
    } catch {
      // keep the last fix; the server says if it is too old
    }
  }

  async function act(kind: EventKind, payload: Record<string, unknown>, extra: { weapon?: HeldWeapon; target?: string } = {}): Promise<Verdict> {
    const sentAt = clock.now();
    if (kind !== "respawn") await refreshHere(false);
    let v = await outbox.submit(kind, located(payload));
    // No usable fix on the server's side: nothing was judged or journalled,
    // so get a fresh fix and send the same action again, a few times at most.
    if (isNeedLocation(v)) {
      setFight(onVerdict(fight(), kind, { client_seq: v.client_seq, ok: false, reason: WAITING_FOR_LOCATION }, sentAt, clock.now(), extra));
      const first = clock.now();
      for (let attempt = 1; isNeedLocation(v); attempt++) {
        const wait = nextLocationRetry(attempt, clock.now() - first);
        if (wait === null) break;
        await new Promise<void>((r) => clock.setTimeout(r, wait));
        await refreshHere(true);
        if (!here) continue;
        v = await outbox.submit(kind, located(payload));
      }
    }
    setFight(onVerdict(fight(), kind, v, sentAt, clock.now(), extra));
    return v;
  }

  const session = {
    get: store.get,
    subscribe: store.subscribe,

    /** The lobby: what this Room is, and its points. */
    async load(): Promise<void> {
      store.set({ problem: null });
      try {
        const [terms, anchors] = await Promise.all([gameTerms(client, gameId), gameAnchors(client, gameId).catch(() => [] as GameAnchor[])]);
        store.set({ terms, anchors });
        if (isTerminal(terms.status)) setFight(onLive(fight(), { t: "game", status: terms.status }, clock.now()));
      } catch (e) {
        store.set({ problem: messageOf(e) });
      }
    },

    /** Join (a rejoin gives back the same row and balance), then open the live link. */
    async join(handle: string, side: string | null): Promise<boolean> {
      store.set({ joining: true, problem: null });
      const mine = epoch;
      try {
        const r = await joinGame(client, gameId, handle, side);
        if (mine !== epoch) return false;
        setFight({ ...fight(), playerId: r.player_id, faction: r.faction ?? null, tokens: r.tokens ?? r.starting_tokens ?? fight().tokens });
        store.set({ joined: true, joining: false });
        if (!store.get().anchors.length) {
          gameAnchors(client, gameId)
            .then((anchors) => store.set({ anchors }))
            .catch(() => {});
        }
        outbox.resume();
        wantsLink = true;
        if (!socket) connect();
        return true;
      } catch (e) {
        store.set({ joining: false, problem: messageOf(e) });
        return false;
      }
    },

    /** Close the link and stop retrying. Safe to call more than once. */
    leave() {
      epoch++;
      wantsLink = false;
      if (reconnect) clock.clearTimeout(reconnect);
      reconnect = null;
      const ws = socket;
      socket = null;
      try {
        ws?.close();
      } catch {
        // already closed
      }
      outbox.stop();
      if (fight().connected) setFight({ ...fight(), connected: false });
    },

    /** Where the phone is; sent on the link at a walking pace for the live map. */
    setPosition(fix: RoomFix | null, heading: number | null) {
      here = fix ? { ...fix } : null;
      if (!fix || !socket || !fight().connected) return;
      const t = clock.now();
      if (t - lastPositionAt < POSITION_EVERY_MS) return;
      lastPositionAt = t;
      try {
        // accuracy_m, fix_age_s, mocked/simulated ride along (the server ignores what it does not read).
        socket.send(JSON.stringify({ t: "pos", lat: fix.lat, lng: fix.lng, alt: 0, heading: heading ?? 0, ...locatedFields(fix, t) }));
      } catch {
        // Telemetry: dropped, the next one is a second away.
      }
    },

    pickUp(anchor: GameAnchor): Promise<Verdict> {
      const weapon: HeldWeapon = { name: weaponName(anchor), range: anchor.payload.range_m ?? null, damage: anchor.payload.damage ?? null };
      return act("pickup", { weapon: weapon.name }, { weapon });
    },

    /** A hit on another player; `range` is this phone's GPS measurement, range checked by the server. */
    hit(target: string, range: number): Promise<Verdict> {
      return act("hit", { target, range_m: Math.round(range * 10) / 10 }, { target });
    },

    capture(anchorId: string): Promise<Verdict> {
      return act("capture", { anchor: anchorId });
    },

    /** The server judges the answer against the question it kept. */
    answerTrivia(anchorId: string, answer: number): Promise<Verdict> {
      return act("trivia_answer", { anchor: anchorId, answer });
    },

    /** A request: the server holds the timer, so a refusal is normal. */
    respawn(): Promise<Verdict> {
      return act("respawn", {});
    },

    queueDepth: () => outbox.depth,
  };
  return session;
}

export type RoomSession = ReturnType<typeof createRoomSession>;
