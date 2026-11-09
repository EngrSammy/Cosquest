import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  buildFightConfig,
  tilesFields,
  FIGHT3D_NOTE,
  fight3dFlags,
  fightLod,
  godotArgs,
  localPath,
  opponentIndex,
  parseFightResult,
  parseMode,
  parseStatus,
  pickAlly,
  pickCast,
  pickOpponent,
  quitResult,
  wornAvatarId,
  rewardFrom3D,
  runFromParams,
  lookFromParam,
} from "../fight3d.ts";

const android = { os: "android", version: 35 };

test("the flag is off unless EXPO_PUBLIC_GAME3D=1, and off below Android 10 and on the web", () => {
  // On by default (battle-3d-only): every build has the 3D fight unless built with EXPO_PUBLIC_GAME3D=0.
  assert.equal(fight3dFlags({}, android).on, true);
  assert.equal(fight3dFlags({ EXPO_PUBLIC_GAME3D: "0" }, android).on, false);
  assert.equal(fight3dFlags({ EXPO_PUBLIC_GAME3D: "1" }, android).on, true);
  assert.equal(fight3dFlags({ EXPO_PUBLIC_GAME3D: "1" }, { os: "android", version: 28 }).on, false);
  assert.equal(fight3dFlags({ EXPO_PUBLIC_GAME3D: "1" }, { os: "ios", version: "18.0" }).on, true);
  assert.equal(fight3dFlags({ EXPO_PUBLIC_GAME3D: "1" }, { os: "web", version: 0 }).on, false);
});

test("knobs: keep, autostart, cycle, lod; autostart and cycle need the flag", () => {
  const f = fight3dFlags(
    { EXPO_PUBLIC_GAME3D: "1", EXPO_PUBLIC_GODOT_KEEP: "1", EXPO_PUBLIC_GAME3D_AUTOSTART: "arena", EXPO_PUBLIC_GAME3D_CYCLE: "10", EXPO_PUBLIC_GAME3D_CYCLE_MS: "5000", EXPO_PUBLIC_GAME3D_LOD: "2" },
    android,
  );
  assert.deepEqual(
    { keep: f.keep, autostart: f.autostart, cycle: f.cycle, cycleMs: f.cycleMs, lod: f.lod },
    { keep: true, autostart: "arena", cycle: 10, cycleMs: 5000, lod: 2 },
  );
  const off = fight3dFlags({ EXPO_PUBLIC_GAME3D: "0", EXPO_PUBLIC_GAME3D_AUTOSTART: "arena", EXPO_PUBLIC_GAME3D_CYCLE: "10" }, android);
  assert.equal(off.autostart, null);
  assert.equal(off.cycle, 0);
  const d = fight3dFlags({ EXPO_PUBLIC_GAME3D: "1", EXPO_PUBLIC_GAME3D_AUTOSTART: "bogus", EXPO_PUBLIC_GAME3D_CYCLE: "x" }, android);
  assert.deepEqual({ keep: d.keep, autostart: d.autostart, cycle: d.cycle, cycleMs: d.cycleMs, lod: d.lod }, { keep: true, autostart: null, cycle: 0, cycleMs: 8000, lod: null });
  assert.equal(parseMode("chars"), "chars");
  assert.equal(parseMode("CHARS"), null);
});

test("the test link's parameters, with the build's knobs as defaults", () => {
  const flags = fight3dFlags({ EXPO_PUBLIC_GAME3D: "1" }, android);
  assert.deepEqual(runFromParams({ mode: "arena", cycle: "10", ms: "6000" }, flags), { mode: "arena", cycle: 10, cycleMs: 6000, autoplay: true });
  assert.deepEqual(runFromParams({}, flags), { mode: "full", cycle: 0, cycleMs: 8000, autoplay: false });
  assert.deepEqual(runFromParams({ mode: ["chars"], autoplay: "0", cycle: "3" }, flags), { mode: "chars", cycle: 3, cycleMs: 8000, autoplay: false });
});

