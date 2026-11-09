// Squad up in person (squad.ts): reading the server's answers, the squad link,
// the hold-phones claim, the code flow, the token the next 3D fight carries,
// and the fight's cast and card with a friend in it.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GameClient, GameError } from "../client.ts";
import { type BeaconEvent, createNearbyFriendModel } from "../friendsNearby.ts";
import { Identity } from "../identity.ts";
import {
  bonusLine,
  codeFromSquadLink,
  createSquadModel,
  paidLine,
  parseSquad,
  parseSquadCode,
  setupAlly,
  squadClaimer,
  squadLink,
  squadPaid,
  STATUS_EVERY_MS,
} from "../squad.ts";
import { fightCard, fightFromStart, pickCast } from "../../game3d/fight3d.ts";

const ME = "a".repeat(64);
const MIA = "b".repeat(64);
const T0 = Date.parse("2026-11-01T10:00:00Z");

const PAIRED = {
  squad: true,
  token: "tok-123",
  expires_at: "2026-11-01T10:30:00+00:00",
  ttl_s: 1800,
  via: "uwb",
  bonus_xp: 30,
  ally: { handle: "Mia", avatar: "hero-7", weapon_class: "blade", faction: "anime" },
};

function harness(answers: (unknown | Error)[]) {
  let clock = T0;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let nextId = 1;
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  const queue = [...answers];
  const model = createSquadModel({
    client: () => ({
      deviceKey: () => ME,
      request: (async (_m: string, path: string, o?: { body?: Record<string, unknown> }) => {
        posts.push({ path, body: o?.body ?? {} });
        const a = queue.length ? queue.shift() : { active: null };
        if (a instanceof Error) throw a;
        return a;
      }) as never,
    }),
    here: () => ({ lat: 51.5, lng: -0.12 }),
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
  const advance = async (ms: number) => {
    const until = clock + ms;
    for (;;) {
      timers.sort((x, y) => x.at - y.at);
      const t = timers[0];
      if (!t || t.at > until) break;
      timers.shift();
      clock = t.at;
      t.fn();
      await flush();
    }
    clock = until;
    await flush();
  };
  return { model, posts, advance, flush, setClock: (t: number) => (clock = t), pending: () => timers.length };
}

describe("squad wire", () => {
  it("reads a pairing, defaulting what is missing", () => {
    const s = parseSquad(PAIRED, T0);
    assert.deepEqual(s, {
      token: "tok-123",
      expiresAt: Date.parse("2026-11-01T10:30:00Z"),
      via: "uwb",
      bonusXp: 30,
      ally: { handle: "Mia", avatar: "hero-7", weapon_class: "blade", faction: "anime" },
    });
    const bare = parseSquad({ token: "t", ttl_s: 60, via: "code", ally: {} }, T0);
    assert.equal(bare?.expiresAt, T0 + 60_000);
    assert.equal(bare?.via, "code");
    assert.equal(bare?.ally.handle, "Your friend");
    assert.equal(bare?.ally.avatar, null);
    assert.equal(parseSquad({ squad: false, waiting: true }, T0), null);
    assert.equal(parseSquad(null, T0), null);
  });

  it("reads a code and builds its link", () => {
    assert.deepEqual(parseSquadCode({ code: "ABC234", ttl_s: 120 }, T0), { code: "ABC234", expiresAt: T0 + 120_000, link: "cosquest://squad/ABC234" });
    assert.equal(parseSquadCode({}, T0), null);
  });

  it("finds the code in a squad link and nowhere else", () => {
    assert.equal(codeFromSquadLink(squadLink("ABC234")), "ABC234");
    assert.equal(codeFromSquadLink("cosquest://squad/abc234/"), "ABC234");
    assert.equal(codeFromSquadLink("/squad/ABC234"), "ABC234");
    assert.equal(codeFromSquadLink("squad/ABC234"), "ABC234");
    assert.equal(codeFromSquadLink("https://cosquest.app/squad/ABC234?x=1"), "ABC234");
    assert.equal(codeFromSquadLink("cosquest://squad/ABC"), null);
    assert.equal(codeFromSquadLink("cosquest://play?raid=1"), null);
    assert.equal(codeFromSquadLink(null), null);
  });

  it("reads the friend in a fight's setup and what fighting together paid", () => {
    assert.deepEqual(setupAlly({ kind: "fight3d", ally: { handle: "Mia", avatar: "hero-7", via: "uwb", bonus_xp: 30 } }), {
      handle: "Mia",
      avatar: "hero-7",
      via: "uwb",
      bonusXp: 30,
    });
    assert.equal(setupAlly({ kind: "fight3d" }), null);
    assert.deepEqual(squadPaid({ status: "won", squad: { xp: 30, handle: "Mia" } }), { xp: 30, handle: "Mia" });
    assert.equal(squadPaid({ status: "won", squad: { xp: 0, handle: "Mia" } }), null);
    assert.equal(squadPaid({ status: "won" }), null);
    assert.equal(paidLine({ xp: 30, handle: "Mia" }), "Fought with Mia: +30 XP");
  });

  it("says when today's bonus is used up", () => {
    const s = parseSquad(PAIRED, T0)!;
    assert.equal(bonusLine(s), "+30 XP for fighting together");
    assert.match(bonusLine({ ...s, bonusXp: 0 }), /used up/);
  });
});

describe("squad model", () => {
  it("joins a code, keeps the token, and drops it once a fight used it", async () => {
    const h = harness([{ ...PAIRED, via: "code", bonus_xp: 20 }]);
    await h.model.join("abc-234");
    assert.equal(h.posts[0].path, "v1/roam/squad/join");
    assert.deepEqual(h.posts[0].body, { device_key: ME, code: "ABC234", lat: 51.5, lng: -0.12 });
    const s = h.model.get();
    assert.equal(s.squad?.via, "code");
    assert.equal(s.celebrations, 1);
    assert.equal(h.model.token(), "tok-123");
    h.model.used();
    assert.equal(h.model.token(), null);
  });

  it("refuses a short code without asking the server", async () => {
    const h = harness([]);
    await h.model.join("AB");
    assert.equal(h.posts.length, 0);
    assert.match(h.model.get().error ?? "", /six/);
  });

  it("shows the server's refusal in its own words", async () => {
    const h = harness([new GameError("http", "That code isn't valid. Ask for a fresh one.", 404)]);
    await h.model.join("ABC234");
    assert.equal(h.model.get().error, "That code isn't valid. Ask for a fresh one.");
    assert.equal(h.model.get().busy, false);
    assert.equal(h.model.get().squad, null);
  });

  it("shows a code and asks every 2 s until the friend has joined it", async () => {
    const h = harness([{ code: "ABC234", ttl_s: 120 }, { active: null }, { active: PAIRED }]);
    await h.model.makeCode();
    assert.equal(h.model.get().code?.code, "ABC234");
    await h.advance(STATUS_EVERY_MS);
    assert.equal(h.posts[1].path, "v1/roam/squad/status");
    assert.equal(h.model.get().squad, null);
    await h.advance(STATUS_EVERY_MS);
    assert.equal(h.model.get().squad?.ally.handle, "Mia");
    assert.equal(h.model.get().code, null, "the code is done with");
    await h.advance(STATUS_EVERY_MS * 3);
    assert.equal(h.posts.length, 3, "no more asking once paired");
  });

  it("stops asking when the sheet closes", async () => {
    const h = harness([{ code: "ABC234", ttl_s: 120 }]);
    await h.model.makeCode();
    h.model.stopListening();
    await h.advance(STATUS_EVERY_MS * 3);
    assert.equal(h.posts.length, 1);
  });

  it("forgets a pairing and a code once they run out", async () => {
    const h = harness([PAIRED]);
    await h.model.join("ABC234");
    h.setClock(Date.parse("2026-11-01T10:30:01Z"));
    assert.equal(h.model.get().squad, null);
    assert.equal(h.model.token(), null);
  });

  it("leaving drops the token here and tells the server", async () => {
    const h = harness([PAIRED, { left: true }]);
    await h.model.join("ABC234");
    await h.model.leave();
    assert.equal(h.model.token(), null);
    assert.equal(h.posts[1].path, "v1/roam/squad/leave");
  });

  it("a squad link waits for the sheet to join it", () => {
    const h = harness([]);
    h.model.open("abc234");
    assert.equal(h.model.get().pendingCode, "ABC234");
  });
});

describe("hold phones together, squad route", () => {
  it("claims the held phone at the squad route and keeps the pairing", async () => {
    let on: ((e: BeaconEvent) => void) | null = null;
    const posts: { path: string; body: Record<string, unknown> }[] = [];
    const answers: unknown[] = [{ squad: false, waiting: true }, PAIRED];
    const paired: string[] = [];
    let clock = T0;
    const timers: { at: number; fn: () => void }[] = [];
    const nearby = createNearbyFriendModel({
      beacon: {
        usesUWB: true,
        start: async () => {},
        stop: async () => {},
        listen: (fn) => {
          on = fn;
          return () => (on = null);
        },
      },
      claimer: squadClaimer((s) => paired.push(s.ally.handle), () => clock),
      client: () => ({
        deviceKey: () => ME,
        request: (async (_m: string, path: string, o?: { body?: Record<string, unknown> }) => {
          posts.push({ path, body: o?.body ?? {} });
          return answers.shift() ?? { squad: false, waiting: true };
        }) as never,
      }),
      here: () => ({ lat: 51.5, lng: -0.12 }),
      handle: () => "Ada",
      onFriend: () => assert.fail("a squad is not a friend add"),
      now: () => clock,
      setTimer: (fn, ms) => timers.push({ at: clock + ms, fn }),
      clearTimer: () => {},
    });
    const flush = async () => {
      for (let i = 0; i < 30; i++) await Promise.resolve();
    };
    await nearby.start();
    on!({ kind: "hello", key: MIA, handle: "Mia" });
    on!({ kind: "distance", key: MIA, metres: 0.3 });
    await flush();
    assert.equal(posts[0].path, "v1/roam/squad/nearby");
    assert.deepEqual(posts[0].body, { device_key: ME, peer_key: MIA, lat: 51.5, lng: -0.12, distance_m: 0.3 });
    assert.match(nearby.get().status ?? "", /squad up too/);
    timers.sort((a, b) => a.at - b.at);
    const next = timers.find((t) => t.at > clock && t.at - clock <= 2500)!;
    clock = next.at;
    next.fn();
    await flush();
    assert.deepEqual(paired, ["Mia"]);
    assert.match(nearby.get().success ?? "", /Mia joins your next fight/);
  });
});

describe("the next 3D fight carries the token", () => {
  function client(reply: Record<string, unknown>, sent: Record<string, unknown>[]) {
    const c = new GameClient({
      baseUrl: "https://x",
      identity: () => new Identity("44".repeat(32), "device"),
      sleep: async () => {},
      fetch: (async (_url: string, init: { body?: string }) => {
        sent.push(JSON.parse(init.body ?? "{}"));
        return { ok: true, status: 200, text: async () => JSON.stringify(reply) };
      }) as never,
    });
    return c;
  }
  const START = { duel_id: "d1", mode: "point", target: "p1", status: "live", seed: 5, seed_text: "5", tick_hz: 30, started_at: "", expires_at: "", expires_in_s: 60 };

  it("sends the token with a 3D fight and lets go once the friend is in it", async () => {
    const sent: Record<string, unknown>[] = [];
    let used = 0;
    const c = client({ ...START, setup: { kind: "fight3d", ally: { handle: "Mia" } } }, sent);
    c.squad = { token: () => "tok-123", used: () => used++ };
    await c.duelStart({ mode: "point", target: "p1", fight3d: true });
    assert.equal(sent[0].squad, "tok-123");
    assert.equal(used, 1);
  });

  it("keeps the token when the server left the friend out, and never sends it with a 2D fight", async () => {
    const sent: Record<string, unknown>[] = [];
    let used = 0;
    const c = client({ ...START, setup: { kind: "fight3d" } }, sent);
    c.squad = { token: () => "tok-123", used: () => used++ };
    await c.duelStart({ mode: "point", target: "p1", fight3d: true });
    await c.duelStart({ mode: "point", target: "p1", fallback2d: true });
    assert.equal(used, 0);
    assert.equal(sent[1].squad, undefined);
  });
});

describe("a fight with a friend in it", () => {
  type Pick = { id: string; name: string; type: string; gameplay: { avatar?: boolean; role?: string } };
  const entries: Pick[] = [
    { id: "hero-1", name: "Armstrong", type: "character", gameplay: { avatar: true, role: "hero" } },
    { id: "hero-7", name: "Zola", type: "character", gameplay: { avatar: true, role: "hero" } },
    { id: "g-1", name: "Warden", type: "character", gameplay: { role: "guardian" } },
  ];

  it("casts the friend's worn hero as the ally, even the same hero as yours", () => {
    const c = pickCast(entries, { avatarId: "hero-1", allyId: "hero-7", role: "guardian", key: "p1" }).ally?.id;
    assert.equal(c, "hero-7");
    const same = pickCast(entries, { avatarId: "hero-1", allyId: "hero-1", role: "guardian", key: "p1" }).ally?.id;
    assert.equal(same, "hero-1");
    const none = pickCast(entries, { avatarId: "hero-1", allyId: "gone", role: "guardian", key: "p1" }).ally?.id;
    assert.equal(none, "hero-7", "an unknown hero falls back to the usual pick");
  });

  it("reads the friend from the setup and names them on the pre-fight card", () => {
    const start = { seed_text: "12345", setup: { kind: "fight3d", duration_s: 45, mods: {}, ally: { handle: "Mia", avatar: "hero-7" }, point: { tier: "common" } } } as never;
    assert.deepEqual(fightFromStart(start)?.ally, { id: "hero-7", name: "Mia" });
    assert.match(fightCard(start, "Trafalgar Square").line ?? "", /Mia fights beside you\.$/);
    const alone = { seed_text: "12345", setup: { kind: "fight3d", duration_s: 45, mods: {} } } as never;
    assert.equal(fightFromStart(alone)?.ally, null);
    assert.doesNotMatch(fightCard(alone, "Trafalgar Square").line ?? "", /beside you/);
  });
});
