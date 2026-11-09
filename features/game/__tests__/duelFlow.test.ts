// The duel's flow (features/game/duelFlow.ts): copy, cues, the result's words,
// and the starts' fight3d / fallback2d asks (battle-3d-only).
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDuelStart } from "../client.ts";
import {
  asFull,
  backLabel,
  bannerAfter,
  cueFor,
  cueForSimEvent,
  duelDifficulty,
  duelModeOf,
  dropOf,
  extraLines,
  fightersOf,
  guardianName,
  fightTimeText,
  HELD_LINE,
  HP_CARD_TITLE,
  hpPercentText,
  hpRowName,
  hpShare,
  pausePlace,
  pauseTitle,
  payIsEmpty,
  payOf,
  resultSubtitle,
  resultTitle,
  siegeDuelStart,
  versusSubline,
  versusTitle,
  verdictCue,
} from "../duelFlow.ts";
import { DuelEventType } from "../duel/types.ts";
import type { DuelOutcome, DuelStart, QuestPoint } from "../wire.ts";

const name = (id: string) => `F:${id}`;

const point = (extra: Record<string, string> | null = null): QuestPoint => ({
  id: "p1",
  name: "Big Ben",
  lat: 0,
  lng: 0,
  source: "landmark",
  place_kind: "tower",
  tier: "rare",
  realm: "dc",
  challenge: "duel",
  extra,
});

// A real server writes the seed as a 62-bit integer, past what a double holds.
const BODY = (extra = "") =>
  `{"duel_id":"d1","mode":"point","target":"p1","seed":4611686018427387847,"setup":{"seed":4611686018427387847,"p1":{"name":"Ada","faction":"dc","level":4,"weapon_class":"blade","ai":null,"relic":{"name":"Ember","kind":"sword"}},"p2":{"name":"Zed","faction":"marvel","level":5,"weapon_class":"fists","ai":{"stance":"counter"}}}${extra}}`;

const start = (extra = ""): DuelStart => parseDuelStart(BODY(extra));

describe("duel copy", () => {
  it("names the difficulty and the Guardian", () => {
    assert.equal(duelDifficulty("epic"), "Hard");
    assert.equal(duelDifficulty("rare"), "Even");
    assert.equal(duelDifficulty("common"), "Easy");
    assert.equal(duelDifficulty("starter"), "Easy");
    assert.equal(guardianName(point({ guardian: "Final Guard" })), "Final Guard");
    assert.equal(guardianName(point()), "Keeper of Big Ben");
    assert.equal(guardianName(point({ guardian: "" })), "Keeper of Big Ben");
  });

  it("mode wins over the raid flag", () => {
    assert.equal(duelModeOf(undefined, undefined), "point");
    assert.equal(duelModeOf(undefined, true), "raid");
    assert.equal(duelModeOf("siege", false), "siege");
    assert.equal(duelModeOf("point", true), "point");
  });

  it("titles the versus card by mode", () => {
    const s = start();
    assert.equal(versusTitle({ ...s, point: { point_name: "Big Ben" } }, name), "Duel · Big Ben");
    assert.equal(versusTitle({ ...s, point: { point_name: null as unknown as string } }, name), "Duel · Quest Point");
    assert.equal(versusTitle({ ...s, point: null }, name), "Duel");
    assert.equal(versusTitle({ ...s, point: null, mode: "run" }, name), "Quest Run · fight for the point");
    const siege = { ...s, siege: { point_name: "Tower" } } as unknown as DuelStart;
    assert.equal(versusTitle(siege, name), "Siege · Tower");
    const raid = { ...s, raid: { boss_name: "Hydra" } } as unknown as DuelStart;
    assert.equal(versusTitle(raid, name), "Boss raid · Hydra");
    const inner = start(',"raid":{"boss_name":"Kraken"}');
    assert.equal(versusTitle(inner, name), "Boss raid · Kraken");
    const trial = { ...s, trial: { faction: "dc", rung: 3 } } as unknown as DuelStart;
    assert.equal(versusTitle(trial, name), "Guardian Trials · F:dc · rung 3");
  });

  it("reads the two sides", () => {
    const f = fightersOf(start());
    assert.ok(f);
    assert.equal(versusSubline(f.p1), "Level 4 · Blade · Ember");
    assert.equal(versusSubline(f.p2), "Level 5 · Fists · Counter");
    assert.equal(fightersOf({ ...start(), setup: {} }), null);
  });

  it("titles the pause page", () => {
    const s = start();
    assert.equal(pauseTitle(null), "The fight");
    assert.equal(pauseTitle({ ...s, point: { guardian: "Final Guard", point_name: "Big Ben" } }), "Final Guard");
    assert.equal(pauseTitle({ ...s, point: { point_name: "Big Ben" } }), "Big Ben");
    assert.equal(pauseTitle({ ...s, point: null }), "The fight");
    assert.equal(pausePlace({ ...s, point: { point_name: "Big Ben" } }), "Big Ben");
    assert.equal(pausePlace({ ...s, point: null }), null);
  });
});