test("the test link's look switches: words on, a leading minus off, junk dropped", () => {
  assert.deepEqual(lookFromParam("post"), { post: true });
  assert.deepEqual(lookFromParam("glow,grade"), { glow: true, grade: true });
  assert.deepEqual(lookFromParam(" -bloom , fog"), { bloom: false, fog: true });
  assert.equal(lookFromParam(undefined), null);
  assert.equal(lookFromParam(""), null);
  assert.equal(lookFromParam("<x>,1,"), null);
});

test("LOD 1 on low and mid phones (the emulator), 0 on high ones, the knob wins", () => {
  assert.equal(fightLod("low", null), 1);
  assert.equal(fightLod("mid", null), 1);
  assert.equal(fightLod("high", null), 0);
  assert.equal(fightLod("high", 2), 2);
});

test("the opponent pick is the game server's (roam_forge.opponent_character)", () => {
  // Python: int(sha256("forge-opponent|guardian|P1".encode()).hexdigest()[:12], 16) % n
  const expect = (role: string, key: string, n: number) => parseInt(createHash("sha256").update(`forge-opponent|${role}|${key}`).digest("hex").slice(0, 12), 16) % n;
  for (const key of ["P1", "W0123456789abcdef", "trial:red:3"]) {
    for (const n of [1, 2, 3, 7]) assert.equal(opponentIndex("guardian", key, n), expect("guardian", key, n));
  }
  assert.equal(opponentIndex("boss", "x", 0), -1);
});

const ch = (id: string, name: string, role: string | null, avatar = false) => ({ id, name, type: "character", gameplay: { role, avatar } });
const entries = [
  ch("c-3", "Old Samurai", "guardian"),
  ch("a-1", "Armstrong", "hero", true),
  ch("b-2", "Street Kid", "hero", true),
  ch("d-4", "Knight Woman", "guardian"),
  ch("e-5", "Big Boss", "boss"),
  { id: "w-1", name: "Axe", type: "weapon", gameplay: {} },
];

test("guardians are ordered by id before the pick; bosses for raids", () => {
  const g = pickOpponent(entries, "guardian", "P1");
  const ids = ["c-3", "d-4"];
  assert.equal(g?.id, ids[opponentIndex("guardian", "P1", 2)]);
  assert.equal(pickOpponent(entries, "boss", "R1")?.id, "e-5");
  assert.equal(pickOpponent([], "guardian", "P1"), null);
});

test("the ally is another hero, by name; the cast prefers the duel's own opponent", () => {
  assert.equal(pickAlly(entries, "a-1")?.id, "b-2");
  assert.equal(pickAlly(entries, "b-2")?.id, "a-1");
  assert.equal(pickAlly(entries, null)?.id, "a-1");
  const cast = pickCast(entries, { avatarId: "a-1", enemyId: "d-4", role: "guardian", key: "P1" });
  assert.deepEqual([cast.hero?.id, cast.ally?.id, cast.enemy?.id], ["a-1", "b-2", "d-4"]);
  const none = pickCast([], { avatarId: "a-1", role: "guardian", key: null });
  assert.deepEqual([none.hero, none.ally, none.enemy], [null, null, null]);
  // A weapon id is not a character: you fight as the first hero by name instead.
  const weapon = pickCast(entries, { avatarId: "w-1", role: "guardian", key: null });
  assert.deepEqual([weapon.hero?.id, weapon.ally?.id], ["a-1", "b-2"]);
  // Nothing worn (a new player): the first hero, never the placeholder capsule.
  const fresh = pickCast(entries, { avatarId: null, role: "guardian", key: null });
  assert.deepEqual([fresh.hero?.id, fresh.ally?.id], ["a-1", "b-2"]);
});

test("the fight casts the hero you wear, not the first one (cq 076)", () => {
  const me = (avatar: string | null) => ({ equipped: { avatar } });
  // Wearing the second hero by name: you are it, the first is your ally.
  const worn = pickCast(entries, { avatarId: wornAvatarId({ equipped: { avatar: "b-2" } }, me(null)), role: "guardian", key: null });
  assert.deepEqual([worn.hero?.id, worn.ally?.id], ["b-2", "a-1"]);
  // The bag is the truth once loaded, even "none" after Take off (a stale /me does not win).
  assert.equal(wornAvatarId({ equipped: { avatar: null } }, me("b-2")), null);
  assert.equal(wornAvatarId({ equipped: { avatar: "a-1" } }, me("b-2")), "a-1");
  // Before the bag loads, /me's block.
  assert.equal(wornAvatarId(null, me("b-2")), "b-2");
  assert.equal(wornAvatarId(undefined, me(null)), null);
});

