// The Guardian reveal before a fight (phone-hardware design 2.5, Phase 2 step
// 2): a 5 to 10 second camera moment at the start of every 3D fight entry
// (point, trial, siege, raid, run). The Guardian rises out of the ground in
// front of the player, sways, wears a nameplate; Fight (or a tap on it) dives
// into the Godot fight, Photo takes a location-free snapshot, and it carries
// on by itself ~8 s after the Guardian stands. iOS only for now (the same
// native view as "See it here", modules/costquest-game/ios/Embed/
// SummonIsland.swift in its reveal mode; the screen is
// components/game/FightReveal.tsx).
//
// Pure: when it shows, which Guardian, the nameplate, the timings and the
// moment's steps (tested in features/game/__tests__/reveal.test.ts).
//
// The reveal pays nothing and changes nothing about the fight: the duel is
// started with the server as before (its seed, round and modifiers), the
// Godot fight is prepared under the camera, and it starts when the reveal
// ends. The judge allows a 90 s wall-clock lead for a 3D fight
// (roam_rules.fight3d_lead_s), so the reveal is capped well inside it.
import { fightCard, holderLine, pickOpponent } from "../game3d/fight3d.ts";
import type { ForgeEntry } from "./forgeWorld.ts";
import type { DuelStart } from "./wire.ts";

/** Carries on into the fight this long after the Guardian stands, if the player has not touched anything. */
export const REVEAL_AUTO_MS = 8000;
/** Nothing standing yet by then (a slow download, a camera that won't start): straight to the fight. */
export const REVEAL_FIND_MS = 9000;
/** The longest the reveal can be, touched or not (a photo, the share sheet): far inside the judge's 90 s lead. */
export const REVEAL_MAX_MS = 30000;
/** The handoff waits this long at most for the fight's first frame; then the fight's own loading card shows. */
export const REVEAL_HANDOFF_MS = 8000;

export type RevealSupport = {
  platform: string;
  /** The native view is in this build (CostQuestSummonView). */
  nativeView: boolean;
  /** World-tracking AR on this phone. */
  arSupported: boolean;
  /** EXPO_PUBLIC_GAME_2D turned the island off ("arReveal"). */
  islandOff: boolean;
  /** The player's "AR reveal before fights" setting (on by default). */
  pref: boolean;
  /** The fight is the 3D fight (the 2D fallback keeps its own briefing and VS card). */
  fight3d: boolean;
};

/** Whether this fight opens with the reveal. Anything missing: straight to the fight, as before. */
export function revealWanted(s: RevealSupport): boolean {
  return s.platform === "ios" && s.nativeView && s.arSupported && !s.islandOff && s.pref && s.fight3d;
}

/** Whether Profile offers the setting: a phone that could show the reveal at all. */
export function revealSettingShown(s: Pick<RevealSupport, "platform" | "nativeView" | "arSupported" | "islandOff">): boolean {
  return s.platform === "ios" && s.nativeView && s.arSupported && !s.islandOff;
}

type Revealable = Pick<ForgeEntry, "id" | "name" | "type" | "gameplay" | "lods">;

const hasUsdz = (e: Revealable | null | undefined): e is Revealable => !!e && e.type === "character" && e.lods.some((l) => l.usdz);

/**
 * The character to stand in the room: the one the duel named (p2), else the
 * one the fight would pick for this place (fight3d pickOpponent, the same
 * rule as fightCast), else a cast character of that role, else any character
 * with a USDZ. Only characters that have a USDZ; null when none has.
 */
export function revealGuardian<T extends Revealable>(
  entries: readonly T[],
  opts: { enemyId?: string | null; role: "guardian" | "boss"; key: string | null },
): T | null {
  const named = opts.enemyId ? entries.find((e) => e.id === opts.enemyId && e.type === "character") : undefined;
  if (hasUsdz(named)) return named as T;
  const picked = opts.key ? pickOpponent(entries, opts.role, opts.key) : null;
  if (hasUsdz(picked)) return picked;
  const byId = (a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const sameRole = entries.filter((e) => hasUsdz(e) && e.gameplay.role === opts.role).sort(byId);
  if (sameRole.length) return sameRole[0];
  return entries.filter((e) => hasUsdz(e)).sort(byId)[0] ?? null;
}

/** The fight's role for a duel: a raid's boss, else a Guardian. */
export function revealRole(mode: string | null | undefined, pointSource?: string | null): "guardian" | "boss" {
  return mode === "raid" || pointSource === "raid" ? "boss" : "guardian";
}

const TIER_WORD: Record<string, string> = { starter: "First", common: "Common", rare: "Rare", epic: "Epic" };

/**
 * The nameplate over the camera: the Guardian's name (the server's, as the
 * fight's card has it) and a kicker with the tier or the kind of fight; for a
 * Siege the holder's own hero guards, "<Holder>'s hero holds this point". Before
 * the duel has started, the point's own words.
 */
export function revealPlate(
  start: Pick<DuelStart, "setup"> | null,
  point: { name: string; tier?: string | null; extra?: { guardian?: string | null } | null },
): { kicker: string; name: string; holds?: string } {
  if (start) {
    const card = fightCard(start, point.name);
    const title = card.title === "The Guardian" && point.extra?.guardian ? point.extra.guardian : card.title;
    // A Siege against a holder whose own hero guards the point says so.
    const holds = holderLine(start);
    return holds ? { kicker: card.kicker, name: title, holds } : { kicker: card.kicker, name: title };
  }
  const tier = point.tier ? TIER_WORD[point.tier] : null;
  return { kicker: tier ? `${tier.toUpperCase()} GUARDIAN` : "GUARDIAN", name: point.extra?.guardian || "The Guardian" };
}

/**
 * The moment's steps:
 *   coming    the camera is opening and the Guardian is on its way (the fight is held)
 *   standing  it is in the room (the fight is held; ~8 s untouched and it carries on)
 *   leaving   into the fight: the camera pauses under a white bloom while Godot starts
 *   done      the fight has its first frame (or failed, or took too long): the reveal is gone
 */
export type RevealState = "coming" | "standing" | "leaving" | "done";

export type RevealEvent =
  /** The Guardian stands in the room. */
  | "placed"
  /** Fight, a tap on the Guardian, Skip, AR off, or the clock: into the fight. */
  | "go"
  /** The AR could not happen (no camera permission, no AR, a failed session, no model): straight to the fight. */
  | "failed"
  /** The fight is on screen, or failed, or the handoff took too long. */
  | "fightShown";

export function revealStep(s: RevealState, e: RevealEvent): RevealState {
  if (s === "done") return "done";
  switch (e) {
    case "placed":
      return s === "coming" ? "standing" : s;
    case "go":
      return s === "coming" || s === "standing" ? "leaving" : s;
    case "failed":
      // Nothing to look at: no bloom, just the fight's own loading card.
      return s === "leaving" ? s : "done";
    case "fightShown":
      return "done";
    default:
      return s;
  }
}

/** The fight waits (prepared, not started) while the reveal is still being watched. */
export function revealHoldsFight(s: RevealState): boolean {
  return s === "coming" || s === "standing";
}

/** The one line of help at the bottom. */
export function revealHint(s: RevealState, started: boolean): string {
  switch (s) {
    case "coming":
      return started ? "Point your phone at the ground ahead." : "Finding the Guardian…";
    case "standing":
      return "Tap it, or Fight, to take it on.";
    default:
      return "Into the fight…";
  }
}

/** The message beside a shared photo: the Guardian's name, never the place. */
export function revealShareText(name: string): string {
  return `${name}, met in CosQuest`;
}
