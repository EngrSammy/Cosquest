// Talks to the CostQuest game server. The TypeScript twin of costquest-ios
// Net/GameClient.swift: one client for both platforms.
//
// Two rules from the server's contract shape it:
//   - The server judges. Nothing here computes an outcome; a refusal is an
//     answer, shown in the server's own words (GameError.message).
//   - Retries are safe where the server is idempotent (answers, duel finish),
//     and a stale nonce is the one 401 worth retrying.
// Pure: fetch and the identity are injected (tested in features/game/__tests__).
import type { WardenFacts } from "./wardenSite.ts";
import { type FixFields, withFixFields } from "./fixInfo.ts";
import { type Identity, utf8ToBytes } from "./identity.ts";
import type {
  CodexPayload,
  DuelFinished,
  DuelOutcome,
  DuelStart,
  FactionWar,
  GroundGeometry,
  ModelManifest,
  Profile,
  ProfileAvatar,
  QuestPoint,
  QuestPoints,
  Relic,
  RoamSpin,
  RoamAnswer,
  RoamAttempt,
  RoamBag,
  RoamConfig,
  RoamHint,
  RoamLeaders,
  RoamMe,
  RoamStarter,
  RoamVerdict,
  SsoSession,
} from "./wire.ts";
import { flattenExtra } from "./wire.ts";

export type GameErrorKind = "http" | "network" | "stale_nonce" | "bad_signature" | "not_signed_in" | "decoding";

export class GameError extends Error {
  readonly kind: GameErrorKind;
  readonly status: number;
  constructor(kind: GameErrorKind, message: string, status = 0) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
  /** Whether trying the same thing again could plausibly work. */
  get retryable(): boolean {
    if (this.kind === "stale_nonce" || this.kind === "network") return true;
    return this.kind === "http" && (this.status >= 500 || this.status === 429);
  }
}

