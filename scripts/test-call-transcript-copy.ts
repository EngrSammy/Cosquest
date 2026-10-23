// Checks the words the app shows about who is in a call's transcript
// (services/callTranscriptCopy.ts). No test runner in this app, so:
//   npx tsx scripts/test-call-transcript-copy.ts

import {
  callClock,
  callWhen,
  describeCoverage,
  emptyTranscriptCopy,
  inCallMissing,
  joinNames,
  personName,
  speakerLabel,
  statusMark,
  transcriptErrorCopy,
  type TranscriptParticipant,
  type TranscriptSpeakers,
} from "../services/callTranscriptCopy";

// Node's own assert. Typed here by hand: the app's type check has no Node
// types, and a reference to them would leak into every app file.
declare const require: (id: string) => any;
const assert: {
  equal(actual: unknown, expected: unknown): void;
  deepEqual(actual: unknown, expected: unknown): void;
  ok(value: unknown): void;
  match(value: string, pattern: RegExp): void;
  doesNotMatch(value: string, pattern: RegExp): void;
} = require("node:assert/strict");

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const speakers: TranscriptSpeakers = {
  me: { id: "me", username: "amara", name: "Amara Obi" },
  ben: { id: "ben", username: "ben.c", name: "Ben Carter" },
  cy: { id: "cy", username: "cy", name: null },
  dee: { id: "dee", username: null, name: "Dee Lawal" },
};

const p = (userId: string, status: string, lines = 0, displayName?: string): TranscriptParticipant => ({
  userId,
  status,
  lines,
  displayName: displayName ?? null,
});

test("names: name, then username, then the call's name, then Someone", () => {
  assert.equal(personName("ben", speakers), "Ben Carter");
  assert.equal(personName("cy", speakers), "cy");
  assert.equal(personName("zed", speakers, "Zed Ade"), "Zed Ade");
  assert.equal(personName("zed", speakers), "Someone");
  assert.equal(personName("zed", null, "  "), "Someone");
});

test("speaker label: the viewer by name with (you), never bare You when the name is known", () => {
  assert.deepEqual(speakerLabel("me", "me", speakers), { name: "Amara Obi", isMe: true, text: "Amara Obi (you)" });
  assert.deepEqual(speakerLabel("ben", "me", speakers), { name: "Ben Carter", isMe: false, text: "Ben Carter" });
  // Own name unknown: "You" rather than "Someone".
  assert.equal(speakerLabel("me", "me", {}).text, "You");
  // No viewer id: nobody is "you".
  assert.equal(speakerLabel("me", null, speakers).text, "Amara Obi");
});

test("joinNames", () => {
  assert.equal(joinNames([]), "");
  assert.equal(joinNames(["Ben"]), "Ben");
  assert.equal(joinNames(["Ben", "Cy"]), "Ben and Cy");
  assert.equal(joinNames(["Ben", "Cy", "Dee"]), "Ben, Cy and Dee");
  assert.equal(joinNames(["Ben", "Cy", "Dee", "Eve", "Fay"]), "Ben, Cy and 3 others");
});

test("status marks", () => {
  assert.equal(statusMark("transcribed", 1), "1 line");
  assert.equal(statusMark("transcribed", 12), "12 lines");
  assert.equal(statusMark("no_sparks"), "No Sparks yet");
  assert.equal(statusMark("not_accepted"), "Sparks off");
  assert.equal(statusMark("declined"), "Not transcribed");
  assert.equal(statusMark("silent"), "Nothing picked up");
});

test("everyone transcribed: one quiet line, no notes", () => {
  const c = describeCoverage([p("me", "transcribed", 4), p("ben", "transcribed", 7)], "me", speakers);
  assert.equal(c.allIn, "Everyone on the call is in this transcript.");
  assert.deepEqual(c.notes, []);
  assert.equal(c.explainer, null);
  assert.equal(c.summary, "All 2 people are in the transcript");
  assert.equal(c.chips[0].isMe, true);
});

test("silent people don't make a banner", () => {
  const c = describeCoverage([p("me", "transcribed", 4), p("ben", "silent")], "me", speakers);
  assert.equal(c.allIn, "Everyone had Sparks on. Nothing was picked up from Ben Carter.");
  assert.deepEqual(c.notes, []);
  assert.equal(c.summary, "1 of 2 people are in the transcript");
  assert.equal(c.chips.find((x) => x.userId === "ben")?.mark, "Nothing picked up");
});

test("others without Sparks: named, plural, with the explainer", () => {
  const c = describeCoverage(
    [p("me", "transcribed", 3), p("ben", "no_sparks"), p("cy", "no_sparks"), p("dee", "declined")],
    "me",
    speakers,
  );
  assert.equal(c.allIn, null);
  assert.deepEqual(
    c.notes.map((n) => n.text),
    [
      "Ben Carter and cy aren't in this transcript: Sparks isn't set up on their phones yet.",
      "Dee Lawal chose not to be transcribed.",
    ],
  );
  assert.equal(c.explainer, "Each phone writes down only its owner's voice.");
  assert.equal(c.summary, "1 of 4 people are in the transcript");
  // The viewer first, then those in, then the rest (in server order).
  assert.deepEqual(
    c.chips.map((x) => x.userId),
    ["me", "ben", "cy", "dee"],
  );
});

