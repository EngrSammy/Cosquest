// Checks the words the app shows about who is in a call's transcript
// (services/callTranscriptCopy.ts). No test runner in this app, so:
//   npx tsx scripts/test-call-transcript-copy.ts

import {
  callClock,
  callWhen,
  describeCoverage,
  emptyTranscriptCopy,
  firstName,
  joinNames,
  ownerLabel,
  personName,
  saidLabel,
  speakerLabel,
  splitQuotes,
  splitSaid,
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

test("one vocabulary: chip marks", () => {
  assert.equal(statusMark("transcribed"), "In transcript");
  assert.equal(statusMark("no_sparks"), "Needs Sparks");
  assert.equal(statusMark("not_accepted"), "Turned off");
  assert.equal(statusMark("declined"), "Opted out");
  assert.equal(statusMark("silent"), "Didn't speak");
  // A status this build doesn't know: only what we know, never "didn't speak".
  assert.equal(statusMark("brand_new_status"), "No lines came through");
  assert.equal(statusMark("muted"), "Mic off");
  assert.equal(statusMark("not_listening"), "Sparks didn't start");
  assert.equal(statusMark("no_lines"), "No lines came through");
});

test("25 Oct voice chat: a phone that sent nothing is never 'didn't speak'", () => {
  // What Seyi's phone showed: the backend could not tell why no lines came (SDK 1.2.7 phone).
  const c = describeCoverage([p("me", "no_lines"), p("ben", "transcribed", 20)], "me", speakers);
  assert.equal(c.line, "1 of 2 in the transcript");
  assert.equal(c.chips[0].mark, "No lines came through");
  assert.equal(c.mine?.text, "Your lines aren't here: nothing came through from this phone.");
  assert.equal(c.nobodyMissing, false);
  const other = describeCoverage([p("me", "transcribed", 20), p("ben", "no_lines")], "me", speakers);
  assert.equal(other.line, "1 of 2 in the transcript · nothing came through from Ben");
  assert.match(other.notes[0].text, /doesn't mean they didn't speak/);
  for (const c2 of [c, other]) for (const chip of c2.chips) assert.doesNotMatch(chip.mark, /speak/);
});

test("SDK 1.2.8 phones: didn't speak only when the phone listened; mic off; Sparks didn't start", () => {
  const c = describeCoverage(
    [p("me", "transcribed", 5), p("ben", "silent"), p("cy", "muted"), p("dee", "not_listening")],
    "me",
    speakers,
  );
  assert.equal(c.line, "1 of 4 in the transcript · Sparks didn't start for Dee · Ben didn't speak · cy had their mic off");
  assert.deepEqual(
    c.chips.map((x) => [x.userId, x.mark]),
    [
      ["me", "In transcript"],
      ["ben", "Didn't speak"],
      ["cy", "Mic off"],
      ["dee", "Sparks didn't start"],
    ],
  );
  assert.equal(c.notes[0].kind, "not_listening");
  assert.equal(c.nobodyMissing, false);
  const mine = describeCoverage([p("me", "not_listening"), p("ben", "transcribed", 3)], "me", speakers);
  assert.equal(mine.mine?.text, "Your lines aren't here: Sparks didn't start on this phone for this call.");
  const live = describeCoverage([p("me", "transcribed", 1), p("cy", "muted")], "me", speakers, { live: true });
  assert.equal(live.line, "1 of 2 in the transcript · cy has their mic off");
  assert.equal(live.nobodyMissing, true);
});

test("everyone in: only when everyone's lines are there", () => {
  const c = describeCoverage([p("me", "transcribed", 4), p("ben", "transcribed", 7)], "me", speakers);
  assert.equal(c.allIn, true);
  assert.equal(c.nobodyMissing, true);
  assert.equal(c.line, "Everyone is in the transcript");
  assert.deepEqual(c.notes, []);
  assert.equal(c.mine, null);
  assert.equal(c.explainer, null);
  assert.equal(c.chips[0].isMe, true);
});

test("people who didn't speak are not counted as in", () => {
  const c = describeCoverage([p("me", "transcribed", 4), p("ben", "transcribed", 7), p("dee", "silent")], "me", speakers);
  assert.equal(c.allIn, false);
  assert.equal(c.nobodyMissing, true);
  assert.equal(c.inCount, 2);
  assert.equal(c.line, "2 of 3 in the transcript · Dee didn't speak");
  assert.equal(c.explainer, null);
  assert.equal(c.chips.find((x) => x.userId === "dee")?.mark, "Didn't speak");
  const live = describeCoverage([p("me", "transcribed", 4), p("ben", "silent"), p("dee", "silent")], "me", speakers, { live: true });
  assert.equal(live.line, "1 of 3 in the transcript · Ben and Dee haven't spoken yet");
});

test("nobody has lines: never 'Everyone is in'", () => {
  assert.equal(describeCoverage([p("me", "silent"), p("ben", "silent")], "me", speakers).line, "Nothing was picked up · Ben didn't speak");
  assert.equal(
    describeCoverage([p("me", "silent"), p("ben", "silent")], "me", speakers, { live: true }).line,
    "Nothing was picked up yet · Ben hasn't spoken yet",
  );
  const c = describeCoverage([p("me", "no_sparks"), p("ben", "no_sparks"), p("dee", "not_accepted")], "me", speakers);
  assert.equal(c.line, "Nothing was picked up · Ben needs Sparks · Dee turned it off");
  assert.equal(c.allIn, false);
  assert.equal(c.inCount, 0);
});

test("others missing: the one line, the sentences and the chips use the same words", () => {
  const c = describeCoverage(
    [p("me", "transcribed", 3), p("ben", "transcribed", 2), p("cy", "no_sparks", 0, "Cy Mensah"), p("eve", "declined", 0, "Eve Park")],
    "me",
    { ...speakers, cy: { id: "cy", name: "Cy Mensah" } },
  );
  assert.equal(c.allIn, false);
  assert.equal(c.line, "2 of 4 in the transcript · Cy needs Sparks · Eve opted out");
  assert.deepEqual(
    c.notes.map((n) => n.text),
    ["Cy Mensah needs Sparks on their phone to be in the transcript.", "Eve Park opted out of transcripts."],
  );
  assert.deepEqual(
    c.chips.map((x) => [x.userId, x.mark]),
    [
      ["me", "In transcript"],
      ["ben", "In transcript"],
      ["cy", "Needs Sparks"],
      ["eve", "Opted out"],
    ],
  );
  assert.equal(c.explainer, "Each phone writes down only its owner's voice.");
  for (const text of [c.line, ...c.notes.map((n) => n.text)]) assert.doesNotMatch(text, /\b(his|her|he|she)\b/i);
});

test("several people per reason: plural, first names in the one line", () => {
  const c = describeCoverage(
    [p("me", "transcribed", 3), p("ben", "no_sparks"), p("dee", "no_sparks"), p("x", "not_accepted", 0, "Xan Ito")],
    "me",
    speakers,
  );
  assert.equal(c.line, "1 of 4 in the transcript · Ben and Dee need Sparks · Xan turned it off");
  assert.deepEqual(
    c.notes.map((n) => n.text),
    [
      "Ben Carter and Dee Lawal need Sparks on their phones to be in the transcript.",
      "Xan Ito turned transcription off for this call.",
    ],
  );
});

test("the viewer's own lines: a line of its own, with the setup link when Sparks is missing", () => {
  const c = describeCoverage([p("ben", "transcribed", 5), p("me", "no_sparks")], "me", speakers);
  assert.deepEqual(c.mine, { text: "Your lines aren't here: get Sparks on this phone", href: "/sparks-model" });
  // The one line counts the viewer but doesn't repeat them.
  assert.equal(c.line, "1 of 2 in the transcript");
  assert.equal(c.chips[0].userId, "me");
  assert.equal(
    describeCoverage([p("me", "not_accepted")], "me", speakers).mine?.text,
    "Your lines aren't here: you turned transcription off for this call.",
  );
  assert.equal(describeCoverage([p("me", "declined")], "me", speakers).mine?.text, "Your lines aren't here: you opted out of transcripts.");
});

test("names fall back to the participant's displayName; unknown statuses are treated as no lines (never didn't speak)", () => {
  const c = describeCoverage([p("zed", "no_sparks", 0, "Zed Ade"), p("yan", "brand_new_status")], null, {});
  assert.equal(c.notes[0].text, "Zed Ade needs Sparks on their phone to be in the transcript.");
  assert.equal(c.chips.find((x) => x.userId === "yan")?.status, "no_lines");
});

test("no participants: nothing to say", () => {
  const c = describeCoverage(undefined, "me", speakers);
  assert.equal(c.total, 0);
  assert.equal(c.line, "");
});

test("quick notes: quoted lines, (you) on the viewer's, never a guess", () => {
  assert.deepEqual(splitSaid("Ben: Three quests are still open."), { who: "Ben", text: "Three quests are still open." });
  assert.deepEqual(splitSaid("I'll update the board tonight."), { who: null, text: "I'll update the board tonight." });
  assert.equal(saidLabel("Amara", "me", speakers), "Amara (you)");
  assert.equal(saidLabel("Ben", "me", speakers), "Ben");
  // Another Amara on the call: no (you), it could be either.
  assert.equal(saidLabel("Amara", "me", { ...speakers, a2: { id: "a2", name: "Amara Eze" } }), "Amara");
  assert.equal(saidLabel("Amara", null, speakers), "Amara");
  assert.equal(ownerLabel("me", "me", speakers), "Amara (you)");
  assert.equal(ownerLabel("ben", "me", speakers), "Ben");
  assert.equal(ownerLabel("me", "me", {}), "You");
  assert.equal(ownerLabel("zed", "me", {}, "someone on the call"), "Someone");
  assert.equal(firstName("  Ben   Carter "), "Ben");
});

test("quick notes: a short exchange splits by speaker, only after a sentence and on a known name", () => {
  const names = ["Amara", "Ben"];
  assert.deepEqual(splitQuotes("Amara: Are we still meeting at ten? Ben: Ten works.", names), [
    { who: "Amara", text: "Are we still meeting at ten?" },
    { who: "Ben", text: "Ten works." },
  ]);
  assert.deepEqual(splitQuotes("Amara: One more thing on the board: who owns the new quest? Ben: I can take it.", names), [
    { who: "Amara", text: "One more thing on the board: who owns the new quest?" },
    { who: "Ben", text: "I can take it." },
  ]);
  // Not a known name: no split.
  assert.deepEqual(splitQuotes("Ben: Ready? Answer: yes.", names), [{ who: "Ben", text: "Ready? Answer: yes." }]);
  // No leading speaker, or no names: one part.
  assert.deepEqual(splitQuotes("I'll book the hall.", names), [{ who: null, text: "I'll book the hall." }]);
  assert.deepEqual(splitQuotes("Amara: Hi? Ben: Hello.", []), [{ who: "Amara", text: "Hi? Ben: Hello." }]);
});

test("empty transcript copy", () => {
  assert.equal(emptyTranscriptCopy([p("a", "no_sparks")], "ended"), "No transcript for this call: nobody had Sparks turned on.");
  assert.equal(emptyTranscriptCopy([], "ready"), "No transcript for this call: nobody had Sparks turned on.");
  assert.equal(emptyTranscriptCopy([], "active"), "Nothing yet: lines show up here as people with Sparks talk.");
  assert.equal(emptyTranscriptCopy([p("a", "transcribed")], "active"), "Nothing yet: lines show up here as people with Sparks talk.");
  assert.equal(emptyTranscriptCopy([p("a", "silent")], "ready"), "Nothing said on this call was picked up.");
  assert.equal(emptyTranscriptCopy([p("a", "muted"), p("b", "not_accepted")], "ready"), "Nothing said on this call was picked up.");
  // 26 Oct (Emmanuel): a phone with Sparks on whose lines never arrived is not "nobody had Sparks".
  const lost = "No lines came through for this call. That doesn't mean nobody spoke.";
  assert.equal(emptyTranscriptCopy([p("me", "no_lines")], "ended"), lost);
  assert.equal(emptyTranscriptCopy([p("me", "not_listening"), p("b", "silent")], "ready"), lost);
  // A status this build doesn't know reads like the chip ("No lines came through"), never "nobody had Sparks".
  assert.equal(emptyTranscriptCopy([p("me", "brand_new_status")], "ready"), lost);
  assert.equal(emptyTranscriptCopy([p("a", "not_accepted"), p("b", "declined")], "ready"), "No transcript for this call: nobody had Sparks turned on.");
});

test("error copy by status", () => {
  assert.equal(transcriptErrorCopy(403).retry, false);
  assert.match(transcriptErrorCopy(403).body, /Only people who were on this call/);
  assert.equal(transcriptErrorCopy(404).title, "Call not found");
  assert.equal(transcriptErrorCopy(501).body, "Transcripts aren't available yet.");
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
