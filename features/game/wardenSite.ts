// A published Game Warden site, as the player meets it (day1-trivia, 3 Nov 2026).
//
// The server builds a site from an AIM command: checked facts about the place
// (OpenStreetMap, Wikipedia), a narration with an "arrive" line written only from
// those facts, and Proctor-approved questions about the place. /v1/roam/points
// serves it as an ordinary point (source "warden", extra["warden.site"]), /open
// serves its own questions, and GET /v1/roam/warden/facts serves the facts.
// The merged app showed the point but never read the facts: its card and the
// Warden's welcome were the generic ones. Pure (no react-native), so it is tested.
import type { QuestPoint } from "./wire";

export type WardenFact = { id?: string | null; text?: string | null; source?: string | null; url?: string | null };

export type WardenFacts = {
  site_id: string;
  point_id: string;
  version: number;
  name?: string | null;
  narration?: {
    facts?: Record<string, string> | null;
    fallback_lines?: Record<string, string> | null;
  } | null;
  facts_detail?: WardenFact[] | null;
  attribution?: string[] | null;
};

/** The site's id when this point is a published Warden site, else null. */
export function siteIdOf(p: Pick<QuestPoint, "source" | "extra"> | null | undefined): string | null {
  if (!p || p.source !== "warden") return null;
  const id = p.extra?.["warden.site"];
  return typeof id === "string" && /^[0-9a-f-]{32,36}$/i.test(id) ? id : null;
}

const clean = (s: unknown): string => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");
const sentence = (s: string): string => (s && !/[.!?]$/.test(s) ? `${s}.` : s);

/** What the Warden says on arriving: the server's line, written from the checked facts only. */
export function siteArriveLine(f: WardenFacts | null | undefined): string | null {
  const line = clean(f?.narration?.fallback_lines?.arrive);
  return line || null;
}

/** The card's line about the place: its checked facts (one or two sentences), never invented lore. */
export function siteLegend(f: WardenFacts | null | undefined, max = 180): string | null {
  const facts = f?.narration?.facts ?? {};
  const parts = [clean(facts.fact), clean(facts.fact2)].filter(Boolean).map(sentence);
  if (!parts.length) return null;
  let out = parts[0];
  if (parts[1] && out.length + 1 + parts[1].length <= max) out = `${out} ${parts[1]}`;
  return out.length > max ? `${out.slice(0, max - 1).trimEnd()}…` : out;
}

/** "Facts: © OpenStreetMap contributors · Wikipedia, CC BY-SA 4.0" (the facts' licences, as the server lists them). */
export function siteAttribution(f: WardenFacts | null | undefined): string | null {
  const a = (f?.attribution ?? []).map(clean).filter(Boolean);
  return a.length ? `Facts: ${a.join(" · ")}` : null;
}

/** The card's subtitle and realm line at a Warden site: its questions are about the place, not a realm. */
export function siteSubtitle(p: Pick<QuestPoint, "challenge">): string {
  return p.challenge === "blitz" ? "The Warden's questions about this place, against the clock." : "The Warden's question about this place.";
}
export const SITE_REALM_LINE = "Questions about this place";
