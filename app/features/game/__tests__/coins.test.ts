// CosCoins against a fake server (CoinsFeature.swift): the wire shapes, the
// region gate, checkout, following an order, and the "CosCoins added" moment.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GameClient } from "../client.ts";
import {
  coinRegion,
  countAt,
  createCoinsStore,
  deltaText,
  historyIcon,
  historyTitle,
  isHttpsUrl,
  packLabel,
  packSub,
  packTag,
  packTagText,
  parseCoinsConfig,
  parseCoinsReturn,
  parseHistory,
  priceText,
  regionFromLocale,
  relativeWhen,
  webAllowed,
} from "../coins.ts";
import { Identity } from "../identity.ts";

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

function fakeServer(routes: (call: Call) => { status?: number; body: unknown } | undefined) {
  const calls: Call[] = [];
  const fetch = async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    const call = { url, method: init.method, headers: init.headers, body: init.body };
    calls.push(call);
    const answer = routes(call) ?? { status: 404, body: { detail: "Not Found" } };
    const text = JSON.stringify(answer.body);
    const status = answer.status ?? 200;
    return { ok: status >= 200 && status < 300, status, text: async () => text };
  };
  const client = new GameClient({ baseUrl: "https://x.test", identity: () => new Identity("44".repeat(32), "device"), fetch, sleep: async () => {} });
  return { client, calls };
}

const PACKS = [
  { id: "p1", coins: 500, bonus: 0, price: "$4.99" },
  { id: "p2", coins: 1200, bonus: 200, price_cents: 999, currency: "USD", best_value: true },
];

describe("coins: wire", () => {
  it("reads the config, dropping packs it cannot use", () => {
    const c = parseCoinsConfig({ web_allowed: true, regions: ["US"], packs: [...PACKS, { id: "bad" }, null] });
    assert.equal(c.packs?.length, 2);
    assert.equal(c.web_allowed, true);
    assert.equal(parseCoinsConfig(null).packs, null);
  });
  it("reads history keyed either way, with a number or split balance", () => {
    const a = parseHistory({ balance: 40, items: [{ id: "x", delta: 40, kind: "purchase", at: "2026-10-01T00:00:00Z", receipt_url: "https://r" }] });
    assert.equal(a.balance, 40);
    assert.equal(a.entries[0].id, "x");
    const b = parseHistory({ balance: { coins: 7 }, entries: [{ delta: -5, kind: "spend", at: "t", ref: "g1" }, { delta: 1, kind: "grant", at: "u" }, { kind: "bad" }] });
    assert.equal(b.balance, 7);
    assert.deepEqual(b.entries.map((e) => e.id), ["spend:g1", "grant:u:1"]);
  });
  it("words packs: the server's price first, then its cents, bonus called out", () => {
    const [p1, p2] = parseCoinsConfig({ packs: PACKS }).packs!;
    assert.equal(priceText(p1), "$4.99");
    assert.equal(priceText(p2), "$9.99");
    assert.equal(packSub(p1), "CosCoins");
    assert.equal(packSub(p2), "1,000 + 200 bonus");
    assert.equal(packLabel(p2), "1200 CosCoins, $9.99");
    assert.equal(packTag(p1), null);
    assert.equal(packTag(p2), "best_value");
    assert.equal(packTagText("best_value"), "BEST VALUE");
    assert.equal(packTagText("most_popular"), "MOST POPULAR");
  });
  it("words history lines", () => {
    assert.equal(historyTitle("clawback"), "Payment reversed");
    assert.equal(historyTitle("weird"), "Weird");
    assert.equal(historyIcon("spend"), "ticket");
    assert.equal(historyIcon("other"), "gift");
    assert.equal(deltaText(1200), "+1,200");
    assert.equal(deltaText(-5), "−5");
    const now = Date.parse("2026-10-19T12:00:00Z");
    assert.equal(relativeWhen("2026-10-19T10:00:00.123456Z", now, "en-US"), "2 hours ago");
    assert.equal(relativeWhen("2026-10-18T12:00:00Z", now, "en-US"), "yesterday");
    assert.equal(relativeWhen("junk", now), "");
  });
  it("counts up in 24 steps", () => {
    assert.equal(countAt(1200, 0), 0);
    assert.equal(countAt(1200, 12), 600);
    assert.equal(countAt(1200, 24), 1200);
    assert.equal(countAt(1200, 99), 1200);
  });
});

