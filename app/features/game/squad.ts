// Squad up in person: your friend's hero joins your next 3D fight as the ally.
// Against costquest-backend app/roam_squad.py (branch squad-up).
//
// Two ways in, both proven to the server by both phones:
//   - iPhones: hold the phones together. The same beacon as the friend add
//     (FriendBeaconIsland.swift, friendsNearby.ts) finds the other phone and
//     measures it with UWB; under 0.5 m the claim fires on its own at
//     POST /v1/roam/squad/nearby. The pairing counts once both phones have
//     claimed each other within 90 s, from within 100 m, each with a UWB
//     reading under 0.5 m.
//   - Anything else (Android, an iPhone without UWB): one phone shows a squad
//     code and its QR (cosquest://squad/<code>, so the other phone's camera
//     opens it), the other scans or types it (POST /v1/roam/squad/join, within
//     50 m of where the code was made). The shower learns it worked by asking
//     /v1/roam/squad/status.
//
// Either way each phone gets a short-lived token (30 min). The next 3D fight
// started with it (client.duelStart sends `squad`) carries the friend's hero
// in its stored setup (setup.ally: handle, avatar), which the fight casts as
// the ally; the rules are untouched, so the judge is too. A judged fight
// fought together pays a small bonus (outcome.squad). The bonus is the
// server's call and is capped per pair per day.
//
// Pure: the client, the position and the clock are injected (tested in
// features/game/__tests__/squad.test.ts). The app's one model lives in
// squadRuntime.ts.
import { type GameClient, GameError } from "./client.ts";
import { cleanCode, CODE_LEN } from "./friends.ts";
import type { NearbyClaimer } from "./friendsNearby.ts";
import type { LatLng } from "./geo.ts";

// ---------- wire (roam_squad.py) ----------

export type SquadAlly = { handle: string; avatar: string | null; weapon_class: string | null; faction: string | null };

/** A live pairing: this phone's token and the friend who joins its next fight. */
export type Squad = {
  token: string;
  /** ms since the epoch, by the server's clock as the phone read it. */
  expiresAt: number;
  via: "uwb" | "code";
  bonusXp: number;
  ally: SquadAlly;
};

export type SquadCode = { code: string; expiresAt: number; link: string };

/** setup.ally of a duel start: the friend in this fight. */
export type SetupAlly = { handle: string; avatar: string | null; via: string | null; bonusXp: number };

/** outcome.squad of a duel finish: what fighting together paid. */
export type SquadPaid = { xp: number; handle: string };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function timeOf(v: unknown, now: number, ttl: unknown): number {
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  if (Number.isFinite(t)) return t;
  return num(ttl) > 0 ? now + num(ttl) * 1000 : now;
}

/** A squad from /nearby, /join or /status's `active`, or null when it is not one. */
export function parseSquad(raw: unknown, now: number): Squad | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const token = str(r.token);
  const a = r.ally && typeof r.ally === "object" ? (r.ally as Record<string, unknown>) : null;
  if (!token || !a) return null;
  return {
    token,
    expiresAt: timeOf(r.expires_at, now, r.ttl_s),
    via: r.via === "code" ? "code" : "uwb",
    bonusXp: Math.max(0, Math.round(num(r.bonus_xp))),
    ally: { handle: str(a.handle) ?? "Your friend", avatar: str(a.avatar), weapon_class: str(a.weapon_class), faction: str(a.faction) },
  };
}

export function parseSquadCode(raw: unknown, now: number): SquadCode | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const code = str(r.code);
  if (!code) return null;
  return { code, expiresAt: timeOf(r.expires_at, now, r.ttl_s), link: str(r.link) ?? squadLink(code) };
}

/** The friend in a duel start's setup, or null (the AI ally). */
export function setupAlly(setup: unknown): SetupAlly | null {
  if (!setup || typeof setup !== "object") return null;
  const a = (setup as Record<string, unknown>).ally;
  if (!a || typeof a !== "object") return null;
  const r = a as Record<string, unknown>;
  const handle = str(r.handle);
  if (!handle) return null;
  return { handle, avatar: str(r.avatar), via: str(r.via), bonusXp: Math.max(0, Math.round(num(r.bonus_xp))) };
}

