// The Warden: the game's voice. A port of costquest-ios Warden/WardenVoice.swift
// (WardenStyle, WardenMoment), Warden/WardenLines.swift (the authored lines)
// and Warden/WardenMoments.swift (the facts for each moment).
//
// The authored lines are not a lesser path: they are what a player hears
// before the model has downloaded, on a phone that cannot hold it, and
// whenever a generated line fails its check. The variant is seeded by the
// facts exactly as on iOS, so the same moment gets the same line on both.
// Pure (tested in features/game/__tests__).
import { distanceM, type LatLng } from "./geo.ts";
import type { FactionWar, QuestPoint, RoamDaily, RoamMe, RoamVerdict } from "./wire.ts";
import { isCooling } from "./wire.ts";

export type WardenStyle = "arcade" | "mythic" | "hype" | "trailer" | "quippy" | "neutral";

export function wardenStyle(faction: string | null | undefined): WardenStyle {
  switch (faction) {
    case "gaming":
      return "arcade";
    case "dc":
      return "mythic";
    case "anime":
      return "hype";
    case "movies":
      return "trailer";
    case "marvel":
      return "quippy";
    default:
      return "neutral";
  }
}

type FactPair = [string, string | null | undefined];

export class WardenMoment {
  readonly kind: string;
  readonly style: WardenStyle;
  readonly facts: [string, string][];
  readonly salt: string;
  /** A line that is said as written (a Game Warden site's own, from checked facts): no model, no template. */
  readonly fixed: string | null;

  constructor(kind: string, style: WardenStyle, facts: FactPair[], salt = "", fixed: string | null = null) {
    this.kind = kind;
    this.style = style;
    this.facts = facts.filter((f): f is [string, string] => typeof f[1] === "string" && f[1].length > 0);
    this.salt = salt;
    this.fixed = fixed;
  }

  /** The exact input line the model was fine-tuned on (costquest-qlm/warden/make_inputs.py). */
  get input(): string {
    return [["moment", this.kind], ["style", this.style], ...this.facts].map(([k, v]) => `${k}: ${v}`).join(" | ");
  }

  get key(): string {
    return `${this.input}#${this.salt}`;
  }

  fact(k: string): string | undefined {
    return this.facts.find(([key]) => key === k)?.[1];
  }

  get maxTokens(): number {
    return this.kind === "recap" ? 80 : this.kind === "legend" ? 64 : 40;
  }

  static readonly system =
    "You are the Warden, the voice of CostQuest. Speak one line in the given style, using only the given facts.";

  /** The Qwen3 chat prompt with thinking off, as the voice was trained. */
  get prompt(): string {
    return (
      `<|im_start|>system\n${WardenMoment.system}<|im_end|>\n` +
      `<|im_start|>user\n${this.input}<|im_end|>\n` +
      "<|im_start|>assistant\n<think>\n\n</think>\n\n"
    );
  }
}

/** Swift's `(seed &* 31 &+ scalar) & 0x7fffffff` over the input's unicode scalars. */
export function lineSeed(input: string): number {
  let seed = 0;
  for (const ch of input) {
    const cp = ch.codePointAt(0) ?? 0;
    // seed < 2^31, so seed * 31 + cp < 2^36: exact in a double; mask the low 31 bits.
    seed = (seed * 31 + cp) % 2147483648;
  }
  return seed;
}

