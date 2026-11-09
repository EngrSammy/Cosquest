// Relics against a fake server: the wire shapes as roam_relics.py writes them,
// the signed equip/level/starter calls, refusals in the server's words, the
// one model (starter claim, a refresh that is not dropped, a change of
// player), and the reward's drop extra.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GameClient } from "../client.ts";
import { Identity, signingPayload, utf8ToBytes, verifySignature } from "../identity.ts";
import {
  byRarityThenName,
  canLevel,
  catalogueOf,
  claimStarterRelic,
  createRelicsStore,
  equippedFor,
  equipRelic,
  factionsInOrder,
  fetchRelics,
  hasRelicDrop,
  levelCost,
  levelRelic,
  parseRelic,
  parseRelicsPayload,
  powerNow,
  relicDrop,
  relicFromReply,
  totalShards,
} from "../relics.ts";
import type { RoamMe } from "../wire.ts";

const SEED = "22".repeat(32);

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

function fakeFetch(routes: (call: Call) => { status?: number; body: unknown } | undefined) {
  const calls: Call[] = [];
  const fetch = async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    const call = { url, method: init.method, headers: init.headers, body: init.body };
    calls.push(call);
    const answer = routes(call) ?? { status: 404, body: { detail: "Not Found" } };
    const text = typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body);
    const status = answer.status ?? 200;
    return { ok: status >= 200 && status < 300, status, text: async () => text };
  };
  return { fetch, calls };
}

// roam_relics.public() for a level-2 rare with 8 shards (the iOS preview's own JSON).
const GAUNTLET = {
  id: "gaming-frame-perfect",
  name: "Frame-Perfect Gauntlet",
  faction: "gaming",
  rarity: "rare",
  kind: "gauntlet",
  power: 14,
  ability: "surge",
  lore: "Inputs before you think them.",
  faction_name: "Gaming",
  ability_text: "Double damage from the 3rd correct answer in a row",
  level: 2,
  shards: 8,
  power_now: 15,
  next_level_cost: 20,
  found_at: "2026-10-01T10:00:00.123456+00:00",
};
const BLADE = { ...GAUNTLET, id: "gaming-pixel-edge", name: "Pixel Edge", rarity: "common", kind: "blade", power: 10, level: 1, shards: 12, power_now: 10, next_level_cost: 10 };

const PAYLOAD = {
  owned: [GAUNTLET, BLADE],
  equipped: "gaming-frame-perfect",
  catalogue_size: 4,
  catalogue: [
    { id: "gaming-pixel-edge", name: "Pixel Edge", faction: "gaming", rarity: "common", kind: "blade" },
    { id: "gaming-frame-perfect", name: "Frame-Perfect Gauntlet", faction: "gaming", rarity: "rare", kind: "gauntlet" },
    { id: "gaming-glitch", name: "Glitch Cleaver", faction: "gaming", rarity: "epic", kind: "axe" },
    { id: "dc-arc", name: "Arc Bow", faction: "dc", rarity: "common", kind: "bow" },
  ],
};

const meWith = (patch: Partial<RoamMe> = {}): RoamMe =>
  ({
    device_key: "k",
    standing: { level: 2 },
    coins: 0,
    faction_points: 0,
    streak: { days: 0, best: 0, played_today: false },
    tutorial_done: true,
    dailies: [],
    day: "d",
    ...patch,
  }) as RoamMe;