test("file URIs become absolute paths; anything else is empty", () => {
  assert.equal(localPath("file:///data/user/0/com.x/cache/forge/a%20b/1/m.glb"), "/data/user/0/com.x/cache/forge/a b/1/m.glb");
  assert.equal(localPath("/abs/path.glb"), "/abs/path.glb");
  assert.equal(localPath("https://x/y.glb"), "");
  assert.equal(localPath("relative.glb"), "");
  assert.equal(localPath(null), "");
});

test("the config Godot gets: paths, names with fallbacks, 45 s, a squad of 2 (you and the AI ally)", () => {
  const c = buildFightConfig({
    hero: { path: "file:///c/hero.glb", name: "Ada" },
    ally: { path: null, name: null },
    enemy: { path: "file:///c/g.glb", name: "  " },
    pointName: "Trafalgar",
    mode: "full",
    seed: -42.7,
    autoplay: false,
  });
  assert.deepEqual(c, {
    hero_glb: "/c/hero.glb",
    ally_glb: "",
    enemy_glb: "/c/g.glb",
    hero_name: "Ada",
    ally_name: "Ally",
    enemy_name: "Guardian",
    duration_s: 45,
    players_text: "2/2",
    point_name: "Trafalgar",
    mode: "full",
    seed: 42,
    autoplay: false,
    haptics: true,
  });
  assert.equal(buildFightConfig({ hero: { path: null, name: null }, ally: { path: null, name: null }, enemy: { path: null, name: null }, pointName: "p", mode: "arena", seed: 1, autoplay: true, tilesUrl: "https://t/{z}/{x}/{y}.png" }).tiles_url, "https://t/{z}/{x}/{y}.png");
  // JSON round trip (what start_fight receives).
  assert.equal(JSON.parse(JSON.stringify(c)).hero_glb, "/c/hero.glb");
  // Reduce motion (cq 013): sent only when the setting is on.
  assert.equal("reduce_motion" in c, false);
  assert.equal(buildFightConfig({ hero: { path: null, name: null }, ally: { path: null, name: null }, enemy: { path: null, name: null }, pointName: "p", mode: "full", seed: 1, autoplay: false, reduceMotion: true }).reduce_motion, true);
});

test("Godot's arguments: the asset folder on Android, the bundle's pack on iOS", () => {
  assert.deepEqual(godotArgs("android"), ["--path", "/game3d", "--rendering-driver", "opengl3", "--rendering-method", "gl_compatibility", "--display-driver", "embedded"]);
  const ios = godotArgs("ios", { bundleDir: "file:///var/containers/Bundle/Application/X/cosquest.app/" });
  assert.deepEqual(ios.slice(0, 2), ["--main-pack", "/var/containers/Bundle/Application/X/cosquest.app/game3d.pck"]);
  assert.ok(ios.includes("embedded"));
  assert.deepEqual(godotArgs("ios", { bundleDir: "/b", iosSimulator: true }).slice(2, 6), ["--rendering-driver", "metal", "--rendering-method", "mobile"]);
});

test("the result JSON is checked and cleaned", () => {
  const r = parseFightResult(
    JSON.stringify({ outcome: "win", damage_dealt: 120.6, damage_taken: "40", time_s: 31.26, hits: 9, skill_uses: 2, enemy_hp_left: 0, hero_hp_left: -5, mode: "full" }),
  );
  assert.deepEqual(r, { outcome: "win", damage_dealt: 121, damage_taken: 40, time_s: 31.3, hits: 9, skill_uses: 2, enemy_hp_left: 0, hero_hp_left: 0, mode: "full", record: null });
  assert.equal(parseFightResult({ outcome: "TIMEOUT" })?.outcome, "timeout");
  assert.equal(parseFightResult({ outcome: "draw" }), null);
  assert.equal(parseFightResult("not json"), null);
  assert.equal(parseFightResult("[]"), null);
  assert.equal(parseFightResult(null), null);
  assert.equal(quitResult("arena", 3).outcome, "quit");
});

