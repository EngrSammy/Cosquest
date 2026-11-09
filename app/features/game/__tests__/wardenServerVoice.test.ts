import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GameClient, GameError } from "../client.ts";
import { Identity } from "../identity.ts";
import {
  ERROR_BACKOFF_MS,
  MAX_VOICE_CHARS,
  NO_VOICE_BACKOFF_MS,
  normaliseLine,
  ServerVoice,
  voiceable,
} from "../wardenServerVoice.ts";

const URL_A = "https://cq.example/v1/warden/voice/aa.mp3";

function asker(answer: (text: string) => Promise<{ url: string } | null>) {
  const calls: string[] = [];
  return {
    calls,
    ask: (text: string) => {
      calls.push(text);
      return answer(text);
    },
  };
}

describe("wardenServerVoice", () => {
  it("normalises like the server and refuses lines it would refuse", () => {
    assert.equal(normaliseLine("  Don’t  break\nit now. "), "Don't break it now.");
    assert.equal(voiceable("x".repeat(MAX_VOICE_CHARS)), true);
    assert.equal(voiceable("x".repeat(MAX_VOICE_CHARS + 1)), false);
    assert.equal(voiceable("   "), false);
  });

  it("asks once per line and remembers the URL", async () => {
    const a = asker(async () => ({ url: URL_A }));
    const v = new ServerVoice({ ask: a.ask });
    assert.equal(await v.urlFor("Right answer, Ada.", "correct", "neutral"), URL_A);
    assert.equal(await v.urlFor(" Right  answer, Ada. ", "correct", "neutral"), URL_A);
    assert.deepEqual(a.calls, ["Right answer, Ada."]);
    assert.equal(v.known("Right answer, Ada."), URL_A);
  });

  it("shares one request between a prefetch and the line", async () => {
    let release: (v: { url: string }) => void = () => {};
    const a = asker(() => new Promise((r) => (release = r)));
    const v = new ServerVoice({ ask: a.ask });
    v.prefetch("Welcome to Tower Bridge.", "arrive", "neutral");
    const said = v.urlFor("Welcome to Tower Bridge.", "arrive", "neutral");
    release({ url: URL_A });
    assert.equal(await said, URL_A);
    assert.equal(a.calls.length, 1);
  });

  it("gives up on a slow line without blocking, and keeps the late answer for next time", async () => {
    let release: (v: { url: string }) => void = () => {};
    const a = asker(() => new Promise((r) => (release = r)));
    const v = new ServerVoice({ ask: a.ask, waitMs: 20 });
    const t0 = Date.now();
    assert.equal(await v.urlFor("Slow line.", "wrong", "neutral"), null);
    assert.ok(Date.now() - t0 < 500);
    release({ url: URL_A });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(await v.urlFor("Slow line.", "wrong", "neutral"), URL_A);
    assert.equal(a.calls.length, 1);
  });

  it("goes quiet after 'no voice' and after an error, then tries again", async () => {
    let now = 1_000_000;
    let mode: "none" | "error" | "ok" = "none";
    const a = asker(async () => {
      if (mode === "error") throw new GameError("http", "down", 503);
      return mode === "none" ? null : { url: URL_A };
    });
    const v = new ServerVoice({ ask: a.ask, now: () => now });
    assert.equal(await v.urlFor("One.", "correct", "neutral"), null);
    assert.equal(v.available, false);
    assert.equal(await v.urlFor("Two.", "correct", "neutral"), null);
    assert.equal(a.calls.length, 1, "no request while quiet");
    now += NO_VOICE_BACKOFF_MS;
    mode = "error";
    assert.equal(await v.urlFor("Two.", "correct", "neutral"), null);
    assert.equal(a.calls.length, 2);
    now += ERROR_BACKOFF_MS - 1;
    assert.equal(v.available, false);
    now += 1;
    mode = "ok";
    assert.equal(await v.urlFor("Two.", "correct", "neutral"), URL_A);
  });

  it("never asks for a line too long for the server", async () => {
    const a = asker(async () => ({ url: URL_A }));
    const v = new ServerVoice({ ask: a.ask });
    assert.equal(await v.urlFor("x".repeat(MAX_VOICE_CHARS + 5), "recap", "neutral"), null);
    assert.equal(a.calls.length, 0);
    assert.equal(v.available, true);
  });

  it("forgets the oldest line past its memory", async () => {
    const a = asker(async (t) => ({ url: `https://cq.example/${t}` }));
    const v = new ServerVoice({ ask: a.ask, memory: 2 });
    for (const t of ["a", "b", "c"]) await v.urlFor(t, "m", "s");
    assert.equal(v.known("a"), null);
    assert.equal(v.known("c"), "https://cq.example/c");
  });
});

describe("GameClient.wardenVoice", () => {
  const seed = "11".repeat(32);
  type Init = { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal };
  function client(status: number, body: string, seen: { url?: string; init?: Init } = {}) {
    return new GameClient({
      baseUrl: "https://cq.example/",
      identity: () => new Identity(seed, "device"),
      fetch: async (url, init) => {
        seen.url = url;
        seen.init = init;
        return { ok: status >= 200 && status < 300, status, text: async () => body };
      },
    });
  }

  it("posts a signed line and returns the audio URL", async () => {
    const seen: { url?: string; init?: Init } = {};
    const got = await client(200, JSON.stringify({ key: "k1", url: URL_A, cached: true }), seen).wardenVoice("Hi, Ada.", "arrive", "neutral");
    assert.deepEqual(got, { url: URL_A, key: "k1", cached: true });
    assert.equal(seen.url, "https://cq.example/v1/warden/voice");
    assert.equal(seen.init?.method, "POST");
    assert.ok(seen.init?.headers["X-Signature"]);
    assert.equal(seen.init?.headers.Accept, "application/json");
    const sent = JSON.parse(seen.init?.body ?? "{}");
    assert.equal(sent.text, "Hi, Ada.");
    assert.equal(sent.moment, "arrive");
    assert.equal(sent.device_key, new Identity(seed, "device").publicKeyHex);
  });

  it("reads 204 as no voice and errors as throws", async () => {
    assert.equal(await client(204, "").wardenVoice("Hi.", "arrive", "neutral"), null);
    await assert.rejects(client(503, '{"detail":{"reason":"voice_unavailable"}}').wardenVoice("Hi.", "arrive", "neutral"));
    await assert.rejects(client(200, '{"url":"javascript:alert(1)","key":"k"}').wardenVoice("Hi.", "arrive", "neutral"));
  });
});
