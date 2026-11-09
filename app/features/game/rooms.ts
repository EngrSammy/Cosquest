// Rooms: the arena battle, anywhere. The TypeScript twin of costquest-ios
// Features/RoomsFeature.swift (start a Room, rooms near you, join with a
// code, the map's beacons) and of the Events game a Room IS (Game/
// GameSession.swift, Game/Targeting.swift, Game/LiveLink.swift, Net/Wire.swift).
//
// What a Room fight is on the wire (costquest-backend app/rooms.py, engine.py,
// main.py /v1/games/*): an ordinary Events game, free, in faction mode with
// the five Roam factions, laid out by the server around the host (three
// weapons, two shrines, three trivia chests, 3 to 12 m away). Players send
// events (pickup, hit, capture, trivia_answer, respawn) and the server's
// engine judges every one against its own state: the cooldowns, the tokens,
// who is down, friendly fire, the hit's range against max_range_m, the venue
// geofence. Nothing is simulated on the phone. It is NOT the Guardian Duel
// engine (features/game/duel) and there is no Unity netcode: AR on iOS is how
// the arena is drawn, and ultra wideband only sharpens a range that iOS
// otherwise takes from GPS (Targeting.swift), which is what this port uses.
//
// Pure: the client is passed in (tested in features/game/__tests__/rooms.test.ts).
import type { GameClient } from "./client.ts";
import { bearingDeg, distanceM, type LatLng } from "./geo.ts";
import { parseServerDate } from "./wire.ts";

// ---------- wire (RoomsFeature.swift, Net/Wire.swift) ----------

export type RoomCreated = {
  game_id: string;
  code: string;
  ends_at?: string | null;
  title?: string | null;
  private?: boolean | null;
};

export type NearbyRoom = {
  game_id: string;
  title?: string | null;
  host_handle?: string | null;
  players?: number | null;
  ends_at?: string | null;
  distance_m?: number | null;
  lat: number;
  lng: number;
  code?: string | null;
  host_faction?: string | null;
};

export type RoomFound = { game_id: string; ends_at?: string | null };

/** GET /v1/games/{id}: what a player may know before joining (the fields a Room uses). */
export type GameTerms = {
  game_id: string;
  title: string;
  status: string;
  mode?: string | null;
  entry_coins?: number | null;
  entry_fee_cents?: number | null;
  venue?: { lat: number; lng: number; radius_m?: number | null } | null;
  starts_at?: string | null;
  ends_at?: string | null;
  require_signatures?: boolean | null;
  factions: { name: string; color?: string | null; players?: number | null }[];
  players_joined?: number | null;
};

export type JoinResult = {
  player_id: string;
  faction?: string | null;
  tokens?: number | null;
  /** On a rejoin, the player's CURRENT balance (Wire.swift JoinResult.balance). */
  starting_tokens?: number | null;
  resumed?: boolean | null;
};

/** An anchor as a player may see it: a trivia chest has no answer (main.py public_anchor_payload). */
export type GameAnchor = {
  id: string;
  asset: string;
  /** "weapon" | "capture_point" | "trivia" (a Room has only these three). */
  kind: string;
  lat: number;
  lng: number;
  alt_m?: number | null;
  faction?: string | null;
  payload: {
    q?: string | null;
    choices?: string[] | null;
    name?: string | null;
    range_m?: number | null;
    damage?: number | null;
    label?: string | null;
  };
};

export type FactionScore = { faction: string; tokens: number };
export type PlayerState = { tokens: number; state: string; faction?: string | null; handle?: string | null };
export type Scoreboard = {
  factions: FactionScore[];
  players: Record<string, PlayerState>;
  captures?: Record<string, string> | null;
};