describe("relics: wire", () => {
  it("reads roam_relics.public, and fills what an older server leaves out as iOS does", () => {
    const r = parseRelic(GAUNTLET);
    assert.ok(r);
    assert.equal(r.power_now, 15);
    assert.equal(r.next_level_cost, 20);
    const bare = parseRelic({ id: "x", name: "X" });
    assert.ok(bare);
    assert.equal(bare.rarity, "common");
    assert.equal(bare.kind, "blade");
    assert.equal(bare.power, 10);
    assert.equal(bare.level, 1);
    assert.equal(bare.shards, 0);
    assert.equal(levelCost(bare), 10, "level × 10 when the server does not say");
    assert.equal(parseRelic({ name: "no id" }), null);
  });
  it("reads the Relicdex payload, dropping entries it cannot use", () => {
    const p = parseRelicsPayload({ ...PAYLOAD, owned: [...PAYLOAD.owned, { bogus: true }], catalogue: [...PAYLOAD.catalogue, 7] });
    assert.equal(p.owned.length, 2);
    assert.equal(p.catalogue.length, 4);
    assert.equal(p.catalogue_size, 4);
    assert.equal(p.equipped, "gaming-frame-perfect");
    assert.deepEqual(parseRelicsPayload({}), { owned: [], equipped: null, catalogue_size: 0, catalogue: [] });
  });
  it("unwraps equip ({equipped}), level (bare) and starter (bare + granted) replies", () => {
    assert.equal(relicFromReply({ equipped: GAUNTLET })?.id, GAUNTLET.id);
    assert.equal(relicFromReply({ relic: BLADE })?.id, BLADE.id);
    assert.equal(relicFromReply({ ...BLADE, granted: true })?.id, BLADE.id);
    assert.equal(relicFromReply({ equipped: null }), null);
  });
});

describe("relics: look", () => {
  it("levels, power and the level-up gate follow the server's numbers", () => {
    const g = parseRelic(GAUNTLET)!;
    const b = parseRelic(BLADE)!;
    assert.equal(powerNow(g), 15);
    assert.equal(canLevel(g), false, "8 of 20");
    assert.equal(canLevel(b), true, "12 of 10");
    assert.equal(canLevel({ level: 10, shards: 999, next_level_cost: null }), false, "max level");
  });
  it("orders the grid rarest first and your own faction first", () => {
    const p = parseRelicsPayload(PAYLOAD);
    assert.deepEqual(
      catalogueOf(p, "gaming").map((s) => s.rarity),
      ["epic", "rare", "common"],
    );
    assert.deepEqual(factionsInOrder("dc"), ["dc", "anime", "marvel", "movies", "gaming"]);
    assert.deepEqual(factionsInOrder(null), ["anime", "marvel", "dc", "movies", "gaming"]);
    assert.ok(byRarityThenName({ rarity: "legendary", name: "Z" }, { rarity: "common", name: "A" }) < 0);
    assert.equal(totalShards(p), 20);
  });
  it("the equipped relic comes from the Relicdex, else from me", () => {
    const p = parseRelicsPayload(PAYLOAD);
    assert.equal(equippedFor(p, null)?.id, GAUNTLET.id);
    const me = meWith({ features: { relics: { equipped: BLADE, owned_count: 2 } } });
    assert.equal(equippedFor(null, me)?.id, BLADE.id);
    assert.equal(equippedFor(null, null), null);
  });
  it("finds the drop in a verdict's extras (roam_relics.grant)", () => {
    const extra = { kind: "relic", relic: GAUNTLET, new: false, shards: 8, title: "Frame-Perfect Gauntlet: +8 shards", icon: "sparkles" };
    const d = relicDrop(extra);
    assert.ok(d);
    assert.equal(d.isNew, false);
    assert.equal(d.shards, 8);
    assert.equal(relicDrop({ kind: "codex", title: "Card" }), null);
    assert.equal(relicDrop({ kind: "relic", title: "no relic" }), null);
    assert.equal(hasRelicDrop([{ kind: "codex", title: "c" }, extra]), true);
    assert.equal(hasRelicDrop(null), false);
  });
});

