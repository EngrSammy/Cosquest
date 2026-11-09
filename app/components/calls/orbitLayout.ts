// ==========================================
// ORBIT LAYOUT (group calls): who sits where
// ==========================================
// The pure part of OrbitCall.tsx, kept apart so it can be checked without a
// phone (scripts/check-orbit-layout.ts).
import type { OrbitPerson } from "@/components/calls/OrbitCall";

// ---------------------------------------------------------------------
// Engagement: speaking adds to a person's score, silence slowly lowers it.
// ---------------------------------------------------------------------
export const TICK_MS = 500;
export const DECAY = 0.985; // per tick: about 30 s to lose half
const INNER_MAX = 6;
const OUTER_MAX = 12;

// While the person in the middle is still talking, someone talking over them
// waits this long for the middle. Without a hold, two people talking over
// each other (or a noisy room) swapped the big and small circles several
// times a second, and every swap resized the live videos inside them: lag,
// and pictures freezing while LiveKit switched quality for the new size.
export const CENTER_HOLD_MS = 1500;

// Shortest time anyone holds the middle (stops a speaking flicker bouncing it).
export const MIN_HOLD_MS = 400;

// How long a circle takes to glide to its new place.
export const MOVE_MS = 320;

export type Box = { w: number; h: number };
export type Ring = "center" | "inner" | "outer";
export type Slot = { person: OrbitPerson; x: number; y: number; size: number; ring: Ring };

// Who should hold the middle right now: the loudest speaker, else the pinned
// person, else the most engaged.
export function pickCenter(people: OrbitPerson[], pinnedId: string | null, scores: Map<string, number>) {
  const byScore = [...people].sort((a, b) => (scores.get(b.id) || 0) - (scores.get(a.id) || 0));
  return (byScore.find((p) => p.speaking) || people.find((p) => p.id === pinnedId) || byScore[0])?.id ?? null;
}

// Where every circle goes (pure: same input, same layout).
export function placeOrbit(people: OrbitPerson[], box: Box, scores: Map<string, number>, centerId: string | null): Slot[] {
  if (!box.w || !people.length) return [];
  const cx = box.w / 2;
  const cy = box.h / 2;
  const min = Math.min(box.w, box.h);
  const centerSize = Math.min(132, min * 0.34);
  const innerR = min * 0.3;
  const outerR = min * 0.45;
  const innerSize = Math.min(66, min * 0.17);
  const outerSize = Math.min(42, min * 0.11);

  const byScore = [...people].sort((a, b) => (scores.get(b.id) || 0) - (scores.get(a.id) || 0));
  const center = people.find((p) => p.id === centerId) || byScore[0];

  const rest = byScore.filter((p) => p.id !== center.id);
  // Engaged (spoke recently) go inside; ringing people never go inside.
  const inner = rest.filter((p) => !p.ringing && (scores.get(p.id) || 0) > 0.3).slice(0, INNER_MAX);
  // With few people, fill the inner ring anyway (it looks empty otherwise).
  const fill = rest.filter((p) => !inner.includes(p) && !p.ringing);
  while (inner.length < Math.min(INNER_MAX, 4) && fill.length) inner.push(fill.shift()!);
  const outer = rest.filter((p) => !inner.includes(p)).slice(0, OUTER_MAX);

  // Stable slot order (by id), so circles don't swap places needlessly.
  const ring = (list: OrbitPerson[], radius: number, size: number, offset: number, name: Ring) =>
    [...list]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((person, index, all) => {
        const angle = offset + (index / all.length) * Math.PI * 2;
        return { person, x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, size, ring: name };
      });

  return [
    { person: center, x: cx, y: cy, size: centerSize, ring: "center" },
    ...ring(inner, innerR, innerSize, -Math.PI / 2, "inner"),
    ...ring(outer, outerR, outerSize, -Math.PI / 2 + Math.PI / Math.max(outer.length, 1), "outer"),
  ];
}

// The middle, with the holds above:
//  - the person in the middle has gone quiet and someone else talks: they
//    take it at once (after MIN_HOLD_MS, so a flicker can't bounce it);
//  - two people talk over each other: the one in the middle keeps it for
//    CENTER_HOLD_MS before the other can take it;
//  - nobody talks: back to the pinned person only after CENTER_HOLD_MS of
//    quiet (not at every pause for breath);
//  - the person in the middle leaves: freed at once.
export type CenterHold = { id: string; since: number; spokeAt: number };

export function holdCenter(current: CenterHold | null, people: OrbitPerson[], want: string | null, now: number): CenterHold | null {
  if (!want) return null;
  const here = current ? people.find((p) => p.id === current.id) : undefined;
  if (!current || !here) return { id: want, since: now, spokeAt: now };
  const spokeAt = here.speaking ? now : current.spokeAt;
  if (want !== current.id) {
    const held = now - current.since;
    const wantSpeaking = !!people.find((p) => p.id === want)?.speaking;
    const take = wantSpeaking
      ? here.speaking
        ? held >= CENTER_HOLD_MS
        : held >= MIN_HOLD_MS
      : held >= MIN_HOLD_MS && now - spokeAt >= CENTER_HOLD_MS;
    if (take) return { id: want, since: now, spokeAt: now };
  }
  return spokeAt === current.spokeAt ? current : { ...current, spokeAt };
}

// Which circle sits where (ignores who is speaking: that only changes the
// pulse, not the layout).
export function layoutKey(slots: Slot[], box: Box) {
  return `${box.w}x${box.h}|${slots.map((s) => `${s.person.id}:${s.ring}`).join(",")}`;
}