/** The engine's answer to one event (Wire.swift Verdict). */
export type Verdict = {
  client_seq: number;
  ok: boolean;
  reason?: string | null;
  deltas?: Record<string, number> | null;
  drained?: number | null;
  downed?: string | null;
  correct?: boolean | null;
  duplicate?: boolean | null;
  /** A capture's notes (engine.py): the shrine, and the side that now holds it. */
  anchor?: string | null;
  faction?: string | null;
  /** A refusal's code, e.g. "need_location" with retry true: no usable fix, nothing judged, safe to send again (fixInfo.ts). */
  code?: string | null;
  retry?: boolean | null;
};

export type EventKind = "pickup" | "hit" | "capture" | "trivia_answer" | "respawn";
export type DeviceEvent = { client_seq: number; kind: EventKind; payload: Record<string, unknown> };

/** One player on the live map (livemap.py: {lat,lng,alt,heading,faction,state}). */
export type MapPlayer = {
  lat: number;
  lng: number;
  alt?: number | null;
  heading?: number | null;
  faction?: string | null;
  state?: string | null;
};

// ---------- the Room routes (app/rooms.py) ----------

export const ROOM_MIN_MINUTES = 5;
export const ROOM_MAX_MINUTES = 20;
export const ROOM_DEFAULT_MINUTES = 10;
export const ROOM_CODE_LENGTH = 6;

/** Start a Room here. One live Room per host, three an hour: refusals come back in the server's words. */
export async function createRoom(
  client: GameClient,
  req: { lat: number; lng: number; accuracy: number; minutes: number; private: boolean },
): Promise<RoomCreated> {
  const minutes = Math.min(ROOM_MAX_MINUTES, Math.max(ROOM_MIN_MINUTES, Math.round(req.minutes)));
  return client.request<RoomCreated>("POST", "v1/rooms", {
    body: {
      device_key: client.deviceKey(),
      lat: req.lat,
      lng: req.lng,
      accuracy_m: Math.min(5000, Math.max(0, req.accuracy)),
      minutes,
      private: req.private,
    },
    signed: true,
  });
}

/** Public live Rooms within 400 m. A bare list; a wrapped one is taken too (NearbyRooms). */
export async function nearbyRooms(client: GameClient, lat: number, lng: number): Promise<NearbyRoom[]> {
  const got = await client.retrying(() => client.request<unknown>("GET", "v1/rooms/nearby", { query: { lat, lng } }));
  const list = Array.isArray(got) ? got : got && typeof got === "object" && Array.isArray((got as { rooms?: unknown }).rooms) ? (got as { rooms: unknown[] }).rooms : [];
  return list.filter(isNearbyRoom);
}

function isNearbyRoom(x: unknown): x is NearbyRoom {
  const r = x as NearbyRoom;
  return !!r && typeof r.game_id === "string" && typeof r.lat === "number" && typeof r.lng === "number";
}

/** A live Room by its code, private ones included. 404: "No live Room with that code." */
export async function findRoom(client: GameClient, code: string): Promise<RoomFound> {
  return client.request<RoomFound>("POST", "v1/rooms/code", {
    body: { device_key: client.deviceKey(), code: normaliseCode(code) },
    signed: true,
  });
}

// ---------- the Events game a Room is (main.py /v1/games/*) ----------

const gamePath = (gameId: string, rest = "") => `v1/games/${encodeURIComponent(gameId)}${rest}`;

export async function gameTerms(client: GameClient, gameId: string): Promise<GameTerms> {
  const t = await client.retrying(() => client.request<GameTerms>("GET", gamePath(gameId)));
  return { ...t, factions: Array.isArray(t.factions) ? t.factions : [] };
}

/**
 * Join (or rejoin: the server hands back the existing row). Unsigned, as on
 * iOS when no payout destination is named; a Room never pays money.
 */
export async function joinGame(client: GameClient, gameId: string, handle: string, faction: string | null): Promise<JoinResult> {
  const body: Record<string, unknown> = { handle: cleanHandle(handle), device_key: client.deviceKey() };
  if (faction) body.faction = faction;
  return client.request<JoinResult>("POST", gamePath(gameId, "/join"), { body });
}

