// ==========================================
// CALL TRANSCRIPT: WHO'S IN IT (words only)
// ==========================================
// Each phone on a call writes down only its owner's voice, and only when
// that phone has Sparks (the speech files) and its owner said yes to the
// Sparks notice. So a transcript can be missing people. This file turns the
// backend's `participants` list (GET /api/calls/:callId/transcript, first
// page) into the plain words the app shows: who is in the transcript, who
// isn't and why, and what the viewer can do about their own lines.
//
// Pure on purpose (no React, no React Native): the transcript screen, the
// in-call Sparks panel and the call's notes all use it, and
// scripts/test-call-transcript-copy.ts checks it with plain Node.

/** Why someone's lines are (or aren't) in the transcript. */
export type TranscriptParticipantStatus =
  | "transcribed" // their lines are here
  | "no_sparks" // none of their phones has Sparks (speech files) yet
  | "not_accepted" // their phone can, but Sparks was off for them on this call
  | "declined" // they turned it off: never transcribed, by design
  // Backend module 1.3.4 (SDK 1.2.8 phones report whether they listened):
  | "silent" // their phone listened with the mic on and heard nothing: they didn't speak
  | "muted" // their phone listened, but their mic was off the whole time
  | "not_listening" // Sparks never started on their phone for this call (a phone problem, not silence)
  | "no_lines"; // no lines came from their phone, and it is too old to say why

export type TranscriptParticipant = {
  userId: string;
  displayName?: string | null;
  lines: number;
  status: TranscriptParticipantStatus | string;
};

/** Names and avatars, keyed by user id (same shape as userPreview() on the backend). */
export type TranscriptSpeaker = {
  id: string;
  username?: string | null;
  name?: string | null;
  avatarKey?: string | null;
  avatarPhotoUrl?: string | null;
};

export type TranscriptSpeakers = Record<string, TranscriptSpeaker | undefined>;

export const SPARKS_SETUP_HREF = "/sparks-model";

// ---------- names ----------

/** A person's name: name, then username, then the name the call list gave, then "Someone". */
export function personName(
  userId: string,
  speakers?: TranscriptSpeakers | null,
  fallback?: string | null,
): string {
  const person = speakers?.[userId];
  return clean(person?.name) || clean(person?.username) || clean(fallback) || "Someone";
}

/** How a line's speaker is labelled: always by name; the viewer's own name gets a "(you)" tag. */
export function speakerLabel(
  userId: string,
  myUserId: string | null | undefined,
  speakers?: TranscriptSpeakers | null,
  fallback?: string | null,
): { name: string; isMe: boolean; text: string } {
  const isMe = Boolean(myUserId) && userId === myUserId;
  const known = clean(speakers?.[userId]?.name) || clean(speakers?.[userId]?.username) || clean(fallback);
  // Our own name may be unknown (an older server): "You" rather than "Someone".
  const name = known || (isMe ? "You" : "Someone");
  return { name, isMe, text: isMe && known ? `${name} (you)` : name };
}