test("the status JSON's state", () => {
  assert.equal(parseStatus('{"state":"fighting","t":3}')?.state, "fighting");
  assert.equal(parseStatus("{}"), null);
  assert.equal(parseStatus(null), null);
  assert.equal(parseStatus("oops"), null);
});

test("the reward for a 3D fight: Godot's numbers, no pay, and it says so", () => {
  const standing = { level: 4, rank: "Scout", xp: 300, level_floor_xp: 250, next_level_xp: 400, into_level: 50, level_span: 150, max_level: false };
  const win = rewardFrom3D({ outcome: "win", damage_dealt: 121, damage_taken: 40, time_s: 31.3, hits: 9, skill_uses: 2, enemy_hp_left: 0, hero_hp_left: 60, mode: "full", record: null }, { name: "Trafalgar", realm: "fantasy" }, standing);
  assert.equal(win.win, true);
  assert.equal(win.headline, "Guardian down!");
  assert.deepEqual([win.xp, win.coins, win.factionPoints, win.lines.length, win.leveledUp], [0, 0, 0, 0, false]);
  assert.equal(win.before, standing);
  assert.equal(win.after, standing);
  assert.equal(win.note, FIGHT3D_NOTE);
  assert.equal(win.practice, true);
  // The test arena's fight was never sent to the server; nothing calls it practice (battle-3d-only).
  assert.match(FIGHT3D_NOTE, /not sent to the game server/);
  assert.doesNotMatch(FIGHT3D_NOTE, /practice/i);
  assert.deepEqual(
    win.stats?.map((s) => [s.id, s.value]),
    [
      ["outcome", "Guardian down!"],
      ["damage-dealt", "121"],
      ["damage-taken", "40"],
      ["time", "31 s"],
    ],
  );
  const lose = rewardFrom3D({ ...quitResult("full"), outcome: "lose", time_s: 75 }, { name: "P", realm: "r" }, null);
  assert.equal(lose.win, false);
  assert.equal(lose.headline, "The Guardian held");
  assert.equal(lose.stats?.find((s) => s.id === "time")?.value, "1:15");
  assert.equal(rewardFrom3D(quitResult("full"), { name: "P", realm: "r" }, null).headline, "You left the fight");
});

test("tilesFields: a #lat,lon,alt fragment places the arena; the URL loses it", () => {
  assert.deepEqual(tilesFields("http://127.0.0.1:8700/dingo_georef.json#40.04253061,-75.61209431,0"), {
    tiles_url: "http://127.0.0.1:8700/dingo_georef.json",
    tiles_lat: 40.04253061,
    tiles_lon: -75.61209431,
    tiles_alt: 0,
  });
  assert.deepEqual(tilesFields("http://h/t.json"), { tiles_url: "http://h/t.json" });
  assert.deepEqual(tilesFields("http://h/t.json#nope"), { tiles_url: "http://h/t.json" });
  assert.deepEqual(tilesFields("http://h/t.json#95,0"), { tiles_url: "http://h/t.json" });
});

test("tilesFields: ground and detail knobs", () => {
  assert.deepEqual(tilesFields("http://h/t.json#40,-75,490,0,64"), {
    tiles_url: "http://h/t.json",
    tiles_lat: 40,
    tiles_lon: -75,
    tiles_alt: 490,
    tiles_ground: false,
    tiles_sse: 64,
  });
});

// ---------- the judged 3D fight (cq 019): the server sets it up, judges its record and pays ----------

import { fightCard, fightFromStart, finishFrom3D, fightSeed, fightStats } from "../fight3d.ts";

