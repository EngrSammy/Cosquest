// Voice answers: the matcher and the listening session (costquest-ios Warden/VoiceAnswer.swift).
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { matchSpokenAnswer, type SpeechEngine, spokenWords, unavailableReason, VoiceAnswer, voicePrompt } from "../voiceAnswer.ts";

const CHOICES = ["Big Ben", "Tower Bridge", "The Shard", "Buckingham Palace"];

describe("matchSpokenAnswer", () => {
  it("matches the words themselves", () => {
    assert.equal(matchSpokenAnswer("tower bridge", CHOICES, true), 1);
    assert.equal(matchSpokenAnswer("I think it's Buckingham Palace", CHOICES, true), 3);
    assert.equal(matchSpokenAnswer("the shard", CHOICES, false), 2);
  });
  it("matches ordinals, letters and colours when little else was said", () => {
    assert.equal(matchSpokenAnswer("the second one", CHOICES, true), 1);
    assert.equal(matchSpokenAnswer("B", CHOICES, true), 1);
    assert.equal(matchSpokenAnswer("the green one", CHOICES, true), 3);
    assert.equal(matchSpokenAnswer("number three", CHOICES, true), 2);
    assert.equal(matchSpokenAnswer("first", CHOICES, true), 0);
  });
  it("does not read an ordinal out of another choice's own words", () => {
    const choices = ["One Direction", "Blur", "Oasis", "Pulp"];
    // "one" is a filler and an ordinal; "direction" names choice 0 by its words.
    assert.equal(matchSpokenAnswer("one direction", choices, true), 0);
    // A colour that is also another choice's word is that choice, not an ordinal.
    assert.equal(matchSpokenAnswer("blue", ["Red Kite", "Robin", "Blue Tit", "Wren"], false), 2);
    // "the red one" with no choice word: the second.
    assert.equal(matchSpokenAnswer("the red one", choices, true), 1);
  });
  it("forgives run-together words and accents", () => {
    assert.equal(matchSpokenAnswer("starlord", ["Star-Lord", "Groot", "Rocket", "Gamora"], true), 0);
    assert.equal(matchSpokenAnswer("cafe nero", ["Caffè Nero", "Café Nero", "Costa", "Pret"], false), 1);
  });
  it("matches a long word by its first five letters", () => {
    assert.equal(matchSpokenAnswer("buckingham", CHOICES, false), 3);
    assert.equal(matchSpokenAnswer("buckinghams palace", CHOICES, false), 3);
  });
  it("is strict on partials and lenient on the final result", () => {
    // Half of "Buckingham Palace" heard: not enough to act mid-sentence.
    assert.equal(matchSpokenAnswer("palace", CHOICES, true), null);
    assert.equal(matchSpokenAnswer("palace", CHOICES, false), 3);
  });
  it("returns nothing for silence, noise or a tie", () => {
    assert.equal(matchSpokenAnswer("", CHOICES, false), null);
    assert.equal(matchSpokenAnswer("hmm", CHOICES, false), null);
    assert.equal(matchSpokenAnswer("tower or shard", ["Tower", "Shard", "Eye", "Dome"], false), null);
  });
  it("never picks a choice a 50/50 removed", () => {
    const live = ["Big Ben", "", "The Shard", ""];
    assert.equal(matchSpokenAnswer("tower bridge", live, false), null);
    assert.equal(matchSpokenAnswer("the shard", live, true), 2);
  });
  it("splits words like the Swift original", () => {
    assert.deepEqual(spokenWords("Star-Lord, 1,200 Café!"), ["star", "lord", "1", "200", "cafe"]);
  });
});

/** A fake recogniser driven by the test. */
function fakeEngine(opts: { permission?: boolean; startError?: string } = {}) {
  let onResult: ((t: string, f: boolean) => void) | null = null;
  let onError: ((c: string) => void) | null = null;
  const log: string[] = [];
  const engine: SpeechEngine = {
    async requestPermission() {
      log.push("permission");
      return opts.permission ?? true;
    },
    async start({ choices }) {
      log.push(`start:${choices.join("|")}`);
      if (opts.startError) throw Object.assign(new Error("nope"), { code: opts.startError });
    },
    async stop() {
      log.push("stop");
    },
    subscribe(r, e) {
      onResult = r;
      onError = e;
      return () => {
        onResult = null;
        onError = null;
      };
    },
  };
  return {
    engine,
    log,
    say: (t: string, final = false) => onResult?.(t, final),
    error: (c: string) => onError?.(c),
    get subscribed() {
      return onResult != null;
    },
  };
}

function fakeTimers() {
  const pending = new Map<number, () => void>();
  let next = 1;
  return {
    setTimeout: (fn: () => void) => {
      pending.set(next, fn);
      return next++;
    },
    clearTimeout: (h: unknown) => void pending.delete(h as number),
    fire() {
      const fns = [...pending.values()];
      pending.clear();
      fns.forEach((f) => f());
    },
    get count() {
      return pending.size;
    },
  };
}

