// The 3D fight in Godot (cq 061, "Godot G0"): the rules on the React Native
// side, as pure functions (no react-native, no files), so node can test them.
// The device half is engine.ts (the Godot instance), characters.ts (the
// Forge GLBs on disk) and components/game/Fight3D.tsx (the screen).
//
// The bridge contract with the Godot project (game3d/, autoload /root/Bridge):
//   bridge.set_result_callback(cb)   cb(json) once per fight, on the Godot thread
//   bridge.start_fight(json)         a Fight3DConfig as JSON
//   bridge.get_status()              JSON, {state: "loading" | "fighting" | ...}
//   bridge.end_fight()               stop the fight, keep the engine
// Result JSON: {outcome: "win" | "lose" | "timeout" | "quit", damage_dealt,
// damage_taken, time_s, hits, skill_uses, enemy_hp_left, hero_hp_left, mode}.
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import type { RewardSummary } from "../../components/game/Reward.tsx";
import type { ForgeEntry } from "../game/forgeWorld.ts";
import { toLocal } from "../game/geo.ts";
import type { DuelFinished, DuelStart, GroundGeometry, RoamStanding } from "../game/wire.ts";

// ---------- switches ----------

/** What the Godot scene builds: everything, the arena only, or the characters only (for measuring). */
export type Fight3DMode = "full" | "arena" | "chars";
export const FIGHT3D_MODES: readonly Fight3DMode[] = ["full", "arena", "chars"];

export function parseMode(raw: unknown): Fight3DMode | null {
  return typeof raw === "string" && (FIGHT3D_MODES as readonly string[]).includes(raw) ? (raw as Fight3DMode) : null;
}

export type Fight3DFlags = {
  /**
   * The 3D fight is in this build, on a platform that can run it (iOS, Android 10+). On by default
   * since battle-3d-only (1 Nov 2026: it is every mode's fight); EXPO_PUBLIC_GAME3D=0 builds without it,
   * and such a build (or a phone below Android 10) plays the 2D duel fallback.
   */
  on: boolean;
  /**
   * Keep one engine for the app's life (pause/resume between fights), the
   * default; EXPO_PUBLIC_GODOT_KEEP=0 destroys it on close instead. Destroying
   * leaked ~7 MB of native heap per fight on the emulator, and re-creating the
   * engine in one process crashed once a GDExtension (3D Tiles) was loaded.
   */
  keep: boolean;
  /** EXPO_PUBLIC_GAME3D_AUTOSTART=<mode>: open the fight as soon as the game is up (test builds). */
  autostart: Fight3DMode | null;
  /** EXPO_PUBLIC_GAME3D_CYCLE=N: open and close the fight N times (the leak test), 0 = off. */
  cycle: number;
  /** EXPO_PUBLIC_GAME3D_CYCLE_MS: how long each open lasts once fighting, and the gap after a close. */
  cycleMs: number;
  /** EXPO_PUBLIC_GAME3D_AUTOPLAY=1: the hero fights by itself (measurements). */
  autoplay: boolean;
  /** EXPO_PUBLIC_GAME3D_TILES_URL: map tiles for the arena floor (optional). */
  tilesUrl: string;
  /** EXPO_PUBLIC_GAME3D_LOD=0|1|2: the characters' LOD, else by device class (fightLod). */
  lod: number | null;
  /** cq 019: fight in the real place round the point when the map has its ground; EXPO_PUBLIC_GAME3D_PLACE=0 keeps the street. */
  place: boolean;
};

export type Fight3DEnv = {
  EXPO_PUBLIC_GAME3D?: string;
  EXPO_PUBLIC_GODOT_KEEP?: string;
  EXPO_PUBLIC_GAME3D_AUTOSTART?: string;
  EXPO_PUBLIC_GAME3D_CYCLE?: string;
  EXPO_PUBLIC_GAME3D_CYCLE_MS?: string;
  EXPO_PUBLIC_GAME3D_AUTOPLAY?: string;
  EXPO_PUBLIC_GAME3D_TILES_URL?: string;
  EXPO_PUBLIC_GAME3D_LOD?: string;
  EXPO_PUBLIC_GAME3D_PLACE?: string;
};

