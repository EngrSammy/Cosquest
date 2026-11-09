// Progression (the Build Brief's ranks, tests and weapon ladder) against a fake
// progression.py + trivia_banks.py: the routes and their signing, the "feature
// off" 404, the gate rows, the ladder actions and the test state machine.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GameClient, GameError } from "../client.ts";
import { Identity, signingPayload, utf8ToBytes, verifySignature } from "../identity.ts";
import {
  buyWeapon,
  fetchMe,
  fetchTestsStatus,
  gateRows,
  gatesDone,
  isFeatureOff,
  joinFaction,
  type LadderWeapon,
  ladderAction,
  type ProgGates,
  progressionAllowed,
  progressionOn,
  reasonText,
  refusalText,
  secondsLeft,
  sortedLadder,
  startTest,
  submitTest,
  type TestFlow,
  type TestPaper,
  testReducer,
  tierLabel,
  waitText,
  weaponForTier,
} from "../progression.ts";

const SEED = "33".repeat(32);

type Call = { path: string; method: string; headers: Record<string, string>; body?: string; url: string };

function fakeServer(route: (call: Call, json: Record<string, unknown>) => { status?: number; body: unknown } | undefined) {
  const calls: Call[] = [];
  const fetch = async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    const call = { url, path: new URL(url).pathname, method: init.method, headers: init.headers, body: init.body };
    calls.push(call);
    const json = init.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    const answer = route(call, json) ?? { status: 404, body: { detail: "Not Found" } };
    const status = answer.status ?? 200;
    const text = JSON.stringify(answer.body);
    return { ok: status >= 200 && status < 300, status, text: async () => text };
  };
  return { fetch, calls };
}

function signedOk(call: Call, id: Identity): boolean {
  const nonce = Number(call.headers["X-Nonce"]);
  return verifySignature(id.publicKeyHex, signingPayload(call.method, call.path, utf8ToBytes(call.body ?? ""), nonce), call.headers["X-Signature"]);
}

const gates = (over: Partial<ProgGates> = {}): ProgGates => ({
  rank: 2,
  name: "Disciple",
  xp: { ok: false, need: 500, have: 120, short: 380 },
  weapon: { ok: false, tier: 1, available: false },
  test: { ok: false, pass_mark_pct: 70, kind: "rank" },
  ...over,
});

const weapon = (over: Partial<LadderWeapon> = {}): LadderWeapon => ({
  id: "asc-t1",
  faction: "ascendants",
  tier: 1,
  tier_label: "Standard",
  name: "Void Kunai",
  cc_price: 200,
  state: "available",
  unlocks_at_rank: 2,
  ...over,
});

const paper = (n = 3): TestPaper => ({
  test_id: "t1",
  faction: "ascendants",
  test: "entry",
  rank: null,
  pass_mark: 60,
  expires_at: "2026-11-09T12:05:00Z",
  questions: Array.from({ length: n }, (_, i) => ({ idx: i, q: `Q${i}`, choices: ["a", "b", "c", "d"] })),
  resumed: false,
});

describe("progression: flags", () => {
  it("reads the server's flag from /me and honours the build's kill switch", () => {
    assert.equal(progressionOn({ features: { progression: { on: true, faction: null } } }), true);
    assert.equal(progressionOn({ features: { progression: { on: false } } }), false);
    assert.equal(progressionOn({ features: {} }), false);
    assert.equal(progressionOn(null), false);
    assert.equal(progressionAllowed(undefined), true);
    assert.equal(progressionAllowed("1"), true);
    assert.equal(progressionAllowed("0"), false);
  });
  it("treats the off feature's bare 404 as off, not a refusal with a reason", () => {
    assert.equal(isFeatureOff(new GameError("http", "Not Found", 404)), true);
    assert.equal(isFeatureOff(new GameError("http", "No such weapon.", 404)), false);
    assert.equal(isFeatureOff(new GameError("network", "offline")), false);
  });
});