const judgeLog = { v: 1, rules: "f3d-1-21d2cde61ab2", seed: 233, hits: [[57, 57, 2, 1, 66, 66, 0]], casts: [], heals: [], staggers: [], presses: [], guards: [] };
const godotWin = { outcome: "win", damage_dealt: 6164, damage_taken: 285, time_s: 21.57, hits: 47, skill_uses: 9, enemy_hp_left: 0, hero_hp_left: 715, mode: "full", ally_damage: 511, crits: 9, parries: 2, skills: [3, 3, 3, 0, 0], judge: judgeLog };

test("the fight's whole record rides along when Godot sends one, and only then", () => {
  const r = parseFightResult(JSON.stringify(godotWin));
  assert.ok(r);
  assert.deepEqual(r.record, godotWin);
  assert.equal(parseFightResult({ ...godotWin, judge: undefined })?.record, null);
  assert.equal(parseFightResult({ ...godotWin, judge: [1, 2] })?.record, null);
  assert.equal(quitResult("full").record, null);
});

test("the seed Godot fights on is the duel's exact seed folded to 31 bits (the server's fight_seed)", () => {
  assert.equal(fightSeed("239"), 239);
  // 2**62 - 1, past what a JS number holds exactly: the digits, not the lossy number, are folded.
  assert.equal(fightSeed("4611686018427387903"), Number(4611686018427387903n % 2147483647n));
  assert.ok((fightSeed("4611686018427387903") ?? 2 ** 31) < 2 ** 31);
  assert.equal(fightSeed("-5"), 5);
  assert.equal(fightSeed("nope"), null);
  assert.equal(fightSeed(""), null);
});

test("the finish body for a judged fight is the duel's result block plus the record (the server's finish_fields)", () => {
  const r = parseFightResult(godotWin)!;
  assert.deepEqual(finishFrom3D(r), {
    result: { winner: 1, ticks: 2157, p1_hp: 715, p2_hp: 0, end_reason: "win" },
    inputs: [],
    hash: "",
    fight3d: godotWin,
  });
  const lost = finishFrom3D(parseFightResult({ ...godotWin, outcome: "timeout", enemy_hp_left: 900, time_s: 45.0 })!);
  assert.deepEqual(lost.result, { winner: 2, ticks: 4500, p1_hp: 715, p2_hp: 900, end_reason: "timeout" });
});

// ---------- every mode's fight (battle-3d-only) ----------

const start3d = (setup: Record<string, unknown>) => ({ seed_text: "4611686018427387903", setup: { kind: "fight3d", ...setup } });

test("a 3D start hands Godot its seed, round, modifiers, look and opponent", () => {
  const f = fightFromStart(
    start3d({
      duration_s: 60,
      mods: { boss_hp_permille: 1300, boss_dmg_permille: 1100 },
      guardian_look: { size_permille: 1150, title: "RAID BOSS" },
      guardian_name: "Ironhide",
      p2: { name: "Ironhide", character: { element_id: "boss-7", version: 2, name: "Ironhide" } },
    }),
  );
  assert.ok(f);
  assert.equal(f.seed, fightSeed("4611686018427387903"));
  assert.equal(f.durationS, 60);
  assert.deepEqual(f.mods, { boss_hp_permille: 1300, boss_dmg_permille: 1100 });
  assert.deepEqual(f.look, { size_permille: 1150, title: "RAID BOSS" });
  assert.equal(f.enemyId, "boss-7");
  assert.equal(f.guardianName, "Ironhide");
  // a setup stored before modifiers: the identity, the 45 s round
  const old = fightFromStart(start3d({}))!;
  assert.deepEqual(old.mods, { boss_hp_permille: 1000, boss_dmg_permille: 1000 });
  assert.equal(old.durationS, 45);
  assert.equal(old.look, null);
  // not a 3D fight (the 2D fallback), or an unreadable seed: nothing for Godot
  assert.equal(fightFromStart({ seed_text: "1", setup: { p1: { name: "a" }, p2: { name: "b" } } }), null);
  assert.equal(fightFromStart({ seed_text: "x", setup: { kind: "fight3d" } }), null);
});