/** "Ben", "Ben and Cy", "Ben, Cy and Dee", "Ben, Cy and 3 others". */
export function joinNames(names: string[], max = 3): string {
  const list = names.filter(Boolean);
  if (list.length <= 1) return list[0] || "";
  if (list.length > max) {
    const rest = list.length - (max - 1);
    return `${list.slice(0, max - 1).join(", ")} and ${rest} others`;
  }
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

function clean(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

// ---------- per person ----------

const KNOWN: TranscriptParticipantStatus[] = [
  "transcribed",
  "no_sparks",
  "not_accepted",
  "declined",
  "silent",
  "muted",
  "not_listening",
  "no_lines",
];

function statusOf(p: TranscriptParticipant): TranscriptParticipantStatus {
  // Unknown values from a newer server: say only what we know (no lines), never "didn't speak".
  return (KNOWN as string[]).includes(p.status) ? (p.status as TranscriptParticipantStatus) : "no_lines";
}

/**
 * One vocabulary: the chip beside a name and the sentence about that person
 * use the same words ("Needs Sparks" / "... needs Sparks on their phone").
 * "Sparks" is only ever the feature.
 */
export function statusMark(status: TranscriptParticipantStatus | string): string {
  switch (status) {
    case "transcribed":
      return "In transcript";
    case "no_sparks":
      return "Needs Sparks";
    case "not_accepted":
      return "Turned off";
    case "declined":
      return "Opted out";
    case "silent":
      return "Didn't speak";
    case "muted":
      return "Mic off";
    case "not_listening":
      return "Sparks didn't start";
    default:
      return "No lines came through";
  }
}

/** First word of a name ("Ben Carter" -> "Ben"). */
export function firstName(name: string): string {
  return clean(name).split(/\s+/)[0] || name;
}

export type CoverageChip = {
  userId: string;
  name: string;
  isMe: boolean;
  status: TranscriptParticipantStatus;
  /** Short text beside the name ("In transcript", "Needs Sparks"). */
  mark: string;
  /** Their lines are in the transcript. */
  inTranscript: boolean;
};

export type CoverageNote = {
  kind: "no_sparks" | "not_accepted" | "declined" | "not_listening" | "no_lines";
  text: string;
};

export type Coverage = {
  /** Everyone, the viewer first, then the people in the transcript, then the rest. */
  chips: CoverageChip[];
  /** The one line: "2 of 4 in the transcript · Cy needs Sparks · Eve opted out". */
  line: string;
  /** Everyone's lines are in. */
  allIn: boolean;
  /** Nobody is missing because of their phone or their choice (some may just not have spoken). */
  nobodyMissing: boolean;
  /** The viewer's own lines are missing: always shown, apart from the line. */
  mine: { text: string; href?: string } | null;
  /** Full sentences about the others who are missing (shown when expanded). */
  notes: CoverageNote[];
  /** Shown when expanded, when someone is missing. */
  explainer: string | null;
  inCount: number;
  total: number;
};

// Missing because of their phone or their choice (not because they were quiet or muted).
const MISSING: TranscriptParticipantStatus[] = ["no_sparks", "not_accepted", "declined", "not_listening", "no_lines"];
// No lines, but nothing is wrong: they were quiet, or their mic was off.
const QUIET: TranscriptParticipantStatus[] = ["silent", "muted"];

/**
 * Who is (and isn't) in a call's transcript, in the app's words. Only people
 * whose lines are there count as in. `live`: the call is still going.
 */
export function describeCoverage(
  participants: TranscriptParticipant[] | null | undefined,
  myUserId: string | null | undefined,
  speakers?: TranscriptSpeakers | null,
  options: { live?: boolean } = {},
): Coverage {
  const live = Boolean(options.live);
  const people = (participants || []).map((p) => {
    const status = statusOf(p);
    return {
      userId: p.userId,
      name: personName(p.userId, speakers, p.displayName),
      isMe: Boolean(myUserId) && p.userId === myUserId,
      status,
      mark: statusMark(status),
      inTranscript: status === "transcribed",
    } satisfies CoverageChip;
  });

  const rank = (c: CoverageChip) => (c.isMe ? 0 : c.inTranscript ? 1 : QUIET.includes(c.status) ? 2 : 3);
  const chips = people
    .map((chip, index) => ({ chip, index }))
    .sort((a, b) => rank(a.chip) - rank(b.chip) || a.index - b.index)
    .map(({ chip }) => chip);

  const me = people.find((c) => c.isMe);
  const mine =
    me?.status === "no_sparks"
      ? { text: "Your lines aren't here: get Sparks on this phone", href: SPARKS_SETUP_HREF }
      : me?.status === "not_accepted"
        ? { text: "Your lines aren't here: you turned transcription off for this call." }
        : me?.status === "declined"
          ? { text: "Your lines aren't here: you opted out of transcripts." }
          : me?.status === "not_listening"
            ? { text: "Your lines aren't here: Sparks didn't start on this phone for this call.", href: SPARKS_SETUP_HREF }
            : me?.status === "no_lines"
              ? { text: "Your lines aren't here: nothing came through from this phone." }
              : null;

  const others = people.filter((c) => !c.isMe);
  const named = (status: TranscriptParticipantStatus) => others.filter((c) => c.status === status).map((c) => c.name);
  const noSparks = named("no_sparks");
  const turnedOff = named("not_accepted");
  const optedOut = named("declined");
  const firsts = (names: string[]) => joinNames(names.map(firstName));
  const many = (names: string[]) => names.length > 1;

  const notes: CoverageNote[] = [];
  const short: string[] = [];
  if (noSparks.length) {
    notes.push({
      kind: "no_sparks",
      text: `${joinNames(noSparks)} ${many(noSparks) ? "need" : "needs"} Sparks on their ${many(noSparks) ? "phones" : "phone"} to be in the transcript.`,
    });
    short.push(`${firsts(noSparks)} ${many(noSparks) ? "need" : "needs"} Sparks`);
  }
  if (turnedOff.length) {
    notes.push({ kind: "not_accepted", text: `${joinNames(turnedOff)} turned transcription off for this call.` });
    short.push(`${firsts(turnedOff)} turned it off`);
  }
  if (optedOut.length) {
    notes.push({ kind: "declined", text: `${joinNames(optedOut)} opted out of transcripts.` });
    short.push(`${firsts(optedOut)} opted out`);
  }
  const notStarted = named("not_listening");
  if (notStarted.length) {
    notes.push({
      kind: "not_listening",
      text: `Sparks didn't start on ${joinNames(notStarted)}'s ${many(notStarted) ? "phones" : "phone"} for this call, so nothing they said is here.`,
    });
    short.push(`Sparks didn't start for ${firsts(notStarted)}`);
  }
  const noLines = named("no_lines");
  if (noLines.length) {
    notes.push({
      kind: "no_lines",
      text: `No lines came through from ${joinNames(noLines)}'s ${many(noLines) ? "phones" : "phone"}. Their phone may not have been able to transcribe, so this doesn't mean they didn't speak.`,
    });
    short.push(`nothing came through from ${firsts(noLines)}`);
  }
  const quiet = named("silent");
  if (quiet.length) {
    const verb = !live ? "didn't speak" : many(quiet) ? "haven't spoken yet" : "hasn't spoken yet";
    short.push(`${firsts(quiet)} ${verb}`);
  }
  const micOff = named("muted");
  if (micOff.length) {
    short.push(`${firsts(micOff)} ${live ? (many(micOff) ? "have" : "has") + " their mic off" : "had their mic off"}`);
  }

  const total = people.length;
  const inCount = people.filter((c) => c.inTranscript).length;
  const nobodyMissing = !people.some((c) => MISSING.includes(c.status));
  const allIn = total > 0 && inCount === total;
  const head = !inCount
    ? live
      ? "Nothing was picked up yet"
      : "Nothing was picked up"
    : allIn
      ? "Everyone is in the transcript"
      : `${inCount} of ${total} in the transcript`;
  const line = total ? [head, ...short].join(" · ") : "";
  const explainer = nobodyMissing ? null : "Each phone writes down only its owner's voice.";

  return { chips, line, allIn, nobodyMissing, mine, notes, explainer, inCount, total };
}

// ---------- quick notes ----------

/** Quick notes quote people: "Ben: Three quests are still open." -> { who: "Ben", text: "Three quests..." }. */
export function splitSaid(text: string): { who: string | null; text: string } {
  const match = /^([^:\n]{1,40}):\s+([\s\S]+)$/.exec(text);
  return match ? { who: match[1].trim(), text: match[2] } : { who: null, text };
}

const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A quoted line may hold a short exchange: "Amara: Are we still meeting at
 * ten? Ben: Ten works." -> two parts, one per speaker. A new speaker starts
 * only after the end of a sentence and only with a name from `names` (the
 * call's first names), so "on the board: who owns it?" is never split.
 */
export function splitQuotes(text: string, names: string[] = []): { who: string | null; text: string }[] {
  const lead = splitSaid(text);
  if (!lead.who) return [lead];
  const known = names.map((n) => n.trim()).filter(Boolean).map(escapeRe);
  if (!known.length) return [lead];
  const next = new RegExp(`([.?!…]["'”’)]?)\\s+(${known.join("|")}):\\s+`, "g");
  const parts: { who: string | null; text: string }[] = [];
  let who: string = lead.who;
  let from = 0;
  let match: RegExpExecArray | null;
  while ((match = next.exec(lead.text))) {
    parts.push({ who, text: lead.text.slice(from, match.index + match[1].length) });
    who = match[2];
    from = match.index + match[0].length;
  }
  parts.push({ who, text: lead.text.slice(from) });
  return parts;
}

/**
 * The label for a quoted line: the first name the server wrote, with "(you)"
 * when it is the viewer's (only when no one else on the call shares that
 * first name, so it is never a guess).
 */
export function saidLabel(
  who: string,
  myUserId: string | null | undefined,
  speakers?: TranscriptSpeakers | null,
): string {
  if (!myUserId || !speakers?.[myUserId]) return who;
  const firstOf = (id: string) => firstName(personName(id, speakers)).toLowerCase();
  const target = who.trim().toLowerCase();
  if (firstOf(myUserId) !== target) return who;
  const clash = Object.keys(speakers).some((id) => id !== myUserId && firstOf(id) === target);
  return clash ? who : `${who} (you)`;
}

/** A person as a quoted-line label: "Ben", or "Amara (you)" for the viewer. */
export function ownerLabel(
  userId: string,
  myUserId: string | null | undefined,
  speakers?: TranscriptSpeakers | null,
  fallback?: string | null,
): string {
  if (Boolean(myUserId) && userId === myUserId) {
    const mine = firstName(personName(userId, speakers));
    return mine === "Someone" ? "You" : `${mine} (you)`;
  }
  const first = firstName(personName(userId, speakers, fallback));
  return first.charAt(0).toUpperCase() + first.slice(1);
}

// ---------- empty and error states ----------

/**
 * What an empty transcript says. Read through statusOf, like the chips, so a
 * status this build doesn't know never reads as "nobody had Sparks turned on"
 * (26 Oct: build 13 showed "Didn't speak" beside the viewer and "nobody had
 * Sparks turned on" underneath for the same person, for a status it didn't
 * know). When a phone had Sparks on but its lines never came through, say
 * that, not that nobody spoke.
 */
export function emptyTranscriptCopy(
  participants: TranscriptParticipant[] | null | undefined,
  callStatus: string | null | undefined,
): string {
  if (callStatus === "active") return "Nothing yet: lines show up here as people with Sparks talk.";
  const statuses = (participants || []).map(statusOf);
  if (statuses.some((s) => s === "no_lines" || s === "not_listening" || s === "transcribed")) {
    return "No lines came through for this call. That doesn't mean nobody spoke.";
  }
  if (statuses.some((s) => s === "silent" || s === "muted")) return "Nothing said on this call was picked up.";
  return "No transcript for this call: nobody had Sparks turned on.";
}

/** Plain words for the transcript endpoint's errors (by HTTP status). */
export function transcriptErrorCopy(status: number | null | undefined): { title: string; body: string; retry: boolean } {
  switch (status) {
    case 403:
      return { title: "Not available to you", body: "Only people who were on this call can read its transcript.", retry: false };
    case 404:
      return { title: "Call not found", body: "This call doesn't exist any more, or the link is wrong.", retry: false };
    case 501:
      return {
        title: "Not available yet",
        body: "Transcripts aren't available yet.",
        retry: false,
      };
    case 503:
      return { title: "Sparks is off", body: "Sparks is switched off on CosQuest right now, so transcripts can't be shown.", retry: true };
    default:
      return { title: "Couldn't load the transcript", body: "Check your connection and try again.", retry: true };
  }
}

// ---------- times ----------

/** m:ss from the start of the call (h:mm:ss after an hour). */
export function callClock(ms: number): string {
  const total = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Thu 23 Oct, 14:05 · 32 min" (local time). While live: "Started 14:05 · 12 min so far". */
export function callWhen(startedAt: string | null | undefined, endedAt: string | null | undefined, now = Date.now()): string {
  const start = startedAt ? new Date(startedAt) : null;
  if (!start || Number.isNaN(start.getTime())) return "";
  const time = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
  const end = endedAt ? new Date(endedAt).getTime() : null;
  const minutes = Math.max(0, Math.round(((end ?? now) - start.getTime()) / 60000));
  const length = minutes < 1 ? "under a minute" : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  if (end === null) return `Started ${time} · ${length} so far`;
  return `${DAYS[start.getDay()]} ${start.getDate()} ${MONTHS[start.getMonth()]}, ${time} · ${length}`;
}