describe("progression: gates and ladder", () => {
  it("shows the three gates in the brief's order with an XP bar", () => {
    const rows = gateRows(gates(), "Void Kunai");
    assert.deepEqual(rows.map((r) => r.id), ["xp", "test", "weapon"]);
    assert.equal(rows[0].detail, "120 of 500 XP · 380 to go");
    assert.equal(rows[0].progress, 0.24);
    assert.equal(rows[1].detail, "Pass mark 70%");
    assert.equal(rows[2].detail, "Void Kunai unlocks at 500 XP");
    assert.equal(gatesDone(gates()), 0);
  });
  it("says a weapon is on sale once the XP is there, and counts gates done", () => {
    const g = gates({ xp: { ok: true, need: 500, have: 640, short: 0 }, weapon: { ok: false, tier: 1, available: true }, test: { ok: true, pass_mark_pct: 70 } });
    const rows = gateRows(g, "Void Kunai");
    assert.equal(rows[0].detail, "500 XP reached");
    assert.equal(rows[0].progress, 1);
    assert.equal(rows[1].detail, "Passed");
    assert.equal(rows[2].detail, "Void Kunai is on sale now");
    assert.equal(gatesDone(g), 2);
  });
  it("offers buy only for an available weapon, by the purchase mode", () => {
    assert.deepEqual(ladderAction(weapon(), "stub"), { kind: "buy", label: "Buy · 200 CC", price: 200 });
    assert.deepEqual(ladderAction(weapon({ cc_price: null }), "stub"), { kind: "buy", label: "Get it", price: null });
    assert.equal(ladderAction(weapon({ cc_price: null }), "coins").kind, "price_unset");
    assert.equal(ladderAction(weapon(), "disabled").label, "Unlocked · shop opens soon");
    assert.equal(ladderAction(weapon({ state: "owned", starter: true }), "coins").label, "Starter · owned");
    assert.equal(ladderAction(weapon({ state: "locked", xp_needed: 1380 }), "coins").label, "1,380 XP to unlock");
  });
  it("sorts the ladder and labels tiers", () => {
    const l = sortedLadder([weapon({ tier: 3, id: "c" }), weapon({ tier: 0, id: "a" }), weapon({ tier: 1, id: "b" })]);
    assert.deepEqual(l.map((w) => w.id), ["a", "b", "c"]);
    assert.equal(tierLabel({ tier: 3, tier_label: "Rare" }), "T3 Rare");
    assert.equal(tierLabel({ tier: 9 }), "T9");
    assert.equal(weaponForTier(l, 1)?.id, "b");
    assert.equal(weaponForTier(l, 7), null);
  });
});

describe("progression: words", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  it("puts the server's reasons in plain words", () => {
    assert.equal(reasonText("already_passed"), "You've already passed this test.");
    assert.equal(reasonText("cooldown", "2026-11-09T15:20:00Z", now), "You can try again in 3 h 20 min.");
    assert.equal(reasonText("daily_limit", "2026-11-09T12:12:00Z", now), "That's today's tries used. Back in 12 min.");
    assert.equal(reasonText("Something the server said."), "Something the server said.");
    assert.equal(waitText("2026-11-09T11:00:00Z", now), "");
    assert.equal(refusalText(new GameError("http", "bank_not_ready", 503)), "This faction's questions aren't ready yet.");
    assert.equal(refusalText(new Error("x")), "Something went wrong. Try again.");
  });
  it("counts the paper's clock down", () => {
    assert.equal(secondsLeft(paper(), now), 300);
    assert.equal(secondsLeft(paper(), new Date("2026-11-09T13:00:00Z")), 0);
  });
});

describe("progression: the test flow", () => {
  it("walks a paper, recording answers and skips, then submits", () => {
    let s: TestFlow = { step: "idle" };
    s = testReducer(s, { type: "start" });
    assert.equal(s.step, "loading");
    s = testReducer(s, { type: "paper", paper: paper(3) });
    assert.equal(s.step, "question");
    s = testReducer(s, { type: "answer", choice: 2 });
    s = testReducer(s, { type: "skip" });
    assert.equal(s.step === "question" && s.index, 2);
    s = testReducer(s, { type: "answer", choice: 0 });
    assert.equal(s.step, "submitting");
    assert.deepEqual(s.step === "submitting" && s.answers, [2, -1, 0]);
    s = testReducer(s, { type: "result", result: { passed: true, score: 66.67, correct: 2, total: 3, pass_mark: 60, results: [true, false, true], xp: { total: 20 } } });
    assert.equal(s.step, "result");
  });
  it("ignores a result that does not belong to a submit, and shows refusals", () => {
    const idle: TestFlow = { step: "idle" };
    assert.equal(testReducer(idle, { type: "answer", choice: 1 }), idle);
    assert.equal(testReducer(idle, { type: "result", result: {} as never }), idle);
    assert.deepEqual(testReducer({ step: "loading" }, { type: "refused", message: "No." }), { step: "refused", message: "No." });
  });
});