test("the config carries the modifiers and look to Godot only when the server gave them", () => {
  const base = { hero: { path: null, name: null }, ally: { path: null, name: null }, enemy: { path: null, name: "Ironhide" }, pointName: "Bank", mode: "full" as const, seed: 9, autoplay: false };
  const c = buildFightConfig({ ...base, durationS: 30, mods: { boss_hp_permille: 650, boss_dmg_permille: 1000 }, guardianLook: { title: "QUEST RUN" } });
  assert.equal(c.duration_s, 30);
  assert.deepEqual(c.mods, { boss_hp_permille: 650, boss_dmg_permille: 1000 });
  assert.deepEqual(c.guardian_look, { title: "QUEST RUN" });
  const plain = buildFightConfig(base);
  assert.equal(plain.mods, undefined);
  assert.equal(plain.guardian_look, undefined);
  assert.equal(plain.duration_s, 45);
});

test("the pre-fight card says who, what kind of fight, and what it is worth, per mode", () => {
  assert.deepEqual(fightCard(start3d({ guardian_name: "Ronin of Jubilee Fountain", point: { tier: "rare" } }), "Jubilee Fountain"), {
    kicker: "RARE GUARDIAN",
    title: "Ronin of Jubilee Fountain",
    line: "Win to take Jubilee Fountain for your faction.",
  });
  assert.equal(fightCard(start3d({ guardian_name: "Ironhide", raid: { hp_left: 1500, hp_max: 6000 } }), "x").line, "Boss at 25%. Your damage goes into the crew's pool.");
  assert.equal(fightCard(start3d({ guardian_name: "Kage", trial: { rung: 3, rungs: 8, first_clear: true } }), "x").kicker, "GUARDIAN TRIAL · RUNG 3 OF 8");
  assert.match(fightCard(start3d({ guardian_name: "Kage", trial: { rung: 1, rungs: 8, first_clear: false } }), "x").line ?? "", /replay/);
  assert.equal(fightCard(start3d({ guardian_name: "Ada", siege: { faction_attacked_name: "Anime" } }), "Big Ben").line, "Beat it to take Big Ben from Anime.");
  assert.match(fightCard(start3d({ guardian_name: "G", run: { value: 400, stake: 0 } }), "x").line ?? "", /Worth 400 points/);
  // no start (the test arena)
  assert.equal(fightCard(null, "x").title, "The Guardian");
  // nothing on the card calls the fight practice
  for (const c of [fightCard(start3d({ point: { tier: "common" } }), "x"), fightCard(null, "x")]) assert.doesNotMatch(JSON.stringify(c), /practice/i);
});

// ---------- a Siege's Guardian is the holder's own hero (server siege-holder-hero) ----------

import { holderLine, possessive, siegeHolder } from "../fight3d.ts";

const holderSiege = (siege: Record<string, unknown>, p2: Record<string, unknown> = {}) =>
  start3d({
    guardian_name: "Ada",
    siege: { faction_attacked_name: "DC", ...siege },
    p2: { name: "Ada", character: { element_id: "hero-ada", version: 1, name: "Lagos Ranger", holder: true }, forge_weapon: { element_id: "sword-9", version: 1, name: "Night Sword", kind: "sword" }, ...p2 },
  });

test("a Siege against a holder's hero fights that hero with their weapon", () => {
  const f = fightFromStart(holderSiege({ holder_name: "Ada", holder_hero: true }))!;
  assert.equal(f.enemyId, "hero-ada");
  assert.equal(f.enemyWeaponId, "sword-9");
  assert.deepEqual(f.holder, { name: "Ada", hero: true });
  assert.equal(f.guardianName, "Ada");
  // the published Guardian standing in for a holder with no hero: its own weapon, not a stray one
  const g = fightFromStart(holderSiege({ holder_name: "Ada", holder_hero: false }, { character: { element_id: "guard-1" }, forge_weapon: null }))!;
  assert.equal(g.enemyId, "guard-1");
  assert.equal(g.enemyWeaponId, null);
  // any other fight: no holder, no weapon
  const p = fightFromStart(start3d({ p2: { name: "G", forge_weapon: { element_id: "w" } }, point: { tier: "rare" } }))!;
  assert.equal(p.holder, null);
  assert.equal(p.enemyWeaponId, null);
});

