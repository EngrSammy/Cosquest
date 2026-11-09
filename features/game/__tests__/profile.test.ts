// The hero screen's numbers and the profile as the server writes it (ProfileView.swift).
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GameClient } from "../client.ts";
import { Identity } from "../identity.ts";
import {
  avatarMark,
  avatarShape,
  cleanHandle,
  fetchProfileFull,
  heroPower,
  heroTitle,
  parseProfileFull,
  placed,
  safeTint,
  statBars,
  validHandle,
  wallSubtitle,
  xpToNext,
} from "../profile.ts";
import type { RoamMe } from "../wire.ts";

const me = (patch: Partial<RoamMe> = {}): RoamMe =>
  ({
    device_key: "k",
    faction: "marvel",
    faction_name: "Marvel",
    standing: { level: 5, rank: "Scout", xp: 100, level_floor_xp: 80, next_level_xp: 140, into_level: 20, level_span: 60, max_level: false },
    coins: 3,
    faction_points: 7,
    streak: { days: 2, best: 6, played_today: true },
    tutorial_done: true,
    dailies: [],
    day: "d",
    today: { points_played: 4, correct: 3, xp: 90 },
    features: { relics: { equipped: { id: "r", name: "Blade", faction: "marvel", rarity: "rare", kind: "blade", power: 14, ability: "x", power_now: 15, level: 2 } } },
    ...patch,
  }) as RoamMe;

describe("profile: hero", () => {
  it("weighs level, the Relic and the best streak", () => {
    assert.equal(heroPower(me()), 5 * 12 + 75 + 12);
    assert.equal(heroPower(me({ features: null })), 5 * 12 + 12);
    assert.equal(heroPower(null), 0);
  });
  it("titles the hero by rank and house", () => {
    assert.equal(heroTitle(me()), "SCOUT OF HOUSE MARVEL");
    assert.equal(heroTitle(me({ faction_name: null, faction: "dc" })), "SCOUT OF HOUSE DC");
    assert.equal(heroTitle(me({ faction: null, faction_name: null })), "SCOUT");
    assert.equal(heroTitle(null), "A NEW HERO");
  });
  it("draws four bars", () => {
    const bars = statBars(me());
    assert.deepEqual(bars.map((b) => b.name), ["Level 5", "Relic power", "Accuracy today", "Best streak"]);
    assert.equal(bars[0].value, "20");
    assert.equal(bars[0].extra, "/60 XP");
    assert.ok(Math.abs(bars[0].progress - 1 / 3) < 1e-9);
    assert.equal(bars[1].value, "15");
    assert.equal(bars[1].extra, "Lv 2");
    assert.equal(bars[2].value, "75%");
    assert.equal(bars[3].extra, "days");
    const bare = statBars(me({ features: null, today: null }));
    assert.equal(bare[1].value, "-");
    assert.equal(bare[2].value, "-");
    assert.equal(bare[2].progress, 0);
    const max = statBars(me({ standing: { ...me().standing, max_level: true } }));
    assert.equal(max[0].value, "MAX");
    assert.equal(max[0].progress, 1);
  });
  it("says how far to the next level", () => {
    assert.equal(xpToNext(me()), "40 XP to level 6");
    assert.equal(xpToNext(me({ standing: { ...me().standing, max_level: true } })), "Top level. Legend.");
  });
  it("says 1st, 2nd, 3rd, 11th, 21st", () => {
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(placed), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th"]);
  });
});

describe("profile: avatar and name", () => {
  it("wraps face and mark like the Swift modulo", () => {
    assert.equal(avatarShape(0), "circle");
    assert.equal(avatarShape(2), "diamond");
    assert.equal(avatarShape(-3), "hexagon");
    assert.equal(avatarShape(5), "square");
    assert.equal(avatarMark(0), "flame");
    assert.equal(avatarMark(9), "flash");
    assert.equal(safeTint("nope"), "#E8B33A");
    assert.equal(safeTint("#3FA7D6"), "#3FA7D6");
  });
  it("needs two letters and keeps 24", () => {
    assert.equal(validHandle(" a "), false);
    assert.equal(validHandle("Ada"), true);
    assert.equal(cleanHandle("  " + "x".repeat(40)).length, 24);
  });
});

describe("profile: the wire", () => {
  it("reads wall and in-progress, dropping what it cannot use", () => {
    const p = parseProfileFull({
      device_key: "k",
      handle: "Ada",
      avatar: { face: 2, mark: 3, tint: "#59C28B" },
      games_played: 4,
      games_won: 1,
      tokens_total: 90,
      prizes_cents: 1250,
      wall: [{ game_id: "g1", title: "Night", faction: "dc", tokens: 5, placing: 1, prize_cents: 500, currency: "USD", at: "x" }, { title: "no id" }],
      in_progress: [{ game_id: "g2", title: "Now", tokens: 2, status: "live" }, null],
    });
    assert.equal(p.wall.length, 1);
    assert.equal(p.wall[0].placing, 1);
    assert.equal(wallSubtitle(p.wall[0]), "5 tokens · Dc");
    assert.equal(p.in_progress.length, 1);
    assert.deepEqual(p.avatar, { face: 2, mark: 3, tint: "#59C28B" });
    const bare = parseProfileFull(null);
    assert.equal(bare.games_played, 0);
    assert.deepEqual(bare.avatar, { face: 0, mark: 0, tint: "#E8B33A" });
  });
  it("treats a 404 as a player with no profile yet", async () => {
    const seen: string[] = [];
    const fetch = async (url: string) => {
      seen.push(url);
      return { ok: false, status: 404, text: async () => JSON.stringify({ detail: "Not Found" }) };
    };
    const client = new GameClient({ baseUrl: "https://x.test", identity: () => new Identity("33".repeat(32), "device"), fetch });
    assert.equal(await fetchProfileFull(client), null);
    assert.match(seen[0], /\/v1\/profile\/[0-9a-f]{64}$/);
  });
});
