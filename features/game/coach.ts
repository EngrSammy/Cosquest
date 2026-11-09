// The Warden showing the player round the game (costquest-ios
// Warden/WardenCoach.swift CoachStep + Roam/RoamHomeView.swift coachStep):
// the step to show next, from what the player has seen. Pure: the memory
// (cq.coach.done, cq.unlocks.introduced) is kept by the component, and the
// order is tested in features/game/__tests__/guide.test.ts.
import { pendingUnlock, type Unlock, unlocked } from "./unlocks.ts";
import { pointPlaysAsDuel, type QuestPoint, type RoamMe } from "./wire.ts";

export type CoachStep = {
  id: string;
  line: string;
  /** A rail anchor id to light up, or null to leave the map uncovered. */
  target: string | null;
  action: string;
  later: string;
};

export const COACH_DONE_KEY = "cq.coach.done";
export const UNLOCKS_INTRODUCED_KEY = "cq.unlocks.introduced";

/**
 * The first point's line, in the words of what its card does when tapped: a
 * duel is a Guardian to fight, a blitz or a sequence is played, anything else
 * (trivia, rebus) is answered. `kind` is the starter's challenge as it will
 * play (see pointPlaysAsDuel); without one, the Guardian line as before.
 */
export function firstShrineLine(name: string, kind?: string | null): string {
  switch (kind ?? "duel") {
    case "duel":
      return `${name}, your first Guardian is right beside you. Tap its card to fight.`;
    case "blitz":
    case "sequence":
      return `${name}, your first Quest Point is right beside you. Tap its card to play.`;
    default:
      return `${name}, your first Quest Point is right beside you. Tap its card to answer.`;
  }
}

/** The starter's challenge as a tap will play it: a duel when the server fights points, else its own kind. */
export function starterKindOf(p: QuestPoint | null | undefined, me: RoamMe | null | undefined): string | null {
  if (!p) return null;
  if (pointPlaysAsDuel(p, me)) return "duel";
  // A duel point the server plays as a quiz (point_mode "quiz") is answered.
  return p.challenge === "duel" ? "trivia" : p.challenge;
}

export function firstShrineStep(name: string, kind?: string | null): CoachStep {
  return {
    id: "first-shrine",
    line: firstShrineLine(name, kind),
    target: "starter",
    action: "Show me",
    later: "",
  };
}

/** WardenCoach.swift CoachStep.unlock, line for line. */
export function unlockStep(u: Unlock): CoachStep {
  let target: string | null = u;
  let line: string;
  switch (u) {
    case "codex":
      line = "Every shrine you play leaves a card behind. I keep them here, in your Codex.";
      break;
    case "relics":
      line = "I've been keeping something for you. Right answers wake Relics, the weapons of the houses. Come and see.";
      break;
    case "war":
      line = "Your house is at war for this city, every week. Take shrines, hold them, and we win.";
      break;
    case "battle":
      line = "You're ready for a real fight. Find someone nearby, start a Room, and battle them right here, through your camera.";
      break;
    case "walking":
      line = "Walk, and I'll reward you for it. Five, twenty-five and fifty kilometres a week.";
      target = null;
      break;
    case "friends":
      line = "Hold your phone against a friend's and I'll remember you're together. No chat, and no one sees where you are.";
      target = null;
      break;
    case "raids":
      line = "Every hour a boss wakes somewhere near you. Bring a crew, and bring it down.";
      target = null;
      break;
  }
  // The Codex button opens its own sheet; lighting it is enough.
  const plain = target === null || u === "codex";
  return { id: `unlock-${u}`, line, target, action: plain ? "Got it" : "Show me", later: plain ? "" : "Later" };
}

export const SIEGE_STEP: CoachStep = {
  id: "siege",
  line: "See the shrine flying another house's colours? A Guardian holds it for them. Strike it down with your Relic and it's ours.",
  target: null,
  action: "Got it",
  later: "",
};

/** The unlock a step introduces, from its id ("unlock-war" -> "war"). */
export function unlockOfStep(stepId: string): Unlock | null {
  if (!stepId.startsWith("unlock-")) return null;
  const u = stepId.slice("unlock-".length);
  return u in UNLOCK_IDS ? (u as Unlock) : null;
}

const UNLOCK_IDS: Record<Unlock, true> = { codex: true, relics: true, war: true, battle: true, walking: true, friends: true, raids: true };

/** The unlocks whose "Show me" opens something (the rest are "Got it"). */
export function opensSomething(u: Unlock): boolean {
  return u === "war" || u === "relics" || u === "battle";
}

/** Where a coach mark aimed at an id is drawn: More stands in for everything moved off the rail. */
export const MORE_ANCHORS = ["more", "war", "battle", "recap", "events", "friends"] as const;

/**
 * What the Warden has to show the player next, if anything: the first shrine,
 * each unlock as the level opens it, then the siege. The caller adds the
 * "nothing while a card, a sheet or a challenge is up" part.
 */
export function coachStepFor(input: {
  me: RoamMe | null | undefined;
  playerName: string;
  hasStarter: boolean;
  /** The starter's challenge as it will play ("duel", "trivia", "blitz", ...), for the Warden's verb. */
  starterKind?: string | null;
  hasSiege: boolean;
  done: ReadonlySet<string>;
  introduced: ReadonlySet<string>;
}): CoachStep | null {
  const { me } = input;
  if (!me) return null;
  if (!me.tutorial_done && !input.done.has("first-shrine")) {
    return input.hasStarter ? firstShrineStep(input.playerName, input.starterKind) : null;
  }
  const u = pendingUnlock(me, input.introduced);
  if (u) return unlockStep(u);
  if (!input.done.has(SIEGE_STEP.id) && unlocked(me, "war") && input.hasSiege) return SIEGE_STEP;
  return null;
}

/** A JSON array of strings from storage, tolerant of anything else. */
export function parseIdList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