/** The authored line for a moment (WardenLines.fallback). */
export function fallbackLine(m: WardenMoment): string {
  if (m.fixed) return m.fixed;
  const name = m.fact("name") ?? "traveller";
  const place = m.fact("place") ?? m.fact("nearest") ?? "this place";
  let options: string[];
  const s = m.style;
  switch (m.kind) {
    case "arrive":
      options =
        s === "arcade"
          ? [`Player one, ${name}! ${place} is live. Ready up.`, `New stage unlocked: ${place}. Show it what you've got, ${name}.`]
          : s === "mythic"
            ? [`${place} has waited for you, ${name}. Its shrine wakes.`, `The stones of ${place} remember every seeker. Now they know you.`]
            : s === "hype"
              ? [`${place}! This is it, ${name}. Give it everything!`, `You made it to ${place}! I knew you would. Let's go!`]
              : s === "trailer"
                ? [`One city. One shrine. ${place}. And ${name}, ready.`, `Coming to ${place}: ${name}. Nothing will be the same.`]
                : s === "quippy"
                  ? [`${place}, ${name}. Try not to make it look too easy.`, `Oh good, ${place}. It's been dying to meet you, ${name}.`]
                  : [`Welcome to ${place}, ${name}. The shrine is listening.`, `${place}. A good place for a challenge, ${name}.`];
      break;
    case "correct":
      options =
        s === "arcade"
          ? [`Clean hit, ${name}! Combo continues.`, `GG, ${name}. That's how it's done.`]
          : s === "mythic"
            ? [`The shrine yields to you, ${name}.`, `Rightly answered. The legend of ${name} grows.`]
            : s === "hype"
              ? [`YES! That's the spirit, ${name}!`, `You got it, ${name}! I never doubted you!`]
              : s === "trailer"
                ? [`And against all odds, ${name} gets it right.`, "One answer. One hero. Correct."]
                : s === "quippy"
                  ? [`Nailed it, ${name}. Obviously.`, `Correct. Try to stay humble, ${name}.`]
                  : [`Right answer, ${name}. Nicely done.`, `That's it exactly, ${name}.`];
      break;
    case "wrong":
      options =
        s === "arcade"
          ? [`Missed that one, ${name}. Respawn and go again.`, "Not this round. Next point, new run."]
          : s === "mythic"
            ? [`Even legends stumble, ${name}. The city will test you again.`, "The shrine keeps its secret. For now."]
            : s === "hype"
              ? [`Not yet, ${name}! Get back up, we go again!`, "That one got away, but you're only getting stronger!"]
              : s === "trailer"
                ? [`A setback. But this story isn't over, ${name}.`, "Every hero has that scene. This was yours."]
                : s === "quippy"
                  ? [`Close. Well, not close. But brave, ${name}.`, `That one's on the question, ${name}. Probably.`]
                  : [`Not this time, ${name}. The next point is waiting.`, "That one slipped away. Plenty more out there."];
      break;
    case "siege_won": {
      const from = m.fact("taken_from") ?? "the rival";
      options =
        s === "arcade"
          ? [`Boss down! ${place} is yours, ${name}. New high score.`, `Guardian K.O.! ${from} loses ${place}. GG, ${name}.`]
          : s === "mythic"
            ? [`The ${from} Guardian falls. ${place} bows to you, ${name}.`, `Sing it in the old halls: ${name} took ${place} from ${from}.`]
            : s === "hype"
              ? [`YOU TOOK ${place.toUpperCase()}, ${name}! ${from} never saw it coming!`, `That's our flag on ${place} now! Incredible, ${name}!`]
              : s === "trailer"
                ? [`They said ${place} would never fall. ${name} had other plans.`, `One Guardian. One challenger. ${place} changes hands tonight.`]
                : s === "quippy"
                  ? [`${place} is yours. ${from} will want that back. Let them try.`, `Nice siege, ${name}. ${from} is drafting a strongly worded letter.`]
                  : [`${place} is yours, ${name}. Hold it well.`, `The Guardian yields. ${place} flies your colours now.`];
      break;
    }
    case "siege_lost": {
      const holder = m.fact("holder") ?? "the rival";
      options =
        s === "arcade"
          ? [`Game over at ${place}, ${name}. Power up and hit continue.`, `The ${holder} Guardian wins this round. Level that Relic and rematch.`]
          : s === "mythic"
            ? [`${place} holds, for now. Even stone tires, ${name}.`, `The Guardian of ${holder} stands. Return stronger, seeker.`]
            : s === "hype"
              ? [`So close, ${name}! Shake it off, we're coming back for ${place}!`, `The Guardian got lucky. Next time ${place} is ours!`]
              : s === "trailer"
                ? [`${place} holds. But ${name} will be back.`, "The first siege failed. The second one won't."]
                : s === "quippy"
                  ? [`${holder} keeps ${place}. Enjoy it while it lasts, ${holder}.`, "The Guardian won. Don't tell it, it'll get smug."]
                  : [`${place} holds this time, ${name}. Rest, then try again.`, "The Guardian held. Level up your Relic and come back."];
      break;
    }
    case "late":
      options = [`Time ran out, ${name}. The clock is a harsh judge.`, `Too slow this time, ${name}. Next one, faster.`];
      break;
    case "levelup": {
      const level = m.fact("level") ?? "up";
      options = [`Level ${level}, ${name}! The city takes notice.`, `You've reached level ${level}, ${name}. Onward.`];
      break;
    }
    case "rankup": {
      const rank = m.fact("rank") ?? "a new rank";
      options = [`${name}, you are now ${rank}. Wear it well.`, `A new title for ${name}: ${rank}.`];
      break;
    }
    case "streak":
      options = [`${m.fact("streak") ?? "another day"} and counting, ${name}. Don't break it now.`];
      break;
    case "daily_done": {
      const q = m.fact("quest") ?? "Today's quest";
      options = [`${q}: done. Nicely handled, ${name}.`, `Quest complete, ${name}. ${q}, ticked off.`];
      break;
    }
    case "hint":
      options = [`A little help never hurt anyone, ${name}.`, `Spent wisely, ${name}. Now finish it.`];
      break;
    case "legend":
      options = [
        "I felt this shrine wake the night the city first dreamed. It still hums when someone like you comes close.",
        `People pass ${place} every day. Very few notice the shrine. You did.`,
        `Nobody remembers who first marked ${place}. I do. Keep coming back and I might tell you.`,
        `The shrine at ${place} is older than the street around it. It does not like to be rushed.`,
      ];
      break;
    case "recap":
      options = [
        `${m.fact("points_played") ?? "a few"} points played, ${m.fact("xp_today") ?? "some"} XP earned. Not a bad day's work, ${name}.`,
      ];
      break;
    case "nudge": {
      const d = m.fact("distance") ?? "not far";
      options = [
        `The shrine at ${place} is awake, ${d} from here.`,
        `${place}, ${d} away. I think it wants to meet you, ${name}.`,
        `Try ${place} next. It's ${d} away.`,
      ];
      break;
    }
    default:
      options = [`I'm right here, ${name}.`];
  }
  return options[lineSeed(m.input) % options.length];
}

