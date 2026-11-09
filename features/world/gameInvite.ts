// GAME INVITES: the chat message card (kind "game_invite") that says "join me
// at this raid / shrine / duel". Rules match the chat backend
// (cosquest-backend/src/controllers/gameController.js). Pure: no React
// Native imports (tested in features/world/__tests__).
import { type GameTarget, isValidTargetId } from "./deepLink.ts";

export type GameInviteType = "raid" | "shrine" | "duel";

export type GameInvite = {
  type: GameInviteType;
  targetId: string;
  place: string;
  lat: number | null;
  lng: number | null;
  /** ISO date, or null for "now". */
  startsAt: string | null;
};

/** What the game's share action hands the chat (onShareToChat). */
export type GameSharePayload = {
  /** "raid" | "shrine" | "duel" for an invite card; "result" for a game
   * result shared as a text message (see resultShareText). */
  type?: string;
  /** type "result": the message to send (and the card's fallback). */
  text?: string | null;
  /** type "result": the card (kind game_result, task 059) where the server has it. */
  result?: GameResultCard | null;
  targetId?: string;
  place?: string | null;
  lat?: number | null;
  lng?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
};

const TYPES: GameInviteType[] = ["raid", "shrine", "duel"];
const LABEL: Record<GameInviteType, string> = { raid: "Raid", shrine: "Shrine", duel: "Duel" };
const VERB: Record<GameInviteType, string> = {
  raid: "Join the raid",
  shrine: "Meet at the shrine",
  duel: "Take the duel",
};

function finiteIn(value: unknown, limit: number): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

/** A message's `gameInvite`, cleaned; null when it is not a usable card. */
export function normalizeInvite(raw: unknown): GameInvite | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const type = r.type as GameInviteType;
  if (!TYPES.includes(type)) return null;
  if (!isValidTargetId(r.targetId)) return null;
  let lat = finiteIn(r.lat, 90);
  let lng = finiteIn(r.lng, 180);
  if (lat === null || lng === null) {
    lat = null;
    lng = null;
  }
  let startsAt: string | null = null;
  if (typeof r.startsAt === "string" && !Number.isNaN(Date.parse(r.startsAt))) {
    startsAt = new Date(r.startsAt).toISOString();
  }
  const place = typeof r.place === "string" ? r.place.trim().slice(0, 80) : "";
  return { type, targetId: r.targetId, place, lat, lng, startsAt };
}

/** Where Join takes the game. */
export function inviteToTarget(invite: GameInvite): GameTarget {
  const target: GameTarget = {};
  if (invite.type === "raid") target.raidId = invite.targetId;
  else if (invite.type === "duel") target.duelId = invite.targetId;
  else target.shrineId = invite.targetId;
  if (invite.lat !== null && invite.lng !== null) {
    target.lat = invite.lat;
    target.lng = invite.lng;
  }
  if (invite.place) target.place = invite.place;
  return target;
}

export function inviteTitle(invite: GameInvite): string {
  return invite.place ? `${LABEL[invite.type]} at ${invite.place}` : `${LABEL[invite.type]} invite`;
}

export function inviteCallToAction(invite: GameInvite): string {
  return VERB[invite.type];
}

/** The chat-list line, same wording as the backend's preview. */
export function invitePreview(invite: GameInvite | null): string {
  if (!invite) return "🎮 Game invite";
  return `🎮 ${inviteTitle(invite)}`;
}

/**
 * When, in words: "Now", "In 25 min", "Today 18:30", "Tomorrow 09:00",
 * "Sat 14:00", or "Ended" for one more than two hours past.
 */
export function inviteWhen(startsAt: string | null, now: Date = new Date()): string {
  if (!startsAt) return "Now";
  const at = new Date(startsAt);
  const diffMin = Math.round((at.getTime() - now.getTime()) / 60000);
  if (diffMin < -120) return "Ended";
  if (diffMin <= 1) return "Now";
  if (diffMin < 60) return `In ${diffMin} min`;
  const hhmm = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(at) - startOfDay(now)) / 86400000);
  if (days === 0) return `Today ${hhmm}`;
  if (days === 1) return `Tomorrow ${hhmm}`;
  if (days < 7) return `${at.toLocaleDateString("en-GB", { weekday: "short" })} ${hhmm}`;
  return `${at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${hhmm}`;
}

/** Can Join still do anything? (An ended invite shows, greyed.) */
export function inviteJoinable(invite: GameInvite, now: Date = new Date()): boolean {
  return inviteWhen(invite.startsAt, now) !== "Ended";
}

/**
 * The game's share payload -> the body for POST /api/chats/:id/game-invites,
 * or null when the game sent something the backend would refuse.
 */
export function shareToInviteBody(
  payload: GameSharePayload,
  note?: string,
): {
  type: GameInviteType;
  targetId: string;
  place?: string;
  lat?: number;
  lng?: number;
  startsAt?: string;
  note?: string;
} | null {
  const type = payload.type as GameInviteType;
  if (!TYPES.includes(type) || !isValidTargetId(payload.targetId)) return null;
  const body: ReturnType<typeof shareToInviteBody> = { type, targetId: payload.targetId };
  if (!body) return null;
  const place = typeof payload.place === "string" ? payload.place.trim().slice(0, 80) : "";
  if (place) body.place = place;
  const lat = finiteIn(payload.lat, 90);
  const lng = finiteIn(payload.lng, 180);
  if (lat !== null && lng !== null) {
    body.lat = lat;
    body.lng = lng;
  }
  if (typeof payload.startsAt === "string" && !Number.isNaN(Date.parse(payload.startsAt))) {
    body.startsAt = new Date(payload.startsAt).toISOString();
  }
  const trimmed = note?.trim();
  if (trimmed) body.note = trimmed.slice(0, 300);
  return body;
}

/** A game result shared to a chat as a card (Message kind "game_result",
 * task 059). Servers without it get resultShareText as a text message. */
export type GameResultCard = {
  headline: string;
  pointName?: string;
  realm?: string;
  win?: boolean;
  xp?: number;
  coins?: number;
  level?: number | null;
  rank?: string;
};

/** A message's `gameResult`, cleaned; null when it is not a usable card. */
export function normalizeResult(raw: unknown): GameResultCard | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const headline = typeof r.headline === "string" ? r.headline.trim().slice(0, 80) : "";
  if (!headline) return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);
  return {
    headline,
    pointName: typeof r.pointName === "string" ? r.pointName.slice(0, 80) : "",
    realm: typeof r.realm === "string" ? r.realm.slice(0, 24) : "",
    win: r.win === true,
    xp: n(r.xp),
    coins: n(r.coins),
    level: typeof r.level === "number" && Number.isFinite(r.level) ? r.level : null,
    rank: typeof r.rank === "string" ? r.rank.slice(0, 40) : "",
  };
}

/** A game result as one line of text (the card's fallback). */
export function resultShareText(r: {
  headline: string;
  pointName?: string | null;
  xp?: number | null;
  win?: boolean;
}): string {
  const where = r.pointName ? ` at ${r.pointName}` : "";
  const xp = r.xp && r.xp > 0 ? ` · +${r.xp} XP` : "";
  return `${r.win ? "🏆" : "⚔️"} ${r.headline.replace(/[!.]+$/, "")}${where}${xp} in CosQuest`;
}