describe("coins: the region gate", () => {
  it("reports the US on staging and the phone's region in production", () => {
    assert.equal(coinRegion({ isProduction: false, deviceRegion: "NG" }), "US");
    assert.equal(coinRegion({ isProduction: true, deviceRegion: "ng" }), "NG");
    assert.equal(coinRegion({ isProduction: true, deviceRegion: "NG", override: "gb" }), "GB");
    assert.equal(regionFromLocale("en-US"), "US");
    assert.equal(regionFromLocale("en_GB"), "GB");
    assert.equal(regionFromLocale("fr-CA-u-nu-latn"), "CA");
    assert.equal(regionFromLocale("en"), "");
    assert.equal(regionFromLocale(null), "");
  });
  it("lets the server's say-so win, else its list", () => {
    assert.equal(webAllowed({ web_allowed: false, regions: ["US"] }, "US"), false);
    assert.equal(webAllowed({ web_allowed: true }, "NG"), true);
    assert.equal(webAllowed({ regions: ["US", "CA"] }, "ca"), true);
    assert.equal(webAllowed({ regions: ["US"] }, "NG"), false);
    assert.equal(webAllowed(null, "US"), false);
  });
  it("sends people only to https pages, and reads the way back", () => {
    assert.equal(isHttpsUrl("https://checkout.stripe.com/c/pay/x"), true);
    assert.equal(isHttpsUrl("http://evil.test"), false);
    assert.equal(isHttpsUrl("javascript:alert(1)"), false);
    assert.deepEqual(parseCoinsReturn("cosquest://coins?order=o1&result=success"), { order: "o1", result: "success" });
    assert.deepEqual(parseCoinsReturn("cosquest://coins"), { order: null, result: null });
    assert.equal(parseCoinsReturn("cosquest://friends?code=x"), null);
  });
});

function store(routes: Parameters<typeof fakeServer>[0], over: { isProduction?: boolean; region?: string } = {}) {
  const { client, calls } = fakeServer(routes);
  const celebrated: number[] = [];
  const s = createCoinsStore({
    client,
    isProduction: over.isProduction ?? false,
    deviceRegion: () => over.region ?? "NG",
    onCelebrate: (n) => celebrated.push(n),
    sleep: async () => {},
    meCoins: () => 12,
  });
  return { s, calls, celebrated };
}

