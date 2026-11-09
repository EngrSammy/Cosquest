// Where the web build checks that the internet is reachable (pure, tested in
// services/__tests__/reachability.test.ts).
//
// NetInfo on the web asks "/" of the page's own origin and wants a 200. The
// trivia web page lives at <game server>/play, where "/" is the game API's
// root and answers 404, so NetInfo decided there was no internet and the page
// showed "You're offline" over a game that was working (5 Nov 2026). The
// build's own favicon, under its own base path, is always there.
export function webReachabilityUrl(base: string | undefined | null): string {
  const b = (base ?? "").trim().replace(/\/+$/, "");
  return `${b.startsWith("/") || b === "" ? b : `/${b}`}/favicon.ico`;
}
