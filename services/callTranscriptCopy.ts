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
  | "silent"; // Sparks was on, nothing they said was picked up

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

const KNOWN: TranscriptParticipantStatus[] = ["transcribed", "no_sparks", "not_accepted", "declined", "silent"];

function statusOf(p: TranscriptParticipant): TranscriptParticipantStatus {
  // Unknown values from a newer server: treat as "nothing picked up" (no blame, no action).
  return (KNOWN as string[]).includes(p.status) ? (p.status as TranscriptParticipantStatus) : "silent";
}

/** The short mark beside a name on a chip. */
export function statusMark(status: TranscriptParticipantStatus | string, lines = 0): string {
  switch (status) {
    case "transcribed":
      return lines === 1 ? "1 line" : `${lines} lines`;
    case "no_sparks":
      return "No Sparks yet";
    case "not_accepted":
      return "Sparks off";
    case "declined":
      return "Not transcribed";
    default:
      return "Nothing picked up";
  }
}

export type CoverageChip = {
  userId: string;
  name: string;
  isMe: boolean;
  status: TranscriptParticipantStatus;
  /** Short text beside the name ("12 lines", "No Sparks yet"). */
  mark: string;
  /** Their lines are in the transcript. */
  inTranscript: boolean;
};

export type CoverageNote = {
  kind: "me_no_sparks" | "me_not_accepted" | "me_declined" | "no_sparks" | "not_accepted" | "declined";
  text: string;
  /** Only for the viewer's own "no Sparks" note: where to set it up. */
  action?: { label: string; href: string };
};

export type Coverage = {
  /** Everyone, the viewer first, then the people in the transcript, then the rest. */
  chips: CoverageChip[];
  /** One sentence per reason someone is missing (the viewer's own first). Empty when nobody is. */
  notes: CoverageNote[];
  /** Shown under the notes when someone is missing because of their phone. */
  explainer: string | null;
  /** Everyone is in (or had Sparks on): one quiet line instead of notes. */
  allIn: string | null;
  /** "3 of 4 people are in the transcript". */
  summary: string;
  inCount: number;
  total: number;
};

/**
 * What the coverage banner says. `live`: the call is still going (present
 * tense for "Sparks off").
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
    const isMe = Boolean(myUserId) && p.userId === myUserId;
    return {
      userId: p.userId,
      name: personName(p.userId, speakers, p.displayName),
      isMe,
      status,
      mark: statusMark(status, p.lines || 0),
      inTranscript: status === "transcribed",
    } satisfies CoverageChip;
  });

  const rank = (c: CoverageChip) => (c.isMe ? 0 : c.inTranscript ? 1 : c.status === "silent" ? 2 : 3);
  const chips = people
    .map((chip, index) => ({ chip, index }))
    .sort((a, b) => rank(a.chip) - rank(b.chip) || a.index - b.index)
    .map(({ chip }) => chip);

  const notes: CoverageNote[] = [];
  const me = people.find((c) => c.isMe);
  if (me?.status === "no_sparks") {
    notes.push({
      kind: "me_no_sparks",
      text: "Your lines aren't here: Sparks isn't set up on your phone yet.",
      action: { label: "Set up Sparks", href: SPARKS_SETUP_HREF },
    });
  } else if (me?.status === "not_accepted") {
    notes.push({
      kind: "me_not_accepted",
      text: live ? "Your lines aren't here: Sparks is off for you on this call." : "Your lines aren't here: you had Sparks off for this call.",
    });
  } else if (me?.status === "declined") {
    notes.push({ kind: "me_declined", text: "You chose not to be transcribed on this call." });
  }

  const others = people.filter((c) => !c.isMe);
  const named = (status: TranscriptParticipantStatus) => others.filter((c) => c.status === status).map((c) => c.name);

  const noSparks = named("no_sparks");
  if (noSparks.length) {
    const many = noSparks.length > 1;
    notes.push({
      kind: "no_sparks",
      text: `${joinNames(noSparks)} ${many ? "aren't" : "isn't"} in this transcript: Sparks isn't set up on their ${many ? "phones" : "phone"} yet.`,
    });
  }
  const notAccepted = named("not_accepted");
  if (notAccepted.length) {
    notes.push({
      kind: "not_accepted",
      text: `${joinNames(notAccepted)} ${live ? (notAccepted.length > 1 ? "have" : "has") : "had"} Sparks off for this call.`,
    });
  }
  const declined = named("declined");
  if (declined.length) {
    notes.push({ kind: "declined", text: `${joinNames(declined)} chose not to be transcribed.` });
  }

  const missingByPhone = noSparks.length > 0 || notAccepted.length > 0;
  const explainer = missingByPhone ? "Each phone writes down only its owner's voice." : null;

  const total = people.length;
  const inCount = people.filter((c) => c.inTranscript).length;
  const silent = named("silent");
  const allIn =
    total > 0 && notes.length === 0
      ? silent.length
        ? `Everyone had Sparks on. Nothing was picked up from ${joinNames(silent)}.`
        : "Everyone on the call is in this transcript."
      : null;
  const summary = total
    ? inCount === total
      ? total === 1
        ? "1 person is in the transcript"
        : `All ${total} people are in the transcript`
      : `${inCount} of ${total} ${total === 1 ? "person is" : "people are"} in the transcript`
    : "";

  return { chips, notes, explainer, allIn, summary, inCount, total };
}

// ---------- the in-call row ----------

/**
 * The compact lines for the in-call Sparks panel: one per person who won't be
 * in the transcript, by name, never guessing pronouns ("Ben: no Sparks yet").
 */
export function inCallMissing(
  participants: TranscriptParticipant[] | null | undefined,
  myUserId: string | null | undefined,
  speakers?: TranscriptSpeakers | null,
): { userId: string; isMe: boolean; text: string }[] {
  const reason: Partial<Record<TranscriptParticipantStatus, string>> = {
    no_sparks: "no Sparks yet",
    not_accepted: "Sparks off",
    declined: "chose not to be transcribed",
  };
  const out: { userId: string; isMe: boolean; text: string }[] = [];
  for (const p of participants || []) {
    const why = reason[statusOf(p)];
    if (!why) continue;
    const isMe = Boolean(myUserId) && p.userId === myUserId;
    const who = isMe ? "You" : personName(p.userId, speakers, p.displayName);
    out.push({ userId: p.userId, isMe, text: `${who}: ${why}` });
  }
  // The viewer first.
  return out.sort((a, b) => Number(b.isMe) - Number(a.isMe));
}

// ---------- empty and error states ----------

/** What an empty transcript says. */
export function emptyTranscriptCopy(
  participants: TranscriptParticipant[] | null | undefined,
  callStatus: string | null | undefined,
): string {
  const anyoneOn = (participants || []).some((p) => p.status === "transcribed" || p.status === "silent");
  if (callStatus === "active") {
    return anyoneOn
      ? "Nothing said yet. Lines show up here as people talk."
      : "No transcript yet: nobody on the call has Sparks on.";
  }
  return anyoneOn
    ? "Sparks was on, but nothing said on the call was picked up."
    : "No transcript yet: nobody on the call had Sparks on.";
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
        body: "Transcripts need an update to CosQuest's server. They'll appear here once it's done.",
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
