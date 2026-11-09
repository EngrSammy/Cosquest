import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canRetrySilently, fetchJson, isNetworkFailure, OFFLINE_MESSAGE, REQUEST_TIMEOUT_MS, RequestTimeoutError, UPLOAD_TIMEOUT_MS } from "../networkError.ts";

describe("network errors", () => {
  it("recognises what fetch throws on Android and iOS when nothing answers", () => {
    for (const message of [
      "fetch failed: java.net.ConnectException: Failed to connect to localhost/127.0.0.1:4120",
      "java.io.IOException: unexpected end of stream",
      "Network request failed",
      "Unable to resolve host \"cosquest-api-test.example\"",
    ]) {
      assert.equal(isNetworkFailure(new Error(message)), true, message);
    }
    assert.equal(isNetworkFailure(new TypeError("Failed to fetch")), true);
  });
  it("leaves the server's own messages and cancelled requests alone", () => {
    assert.equal(isNetworkFailure(new Error("Invalid username or password")), false);
    const aborted = new Error("Aborted");
    aborted.name = "AbortError";
    assert.equal(isNetworkFailure(aborted), false);
    assert.equal(isNetworkFailure("fetch failed"), false);
  });
  it("retries only reads by itself", () => {
    assert.equal(canRetrySilently("GET"), true);
    assert.equal(canRetrySilently("POST"), false);
  });
  it("says it in plain words", () => {
    assert.doesNotMatch(OFFLINE_MESSAGE, /java|fetch|exception/i);
  });
});

describe("request timeouts (audit B7)", () => {
  const answer = (body: unknown, ms = 0) =>
    ((_url: string, init: { signal: AbortSignal }) =>
      new Promise<Response>((resolve, reject) => {
        const t = setTimeout(() => resolve(new Response(JSON.stringify(body), { status: 200 })), ms);
        init.signal.addEventListener("abort", () => {
          clearTimeout(t);
          const e = new Error("Aborted");
          e.name = "AbortError";
          reject(e);
        });
      })) as any;

  it("15 s for a call, 60 s for an upload", () => {
    assert.equal(REQUEST_TIMEOUT_MS, 15_000);
    assert.equal(UPLOAD_TIMEOUT_MS, 60_000);
  });
  it("returns the answer and its JSON when it comes in time", async () => {
    const { response, data } = await fetchJson("x", {}, 200, answer({ ok: 1 }, 10));
    assert.equal(response.status, 200);
    assert.deepEqual(data, { ok: 1 });
  });
  it("gives up after the timeout, as a network failure (so the plain message shows and a GET is retried)", async () => {
    const started = Date.now();
    await assert.rejects(fetchJson("x", {}, 50, answer({}, 5000)), (e: unknown) => {
      assert.ok(e instanceof RequestTimeoutError);
      assert.equal(isNetworkFailure(e), true);
      return true;
    });
    assert.ok(Date.now() - started < 1000);
  });
  it("a body that isn't JSON is null, not an error", async () => {
    const fn = (async () => new Response("<html>", { status: 502 })) as any;
    const { response, data } = await fetchJson("x", {}, 200, fn);
    assert.equal(response.status, 502);
    assert.equal(data, null);
  });
});
