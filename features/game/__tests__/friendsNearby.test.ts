// "Hold phones together" (friendsNearby.ts), against FriendsFeature.swift's
// NearbyFriendModel: what the card lists, when it claims on its own, how it
// keeps claiming, and when it gives up.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GameError } from "../client.ts";
import {
  addLabel,
  type BeaconEvent,
  CLAIM_EVERY_MS,
  CLAIM_WINDOW_MS,
  createNearbyFriendModel,
  nearbyDistanceText,
  peersOf,
  QUIET_AFTER_MS,
  searchingLine,
  tooFar,
} from "../friendsNearby.ts";

const ME = "a".repeat(64);
const AMY = "b".repeat(64);
const BOB = "c".repeat(64);

function harness(opts: { answers?: (unknown | Error)[]; here?: { lat: number; lng: number } | null; noKey?: boolean } = {}) {
  let clock = 1_000_000;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let nextId = 1;
  let on: ((e: BeaconEvent) => void) | null = null;
  const started: { key: string; handle: string }[] = [];
  let stopped = 0;
  const posts: Record<string, unknown>[] = [];
  const answers = [...(opts.answers ?? [])];
  let friendsAdded = 0;
  const model = createNearbyFriendModel({
    beacon: {
      usesUWB: true,
      async start(me) {
        started.push(me);
      },
      async stop() {
        stopped++;
      },
      listen(fn) {
        on = fn;
        return () => {
          on = null;
        };
      },
    },
    client: () => ({
      deviceKey: () => {
        if (opts.noKey) throw new GameError("not_signed_in", "Sign in to play.");
        return ME;
      },
      request: (async (_m: string, _p: string, o?: { body?: Record<string, unknown> }) => {
        posts.push(o?.body ?? {});
        const a = answers.length ? answers.shift() : { friends: false, waiting: true };
        if (a instanceof Error) throw a;
        return a;
      }) as never,
    }),
    here: () => (opts.here === undefined ? { lat: 51.5, lng: -0.12 } : opts.here),
    handle: () => "Ada",
    onFriend: () => friendsAdded++,
    now: () => clock,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.push({ at: clock + ms, fn, id });
      return id;
    },
    clearTimer: (t) => {
      const i = timers.findIndex((x) => x.id === t);
      if (i >= 0) timers.splice(i, 1);
    },
  });
  const flush = async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
  };
  /** Moves the clock, firing due timers in order and letting their awaits run. */
  const advance = async (ms: number) => {
    const end = clock + ms;
    await flush();
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const t = timers[0];
      if (!t || t.at > end) break;
      timers.shift();
      clock = t.at;
      t.fn();
      await flush();
    }
    clock = end;
    await flush();
  };
  return {
    model,
    emit: (e: BeaconEvent) => on?.(e),
    started,
    stopped: () => stopped,
    posts,
    advance,
    flush,
    friendsAdded: () => friendsAdded,
    now: () => clock,
  };
}

