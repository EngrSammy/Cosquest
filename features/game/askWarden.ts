// "Ask the Warden": asking the game a question, with the network off. The
// pure half of costquest-ios Game/Warden.swift (the rulebook, the rule a
// question is about, the prompt) and UI/WardenView.swift (the openers). The
// app chooses the rule with a keyword table and the model only writes the
// sentence; with no model, the rule itself is the answer. The screen is
// components/game/AskWarden.tsx.
// Pure: no React Native imports (tested in __tests__/askWarden.test.ts).

export type Rule = { topic: string; text: string; triggers: string[] };

/** Warden.rulebook, rule for rule. */
export const RULEBOOK: Rule[] = [
  {
    topic: "cooldown",
    text: "Hits have a cooldown. A hit made before the cooldown has finished is refused. That is the rule working, not a fault.",
    triggers: ["cooldown", "too soon", "again", "wait", "refused"],
  },
  {
    topic: "friendly fire",
    text: "You cannot hit a player on your own side. That is refused as friendly fire.",
    triggers: ["own side", "my side", "team", "teammate", "friendly", "same faction"],
  },
  {
    topic: "range",
    text: "A hit beyond the game's range limit is refused. The phones measure the range and the server checks it.",
    triggers: ["range", "how far", "distance", "too far", "reach"],
  },
  {
    topic: "weapons",
    text: "You must be carrying a weapon before you can hit anyone. Weapons are picked up at marked points on the field.",
    triggers: ["weapon", "harpoon", "pick up", "carrying", "no weapon", "armed"],
  },
  {
    topic: "scoring",
    text: "Tokens are the score. You take them from players on other sides by hitting them, by capturing points, and by answering trivia at the marked stops.",
    triggers: ["score", "scoring", "points", "tokens", "win", "how do i", "earn"],
  },
  {
    topic: "being downed",
    text: "Losing all your tokens puts you down. The server holds the respawn timer and lets you back in when it has run.",
    triggers: ["down", "downed", "respawn", "died", "out of tokens", "back in"],
  },
  {
    topic: "the venue boundary",
    text: "Everything must happen inside the venue. Anything reported from outside the boundary is refused.",
    triggers: ["outside", "boundary", "geofence", "venue", "car park", "leave", "away"],
  },
  {
    topic: "trivia",
    text: "Each trivia stop is answered once. The server marks the answer; the phone never knows which choice was right.",
    triggers: ["trivia", "question", "answer", "quiz", "stop"],
  },
];

/** What a player standing in a field actually wants to ask, offered as taps. */
export const OPENERS = ["Why was that refused?", "How do I score?", "What should I do next?", "What is around me?"] as const;

/** The Proctor: nearly every question at a venue is about a rule or a refusal. */
export const PROCTOR_PROMPT =
  "You are the CostQuest Proctor. You referee a live session: validate captures, call fouls, resolve disputes by the rules. Be decisive and fair.";

export type AskContext = {
  title: string;
  faction?: string | null;
  tokens?: number;
  state?: string;
  weapon?: string | null;
  venue?: string | null;
  nearby?: string[];
  lastRefusal?: string | null;
  isOnline?: boolean;
};

/** Warden.Context.lines: what is true right now, in plain sentences. */
export function contextLines(c: AskContext): string[] {
  const out = [`The game is "${c.title}".`];
  if (c.venue) out.push(`It is being played at ${c.venue}.`);
  out.push(`You are talking to a player who is on the ${c.faction ?? "no"} side, holds ${c.tokens ?? 0} tokens, and is ${c.state ?? "active"}.`);
  out.push(c.weapon ? `They are carrying a ${c.weapon}.` : "They are not carrying a weapon.");
  if (c.nearby && c.nearby.length) out.push(`Nearby points they could use: ${c.nearby.join(", ")}.`);
  if (c.lastRefusal) out.push(`The server just refused something with the reason: "${c.lastRefusal}".`);
  if (c.isOnline === false) out.push("Their phone currently has no connection to the game server.");
  return out;
}

/** The rule that applies (two at most), or scoring and cooldown when nothing matches. */
export function rulesFor(question: string, refusal?: string | null): Rule[] {
  const hay = `${question} ${refusal ?? ""}`.toLowerCase();
  const hits = RULEBOOK.filter((r) => r.triggers.some((t) => hay.includes(t)));
  return hits.length ? hits.slice(0, 2) : [RULEBOOK[4], RULEBOOK[0]];
}

/** What the app answers with no model at all: always correct, because it was written. */
export function plainAnswer(question: string, c: AskContext): string {
  return rulesFor(question, c.lastRefusal)
    .map((r) => r.text)
    .join(" ");
}

export type Turn = { id: number; fromPlayer: boolean; text: string; rule?: string | null };

/** Warden.prompt: the chosen rules, the context, the last exchange, the question (Qwen3 chat, no thinking). */
export function askPrompt(c: AskContext, history: Turn[], question: string): string {
  let out = `<|im_start|>system\n${PROCTOR_PROMPT}\n\n`;
  out += rulesFor(question, c.lastRefusal)
    .map((r) => r.text)
    .join(" ");
  out += " The server judges every action and its record is final.\n\n";
  out += contextLines(c).join(" ");
  out += "\n\nAnswer the player directly, in two short sentences, using only what is above. If it does not cover the question, say you do not know rather than guessing.<|im_end|>\n";
  for (const t of history.slice(-2)) out += `<|im_start|>${t.fromPlayer ? "user" : "assistant"}\n${t.text}<|im_end|>\n`;
  out += `<|im_start|>user\n${question} /no_think<|im_end|>\n`;
  out += "<|im_start|>assistant\n<think>\n\n</think>\n\n";
  return out;
}

/** A model answer too short to be any use falls back to the rulebook. */
export function settleAnswer(modelText: string | null | undefined, rule: string): { text: string; rule: string | null } {
  const t = (modelText ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  return t.length < 8 ? { text: rule, rule: null } : { text: t, rule };
}
