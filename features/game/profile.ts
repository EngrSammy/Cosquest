// The player's profile: the hero screen's numbers, the record's wall, the
// avatar's three numbers. The pure half of costquest-ios UI/ProfileView.swift
// (ProfileModel, power, stats, placed), UI/HeroStage.swift and
// UI/AvatarView.swift. The server decides every number; this words them.
// Pure: no React Native imports (tested in __tests__/profile.test.ts).
import type { GameClient } from "./client.ts";
import type { ProfileAvatar, Relic, RoamMe } from "./wire.ts";

// ---------- the avatar ----------

/** AvatarView.marks: the eight emblems, as Ionicons (the SF Symbols on iOS). */
export const AVATAR_MARKS = ["flame", "flash", "shield", "star", "leaf", "moon", "water", "flag"] as const;
/** The names a screen reader says for them. */
export const AVATAR_MARK_NAMES = ["Flame", "Bolt", "Shield", "Star", "Leaf", "Moon", "Drop", "Flag"] as const;
/** ProfileModel.palette: colours that stay distinguishable on a small avatar in sunlight. */
export const AVATAR_PALETTE = ["#E8B33A", "#3FA7D6", "#59C28B", "#E5484D", "#A78BFA", "#F4F4F5"] as const;
/** Profile.Avatar's defaults (the iOS struct's). */
export const DEFAULT_AVATAR: ProfileAvatar = { face: 0, mark: 0, tint: "#E8B33A" };

/** circle | rounded square | diamond | hexagon (AvatarView.shape). */
export type AvatarShape = "circle" | "square" | "diamond" | "hexagon";

export function avatarShape(face: number): AvatarShape {
  return (["circle", "square", "diamond", "hexagon"] as const)[Math.abs(Math.trunc(face)) % 4];
}

export function avatarMark(mark: number): (typeof AVATAR_MARKS)[number] {
  return AVATAR_MARKS[Math.abs(Math.trunc(mark)) % AVATAR_MARKS.length];
}

/** The avatar's tint as a colour we can draw, or the default when the server sent junk. */
export function safeTint(tint: string | null | undefined): string {
  return typeof tint === "string" && /^#[0-9a-f]{6}$/i.test(tint) ? tint : DEFAULT_AVATAR.tint;
}

// ---------- the profile as the server writes it ----------

export type WallResult = {
  game_id: string;
  title: string;
  faction: string | null;
  tokens: number;
  placing: number | null;
  prize_cents: number;
  currency: string | null;
  at: string;
};

export type InProgress = { game_id: string; title: string; tokens: number; status: string };

/** Profile as GET v1/profile/{key} sends it, with the fields wire.ts's Profile leaves out. */
export type ProfileFull = {
  device_key: string;
  handle: string | null;
  avatar: ProfileAvatar;
  since: string | null;
  games_played: number;
  games_won: number;
  tokens_total: number;
  prizes_cents: number;
  wall: WallResult[];
  in_progress: InProgress[];
};

const int = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : fallback);
const text = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function parseProfileFull(raw: unknown): ProfileFull {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const a = (r.avatar && typeof r.avatar === "object" ? r.avatar : {}) as Record<string, unknown>;
  const wall = (Array.isArray(r.wall) ? r.wall : [])
    .filter((w): w is Record<string, unknown> => !!w && typeof w === "object" && typeof (w as { game_id?: unknown }).game_id === "string")
    .map((w) => ({
      game_id: w.game_id as string,
      title: text(w.title) ?? "",
      faction: text(w.faction),
      tokens: int(w.tokens),
      placing: typeof w.placing === "number" ? int(w.placing) : null,
      prize_cents: int(w.prize_cents),
      currency: text(w.currency),
      at: text(w.at) ?? "",
    }));
  const inProgress = (Array.isArray(r.in_progress) ? r.in_progress : [])
    .filter((g): g is Record<string, unknown> => !!g && typeof g === "object" && typeof (g as { game_id?: unknown }).game_id === "string")
    .map((g) => ({ game_id: g.game_id as string, title: text(g.title) ?? "", tokens: int(g.tokens), status: text(g.status) ?? "" }));
  return {
    device_key: text(r.device_key) ?? "",
    handle: text(r.handle),
    avatar: { face: int(a.face, DEFAULT_AVATAR.face), mark: int(a.mark, DEFAULT_AVATAR.mark), tint: safeTint(text(a.tint)) },
    since: text(r.since),
    games_played: int(r.games_played),
    games_won: int(r.games_won),
    tokens_total: int(r.tokens_total),
    prizes_cents: int(r.prizes_cents),
    wall,
    in_progress: inProgress,
  };
}