// ---------- the facts for each moment (WardenMoments.swift) ----------

export type MomentContext = {
  me: RoamMe | null;
  playerName: string;
};

const styleOf = (ctx: MomentContext) => wardenStyle(ctx.me?.faction);

export function arriveMoment(ctx: MomentContext, p: QuestPoint): WardenMoment {
  const s = ctx.me?.standing;
  const facts: FactPair[] = [
    ["name", ctx.playerName],
    ["place", p.name],
    ["tier", p.tier],
    ["challenge", p.challenge],
    ["questions", p.realm],
    ["level", s ? String(s.level) : null],
  ];
  if (s && !s.max_level && s.level_span - s.into_level < 200) facts.push(["to_next", `${s.level_span - s.into_level} XP`]);
  if (ctx.me && ctx.me.streak.days >= 2) facts.push(["streak", `${ctx.me.streak.days} days`]);
  if (ctx.me?.streak.played_today === false) facts.push(["first_point_today", "yes"]);
  return new WardenMoment("arrive", styleOf(ctx), facts, ctx.me?.day ?? "");
}

export function reactionMoment(
  ctx: MomentContext,
  correct: boolean,
  point: { name: string },
  kind: string,
  verdict?: RoamVerdict | null,
): WardenMoment {
  const facts: FactPair[] = [["name", ctx.playerName], ["place", point.name], ["challenge", kind]];
  if (verdict) {
    if (kind === "blitz") facts.push(["score", `${verdict.correct} of ${verdict.total}`]);
    if (correct && verdict.answer_run >= 2) facts.push(["run", `${verdict.answer_run} right in a row`]);
    if (correct) facts.push(["xp_gained", String(verdict.reward.xp)]);
  }
  return new WardenMoment(correct ? "correct" : "wrong", styleOf(ctx), facts, verdict?.attempt_id ?? "");
}

export function lateMoment(ctx: MomentContext, point: { name: string }): WardenMoment {
  return new WardenMoment("late", styleOf(ctx), [["name", ctx.playerName], ["place", point.name]]);
}

