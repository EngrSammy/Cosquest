// The Warden's best next move and the Nearby tray's words (costquest-ios
// Roam/RoamGuide.swift bestNext, Roam/RoamHomeView.swift NearbyTray and
// NearbyCard status). Pure: no React Native, so it is tested in
// features/game/__tests__/guide.test.ts.
import { unlocked } from "./unlocks.ts";
import type { QuestPoint, RoamMe } from "./wire.ts";
import { isCooling, parseServerDate } from "./wire.ts";

/** How many cards the tray shows (NearbyTray.ordered: prefix(10)). */
export const TRAY_CARDS = 10;

/** Plain scoring, not the model: which point is worth walking to is a sum with a right answer. */
export function bestNext(input: {
  /** The points the player can see (bosses wait for level 5). */
  points: QuestPoint[];
  me: RoamMe | null | undefined;
  distanceOf: (p: QuestPoint) => number | null;
  now?: number;
}): { point: QuestPoint; reason: string | null } | null {
  const { points, me, distanceOf } = input;
  const now = input.now ?? Date.now();
  const dailies = (me?.dailies ?? []).filter((d) => !d.done);
  const wants = new Set(dailies.map((d) => d.id));
  const titleOf = (id: string) => dailies.find((d) => d.id === id)?.title ?? null;
  const codexOpen = unlocked(me, "codex");
  const warOpen = unlocked(me, "war");
  let best: { point: QuestPoint; score: number; why: string | null } | null = null;
  for (const p of points) {
    if (isCooling(p, now) || p.source === "starter") continue;
    const d = distanceOf(p);
    if (d === null || !(d < 900)) continue;
    let score = p.tier === "epic" ? 3 : p.tier === "rare" ? 2 : 1;
    let why: string | null = null;
    if (wants.has("rare") && p.tier !== "common") {
      score += 2;
      why = titleOf("rare");
    }
    if (wants.has("blitz") && p.challenge === "blitz") {
      score += 2;
      why = titleOf("blitz");
    }
    if (wants.has("sequence") && p.challenge === "sequence") {
      score += 2;
      why = titleOf("sequence");
    }
    if (p.extra?.codex !== "owned" && codexOpen) score += 0.8;
    const holder = p.extra?.holder;
    if (warOpen && holder && holder !== (me?.faction ?? undefined)) score += 1;
    if (warOpen && !holder && me?.faction) score += 0.5;
    if (p.source === "wander") {
      const t = parseServerDate(p.extra?.expires_at);
      if (t !== null && t - now < 900_000) score += 1.2;
    }
    if (p.source === "raid") score += 3;
    score -= d / 250;
    if (best === null || score > best.score) best = { point: p, score, why };
  }
  return best ? { point: best.point, reason: best.why } : null;
}

/**
 * The card marked NEXT: the starter shrine until the first fight is done (the
 * Warden has just said it is beside you), then the best move.
 */
export function suggestedId(input: {
  points: QuestPoint[];
  me: RoamMe | null | undefined;
  distanceOf: (p: QuestPoint) => number | null;
  now?: number;
}): string | null {
  if (input.me?.tutorial_done !== true) {
    const starter = input.points.find((p) => p.source === "starter");
    if (starter) return starter.id;
  }
  return bestNext(input)?.point.id ?? null;
}

/** The cards in the tray: the nearest ten, the suggested one first (only when it is among them). */
export function trayOrder(nearby: QuestPoint[], suggested: string | null | undefined): QuestPoint[] {
  const near = nearby.slice(0, TRAY_CARDS);
  if (suggested) {
    const i = near.findIndex((p) => p.id === suggested);
    if (i > 0) near.unshift(...near.splice(i, 1));
  }
  return near;
}

/** "NEARBY · n in reach": how many points can be played right now. */
export function hereCount(nearby: QuestPoint[], inReach: (p: QuestPoint) => boolean, now?: number): number {
  const t = now ?? Date.now();
  return nearby.filter((p) => inReach(p) && !isCooling(p, t)).length;
}

/** Degrees clockwise from where the phone faces (null without a heading). */
export function relativeBearing(bearing: number | null | undefined, heading: number | null | undefined): number | null {
  if (bearing == null || heading == null || !Number.isFinite(bearing) || !Number.isFinite(heading)) return null;
  return (((bearing - heading) % 360) + 360) % 360;
}

// ---------- the words (RoamStyle / DuelModes) ----------

export function tierName(tier: string): string {
  return tier ? tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase() : tier;
}

/** RoamStyle.challengeName. */
export function challengeLabel(kind: string): string {
  switch (kind) {
    case "sequence":
      return "Sequence";
    case "rebus":
      return "Rebus";
    case "blitz":
      return "Blitz";
    case "duel":
      return "Duel";
    default:
      return "Trivia";
  }
}

/** RoamStyle.challengeBlurb. */
export function challengeBlurb(kind: string): string {
  switch (kind) {
    case "sequence":
      return "Put four moments in the right order.";
    case "rebus":
      return "Read the emoji. Name what they are.";
    case "blitz":
      return "Five questions against the clock.";
    case "duel":
      return "A Guardian keeps this place. Beat it in a fight.";
    default:
      return "One question. One answer.";
  }
}