describe("hold phones together (NearbyFriendModel)", () => {
  it("advertises this player's key and handle, and lists who it sees and who said hello", async () => {
    const h = harness();
    await h.model.start();
    assert.deepEqual(h.started, [{ key: ME, handle: "Ada" }]);
    h.emit({ kind: "seen", peers: [{ key: BOB, handle: "Bob" }, { key: AMY, handle: "Amy?" }] });
    h.emit({ kind: "hello", key: AMY, handle: "Amy" });
    const peers = peersOf(h.model.get(), h.now());
    assert.deepEqual(peers.map((p) => [p.handle, p.linked]), [["Amy", true], ["Bob", false]]);
    h.emit({ kind: "lost", key: AMY });
    assert.equal(peersOf(h.model.get(), h.now())[0]!.linked, false);
  });

  it("says to open the screen on the other phone after 20 s of nobody", async () => {
    const h = harness();
    await h.model.start();
    assert.equal(searchingLine(h.model.get()), "Looking for phones nearby…");
    await h.advance(QUIET_AFTER_MS);
    assert.equal(searchingLine(h.model.get()), "Make sure the other phone has this screen open.");
  });

  it("shows a fresh distance only, and says Hold closer while too far", async () => {
    const h = harness();
    await h.model.start();
    h.emit({ kind: "hello", key: AMY, handle: "Amy" });
    h.emit({ kind: "distance", key: AMY, metres: 1.24 });
    const p = peersOf(h.model.get(), h.now())[0]!;
    assert.equal(p.distance, 1.24);
    assert.equal(tooFar(p), true);
    assert.equal(addLabel(p), "Hold closer");
    assert.equal(nearbyDistanceText(1.24), "1.2 m away");
    assert.equal(nearbyDistanceText(0.34), "34 cm away");
    await h.advance(3000);
    const stale = peersOf(h.model.get(), h.now())[0]!;
    assert.equal(stale.distance, null);
    assert.equal(addLabel(stale), "Add Amy");
  });

  it("claims on its own once the phones touch, and keeps claiming until the server says friends", async () => {
    const h = harness({ answers: [{ friends: false, waiting: true }, { friends: true, handle: "Amy B" }] });
    await h.model.start();
    h.emit({ kind: "hello", key: AMY, handle: "Amy" });
    h.emit({ kind: "distance", key: AMY, metres: 0.3 });
    await h.flush();
    assert.equal(h.model.get().claiming, AMY);
    assert.deepEqual(h.posts[0], { device_key: ME, peer_key: AMY, lat: 51.5, lng: -0.12, distance_m: 0.3 });
    assert.equal(h.model.get().status, "Waiting for Amy to add you too…");
    // Another touch while claiming does not start a second claim.
    h.emit({ kind: "distance", key: AMY, metres: 0.2 });
    await h.advance(CLAIM_EVERY_MS);
    assert.equal(h.posts.length, 2);
    assert.equal(h.model.get().success, "You and Amy B are friends");
    assert.equal(h.model.get().claiming, null);
    assert.equal(h.model.get().celebrations, 1);
    assert.equal(h.friendsAdded(), 1);
  });

  it("gives up after 90 s and lets the player try again", async () => {
    const h = harness();
    await h.model.start();
    h.emit({ kind: "hello", key: BOB, handle: "Bob" });
    h.model.claim(BOB);
    await h.advance(CLAIM_WINDOW_MS + CLAIM_EVERY_MS);
    assert.equal(h.model.get().status, "Didn't hear back from Bob. Make sure they tap Add on their phone too.");
    assert.equal(h.model.get().claiming, null);
    assert.equal(h.posts.length, CLAIM_WINDOW_MS / CLAIM_EVERY_MS);
  });

  it("stops at the server's refusal, but rides out a dropped request", async () => {
    const h = harness({ answers: [new GameError("network", "offline"), new GameError("http", "Too far from them.", 409)] });
    await h.model.start();
    h.emit({ kind: "hello", key: BOB, handle: "Bob" });
    h.model.claim(BOB);
    await h.flush();
    assert.equal(h.model.get().claiming, BOB);
    await h.advance(CLAIM_EVERY_MS);
    assert.equal(h.model.get().status, "Too far from them.");
    assert.equal(h.model.get().claiming, null);
  });

  it("waits for a location before claiming", async () => {
    const h = harness({ here: null });
    await h.model.start();
    h.emit({ kind: "hello", key: BOB, handle: "Bob" });
    h.model.claim(BOB);
    await h.flush();
    assert.equal(h.model.get().status, "Waiting for your location…");
    assert.equal(h.posts.length, 0);
  });

  it("reports Local Network refused, and needs a signed-in player", async () => {
    const h = harness();
    await h.model.start();
    h.emit({ kind: "denied" });
    assert.equal(h.model.get().denied, true);
    const n = harness({ noKey: true });
    await n.model.start();
    assert.equal(n.model.get().status, "This phone couldn't prove who it is. Try again later.");
    assert.equal(n.started.length, 0);
  });

  it("stopping ends the beacon, a claim in flight, and the peer list", async () => {
    const h = harness();
    await h.model.start();
    h.emit({ kind: "hello", key: BOB, handle: "Bob" });
    h.model.claim(BOB);
    await h.flush();
    h.model.stop();
    assert.equal(h.stopped(), 1);
    await h.advance(CLAIM_EVERY_MS * 3);
    assert.equal(h.posts.length, 1);
    assert.deepEqual(peersOf(h.model.get(), h.now()), []);
    // Events after stop are ignored.
    h.emit({ kind: "hello", key: AMY, handle: "Amy" });
    assert.deepEqual(h.model.get().greeted, {});
  });
});