export async function gameAnchors(client: GameClient, gameId: string): Promise<GameAnchor[]> {
  const got = await client.retrying(() => client.request<unknown>("GET", gamePath(gameId, "/anchors")));
  return Array.isArray(got) ? (got as GameAnchor[]).map((a) => ({ ...a, payload: a.payload ?? {} })) : [];
}

export async function gameState(client: GameClient, gameId: string): Promise<Scoreboard> {
  return parseScoreboard(await client.request<unknown>("GET", gamePath(gameId, "/state"))) ?? { factions: [], players: {}, captures: {} };
}

/** Send a batch of what the player did; one verdict per event. Signed, as iOS sends it. */
export async function sendEvents(client: GameClient, gameId: string, events: DeviceEvent[]): Promise<Verdict[]> {
  const body = { device_key: client.deviceKey(), events };
  const got = await client.retrying(() => client.request<{ results?: unknown[] }>("POST", gamePath(gameId, "/events"), { body, signed: true }));
  return (got.results ?? []).map(parseVerdict).filter((v): v is Verdict => v !== null);
}

/**
 * A verdict, flat or nested: a replayed event comes back as
 * {client_seq, duplicate: true, result: {ok, reason, ...}} (Verdict.init(from:)).
 */
export function parseVerdict(raw: unknown): Verdict | null {
  if (!raw || typeof raw !== "object") return null;
  const top = raw as Record<string, unknown>;
  if (typeof top.client_seq !== "number") return null;
  const r = (top.result && typeof top.result === "object" ? top.result : top) as Record<string, unknown>;
  return {
    client_seq: top.client_seq,
    ok: r.ok === true,
    reason: typeof r.reason === "string" ? r.reason : null,
    deltas: r.deltas && typeof r.deltas === "object" ? (r.deltas as Record<string, number>) : null,
    drained: typeof r.drained === "number" ? r.drained : null,
    downed: typeof r.downed === "string" ? r.downed : null,
    correct: typeof r.correct === "boolean" ? r.correct : null,
    duplicate: top.duplicate === true ? true : null,
    ...(typeof r.anchor === "string" ? { anchor: r.anchor } : {}),
    ...(typeof r.faction === "string" ? { faction: r.faction } : {}),
    ...(typeof r.code === "string" ? { code: r.code } : {}),
    ...(typeof r.retry === "boolean" ? { retry: r.retry } : {}),
  };
}

export function parseScoreboard(raw: unknown): Scoreboard | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.factions) || !o.players || typeof o.players !== "object") return null;
  return {
    factions: (o.factions as FactionScore[]).filter((f) => f && typeof f.faction === "string").map((f) => ({ faction: f.faction, tokens: Number(f.tokens) || 0 })),
    players: o.players as Record<string, PlayerState>,
    captures: o.captures && typeof o.captures === "object" ? (o.captures as Record<string, string>) : {},
  };
}

// ---------- small pure helpers (RoomsModel, BattleSheet) ----------

/** What a code field holds: capitals and digits, six at most (BattleSheet.codePanel). */
export function normaliseCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, ROOM_CODE_LENGTH);
}

/** A handle the server takes (2 to 40 characters), or a stand-in. */
export function cleanHandle(handle: string | null | undefined): string {
  const h = (handle ?? "").trim().slice(0, 40);
  return h.length >= 2 ? h : "Player";
}

export function roomEnded(iso: string | null | undefined, now: number = Date.now()): boolean {
  const at = parseServerDate(iso);
  return at !== null && at < now;
}

/** "Live", "Ending", "40 s left", "7 min left" (RoomsModel.timeLeft). */
export function timeLeft(iso: string | null | undefined, now: number = Date.now()): string {
  const at = parseServerDate(iso);
  if (at === null) return "Live";
  const s = Math.trunc((at - now) / 1000);
  if (s <= 0) return "Ending";
  if (s < 60) return `${s} s left`;
  return `${Math.ceil(s / 60)} min left`;
}