/** DuelModes.difficulty: how hard a Guardian is. */
export function difficultyLabel(tier: string): string {
  return tier === "epic" ? "Hard" : tier === "rare" ? "Even" : "Easy";
}

/** DuelModes.guardian: the Guardian a point announces, or a fair name for one. */
export function guardianName(p: Pick<QuestPoint, "name" | "extra">): string {
  return p.extra?.guardian ?? `Keeper of ${p.name}`;
}

/** The point card's third line: "DC questions", or the Guardian/boss line. */
export function realmLine(p: QuestPoint, realmName: (id: string) => string): string {
  if (p.source === "raid") return "Boss · fight it with your crew";
  if (p.challenge === "duel") return `${realmName(p.realm)} Guardian · ${guardianName(p)}`;
  const r = p.realm === "dc" ? "DC" : p.realm.charAt(0).toUpperCase() + p.realm.slice(1);
  return `${r} questions`;
}

/** The card's subtitle (PointCard.subtitle). */
export function pointSubtitle(p: QuestPoint): string {
  return p.source === "starter" ? "Your first Quest Point. It's right beside you." : challengeBlurb(p.challenge);
}

/** "1 min" or "N min", rounded up (NearbyCard.minutes). */
export function minutesText(until: number, now: number): string {
  const m = Math.ceil((until - now) / 60000);
  return m <= 1 ? "1 min" : `${m} min`;
}

/** The disabled button's words while a point recharges (PointCard.rechargeText). */
export function rechargeText(p: Pick<QuestPoint, "cooling_until">, now: number): string {
  const until = parseServerDate(p.cooling_until);
  if (until === null) return "Recharging";
  const mins = Math.ceil((until - now) / 60000);
  return mins <= 1 ? "Ready in a minute" : `Ready in ${mins} min`;
}

export type CardTone = "mist" | "skyDeep" | "berry" | "holder" | "sunDeep" | "ink" | "tier";

/** The one fact that matters most about a card right now (NearbyCard.status), in the order Swift tries them. */
export function cardStatus(p: QuestPoint, opts: { now: number; newCard: boolean }): { fact: string; tone: CardTone; holder?: string } {
  const { now } = opts;
  const cooling = parseServerDate(p.cooling_until);
  if (cooling !== null && cooling > now) return { fact: `Ready in ${minutesText(cooling, now)}`, tone: "mist" };
  const gone = parseServerDate(p.extra?.expires_at);
  if (gone !== null) return { fact: `Gone in ${minutesText(gone, now)}`, tone: "skyDeep" };
  if (p.source === "raid") return { fact: "Boss raid", tone: "berry" };
  const holder = p.extra?.holder;
  if (holder) return { fact: p.extra?.holder_name ?? tierName(holder), tone: "holder", holder };
  if (opts.newCard) return { fact: "New card", tone: "sunDeep" };
  if (p.source === "starter") return { fact: "Start here", tone: "sunDeep" };
  if (p.challenge === "duel") return { fact: guardianName(p), tone: "ink" };
  return { fact: tierName(p.tier), tone: "tier" };
}

/** What VoiceOver reads for a card (NearbyCard.accessibility). */
export function cardLabel(
  p: QuestPoint,
  o: { inReach: boolean; distanceText: string; cooling: boolean; suggested: boolean },
): string {
  const parts =
    p.challenge === "duel"
      ? [p.name, "Duel", guardianName(p), difficultyLabel(p.tier)]
      : [p.name, tierName(p.tier), challengeLabel(p.challenge)];
  parts.push(o.inReach ? "in reach" : o.distanceText);
  if (o.cooling) parts.push("recharging");
  if (o.suggested) parts.push("the Warden's best next move");
  return parts.join(", ");
}

/** The Nearby tray's one state chip (components/game/NearbyTray.tsx), or none: the pin's colour already says tier and holder. */
export type TrayChipTone = "rest" | "ready" | "raid" | "event" | "new" | "holder";
export type TrayChipState = { text: string; tone: TrayChipTone; timer?: boolean; holder?: string };

export function trayChipState(p: QuestPoint, o: { ready: boolean; cooling: boolean; newCard: boolean; now: number }): TrayChipState | null {
  const rest = parseServerDate(p.cooling_until);
  if (o.cooling) return rest !== null && rest > o.now ? { text: minutesText(rest, o.now).toUpperCase(), tone: "rest", timer: true } : { text: "RESTING", tone: "rest" };
  if (o.ready) return { text: "READY", tone: "ready" };
  const gone = parseServerDate(p.extra?.expires_at);
  const live = gone !== null && gone > o.now;
  if (p.source === "raid") return live ? { text: minutesText(gone, o.now).toUpperCase(), tone: "raid", timer: true } : { text: "RAID", tone: "raid" };
  if (live) return { text: minutesText(gone, o.now).toUpperCase(), tone: "event", timer: true };
  if (o.newCard) return { text: "NEW", tone: "new" };
  if (p.source === "starter") return { text: "START", tone: "new" };
  const holder = p.extra?.holder;
  if (holder) return { text: (p.extra?.holder_name ?? holder).toUpperCase(), tone: "holder", holder };
  return null;
}