/** The Godot host draws through SurfaceControl, which is Android 10 (API 29) and up. */
export const ANDROID_MIN_API = 29;

function intIn(raw: string | undefined, lo: number, hi: number, fallback: number): number {
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== "" && Number.isInteger(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
}

export function fight3dFlags(env: Fight3DEnv, platform: { os: string; version: number | string }): Fight3DFlags {
  const supported = platform.os === "ios" || (platform.os === "android" && Number(platform.version) >= ANDROID_MIN_API);
  const on = (env.EXPO_PUBLIC_GAME3D ?? "1").trim() !== "0" && supported;
  const lod = intIn(env.EXPO_PUBLIC_GAME3D_LOD, 0, 2, -1);
  return {
    on,
    keep: env.EXPO_PUBLIC_GODOT_KEEP !== "0",
    autostart: on ? parseMode(env.EXPO_PUBLIC_GAME3D_AUTOSTART) : null,
    cycle: on ? intIn(env.EXPO_PUBLIC_GAME3D_CYCLE, 0, 1000, 0) : 0,
    cycleMs: intIn(env.EXPO_PUBLIC_GAME3D_CYCLE_MS, 500, 600_000, 8000),
    autoplay: env.EXPO_PUBLIC_GAME3D_AUTOPLAY === "1",
    tilesUrl: (env.EXPO_PUBLIC_GAME3D_TILES_URL ?? "").trim(),
    lod: lod < 0 ? null : lod,
    place: env.EXPO_PUBLIC_GAME3D_PLACE !== "0",
  };
}

/** A test run asked for by the dev link (cosquest://fight3d?mode=arena&cycle=10&ms=8000&autoplay=1). */
export type Fight3DRun = { mode: Fight3DMode; cycle: number; cycleMs: number; autoplay: boolean };

export function runFromParams(q: Record<string, string | string[] | undefined>, flags: Fight3DFlags): Fight3DRun {
  const one = (k: string) => {
    const v = q[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const auto = one("autoplay");
  return {
    mode: parseMode(one("mode")) ?? flags.autostart ?? "full",
    cycle: intIn(one("cycle"), 0, 1000, flags.cycle),
    cycleMs: intIn(one("ms"), 500, 600_000, flags.cycleMs),
    autoplay: auto === undefined ? flags.autoplay || intIn(one("cycle"), 0, 1000, flags.cycle) > 0 : auto === "1" || auto === "true",
  };
}

/**
 * The test link's look switches (cosquest://fight3d?look=post, look=glow,grade, look=-bloom):
 * Godot's `look` config keys (arena.gd LOOK_DEFAULTS), comma-separated, a leading "-" for off.
 * The opt-in post stack (glow + grade) is measured on a device this way. Unknown words are dropped.
 */
export function lookFromParam(raw: string | undefined): Record<string, boolean> | null {
  const out: Record<string, boolean> = {};
  for (const w of (raw ?? "").split(",")) {
    const m = /^(-?)([a-z_]{2,20})$/.exec(w.trim());
    if (m) out[m[2]] = m[1] !== "-";
  }
  return Object.keys(out).length ? out : null;
}

// ---------- the characters ----------

/** The characters' LOD in the fight: 1 on low and mid phones (and the emulator), 0 on high ones. */
export function fightLod(cls: "low" | "mid" | "high", override: number | null): number {
  if (override !== null) return override;
  return cls === "high" ? 0 : 1;
}

/**
 * The index the game server uses to give a fight its opponent character
 * (costquest-backend app/roam_forge.py opponent_character): the published
 * characters of the role ordered by id, picked by
 * int(sha256("forge-opponent|<role>|<key>")[:12 hex]) mod their count. The
 * same pick here means the 3D fight shows the Guardian the versus card would.
 */
export function opponentIndex(role: string, key: string, count: number): number {
  if (count <= 0) return -1;
  const hex = bytesToHex(sha256(utf8ToBytes(["forge-opponent", role, key].join("|")))).slice(0, 12);
  return parseInt(hex, 16) % count;
}

type CharacterPick = Pick<ForgeEntry, "id" | "name" | "type" | "gameplay">;

export function pickOpponent<T extends CharacterPick>(entries: readonly T[], role: "guardian" | "boss", key: string): T | null {
  const list = entries.filter((e) => e.type === "character" && e.gameplay.role === role).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const i = opponentIndex(role, key, list.length);
  return i < 0 ? null : list[i];
}

/** Another hero to fight beside you: the first wearable hero by name that is not yours. */
export function pickAlly<T extends CharacterPick>(entries: readonly T[], heroId: string | null): T | null {
  const heroes = entries
    .filter((e) => e.type === "character" && e.id !== heroId && (e.gameplay.avatar === true || e.gameplay.role === "hero"))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return heroes[0] ?? null;
}

/**
 * The hero the player wears, for the fight: the bag's answer once it has
 * loaded (even "none", after Take off), else /me's block. The same rule as
 * the HUD chip and the profile (forgeWorldDevice useEquipped), so the fight
 * casts the face the map shows (cq 076).
 */
export function wornAvatarId(
  inventory: { equipped: { avatar: string | null } } | null | undefined,
  me: { equipped: { avatar: string | null } },
): string | null {
  return inventory ? inventory.equipped.avatar : me.equipped.avatar;
}

/**
 * The three characters of a fight: your worn avatar, an ally hero, and the
 * opponent (the server's own pick when a duel start named one, else the same
 * pick the server would make for this point). The ally is a squadded-up
 * friend's worn hero when the duel start has one (setup.ally), else another
 * wearable hero. With no avatar worn (a new
 * player, or a worn one that was unpublished) you fight as the first
 * wearable hero by name, never as Godot's placeholder capsule (cq 076).
 */
export function pickCast<T extends CharacterPick>(
  entries: readonly T[],
  opts: { avatarId: string | null; enemyId?: string | null; allyId?: string | null; role: "guardian" | "boss"; key: string | null },
): { hero: T | null; ally: T | null; enemy: T | null } {
  const byId = (id: string | null | undefined) => (id ? (entries.find((e) => e.id === id && e.type === "character") ?? null) : null);
  const hero = byId(opts.avatarId) ?? pickAlly(entries, null);
  const enemy = byId(opts.enemyId) ?? (opts.key ? pickOpponent(entries, opts.role, opts.key) : null);
  // A friend squadded up in person (setup.ally): their worn hero, even when it is the same as yours.
  return { hero, ally: byId(opts.allyId) ?? pickAlly(entries, hero?.id ?? null), enemy };
}

/**
 * An absolute file system path for Godot from a file:// URI (the Forge cache
 * hands out URIs). Anything that is not a local file is "" (Godot then
 * draws its mannequin).
 */
export function localPath(uri: string | null | undefined): string {
  if (!uri) return "";
  let p = uri;
  if (/^file:\/\//i.test(p)) p = p.replace(/^file:\/\//i, "");
  else if (/^[a-z][a-z0-9+.-]*:/i.test(p)) return "";
  if (!p.startsWith("/")) return "";
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
}

// ---------- what goes to Godot ----------

export type Fight3DConfig = {
  hero_glb: string;
  ally_glb: string;
  enemy_glb: string;
  hero_name: string;
  ally_name: string;
  enemy_name: string;
  duration_s: number;
  players_text: string;
  point_name: string;
  mode: Fight3DMode;
  tiles_url?: string;
  tiles_lat?: number;
  tiles_lon?: number;
  tiles_alt?: number;
  tiles_ground?: boolean;
  tiles_sse?: number;
  tiles_origin_type?: number;
  tiles_rot_x?: number;
  seed: number;
  autoplay: boolean;
  /** The app's Reduce motion setting (cq 013): a quarter of the camera shake, no zoom punch. Sent only when on. */
  reduce_motion?: boolean;
  /** Hit haptics (haptics.ts): the player's in-game choice. Godot sends no touches unless this is true. */
  haptics?: boolean;
  /** look-fight: false mutes the fight's sounds and music (sfx.gd); sent false only while a call holds the audio. */
  sound?: boolean;
  /** cq 019: the real place round the point (place.gd) instead of the street, from this ground file. */
  arena?: "place";
  ground_json?: string;
  /** The point, in the ground's metres (x east, z north of its origin). */
  place_at?: [number, number];
  /**
   * The server's modifiers for this fight (battle-3d-only): the Guardian's HP and strike weight in
   * permille. Godot applies them and records them; the judge checks them against the stored setup.
   */
  mods?: FightMods;
  /** The setup's look (cosmetic): the Guardian's height in permille, a title on the intro banner. */
  guardian_look?: GuardianLook;
};

export type FightMods = { boss_hp_permille: number; boss_dmg_permille: number };
export type GuardianLook = { size_permille?: number; title?: string };

/**
 * Where the fight stands on the ground the map already has (the store's /v1/map/ground answer):
 * the point's metres east and north of the ground's origin. Null when there is no ground, no archive
 * covers it, it has no buildings, or the point is off it; the fight then keeps the street.
 */
export function placeFrom(
  ground: Pick<GroundGeometry, "origin" | "radius_m" | "covered" | "buildings"> | null | undefined,
  point: { lat: number; lng: number },
): { at: [number, number] } | null {
  if (!ground || ground.covered === false || !ground.buildings?.length) return null;
  const p = toLocal(ground.origin, point);
  if (Math.hypot(p.x, p.z) > ground.radius_m * 0.8) return null;
  return { at: [Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10] };
}

export const FIGHT_SECONDS = 45;

export function buildFightConfig(input: {
  hero: { path: string | null; name: string | null };
  ally: { path: string | null; name: string | null };
  enemy: { path: string | null; name: string | null };
  pointName: string;
  mode: Fight3DMode;
  seed: number;
  autoplay: boolean;
  tilesUrl?: string | null;
  durationS?: number;
  playersText?: string;
  reduceMotion?: boolean;
  /** The player's haptics choice (prefs.ts hapticsOn()); on unless false. */
  haptics?: boolean;
  /** False while a CosQuest call holds the audio: Godot plays no effects and no music. */
  sound?: boolean;
  /** The real place: the ground written to a file, and the point on it (placeFrom). */
  place?: { groundPath: string; at: [number, number] } | null;
  /** The server's modifiers and look, as the duel's setup gave them (fightFromStart). */
  mods?: FightMods | null;
  guardianLook?: GuardianLook | null;
}): Fight3DConfig {
  const config: Fight3DConfig = {
    hero_glb: localPath(input.hero.path),
    ally_glb: localPath(input.ally.path),
    enemy_glb: localPath(input.enemy.path),
    hero_name: input.hero.name?.trim() || "You",
    ally_name: input.ally.name?.trim() || "Ally",
    enemy_name: input.enemy.name?.trim() || "Guardian",
    duration_s: input.durationS ?? FIGHT_SECONDS,
    // The squad pill: fighters standing on your side / its size. You and the AI ally are two; "2/3"
    // read as a third player who was never there (cq 019, docs/SCOPE-CHECK.md).
    players_text: input.playersText ?? "2/2",
    point_name: input.pointName,
    mode: input.mode,
    seed: Math.trunc(Math.abs(input.seed)) % 2147483647,
    autoplay: input.autoplay,
    haptics: input.haptics !== false,
  };
  if (input.tilesUrl) Object.assign(config, tilesFields(input.tilesUrl));
  if (input.reduceMotion) config.reduce_motion = true;
  if (input.sound === false) config.sound = false;
  if (input.mods) config.mods = { ...input.mods };
  if (input.guardianLook) config.guardian_look = { ...input.guardianLook };
  const groundJson = localPath(input.place?.groundPath);
  if (input.place && groundJson) Object.assign(config, { arena: "place", ground_json: groundJson, place_at: input.place.at });
  return config;
}

/**
 * The tiles layer's config from a tileset URL that may end in
 * "#lat,lon,alt[,ground[,sse[,origin[,rotx]]]]": where the arena stands on the tileset (the
 * georeference origin); ground 0 keeps the arena's own floor (a tileset that
 * is a landmark beside the fight, not the ground); sse is Cesium's maximum
 * screen space error (detail); origin 1 is Cesium's True Origin (engine
 * coordinates are ECEF, for tilesets with no georeference); rotx turns the
 * tileset node about X (degrees, default 90: ECEF Z-up to Godot Y-up). The fragment never reaches the server.
 */
type TilesKeys = "tiles_url" | "tiles_lat" | "tiles_lon" | "tiles_alt" | "tiles_ground" | "tiles_sse" | "tiles_origin_type" | "tiles_rot_x";
export function tilesFields(url: string): Pick<Fight3DConfig, TilesKeys> {
  const [base, frag] = url.trim().split("#", 2);
  const out: Pick<Fight3DConfig, TilesKeys> = { tiles_url: base };
  const n = (frag ?? "").split(",").map((v) => Number(v));
  if (n.length >= 2 && n.every((v) => Number.isFinite(v)) && Math.abs(n[0]) <= 90 && Math.abs(n[1]) <= 180) {
    out.tiles_lat = n[0];
    out.tiles_lon = n[1];
    out.tiles_alt = n.length >= 3 ? n[2] : 0;
    if (n.length >= 4) out.tiles_ground = n[3] !== 0;
    if (n.length >= 5 && n[4] > 0) out.tiles_sse = n[4];
    if (n.length >= 6) out.tiles_origin_type = n[5] === 1 ? 1 : 0;
    if (n.length >= 7) out.tiles_rot_x = n[6];
  }
  return out;
}

/**
 * The arguments Godot starts with, as the library's example app does:
 * Android opens the exported folder in the APK's assets (`--path /game3d`),
 * iOS the pack in the app bundle (`--main-pack <bundle>/game3d.pck`); the GL
 * compatibility renderer (the iOS simulator has no OpenGL ES, so Metal there),
 * and the "embedded" display driver that draws into RTNGodotView.
 */
export function godotArgs(os: string, opts: { bundleDir?: string | null; iosSimulator?: boolean; name?: string } = {}): string[] {
  const name = opts.name ?? "game3d";
  if (os === "android") {
    return ["--path", `/${name}`, "--rendering-driver", "opengl3", "--rendering-method", "gl_compatibility", "--display-driver", "embedded"];
  }
  const dir = localPath(opts.bundleDir).replace(/\/+$/, "");
  const renderer = opts.iosSimulator ? ["--rendering-driver", "metal", "--rendering-method", "mobile"] : ["--rendering-driver", "opengl3", "--rendering-method", "gl_compatibility"];
  return ["--main-pack", `${dir}/${name}.pck`, ...renderer, "--display-driver", "embedded"];
}

// ---------- what comes back ----------

export type Fight3DOutcome = "win" | "lose" | "timeout" | "quit";
export type Fight3DResult = {
  outcome: Fight3DOutcome;
  damage_dealt: number;
  damage_taken: number;
  time_s: number;
  hits: number;
  skill_uses: number;
  enemy_hp_left: number;
  hero_hp_left: number;
  mode: string;
  /**
   * Godot's whole result as it came, when it carries the fight's record (`judge`: the seed, the
   * rules and every hit, fight.gd judge_log, cq 019). A judged fight sends it to the server as is.
   */
  record: Record<string, unknown> | null;
};

const OUTCOMES: readonly Fight3DOutcome[] = ["win", "lose", "timeout", "quit"];
const n0 = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};

/** The result JSON from Godot, checked. Null for anything without a known outcome. */
export function parseFightResult(json: unknown): Fight3DResult | null {
  let o: unknown = json;
  if (typeof json === "string") {
    try {
      o = JSON.parse(json);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const r = o as Record<string, unknown>;
  const outcome = typeof r.outcome === "string" ? (r.outcome.toLowerCase() as Fight3DOutcome) : null;
  if (!outcome || !OUTCOMES.includes(outcome)) return null;
  return {
    outcome,
    damage_dealt: Math.round(n0(r.damage_dealt)),
    damage_taken: Math.round(n0(r.damage_taken)),
    time_s: Math.round(n0(r.time_s) * 10) / 10,
    hits: Math.round(n0(r.hits)),
    skill_uses: Math.round(n0(r.skill_uses)),
    enemy_hp_left: Math.round(n0(r.enemy_hp_left)),
    hero_hp_left: Math.round(n0(r.hero_hp_left)),
    mode: typeof r.mode === "string" ? r.mode : "",
    record: r.judge && typeof r.judge === "object" && !Array.isArray(r.judge) ? r : null,
  };
}

/** bridge.get_status(): its state ("loading", "fighting", "over", ...), or null when unreadable. */
export function parseStatus(json: unknown): { state: string; raw: Record<string, unknown> } | null {
  let o: unknown = json;
  if (typeof json === "string") {
    try {
      o = JSON.parse(json);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const raw = o as Record<string, unknown>;
  return typeof raw.state === "string" ? { state: raw.state, raw } : null;
}

/** The "quit" a fight closed before Godot answered is reported as (the X, Android Back). */
export function quitResult(mode: string, timeS = 0): Fight3DResult {
  return { outcome: "quit", damage_dealt: 0, damage_taken: 0, time_s: timeS, hits: 0, skill_uses: 0, enemy_hp_left: 0, hero_hp_left: 0, mode, record: null };
}

const HEADLINES: Record<Fight3DOutcome, string> = {
  win: "Guardian down!",
  lose: "The Guardian held",
  timeout: "Time's up",
  quit: "You left the fight",
};

/** The test arena's fight (the dev link, no point): nothing was sent to the server. */
export const FIGHT3D_NOTE = "Test arena: this fight was not sent to the game server.";

/** The fight's own numbers, as rows on the reward screen (testID `reward-<id>`). */
export function fightStats(r: Fight3DResult): { id: string; label: string; value: string }[] {
  const s = Math.round(r.time_s);
  return [
    { id: "outcome", label: "Result", value: HEADLINES[r.outcome] },
    { id: "damage-dealt", label: "Damage dealt", value: String(r.damage_dealt) },
    { id: "damage-taken", label: "Damage taken", value: String(r.damage_taken) },
    { id: "time", label: "Time", value: s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s} s` },
  ];
}

// ---------- the judged fight (cq 019, battle-3d-only) ----------
// Every fight is the 3D fight now (battle-3d-only, 1 Nov 2026): a point's, a Trials rung's, a
// Siege's, a raid boss's and a Quest Run point's. The app asks /v1/duel/start with fight3d: true, the
// server hands out a "fight3d" setup (the seed, the rules id, the round, and this mode's modifiers),
// Godot fights on it and records every hit (fight.gd judge_log), /v1/duel/finish sends the record, and
// the server (costquest-backend app/roam_fight3d.py) judges it and pays through the mode's own payer.
// A phone that cannot run Godot asks with fallback2d: true and plays the 2D duel. docs/game3d/XP.md.

/** What Godot needs from a duel start: its seed, round, modifiers, look and opponent. Null when the setup is not a 3D fight. */
export function fightFromStart(
  start: Pick<DuelStart, "seed_text" | "setup">,
): {
  seed: number;
  durationS: number;
  mods: FightMods;
  look: GuardianLook | null;
  enemyId: string | null;
  guardianName: string | null;
  /** A friend squadded up in person (setup.ally, cosmetic: the ally's rules are the same). */
  ally: { id: string | null; name: string } | null;
  /** The Forge weapon the opponent holds: a Siege holder's own equipped one (p2.forge_weapon), else null. */
  enemyWeaponId: string | null;
  /** A Siege against a point's holder (setup.siege.holder_name / holder_hero), else null. */
  holder: SiegeHolder | null;
} | null {
  const s = start.setup as Record<string, unknown> & { kind?: string };
  if (s.kind !== "fight3d") return null;
  const seed = fightSeed(start.seed_text);
  if (seed === null) return null;
  const m = (s.mods ?? {}) as Record<string, unknown>;
  const whole = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 1000);
  const look = s.guardian_look && typeof s.guardian_look === "object" ? (s.guardian_look as GuardianLook) : null;
  const p2 = (s.p2 ?? {}) as { character?: { element_id?: unknown } | null; forge_weapon?: { element_id?: unknown } | null };
  const enemy = p2.character && typeof p2.character.element_id === "string" ? p2.character.element_id : null;
  const holder = siegeHolder(start);
  // Only a holder's own hero carries their weapon; a cast Guardian holds its own.
  const weapon = holder?.hero && p2.forge_weapon && typeof p2.forge_weapon.element_id === "string" ? p2.forge_weapon.element_id : null;
  const dur = Number(s.duration_s);
  return {
    seed,
    durationS: Number.isFinite(dur) && dur > 0 ? dur : FIGHT_SECONDS,
    mods: { boss_hp_permille: whole(m.boss_hp_permille), boss_dmg_permille: whole(m.boss_dmg_permille) },
    look,
    enemyId: enemy,
    guardianName: typeof s.guardian_name === "string" ? s.guardian_name : null,
    ally: allyOf(s.ally),
    enemyWeaponId: weapon,
    holder,
  };
}

/** Who holds a sieged point: their name (null when they never chose one) and whether their own hero guards it. */
export type SiegeHolder = { name: string | null; hero: boolean };

/** A Siege's holder, from the duel start's setup.siege (server siege-holder-hero), else null. */
export function siegeHolder(start: Pick<DuelStart, "setup"> | null | undefined): SiegeHolder | null {
  const siege = (start?.setup as { siege?: unknown } | undefined)?.siege;
  if (!siege || typeof siege !== "object") return null;
  const h = siege as { holder_name?: unknown; holder_hero?: unknown };
  if (h.holder_hero === undefined && h.holder_name === undefined) return null;
  const name = typeof h.holder_name === "string" ? h.holder_name.trim().slice(0, 40) : "";
  return { name: name || null, hero: h.holder_hero === true };
}

/** "Ada's hero holds this point" when the holder's own hero guards a Siege, else null. */
export function holderLine(start: Pick<DuelStart, "setup"> | null | undefined): string | null {
  const h = siegeHolder(start);
  if (!h?.hero) return null;
  return `${h.name ? possessive(h.name) : "A rival's"} hero holds this point`;
}

/** "Ada's", "James'": the possessive of a player's name. */
export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

function allyOf(raw: unknown): { id: string | null; name: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as { handle?: unknown; avatar?: unknown };
  const name = typeof a.handle === "string" ? a.handle.trim().slice(0, 40) : "";
  if (!name) return null;
  return { id: typeof a.avatar === "string" && a.avatar ? a.avatar : null, name };
}

const TIER_WORD: Record<string, string> = { starter: "First", common: "Common", rare: "Rare", epic: "Epic" };

/**
 * The 3D fight's loading card (the pre-fight card): who you face, what kind of fight, and what it is
 * worth, from the duel start's own blocks. Shown while Godot loads; there is no other briefing.
 */
export function fightCard(start: Pick<DuelStart, "setup"> | null, pointName: string): { kicker: string; title: string; line: string | null } {
  const card = modeCard(start, pointName);
  // A friend squadded up in person fights beside you.
  const ally = allyOf((start?.setup as { ally?: unknown } | undefined)?.ally);
  return ally ? { ...card, line: `${card.line ? `${card.line} ` : ""}${ally.name} fights beside you.` } : card;
}

function modeCard(start: Pick<DuelStart, "setup"> | null, pointName: string): { kicker: string; title: string; line: string | null } {
  const s = (start?.setup ?? {}) as Record<string, unknown>;
  const title = (typeof s.guardian_name === "string" && s.guardian_name) || (s.p2 as { name?: string } | undefined)?.name || "The Guardian";
  const raid = s.raid as { hp_left?: number; hp_max?: number } | undefined;
  const trial = s.trial as { rung?: number; rungs?: number; first_clear?: boolean } | undefined;
  const siege = s.siege as { faction_attacked_name?: string } | undefined;
  const run = s.run as { value?: number; stake?: number } | undefined;
  const point = s.point as { tier?: string } | undefined;
  if (raid) {
    const pct = raid.hp_max ? Math.round((100 * (raid.hp_left ?? 0)) / raid.hp_max) : null;
    return { kicker: "RAID BOSS", title, line: pct === null ? "Your damage goes into the crew's pool." : `Boss at ${pct}%. Your damage goes into the crew's pool.` };
  }
  if (trial) return { kicker: `GUARDIAN TRIAL · RUNG ${trial.rung ?? 1} OF ${trial.rungs ?? 8}`, title, line: trial.first_clear === false ? "A replay: no XP this time." : "First clear pays XP." };
  if (siege) {
    const holds = holderLine(start);
    return { kicker: "SIEGE", title, line: `${holds ? `${holds}. ` : ""}Beat it to take ${pointName} from ${siege.faction_attacked_name ?? "its holders"}.` };
  }
  if (run) return { kicker: "QUEST RUN", title, line: `Worth ${run.value ?? 0} points${run.stake ? `, ${run.stake} staked` : ""}. Win fast for a bonus.` };
  const tier = point?.tier ? TIER_WORD[point.tier] : null;
  return { kicker: tier ? `${tier.toUpperCase()} GUARDIAN` : "GUARDIAN", title, line: `Win to take ${pointName} for your faction.` };
}

/**
 * The seed Godot fights on: the duel's seed, from its exact digits (DuelStart.seed_text; the number
 * is lossy past 2^53), folded to 31 bits as the server's roam_fight3d.fight_seed. Null when unreadable.
 */
export function fightSeed(seedText: string): number | null {
  if (!/^-?\d+$/.test(seedText.trim())) return null;
  const n = BigInt(seedText.trim());
  return Number((n < 0n ? -n : n) % 2147483647n);
}

/** The /v1/duel/finish fields for a judged fight: the duel's result block from the fight's numbers, and the record (the server's finish_fields). */
export function finishFrom3D(r: Fight3DResult): DuelFinished & { fight3d: Record<string, unknown> | null } {
  return {
    result: {
      winner: r.outcome === "win" ? 1 : 2,
      // the record's own time (Godot's 1/100 s), not the rounded one shown on the reward screen
      ticks: Math.max(0, Math.min(100_000, Math.round(n0(r.record?.time_s ?? r.time_s) * 100))),
      p1_hp: r.hero_hp_left,
      p2_hp: r.enemy_hp_left,
      end_reason: r.outcome,
    },
    inputs: [],
    hash: "",
    fight3d: r.record,
  };
}

/**
 * The reward screen for a 3D fight the server never saw: the test arena (the dev link), or a finish
 * the server did not answer. It shows Godot's own numbers, pays nothing, and says so.
 */
export function rewardFrom3D(r: Fight3DResult, point: { name: string; realm: string }, standing: RoamStanding | null): RewardSummary {
  return {
    pointName: point.name,
    realm: point.realm,
    win: r.outcome === "win",
    headline: HEADLINES[r.outcome],
    xp: 0,
    coins: 0,
    factionPoints: 0,
    lines: [],
    before: standing,
    after: standing,
    leveledUp: false,
    rankUp: false,
    dailiesCompleted: [],
    extras: [],
    note: FIGHT3D_NOTE,
    practice: true,
    stats: fightStats(r),
  };
}