/** Still live, nearest first (RoomsModel.refresh). */
export function liveRooms(rooms: NearbyRoom[], now: number = Date.now()): NearbyRoom[] {
  return rooms.filter((r) => !roomEnded(r.ends_at, now)).sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));
}

/**
 * The player's side in a Room: their Roam faction, matched against the game's
 * sides by id or display name (CostQuestApp roomSide, EntryView presetSide).
 */
export function presetSide(sides: { name: string }[], wanted: (string | null | undefined)[]): string | null {
  const want = new Set(wanted.filter((w): w is string => !!w).map((w) => w.toLowerCase()));
  return sides.find((s) => want.has(s.name.toLowerCase()))?.name ?? null;
}

// The map's beacons (RoomBeacons).
export const BEACON_PREFIX = "room:";
export const beaconId = (room: { game_id: string }) => BEACON_PREFIX + room.game_id;
export const gameIdFromBeacon = (id: string): string | null => (id.startsWith(BEACON_PREFIX) ? id.slice(BEACON_PREFIX.length) : null);

/** The live link's address: the socket is bound to this device's key (LiveLink.runLoop). */
export function liveSocketUrl(baseUrl: string, gameId: string, deviceKey: string): string {
  // https → wss, http → ws.
  const base = baseUrl.replace(/\/+$/, "").replace(/^http/i, "ws");
  return `${base}/${gamePath(gameId, "/ws")}?device_key=${encodeURIComponent(deviceKey)}`;
}

// ---------- the live link's messages (LiveLink.decode) ----------

export type LiveMessage =
  | { t: "hello"; you: string | null; board: Scoreboard }
  | { t: "scoreboard"; board: Scoreboard }
  | { t: "event"; kind: string; actor: string; deltas: Record<string, number> }
  | { t: "downed"; player: string; by: string | null }
  | { t: "game"; status: string }
  | { t: "map"; players: Record<string, MapPlayer> }
  | { t: "encounter"; a: string; b: string; distance: number };

/** Anything unrecognised is dropped, never an error: the server may grow new types. */
export function parseLiveMessage(text: string): LiveMessage | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!o || typeof o !== "object" || typeof o.t !== "string") return null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  switch (o.t) {
    case "hello": {
      const board = parseScoreboard(o);
      return board ? { t: "hello", you: typeof o.you === "string" ? o.you : null, board } : null;
    }
    case "scoreboard": {
      const board = parseScoreboard(o);
      return board ? { t: "scoreboard", board } : null;
    }
    case "event":
      return { t: "event", kind: str(o.kind), actor: str(o.actor), deltas: o.deltas && typeof o.deltas === "object" ? (o.deltas as Record<string, number>) : {} };
    case "downed":
      return { t: "downed", player: str(o.player), by: typeof o.by === "string" ? o.by : null };
    case "game":
      return { t: "game", status: str(o.status) };
    case "map": {
      if (!o.players || typeof o.players !== "object") return null;
      const players: Record<string, MapPlayer> = {};
      for (const [id, p] of Object.entries(o.players as Record<string, MapPlayer>)) {
        if (p && typeof p.lat === "number" && typeof p.lng === "number") players[id] = p;
      }
      return { t: "map", players };
    }
    case "encounter":
      return { t: "encounter", a: str(o.a), b: str(o.b), distance: typeof o.distance_m === "number" ? o.distance_m : 0 };
    default:
      return null;
  }
}

// ---------- aiming (Game/Targeting.swift, the GPS path) ----------

export type Target = {
  id: string;
  label: string;
  /** Metres, from two GPS fixes: this phone's and the server's last one for them. */
  distance: number;
  /** Compass bearing to them. */
  bearing: number;
  /** Degrees between them and where the phone points. */
  offAxis: number;
  /** Always false here: no ultra wideband on this port, and the HUD says "GPS". */
  isPrecise: false;
};