describe("a siege fought as a duel", () => {
  it("starts with mode siege, the point and the fix", async () => {
    const calls: unknown[] = [];
    const client = {
      duelStart: async (body: unknown) => {
        calls.push(body);
        return start();
      },
    };
    const s = await siegeDuelStart(client, { id: "p9" }, { lat: 1, lng: 2, accuracy: 12 });
    assert.equal(s.duel_id, "d1");
    assert.deepEqual(calls, [{ mode: "siege", target: "p9", lat: 1, lng: 2, accuracy_m: 12 }]);
    await assert.rejects(() => siegeDuelStart(client, { id: "p9" }, null), /location/);
    assert.equal(calls.length, 1);
    // battle-3d-only: the 3D fight is asked for, or the 2D fallback is said
    await siegeDuelStart(client, { id: "p9" }, { lat: 1, lng: 2, accuracy: 12 }, { fight3d: true });
    await siegeDuelStart(client, { id: "p9" }, { lat: 1, lng: 2, accuracy: 12 }, { fallback2d: true });
    assert.deepEqual(calls.slice(1), [
      { mode: "siege", target: "p9", lat: 1, lng: 2, accuracy_m: 12, fight3d: true },
      { mode: "siege", target: "p9", lat: 1, lng: 2, accuracy_m: 12, fallback2d: true },
    ]);
  });
});

describe("DuelSFX", () => {
  it("maps the scene's cues like DuelSFX.play", () => {
    assert.deepEqual(cueFor("KO"), { sound: "fanfare", haptic: "success" });
    assert.deepEqual(cueFor("victory"), { sound: "fanfare", haptic: "success" });
    assert.deepEqual(cueFor("special_cast"), { sound: "whoosh", haptic: "heavy" });
    assert.deepEqual(cueFor("hit_heavy"), { sound: "hit", haptic: "heavy" });
    assert.deepEqual(cueFor("guard_break"), { sound: "hit", haptic: "heavy" });
    assert.deepEqual(cueFor("hit"), { sound: "hit", haptic: "medium" });
    assert.deepEqual(cueFor("block"), { sound: "tap", haptic: "light" });
    assert.deepEqual(cueFor("dash"), { sound: "whoosh", haptic: null });
    assert.deepEqual(cueFor("swing_a"), { sound: "whoosh", haptic: null });
    assert.deepEqual(cueFor("defeat"), { sound: null, haptic: "error" });
    assert.deepEqual(cueFor("ui_click"), { sound: "tap", haptic: null });
  });

  it("plays the same at the sim's events", () => {
    assert.equal(cueForSimEvent(DuelEventType.Hit, 4).haptic, "medium");
    assert.equal(cueForSimEvent(DuelEventType.Hit, 9).haptic, "heavy");
    assert.equal(cueForSimEvent(DuelEventType.Hit, undefined).haptic, "medium");
    assert.equal(cueForSimEvent(DuelEventType.Blocked, 9).haptic, "light");
    assert.equal(cueForSimEvent(DuelEventType.GuardBreak, 0).haptic, "heavy");
    assert.equal(cueForSimEvent(DuelEventType.SpecialStart, 0).haptic, "heavy");
    assert.deepEqual(cueForSimEvent(DuelEventType.KO, 0), { sound: "fanfare", haptic: "success" });
    assert.deepEqual(cueForSimEvent(DuelEventType.DashStart, 0), { sound: "whoosh", haptic: null });
    assert.deepEqual(cueForSimEvent(DuelEventType.Telegraph, 0), { sound: null, haptic: null });
    assert.deepEqual(cueForSimEvent(DuelEventType.Timeout, 0), { sound: null, haptic: null });
  });

  it("the server's verdict decides the verdict haptic", () => {
    assert.deepEqual(verdictCue("won"), { sound: "fanfare", haptic: "success" });
    assert.deepEqual(verdictCue("lost"), { sound: null, haptic: "error" });
    assert.deepEqual(verdictCue("held"), { sound: null, haptic: null });
  });
});

