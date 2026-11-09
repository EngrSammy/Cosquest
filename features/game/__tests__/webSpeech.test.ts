import assert from "node:assert/strict";
import { test } from "node:test";

import { VoiceAnswer } from "../voiceAnswer.ts";
import { transcriptOf, webSpeechCode, webSpeechEngine, type WebRecognition } from "../webSpeech.ts";

/** A stand-in for the browser recogniser: the test says what it "hears". */
function fakeBrowser() {
  const made: FakeRec[] = [];
  class FakeRec implements WebRecognition {
    lang = "";
    continuous = true;
    interimResults = false;
    maxAlternatives = 0;
    onresult: WebRecognition["onresult"] = null;
    onerror: WebRecognition["onerror"] = null;
    onend: WebRecognition["onend"] = null;
    started = false;
    aborted = false;
    constructor() {
      made.push(this);
    }
    start() {
      this.started = true;
    }
    abort() {
      this.aborted = true;
    }
    say(parts: [string, boolean][]) {
      const results = parts.map(([t, f]) => Object.assign([{ transcript: t }], { isFinal: f }));
      this.onresult?.({ results: Object.assign(results, { length: results.length }) as never });
    }
  }
  return { g: { webkitSpeechRecognition: FakeRec, navigator: { language: "en-GB" } }, made };
}

const deps = (engine: ReturnType<typeof webSpeechEngine>) => ({
  engine,
  callActive: () => false,
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
});

test("no recogniser in this browser: no engine (the mic button is not offered)", () => {
  assert.equal(webSpeechEngine({}), null);
});

test("errors map to VoiceAnswer's codes", () => {
  assert.equal(webSpeechCode("not-allowed"), "permission_denied");
  assert.equal(webSpeechCode("no-speech"), "speech_timeout");
  assert.equal(webSpeechCode("audio-capture"), "audio");
  assert.equal(webSpeechCode("network"), "unavailable");
});

test("results join into one transcript; the last one says whether it is final", () => {
  const e = { results: Object.assign([Object.assign([{ transcript: "sailor " }], { isFinal: true }), Object.assign([{ transcript: "mars" }], { isFinal: false })], { length: 2 }) };
  assert.deepEqual(transcriptOf(e as never), { text: "sailor mars", final: false });
});

test("the whole path: the browser hears the answer, the matcher picks its index, the mic closes", async () => {
  const { g, made } = fakeBrowser();
  const v = new VoiceAnswer(deps(webSpeechEngine(g)));
  const picked: number[] = [];
  await v.listen(["Sailor Venus", "Sailor Mars", "Sailor Jupiter", "Sailor Mercury"], (i) => picked.push(i));
  assert.equal(v.state.kind, "listening");
  const rec = made[0];
  assert.equal(rec.started, true);
  assert.equal(rec.interimResults, true);
  assert.equal(rec.lang, "en-GB");
  rec.say([["sailor", false]]);
  assert.deepEqual(picked, []);
  rec.say([["sailor mars", false]]);
  assert.deepEqual(picked, [1]);
  assert.deepEqual(v.state, { kind: "matched", index: 1 });
  assert.equal(rec.aborted, true);
  v.stop();
});

test("\"the green one\" on the final result", async () => {
  const { g, made } = fakeBrowser();
  const v = new VoiceAnswer(deps(webSpeechEngine(g)));
  const picked: number[] = [];
  await v.listen(["Pochita", "Ein", "Meowy", "Bond"], (i) => picked.push(i));
  made[0].say([["the green one", true]]);
  assert.deepEqual(picked, [3]);
  v.stop();
});

test("a refused microphone says how to allow it", async () => {
  const { g, made } = fakeBrowser();
  const v = new VoiceAnswer(deps(webSpeechEngine(g)));
  await v.listen(["A1", "B2", "C3", "D4"], () => {});
  made[0].onerror?.({ error: "not-allowed" });
  assert.equal(v.state.kind, "unavailable");
  v.stop();
});
