// Every answer in the server question bank can be said (day1-trivia, 3 Nov 2026).
// voiceBank.json = the choices and answer of every trivia, rebus and quote question in
// costquest-backend app/content (716), plus the Warden-approved site trivia from staging.
// Before the matcher fix 13 could not be answered by saying them: "Mewtwo" also matched
// "Mew", "One For All" tied "All For One", "S.T.A.R.S." and "E.T." had no words to match,
// "Up" was too short, "D.Va" was heard as option D, "1.21 gigawatts" glued to "12.1".
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { matchSpokenAnswer } from "../voiceAnswer.ts";

type Q = { id: string; c: string[]; a: number };
const bank: Q[] = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "voiceBank.json"), "utf8"));
const ORD = ["the first one", "the second one", "the third one", "the fourth one"];
const COLOUR = ["the blue one", "the red one", "the orange one", "the green one"];

const misses = (said: (q: Q) => string, strict: boolean) =>
  bank.filter((q) => matchSpokenAnswer(said(q), q.c, strict) !== q.a).map((q) => `${q.id}: "${said(q)}"`);

test("the bank is all here", () => {
  assert.ok(bank.length >= 716 + 42, `${bank.length} questions`);
});

test("saying the answer picks it, on the final result and on a confident partial", () => {
  assert.deepEqual(misses((q) => q.c[q.a], false), []);
  assert.deepEqual(misses((q) => q.c[q.a], true), []);
});

test("as a recogniser writes it: lower case, no punctuation", () => {
  assert.deepEqual(misses((q) => q.c[q.a].toLowerCase().replace(/[^a-z0-9 ]+/g, " "), false), []);
});

test("in a sentence: \"I think it is <answer>\"", () => {
  assert.deepEqual(misses((q) => `I think it is ${q.c[q.a]}`, false), []);
});

test("by position and by colour", () => {
  // "the first one" beside a choice that itself says "first" is ambiguous too: nothing is picked, never a wrong one.
  const ordWord = /\b(first|second|third|fourth)\b/i;
  const ordPlain = bank.filter((q) => !q.c.some((c) => ordWord.test(c)));
  assert.deepEqual(ordPlain.filter((q) => matchSpokenAnswer(ORD[q.a], q.c, false) !== q.a).map((q) => q.id), []);
  for (const q of bank.filter((x) => !ordPlain.includes(x))) {
    const got = matchSpokenAnswer(ORD[q.a], q.c, false);
    assert.ok(got === q.a || got === null, `${q.id}: ${ORD[q.a]} picked ${got}`);
  }
  // A colour that is also in a choice ("the green one" beside "Green Arrow") is ambiguous: the
  // player meant the button or the name, so those few are left out (the button names are on screen).
  const colourWord = /\b(blue|red|orange|yellow|green)\b/i;
  const plain = bank.filter((q) => !q.c.some((c) => colourWord.test(c)));
  assert.ok(plain.length > bank.length * 0.9, `${plain.length} of ${bank.length}`);
  assert.deepEqual(plain.filter((q) => matchSpokenAnswer(COLOUR[q.a], q.c, false) !== q.a).map((q) => q.id), []);
});

test("saying a wrong answer never picks the right one", () => {
  const wrongPicked = bank.filter((q) => q.c.some((c, j) => j !== q.a && matchSpokenAnswer(c, q.c, false) === q.a)).map((q) => q.id);
  assert.deepEqual(wrongPicked, []);
});

test("acronyms, short names and run-together names", () => {
  assert.equal(matchSpokenAnswer("stars", ["FOXHOUND", "U.B.C.S.", "B.S.A.A.", "S.T.A.R.S."], false), 3);
  assert.equal(matchSpokenAnswer("e t", ["Mary", "E.T.", "Michael", "Keys"], false), 1);
  assert.equal(matchSpokenAnswer("up", ["Cars", "Coco", "Ratatouille", "Up"], true), 3);
  assert.equal(matchSpokenAnswer("d va", ["Symmetra", "D.Va", "Kiriko", "Mei"], true), 1);
  assert.equal(matchSpokenAnswer("mewtwo", ["Articuno", "Mew", "Mewtwo", "Dragonite"], true), 2);
  assert.equal(matchSpokenAnswer("mew", ["Articuno", "Mew", "Mewtwo", "Dragonite"], false), 1);
  assert.equal(matchSpokenAnswer("one for all", ["All For One", "Half-Cold Half-Hot", "Explosion", "One For All"], true), 3);
  // A choice called "One" does not stop "the second one" meaning the second.
  assert.equal(matchSpokenAnswer("the second one", ["One", "Two Face", "Three", "Four"], false), 1);
});