export function levelMoment(ctx: MomentContext, after: { level: number; rank: string }, rankUp: boolean): WardenMoment {
  if (rankUp) {
    return new WardenMoment("rankup", styleOf(ctx), [["name", ctx.playerName], ["rank", after.rank], ["level", String(after.level)]]);
  }
  return new WardenMoment("levelup", styleOf(ctx), [["name", ctx.playerName], ["level", String(after.level)], ["rank", after.rank]]);
}

export function dailyMoment(ctx: MomentContext, d: RoamDaily): WardenMoment {
  return new WardenMoment("daily_done", styleOf(ctx), [["name", ctx.playerName], ["quest", d.title], ["reward", `${d.reward.xp} XP`]]);
}

export function hintMoment(ctx: MomentContext, kind: string): WardenMoment {
  return new WardenMoment("hint", styleOf(ctx), [["name", ctx.playerName], ["hint", kind === "fifty" ? "50/50" : "extra time"]]);
}

/** Arriving at a Game Warden site: the site's own arrive line, as the server wrote it from its facts. */
export function siteArriveMoment(ctx: MomentContext, p: QuestPoint, line: string): WardenMoment {
  return new WardenMoment("arrive", styleOf(ctx), [["name", ctx.playerName], ["place", p.name]], p.id, line);
}

export function legendMoment(ctx: MomentContext, p: QuestPoint): WardenMoment {
  return new WardenMoment("legend", styleOf(ctx), [["place", p.name], ["tier", p.tier], ["realm", p.realm]]);
}

export function nudgeMoment(
  ctx: MomentContext,
  here: LatLng | null,
  points: QuestPoint[],
  reach: number,
  war: FactionWar | null,
  now: number = Date.now(),
): WardenMoment | null {
  if (!here) return null;
  const candidates = points
    .filter((p) => !isCooling(p, now))
    .map((p) => ({ p, d: distanceM(here, p) }))
    .filter(({ d }) => d > reach)
    .sort((a, b) => a.d - b.d);
  const pick = candidates[0];
  if (!pick) return null;
  const facts: FactPair[] = [
    ["name", ctx.playerName],
    ["nearest", pick.p.name],
    ["distance", `${Math.round(pick.d / 10) * 10} m`],
    ["tier", pick.p.tier],
  ];
  const left = ctx.me?.dailies.find((d) => !d.done);
  if (left) facts.push(["daily_left", left.title]);
  const mine = ctx.me?.faction;
  if (war && mine && war.total > 0) {
    const i = war.standings.findIndex((s) => s.faction === mine);
    if (i >= 0) facts.push(["faction_standing", `${war.standings[i].name} ${i === 0 ? "leads" : i === 1 ? "is 2nd" : "trails"} this week`]);
  }
  return new WardenMoment("nudge", styleOf(ctx), facts, String(Math.floor(now / 600000)));
}

export function recapMoment(ctx: MomentContext, war: FactionWar | null): WardenMoment | null {
  const me = ctx.me;
  const t = me?.today;
  if (!me || !t || t.points_played <= 0) return null;
  const facts: FactPair[] = [
    ["name", ctx.playerName],
    ["points_played", String(t.points_played)],
    ["correct", String(t.correct)],
    ["xp_today", String(t.xp)],
    ["faction", me.faction_name],
    ["best_place", t.best_place],
    ["level_now", String(me.standing.level)],
  ];
  if (war && me.faction && war.total > 0) {
    const i = war.standings.findIndex((s) => s.faction === me.faction);
    if (i >= 0) facts.push(["faction_rank_this_week", ["1st", "2nd", "3rd", "4th", "5th"][Math.min(i, 4)]]);
  }
  return new WardenMoment("recap", styleOf(ctx), facts, `${t.points_played}-${t.xp}`);
}

/**
 * Where a line comes from. The on-device model plugs in here (features/game/
 * wardenModel.ts); without it every line is the authored one, instantly.
 */
export type LineWriter = (m: WardenMoment) => Promise<string | null>;

export async function lineFor(m: WardenMoment, writer?: LineWriter | null): Promise<{ text: string; fromModel: boolean }> {
  if (writer) {
    try {
      const text = await writer(m);
      if (text && text.trim()) return { text: text.trim(), fromModel: true };
    } catch {
      // The game never waits on the model: fall through to the authored line.
    }
  }
  return { text: fallbackLine(m), fromModel: false };
}