describe("progression: the routes", () => {
  it("joins signed, reads /me unsigned, buys signed", async () => {
    const id = new Identity(SEED, "device");
    const srv = fakeServer((c, j) => {
      if (c.path === "/v1/progression/join") return { body: { status: "pending_entry_test", faction: j.faction, membership_id: 4 } };
      if (c.path === "/v1/progression/me") return { body: { device_key: id.publicKeyHex, faction: null, pending: null } };
      if (c.path === "/v1/progression/weapons/buy") return { body: { weapon: j.weapon_id, owned: true, repeat: false, promoted: [] } };
      return undefined;
    });
    const client = new GameClient({ baseUrl: "https://g", identity: () => id, fetch: srv.fetch });
    const joined = await joinFaction(client, "ascendants");
    assert.equal(joined.status, "pending_entry_test");
    const me = await fetchMe(client);
    assert.equal(me.faction, null);
    const bought = await buyWeapon(client, "asc-t1");
    assert.equal(bought.owned, true);
    const [join, read, buy] = srv.calls;
    assert.ok(signedOk(join, id));
    assert.equal(JSON.parse(join.body!).confirm_switch, false);
    assert.equal(read.headers["X-Signature"], undefined);
    assert.match(read.url, /device_key=/);
    assert.ok(signedOk(buy, id));
  });
  it("starts and submits a test, sending rank only for a rank test", async () => {
    const id = new Identity(SEED, "device");
    const srv = fakeServer((c, j) => {
      if (c.path === "/v1/trivia/tests/start") return { body: { ...paper(2), test: j.test, rank: j.rank ?? null } };
      if (c.path === "/v1/trivia/tests/submit") return { body: { passed: false, score: 50, correct: 1, total: 2, pass_mark: 70, results: [true, false], xp: { total: 10 }, retry_at: "2026-11-10T12:00:00Z" } };
      if (c.path === "/v1/trivia/tests/status") return { body: { faction: "ascendants", entry: {}, ranks: [], open: [] } };
      return undefined;
    });
    const client = new GameClient({ baseUrl: "https://g", identity: () => id, fetch: srv.fetch });
    await startTest(client, "ascendants", "entry");
    await startTest(client, "ascendants", "rank", 2);
    const r = await submitTest(client, "t1", [0, -1]);
    assert.equal(r.passed, false);
    await fetchTestsStatus(client, "ascendants");
    const [entry, rank, submit] = srv.calls;
    assert.equal("rank" in JSON.parse(entry.body!), false);
    assert.equal(JSON.parse(rank.body!).rank, 2);
    assert.deepEqual(JSON.parse(submit.body!).answers, [0, -1]);
    assert.ok(signedOk(submit, id));
  });
  it("passes a refusal through in the server's words", async () => {
    const id = new Identity(SEED, "device");
    const srv = fakeServer(() => ({ status: 429, body: { detail: { reason: "cooldown", retry_at: "2026-11-10T00:00:00Z" } } }));
    const client = new GameClient({ baseUrl: "https://g", identity: () => id, fetch: srv.fetch });
    await assert.rejects(startTest(client, "ascendants", "rank", 2), (e: unknown) => e instanceof GameError && e.message === "cooldown");
  });
});

describe("progression: seasons and event friends", () => {
  it("words a season's clock", async () => {
    const { seasonTimeText } = await import("../progression.ts");
    const s = { id: "s1", name: "Season 1", starts_at: "", ends_at: "", phase: "live", seconds_left: 3 * 86400 + 5 };
    assert.equal(seasonTimeText(s), "3 days left");
    assert.equal(seasonTimeText({ ...s, seconds_left: 7200 }), "2 h left");
    assert.equal(seasonTimeText({ ...s, phase: "closed" }), "Ended");
    assert.equal(seasonTimeText(null), "");
  });
  it("groups event friends by event, newest first, and reads them signed", async () => {
    const { connectionsByEvent, fetchEventConnections } = await import("../progression.ts");
    const c = (game_id: string, made_at: string, handle: string) => ({ friend_key: handle, handle, game_id, event_title: `E-${game_id}`, event_starts_at: null, made_at, method: "code" });
    const groups = connectionsByEvent([c("a", "2026-11-01T10:00:00Z", "Ada"), c("b", "2026-11-08T10:00:00Z", "Bo"), c("a", "2026-11-01T11:00:00Z", "Cy")]);
    assert.deepEqual(groups.map((g) => [g.title, g.friends.length]), [["E-b", 1], ["E-a", 2]]);
    const id = new Identity(SEED, "device");
    const srv = fakeServer((call) => (call.path === "/v1/events/connections" ? { body: { connections: [c("a", "2026-11-01T10:00:00Z", "Ada")] } } : undefined));
    const client = new GameClient({ baseUrl: "https://g", identity: () => id, fetch: srv.fetch });
    const got = await fetchEventConnections(client);
    assert.equal(got[0].handle, "Ada");
    assert.ok(srv.calls[0].headers["X-Signature"]);
  });
});