describe("the result", () => {
  const out = (o: Record<string, unknown>) => asFull({ duel_id: "d1", mode: "point", status: "won", ...o } as DuelOutcome);

  it("titles by status", () => {
    assert.equal(resultTitle("won"), "VICTORY");
    assert.equal(resultTitle("lost"), "DEFEAT");
    assert.equal(resultTitle("held"), "CHECKING");
    assert.equal(resultTitle("whatever"), "DEFEAT");
  });

  it("words the subtitle by mode", () => {
    const s = { ...start(), point: { point_name: "Big Ben", guardian: "Final Guard" } };
    assert.equal(resultSubtitle(out({}), s, name), "Final Guard is beaten. Big Ben answers to your faction.");
    assert.equal(resultSubtitle(out({ status: "lost" }), s, name), "Final Guard holds Big Ben. It rests for 10 minutes, then you can go again.");
    assert.equal(resultSubtitle(out({ status: "lost" }), null, name), "Its Guardian holds this place. It rests for 10 minutes, then you can go again.");
    assert.equal(resultSubtitle(out({ status: "held" }), s, name), "Result on its way. We are confirming the score.");
    // The server's held message reads as an accusation: the client's own words win.
    assert.equal(resultSubtitle(out({ status: "held", message: "This fight is being checked. If it was fair, it will count." }), s, name), HELD_LINE);
    assert.equal(resultSubtitle(out({ mode: "run" }), s, name), "Point taken at full value.");
    assert.equal(resultSubtitle(out({ mode: "run", status: "lost" }), s, name), "The Guardian held, but every hit still scored.");
    assert.equal(resultSubtitle(out({ mode: "raid", raid: { defeated: true } }), s, name), "The boss is down. Everyone who landed a hit is paid.");
    assert.equal(resultSubtitle(out({ mode: "raid" }), s, name), "Every hit you landed counts toward the crew's. Bring The boss down before it leaves.");
    assert.equal(resultSubtitle(out({ mode: "siege", siege: { point_name: "Tower" } }), s, name), "Tower is yours. Your faction holds it now.");
    assert.equal(resultSubtitle(out({ mode: "siege", status: "lost", siege: { point_name: "Tower" } }), s, name), "Tower stands. Its Guardian is on guard for 10 minutes.");
    assert.equal(resultSubtitle(out({ mode: "siege" }), s, name), null);
    const trial = { faction: "dc", rung: 2, cleared: 2, rungs: 8, name: "Bat", first_clear: true };
    assert.equal(resultSubtitle(out({ mode: "trial", trial, reward: { xp: 5 } }), s, name), "F:dc Trials · 2 of 8 cleared.");
    assert.equal(resultSubtitle(out({ mode: "trial", trial: { ...trial, first_clear: false } }), s, name), "F:dc Trials · rung 2 beaten again.");
    assert.equal(resultSubtitle(out({ mode: "trial", status: "lost", trial }), s, name), "Bat holds rung 2. Study it and go again.");
  });

  it("rounds the HP card", () => {
    assert.deepEqual(hpShare(50, 200), { share: 0.25, percent: 25 });
    assert.deepEqual(hpShare(-5, 100), { share: 0, percent: 0 });
    assert.deepEqual(hpShare(5, 0), { share: 5, percent: 500 });
    assert.equal(hpShare(1, 3).percent, 33);
  });

  it("labels the HP card: what the bars are, whose row is yours, how long it took", () => {
    assert.equal(HP_CARD_TITLE, "Health left");
    assert.equal(hpRowName("ada", true), "ada (you)");
    assert.equal(hpRowName("Keeper", false), "Keeper");
    assert.equal(hpPercentText(0), "0% health");
    assert.equal(fightTimeText(2700), "Fight time 45 s");
    assert.equal(fightTimeText(-3), "Fight time 0 s");
  });

  it("finds the pay, wherever the verdict puts it", () => {
    assert.deepEqual(payOf(out({ reward: { xp: 40, faction_points: 3 } })), { xp: 40, faction_points: 3 });
    assert.deepEqual(payOf(out({ point: { reward: { xp: 9 } } })), { xp: 9 });
    assert.deepEqual(payOf(out({ raid: { reward: { faction_points: 2 } } })), { faction_points: 2 });
    assert.equal(payOf(out({})), null);
    assert.equal(payIsEmpty(null), true);
    assert.equal(payIsEmpty({ xp: 0, faction_points: 0 }), true);
    assert.equal(payIsEmpty({ xp: 0, faction_points: 1 }), false);
  });

  it("finds the Relic drop and the extras", () => {
    const relic = { id: "r", name: "Ember", faction: "dc", rarity: "rare", kind: "sword", power: 3, ability: "cleave" };
    const drop = { kind: "relic", title: "Ember", relic, new: true };
    assert.equal(dropOf(out({ point: { extras: [{ kind: "codex", title: "Card" }, drop] } }))?.relic?.name, "Ember");
    assert.equal(dropOf(out({ reward: { relic: drop } }))?.relic?.name, "Ember");
    assert.equal(dropOf(out({ reward: { extras: [drop] } }))?.relic?.name, "Ember");
    assert.equal(dropOf(out({})), null);
    assert.deepEqual(
      extraLines(out({ point: { extras: [{ kind: "codex", title: "Card", subtitle: "Foil" }, { kind: "hold", title: "Held" }, drop] } })),
      ["Card · Foil", "Held"],
    );
  });

  it("labels the way back and the banner after it", () => {
    assert.equal(backLabel({ mode: "run" }), "Back to the run");
    assert.equal(backLabel({ mode: "point" }), "Back to the map");
    assert.deepEqual(bannerAfter(out({}), "point", "Big Ben"), { title: "Guardian beaten!", subtitle: "Big Ben" });
    assert.deepEqual(bannerAfter(out({ mode: "siege" }), "siege", "Tower"), { title: "Taken!", subtitle: "Tower" });
    assert.equal(bannerAfter(out({ status: "lost" }), "point", "Big Ben"), null);
    assert.equal(bannerAfter(out({ status: "held" }), "siege", "Tower"), null);
    assert.equal(bannerAfter(null, "point", "Big Ben"), null);
    assert.deepEqual(bannerAfter(out({ mode: "raid", raid: { defeated: true } }), "raid", "Hydra"), { title: "Boss defeated!", subtitle: "Hydra" });
    assert.equal(bannerAfter(out({ mode: "raid" }), "raid", "Hydra"), null);
  });
});