/** What fighting together paid, from a duel outcome, or null. */
export function squadPaid(outcome: unknown): SquadPaid | null {
  if (!outcome || typeof outcome !== "object") return null;
  const s = (outcome as Record<string, unknown>).squad;
  if (!s || typeof s !== "object") return null;
  const r = s as Record<string, unknown>;
  const xp = Math.round(num(r.xp));
  return xp > 0 ? { xp, handle: str(r.handle) ?? "your friend" } : null;
}

// ---------- links ----------

export function squadLink(code: string): string {
  return `cosquest://squad/${code}`;
}

/** The code in a cosquest://squad/<code> link (or the website's /squad/<code>), else null. */
export function codeFromSquadLink(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const m = url.trim().match(/^(?:cosquest:\/\/|https?:\/\/[^/]+\/|\/)?squad\/([A-Za-z0-9]{4,12})\/?(?:[?#].*)?$/i);
  if (!m) return null;
  const code = cleanCode(m[1]);
  return code.length === CODE_LEN ? code : null;
}

// ---------- what the screen says ----------

export function isLive(s: Squad | null, now: number): s is Squad {
  return s !== null && s.expiresAt > now;
}

/** "Mia joins your next fight" */
export function squadLine(s: Squad): string {
  return `${s.ally.handle} joins your next fight`;
}

/** "+30 XP if you fight together", or the line for a pair who already had their bonuses today. */
export function bonusLine(s: Squad): string {
  return s.bonusXp > 0 ? `+${s.bonusXp} XP for fighting together` : "Today's squad bonus is used up. You still fight side by side.";
}

/** The result card's line. */
export function paidLine(p: SquadPaid): string {
  return `Fought with ${p.handle}: +${p.xp} XP`;
}

/** The fight's squad pill: the hero and the friend's hero, both players. */
export const SQUAD_PLAYERS_TEXT = "2/2";

// ---------- the hold-phones claim ----------

/** The squad route for the shared hold-phones model (friendsNearby.ts). */
export function squadClaimer(onSquad: (s: Squad) => void, now: () => number = () => Date.now()): NearbyClaimer {
  return {
    path: "v1/roam/squad/nearby",
    done: (r, name) => {
      if (!r.squad) return null;
      const s = parseSquad(r, now());
      return s ? `Squad up! ${s.ally.handle || name} joins your next fight` : null;
    },
    onDone: (r) => {
      const s = parseSquad(r, now());
      if (s) onSquad(s);
    },
    waiting: (name) => `Waiting for ${name} to squad up too…`,
    gaveUp: (name) => `Didn't hear back from ${name}. Make sure Squad up is open on their phone too.`,
  };
}

// ---------- the model ----------

export type SquadState = {
  squad: Squad | null;
  code: SquadCode | null;
  busy: boolean;
  error: string | null;
  /** Goes up once per new pairing: the sheet's cue for the fanfare. */
  celebrations: number;
  /** A code a squad link brought in, waiting for the sheet to join it. */
  pendingCode: string | null;
};

export const SQUAD_INITIAL: SquadState = { squad: null, code: null, busy: false, error: null, celebrations: 0, pendingCode: null };

export const STATUS_EVERY_MS = 2_000;

export type SquadDeps = {
  client: () => Pick<GameClient, "deviceKey" | "request">;
  here: () => LatLng | null;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
};

function message(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Something went wrong. Try again.";
}

export function createSquadModel(deps: SquadDeps) {
  let state: SquadState = SQUAD_INITIAL;
  const listeners = new Set<() => void>();
  const now = deps.now ?? (() => Date.now());
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((t: unknown) => clearTimeout(t as ReturnType<typeof setTimeout>));
  let poll: unknown = null;
  let polling = 0;

  const set = (patch: Partial<SquadState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };

  const stopPolling = () => {
    polling++;
    if (poll !== null) clearTimer(poll);
    poll = null;
  };

  const model = {
    get: (): SquadState => {
      // An expired pairing or code is gone without anyone having to say so.
      const t = now();
      if ((state.squad && !isLive(state.squad, t)) || (state.code && state.code.expiresAt <= t)) {
        state = { ...state, squad: isLive(state.squad, t) ? state.squad : null, code: state.code && state.code.expiresAt > t ? state.code : null };
      }
      return state;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    /** A new pairing (from either way in). */
    paired(s: Squad) {
      stopPolling();
      set({ squad: s, code: null, error: null, busy: false, celebrations: state.celebrations + 1 });
    },

    /** The token for the next 3D fight, if a pairing is live. */
    token(): string | null {
      const s = model.get().squad;
      return s ? s.token : null;
    },

    /** A fight started with the token: the server took it (setup.ally) or refused it (gone either way). */
    used() {
      if (state.squad) set({ squad: null });
    },

    /** The server's view, on opening the sheet or the game: a pairing made while away. */
    async refresh() {
      try {
        const c = deps.client();
        const r = await c.request<{ active?: unknown }>("POST", "v1/roam/squad/status", { body: { device_key: c.deviceKey() }, signed: true });
        const s = parseSquad(r?.active ?? null, now());
        if (s && s.token !== state.squad?.token) model.paired(s);
        else if (!s && state.squad) set({ squad: null });
      } catch {
        // Offline or signed out: keep what we have.
      }
    },

    /** Show a code for the other phone to scan or type, and listen for it. */
    async makeCode() {
      const here = deps.here();
      if (!here) return set({ error: "Waiting for your location." });
      set({ busy: true, error: null });
      try {
        const c = deps.client();
        const r = await c.request<unknown>("POST", "v1/roam/squad/code", { body: { device_key: c.deviceKey(), lat: here.lat, lng: here.lng }, signed: true });
        const code = parseSquadCode(r, now());
        if (!code) throw new GameError("http", "Couldn't make a code. Try again.");
        set({ code, busy: false });
        model.listen();
      } catch (e) {
        set({ busy: false, error: message(e) });
      }
    },

    /** Ask the server every 2 s until the code is used or runs out. */
    listen() {
      stopPolling();
      const gen = ++polling;
      const tick = async () => {
        if (gen !== polling) return;
        const code = model.get().code;
        if (!code) return;
        await model.refresh();
        if (gen !== polling || !model.get().code) return;
        poll = setTimer(() => void tick(), STATUS_EVERY_MS);
      };
      poll = setTimer(() => void tick(), STATUS_EVERY_MS);
    },

    /** The sheet went away: stop asking (the code still works until it runs out). */
    stopListening: stopPolling,

    /** Join the squad code on the other phone (typed, or a scanned squad link). */
    async join(typed: string) {
      const code = cleanCode(typed);
      if (code.length !== CODE_LEN) return set({ error: "A squad code is six letters and numbers." });
      const here = deps.here();
      if (!here) return set({ error: "Waiting for your location." });
      set({ busy: true, error: null, pendingCode: null });
      try {
        const c = deps.client();
        const r = await c.request<unknown>("POST", "v1/roam/squad/join", { body: { device_key: c.deviceKey(), code, lat: here.lat, lng: here.lng }, signed: true });
        const s = parseSquad(r, now());
        if (!s) throw new GameError("http", "That didn't work. Ask for a fresh code.");
        model.paired(s);
      } catch (e) {
        set({ busy: false, error: message(e) });
      }
    },

    /** A squad link opened the app: the sheet joins it once it is on screen. */
    open(code: string) {
      set({ pendingCode: cleanCode(code), error: null });
    },

    /** Fight alone after all. */
    async leave() {
      stopPolling();
      set({ squad: null, code: null, error: null });
      try {
        const c = deps.client();
        await c.request("POST", "v1/roam/squad/leave", { body: { device_key: c.deviceKey() }, signed: true });
      } catch {
        // The token runs out on its own.
      }
    },
  };
  return model;
}

export type SquadModel = ReturnType<typeof createSquadModel>;