test("the pre-fight card says whose hero holds the point", () => {
  assert.equal(fightCard(holderSiege({ holder_name: "Ada", holder_hero: true }), "Big Ben").line, "Ada's hero holds this point. Beat it to take Big Ben from DC.");
  assert.equal(fightCard(holderSiege({ holder_name: "James", holder_hero: true }), "Big Ben").line, "James' hero holds this point. Beat it to take Big Ben from DC.");
  assert.equal(fightCard(holderSiege({ holder_name: null, holder_hero: true }), "Big Ben").line, "A rival's hero holds this point. Beat it to take Big Ben from DC.");
  // no hero: the Guardian, as before
  assert.equal(fightCard(holderSiege({ holder_name: "Ada", holder_hero: false }), "Big Ben").line, "Beat it to take Big Ben from DC.");
  assert.equal(fightCard(start3d({ guardian_name: "G", siege: { faction_attacked_name: "DC" } }), "Big Ben").line, "Beat it to take Big Ben from DC.");
});

test("the holder's name is read with care", () => {
  assert.deepEqual(siegeHolder(holderSiege({ holder_name: "  Ada  ", holder_hero: true })), { name: "Ada", hero: true });
  assert.deepEqual(siegeHolder(holderSiege({ holder_name: 7, holder_hero: "yes" })), { name: null, hero: false });
  assert.equal(siegeHolder(start3d({ siege: { faction_attacked_name: "DC" } })), null);
  assert.equal(siegeHolder(null), null);
  assert.equal(holderLine(holderSiege({ holder_name: "x".repeat(80), holder_hero: true }))?.length, 40 + "'s hero holds this point".length);
  assert.equal(possessive("Ada"), "Ada's");
  assert.equal(possessive("Chris"), "Chris'");
});

test("the fight's own numbers are rows on any reward screen", () => {
  const r = parseFightResult(godotWin)!;
  assert.deepEqual(
    fightStats(r).map((s) => [s.id, s.value]),
    [
      ["outcome", "Guardian down!"],
      ["damage-dealt", "6164"],
      ["damage-taken", "285"],
      ["time", "22 s"],
    ],
  );
});

// ---------- the real place round the fight (cq 019) ----------

import { placeFrom } from "../fight3d.ts";

const ground = { origin: { lat: 51.508, lng: -0.128 }, covered: true, radius_m: 600, attribution: "© OpenStreetMap contributors", roads: [], water: [], green: [], buildings: [{ h: 20, p: [[0, 0], [1, 0], [1, 1], [0, 0]] }] };

test("the fight stands where the point is on the map's own ground (metres east and north of its origin)", () => {
  const at = placeFrom(ground, { lat: 51.508 - 4 / 111320, lng: -0.128 + 5 / (111320 * Math.cos((51.508 * Math.PI) / 180)) });
  assert.ok(at);
  assert.ok(Math.abs(at.at[0] - 5) < 0.01 && Math.abs(at.at[1] + 4) < 0.01);
  assert.equal(placeFrom(null, { lat: 51.508, lng: -0.128 }), null);
  assert.equal(placeFrom({ ...ground, covered: false }, { lat: 51.508, lng: -0.128 }), null); // no archive holds it
  assert.equal(placeFrom({ ...ground, buildings: [] }, { lat: 51.508, lng: -0.128 }), null); // nothing to build
  assert.equal(placeFrom(ground, { lat: 51.515, lng: -0.128 }), null); // the point is off this ground (780 m north)
});

test("a fight with a place asks Godot for the place arena; without one it is the street as before", () => {
  const base = { hero: { path: null, name: null }, ally: { path: null, name: null }, enemy: { path: null, name: null }, pointName: "Trafalgar Square", mode: "full" as const, seed: 1, autoplay: false };
  const c = buildFightConfig({ ...base, place: { groundPath: "file:///cache/fight3d-ground.json", at: [4.9, -4] } });
  assert.equal(c.arena, "place");
  assert.equal(c.ground_json, "/cache/fight3d-ground.json");
  assert.deepEqual(c.place_at, [4.9, -4]);
  const s = buildFightConfig(base);
  assert.equal(s.arena, undefined);
  assert.equal(s.ground_json, undefined);
});

