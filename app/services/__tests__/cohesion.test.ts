// Task 059: the pure parts of the cohesion work (versions, the send queue,
// capabilities parsing, the palettes and the faction mapping).
import assert from "node:assert/strict";
import { test } from "node:test";

import { compareVersions, updateVerdict } from "../versions.ts";
import { createQueue } from "../offlineQueue.ts";

test("versions compare by number, part by part", () => {
  assert.equal(compareVersions("1.2.10", "1.2.9"), 1);
  assert.equal(compareVersions("1.0", "1.0.0"), 0);
  assert.equal(compareVersions("0.9.9", "1.0.0"), -1);
});

test("force update fails open", () => {
  assert.equal(updateVerdict("1.0.0", null), "ok");
  assert.equal(updateVerdict("1.0.0", "nonsense"), "ok");
  assert.equal(updateVerdict("1.0.0", { minVersion: "abc" }), "ok");
  assert.equal(updateVerdict("1.0.0", { minVersion: "1.0.0" }), "ok");
  assert.equal(updateVerdict("1.0.0", { minVersion: "1.1.0" }), "force");
  assert.equal(updateVerdict("1.0.0", { latestVersion: "1.0.1" }), "suggest");
  assert.equal(updateVerdict("1.2.0", { minVersion: "1.1", latestVersion: "1.2.0" }), "ok");
});

test("the send queue keeps order, waits while offline, drops real failures", async () => {
  const offline = new Error("offline");
  let online = false;
  const sent: string[] = [];
  const gaveUp: string[] = [];
  const q = createQueue((e) => e === offline);
  const job = (id: string, fail = false) => ({
    id,
    scope: "c1",
    run: async () => {
      if (!online) throw offline;
      if (fail) throw new Error("rejected");
      sent.push(id);
    },
    onGiveUp: () => gaveUp.push(id),
  });
  q.enqueue(job("a"));
  q.enqueue(job("b", true));
  q.enqueue(job("c"));
  await q.flush();
  assert.deepEqual(sent, []);
  assert.equal(q.size(), 3);
  online = true;
  await q.flush();
  assert.deepEqual(sent, ["a", "c"]);
  assert.deepEqual(gaveUp, ["b"]);
  assert.equal(q.size(), 0);
});
