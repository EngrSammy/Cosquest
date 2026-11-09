// cosquest://play?... : open the game at a spot, from a notification, a
// link someone shared, or anywhere else outside the app.
//
//   cosquest://play?raid=<id>&place=Trafalgar%20Square&lat=51.508&lng=-0.128
//   cosquest://play?shrine=<id>
//   cosquest://play?duel=<id>
//   cosquest://play?lat=51.5&lng=-0.12          (just a place on the map)
//   cosquest://play                              (just the game)
//
// Also accepted: https://<web>/play?... (the same query) and the long names
// shrineId / raidId / duelId. Anything malformed is dropped, never guessed at.
// Pure: no React Native imports (tested in features/world/__tests__).

export type GameTarget = {
  shrineId?: string;
  raidId?: string;
  duelId?: string;
  lat?: number;
  lng?: number;
  /** A place name to show while the spot loads ("Head to ..."). */
  place?: string;
};

export type PlayLink = { kind: "play"; target: GameTarget | null };

/** Same rule as the chat backend's game invites (gameController.js). */
const TARGET_ID = /^[A-Za-z0-9:_.-]{1,80}$/;

export function isValidTargetId(id: unknown): id is string {
  return typeof id === "string" && TARGET_ID.test(id);
}

function parseCoordinate(raw: string | null, limit: number): number | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || Math.abs(value) > limit) return undefined;
  return value;
}

/** Query params of a URL, without depending on the URL global's quirks. */
function queryOf(url: string): URLSearchParams {
  const q = url.indexOf("?");
  if (q < 0) return new URLSearchParams();
  const hash = url.indexOf("#", q);
  return new URLSearchParams(url.slice(q + 1, hash < 0 ? undefined : hash));
}

/** The path of a cosquest:// or http(s) URL, or a bare path, without slashes. */
function pathOf(url: string): string {
  let rest = url.trim();
  const scheme = rest.match(/^[a-z][a-z0-9+.-]*:\/\//i);
  if (scheme) {
    rest = rest.slice(scheme[0].length);
    // http(s)://host/path: drop the host. cosquest://play: "play" IS the host.
    if (!/^cosquest:/i.test(scheme[0])) {
      const slash = rest.indexOf("/");
      rest = slash < 0 ? "" : rest.slice(slash);
    }
  }
  rest = rest.split(/[?#]/)[0];
  return rest.replace(/^\/+|\/+$/g, "").toLowerCase();
}

/** A GameTarget from query values, or null when it names nothing usable. */
export function targetFromParams(params: URLSearchParams): GameTarget | null {
  const target: GameTarget = {};
  const all = (short: string, long: string) => [...params.getAll(short), ...params.getAll(long)];
  const named = [all("shrine", "shrineId"), all("raid", "raidId"), all("duel", "duelId")];
  // Two spots named (or one named twice) is ambiguous: refuse rather than pick.
  if (named.reduce((n, values) => n + values.length, 0) > 1) return null;
  const [shrine, raid, duel] = named.map((values) => values[0] ?? null);
  if (raid !== null) {
    if (!isValidTargetId(raid)) return null;
    target.raidId = raid;
  } else if (duel !== null) {
    if (!isValidTargetId(duel)) return null;
    target.duelId = duel;
  } else if (shrine !== null) {
    if (!isValidTargetId(shrine)) return null;
    target.shrineId = shrine;
  }
  const lat = parseCoordinate(params.get("lat"), 90);
  const lng = parseCoordinate(params.get("lng"), 180);
  if ((lat === undefined) !== (lng === undefined)) {
    // Half a position is no position; keep an id if there is one.
    if (!target.shrineId && !target.raidId && !target.duelId) return null;
  } else if (lat !== undefined && lng !== undefined) {
    target.lat = lat;
    target.lng = lng;
  }
  const place = params.get("place");
  if (place && place.trim()) target.place = place.trim().slice(0, 80);
  const hasSomething =
    target.shrineId || target.raidId || target.duelId || target.lat !== undefined;
  return hasSomething ? target : null;
}

/**
 * A play link, or null if this URL is not one. `target` is null for a bare
 * cosquest://play (open the game where the player is).
 */
export function parsePlayUrl(url: string | null | undefined): PlayLink | null {
  if (!url || typeof url !== "string") return null;
  const path = pathOf(url);
  if (path !== "play" && !path.endsWith("/play")) return null;
  const params = queryOf(url);
  const named = ["shrine", "shrineId", "raid", "raidId", "duel", "duelId", "lat", "lng"].some((k) =>
    params.has(k),
  );
  const target = targetFromParams(params);
  if (named && !target) return null; // it tried to name a spot and failed
  return { kind: "play", target };
}

/** The game's Stripe return (cosquest://coins?order=...): the game handles it. */
export function isGameCoinsUrl(url: string | null | undefined): boolean {
  return !!url && pathOf(url) === "coins";
}

export function buildPlayUrl(target: GameTarget | null, scheme = "cosquest"): string {
  if (!target) return `${scheme}://play`;
  const params = new URLSearchParams();
  if (target.raidId) params.set("raid", target.raidId);
  else if (target.duelId) params.set("duel", target.duelId);
  else if (target.shrineId) params.set("shrine", target.shrineId);
  if (target.lat !== undefined && target.lng !== undefined) {
    params.set("lat", String(target.lat));
    params.set("lng", String(target.lng));
  }
  if (target.place) params.set("place", target.place);
  const query = params.toString();
  return query ? `${scheme}://play?${query}` : `${scheme}://play`;
}

/**
 * Expo Router hands a route its query as params; this rebuilds the link
 * (app/play.tsx, app/coins.tsx). Repeated keys stay repeated, so an
 * ambiguous link is still refused by parsePlayUrl.
 */
export function urlFromParams(
  path: "play" | "coins",
  params: Record<string, string | string[] | undefined>,
  scheme = "cosquest",
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) query.append(key, item);
    }
  }
  const text = query.toString();
  return text ? `${scheme}://${path}?${text}` : `${scheme}://${path}`;
}
