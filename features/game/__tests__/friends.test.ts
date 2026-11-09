// Friends (costquest-ios Features/FriendsFeature.swift) against a fake
// roam_social.py: the wire shapes, the signing of each route, refusals in the
// server's words, and the model's busy/gifted/session rules. No network.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GameClient } from "../client.ts";
import {
  addedMessage,
  canGiftTo,
  canSubmitCode,
  cleanCode,
  codeSecondsLeft,
  countdownText,
  createFriendsModel,
  daysLine,
  type FriendEntry,
  fetchFriends,
  friendsButtonLabel,
  giftFromLine,
  levelTone,
  normaliseFriends,
  pendingFromMe,
  spelledCode,
} from "../friends.ts";
import { Identity, signingPayload, utf8ToBytes, verifySignature } from "../identity.ts";
import type { RoamMe } from "../wire.ts";

const SEED_A = "11".repeat(32);
const SEED_B = "22".repeat(32);
const FRIEND = "ab".repeat(32);
const HERE = { lat: 51.5074, lng: -0.1278 };

type Call = { url: string; path: string; method: string; headers: Record<string, string>; body?: string };
type Answer = { status?: number; body: unknown };

function fakeServer(route: (call: Call, json: Record<string, unknown>) => Answer | undefined) {
  const calls: Call[] = [];
  const fetch = async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    const path = new URL(url).pathname;
    const call = { url, path, method: init.method, headers: init.headers, body: init.body };
    calls.push(call);
    const json = init.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    const answer = route(call, json) ?? { status: 404, body: { detail: "Not Found" } };
    const text = JSON.stringify(answer.body);
    const status = answer.status ?? 200;
    return { ok: status >= 200 && status < 300, status, text: async () => text };
  };
  return { fetch, calls };
}

function signedOk(call: Call, id: Identity): boolean {
  const nonce = Number(call.headers["X-Nonce"]);
  const body = utf8ToBytes(call.body ?? "");
  return (
    call.headers["X-Device-Key"] === id.publicKeyHex &&
    verifySignature(id.publicKeyHex, signingPayload(call.method, call.path, body, nonce), call.headers["X-Signature"])
  );
}

const entry = (over: Partial<FriendEntry> = {}): FriendEntry => ({
  friend_key: FRIEND,
  handle: "Ada",
  faction: "gaming",
  level_name: "Good",
  days: 1,
  next_level_at: 7,
  can_gift_today: true,
  since: "2026-10-14T10:00:00+00:00",
  ...over,
});

describe("friends: pure", () => {
  it("cleans a typed code as iOS does: capitals and digits, six at most", () => {
    assert.equal(cleanCode("ab c-2 3"), "ABC23");
    assert.equal(cleanCode("abcdefgh"), "ABCDEF");
    assert.equal(cleanCode("äb€1"), "B1");
    assert.equal(canSubmitCode("abc23"), false);
    assert.equal(canSubmitCode("abc234"), true);
  });
  it("counts a code down by the phone's clock", () => {
    assert.equal(codeSecondsLeft(null, 0), 0);
    assert.equal(codeSecondsLeft(600_000, 1_500), 598);
    assert.equal(codeSecondsLeft(1_000, 5_000), 0);
    assert.equal(countdownText(598), "9:58");
    assert.equal(countdownText(59), "0:59");
    assert.equal(spelledCode("AB3"), "A B 3");
  });
  it("says what the server said, in the iOS words", () => {
    assert.equal(addedMessage({ added: true, already: false, friend_key: FRIEND, handle: "Ada" }), "You and Ada are now friends!");
    assert.equal(addedMessage({ added: false, already: true, friend_key: FRIEND, handle: "Ada" }), "You and Ada are already friends.");
    assert.equal(daysLine(entry({ days: 1, next_level_at: 7 })), "1 day · next at 7");
    assert.equal(daysLine(entry({ days: 95, next_level_at: null })), "95 days");
    assert.deepEqual(["Best", "Ultra", "Great", "Good", "?"].map(levelTone), ["sunDeep", "berry", "skyDeep", "mint", "mint"]);
    assert.equal(giftFromLine({ from: "Ada", item: "time", name: "Extra time", added: 1 }), "from Ada");
    assert.equal(giftFromLine({ from: "Ada", item: "time", name: "Extra time", added: 0 }), "from Ada (bag full)");
    assert.equal(friendsButtonLabel(0), "Friends");
    assert.equal(friendsButtonLabel(1), "Friends, 1 gift waiting");
    assert.equal(friendsButtonLabel(3), "Friends, 3 gifts waiting");
  });
  it("reads waiting gifts from /me and tolerates a missing feature", () => {
    assert.equal(pendingFromMe({ features: { social: { friends: 2, pending_gifts: 3 } } } as unknown as RoamMe), 3);
    assert.equal(pendingFromMe({ features: {} } as unknown as RoamMe), 0);
    assert.equal(pendingFromMe(null), 0);
  });
  it("tolerates missing fields in the list", () => {
    const got = normaliseFriends({ friends: [{ friend_key: FRIEND } as FriendEntry] } as never);
    assert.deepEqual(got.friends[0].handle, "Player");
    assert.equal(got.friends[0].level_name, "Good");
    assert.equal(got.friends[0].can_gift_today, true);
    assert.equal(got.pending_gifts, 0);
    assert.deepEqual(normaliseFriends(null), { friends: [], pending_gifts: 0 });
  });
  it("greys a friend gifted today, by the server or this session", () => {
    assert.equal(canGiftTo({ giftedNow: [] }, entry()), true);
    assert.equal(canGiftTo({ giftedNow: [FRIEND] }, entry()), false);
    assert.equal(canGiftTo({ giftedNow: [] }, entry({ can_gift_today: false })), false);
  });
});