/** A generous cone: a phone held at arm's length outdoors is not a precision instrument. */
export const AIM_CONE_DEG = 35;

/** The shortest angle between two bearings: 350 and 10 are twenty apart. */
export function angleDifference(a: number, b: number): number {
  const diff = Math.abs((a - b) % 360);
  return Math.min(diff, 360 - diff);
}

/**
 * Everyone this player could shoot, nearest the line of the phone first.
 * Targets the engine would refuse (own side, not active) are never offered.
 * The range travels to the server as this device's claim and is range
 * checked there against max_range_m.
 */
export function aimTargets(args: {
  here: LatLng | null;
  heading: number | null;
  playerId: string | null;
  faction: string | null;
  map: Record<string, MapPlayer>;
  players: Record<string, PlayerState>;
}): Target[] {
  const { here, heading, playerId, faction, map, players } = args;
  if (!here || heading === null || !playerId) return [];
  const out: Target[] = [];
  for (const [id, p] of Object.entries(map)) {
    if (id === playerId) continue;
    const state = players[id]?.state ?? p.state;
    if (state !== "active") continue;
    const side = players[id]?.faction ?? p.faction ?? null;
    if (faction && side === faction) continue;
    const bearing = bearingDeg(here, p);
    const offAxis = angleDifference(bearing, heading);
    if (offAxis >= AIM_CONE_DEG) continue;
    out.push({ id, label: handleOf(players, id) ?? "Rival", distance: distanceM(here, p), bearing, offAxis, isPrecise: false });
  }
  return out.sort((a, b) => a.offAxis - b.offAxis);
}

export function handleOf(players: Record<string, PlayerState>, id: string): string | null {
  const h = players[id]?.handle?.trim();
  return h ? h : null;
}

// ---------- the arena's points (AR/FieldModel.nearestActionable, UI/GameHUD) ----------

/** Arm's reach at a venue (FieldModel: 6 m), measured here by GPS. */
export const ANCHOR_REACH_M = 6;
const ACTIONABLE = ["capture_point", "trivia", "weapon"];

export function nearestActionable(anchors: GameAnchor[], here: LatLng | null, reach = ANCHOR_REACH_M): { anchor: GameAnchor; distance: number } | null {
  if (!here) return null;
  let best: { anchor: GameAnchor; distance: number } | null = null;
  for (const a of anchors) {
    if (!ACTIONABLE.includes(a.kind)) continue;
    const d = distanceM(here, a);
    if (d < reach && (!best || d < best.distance)) best = { anchor: a, distance: d };
  }
  return best;
}

/** The nearest point of a kind (or any actionable one), for the "walk to" hint. */
export function nearestAnchor(anchors: GameAnchor[], here: LatLng | null, kind?: string): { anchor: GameAnchor; distance: number; bearing: number } | null {
  if (!here) return null;
  let best: { anchor: GameAnchor; distance: number; bearing: number } | null = null;
  for (const a of anchors) {
    if (kind ? a.kind !== kind : !ACTIONABLE.includes(a.kind)) continue;
    const d = distanceM(here, a);
    if (!best || d < best.distance) best = { anchor: a, distance: d, bearing: bearingDeg(here, a) };
  }
  return best;
}

export function weaponName(a: GameAnchor): string {
  return a.payload.name || a.asset.charAt(0).toUpperCase() + a.asset.slice(1);
}

/** The anchor button's words (GameHUD.title(for:)). */
export function anchorTitle(a: GameAnchor, captures: Record<string, string>, faction: string | null): string {
  switch (a.kind) {
    case "trivia":
      return "Answer the question here";
    case "weapon":
      return `Pick up the ${weaponName(a)}`;
    case "capture_point":
      return faction && captures[a.id] === faction ? "Your side holds this point" : "Take this point";
    default:
      return a.payload.label || "Use this";
  }
}

