// Boss raids against the real STAGING game server: one boss, as a normal
// player would play it (join where it stands, start, one swing, then watch
// the clock end the fight). Never production. Off unless asked for, and only
// during Boss Hour (:00 to :30 UTC):
//
//   CQ_LIVE_STAGING=1 node --test features/game/__tests__/raids.live.test.ts
//
// Each run makes a fresh throwaway player (a random key) on staging.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { GameClient, GameError } from "../client.ts";
import { STAGING_GAME_SERVER } from "../config.ts";
import { Identity } from "../identity.ts";
import {
  raidAnswer,
  raidDuelInfo,
  raidDuelOutcome,
  raidDuelReward,
  raidDuelStart,
  raidJoin,
  raidPlaysAsDuel,
  raidStart,
  raidState,
} from "../raids.ts";

const live = process.env.CQ_LIVE_STAGING === "1";
const bossHour = new Date().getUTCMinutes() < 28;
// Trafalgar Square, as staging.live.test.ts.
const HERE = { lat: 51.5074, lng: -0.1278 };
const log = (s: string) => process.stdout.write(`# ${s}\n`);

describe("boss raids on staging (live)", { skip: (!live && "set CQ_LIVE_STAGING=1") || (!bossHour && "not Boss Hour (:00-:28 UTC)") }, () => {
  it("joins a boss, fights it, and reads the server's verdict", { timeout: 180000 }, async () => {
    const identity = new Identity(randomBytes(32).toString("hex"), "device");
    const client = new GameClient({ baseUrl: STAGING_GAME_SERVER, identity: () => identity });
    assert.match(client.baseUrl, /staging/);
    await client.saveProfile("TS Raider", { face: 2, mark: 1, tint: "#C221D6" });
    await client.chooseFaction("gaming");
    const me = await client.roamMe();
    const { points } = await client.questPoints(HERE.lat, HERE.lng, 1500);
    const bosses = points.filter((p) => p.source === "raid");
    log(`raid_mode=${me.features?.duel?.raid_mode ?? "-"}; ${bosses.length} bosses: ${bosses.map((b) => `${b.name} [${b.challenge}] ${JSON.stringify(b.extra)}`).join("; ")}`);
    assert.ok(bosses.length > 0, "a boss near Trafalgar Square during Boss Hour");
    // A boss nobody is in yet, so a test never joins someone's crew.
    const boss = bosses.find((b) => (b.extra?.raid_players ?? "0") === "0") ?? bosses[0];
    assert.ok(boss.extra?.raid_until, "the boss says when it leaves");

    if (raidPlaysAsDuel(boss, me)) {
      // raid_duel on: the quiz is refused in the server's words, and the boss
      // is fought with the ported duel engine at real speed.
      await assert.rejects(raidJoin(client, boss.id, { lat: boss.lat, lng: boss.lng, accuracy: 5 }), (e: unknown) => {
        log(`quiz join refused: ${(e as GameError).status} ${(e as Error).message}`);
        return e instanceof GameError && e.status === 409;
      });
      const start = await raidDuelStart(client, boss, { lat: boss.lat, lng: boss.lng, accuracy: 5 });
      log(`duel raid start: ${JSON.stringify(raidDuelInfo(start))} p2=${start.setup.p2?.name}`);
      assert.equal(start.mode, "raid");
      assert.ok(raidDuelInfo(start)?.hp_max);
      const { DuelRunner, InputKind, setupFromServer } = await import("../duel/index.ts");
      let tick = 0;
      const runner = new DuelRunner(setupFromServer(start.setup, start.seed_text), {
        input: {
          next() {
            tick++;
            const a = runner.sim.state.p1;
            const b = runner.sim.state.p2;
            if (a.meter >= 100 && tick % 30 === 0) return InputKind.Special1;
            if (Math.abs(a.x - b.x) > 1300) return InputKind.MoveToward;
            if (tick % 90 === 0) return InputKind.HoldStart;
            if (tick % 90 === 20) return InputKind.HoldEnd;
            return tick % 9 === 0 ? InputKind.Tap : InputKind.None;
          },
        },
      });
      let last = performance.now();
      while (!runner.over) {
        await new Promise((r) => setTimeout(r, 16));
        const t = performance.now();
        runner.advance(t - last);
        last = t;
      }
      const outcome = await client.duelFinish(start.duel_id, runner.finishPayload());
      log(`duel raid outcome: ${JSON.stringify(outcome)}`);
      assert.ok(outcome.status === "won" || outcome.status === "lost", `judged ${outcome.status}`);
      const raid = raidDuelOutcome(outcome);
      assert.ok(raid && typeof raid.damage === "number" && typeof raid.hp_left === "number");
      const summary = raidDuelReward(outcome, boss, null, null);
      log(`reward screen: ${summary.headline} · ${summary.xp} XP · ${summary.note}`);
      // The pool, read publicly (no key): with a fighter's key the server's
      // _state does int("duel") on the duel lobby's answers and returns 500
      // (staging, 2026-10-14), so the RN game reads a duel boss's HP from
      // the point's extra, as iOS does, never from /raids/state.
      const pool = await client.request<Record<string, unknown>>("GET", "v1/roam/raids/state", { query: { lobby_id: boss.id } });
      log(`pool state: kind=${pool.kind} phase=${pool.phase} hp=${pool.hp}/${pool.max_hp}`);
      assert.equal(pool.kind, "duel");
      await raidState(client, boss.id).then(
        () => log("raids/state with a fighter's key: 200 (the server bug is fixed)"),
        (e: unknown) => log(`raids/state with a fighter's key: ${(e as GameError).status} ${(e as Error).message}`),
      );
      return;
    }

    const joined = await raidJoin(client, boss.id, { lat: boss.lat, lng: boss.lng, accuracy: 5 });
    log(`joined: phase=${joined.phase} hp=${joined.hp}/${joined.max_hp} crew=${joined.players.length} dph=${joined.damage_per_hit} ends=${joined.window_ends_at}`);
    assert.equal(joined.lobby_id, boss.id);
    assert.equal(joined.you.member, true);
    assert.ok(joined.players.some((p) => p.you));

    // Too far is refused in the server's words.
    await assert.rejects(
      raidJoin(client, boss.id, { lat: boss.lat + 0.0015, lng: boss.lng, accuracy: 5 }),
      (e: unknown) => {
        log(`too far: ${(e as Error).message}`);
        return e instanceof GameError && e.status === 403 && /closer/i.test(e.message);
      },
    );

    if (joined.phase !== "lobby") return; // someone else's fight: seen, not touched
    const fight = await raidStart(client, boss.id);
    log(`started: phase=${fight.phase} questions=${fight.questions.length} seconds_left=${fight.seconds_left}`);
    assert.equal(fight.phase, "fight");
    assert.equal(fight.questions.length, 5);
    assert.equal(fight.reveal, null, "the key stays on the server during the fight");

    const swing = await raidAnswer(client, boss.id, 0, 0);
    log(`swing: accepted=${swing.accepted} hit=${swing.hit} damage=${swing.damage} hp=${swing.state.hp}`);
    assert.equal(swing.accepted, true);
    const again = await raidAnswer(client, boss.id, 0, 1);
    assert.equal(again.accepted, false, "the first answer per question counts");

    const polled = await raidState(client, boss.id);
    assert.deepEqual(polled.you.answered, [0]);

    // The fight is 45 s; the server loses it lazily on the first look after.
    await new Promise((r) => setTimeout(r, (fight.seconds_left + 3) * 1000));
    const over = await raidState(client, boss.id);
    log(`over: phase=${over.phase} reward=${JSON.stringify(over.reward)} reveal=${JSON.stringify(over.reveal)}`);
    assert.ok(over.phase === "lost" || over.phase === "won");
    assert.equal(over.reveal?.correct.length, 5);
    assert.ok(over.reward && over.reward.xp > 0, "a player who swung is paid");
  });
});
