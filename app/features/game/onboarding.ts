// The first minute of the game, as a conversation with the Warden: what it
// says at each beat, how long a line takes, which beat comes next. The pure
// half of costquest-ios Roam/OnboardingView.swift (Beat, line, pitch,
// welcome, pace, advanceIfNarrative). The screen is components/game/Onboarding.tsx.
// Pure: no React Native imports (tested in __tests__/onboarding.test.ts).

/** Declared in the order the Warden tells it (Beat.allCases). */
export const BEATS = ["wake", "hello", "shrines", "askName", "nameAck", "askFaction", "factionAck", "gift", "askLocation", "farewell"] as const;
export type Beat = (typeof BEATS)[number];

export const beatIndex = (b: Beat): number => BEATS.indexOf(b);

/** The shortest name the Warden will take (name.count >= 2). */
export const MIN_NAME = 2;

export type LineContext = {
  /** The player's name, trimmed. */
  name: string;
  /** The house the player is looking at (before joining). */
  picked: string | null;
  /** The house the player joined. */
  joined: string | null;
  /** The starter Relic's name, once claimed. */
  relicName: string | null;
  /** The house's display name from the server's config. */
  houseName: string;
};

/** What each house sounds like, said by the Warden while you are choosing. */
export function pitch(id: string): string {
  switch (id) {
    case "anime":
      return "Anime. Loud, loyal, and they never, ever give up.";
    case "marvel":
      return "Marvel. Quick with a joke, quicker with a comeback.";
    case "dc":
      return "DC. Old legends, and they carry themselves like it.";
    case "movies":
      return "Movies. Every story ever told on a big screen, and they know them all.";
    case "gaming":
      return "Gaming. They see the world as a map with a boss at the end.";
    default:
      return "Choose carefully.";
  }
}

/** The first thing the Warden says in the house's own voice. */
export function welcome(id: string, name: string): string {
  switch (id) {
    case "anime":
      return `Anime it is! I can feel your fighting spirit already, ${name}!`;
    case "marvel":
      return `Marvel. Good choice. I was hoping you'd have taste, ${name}.`;
    case "dc":
      return `Then the legends have a new name among them. Welcome, ${name}.`;
    case "movies":
      return `In a city full of shrines, one fan chose Movies. Welcome, ${name}.`;
    case "gaming":
      return `Player ${name} has joined Gaming. New quest unlocked.`;
    default:
      return `Welcome, ${name}.`;
  }
}

/** The Warden's line at a beat. */
export function lineFor(beat: Beat, c: LineContext): string {
  switch (beat) {
    case "wake":
      return "…oh. You can see me.";
    case "hello":
      return "Not many people can. I'm the Warden. I look after the shrines hidden in this city.";
    case "shrines":
      return "They sit in cafés, on bridges, under statues. Most people walk straight past them. You won't.";
    case "askName":
      return "Before we go anywhere: what should I call you?";
    case "nameAck":
      return `${c.name}. I'll remember that.`;
    case "askFaction":
      return c.picked ? pitch(c.picked) : "Every shrine belongs to one of five houses, and the houses are always at war. Who do you stand with?";
    case "factionAck":
      return welcome(c.joined ?? "", c.name);
    case "gift":
      return c.relicName ? `You'll need this. ${c.relicName}. It's been waiting for someone from ${c.houseName}.` : "";
    case "askLocation":
      return "One last thing. To find shrines around you, I need to know roughly where you are. Only while you play, and no one else ever sees it.";
    case "farewell":
      // Trivia first (3 Nov): the starter point is a quiz, and the map's coach
      // says so next ("Tap its card to answer"); a fight promised here would be
      // the first thing the game breaks.
      return "On your map, shrines are Quest Points. Answer one and it's yours. Let's go.";
  }
}

/** A line's words, kept with their spacing so the reveal never reflows. */
export function wordsOf(line: string): string[] {
  return line.split(" ");
}

/** How long each word takes to appear. */
export const WORD_MS = 85;

/** A narrative beat moves on by itself after the line (without speech): words x 0.08 + 0.4 s, then words x 0.25 + 1.2 s. */
export function paceMs(line: string): { first: number; rest: number } {
  const words = line.split(" ").filter(Boolean).length;
  return { first: Math.round((words * 0.08 + 0.4) * 1000), rest: Math.round((words * 0.25 + 1.2) * 1000) };
}

/** The beats that tell, rather than ask: a tap (or the pause) moves them on. */
export function nextNarrative(beat: Beat, nameLength: number): Beat | null {
  switch (beat) {
    case "wake":
      return "hello";
    case "hello":
      return "shrines";
    case "shrines":
      return nameLength >= MIN_NAME ? "nameAck" : "askName";
    case "nameAck":
      return "askFaction";
    case "gift":
      return "askLocation";
    default:
      return null;
  }
}

/** Where a player who got partway last time picks up. */
export function startBeat(opts: { faction: string | null | undefined; nameLength: number }): { beat: Beat; awake: boolean } {
  if (opts.faction) return { beat: "askLocation", awake: true };
  if (opts.nameLength >= MIN_NAME) return { beat: "askFaction", awake: true };
  return { beat: "wake", awake: false };
}

/** Skip is offered until the Warden asks the name. */
export function canSkip(beat: Beat): boolean {
  return beatIndex(beat) < beatIndex("askName");
}

/** The Warden's face colour before a house is chosen (Color(0.45, 0.62, 1.0)). */
export const DAWN_TINT = "#739EFF";

/** The unit-square mote field: fixed per mote, so they drift rather than flicker (WardenDawn). */
export type Mote = { x0: number; speed: number; seed: number; r: number; slate: boolean };

export function motes(count = 38): Mote[] {
  return Array.from({ length: count }, (_, i) => {
    const seed = i * 12.9898;
    const raw = Math.sin(seed) * 43758.5453;
    const x0 = Math.abs(raw % 1);
    return {
      x0,
      speed: 0.012 + 0.02 * Math.abs(Math.cos(seed * 1.7)),
      seed,
      r: 1.5 + 2.4 * Math.abs(Math.sin(seed * 3.1)),
      slate: i % 3 === 0,
    };
  });
}