// ---------- the server's reasons, for a feed read mid-fight (GameSession.friendly) ----------

/** "45s", "2 min", "1 min 30s". */
export function countdown(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m} min` : `${m} min ${r}s`;
}

const STAMP = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?/;

/**
 * Player copy for an engine reason. The known ones become short sentences
 * (iOS's table); anything else is shown in the server's own words.
 */
export function friendlyReason(reason: string | null | undefined, now: number = Date.now()): { text: string; respawnAt: number | null } {
  const original = (reason ?? "").trim();
  const raw = original.toLowerCase();
  const has = (n: string) => raw.includes(n);
  if (has("respawn locked")) {
    const m = original.match(STAMP);
    let at: number | null = null;
    if (m) {
      let stamp = m[0].replace(/\.\d+/, "");
      if (!/(Z|[+-]\d{2}:?\d{2})$/.test(stamp)) stamp += "Z";
      const parsed = Date.parse(stamp);
      at = Number.isFinite(parsed) ? parsed : null;
    }
    return at === null ? { text: "You can respawn shortly", respawnAt: null } : { text: `You can respawn in ${countdown((at - now) / 1000)}`, respawnAt: at };
  }
  const t = (text: string) => ({ text, respawnAt: null });
  if (raw.startsWith("queued")) return t("No signal. Sent when you're back online");
  if (has("geofence") || has("outside venue") || has("outside the venue")) return t("You're outside the play area");
  if (has("no weapon held")) return t("Pick up a weapon first");
  if (has("no weapon named")) return t("Nothing to pick up there");
  if (has("pickup on cooldown")) return t("That pickup is recharging");
  if (has("hit on cooldown")) return t("Reloading");
  if (has("cooldown")) return t("That's recharging");
  if (has("no respawns left") || raw === "player is eliminated") return t("You're out of respawns");
  if (raw === "player is respawning" || raw === "player is downed") return t("You're down. Respawn first");
  if (has("not downed")) return t("You're already in play");
  if (has("invalid target")) return t("They're not in play right now");
  if (has("friendly fire")) return t("That's your own side");
  if (has("out of range")) return t("Too far away. Get closer");
  if (has("already answered")) return t("You already answered this one");
  if (has("unknown trivia anchor") || has("no anchor")) return t("That point isn't available");
  if (has("no faction")) return t("Join a side first");
  if (has("rate limit")) return t("Slow down a moment");
  if (has("signature")) return t("Couldn't verify this phone. Rejoin the game");
  if (has("not joined") || has("unknown player")) return t("You're not in this game. Rejoin to play");
  if (has("no such game")) return t("That game no longer exists");
  if (has("not live")) {
    if (has("finished") || has("settled") || has("cancelled")) return t("The game has ended");
    if (has("paused")) return t("The game is paused");
    return t("The game hasn't started yet");
  }
  return t(original || "That didn't go through");
}

/** "game is settled, not live": the status a missed broadcast would have carried. */
export function statusFromReason(reason: string | null | undefined): string | null {
  const m = (reason ?? "").match(/game is (\w+), not live/);
  return m ? m[1] : null;
}

export const TERMINAL_STATUSES = ["finished", "settled", "cancelled"];
export const isTerminal = (status: string) => TERMINAL_STATUSES.includes(status);

// ---------- the fight, as this player sees it (GameSession's state and handle()) ----------

export type FeedEntry = { id: number; text: string; refusal: boolean; at: number };
/**
 * `feel`: the haptic, as the AR field gives it (AR/FieldModel.swift): taking
 * damage is a heavy impact, a pickup a medium one, everything else the
 * success or error the tone says.
 */
export type Moment = { id: number; text: string; tone: "good" | "bad"; feel?: "heavy" | "medium" };
export type HeldWeapon = { name: string; range: number | null; damage: number | null };

export type FightState = {
  playerId: string | null;
  faction: string | null;
  tokens: number;
  held: HeldWeapon | null;
  /** "active" | "respawning" | "eliminated", straight from the server. */
  state: string;
  factionScores: FactionScore[];
  players: Record<string, PlayerState>;
  captures: Record<string, string>;
  gameStatus: string;
  connected: boolean;
  map: Record<string, MapPlayer>;
  feed: FeedEntry[];
  moment: Moment | null;
  /** When the server said a respawn becomes possible. */
  respawnAt: number | null;
  /** When the last scoreboard landed, so a verdict does not add a delta it already holds. */
  lastBoardAt: number;
  /** A counter for feed and moment ids. */
  serial: number;
};

export const INITIAL_FIGHT: FightState = {
  playerId: null,
  faction: null,
  tokens: 0,
  held: null,
  state: "active",
  factionScores: [],
  players: {},
  captures: {},
  gameStatus: "live",
  connected: false,
  map: {},
  feed: [],
  moment: null,
  respawnAt: null,
  lastBoardAt: 0,
  serial: 0,
};

const FEED_MAX = 12;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const nameOf = (s: FightState, id: string) => handleOf(s.players, id) ?? "a rival";

function addFeed(s: FightState, text: string, refusal: boolean, now: number): FightState {
  const serial = s.serial + 1;
  return { ...s, serial, feed: [{ id: serial, text, refusal, at: now }, ...s.feed].slice(0, FEED_MAX) };
}

function withMoment(s: FightState, text: string, tone: "good" | "bad", feel?: Moment["feel"]): FightState {
  const serial = s.serial + 1;
  return { ...s, serial, moment: feel ? { id: serial, text, tone, feel } : { id: serial, text, tone } };
}

function applyBoard(s: FightState, board: Scoreboard, now: number): FightState {
  const next: FightState = {
    ...s,
    lastBoardAt: now,
    factionScores: [...board.factions].sort((a, b) => b.tokens - a.tokens),
    players: board.players,
    captures: board.captures ?? {},
  };
  const mine = s.playerId ? board.players[s.playerId] : undefined;
  if (mine) {
    // The server's number wins, always.
    next.tokens = mine.tokens;
    next.state = mine.state;
    if (mine.state === "active") next.respawnAt = null;
    else next.held = null;
    next.faction = mine.faction ?? s.faction;
  }
  return next;
}

/** One message from the live link. */
export function onLive(s: FightState, msg: LiveMessage, now: number): FightState {
  switch (msg.t) {
    case "hello":
      return applyBoard({ ...s, playerId: msg.you ?? s.playerId }, msg.board, now);
    case "scoreboard":
      return applyBoard(s, msg.board, now);
    case "event": {
      // Our own action came back as a verdict already.
      if (msg.actor === s.playerId) return s;
      const delta = s.playerId ? msg.deltas[s.playerId] ?? 0 : 0;
      if (delta !== 0) {
        let next: FightState = { ...s, tokens: Math.max(0, s.tokens + delta) };
        if (delta < 0) {
          const who = nameOf(s, msg.actor);
          next = addFeed(next, `${cap(who)} took ${-delta} from you.`, true, now);
          if (msg.kind === "hit") next = withMoment(next, `Hit by ${who}, ${delta}`, "bad", "heavy");
        }
        return next;
      }
      if (msg.kind === "capture") {
        const side = s.players[msg.actor]?.faction;
        return addFeed(s, side && side !== s.faction ? `${cap(nameOf(s, msg.actor))} took a point for ${side}.` : `${cap(nameOf(s, msg.actor))} captured a point.`, false, now);
      }
      return s;
    }
    case "downed":
      if (msg.player === s.playerId) {
        const next = addFeed({ ...s, state: "respawning", held: null }, `You were downed${msg.by ? ` by ${nameOf(s, msg.by)}` : ""}.`, true, now);
        return withMoment(next, "You're down", "bad", "heavy");
      }
      return addFeed(s, `${cap(nameOf(s, msg.player))} went down.`, false, now);
    case "game": {
      if (!msg.status || msg.status === s.gameStatus) return s;
      const next = { ...s, gameStatus: msg.status };
      if (msg.status === "live") return next;
      if (isTerminal(msg.status)) return addFeed(next, "The game has ended.", true, now);
      if (msg.status === "paused") return addFeed(next, "The game is paused.", true, now);
      return addFeed(next, "The game isn't live right now.", true, now);
    }
    case "map":
      return { ...s, map: msg.players };
    case "encounter": {
      if (msg.a !== s.playerId && msg.b !== s.playerId) return s;
      const other = msg.a === s.playerId ? msg.b : msg.a;
      return addFeed(s, `${cap(nameOf(s, other))} is within ${Math.round(msg.distance)} m.`, false, now);
    }
  }
}

/**
 * This player's own verdict (GameSession.pickUp/hit/capture/answerTrivia/
 * respawn). Only the server's numbers move the balance; a refusal is said.
 */
export function onVerdict(
  s: FightState,
  kind: EventKind,
  v: Verdict,
  sentAt: number,
  now: number,
  extra: { weapon?: HeldWeapon; target?: string } = {},
): FightState {
  let next = s;
  // The balance moves on our own verdict, unless a scoreboard that already
  // includes it landed after we sent.
  const mine = s.playerId && v.ok ? v.deltas?.[s.playerId] ?? 0 : 0;
  if (mine !== 0 && s.lastBoardAt < sentAt) {
    next = { ...next, tokens: kind === "respawn" ? mine : Math.max(0, next.tokens + mine) };
  }
  if (!v.ok) {
    const status = statusFromReason(v.reason);
    if (status && status !== next.gameStatus) next = onLive(next, { t: "game", status }, now);
    const copy = friendlyReason(v.reason, now);
    if (copy.respawnAt !== null) next = { ...next, respawnAt: copy.respawnAt };
    return addFeed(next, copy.text, true, now);
  }
  switch (kind) {
    case "pickup": {
      const w = extra.weapon ?? null;
      next = { ...next, held: w };
      next = withMoment(next, `Picked up the ${w?.name ?? "weapon"}`, "good", "medium");
      return addFeed(next, `Picked up the ${w?.name ?? "weapon"}.`, false, now);
    }
    case "hit": {
      const who = extra.target ? nameOf(s, extra.target) : "a rival";
      if (v.drained != null) {
        next = withMoment(next, `Hit ${who}, +${v.drained}`, "good");
        return addFeed(next, `Took ${v.drained} from ${who}.`, false, now);
      }
      return addFeed(withMoment(next, "Hit", "good"), "Hit.", false, now);
    }
    case "capture": {
      // The server set the holder when it applied the capture; its scoreboard
      // only says so every few events, so take it from the verdict's notes.
      const faction = v.faction ?? next.faction;
      if (v.anchor && faction) next = { ...next, captures: { ...next.captures, [v.anchor]: faction } };
      return addFeed(withMoment(next, "Point captured", "good"), `Captured a point for ${next.faction ?? "your side"}.`, false, now);
    }
    case "trivia_answer":
      return v.correct ? addFeed(withMoment(next, "Correct", "good"), "Correct.", false, now) : addFeed(withMoment(next, "Not that one", "bad"), "Not that one.", false, now);
    case "respawn":
      return addFeed(withMoment({ ...next, respawnAt: null, state: "active" }, "Back in", "good"), "Back in.", false, now);
  }
}

/** Whole seconds until a respawn is allowed, or null. */
export function respawnSecondsLeft(s: FightState, now: number = Date.now()): number | null {
  if (s.respawnAt === null) return null;
  const left = Math.ceil((s.respawnAt - now) / 1000);
  return left > 0 ? left : null;
}

/** The game is over (finished, settled or cancelled): the fight shows how it went. */
export const fightOver = (s: FightState) => isTerminal(s.gameStatus);