describe("relics: routes", () => {
  const id = new Identity(SEED, "device");
  it("GET is unsigned with the device key; equip, level and starter are signed POSTs", async () => {
    const { fetch, calls } = fakeFetch((c) => {
      if (c.url.includes("/v1/roam/relics?")) return { body: PAYLOAD };
      if (c.url.endsWith("/v1/roam/relics/equip")) return { body: { equipped: GAUNTLET } };
      if (c.url.endsWith("/v1/roam/relics/level")) return { body: { ...BLADE, level: 2, shards: 2, power_now: 11, next_level_cost: 20 } };
      if (c.url.endsWith("/v1/roam/relics/starter")) return { body: { ...BLADE, granted: false } };
      return undefined;
    });
    const client = new GameClient({ baseUrl: "https://g.example", identity: () => id, fetch });
    const p = await fetchRelics(client);
    assert.equal(p.owned.length, 2);
    assert.match(calls[0].url, new RegExp(`^https://g\\.example/v1/roam/relics\\?device_key=${id.publicKeyHex}$`));
    assert.equal(calls[0].headers["X-Signature"], undefined);

    assert.equal((await equipRelic(client, GAUNTLET.id))?.id, GAUNTLET.id);
    assert.equal((await levelRelic(client, BLADE.id))?.level, 2);
    assert.equal((await claimStarterRelic(client))?.id, BLADE.id);
    for (const [i, path] of [
      [1, "/v1/roam/relics/equip"],
      [2, "/v1/roam/relics/level"],
      [3, "/v1/roam/relics/starter"],
    ] as const) {
      const c = calls[i];
      assert.equal(c.method, "POST");
      const body = JSON.parse(c.body ?? "{}");
      assert.equal(body.device_key, id.publicKeyHex);
      assert.ok(verifySignature(id.publicKeyHex, signingPayload("POST", path, utf8ToBytes(c.body ?? ""), Number(c.headers["X-Nonce"])), c.headers["X-Signature"]));
    }
    assert.deepEqual(JSON.parse(calls[1].body ?? ""), { device_key: id.publicKeyHex, relic_id: GAUNTLET.id });
    assert.deepEqual(JSON.parse(calls[3].body ?? ""), { device_key: id.publicKeyHex });
  });
  it("a level refusal is the server's sentence, and is not retried", async () => {
    let n = 0;
    const { fetch } = fakeFetch(() => (n++, { status: 409, body: { detail: { reason: "Needs 20 shards", cost: 20, shards: 8 } } }));
    const client = new GameClient({ baseUrl: "https://g", identity: () => id, fetch, sleep: async () => {} });
    await assert.rejects(levelRelic(client, GAUNTLET.id), /Needs 20 shards/);
    assert.equal(n, 1);
  });
});

