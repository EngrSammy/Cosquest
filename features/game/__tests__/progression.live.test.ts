// Progression and the trivia tests against the real STAGING game server: a
// throwaway player reads the ladder, picks a faction, sits the entry test
// (answering blind, so it may pass or fail), and reads the season and event
// friends. Each part is skipped in words when its feature is off on staging.
// Only calls a normal player makes. Never production. Off unless asked for:
//
//   CQ_LIVE_STAGING=1 node --test features/game/__tests__/progression.live.test.ts
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { GameClient } from "../client.ts";
import { STAGING_GAME_SERVER } from "../config.ts";
import { Identity } from "../identity.ts";
import {
  fetchConfig,
  fetchEventConnections,
  fetchMe,
  fetchSeasonMe,
  fetchTestsStatus,
  isFeatureOff,
  joinFaction,
  startTest,
  submitTest,
} from "../progression.ts";

const live = process.env.CQ_LIVE_STAGING === "1";

async function orOff<T>(work: Promise<T>): Promise<T | "off"> {
  try {
    return await work;
  } catch (e) {
    if (isFeatureOff(e)) return "off";
    throw e;
  }
}

describe("progression on staging (live)", { skip: !live && "set CQ_LIVE_STAGING=1" }, () => {
  const id = new Identity(randomBytes(32).toString("hex"), "device");
  const c = new GameClient({ baseUrl: STAGING_GAME_SERVER, identity: () => id });

  it("ladder, entry test, season, event friends", { timeout: 90000 }, async () => {
    assert.match(c.baseUrl, /staging/);
    await c.saveProfile("TS Ranks", { face: 3, mark: 1, tint: "#F59E2A" });
    await c.roamMe();

    const faction = "ascendants";
    const status = await orOff(fetchTestsStatus(c, faction));
    if (status === "off") {
      console.log("[live progression] trivia_banks is OFF on staging");
    } else {
      console.log(`[live progression] entry: can_start=${status.entry.can_start} questions=${status.entry.questions} mark=${status.entry.pass_mark}`);
      assert.equal(status.entry.passed, false);
    }

    const config = await orOff(fetchConfig(c));
    if (config === "off") {
      console.log("[live progression] progression is OFF on staging");
    } else {
      assert.equal(config.ranks.length, 10);
      assert.equal(config.factions.length >= 6, true);
      console.log(`[live progression] ${config.factions.length} factions, ${config.weapons.length} weapons, purchase_mode=${config.rules?.purchase_mode}`);
      const joined = await joinFaction(c, faction);
      console.log(`[live progression] join: ${joined.status}`);
      const me = await fetchMe(c);
      assert.equal(me.pending?.faction ?? me.faction, faction);
    }

    if (status !== "off") {
      const paper = await startTest(c, faction, "entry");
      assert.equal(paper.questions.length > 0, true);
      assert.equal(paper.questions[0].choices.length, 4);
      const again = await startTest(c, faction, "entry");
      assert.equal(again.test_id, paper.test_id, "asking again resumes the same paper");
      const result = await submitTest(c, paper.test_id, paper.questions.map(() => 0));
      console.log(`[live progression] entry test: passed=${result.passed} ${result.correct}/${result.total} score=${result.score} xp=${result.xp.total}`);
      assert.equal(result.results.length, paper.questions.length);
    }

    const season = await orOff(fetchSeasonMe(c));
    console.log(`[live progression] season: ${season === "off" ? "OFF" : `${season.season?.name ?? "none running"} xp=${season.season_xp}`}`);
    const friends = await orOff(fetchEventConnections(c));
    console.log(`[live progression] event friends: ${friends === "off" ? "OFF" : `${friends.length}`}`);
  });
});