describe("friends: the routes", () => {
  it("lists friends with a signed GET (path signed, not the query)", async () => {
    const id = new Identity(SEED_A, "device");
    const { fetch, calls } = fakeServer((c) =>
      c.path === "/v1/roam/social/friends" ? { body: { friends: [entry()], pending_gifts: 2 } } : undefined,
    );
    const client = new GameClient({ baseUrl: "https://g.example", identity: () => id, fetch });
    const got = await fetchFriends(client);
    assert.equal(got.friends[0].handle, "Ada");
    assert.equal(got.pending_gifts, 2);
    assert.equal(calls[0].method, "GET");
    assert.ok(calls[0].url.endsWith(`?device_key=${id.publicKeyHex}`));
    assert.equal(calls[0].body, undefined);
    assert.ok(signedOk(calls[0], id));
  });
});

/** A small roam_social: one code, one friend, one gift a day, refusals as the server words them. */
function socialServer(id: Identity) {
  let code: { code: string; owner: string; lat: number; lng: number } | null = null;
  let friends: FriendEntry[] = [];
  let pending = 0;
  const gifted = new Set<string>();
  const server = fakeServer((c, body) => {
    assert.ok(signedOk(c, id), `signed ${c.path}`);
    switch (c.path) {
      case "/v1/roam/social/friends":
        return { body: { friends: friends.map((f) => ({ ...f, can_gift_today: !gifted.has(f.friend_key) })), pending_gifts: pending } };
      case "/v1/roam/social/code":
        assert.deepEqual(Object.keys(body).sort(), ["device_key", "lat", "lng"]);
        code = { code: "K7P2QX", owner: String(body.device_key), lat: Number(body.lat), lng: Number(body.lng) };
        return { body: { code: code.code, expires_at: "2026-10-14T10:10:00+00:00", ttl_s: 600 } };
      case "/v1/roam/social/add": {
        assert.deepEqual(Object.keys(body).sort(), ["code", "device_key", "lat", "lng"]);
        if (body.code !== "ABC234") return { status: 404, body: { detail: { reason: "That code isn't valid. Ask for a fresh one." } } };
        if (Math.abs(Number(body.lat) - HERE.lat) > 0.001) {
          return { status: 403, body: { detail: { reason: "Friends are added in person. Stand next to them and try again." } } };
        }
        const already = friends.length > 0;
        friends = [entry()];
        return { body: { added: !already, already, friend_key: FRIEND, handle: "Ada" } };
      }
      case "/v1/roam/social/gift":
        assert.deepEqual(Object.keys(body).sort(), ["device_key", "friend_key"]);
        if (gifted.has(String(body.friend_key))) return { status: 409, body: { detail: { reason: "Already sent a gift today. Send another tomorrow." } } };
        gifted.add(String(body.friend_key));
        return { body: { sent: true, friend_key: body.friend_key } };
      case "/v1/roam/social/claim": {
        assert.deepEqual(Object.keys(body), ["device_key"]);
        const gifts = Array.from({ length: pending }, () => ({ from: "Ada", item: "time", name: "Extra time", added: 1 }));
        pending = 0;
        return { body: { gifts, bag: { time: gifts.length }, names: { time: "Extra time" } } };
      }
    }
    return undefined;
  });
  return { ...server, setPending: (n: number) => (pending = n), code: () => code };
}