/** The player's own profile; null when they have never set one up (the normal 404). */
export async function fetchProfileFull(client: GameClient): Promise<ProfileFull | null> {
  const key = client.deviceKey();
  try {
    return parseProfileFull(await client.request<unknown>("GET", `v1/profile/${key}`));
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 404) return null;
    throw error;
  }
}

// ---------- the hero screen ----------

export type Equipped = Pick<Relic, "kind" | "rarity" | "name"> & { power?: number; power_now?: number | null; level?: number | null };

export function equippedOf(me: RoamMe | null | undefined): Equipped | null {
  const e = me?.features?.relics?.equipped;
  return e ? e : null;
}

export function relicPower(e: Equipped | null): number {
  return e ? (e.power_now ?? e.power ?? 0) : 0;
}

/** One number for how strong this hero is: levelling is the main road, a good Relic a real step (ProfileView.power). */
export function heroPower(me: RoamMe | null | undefined): number {
  if (!me) return 0;
  return me.standing.level * 12 + Math.trunc(relicPower(equippedOf(me)) * 5) + me.streak.best * 2;
}

/** "SCOUT OF HOUSE MARVEL" (ProfileView.heroTitle). */
export function heroTitle(me: RoamMe | null | undefined): string {
  if (!me) return "A NEW HERO";
  const house = me.faction_name || (me.faction ? me.faction.charAt(0).toUpperCase() + me.faction.slice(1) : null);
  return house ? `${me.standing.rank.toUpperCase()} OF HOUSE ${house.toUpperCase()}` : me.standing.rank.toUpperCase();
}

export type StatBar = { icon: "heart" | "flash" | "locate" | "flame"; name: string; value: string; extra?: string; progress: number };

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

/** The four bars of the hero screen, in order (ProfileView.stats). */
export function statBars(me: RoamMe): StatBar[] {
  const s = me.standing;
  const e = equippedOf(me);
  const p = relicPower(e);
  const played = me.today?.points_played ?? 0;
  const right = me.today?.correct ?? 0;
  const progress = s.level_span > 0 ? s.into_level / s.level_span : 0;
  return [
    {
      icon: "heart",
      name: `Level ${s.level}`,
      value: s.max_level ? "MAX" : String(s.into_level),
      extra: s.max_level ? undefined : `/${s.level_span} XP`,
      progress: s.max_level ? 1 : clamp01(progress),
    },
    { icon: "flash", name: "Relic power", value: e ? String(Math.round(p)) : "-", extra: e ? `Lv ${e.level ?? 1}` : undefined, progress: clamp01(p / 42) },
    {
      icon: "locate",
      name: "Accuracy today",
      value: played === 0 ? "-" : `${Math.round((right / played) * 100)}%`,
      progress: played === 0 ? 0 : clamp01(right / played),
    },
    { icon: "flame", name: "Best streak", value: String(me.streak.best), extra: me.streak.best === 1 ? "day" : "days", progress: clamp01(me.streak.best / 30) },
  ];
}

/** "Top level. Legend." / "120 XP to level 5" (ProfileView.progressSection). */
export function xpToNext(me: RoamMe): string {
  const s = me.standing;
  return s.max_level ? "Top level. Legend." : `${s.level_span - s.into_level} XP to level ${s.level + 1}`;
}

/** 1st 2nd 3rd 4th ... 11th 12th 13th 21st (ProfileView.placed). */
export function placed(n: number): string {
  if (n >= 11 && n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  const last = n % 10;
  return last === 1 ? `${n}st` : last === 2 ? `${n}nd` : last === 3 ? `${n}rd` : `${n}th`;
}

/** Money.text: minor units in a currency, USD when the server did not say. */
export function moneyText(minorUnits: number, currency?: string | null): string {
  const value = minorUnits / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

/** The currency prizes are shown in: from the most recent result that says. */
export function wallCurrency(wall: WallResult[]): string | null {
  return wall.find((w) => w.currency)?.currency ?? null;
}

export function wallSubtitle(r: WallResult): string {
  return `${r.tokens} tokens${r.faction ? ` · ${r.faction.charAt(0).toUpperCase()}${r.faction.slice(1)}` : ""}`;
}

/** The name field's rule: two letters at least (ProfileEditor.canSave, Onboarding name.count >= 2). */
export function validHandle(name: string): boolean {
  return name.trim().length >= 2;
}

export function cleanHandle(name: string): string {
  return name.trim().slice(0, 24);
}