test("one person without Sparks: singular", () => {
  const c = describeCoverage([p("me", "transcribed", 3), p("ben", "no_sparks")], "me", speakers);
  assert.equal(c.notes[0].text, "Ben Carter isn't in this transcript: Sparks isn't set up on their phone yet.");
});

test("Sparks off: tense follows the call", () => {
  const ended = describeCoverage([p("me", "transcribed", 3), p("dee", "not_accepted")], "me", speakers);
  assert.equal(ended.notes[0].text, "Dee Lawal had Sparks off for this call.");
  const live = describeCoverage([p("me", "transcribed", 3), p("dee", "not_accepted")], "me", speakers, { live: true });
  assert.equal(live.notes[0].text, "Dee Lawal has Sparks off for this call.");
  assert.equal(live.explainer, "Each phone writes down only its owner's voice.");
});

test("declined only: no explainer (it's a choice, not a phone problem)", () => {
  const c = describeCoverage([p("me", "transcribed", 3), p("dee", "declined")], "me", speakers);
  assert.equal(c.explainer, null);
});

test("the viewer without Sparks: first, with the setup action", () => {
  const c = describeCoverage([p("ben", "transcribed", 5), p("me", "no_sparks")], "me", speakers);
  assert.equal(c.notes[0].kind, "me_no_sparks");
  assert.equal(c.notes[0].text, "Your lines aren't here: Sparks isn't set up on your phone yet.");
  assert.deepEqual(c.notes[0].action, { label: "Set up Sparks", href: "/sparks-model" });
  assert.equal(c.chips[0].userId, "me");
});

test("the viewer with Sparks off or opted out", () => {
  assert.equal(
    describeCoverage([p("me", "not_accepted")], "me", speakers).notes[0].text,
    "Your lines aren't here: you had Sparks off for this call.",
  );
  assert.equal(
    describeCoverage([p("me", "not_accepted")], "me", speakers, { live: true }).notes[0].text,
    "Your lines aren't here: Sparks is off for you on this call.",
  );
  assert.equal(describeCoverage([p("me", "declined")], "me", speakers).notes[0].text, "You chose not to be transcribed on this call.");
});

test("names fall back to the participant's displayName; unknown statuses are treated as silent", () => {
  const c = describeCoverage([p("zed", "no_sparks", 0, "Zed Ade"), p("yan", "brand_new_status")], null, {});
  assert.equal(c.notes[0].text, "Zed Ade isn't in this transcript: Sparks isn't set up on their phone yet.");
  assert.equal(c.chips.find((x) => x.userId === "yan")?.status, "silent");
});

test("no participants: nothing to say", () => {
  const c = describeCoverage(undefined, "me", speakers);
  assert.equal(c.total, 0);
  assert.equal(c.allIn, null);
  assert.equal(c.summary, "");
});

test("in-call lines: by name, no pronouns, the viewer first", () => {
  const lines = inCallMissing(
    [p("ben", "no_sparks"), p("dee", "not_accepted"), p("cy", "transcribed", 2), p("me", "no_sparks"), p("eve", "declined", 0, "Eve")],
    "me",
    speakers,
  );
  assert.deepEqual(
    lines.map((l) => l.text),
    ["You: no Sparks yet", "Ben Carter: no Sparks yet", "Dee Lawal: Sparks off", "Eve: chose not to be transcribed"],
  );
  for (const l of lines) assert.doesNotMatch(l.text, /\b(his|her|he|she)\b/i);
});

test("empty transcript copy", () => {
  assert.equal(emptyTranscriptCopy([p("a", "no_sparks")], "ended"), "No transcript yet: nobody on the call had Sparks on.");
  assert.equal(emptyTranscriptCopy([], "active"), "No transcript yet: nobody on the call has Sparks on.");
  assert.equal(emptyTranscriptCopy([p("a", "transcribed")], "active"), "Nothing said yet. Lines show up here as people talk.");
  assert.equal(emptyTranscriptCopy([p("a", "silent")], "ready"), "Sparks was on, but nothing said on the call was picked up.");
});

test("error copy by status", () => {
  assert.equal(transcriptErrorCopy(403).retry, false);
  assert.match(transcriptErrorCopy(403).body, /Only people who were on this call/);
  assert.equal(transcriptErrorCopy(404).title, "Call not found");
  assert.match(transcriptErrorCopy(501).body, /update/);
  assert.equal(transcriptErrorCopy(503).title, "Sparks is off");
  assert.equal(transcriptErrorCopy(null).retry, true);
  assert.equal(transcriptErrorCopy(500).title, "Couldn't load the transcript");
});

test("clock and dates", () => {
  assert.equal(callClock(0), "0:00");
  assert.equal(callClock(65_400), "1:05");
  assert.equal(callClock(3_725_000), "1:02:05");
  assert.equal(callClock(-5), "0:00");
  const start = new Date(2026, 9, 23, 14, 5).toISOString();
  const end = new Date(2026, 9, 23, 14, 37).toISOString();
  assert.equal(callWhen(start, end), "Fri 23 Oct, 14:05 · 32 min");
  assert.equal(callWhen(start, null, new Date(2026, 9, 23, 14, 17).getTime()), "Started 14:05 · 12 min so far");
  assert.equal(callWhen(start, new Date(2026, 9, 23, 15, 50).toISOString()), "Fri 23 Oct, 14:05 · 1 h 45 min");
  assert.equal(callWhen(null, null), "");
});

console.log(`\n${passed} passed`);