import { hasTrials, trialAgainLabel, trialPoint, trialsOrder, trialTarget } from "../duelFlow.ts";

describe("guardian trials", () => {
  it("targets the next rung or a replay", () => {
    assert.equal(trialTarget({ faction: "anime", rung: null }), "anime");
    assert.equal(trialTarget({ faction: "anime", rung: 3 }), "anime:3");
  });
  it("orders the ladders by the server's factions", () => {
    const t = { zeta: { cleared: 0, rungs: 8 }, dc: { cleared: 1, rungs: 8 }, anime: { cleared: 0, rungs: 8 } };
    assert.deepEqual(trialsOrder(t, ["anime", "marvel", "dc"]), ["anime", "dc", "zeta"]);
    assert.deepEqual(trialsOrder(null, ["anime"]), []);
  });
  it("offers the next fight", () => {
    assert.equal(trialAgainLabel({ status: "won", mode: "trial" }, { cleared: 2, rungs: 8, next: { rung: 3, name: "X", level: 4 } }), "Next rung");
    assert.equal(trialAgainLabel({ status: "won", mode: "trial" }, { cleared: 8, rungs: 8, next: null }), null);
    assert.equal(trialAgainLabel({ status: "lost", mode: "trial" }, null), "Try again");
    assert.equal(trialAgainLabel({ status: "won", mode: "point" }, null), null);
  });
  it("stands a point in for the fight", () => {
    const p = trialPoint({ faction: "dc", rung: null }, "DC", { cleared: 1, rungs: 8, next: { rung: 2, name: "Gotham Warden", level: 3 } });
    assert.equal(p.realm, "dc");
    assert.equal(p.name, "DC Trials");
    assert.equal(p.extra?.guardian, "Gotham Warden");
    assert.equal(hasTrials({ features: { duel: {} } } as never), true);
    assert.equal(hasTrials(null), false);
  });
});

import { stanceLead, stanceName, STANCES } from "../duelFlow.ts";

describe("guardian stance", () => {
  it("names the stances and says when the faction's default is in use", () => {
    assert.deepEqual(STANCES.map((s) => s.id), ["aggressive", "counter", "turtle"]);
    assert.equal(stanceName("counter"), "Counter");
    assert.equal(stanceName(null), "Default");
    assert.ok(stanceLead(true, false).endsWith("Your faction's default for now."));
    assert.ok(!stanceLead(true, true).includes("default"));
  });
});