describe("VoiceAnswer session", () => {
  it("acts on a confident partial result at once and closes the microphone", async () => {
    const e = fakeEngine();
    const t = fakeTimers();
    const v = new VoiceAnswer({ engine: e.engine, callActive: () => false, ...t });
    const picks: number[] = [];
    await v.listen(CHOICES, (i) => picks.push(i));
    assert.equal(v.state.kind, "listening");
    assert.ok(e.log.includes("start:Big Ben|Tower Bridge|The Shard|Buckingham Palace"));
    e.say("tower");
    assert.equal(v.state.kind, "listening");
    assert.equal(voicePrompt(v.state, v.heard), "“tower”");
    e.say("tower bridge");
    assert.deepEqual(picks, [1]);
    assert.deepEqual(v.state, { kind: "matched", index: 1 });
    assert.equal(e.log.at(-1), "stop");
    assert.equal(t.count, 0);
    assert.equal(e.subscribed, false);
  });
  it("settles leniently on the final result, else says it didn't catch that", async () => {
    const e = fakeEngine();
    const v = new VoiceAnswer({ engine: e.engine, callActive: () => false, ...fakeTimers() });
    const picks: number[] = [];
    await v.listen(CHOICES, (i) => picks.push(i));
    e.say("palace", true);
    assert.deepEqual(picks, [3]);

    await v.listen(CHOICES, (i) => picks.push(i));
    e.say("something else entirely", true);
    assert.equal(v.state.kind, "unsure");
    assert.match(voicePrompt(v.state, v.heard), /Didn't catch that/);
    assert.deepEqual(picks, [3]);
  });
  it("closes a silent microphone after the timeout", async () => {
    const e = fakeEngine();
    const t = fakeTimers();
    const v = new VoiceAnswer({ engine: e.engine, callActive: () => false, ...t });
    await v.listen(CHOICES, () => assert.fail("nothing was said"));
    assert.equal(t.count, 1);
    t.fire();
    assert.equal(v.state.kind, "idle");
    assert.equal(e.log.at(-1), "stop");
  });
  it("a second tap stops listening", async () => {
    const e = fakeEngine();
    const v = new VoiceAnswer({ engine: e.engine, callActive: () => false, ...fakeTimers() });
    await v.listen(CHOICES, () => {});
    await v.listen(CHOICES, () => {});
    assert.equal(v.state.kind, "idle");
    assert.equal(e.log.filter((l) => l.startsWith("start")).length, 1);
  });
  it("falls back to typing when the microphone is refused, busy with a call, or the recogniser is missing", async () => {
    const refused = new VoiceAnswer({ engine: fakeEngine({ permission: false }).engine, callActive: () => false, ...fakeTimers() });
    await refused.listen(CHOICES, () => {});
    assert.deepEqual(refused.state, { kind: "unavailable", why: unavailableReason("permission_denied") });

    const call = fakeEngine();
    const inCall = new VoiceAnswer({ engine: call.engine, callActive: () => true, ...fakeTimers() });
    await inCall.listen(CHOICES, () => {});
    assert.equal(inCall.state.kind, "unavailable");
    assert.match(voicePrompt(inCall.state, ""), /call is using the microphone/);
    assert.ok(!call.log.some((l) => l.startsWith("start")));

    const none = new VoiceAnswer({ engine: null, callActive: () => false, ...fakeTimers() });
    assert.equal(none.available, false);
    await none.listen(CHOICES, () => {});
    assert.equal(none.state.kind, "unavailable");

    const offline = new VoiceAnswer({ engine: fakeEngine({ startError: "offline_unavailable" }).engine, callActive: () => false, ...fakeTimers() });
    await offline.listen(CHOICES, () => {});
    assert.deepEqual(offline.state, { kind: "unavailable", why: unavailableReason("offline_unavailable") });
  });
  it("treats no-match and timeouts as quiet, other recogniser errors as unavailable", async () => {
    const e = fakeEngine();
    const v = new VoiceAnswer({ engine: e.engine, callActive: () => false, ...fakeTimers() });
    await v.listen(CHOICES, () => {});
    e.error("no_match");
    assert.equal(v.state.kind, "idle");

    await v.listen(CHOICES, () => {});
    e.say("shard");
    e.error("speech_timeout");
    assert.deepEqual(v.state, { kind: "matched", index: 2 });

    await v.listen(CHOICES, () => {});
    e.error("network");
    assert.equal(v.state.kind, "unavailable");
  });
  it("gives up if stopped while permission is asked or the recogniser starts", async () => {
    const e = fakeEngine();
    const t = fakeTimers();
    const v = new VoiceAnswer({ engine: e.engine, callActive: () => false, ...t });
    const a = v.listen(CHOICES, () => assert.fail("no pick"));
    v.stop(); // the card went away while the permission dialog was up
    await a;
    assert.ok(!e.log.some((l) => l.startsWith("start")), "never started");
    assert.equal(v.state.kind, "idle");

    let release: () => void = () => {};
    const slow = fakeEngine();
    slow.engine.start = async () => {
      slow.log.push("start");
      await new Promise<void>((r) => (release = r));
    };
    const w = new VoiceAnswer({ engine: slow.engine, callActive: () => false, ...t });
    const b = w.listen(CHOICES, () => {});
    await new Promise((r) => setImmediate(r));
    w.stop();
    release();
    await b;
    assert.equal(slow.log.at(-1), "stop", "closed again after the late start");
    assert.equal(t.count, 0, "no orphaned timer");
  });
  it("ignores a double tap while permission is being asked", async () => {
    const e = fakeEngine();
    const v = new VoiceAnswer({ engine: e.engine, callActive: () => false, ...fakeTimers() });
    const a = v.listen(CHOICES, () => {});
    const b = v.listen(CHOICES, () => {});
    await Promise.all([a, b]);
    assert.equal(e.log.filter((l) => l === "permission").length, 1);
  });
});