describe("coins: the model", () => {
  it("asks for the config with the region and the ledger signed, and shows packs only where allowed", async () => {
    const { s, calls } = store((c) => {
      if (c.url.includes("v1/coins/config")) return { body: { web_allowed: true, packs: PACKS } };
      if (c.url.includes("v1/coins/history")) return { body: { balance: 30, items: [] } };
    });
    assert.equal(s.displayBalance(), 12, "the player's standing until the ledger says");
    await s.refresh();
    assert.match(calls.find((c) => c.url.includes("config"))!.url, /region=US/, "staging reports the US");
    assert.ok(calls.find((c) => c.url.includes("history"))!.headers["X-Signature"], "history is signed");
    assert.equal(s.webAllowed(), true);
    assert.equal(s.packs().length, 2);
    assert.equal(s.displayBalance(), 30);

    const closed = store(
      (c) => (c.url.includes("config") ? { body: { web_allowed: false, packs: PACKS } } : { body: { balance: 1, items: [] } }),
      { isProduction: true, region: "NG" },
    );
    await closed.s.refresh();
    assert.match(closed.calls[0].url, /region=NG/);
    assert.equal(closed.s.webAllowed(), false);
    assert.deepEqual(closed.s.packs(), []);
    assert.equal(await closed.s.buy(PACKS[0]), null, "no buy where the server says no");
    assert.ok(!closed.calls.some((c) => c.url.includes("checkout")));
  });

  it("creates a checkout through the server and remembers the order", async () => {
    const { s, calls } = store((c) => {
      if (c.url.includes("config")) return { body: { web_allowed: true, packs: PACKS } };
      if (c.url.includes("history")) return { body: { balance: 30, items: [] } };
      if (c.url.includes("v1/coins/checkout")) return { body: { order_id: "o1", checkout_url: "https://checkout.stripe.com/x" } };
    });
    await s.refresh();
    const url = await s.buy(PACKS[1]);
    assert.equal(url, "https://checkout.stripe.com/x");
    assert.equal(s.get().pendingOrder, "o1");
    const body = JSON.parse(calls.find((c) => c.url.includes("checkout"))!.body!);
    assert.deepEqual({ pack_id: body.pack_id, region: body.region }, { pack_id: "p2", region: "US" });
    assert.ok(body.device_key);
  });

  it("refuses a checkout page that is not https", async () => {
    const { s } = store((c) => {
      if (c.url.includes("config")) return { body: { web_allowed: true, packs: PACKS } };
      if (c.url.includes("history")) return { body: { balance: 0, items: [] } };
      if (c.url.includes("checkout")) return { body: { order_id: "o1", checkout_url: "http://nope.test" } };
    });
    await s.refresh();
    assert.equal(await s.buy(PACKS[0]), null);
    assert.equal(s.get().problem, "Checkout couldn't open. Try again.");
    assert.equal(s.get().pendingOrder, null);
  });

  it("shows the server's own words when checkout is refused", async () => {
    const { s } = store((c) => {
      if (c.url.includes("config")) return { body: { web_allowed: true, packs: PACKS } };
      if (c.url.includes("history")) return { body: { balance: 0, items: [] } };
      if (c.url.includes("checkout")) return { status: 403, body: { detail: "Not available in your region." } };
    });
    await s.refresh();
    assert.equal(await s.buy(PACKS[0]), null);
    assert.equal(s.get().problem, "Not available in your region.");
  });

  it("follows a paid order until the webhook lands, then celebrates once", async () => {
    let asked = 0;
    const { s, celebrated } = store((c) => {
      if (c.url.includes("config")) return { body: { web_allowed: true, packs: PACKS } };
      if (c.url.includes("history")) return { body: { balance: asked >= 3 ? 1230 : 30, items: [] } };
      if (c.url.includes("v1/coins/order/o1")) {
        asked += 1;
        return { body: asked < 3 ? { order_id: "o1", status: "pending" } : { order_id: "o1", status: "paid", coins: 1200, balance: 1230 } };
      }
    });
    await s.refresh();
    await s.handleReturn({ order: "o1", result: "success" });
    assert.equal(asked, 3);
    assert.deepEqual(celebrated, [1200], "one moment, not two");
    assert.equal(s.get().gained, 1200);
    assert.equal(s.get().balance, 1230);
    assert.equal(s.get().pendingOrder, null);
    s.dismissGained();
    assert.equal(s.get().gained, null);
  });

  it("says it is still being confirmed after ten asks, but not when the player just closed the page", async () => {
    const pending = (c: { url: string }) => (c.url.includes("v1/coins/order") ? { body: { status: "pending" } } : c.url.includes("config") ? { body: { web_allowed: true, packs: PACKS } } : { body: { balance: 0, items: [] } });
    const loud = store(pending);
    await loud.s.handleReturn({ order: "o9", result: "success" });
    assert.match(loud.s.get().problem ?? "", /still being confirmed/);
    const quiet = store(pending);
    await quiet.s.refresh();
    // checkoutClosed has no order until a buy: nothing to follow, nothing said.
    await quiet.s.checkoutClosed();
    assert.equal(quiet.s.get().problem, null);
  });

  it("lets one asker follow an order at a time (the link and the closing browser both ask)", async () => {
    let asked = 0;
    const { s, celebrated } = store((c) => {
      if (c.url.includes("v1/coins/order/o1")) {
        asked += 1;
        return { body: { status: "paid", coins: 500, balance: 500 } };
      }
      if (c.url.includes("config")) return { body: { web_allowed: true, packs: PACKS } };
      return { body: { balance: 500, items: [] } };
    });
    await Promise.all([s.handleReturn({ order: "o1", result: "success" }), s.handleReturn({ order: "o1", result: "success" })]);
    assert.equal(asked, 1);
    assert.deepEqual(celebrated, [500]);
  });

  it("forgets a cancelled order and a dead one", async () => {
    const { s, calls } = store((c) => (c.url.includes("v1/coins/order") ? { body: { status: "expired" } } : undefined));
    await s.handleReturn({ order: "o2", result: "cancel" });
    assert.ok(!calls.some((c) => c.url.includes("order")), "cancel asks nothing");
    await s.handleReturn({ order: "o3" });
    assert.equal(s.get().pendingOrder, null);
    assert.equal(s.get().gained, null);
  });

  it("celebrates coins that arrived some other way, once, when the balance rises", async () => {
    let balance = 30;
    const { s, celebrated } = store((c) => (c.url.includes("config") ? { body: { web_allowed: true, packs: PACKS } } : c.url.includes("history") ? { body: { balance, items: [] } } : undefined));
    await s.refresh();
    assert.deepEqual(celebrated, [], "the first look is not a gain");
    balance = 530;
    await s.refresh();
    assert.deepEqual(celebrated, [500]);
    balance = 400;
    s.dismissGained();
    await s.refresh();
    assert.deepEqual(celebrated, [500], "a fall is not a gain");
  });
});