describe("friends: the model", () => {
  it("makes a code where you stand and times it by the phone's clock", async () => {
    const id = new Identity(SEED_A, "device");
    const srv = socialServer(id);
    const client = new GameClient({ baseUrl: "https://g", identity: () => id, fetch: srv.fetch });
    let t = 1_000_000;
    const model = createFriendsModel({ client: () => client, here: () => HERE, now: () => t });
    await model.makeCode();
    assert.equal(model.get().code?.code, "K7P2QX");
    assert.equal(model.get().codeExpiresAt, 1_000_000 + 600_000);
    assert.deepEqual(srv.code(), { code: "K7P2QX", owner: id.publicKeyHex, lat: HERE.lat, lng: HERE.lng });
    t += 599_500;
    assert.equal(codeSecondsLeft(model.get().codeExpiresAt, t), 0);
  });

  it("does nothing without a fix (iOS waits for the location)", async () => {
    const id = new Identity(SEED_A, "device");
    const srv = socialServer(id);
    const client = new GameClient({ baseUrl: "https://g", identity: () => id, fetch: srv.fetch });
    const model = createFriendsModel({ client: () => client, here: () => null });
    await model.makeCode();
    assert.equal(await model.add("ABC234"), null);
    assert.equal(srv.calls.length, 0);
  });

  it("adds by code, shows the server's refusals in its words, and reloads the list", async () => {
    const id = new Identity(SEED_A, "device");
    const srv = socialServer(id);
    const client = new GameClient({ baseUrl: "https://g", identity: () => id, fetch: srv.fetch });
    let here = { lat: 51.6, lng: -0.1278 };
    const model = createFriendsModel({ client: () => client, here: () => here });

    assert.equal(await model.add("abc 23"), null, "five characters are never sent");
    assert.equal(srv.calls.length, 0);

    assert.equal(await model.add("zzz999"), null);
    assert.equal(model.get().message, "That code isn't valid. Ask for a fresh one.");

    assert.equal(await model.add("abc234"), null);
    assert.equal(model.get().message, "Friends are added in person. Stand next to them and try again.");
    assert.equal(model.get().payload, null, "a refusal adds nobody");

    here = HERE;
    const r = await model.add("abc-234");
    assert.equal(r?.added, true);
    assert.equal(JSON.parse(srv.calls.at(-2)?.body ?? "{}").code, "ABC234");
    assert.equal(model.get().message, "You and Ada are now friends!");
    assert.equal(model.get().payload?.friends[0].handle, "Ada");

    await model.add("ABC234");
    assert.equal(model.get().message, "You and Ada are already friends.");
  });

  it("gifts once a day: a double tap sends once, the button greys at once", async () => {
    const id = new Identity(SEED_A, "device");
    const srv = socialServer(id);
    const client = new GameClient({ baseUrl: "https://g", identity: () => id, fetch: srv.fetch });
    const model = createFriendsModel({ client: () => client, here: () => HERE });
    await model.add("ABC234");
    const f = model.get().payload!.friends[0];
    const sends = srv.calls.length;
    const [a, b] = await Promise.all([model.gift(f), model.gift(f)]);
    assert.deepEqual([a, b], [true, false]);
    assert.equal(srv.calls.filter((c, i) => i >= sends && c.path === "/v1/roam/social/gift").length, 1);
    assert.equal(model.canGift(f), false);
    assert.equal(model.get().payload?.friends[0].can_gift_today, false);

    assert.equal(await model.gift(f), false);
    assert.equal(model.get().message, "Already sent a gift today. Send another tomorrow.");
  });

  it("opens gifts into the bag and tells the game something changed", async () => {
    const id = new Identity(SEED_A, "device");
    const srv = socialServer(id);
    const client = new GameClient({ baseUrl: "https://g", identity: () => id, fetch: srv.fetch });
    let changed = 0;
    const model = createFriendsModel({ client: () => client, here: () => HERE, onChanged: () => changed++ });
    srv.setPending(2);
    await model.refresh();
    assert.equal(model.pending(), 2);
    const gifts = await model.claim();
    assert.equal(gifts?.length, 2);
    assert.equal(model.get().opened[0].name, "Extra time");
    assert.equal(model.pending(), 0);
    assert.equal(changed, 1);
    model.dismissed();
    assert.deepEqual(model.get().opened, []);
    assert.equal(model.get().message, null);
  });

  it("keeps the list on a network failure (a flaky network should not unfriend)", async () => {
    const id = new Identity(SEED_A, "device");
    let down = false;
    const { fetch } = fakeServer(() => (down ? { status: 500, body: { detail: "boom" } } : { body: { friends: [entry()], pending_gifts: 0 } }));
    const client = new GameClient({ baseUrl: "https://g", identity: () => id, fetch, sleep: async () => {} });
    const model = createFriendsModel({ client: () => client, here: () => HERE });
    await model.refresh();
    down = true;
    await model.refresh();
    assert.equal(model.get().failed, true);
    assert.equal(model.get().payload?.friends.length, 1);
  });

  it("starts over when a different player signs in", async () => {
    let id = new Identity(SEED_A, "device");
    const { fetch } = fakeServer(() => ({ body: { friends: [entry()], pending_gifts: 1 } }));
    const client = new GameClient({ baseUrl: "https://g", identity: () => id, fetch });
    const model = createFriendsModel({ client: () => client, here: () => HERE });
    await model.refresh();
    assert.equal(model.get().key, id.publicKeyHex);
    id = new Identity(SEED_B, "device");
    const seen: (number | null)[] = [];
    const off = model.subscribe(() => seen.push(model.get().payload?.pending_gifts ?? null));
    await model.refresh();
    off();
    assert.equal(seen[0], null, "the old player's list is dropped before the new one loads");
    assert.equal(model.get().key, id.publicKeyHex);
  });

  it("says sign in when nobody is", async () => {
    const client = new GameClient({ baseUrl: "https://g", identity: () => null, fetch: fakeServer(() => undefined).fetch });
    const model = createFriendsModel({ client: () => client, here: () => HERE });
    await model.refresh();
    assert.equal(model.get().payload, null);
    await model.makeCode();
    assert.equal(model.get().message, "Sign in to play.");
  });
});