describe("relics: the model", () => {
  const id = new Identity(SEED, "device");

  function server(initial: { owned: unknown[]; equipped: string | null; catalogue_size: number; catalogue: unknown[] }) {
    let payload = structuredClone(initial) as { owned: Record<string, unknown>[]; equipped: string | null; catalogue_size: number; catalogue: unknown[] };
    const log: string[] = [];
    const { fetch, calls } = fakeFetch((c) => {
      const path = c.url.replace(/^https:\/\/g/, "").replace(/\?.*$/, "");
      log.push(`${c.method} ${path}`);
      if (path === "/v1/roam/relics") return { body: payload };
      const body = JSON.parse(c.body ?? "{}");
      if (path === "/v1/roam/relics/equip") {
        const r = payload.owned.find((x) => x.id === body.relic_id);
        if (!r) return { status: 404, body: { detail: { reason: "You don't have that Relic." } } };
        payload = { ...payload, equipped: body.relic_id };
        return { body: { equipped: r } };
      }
      if (path === "/v1/roam/relics/level") {
        const r = payload.owned.find((x) => x.id === body.relic_id)!;
        const cost = (r.level as number) * 10;
        if ((r.shards as number) < cost) return { status: 409, body: { detail: { reason: `Needs ${cost} shards` } } };
        const up = { ...r, level: (r.level as number) + 1, shards: (r.shards as number) - cost };
        payload = { ...payload, owned: payload.owned.map((x) => (x.id === r.id ? up : x)) };
        return { body: up };
      }
      if (path === "/v1/roam/relics/starter") {
        payload = { ...payload, owned: [BLADE], equipped: BLADE.id };
        return { body: { ...BLADE, granted: true } };
      }
      return undefined;
    });
    return { fetch, calls, log };
  }

  it("equips and levels through the server, and shows its refusal in its words", async () => {
    const s = server(PAYLOAD);
    const client = new GameClient({ baseUrl: "https://g", identity: () => id, fetch: s.fetch });
    const store = createRelicsStore({ client, me: () => meWith(), playerKey: () => id.publicKeyHex });
    await store.refresh();
    assert.equal(store.get().payload?.equipped, GAUNTLET.id);

    assert.equal(await store.equip(BLADE.id), true);
    assert.equal(store.get().payload?.equipped, BLADE.id);
    assert.equal(store.get().busy, false);

    const up = await store.levelUp(BLADE.id);
    assert.equal(up?.level, 2);
    assert.equal(store.get().payload?.owned.find((r) => r.id === BLADE.id)?.shards, 2);
    assert.equal(store.get().levelled?.id, BLADE.id);

    assert.equal(await store.levelUp(GAUNTLET.id), null);
    assert.equal(store.get().problem, "Needs 20 shards");
    store.clearProblem();
    assert.equal(store.get().problem, null);
  });

  it("claims the starter once when a player who finished the tutorial owns none", async () => {
    const s = server({ ...PAYLOAD, owned: [], equipped: null });
    const client = new GameClient({ baseUrl: "https://g", identity: () => id, fetch: s.fetch });
    const store = createRelicsStore({ client, me: () => meWith(), playerKey: () => id.publicKeyHex });
    await store.refresh();
    assert.equal(s.log.filter((l) => l.endsWith("/starter")).length, 1);
    assert.equal(store.get().payload?.owned[0]?.id, BLADE.id);
    await store.refresh();
    assert.equal(s.log.filter((l) => l.endsWith("/starter")).length, 1, "asked once");
  });

  it("does not claim the starter before the tutorial is done", async () => {
    const s = server({ ...PAYLOAD, owned: [], equipped: null });
    const client = new GameClient({ baseUrl: "https://g", identity: () => id, fetch: s.fetch });
    const store = createRelicsStore({ client, me: () => meWith({ tutorial_done: false }), playerKey: () => id.publicKeyHex });
    await store.refresh();
    assert.equal(s.log.filter((l) => l.endsWith("/starter")).length, 0);
  });

  it("a refresh asked during a fetch runs once more after it", async () => {
    const s = server(PAYLOAD);
    const client = new GameClient({ baseUrl: "https://g", identity: () => id, fetch: s.fetch });
    const store = createRelicsStore({ client, me: () => meWith(), playerKey: () => id.publicKeyHex });
    const a = store.refresh();
    const b = store.refresh();
    const c = store.refresh();
    await Promise.all([a, b, c]);
    assert.equal(s.log.filter((l) => l === "GET /v1/roam/relics").length, 2);
    assert.equal(store.get().loading, false);
  });

  it("a failed fetch says so, and a different player starts empty", async () => {
    let key: string | null = id.publicKeyHex;
    let down = false;
    const s = server(PAYLOAD);
    const client = new GameClient({
      baseUrl: "https://g",
      identity: () => id,
      fetch: async (url, init) => (down ? { ok: false, status: 503, text: async () => "{}" } : s.fetch(url, init)),
      sleep: async () => {},
    });
    const store = createRelicsStore({ client, me: () => meWith(), playerKey: () => key });
    await store.refresh();
    assert.ok(store.get().payload);
    down = true;
    await store.refresh();
    assert.equal(store.get().failed, true);
    assert.ok(store.get().payload, "keeps what it had");

    key = "someone-else";
    let told = 0;
    const off = store.subscribe(() => told++);
    store.syncPlayer();
    off();
    assert.equal(told, 1);
    assert.equal(store.get().payload, null);
    assert.equal(store.get().forKey, "someone-else");

    key = null;
    await store.refresh();
    assert.equal(store.get().payload, null, "nobody signed in: nothing fetched");
  });
});