/** The server's error body: `detail` is a sentence written to be shown, or a reason object. */
export function errorFrom(status: number, bodyText: string): GameError {
  let detail = "";
  try {
    const parsed = JSON.parse(bodyText) as { detail?: unknown };
    if (typeof parsed.detail === "string") detail = parsed.detail;
    else if (parsed.detail && typeof parsed.detail === "object") {
      const reason = (parsed.detail as { reason?: unknown }).reason;
      if (typeof reason === "string") detail = reason;
    }
  } catch {
    detail = bodyText.slice(0, 200);
  }
  if (status === 401 && detail.includes("stale nonce")) {
    return new GameError("stale_nonce", "That request was out of order. Trying again.", status);
  }
  if (status === 401 && detail.includes("signature")) {
    return new GameError("bad_signature", "This device could not prove who it is.", status);
  }
  return new GameError("http", detail || `The server returned ${status}.`, status);
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export type GameClientOptions = {
  baseUrl: string;
  /** The player's key now (it changes on sign-in and sign-out). */
  identity: () => Identity | null;
  fetch?: FetchLike;
  /** ms before a request is given up (iOS: 15 s). */
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /**
   * The latest fix's accuracy_m / fix_age_s / mocked / simulated (fixInfo.ts),
   * added to every request body that carries a lat and lng (sensors audit R3).
   */
  locationFields?: () => FixFields | null;
};

type Query = Record<string, string | number | undefined | (string | number)[]>;

function queryString(query?: Query): string {
  if (!query) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item === undefined) continue;
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
    }
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class GameClient {
  readonly baseUrl: string;
  private readonly identityOf: () => Identity | null;
  private readonly fetcher: FetchLike;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly locationFields: (() => FixFields | null) | null;
  /**
   * Squad up in person (squad.ts): the live pairing's token, sent with the next 3D fight's start, and
   * told when the server put the friend in that fight (setup.ally). Set by squadRuntime.ts.
   */
  squad: { token(): string | null; used(): void } | null = null;

  constructor(options: GameClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.identityOf = options.identity;
    // Called through a wrapper, not as `this.fetcher(...)`: a browser's fetch
    // throws "Illegal invocation" when called as a method of another object.
    this.fetcher = options.fetch ?? ((url, init) => (globalThis.fetch as unknown as FetchLike)(url, init));
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.sleep = options.sleep ?? defaultSleep;
    this.locationFields = options.locationFields ?? null;
  }

  /** The player's public key, or a GameError when nobody is in. */
  deviceKey(): string {
    const id = this.identityOf();
    if (!id) throw new GameError("not_signed_in", "Sign in to play.");
    return id.publicKeyHex;
  }

  // ---------- plumbing ----------

  /**
   * One request. `path` has no leading slash. The signature covers "/" + path
   * only, never the query string, matching the server.
   */
  async request<T>(
    method: string,
    path: string,
    opts: { body?: unknown; query?: Query; signed?: boolean; raw?: boolean; timeoutMs?: number } = {},
  ): Promise<T> {
    // A body that says where the player is also says how good and how old
    // that fix is, decorated before signing so the signature covers it.
    const body = opts.body !== undefined && this.locationFields ? withFixFields(opts.body, this.locationFields()) : opts.body;
    const bodyText = body === undefined ? undefined : JSON.stringify(body);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (bodyText !== undefined) headers["Content-Type"] = "application/json";
    if (opts.signed) {
      const id = this.identityOf();
      if (!id) throw new GameError("not_signed_in", "Sign in to play.");
      Object.assign(headers, id.signedHeaders(method, `/${path}`, utf8ToBytes(bodyText ?? "")));
    }
    const url = `${this.baseUrl}/${path}${queryString(opts.query)}`;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), opts.timeoutMs ?? this.timeoutMs) : null;
    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await this.fetcher(url, { method, headers, body: bodyText, signal: controller?.signal });
    } catch {
      throw new GameError("network", "Can't reach CosQuest right now.", 0);
    } finally {
      if (timer) clearTimeout(timer);
    }
    const text = await response.text();
    if (!response.ok) throw errorFrom(response.status, text);
    if (opts.raw) return text as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new GameError("decoding", "The server sent something unexpected.", response.status);
    }
  }

  /** One retry for the errors where a retry means something, with a short backoff. */
  async retrying<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof GameError && error.retryable) {
        await this.sleep(error.kind === "network" ? 600 : 400);
        return work();
      }
      throw error;
    }
  }

  // ---------- one login ----------

  /** Trade the chat session for the account's player. Unsigned: the token is the proof. */
  async sso(chatToken: string): Promise<SsoSession> {
    return this.request<SsoSession>("POST", "v1/sso/cosquest", { body: { token: chatToken } });
  }

  // ---------- the Warden's voice ----------

  /**
   * One Warden line spoken by the server's voice (ElevenLabs, cached there by
   * what it says). The audio's URL, or null when the server has no voice to
   * give (204: no key, a daily cap); errors (503, 413, a timeout) throw. Not
   * retried: the line is wanted now or not at all. Backend app/warden_voice.py.
   */
  async wardenVoice(text: string, moment: string, style: string, timeoutMs = 4000): Promise<WardenVoiceLine | null> {
    const raw = await this.request<string>("POST", "v1/warden/voice", {
      body: { device_key: this.deviceKey(), text, moment, style },
      signed: true,
      raw: true,
      timeoutMs,
    });
    if (!raw) return null;
    let got: Partial<WardenVoiceLine>;
    try {
      got = JSON.parse(raw) as Partial<WardenVoiceLine>;
    } catch {
      throw new GameError("decoding", "The server sent something unexpected.", 200);
    }
    if (typeof got.url !== "string" || !/^https?:\/\//.test(got.url) || typeof got.key !== "string") {
      throw new GameError("decoding", "The server sent something unexpected.", 200);
    }
    return { url: got.url, key: got.key, cached: !!got.cached };
  }

  // ---------- roam ----------

  /** A published Game Warden site's checked facts and narration (unsigned, the same for everyone). */
  async wardenFacts(siteId: string): Promise<WardenFacts> {
    return this.request("GET", "v1/roam/warden/facts", { query: { site_id: siteId } });
  }

  async roamConfig(): Promise<RoamConfig> {
    return this.request("GET", "v1/roam/config");
  }

  async questPoints(lat: number, lng: number, radiusM = 600): Promise<QuestPoints> {
    const key = this.deviceKey();
    const got = await this.retrying(() =>
      this.request<QuestPoints>("GET", "v1/roam/points", {
        query: { lat, lng, radius_m: radiusM, device_key: key },
        signed: true,
      }),
    );
    return { ...got, points: got.points.map(normalisePoint) };
  }

  /** Spin a point in reach: items, a little XP, then 5 minutes' rest. Not retried (a second spin would be refused). */
  async spin(pointId: string, lat: number, lng: number, accuracy: number): Promise<RoamSpin> {
    return this.request("POST", "v1/roam/items/spin", {
      body: { device_key: this.deviceKey(), point_id: pointId, lat, lng, accuracy_m: Math.min(5000, Math.max(0, accuracy)) },
      signed: true,
    });
  }

  async roamMe(): Promise<RoamMe> {
    const key = this.deviceKey();
    return this.retrying(() => this.request("GET", "v1/roam/me", { query: { device_key: key } }));
  }

  async chooseFaction(faction: string): Promise<RoamMe> {
    return this.request("PUT", "v1/roam/faction", {
      body: { device_key: this.deviceKey(), faction },
      signed: true,
    });
  }

  async starter(lat: number, lng: number, accuracy: number): Promise<RoamStarter> {
    const got = await this.retrying(() =>
      this.request<RoamStarter>("POST", "v1/roam/starter", {
        body: { device_key: this.deviceKey(), lat, lng, accuracy_m: Math.max(0, accuracy) },
        signed: true,
      }),
    );
    return { ...got, starter: got.starter ? normalisePoint(got.starter) : null };
  }

  /** Start the challenge at a point. A refusal ("get closer") is an answer: not retried. */
  async openPoint(pointId: string, lat: number, lng: number, accuracy: number): Promise<RoamAttempt> {
    const got = await this.request<RoamAttempt>("POST", "v1/roam/open", {
      body: { device_key: this.deviceKey(), point_id: pointId, lat, lng, accuracy_m: Math.max(0, accuracy) },
      signed: true,
    });
    return { ...got, point: normalisePoint(got.point) };
  }

  /** Safe to repeat: the server answers a second ask with the first verdict and pays once. */
  async answer(attemptId: string, answers: RoamAnswer[]): Promise<RoamVerdict> {
    const body = { device_key: this.deviceKey(), attempt_id: attemptId, answers };
    return this.retrying(() => this.request("POST", "v1/roam/answer", { body, signed: true }));
  }

  async hint(attemptId: string, kind: "fifty" | "time", question: number): Promise<RoamHint> {
    return this.request("POST", "v1/roam/hint", {
      body: { device_key: this.deviceKey(), attempt_id: attemptId, kind, question },
      signed: true,
    });
  }

  async retry(attemptId: string, lat: number, lng: number, accuracy: number): Promise<RoamAttempt> {
    return this.request("POST", "v1/roam/retry", {
      body: { device_key: this.deviceKey(), attempt_id: attemptId, lat, lng, accuracy_m: Math.max(0, accuracy) },
      signed: true,
    });
  }

  async bag(): Promise<RoamBag> {
    return this.retrying(() => this.request("GET", "v1/roam/items/bag", { query: { device_key: this.deviceKey() } }));
  }

  async factionWar(lat: number, lng: number): Promise<FactionWar> {
    return this.request("GET", "v1/roam/war", { query: { lat, lng } });
  }

  async roamLeaders(lat: number, lng: number): Promise<RoamLeaders> {
    const id = this.identityOf();
    return this.request("GET", "v1/roam/leaders", { query: { lat, lng, device_key: id?.publicKeyHex } });
  }

  async codex(): Promise<CodexPayload> {
    return this.retrying(() => this.request("GET", "v1/roam/codex", { query: { device_key: this.deviceKey() } }));
  }

  async relics(): Promise<{ owned?: Relic[]; equipped?: string | null; [k: string]: unknown }> {
    return this.retrying(() => this.request("GET", "v1/roam/relics", { query: { device_key: this.deviceKey() } }));
  }

  // ---------- profile ----------

  async profile(deviceKey: string): Promise<Profile> {
    return this.request("GET", `v1/profile/${deviceKey}`);
  }

  async saveProfile(handle: string, avatar: ProfileAvatar): Promise<unknown> {
    return this.request("PUT", "v1/profile", {
      body: { device_key: this.deviceKey(), handle, avatar },
      signed: true,
    });
  }

  // ---------- the duel ----------

  async duelStart(body: {
    mode: "point" | "raid" | "siege" | "trial" | "run";
    target: string;
    lat?: number | null;
    lng?: number | null;
    accuracy_m?: number | null;
    /** A Quest Run's Forbidden Zone: stake half the score on this fight. */
    stake?: boolean;
    /** The 3D fight, judged by the server: the fight comes back as kind "fight3d" (server knobs <mode>_fight3d, cq 019, battle-3d-only). */
    fight3d?: boolean;
    /** This phone cannot run the 3D fight: keep the 2D duel, judged and paid as before (battle-3d-only). */
    fallback2d?: boolean;
  }): Promise<DuelStart> {
    // Absent rather than null: the server's accuracy_m is a number with a default.
    const payload: Record<string, unknown> = { device_key: this.deviceKey(), mode: body.mode, target: body.target };
    if (body.fight3d) payload.fight3d = true;
    if (body.fallback2d) payload.fallback2d = true;
    if (body.lat != null && body.lng != null) {
      payload.lat = body.lat;
      payload.lng = body.lng;
    }
    if (body.accuracy_m != null) payload.accuracy_m = Math.min(5000, Math.max(0, body.accuracy_m));
    if (body.stake !== undefined) payload.stake = body.stake;
    // A friend squadded up in person joins a 3D fight (the server ignores the token anywhere else).
    const squad = body.fight3d ? (this.squad?.token() ?? null) : null;
    if (squad) payload.squad = squad;
    const text = await this.request<string>("POST", "v1/duel/start", { body: payload, signed: true, raw: true });
    const start = parseDuelStart(text);
    const ally = (start.setup as { ally?: unknown } | null | undefined)?.ally;
    if (squad && ally && typeof ally === "object") this.squad?.used();
    return start;
  }

  /** How this player's hero fights when a rival sieges a point they hold (PUT v1/duel/stance). */
  async setStance(stance: string): Promise<string> {
    const r = await this.request<{ stance: string }>("PUT", "v1/duel/stance", { body: { device_key: this.deviceKey(), stance }, signed: true });
    return r.stance;
  }

  /** Idempotent on duel_id: a lost reply is asked again and answered with the first verdict. */
  async duelFinish(duelId: string, finished: DuelFinished & { fight3d?: Record<string, unknown> | null }): Promise<DuelOutcome> {
    const body: Record<string, unknown> = {
      device_key: this.deviceKey(),
      duel_id: duelId,
      inputs: finished.inputs,
      result: finished.result,
      hash: finished.hash,
    };
    // A 3D fight's whole record (fight3d.ts finishFrom3D), judged by the server.
    if (finished.fight3d) body.fight3d = finished.fight3d;
    return this.retrying(() => this.request("POST", "v1/duel/finish", { body, signed: true }));
  }

  // ---------- the world ----------

  async ground(lat: number, lng: number, radiusM: number): Promise<GroundGeometry> {
    return this.request("GET", "v1/map/ground", { query: { lat, lng, radius_m: Math.round(radiusM) } });
  }

  async modelManifest(): Promise<ModelManifest> {
    return this.request("GET", "v1/model");
  }

  async health(): Promise<{ status: string }> {
    return this.request("GET", "health");
  }
}

/**
 * The duel's start, keeping the seed exact. The seed is a 62-bit integer
 * (roam_duel.py getrandbits(62)), past what a JS number holds, so it is read
 * from the text as `seed_text` and the sim takes it as a BigInt.
 */
export type WardenVoiceLine = { url: string; key: string; cached: boolean };

export function parseDuelStart(text: string): DuelStart {
  let parsed: DuelStart;
  try {
    parsed = JSON.parse(text) as DuelStart;
  } catch {
    throw new GameError("decoding", "The server sent something unexpected.");
  }
  const match = text.match(/"seed"\s*:\s*(-?\d+)/);
  if (!match) throw new GameError("decoding", "The fight came without a seed.");
  return { ...parsed, seed_text: match[1] };
}

/** The server's point, with `extra` flattened to strings (QuestPoint.init(from:)). */
export function normalisePoint(raw: QuestPoint): QuestPoint {
  return { ...raw, extra: flattenExtra(raw.extra) };
}

export type { QuestPoint };
